# Maintenance

## Specification updates

```sh
npm run spec:update
npm run generate
git diff --stat
```

Review the upstream changes, generated signatures and [naming map](naming-map.md).
Most updates need no helper changes. Add mappings in `fern/overrides.yml` for new
operations. Keep corrections outside the upstream snapshot and cite Wise's docs
when adding a supplement.

The supported API quarter is pinned in generation configuration and checks.
Review quarter changes explicitly, update all API environments and the supported
quarter together, then regenerate and run the full checks. The `twcard` hosts have
their own URLs and must stay separate.

## Automatic updates

`update-spec.yml` checks upstream daily at 08:17 UTC and can run manually.

| Change | Result |
| --- | --- |
| Identical snapshot | No action |
| Formatting only | Regenerate, check and merge; no release |
| Recognized documentation change | Patch release after all checks |
| New schema or non-colliding optional response field | Minor release after all checks |
| New/removed endpoint, request model, required field, type, enum, security, server or unknown change | Draft PR for review |
| Generation or checked postprocessing failure | Draft PR for review |

Compatibility classification is deliberately conservative. A schema used in a
request requires review even when its new property is optional. The full CI matrix
runs against the exact proposed commit. The merge step rechecks the commit, source
checksum, classification, allowed files and version changes; it stops if main or
the PR changes during CI.

The workflow commits and merges as `MMZaini <mahdizainipro@gmail.com>`. Forks must
change the repository guard and identity before enabling it. Automatic updates may
change generated output, source metadata, package versions and release notes; they
cannot modify runtime helpers or workflows.

Successful updates create a version tag and dispatch `release.yml` explicitly.
Package publication is automatic after its checks; no approval environment is
required. Existing update branches and manual edits are never overwritten.

## Generator and dependency updates

Update pinned Fern versions in `fern/fern.config.json` and `fern/generators.yml`
together with the root CLI dependency when needed. Regenerate, inspect the diff
and remove workarounds only after tests prove they are no longer needed.

Review runtime dependencies separately from API updates. Run package installation
checks after changing exports, Python metadata, supported runtimes or build tools.
See [testing](testing.md) and [releasing](releasing.md).
