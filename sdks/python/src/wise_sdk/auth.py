"""Explicit OAuth grants and coordinated token refresh."""
from __future__ import annotations

import asyncio
import hmac
import math
import secrets
import threading
import time
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Awaitable, Callable
from urllib.parse import urlencode, urlsplit

from .client import AsyncWiseClient, WiseClient, WiseEnvironment
from .generated.core.api_error import ApiError
from .generated.oauth import (
    CreateTokenOauthRequestBody_AuthorizationCode as AuthorizationCode,
    CreateTokenOauthRequestBody_ClientCredentials as ClientCredentials,
    CreateTokenOauthRequestBody_RefreshToken as RefreshToken,
    CreateTokenOauthRequestBody_RegistrationCode as RegistrationCode,
)


class OAuthError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class OAuthTokens:
    access_token: str = field(repr=False)
    expires_at: float  # Unix timestamp in seconds.
    token_type: str = "bearer"
    refresh_token: str | None = field(default=None, repr=False)
    refresh_token_expires_at: float | None = None
    scope: str | None = None


def create_oauth_state() -> str:
    return secrets.token_urlsafe(32)


def validate_oauth_state(received: str | None, expected: str) -> None:
    """Compare with the state for this browser session; consume the stored state once."""
    if not received or not expected or not hmac.compare_digest(received.encode(), expected.encode()):
        raise OAuthError("Invalid OAuth state")


def _timestamp(value: str) -> float:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            raise ValueError("Missing timezone")
        return parsed.timestamp()
    except (ValueError, OverflowError):
        raise OAuthError("OAuth returned an invalid expiry") from None


def _token_expiry(relative, absolute, requested_at):
    expiry = None
    if relative is not None:
        if not math.isfinite(relative) or relative < 0:
            raise OAuthError("OAuth returned an invalid expiry")
        expiry = requested_at + relative
        if not math.isfinite(expiry):
            raise OAuthError("OAuth returned an invalid expiry")
    if absolute is not None:
        explicit = _timestamp(absolute)
        expiry = explicit if expiry is None else min(expiry, explicit)
    return expiry


def _normalize(response, requested_at):
    if not isinstance(response.access_token, str) or not response.access_token or any(c.isspace() or c in ";," for c in response.access_token):
        raise OAuthError("OAuth returned an invalid access token")
    if response.expires_in is None or not math.isfinite(response.expires_in) or response.expires_in <= 0 or (response.token_type or "").lower() != "bearer":
        raise OAuthError("OAuth returned invalid token metadata")
    expires_at = _token_expiry(response.expires_in, response.expires_at, requested_at)
    if not math.isfinite(expires_at) or expires_at <= time.time():
        raise OAuthError("OAuth returned an expired token")
    refresh_expiry = _token_expiry(response.refresh_token_expires_in, response.refresh_token_expires_at, requested_at)
    return OAuthTokens(response.access_token, expires_at, refresh_token=response.refresh_token,
                       refresh_token_expires_at=refresh_expiry, scope=response.scope)


def _authorization_url(client_id, environment, redirect_uri, state, authorization_environment):
    if not state:
        raise OAuthError("Provide a session-bound OAuth state")
    redirect = urlsplit(redirect_uri)
    if redirect.scheme not in ("https", "http") or not redirect.hostname or redirect.username or redirect.password or redirect.fragment:
        raise OAuthError("Invalid redirect URI")
    host = urlsplit(environment.api).hostname
    if authorization_environment is None:
        if host in ("api.wise-sandbox.com", "api-mtls.wise-sandbox.com"):
            authorization_environment = "sandbox"
        elif host in ("api.wise.com", "api-mtls.transferwise.com"):
            authorization_environment = "production"
        else:
            raise OAuthError("Set authorization_environment when using a proxy")
    if authorization_environment not in ("sandbox", "production"):
        raise OAuthError("Invalid authorization_environment")
    base = "https://wise-sandbox.com" if authorization_environment == "sandbox" else "https://wise.com"
    return base + "/oauth/authorize/?" + urlencode({"client_id": client_id, "redirect_uri": redirect_uri, "state": state, "response_type": "code"})


