# API details

## Coverage and versions

The [endpoint map](naming-map.md) lists 210 operations from Wise's official
2026Q3 specification, plus a generated statement-download method for formats
documented in the statement endpoint's description. SDK coverage does not imply
that every account can use every endpoint.

API URLs pin `2026Q3`. Moving to another quarter requires reviewing Wise's changes
and regenerating both SDKs. Card-sensitive-data and digital-wallet operations use
their separate `twcard` hosts. Custom environments must provide both `api` and
`cards` HTTPS URLs.

## IDs and money

Wise uses 64-bit integer IDs. TypeScript returns safe integers as `number` and
larger integers as `bigint`. Pass a `bigint` when an ID exceeds
`Number.MAX_SAFE_INTEGER`; a rounded JavaScript number cannot recover its original
value. Python integers retain their precision.

`stringifyWiseJson()` and `parseWiseJson()` support these IDs when serializing SDK
data. Native `JSON.stringify()` throws on `bigint`. For data sent to your browser,
convert IDs to strings explicitly.

Wise amounts generally use **major currency units**: GBP `12.34` means £12.34.
API fields retain their documented number/string types. Use decimal arithmetic
in your application for calculations;
the SDK does not add money, convert units or round payment amounts for you.

## Pagination

Resource `list` methods return one response. Convenience iterators fetch lazily:

```typescript
import { WiseClient, iterRecipients } from "@mmzaini/wise-sdk";

const client = new WiseClient();
for await (const recipient of iterRecipients(client, { profileId, currency: "GBP" })) {
  // Process one recipient. Breaking the loop stops further requests.
}
```

```python
from wise_sdk import WiseClient, iter_recipients

with WiseClient() as client:
    for recipient in iter_recipients(client, profile_id=profile_id, currency="GBP"):
        pass
```

Use `iterActivities` / `iter_activities` for activity cursors and
`iterTransfers` / `iter_transfers` for transfer offsets. Python async equivalents
are `async_iter_recipients`, `async_iter_activities` and `async_iter_transfers`.

Recipient cursors may be zero or large integers. An empty page can still have a
next cursor. Transfer iteration advances by the number of records received and
requests until an empty page, so a server page-size cap does not silently truncate
results. Repeated cursors/pages and the default 1000-page limit raise
`PaginationError`. Adjust `maxPages` / `max_pages` explicitly when necessary.

Pass request options through the iterator's `requestOptions` / `request_options`.
Offset pagination is not a snapshot: concurrent transfers can change the result
order. Use fixed date filters where possible and reconcile by transfer ID.

## Errors, headers and retries

TypeScript raises `WiseError` and typed subclasses for documented HTTP errors.
Inspect `statusCode`, `body` and `rawResponse.headers`; Python's `ApiError` exposes
`status_code`, `body` and `headers`. Keep bank data and challenge credentials out of
logs. Wise's `x-trace-id` and `X-External-Correlation-Id` help with support requests.

TypeScript offers `.withRawResponse()` on generated request promises. Python's
`client.<resource>.with_raw_response` provides the response metadata.

Read calls may retry twice on transient failure. Writes, OAuth exchanges and
state-changing simulations never retry automatically. `401`, `403` and `409`
responses are returned to the caller. Redirects are not followed.

TypeScript's default 60-second deadline covers token and header suppliers, retries
and buffered response bodies. Download streams remain the caller's responsibility after response
headers arrive; pass an `AbortSignal` that covers the entire download when needed.
Python uses HTTPX's per-phase timeouts; a complete operation can take longer when
it retries. A supplied Python HTTP client's timeout is retained unless overridden.

`Retry-After` is respected. TypeScript stops at its deadline. Python returns the
error without retrying when the requested delay exceeds 60 seconds, letting your
application schedule a later attempt.

## Transfers and dynamic requirements

Follow Wise's quote → recipient → transfer → funding flow for your integration.
Creating a transfer and funding it are separate actions. Persist your own
`customerTransactionId` when using the documented transfer idempotency mechanism;
the SDK does not generate a new identifier or retry a payment on your behalf.

Recipient and transfer requirements vary by route, currency, account and compliance
state. Use the requirements endpoints, including their refresh methods, instead of
hardcoding one country's form. Request options expose additional body/query/header
fields for documented values that are not yet present in the upstream schema.

See [Wise's transfer guide](https://docs.wise.com/guides/product/send-money)
and [recipient reference](https://docs.wise.com/api-reference/recipient).

## Statements and files

`client.statements.get(...)` retrieves JSON. `client.statements.download(...)`
supports `csv`, `pdf`, `xlsx`, `xml` (CAMT.053), `mt940` and `qif`:

```typescript
import { writeFile } from "node:fs/promises";

const file = await client.statements.download({
  profileId, balanceId, format: "pdf", currency: "GBP",
  intervalStart: "2026-01-01T00:00:00Z",
  intervalEnd: "2026-02-01T00:00:00Z",
});
await writeFile("statement.pdf", Buffer.from(await file.arrayBuffer()));
```

```python
from datetime import datetime, timezone

with open("statement.pdf", "wb") as file:
    for chunk in client.statements.download(
        profile_id=profile_id, balance_id=balance_id, format="pdf", currency="GBP",
        interval_start=datetime(2026, 1, 1, tzinfo=timezone.utc),
        interval_end=datetime(2026, 2, 1, tzinfo=timezone.utc),
    ):
        file.write(chunk)
```

Statement periods cannot exceed 469 days. SCA and personal-token restrictions
still apply. The download supplement inherits query parameters and error responses
from the upstream JSON operation during generation. See the
[statement reference](https://docs.wise.com/api-reference/balance-statement).

Python uses timezone-aware `datetime` values for date-time parameters; TypeScript
uses ISO 8601 strings. Check the generated method signature for each parameter.

Other binary endpoints use their generated file/stream types. Consume or close
streams promptly. An error response remains an error even when its body is empty.
