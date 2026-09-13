import json
import pathlib
from datetime import datetime, timezone
import httpx
import pytest
from wise_sdk import WiseClient, AsyncWiseClient, ApiError, PaginationError, iter_recipients, async_iter_activities, iter_transfers, verify_webhook_signature, get_sca_challenge


def test_shared_webhook_signature_uses_exact_bytes():
    fixture = json.loads((pathlib.Path(__file__).resolve().parents[3] / "tests/fixtures/webhook.json").read_text())
    args = {"body": fixture["body"].encode(), "signature": fixture["signature"], "public_key": fixture["publicKey"]}
    assert verify_webhook_signature(**args)
    assert not verify_webhook_signature(**{**args, "body": args["body"] + b"\n"})
    assert not verify_webhook_signature(**{**args, "signature": "not base64!"})


def test_sca_requires_explicit_approval_headers():
    assert get_sca_challenge(ApiError(status_code=403)) is None
    assert get_sca_challenge(ApiError(status_code=403, headers={"X-2FA-Approval": "one-time", "X-2FA-Approval-Result": "REJECTED"})) == "one-time"
    assert get_sca_challenge(ApiError(status_code=401, headers={"x-2fa-approval": "one-time", "x-2fa-approval-result": "REJECTED"})) is None


def test_seek_cursor_zero_large_integer_and_empty_pages():
    seen = []
    def respond(request):
        assert request.url.params["currency"] == "GBP"
        cursor = request.url.params.get("seekPosition")
        seen.append(cursor)
        if cursor is None:
            return httpx.Response(200, json={"content": [], "seekPositionForNext": 0})
        if cursor == "0":
            return httpx.Response(200, json={"content": [{"id": 1}], "seekPositionForNext": 9223372036854775807})
        return httpx.Response(200, json={"content": [{"id": 2}]})
    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        with WiseClient(access_token="test", httpx_client=http) as client:
            assert [recipient.id for recipient in iter_recipients(client, currency="GBP")] == [1, 2]
    assert seen == [None, "0", "9223372036854775807"]


async def test_async_cursor_loop_and_early_termination():
    seen = []
    def respond(request):
        seen.append(request)
        return httpx.Response(200, json={"activities": [{"id": "one"}], "cursor": "same"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as http:
        async with AsyncWiseClient(access_token="test", httpx_client=http) as client:
            iterator = async_iter_activities(client, profile_id=1)
            await anext(iterator)
            await iterator.aclose()
            assert len(seen) == 1
            with pytest.raises(PaginationError):
                async for _ in async_iter_activities(client, profile_id=1):
                    pass
    assert len(seen) == 3


def test_transfer_offset_uses_returned_page_length():
    offsets = []
    def respond(request):
        offset = request.url.params["offset"]
        offsets.append(offset)
        return httpx.Response(200, json=[{"id": 1, "quote": "quote-uuid"}] if offset == "0" else [])
    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        with WiseClient(access_token="test", httpx_client=http) as client:
            assert len(list(iter_transfers(client, limit=100))) == 1
    assert offsets == ["0", "1"]


def test_statement_download_preserves_bytes_and_query():
    payload = bytes([0, 255, 80, 68, 70, 13, 10])
    def respond(request):
        assert request.url.path == "/2026Q3/profiles/1/balance-statements/2/statement.pdf"
        assert request.url.params["currency"] == "GBP"
        assert request.url.params["intervalStart"] == "2026-01-01T00:00:00Z"
        return httpx.Response(200, content=payload, headers={"content-type": "application/pdf"})
    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        with WiseClient(access_token="test", httpx_client=http) as client:
            assert b"".join(client.statements.download(profile_id=1, balance_id=2, format="pdf", currency="GBP",
                interval_start=datetime(2026, 1, 1, tzinfo=timezone.utc), interval_end=datetime(2026, 2, 1, tzinfo=timezone.utc))) == payload


def test_read_retry_policy_does_not_shorten_long_retry_after(monkeypatch):
    from wise_sdk.generated.core import http_client
    monkeypatch.setattr(http_client.time, "sleep", lambda _: pytest.fail("Must not retry before Retry-After"))
    with httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(429, headers={"Retry-After": "3600"}))) as http:
        with WiseClient(access_token="test", httpx_client=http) as client:
            with pytest.raises(ApiError) as error:
                client.profiles.list()
            assert error.value.status_code == 429
