# Releases

All three packages share one version. Release CI builds four files: two npm tarballs,
a Python wheel and a Python source distribution. It tests those files before
publication and attaches them with `SHA256SUMS` to the GitHub release.

## One-time registry setup

GitHub Actions uses trusted publishing, without long-lived registry tokens.
The environments are named `npm` and `pypi`; restrict deployment to `v*` tags.
Do not add required reviewers if automatic publication is intended.

For PyPI, add a [pending publisher](https://pypi.org/manage/account/publishing/):

| Field | Value |
| --- | --- |
| Project name | `wise-sdk` |
| GitHub owner | `MMZaini` |
| Repository | `wise-sdk` |
| Workflow filename | `release.yml` |
| Environment | `pypi` |

For an existing project, add the same publisher under its publishing settings.
See [PyPI's instructions](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/).

npm requires each package to exist before configuring trust. For the first release,
download the checked `release-artifacts` from CI for the tagged commit, verify the
manifest and publish the tarballs using the owner's local npm login. The repository
script verifies hashes and the committed source before publishing:

```sh
npm run publish:npm
```

Then configure both packages with npm 11.15+ and account 2FA:

```sh
npm trust github @mmzaini/wise-sdk --repo MMZaini/wise-sdk --file release.yml --env npm --allow-publish --yes
npm trust github @mmzaini/wise-react --repo MMZaini/wise-sdk --file release.yml --env npm --allow-publish --yes
```

npm may require an interactive 2FA challenge. See [npm trust](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
Rerun the tagged release workflow after setup; matching existing packages are
skipped. Future versions publish through GitHub's OIDC identity.

Enable GitHub Actions to create pull requests in repository Actions settings for
the specification updater. The workflow explicitly sets commit author and committer.

## Prepare a manual release

Start from an up-to-date, clean main branch. After implementing and checking changes:

```sh
npm run version:bump -- patch "Describe the resulting behavior."
git diff
git add sdks/typescript/package.json sdks/typescript/package-lock.json sdks/python/pyproject.toml sdks/python/src/wise_sdk/__init__.py packages/react/package.json packages/react/package-lock.json CHANGELOG.md
git commit -m "Prepare the next release"
git push origin main
```

Use `minor` for compatible additions. Breaking changes need a deliberate version
decision and migration notes; they are not released by the automatic updater.
After CI passes, tag the committed version, for example:

```sh
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin v0.1.1
```

The tag must match every package version and point to a commit on main. The release
workflow repeats the complete CI matrix, publishes npm and PyPI, then creates the
GitHub release. Version bumps also update Python's runtime `__version__`.

Every changelog heading is a version number; the release reads them to build its
notes and rejects anything else, including an "Unreleased" heading. A version that
is prepared but never tagged keeps its notes: the next release covers every version
still missing a release, newest first, so a deferred decision cannot drop a breaking
change from the published notes.

## Retry a release

Rerun the failed workflow jobs, or dispatch `release.yml` on the same version tag.
Existing registry files must have identical checksums. A mismatch stops the release;
never replace an existing version with different bytes. Fix the problem on main
and release a new version when the source or artifacts must change.
