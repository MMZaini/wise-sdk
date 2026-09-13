"""Generated resources with explicit authentication and HTTP client ownership."""
from __future__ import annotations

import inspect
import math
import os
import re
from contextlib import asynccontextmanager, contextmanager
from typing import Awaitable, Callable, Literal, cast
from urllib.parse import urlsplit

import httpx

from .generated.client import AsyncWiseClient as GeneratedAsyncClient, WiseClient as GeneratedClient
from .generated.core.logging import LogConfig, Logger
from .generated.environment import WiseClientEnvironment as WiseEnvironment

AccessToken = str | Callable[[], str] | Literal[False] | None
AsyncAccessToken = str | Callable[[], str | Awaitable[str]] | Literal[False] | None


def _configuration(environment, timeout, max_retries):
    if not isinstance(environment, WiseEnvironment):
        raise ValueError("Invalid Wise environment")
    urls = {}
    for service in ("api", "cards"):
        url = getattr(environment, service)
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Environment URLs must use HTTPS without credentials, query or fragment")
        urls[service] = url.rstrip("/")
    if timeout is not None and (not math.isfinite(timeout) or timeout <= 0):
        raise ValueError("timeout must be positive")
    if not isinstance(max_retries, int) or isinstance(max_retries, bool) or max_retries < 0:
        raise ValueError("max_retries must be a non-negative integer")
    return WiseEnvironment(**urls)


def _token_value(access_token):
    if access_token is False:
        return None
    return access_token() if callable(access_token) else access_token if access_token is not None else os.getenv("WISE_ACCESS_TOKEN")


class _RequestGuard:
    def __init__(self, environment, access_token, client_id, client_secret):
        self.origins = {(url.scheme, url.host, url.port) for url in (httpx.URL(environment.api), httpx.URL(environment.cards))}
        self.access_token, self.client_id, self.client_secret = access_token, client_id, client_secret

    def token(self, url):
        return None if httpx.URL(url).path.endswith("/oauth/token") else _token_value(self.access_token)

    def prepare(self, http, method, url, kwargs, token):
        if kwargs.get("timeout") is None:
            kwargs.pop("timeout", None)
        kwargs["headers"] = {key.lower(): value for key, value in (kwargs.get("headers") or {}).items()}
        kwargs["headers"].pop("authorization", None)
        request = http.build_request(method, url, **kwargs)
        if (request.url.scheme, request.url.host, request.url.port) not in self.origins or request.url.username or request.url.password:
            raise ValueError("Unexpected request origin")
        request.headers.pop("authorization", None)
        if request.url.path.endswith("/oauth/token"):
            if not self.client_id or not self.client_secret or re.search(r"[:\r\n]", self.client_id) or re.search(r"[\r\n]", self.client_secret):
                raise ValueError("Provide client_id and client_secret for OAuth token requests")
            import base64
            credentials = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
            request.headers["authorization"] = f"Basic {credentials}"
        elif token is not None:
            if not isinstance(token, str) or not re.fullmatch(r"[^\s;,]+", token):
                raise ValueError("Provide one non-empty access token")
            request.headers["authorization"] = f"Bearer {token}"
        return request


class _SyncHttp:
    def __init__(self, http, guard):
        self.http, self.guard = http, guard

    def request(self, *, method, url, **kwargs):
        request = self.guard.prepare(self.http, method, url, kwargs, self.guard.token(url))
        return self.http.send(request, auth=None, follow_redirects=False)

    @contextmanager
    def stream(self, *, method, url, **kwargs):
        request = self.guard.prepare(self.http, method, url, kwargs, self.guard.token(url))
        response = self.http.send(request, stream=True, auth=None, follow_redirects=False)
        try:
            yield response
        finally:
            response.close()


class _AsyncHttp:
    def __init__(self, http, guard):
        self.http, self.guard = http, guard

    async def _prepare(self, method, url, kwargs):
        token = self.guard.token(url)
        if inspect.isawaitable(token):
            token = await token
        return self.guard.prepare(self.http, method, url, kwargs, token)

    async def request(self, *, method, url, **kwargs):
        return await self.http.send(await self._prepare(method, url, kwargs), auth=None, follow_redirects=False)

    @asynccontextmanager
    async def stream(self, *, method, url, **kwargs):
        response = await self.http.send(await self._prepare(method, url, kwargs), stream=True, auth=None, follow_redirects=False)
        try:
            yield response
        finally:
            await response.aclose()


class WiseClient(GeneratedClient):
    """Synchronous API client. Close it, or use a with block, when finished."""
    def __init__(self, *, access_token: AccessToken = None,
                 environment: WiseEnvironment = WiseEnvironment.SANDBOX,
                 client_id: str | None = None, client_secret: str | None = None,
                 headers: dict[str, str] | None = None, external_correlation_id: str | None = None,
                 timeout: float | None = None, max_retries: int = 2,
                 httpx_client: httpx.Client | None = None, logging: LogConfig | Logger | None = None):
        environment = _configuration(environment, timeout, max_retries)
        self._owns_client = httpx_client is None
        default_timeout = timeout if timeout is not None else 60 if self._owns_client else None
        self._http = httpx_client if httpx_client is not None else httpx.Client(timeout=default_timeout, follow_redirects=False)
        http = _SyncHttp(self._http, _RequestGuard(environment, access_token, client_id, client_secret))
        super().__init__(environment=environment, access_token=None,
                         headers={"User-Agent": "wise-sdk/0.1.0", **(headers or {})},
                         external_correlation_id=external_correlation_id, timeout=default_timeout,
                         max_retries=max_retries, follow_redirects=False, httpx_client=cast(httpx.Client, http), logging=logging)

    def close(self) -> None:
        if self._owns_client:
            self._http.close()

    def __enter__(self) -> WiseClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()


class AsyncWiseClient(GeneratedAsyncClient):
    """Asynchronous API client. Use async with, or await aclose(), when finished."""
    def __init__(self, *, access_token: AsyncAccessToken = None,
                 environment: WiseEnvironment = WiseEnvironment.SANDBOX,
                 client_id: str | None = None, client_secret: str | None = None,
                 headers: dict[str, str] | None = None, external_correlation_id: str | None = None,
                 timeout: float | None = None, max_retries: int = 2,
                 httpx_client: httpx.AsyncClient | None = None, logging: LogConfig | Logger | None = None):
        environment = _configuration(environment, timeout, max_retries)
        self._owns_client = httpx_client is None
        default_timeout = timeout if timeout is not None else 60 if self._owns_client else None
        self._http = httpx_client if httpx_client is not None else httpx.AsyncClient(timeout=default_timeout, follow_redirects=False)
        http = _AsyncHttp(self._http, _RequestGuard(environment, access_token, client_id, client_secret))
        super().__init__(environment=environment, access_token=None,
                         headers={"User-Agent": "wise-sdk/0.1.0", **(headers or {})},
                         external_correlation_id=external_correlation_id, timeout=default_timeout,
                         max_retries=max_retries, follow_redirects=False, httpx_client=cast(httpx.AsyncClient, http), logging=logging)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._http.aclose()

    async def __aenter__(self) -> AsyncWiseClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.aclose()
