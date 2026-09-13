import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from wise_sdk import WiseOAuth, AsyncWiseOAuth, OAuthError, OAuthTokens, TokenManager, AsyncTokenManager, create_oauth_state, validate_oauth_state


def test_grants_state_and_refresh_fallback():
    bodies = []
    def respond(request):
        assert request.headers["authorization"].startswith("Basic ")
        bodies.append(parse_qs(request.content.decode()))
        return httpx.Response(200, json={"access_token": "new", "token_type": "bearer", "expires_in": 3600})
    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        with WiseOAuth(client_id="client", client_secret="secret", httpx_client=http) as oauth:
            state = create_oauth_state()
            url = oauth.authorization_url(redirect_uri="https://app.test/callback", state=state)
            assert urlsplit(url).hostname == "wise-sandbox.com"
            assert parse_qs(urlsplit(url).query)["state"] == [state]
            validate_oauth_state(state, state)
            with pytest.raises(OAuthError):
                validate_oauth_state("wrong", state)
            oauth.exchange_code(code="a+b & c", redirect_uri="https://app.test/callback")
            oauth.exchange_registration_code(email="a+b@example.test", registration_code="registration")
            tokens = oauth.refresh("old-refresh")
            oauth.create_client_token()
    assert bodies[0]["code"] == ["a+b & c"]
    assert bodies[1]["email"] == ["a+b@example.test"]
    assert tokens.refresh_token == "old-refresh"
    assert [body["grant_type"][0] for body in bodies] == ["authorization_code", "registration_code", "refresh_token", "client_credentials"]
    assert "old-refresh" not in repr(tokens)


def test_threads_share_refresh_and_persistence_failure_keeps_rotated_tokens():
    acquired, saved = [], []
    def acquire(previous):
        acquired.append(previous)
        return OAuthTokens("new", time.time() + 3600, refresh_token="rotated")
    def persist(tokens):
        saved.append(tokens)
        if len(saved) == 1:
            raise RuntimeError("Storage unavailable")
    manager = TokenManager(acquire=acquire, on_tokens=persist)
    with pytest.raises(RuntimeError):
        manager.get_access_token()
    with ThreadPoolExecutor(max_workers=10) as pool:
        assert list(pool.map(lambda _: manager.get_access_token(), range(20))) == ["new"] * 20
    assert len(acquired) == 1
    assert len(saved) == 2


async def test_async_oauth_error_is_redacted():
    calls = []
    def respond(request):
        calls.append(request)
        return httpx.Response(500, json={"refresh_token": "sensitive-value"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with AsyncWiseOAuth(client_id="client", client_secret="secret", httpx_client=http) as oauth:
            with pytest.raises(OAuthError) as error:
                await oauth.create_client_token()
            assert error.value.status_code == 500
            assert "sensitive-value" not in str(error.value)
    assert len(calls) == 1


async def test_cancelled_waiter_does_not_cancel_shared_rotation():
    started, finish = asyncio.Event(), asyncio.Event()
    acquired, saved = [], []
    async def acquire(previous):
        acquired.append(previous)
        started.set()
        await finish.wait()
        return OAuthTokens("new", time.time() + 3600, refresh_token="rotated")
    async def persist(tokens):
        saved.append(tokens)
    manager = AsyncTokenManager(acquire=acquire, on_tokens=persist)
    cancelled = asyncio.create_task(manager.get_access_token())
    await started.wait()
    cancelled.cancel()
    with pytest.raises(asyncio.CancelledError):
        await cancelled
    finish.set()
    assert await asyncio.gather(*(manager.get_access_token() for _ in range(20))) == ["new"] * 20
    assert len(acquired) == len(saved) == 1


def test_expiry_metadata_is_validated_and_earliest_refresh_expiry_is_used():
    metadata = {}
    def respond(request):
        return httpx.Response(200, json={"access_token": "access", "token_type": "bearer", "expires_in": 3600, **metadata})
    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        with WiseOAuth(client_id="client", client_secret="secret", httpx_client=http) as oauth:
            for invalid in [
                {"refresh_token_expires_in": -1}, {"refresh_token_expires_at": "not-a-date"},
                {"refresh_token_expires_at": ""}, {"refresh_token_expires_at": "2099-01-01T00:00:00"},
                {"expires_at": "2099-01-01T00:00:00"},
            ]:
                metadata = invalid
                with pytest.raises(OAuthError):
                    oauth.create_client_token()
            before = time.time()
            metadata = {"refresh_token_expires_in": 0, "refresh_token_expires_at": "2099-01-01T00:00:00Z"}
            assert before <= oauth.create_client_token().refresh_token_expires_at <= time.time()
            earlier = datetime.fromtimestamp(time.time() + 300, timezone.utc)
            metadata = {"refresh_token_expires_in": 3600, "refresh_token_expires_at": earlier.isoformat()}
            assert oauth.create_client_token().refresh_token_expires_at == earlier.timestamp()
            metadata = {}
            assert oauth.create_client_token().refresh_token_expires_at is None


@pytest.mark.parametrize("access_token", ["", "two tokens", "first,second", 123])
def test_invalid_acquired_tokens_are_not_persisted(access_token):
    saved = []
    manager = TokenManager(acquire=lambda previous: OAuthTokens(access_token, time.time() + 3600), on_tokens=saved.append)
    with pytest.raises(OAuthError):
        manager.get_access_token()
    assert not saved


async def test_invalid_async_acquired_tokens_are_not_persisted():
    saved = []
    async def acquire(previous):
        return OAuthTokens("two tokens", time.time() + 3600)
    async def persist(tokens):
        saved.append(tokens)
    manager = AsyncTokenManager(acquire=acquire, on_tokens=persist)
    with pytest.raises(OAuthError):
        await manager.get_access_token()
    assert not saved
