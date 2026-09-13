# Wise Python SDK

Typed synchronous and asynchronous clients for the Wise Platform API. Python 3.11+,
HTTPX and Pydantic. Community maintained and not affiliated with Wise.

```sh
pip install wise-sdk
```

## Quick start

Set `WISE_ACCESS_TOKEN` to a sandbox API token in your server environment.

```python
from wise_sdk import WiseClient, WiseEnvironment

with WiseClient(environment=WiseEnvironment.SANDBOX) as client:
    profiles = client.profiles.list()
    if not profiles or profiles[0].id is None:
        raise ValueError("No profile available")
    balances = client.balances.list(profile_id=profiles[0].id, types="STANDARD")
    print([(balance.currency, balance.amount) for balance in balances])
```

Choose your intended profile when several exist. Select `WiseEnvironment.PRODUCTION`
with separate production credentials for live requests.

## Async client

```python
import asyncio
from wise_sdk import AsyncWiseClient

async def main():
    async with AsyncWiseClient() as client:
        profiles = await client.profiles.list()
        print(f"Found {len(profiles)} profiles")

asyncio.run(main())
```

Use context managers or `close()` / `await aclose()` to release owned connections.
A supplied `httpx_client` remains owned by your application.

## Client options

| Option | Behavior |
| --- | --- |
| `access_token` | Token or callable; async callables work with `AsyncWiseClient`. Defaults to `WISE_ACCESS_TOKEN`; `False` disables fallback. |
| `environment` | `SANDBOX` by default; also `PRODUCTION`, `SANDBOX_MTLS`, `PRODUCTION_MTLS` or an environment with `api` and `cards` HTTPS URLs. |
| `timeout` | HTTPX per-phase timeout; 60 seconds by default. A supplied client's timeout is retained unless overridden. |
| `max_retries` | Up to two retries for eligible reads by default. Writes and OAuth exchanges never retry. |
| `httpx_client` | Custom `httpx.Client` / `httpx.AsyncClient`, including mTLS configuration. |
| `external_correlation_id` | Sets `X-External-Correlation-Id` for request tracing. |
| `client_id`, `client_secret` | HTTP Basic credentials for the generated OAuth token endpoint only. |

Use `request_options` for per-call headers, query parameters and timeout settings.
`client.<resource>.with_raw_response` provides HTTP metadata. HTTP failures raise
`ApiError`; inspect `status_code`, `body` and `headers` without logging sensitive data.

## Helpers and models

Generated Pydantic models are exported from `wise_sdk`. Python integer IDs retain
their precision. Date-time request parameters use timezone-aware `datetime` values.
Wise amounts use major currency units; use decimal arithmetic for calculations.

- `WiseOAuth` / `AsyncWiseOAuth` expose four OAuth grants and authorization URL helpers.
- `TokenManager` / `AsyncTokenManager` coordinate token acquisition and persistence within one instance.
- `create_mtls_context()` loads a client certificate into a verified SSL context.
- `iter_recipients()`, `iter_activities()` and `iter_transfers()` fetch lazily; async variants start with `async_iter_`.
- `verify_webhook_signature()` verifies raw webhook bytes; install `pip install 'wise-sdk[webhooks]'` to use it.
- `get_sca_challenge()` detects documented SCA approval headers.

## Documentation

[Authentication](https://github.com/MMZaini/wise-sdk/blob/main/docs/authentication.md) ·
[Endpoint map](https://github.com/MMZaini/wise-sdk/blob/main/docs/naming-map.md) ·
[API details](https://github.com/MMZaini/wise-sdk/blob/main/docs/api-gotchas.md) ·
[Webhooks](https://github.com/MMZaini/wise-sdk/blob/main/docs/webhooks.md) ·
[Release notes](https://github.com/MMZaini/wise-sdk/releases)

Generated from the official 2026Q3 specification with Fern. Account permissions,
regional restrictions and partner onboarding determine which endpoints you can use.