class WiseOAuth:
    """Synchronous OAuth helper. Exchanges are never retried automatically."""
    def __init__(self, *, client_id: str, client_secret: str, environment: WiseEnvironment = WiseEnvironment.SANDBOX,
                 authorization_environment: str | None = None, **client_options):
        if not client_id or not client_secret:
            raise OAuthError("Provide client_id and client_secret")
        self._client_id, self._environment, self._authorization_environment = client_id, environment, authorization_environment
        self._client = WiseClient(client_id=client_id, client_secret=client_secret, environment=environment, access_token=False, **client_options)

    def authorization_url(self, *, redirect_uri: str, state: str) -> str:
        return _authorization_url(self._client_id, self._environment, redirect_uri, state, self._authorization_environment)

    def _exchange(self, request) -> OAuthTokens:
        requested_at = time.time()
        try:
            return _normalize(self._client.oauth.create_token(request=request), requested_at)
        except OAuthError:
            raise
        except Exception as error:
            raise OAuthError("OAuth token request failed", error.status_code if isinstance(error, ApiError) else None) from None

    def create_client_token(self) -> OAuthTokens:
        return self._exchange(ClientCredentials())

    def exchange_code(self, *, code: str, redirect_uri: str) -> OAuthTokens:
        if not code or not redirect_uri:
            raise OAuthError("Provide code and redirect_uri")
        return self._exchange(AuthorizationCode(client_id=self._client_id, code=code, redirect_uri=redirect_uri))

    def exchange_registration_code(self, *, email: str, registration_code: str) -> OAuthTokens:
        if not email or not registration_code:
            raise OAuthError("Provide email and registration_code")
        return self._exchange(RegistrationCode(client_id=self._client_id, email=email, registration_code=registration_code))

    def refresh(self, refresh_token: str) -> OAuthTokens:
        if not refresh_token:
            raise OAuthError("Provide refresh_token")
        tokens = self._exchange(RefreshToken(refresh_token=refresh_token))
        return replace(tokens, refresh_token=tokens.refresh_token or refresh_token)

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> WiseOAuth:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


class AsyncWiseOAuth:
    """Asynchronous OAuth helper. Use async with, or await aclose()."""
    def __init__(self, *, client_id: str, client_secret: str, environment: WiseEnvironment = WiseEnvironment.SANDBOX,
                 authorization_environment: str | None = None, **client_options):
        if not client_id or not client_secret:
            raise OAuthError("Provide client_id and client_secret")
        self._client_id, self._environment, self._authorization_environment = client_id, environment, authorization_environment
        self._client = AsyncWiseClient(client_id=client_id, client_secret=client_secret, environment=environment, access_token=False, **client_options)

    def authorization_url(self, *, redirect_uri: str, state: str) -> str:
        return _authorization_url(self._client_id, self._environment, redirect_uri, state, self._authorization_environment)

    async def _exchange(self, request) -> OAuthTokens:
        requested_at = time.time()
        try:
            return _normalize(await self._client.oauth.create_token(request=request), requested_at)
        except OAuthError:
            raise
        except Exception as error:
            raise OAuthError("OAuth token request failed", error.status_code if isinstance(error, ApiError) else None) from None

    async def create_client_token(self) -> OAuthTokens:
        return await self._exchange(ClientCredentials())

    async def exchange_code(self, *, code: str, redirect_uri: str) -> OAuthTokens:
        if not code or not redirect_uri:
            raise OAuthError("Provide code and redirect_uri")
        return await self._exchange(AuthorizationCode(client_id=self._client_id, code=code, redirect_uri=redirect_uri))

    async def exchange_registration_code(self, *, email: str, registration_code: str) -> OAuthTokens:
        if not email or not registration_code:
            raise OAuthError("Provide email and registration_code")
        return await self._exchange(RegistrationCode(client_id=self._client_id, email=email, registration_code=registration_code))

    async def refresh(self, refresh_token: str) -> OAuthTokens:
        if not refresh_token:
            raise OAuthError("Provide refresh_token")
        tokens = await self._exchange(RefreshToken(refresh_token=refresh_token))
        return replace(tokens, refresh_token=tokens.refresh_token or refresh_token)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> AsyncWiseOAuth:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.aclose()


