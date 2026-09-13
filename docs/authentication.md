# Authentication

Both SDKs default to the Wise sandbox. Keep access tokens, OAuth credentials and
private keys on your server. The React package receives display data only.

## Personal API tokens

Create an account at [wise-sandbox.com](https://wise-sandbox.com/), then open
**Your Account → Connect and manage apps → API tokens → Add new token**. Set
`WISE_ACCESS_TOKEN` in your server environment. Use a separate production token.

```typescript
import { WiseClient, WiseEnvironment } from "@mmzaini/wise-sdk";

const client = new WiseClient(); // Sandbox; reads WISE_ACCESS_TOKEN per request.
const profiles = await client.profiles.list();
```

```python
from wise_sdk import WiseClient, WiseEnvironment

with WiseClient() as client:
    profiles = client.profiles.list()
```

You can pass `accessToken` / `access_token` explicitly. A function can supply the
current token; TypeScript and `AsyncWiseClient` also accept async functions.
Set the option to `false` / `False` to disable the environment-variable fallback
when using an unauthenticated endpoint.

Select `WiseEnvironment.Production` / `WiseEnvironment.PRODUCTION` explicitly for
live requests. Switching environments does not change your credentials.

Wise documents personal tokens for supported business accounts. They grant fewer
capabilities than partner OAuth. In the EU/UK, personal tokens cannot fund
transfers or retrieve balance statements. The SDK cannot extend account access.
See [personal tokens](https://docs.wise.com/guides/developer/auth-and-security/personal-api-token)
and [account restrictions](https://docs.wise.com/guides/product/kyc/partner-accounts).

## Partner OAuth

Wise must approve your integration and provide a client ID, client secret and
registered redirect URI where applicable. Partners also need mTLS. Sandbox and
production credentials are separate. Follow Wise's
[OAuth setup](https://docs.wise.com/guides/developer/auth-and-security) and
[mTLS onboarding](https://docs.wise.com/guides/developer/auth-and-security/mtls).

`WiseOAuth` / `AsyncWiseOAuth` expose four grants:

| Grant | TypeScript | Python |
| --- | --- | --- |
| Client credentials | `createClientToken()` | `create_client_token()` |
| Authorization code | `exchangeCode({ code, redirectUri })` | `exchange_code(code=..., redirect_uri=...)` |
| Registration code | `exchangeRegistrationCode({ email, registrationCode })` | `exchange_registration_code(email=..., registration_code=...)` |
| Refresh token | `refresh(refreshToken)` | `refresh(refresh_token)` |

Token exchanges use HTTP Basic authentication and form encoding. They never use
the personal access token or retry automatically. The lower-level
`client.oauth.createToken()` / `client.oauth.create_token()` also works when the
client has `clientId` and `clientSecret` / `client_id` and `client_secret`.

For the authorization-code flow, create a random state with `createOAuthState()` /
`create_oauth_state()`. Store it in the initiating browser session, include it in
`oauth.authorizationUrl({ redirectUri, state })` /
`oauth.authorization_url(redirect_uri=..., state=...)`, then validate the callback
with `validateOAuthState(received, expected)` / `validate_oauth_state(...)`.
Consume the stored state once and use the exact registered redirect URI when
exchanging the code. Proxies must set `authorizationEnvironment` /
`authorization_environment` to `sandbox` or `production` explicitly.

## mTLS

The certificate must be issued through Wise onboarding. A self-signed certificate
is useful for local tests but does not authenticate you to Wise.

```typescript
import { readFileSync } from "node:fs";
import { WiseClient, WiseEnvironment, WiseOAuth, createMtlsFetch } from "@mmzaini/wise-sdk";

const transport = createMtlsFetch({
  cert: readFileSync(process.env.WISE_CLIENT_CERT_PATH!),
  key: readFileSync(process.env.WISE_CLIENT_KEY_PATH!),
});
try {
  const oauth = new WiseOAuth({
    clientId: process.env.WISE_CLIENT_ID!,
    clientSecret: process.env.WISE_CLIENT_SECRET!,
    environment: WiseEnvironment.SandboxMtls,
    fetch: transport.fetch,
  });
  const tokens = await oauth.createClientToken();
  const client = new WiseClient({
    accessToken: tokens.accessToken,
    environment: WiseEnvironment.SandboxMtls,
    fetch: transport.fetch,
  });
  // Use endpoints permitted by your partner agreement.
} finally {
  await transport.close();
}
```

```python
import os
import httpx
from wise_sdk import WiseOAuth, WiseEnvironment, create_mtls_context

context = create_mtls_context(
    cert_path=os.environ["WISE_CLIENT_CERT_PATH"],
    key_path=os.environ["WISE_CLIENT_KEY_PATH"],
)
with httpx.Client(verify=context) as http:
    with WiseOAuth(
        client_id=os.environ["WISE_CLIENT_ID"],
        client_secret=os.environ["WISE_CLIENT_SECRET"],
        environment=WiseEnvironment.SANDBOX_MTLS,
        httpx_client=http,
    ) as oauth:
        tokens = oauth.create_client_token()
```

Use `ProductionMtls` / `PRODUCTION_MTLS` for live partner requests. A custom CA
is optional (`ca` / `ca_path`); server certificate and hostname verification stay
enabled. TypeScript's helper sends the client certificate only to the configured
mTLS origins. Card endpoints retain their separate `twcard` host.

## Expiry and refresh

OAuth helpers return typed token sets. `expiresAt` is a Unix timestamp in
**milliseconds** in TypeScript; `expires_at` uses **seconds** in Python.
Use the returned expiry. Personal tokens do not use this refresh flow.

Wise user-token rotation immediately invalidates the previous access token.
Refresh tokens may also rotate. Store the newest token set before using it.
Embedded partners use client-credentials tokens and acquire a new one when needed;
other integration models may need user grants. See
[user access tokens](https://docs.wise.com/guides/developer/auth-and-security/user-access-token)
and [embedded authentication](https://docs.wise.com/guides/product/send-money/use-cases/embedded/authentication-and-access).

```typescript
import { TokenManager } from "@mmzaini/wise-sdk";

const manager = new TokenManager({
  initialTokens: storedTokens,
  acquire: (previous) => {
    if (!previous?.refreshToken) throw new Error("User authorization is required");
    return oauth.refresh(previous.refreshToken);
  },
  onTokens: saveTokens,
});
const client = new WiseClient({ accessToken: manager.getAccessToken, environment, fetch: transport.fetch });
```

`storedTokens`, `saveTokens`, `oauth`, `environment` and `transport` above belong
to your application. For client credentials, use
`acquire: () => oauth.createClientToken()` without an initial token set.

Python provides `TokenManager` and `AsyncTokenManager`, with `initial_tokens`,
`acquire(previous)`, `on_tokens` and `get_access_token`. The async manager requires
async acquire and persistence callbacks. Pass its bound `get_access_token` method
as `AsyncWiseClient(access_token=manager.get_access_token, ...)`.

Managers share one refresh per instance and retain rotated tokens if persistence
fails. The next call retries persistence. Multiple processes or manager instances
need a shared lock and token store in your application. A `401` is returned to the
caller; API operations are never automatically replayed after a token refresh.

## SCA and other partner security

SCA challenges retain their HTTP status and headers in `WiseError.rawResponse` /
`ApiError.headers`. Only a `403` with the documented approval headers indicates a
challenge; an ordinary `403` may mean insufficient permissions. Complete the
required challenges, then explicitly make the authorized request with the cleared
`x-2fa-approval` header. See [Wise's SCA flow](https://docs.wise.com/guides/developer/auth-and-security/sca-over-api).

JOSE payload encryption, signing, card provisioning and embedded SCA require the
keys and flows agreed with Wise. Generated methods accept the documented payloads
and headers; the SDK does not automatically perform those workflows or embed
Wise's separate SCA UI library.
