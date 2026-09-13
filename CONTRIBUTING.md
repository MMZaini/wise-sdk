# Contributing

Use a small pull request with a clear problem, resulting behavior and relevant
validation. Include redacted fixtures when reporting an API mismatch.

## Where changes belong

| Change | Location |
| --- | --- |
| Official API update | `npm run spec:update`, then inspect `openapi/wise.json` |
| Resource/method naming or schema correction | `fern/overrides.yml` |
| Documented API feature missing from upstream | `fern/supplements.yml` and `scripts/prepare-spec.mjs`, with a primary source |
| Generator defect workaround | Checked, idempotent patch in `scripts/postprocess.mjs` |
| Runtime behavior | Helpers outside `src/generated/` |
| Components | `packages/react/` |

Do not edit generated files directly. Run `npm run generate` after changing
generation inputs and commit the generated result with its source change.
Keep the upstream snapshot unmodified; overrides and supplements are separate.

## Checks

Follow [testing](docs/testing.md). Run checks appropriate to the change; authentication,
transport and serialization changes need both language suites. Packaging changes
need isolated artifact installation checks. A generator update needs clean
regeneration plus the full CI matrix.

Never include access tokens, private keys, real webhook payloads or customer data
in issues, fixtures or commits. Use synthetic test data. Report security issues
through [private vulnerability reporting](https://github.com/MMZaini/wise-sdk/security/advisories/new).
