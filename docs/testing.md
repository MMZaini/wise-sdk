# Testing

Ordinary tests use synthetic responses and a temporary local mTLS server. They
make no Wise requests and need no bank credentials. See the root README for setup.

## Local checks

From the repository root, with the Python development environment activated:

```sh
npm test
npm run spec:check
npm --prefix sdks/typescript run typecheck
npm --prefix sdks/typescript test
npm --prefix sdks/typescript run build
python -m pytest sdks/python/tests
npm --prefix packages/react run typecheck
npm --prefix packages/react test
npm --prefix packages/react run build
```

TypeScript's mTLS tests use `python3` and `cryptography` through the shared fixture.
The development Python extra includes that dependency. Use WSL locally on Windows.

Browser checks use synthetic account data:

```sh
cd packages/react
npx playwright install --with-deps chromium
npm run test:browser
```

These cover keyboard masking controls, mobile overflow and automated accessibility
checks. `npm --prefix packages/react run dev` serves the example for visual review.

## Installed packages

```sh
npm run build:artifacts
npm run check:artifacts
```

The checks install npm tarballs, a Python wheel and a source distribution into
temporary environments outside the checkout. They compile ESM/CommonJS consumer
types, run both module formats, render React, check Python sync/async clients and
execute the actual README examples against fixtures. Archive contents and checksums
are validated. `artifacts/` is ignored by Git.

## CI

CI covers Node 22/24, Python 3.11–3.14 and React 18/19. It also performs clean Fern
regeneration and builds the exact artifacts used for publishing. Generation
requires Docker; the other tests do not.

## Sandbox checks

Create an account at [wise-sandbox.com](https://wise-sandbox.com/), complete the
account setup and create a sandbox API token. See [authentication](authentication.md).
Set `WISE_ACCESS_TOKEN` in your shell or private local environment file. Never
commit that file or copy a token into an issue.

```sh
npm --prefix sdks/typescript run build
node scripts/sandbox-typescript.mjs
python scripts/sandbox-python.py
```

These scripts explicitly use the sandbox and only list profiles and balances.
Output contains counts and status, not account details. Both language checks have
passed against a sandbox account for the initial release.

Partner OAuth exchanges and Wise-issued mTLS certificates require separate partner
onboarding. Grant encoding, rotation and certificate verification are tested locally;
live partner flows have not been verified for this release. Most of the 210 API
operations are generated and checked against the specification, not exercised live.
Production writes, SCA approval and JOSE/card workflows require application-specific
validation with Wise.
