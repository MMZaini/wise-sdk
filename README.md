# Wise SDKs

Typed TypeScript and Python clients for the [Wise Platform API](https://docs.wise.com/),
generated from Wise's official OpenAPI specification with [Fern](https://github.com/fern-api/fern).

[![CI](https://github.com/MMZaini/wise-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/MMZaini/wise-sdk/actions/workflows/ci.yml)

| Package | Install | Docs |
| --- | --- | --- |
| [TypeScript / JavaScript](https://www.npmjs.com/package/@mmzaini/wise-sdk), Node 22+ | `npm install @mmzaini/wise-sdk` | [TypeScript SDK](sdks/typescript/README.md) |
| [Python](https://pypi.org/project/wise-sdk/), Python 3.11+ | `pip install wise-sdk` | [Python SDK](sdks/python/README.md) |
| [Optional React components](https://www.npmjs.com/package/@mmzaini/wise-react), React 18/19 | `npm install @mmzaini/wise-react` | [React package](packages/react/README.md) |

Community maintained and not affiliated with Wise. Both SDKs default to the sandbox.

[Release notes and downloads](https://github.com/MMZaini/wise-sdk/releases).

## Quick start

Create a [sandbox account](https://wise-sandbox.com/) and an API token under
**Your Account → Connect and manage apps → API tokens**. Set `WISE_ACCESS_TOKEN`
in your server environment. Token availability depends on your account; see
[authentication](docs/authentication.md) for setup, restrictions and partner OAuth.

```typescript
import { WiseClient } from "@mmzaini/wise-sdk";

const client = new WiseClient(); // Reads WISE_ACCESS_TOKEN; sandbox by default.
const profiles = await client.profiles.list();
const profile = profiles[0];
if (profile?.id == null) throw new Error("No profile available");

const balances = await client.balances.list({ profileId: profile.id, types: "STANDARD" });
console.log(balances.map(({ currency, amount }) => ({ currency, amount })));
```

```python
from wise_sdk import WiseClient

with WiseClient() as client:  # Reads WISE_ACCESS_TOKEN; sandbox by default.
    profiles = client.profiles.list()
    if not profiles or profiles[0].id is None:
        raise ValueError("No profile available")
    balances = client.balances.list(profile_id=profiles[0].id, types="STANDARD")
    print([(balance.currency, balance.amount) for balance in balances])
```

Choose the intended profile explicitly when an account has several. For live
requests, select `WiseEnvironment.Production` / `WiseEnvironment.PRODUCTION`
and supply production credentials. Keep tokens and private keys on your server.

## Coverage

- All 210 REST operations in the official 2026Q3 snapshot, with consistent resource names.
- Personal tokens, partner OAuth grants, token rotation helpers and mTLS transport setup.
- Lazy recipient, activity and transfer iterators; statement downloads and raw responses.
- Webhook signature verification and SCA challenge detection.
- TypeScript: ESM and CommonJS, typed models and large integer ID support.
- Python: sync/async clients, Pydantic models, context managers and `py.typed`.
- React: display-only account cards, masked account details and money formatting.

Access depends on your account and partner agreement. Personal tokens cannot use
all partner endpoints; EU/UK personal-token restrictions include funding transfers
and retrieving statements. OAuth, mTLS, SCA and JOSE requirements still apply.
Write requests never retry automatically. Read [API details](docs/api-gotchas.md)
before using transfers, money values or pagination.

## Documentation

- [Endpoint and naming map](docs/naming-map.md)
- [Authentication, OAuth, mTLS and token rotation](docs/authentication.md)
- [Webhooks and SCA challenges](docs/webhooks.md)
- [Money, pagination, errors and files](docs/api-gotchas.md)
- [Migrating from other Wise clients](docs/migration.md)
- [Generation](docs/how-it-works.md), [maintenance](docs/maintaining.md), [testing](docs/testing.md) and [releases](docs/releasing.md)

## Why another SDK

This follows the structure of my [Starling SDK](https://github.com/MMZaini/starling-sdk):
one upstream specification, generated clients and small helpers for behavior that
does not belong in OpenAPI. Stable resource names live in Fern overrides, so ordinary
updates require a spec refresh and regeneration.

A daily workflow checks Wise's specification. Compatible changes regenerate, pass
CI, merge and publish automatically; changes that need review open a draft PR.
See [automatic updates](docs/maintaining.md#automatic-updates) for the policy.

## Repository layout

```text
openapi/          Unmodified upstream spec, source checksum and endpoint metadata
fern/             Pinned generators, naming overrides and documented supplements
scripts/          Spec updates, generation, package checks and release tooling
sdks/typescript/  Generated client, TypeScript helpers, metadata and tests
sdks/python/      Generated client, Python helpers, metadata and tests
packages/react/   Optional components, styles, example and browser tests
tests/            Shared fixtures, automation checks and local mTLS server
docs/             Authentication, API details, maintenance and releases
.github/          CI, spec updates and publishing workflows
```

## Development

Requires Node 22+, Python 3.11+ and Docker for generation. WSL works on Windows.
From the repository root:

```sh
npm ci
npm --prefix sdks/typescript ci
npm --prefix packages/react ci
python -m venv .venv
. .venv/bin/activate
python -m pip install -e 'sdks/python[dev]'
npm run generate
npm test
npm --prefix sdks/typescript test
python -m pytest sdks/python/tests
npm --prefix packages/react test
```

See [testing](docs/testing.md) for browser, package-install and sandbox checks.
Ordinary tests need no Wise credentials.

## Contributing

Issues and pull requests are welcome. Include a small reproduction and redact
tokens, personal information and account details. Generated code comes from the
spec and overrides; fixes usually belong there or in helpers outside `generated/`.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the relevant checks.

## License

[MIT](LICENSE).
