# Migrating from other Wise clients

This package has its own generated API and is not a drop-in replacement for
`wise-sdk` packages from other repositories. Install `@mmzaini/wise-sdk` on npm
or `wise-sdk` on PyPI, and use the [endpoint map](naming-map.md) to find each method.

| Concern | This SDK |
| --- | --- |
| Client | `WiseClient` / `WiseClient` or `AsyncWiseClient` |
| Default environment | Sandbox; production is explicit |
| Token | `accessToken` / `access_token`, or `WISE_ACCESS_TOKEN` |
| Methods | Resource groups with camelCase in TypeScript and snake_case in Python |
| Response | Typed endpoint data; raw metadata is opt-in |
| Large IDs | `number \| bigint` in TypeScript, `int` in Python |
| Money | Wise's documented major currency units |
| Pagination | One page per list call; explicit lazy iterators |
| Retries | Eligible reads only; never writes or token exchanges |
| API version | Pinned quarterly URLs; separate card hosts |

Review authentication and return shapes when replacing a client. A personal token
does not grant partner access. The OAuth, mTLS and SCA setup is described in
[authentication](authentication.md).

Check how your existing integration handles Wise profiles, currency balances,
dynamic recipient requirements and major-unit amounts. Preserve transfer
idempotency keys and review request signing before switching clients.
