# Webhooks and SCA

## Verify deliveries

Wise signs webhook request bodies with RSA and SHA-256. Verify the
`X-Signature-SHA256` header against the **original body bytes**, before parsing JSON.
Whitespace and property order affect the signature.

```typescript
import { readFileSync } from "node:fs";
import { verifyWebhookSignature, parseWiseJson } from "@mmzaini/wise-sdk";

const publicKey = readFileSync(process.env.WISE_WEBHOOK_PUBLIC_KEY_PATH!);
// rawBody is a Buffer from your HTTP framework, before JSON middleware runs.
if (!verifyWebhookSignature({ body: rawBody, signature, publicKey })) {
  throw new Error("Invalid webhook signature");
}
const event = parseWiseJson(rawBody.toString("utf8"));
```

```sh
pip install 'wise-sdk[webhooks]'
```

```python
import json
from pathlib import Path
from wise_sdk import verify_webhook_signature

public_key = Path(public_key_path).read_bytes()
if not verify_webhook_signature(body=raw_body, signature=signature, public_key=public_key):
    raise ValueError("Invalid webhook signature")
event = json.loads(raw_body)
```

Use the public key for the delivery's environment and webhook product from Wise's
[event-handling documentation](https://docs.wise.com/guides/developer/webhooks/event-handling).
Keep it in trusted configuration; never accept a verification key from the incoming
request. The verifier does not download keys automatically. During a documented
rotation, you can check against the trusted current and replacement keys.

Verification establishes authenticity, not freshness or uniqueness. Deduplicate
using `X-Delivery-Id`, process idempotently, and use the event's ordering fields
instead of arrival order. Persist or queue accepted events before acknowledging
them. Wise sends retries and test notifications; see its
[delivery guide](https://docs.wise.com/guides/developer/webhooks/event-handling).

## Handle SCA explicitly

`getScaChallenge(error)` returns `{ oneTimeToken }` only for a `403` containing
`x-2fa-approval-result: REJECTED` and a non-empty `x-2fa-approval` header.
Python's `get_sca_challenge(error)` returns that token string or `None`.

Complete the approved authentication flow using Wise's SCA endpoints or embedded
component. Once cleared, pass the approval token in request options:

```typescript
await client.statements.get(request, {
  headers: { "x-2fa-approval": clearedToken },
});
```

```python
client.statements.get(
    **request,
    request_options={"additional_headers": {"x-2fa-approval": cleared_token}},
)
```

The SDK does not automatically complete challenges or repeat the original request.
An ordinary permission failure is not treated as SCA. Follow
[Wise's SCA flow](https://docs.wise.com/guides/developer/auth-and-security/sca-over-api)
and your integration's account permissions.