def _validate_tokens(tokens):
    if (not isinstance(tokens, OAuthTokens) or not isinstance(tokens.access_token, str) or not tokens.access_token
            or any(c.isspace() or c in ";," for c in tokens.access_token)
            or not isinstance(tokens.expires_at, (int, float)) or not math.isfinite(tokens.expires_at)
            or tokens.expires_at <= time.time()):
        raise OAuthError("Token acquisition returned invalid or expired tokens")


class TokenManager:
    """Shares one refresh per instance. Multiple processes need an application lock."""
    def __init__(self, *, acquire: Callable[[OAuthTokens | None], OAuthTokens], initial_tokens: OAuthTokens | None = None,
                 on_tokens: Callable[[OAuthTokens], None] | None = None, refresh_before_seconds: float = 60):
        if not math.isfinite(refresh_before_seconds) or refresh_before_seconds < 0:
            raise ValueError("Invalid refresh_before_seconds")
        self._acquire, self._tokens, self._on_tokens = acquire, initial_tokens, on_tokens
        self._refresh_before, self._needs_persistence, self._lock = refresh_before_seconds, False, threading.Lock()

    def _persist(self):
        if self._needs_persistence:
            if self._on_tokens:
                self._on_tokens(self._tokens)
            self._needs_persistence = False

    def get_access_token(self) -> str:
        with self._lock:
            self._persist()
            if self._tokens is None or self._tokens.expires_at - self._refresh_before <= time.time():
                tokens = self._acquire(self._tokens)
                _validate_tokens(tokens)
                self._tokens, self._needs_persistence = tokens, True
                self._persist()
            _validate_tokens(self._tokens)
            return self._tokens.access_token


class AsyncTokenManager:
    """Shares refresh across tasks; cancellation of a caller does not cancel rotation."""
    def __init__(self, *, acquire: Callable[[OAuthTokens | None], Awaitable[OAuthTokens]], initial_tokens: OAuthTokens | None = None,
                 on_tokens: Callable[[OAuthTokens], Awaitable[None]] | None = None, refresh_before_seconds: float = 60):
        if not math.isfinite(refresh_before_seconds) or refresh_before_seconds < 0:
            raise ValueError("Invalid refresh_before_seconds")
        self._acquire, self._tokens, self._on_tokens = acquire, initial_tokens, on_tokens
        self._refresh_before, self._needs_persistence = refresh_before_seconds, False
        self._pending: asyncio.Task[str] | None = None

    async def _persist(self):
        if self._needs_persistence:
            if self._on_tokens:
                await self._on_tokens(self._tokens)
            self._needs_persistence = False

    async def _resolve(self):
        await self._persist()
        if self._tokens is None or self._tokens.expires_at - self._refresh_before <= time.time():
            tokens = await self._acquire(self._tokens)
            _validate_tokens(tokens)
            self._tokens, self._needs_persistence = tokens, True
            await self._persist()
        _validate_tokens(self._tokens)
        return self._tokens.access_token

    async def get_access_token(self) -> str:
        if self._pending is None or self._pending.done():
            self._pending = asyncio.create_task(self._resolve())
            # Observe failures even when all waiting callers are cancelled.
            self._pending.add_done_callback(lambda task: None if task.cancelled() else task.exception())
        return await asyncio.shield(self._pending)
