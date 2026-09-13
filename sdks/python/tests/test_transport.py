import asyncio

import httpx
import pytest

from wise_sdk import AsyncWiseClient, WiseClient


def test_custom_and_per_request_timeouts_reach_httpx():
    timeouts = []

    def respond(request):
        timeouts.append(request.extensions["timeout"])
        return httpx.Response(200, json=[])

    with httpx.Client(timeout=13, transport=httpx.MockTransport(respond)) as http:
        with WiseClient(access_token="fixture", httpx_client=http) as client:
            client.profiles.list()
            client.profiles.list(request_options={"timeout": 3})
        with WiseClient(access_token="fixture", httpx_client=http, timeout=7) as client:
            client.profiles.list()
    assert timeouts == [{phase: value for phase in ("connect", "read", "write", "pool")} for value in (13, 3, 7)]


async def test_task_cancellation_is_propagated_without_retry():
    started = asyncio.Event()
    cancelled = asyncio.Event()
    calls = 0

    async def respond(request):
        nonlocal calls
        calls += 1
        started.set()
        try:
            await asyncio.Future()
        finally:
            cancelled.set()

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with AsyncWiseClient(access_token="fixture", httpx_client=http) as client:
            task = asyncio.create_task(client.profiles.list())
            await asyncio.wait_for(started.wait(), timeout=2)
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            assert cancelled.is_set()
    assert calls == 1
