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

A run that needs review finishes green and leaves a draft pull request, a run
annotation and a step summary. A red run therefore means the automation itself is
broken, not that upstream changed in a way a person has to look at. The full CI
matrix runs only against a proposal that regenerated cleanly, because one that did
not cannot pass it.

Each snapshot proposes its own branch. When a newer snapshot arrives, the run
closes the proposal it supersedes and deletes that branch, so at most one
automatic proposal is open. A proposal with any commit that is not the workflow's
own is left alone. Merged branches are deleted.

A draft pull request for a generation failure quotes the end of the generation
log. A new upstream operation is the common case, and `spec:check` prints every
unmapped operation with a suggested `fern/overrides.yml` entry, already carrying
the authentication scheme, server and retry setting the checks require. Choose SDK
names, add the entries and regenerate.

Transient failures are retried: the specification download survives brief network
faults, and publication retries the npm registry check. Dependency installation is
not retried past npm's own attempts, and its failure fails the run rather than
quietly downgrading a compatible update to a draft.

Pull requests the workflow opens with `GITHUB_TOKEN` never start workflow runs, by
GitHub's design. The `CI` and `React preview` entries those pull requests show as
`action_required` stay queued forever and are expected; the update workflow calls
CI itself against the exact proposed commit instead. Review that run, not the
queued ones.

GitHub disables scheduled workflows in a repository with no commit activity for 60
days and emails the owner. Re-enable the schedule from the Actions tab if upstream
stays unchanged for that long.

Compatibility classification is deliberately conservative. A schema used in a
request, webhook or callback requires review even when its new property is optional.
Reusable path-item schemas also require review. The full CI matrix
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

The workflow pushes the merge commit straight to main. Protecting that branch
without exempting the workflow's identity would stop automatic updates; leave it
unprotected or add an explicit exemption.

## Generator and dependency updates

Dependabot proposes monthly grouped updates for GitHub Actions, npm and pip, so
pinned action SHAs and runtime dependencies do not drift on their own. Minor and
patch releases are grouped; majors arrive on their own, so one incompatible major
cannot hold back every safe update. It leaves `fern-api` alone because the CLI moves
together with `fern/fern.config.json` and the generator versions below.

The full CI matrix decides these updates. A generator that has not caught up with a
major dependency shows as a typecheck failure against generated sources, which is a
review item for the pinned generator rather than something to merge past.

Update pinned Fern versions in `fern/fern.config.json` and `fern/generators.yml`
together with the root CLI dependency when needed. Regenerate, inspect the diff
and remove workarounds only after tests prove they are no longer needed.

Review runtime dependencies separately from API updates. Run package installation
checks after changing exports, Python metadata, supported runtimes or build tools.
See [testing](testing.md) and [releasing](releasing.md).
