"""Check an installed distribution outside the source checkout and editable environment."""

import asyncio
import importlib.metadata

import httpx

from wise_sdk import (
    AsyncWiseClient, WiseClient, __version__, create_oauth_state,
    iter_recipients, verify_webhook_signature, create_mtls_context,
)


def handler(request):
    assert request.headers["Authorization"] == "Bearer fixture"
    return httpx.Response(200, json=[])


assert __version__ == importlib.metadata.version("wise-sdk")
assert len(create_oauth_state()) == 43
with httpx.Client(transport=httpx.MockTransport(handler)) as http:
    with WiseClient(access_token="fixture", httpx_client=http) as client:
        assert client.profiles.list() == []


async def check_async():
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        async with AsyncWiseClient(access_token="fixture", httpx_client=http) as client:
            assert (await client.profiles.list()) == []


asyncio.run(check_async())
print("Installed Python distribution passed synchronous and asynchronous request checks.")
