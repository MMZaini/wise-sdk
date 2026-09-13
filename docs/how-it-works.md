# Generation

The official [Wise OpenAPI bundle](https://docs.wise.com/_bundle/api-reference/@latest/index.json?download)
is stored unchanged at `openapi/wise.json`. `source.json` records its URL, checksum,
retrieval time and API quarter. `operations.json` and the [naming map](naming-map.md)
are derived metadata.

## Inputs and output

```text
Wise OpenAPI snapshot
  + documented supplements → temporary OpenAPI input
  + Fern overrides         → pinned TypeScript and Python generators
  + checked postprocessing → committed generated clients
  + small runtime helpers  → npm and PyPI packages
```

`fern/overrides.yml` defines stable resource names, request names, authentication,
the separate card server and retry restrictions. For example, both languages expose
`profiles.list`; multiword methods use camelCase in TypeScript and snake_case in
Python. New operations need an explicit mapping before generation can pass.

`fern/supplements.yml` describes the statement download operation documented by
Wise but absent from its JSON path schema. `prepare-spec.mjs` derives its parameters
and errors from the upstream statement operation and gives it a binary response.
The generated input lives in ignored `fern/.generated/`; the official snapshot
remains unchanged.

The Fern CLI and both generator versions are pinned. `scripts/postprocess.mjs`
contains checked, idempotent fixes for generator defects, response handling,
serialization and read-only retries. A changed patch target fails generation.
Handwritten authentication, transport, pagination and webhook helpers live outside
`generated/` and survive regeneration.

## Regenerate

Run from the repository root with Docker available:

```sh
npm ci
docker info
npm run spec:check
npm run generate
git diff --stat
```

Generation runs locally in Docker and requires no Fern account or Wise credentials.
On Windows, use WSL with Docker integration enabled and install dependencies within
the same WSL environment. Do not share a Windows `node_modules` install with WSL.

CI regenerates from the committed inputs and rejects any diff or untracked output.
Consumers installing published packages do not need Docker or Fern.
