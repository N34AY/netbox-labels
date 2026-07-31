# Releasing

Releases are published to PyPI automatically by `.github/workflows/release.yml` whenever a
`vX.Y.Z` tag is pushed. This is a maintainer-only process.

## Cutting a release

1. Bump `version` in `pyproject.toml`.
2. Commit and push that to `main`:

   ```bash
   git commit -am "Release vX.Y.Z"
   git push origin main
   ```

3. Tag it and push the tag:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

Pushing the tag triggers the workflow, which:
1. Verifies the tag's version matches `pyproject.toml` (fails loudly if you forgot step 1).
2. Builds the sdist and wheel.
3. Publishes them to PyPI via [Trusted Publishing](https://docs.pypi.org/trusted-publishers/)
   (OIDC — no API token stored anywhere).
4. Creates a GitHub Release for the tag with the built files attached and auto-generated release
   notes (from merged PRs since the last tag).

If the tag/version check fails, delete the tag (`git push --delete origin vX.Y.Z`), fix the
version, and re-tag.

## One-time setup (already done for this repo, kept here for reference)

PyPI's Trusted Publishing needs to know about this repo/workflow before the *first* release can
publish (there's no API token to fall back on). On [pypi.org](https://pypi.org), under
**Publishing → Add a new pending publisher**, this project is registered with:

- PyPI project name: `netbox-labels`
- Owner: `N34AY`
- Repository name: `netbox-labels`
- Workflow name: `release.yml`
- Environment name: `pypi`

If publishing ever needs to move to a different repo/owner (e.g. a fork taking over
maintenance), this must be reconfigured on PyPI first, or releases will fail at the `publish`
job with an authentication error.
