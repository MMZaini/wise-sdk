# Wise TypeScript SDK

Typed Node.js client for the Wise Platform API. ESM and CommonJS, Node 22+.
Community maintained and not affiliated with Wise.

```sh
npm install @mmzaini/wise-sdk
```

## Quick start

Set `WISE_ACCESS_TOKEN` to a sandbox API token in your server environment.

```typescript
import { WiseClient, WiseEnvironment } from "@mmzaini/wise-sdk";

const client = new WiseClient({ environment: WiseEnvironment.Sandbox });
const profiles = await client.profiles.list();
const profile = profiles[0];
if (profile?.id == null) throw new Error("No profile available");

const balances = await client.balances.list({ profileId: profile.id, types: "STANDARD" });
console.log(balances.map(({ currency, amount }) => ({ currency, amount })));
```

Choose your intended profile when several exist. Use `WiseEnvironment.Production`
with a separate production token for live requests. This package runs on your
server; use [wise-react](https://github.com/MMZaini/wise-sdk/tree/main/packages/react)
to display the resulting data in a browser.

## Client options

| Option | Behavior |
| --- | --- |
| `accessToken` | Token string or sync/async supplier. Defaults to `WISE_ACCESS_TOKEN`; `false` disables fallback. |
| `environment` | `Sandbox` by default; also `Production`, `SandboxMtls`, `ProductionMtls` or custom `{ api, cards }` HTTPS URLs. |
| `timeoutInSeconds` | Total request deadline, 60 seconds by default. Download bodies need their own cancellation. |
| `maxRetries` | Up to two retries for eligible reads by default. Writes and token exchanges never retry. |
| `fetch` | Custom fetch implementation; use `createMtlsFetch()` for partner certificates. |
| `externalCorrelationId` | Sets `X-External-Correlation-Id` for request tracing. |
| `clientId`, `clientSecret` | HTTP Basic credentials for the generated OAuth token endpoint only. |

Methods accept request options including `abortSignal`, `headers`, `queryParams`
and `timeoutInSeconds`. Use `.withRawResponse()` to retain HTTP metadata.
HTTP failures raise `WiseError` or a documented subclass; inspect `statusCode`,
`body` and `rawResponse.headers` without logging credentials or bank data.

## Helpers and types

`Wise` contains generated models and error classes. Resource methods use objects
such as `client.balances.list({ profileId, types: "STANDARD" })`.

- `WiseOAuth`, `TokenManager`, `createOAuthState()` and `validateOAuthState()` handle explicit OAuth grants and rotation.
- `createMtlsFetch()` configures verified client-certificate transport.
- `iterRecipients()`, `iterActivities()` and `iterTransfers()` fetch pages lazily.
- `verifyWebhookSignature()` verifies raw webhook bytes against a trusted public key.
- `getScaChallenge()` detects documented SCA approval headers.
- `parseWiseJson()` / `stringifyWiseJson()` preserve large integer IDs using `bigint`.

Amounts use major currency units. IDs exceeding `Number.MAX_SAFE_INTEGER` must be
passed as `bigint`; native `JSON.stringify()` cannot serialize them. See the
[API details](https://github.com/MMZaini/wise-sdk/blob/main/docs/api-gotchas.md).

## Documentation

[Authentication](https://github.com/MMZaini/wise-sdk/blob/main/docs/authentication.md) ·
[Endpoint map](https://github.com/MMZaini/wise-sdk/blob/main/docs/naming-map.md) ·
[Webhooks](https://github.com/MMZaini/wise-sdk/blob/main/docs/webhooks.md) ·
[Release notes](https://github.com/MMZaini/wise-sdk/releases)

Generated from the official 2026Q3 specification with Fern. Account permissions,
regional restrictions and partner onboarding determine which endpoints you can use.
