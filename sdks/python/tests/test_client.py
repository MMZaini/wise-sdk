import httpx
import pytest
from wise_sdk import WiseClient, AsyncWiseClient, ApiError
from wise_sdk.generated.oauth import CreateTokenOauthRequestBody_ClientCredentials


def test_personal_tokens_and_connection_ownership():
    token = "first"
    seen = []
    def respond(request):
        assert str(request.url) == "https://api.wise-sandbox.com/2026Q3/profiles"
        seen.append(request.headers["authorization"])
        return httpx.Response(200, json=[])
    with httpx.Client(transport=httpx.MockTransport(respond), follow_redirects=True) as http:
        with WiseClient(access_token=lambda: token, httpx_client=http) as client:
            assert client.profiles.list() == []
            token = "second"
            client.profiles.list()
        assert not http.is_closed
    assert seen == ["Bearer first", "Bearer second"]


def test_oauth_does_not_use_personal_token():
    def respond(request):
        assert request.url.path == "/2026Q3/oauth/token"
        assert request.headers["authorization"] == "Basic Y2xpZW50OnNlY3JldA=="
        assert request.headers["content-type"] == "application/x-www-form-urlencoded"
        assert request.content == b"grant_type=client_credentials"
        return httpx.Response(200, json={"access_token": "new", "expires_in": 3600})
    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        with WiseClient(access_token="personal", client_id="client", client_secret="secret", httpx_client=http) as client:
            assert client.oauth.create_token(request=CreateTokenOauthRequestBody_ClientCredentials()).access_token == "new"


@pytest.mark.parametrize("status", [302, 403])
def test_redirects_and_sca_are_not_replayed(status):
    seen = []
    def respond(request):
        seen.append(request)
        return httpx.Response(status, headers={"location": "https://other.test", "x-2fa-approval": "challenge"})
    with httpx.Client(transport=httpx.MockTransport(respond), follow_redirects=True) as http:
        with WiseClient(access_token="token", httpx_client=http) as client:
            with pytest.raises(ApiError) as error:
                client.profiles.list()
            assert error.value.status_code == status
            assert error.value.headers["x-2fa-approval"] == "challenge"
    assert len(seen) == 1


async def test_async_token_supplier_and_owned_connection():
    async def token():
        return "async-token"
    def respond(request):
        assert request.headers["authorization"] == "Bearer async-token"
        return httpx.Response(200, json=[])
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with AsyncWiseClient(access_token=token, httpx_client=http) as client:
            assert await client.profiles.list() == []
        assert not http.is_closed
    async with AsyncWiseClient(access_token="test") as client:
        owned_http = client._http
    assert owned_http.is_closed
