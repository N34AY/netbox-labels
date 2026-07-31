# Contributing

Thanks for considering a contribution to netbox-labels.

## Development setup

This is a [NetBox](https://github.com/netbox-community/netbox) plugin, so it needs a running
NetBox instance to do anything useful — there's no standalone dev server. The easiest way to get
one is [netbox-docker](https://github.com/netbox-community/netbox-docker):

1. Mount this repo into the NetBox container (e.g. via a bind-mounted `plugin_requirements.txt`
   entry pointing at a local path, or `pip install -e /path/to/netbox-labels` inside the
   container) so edits are picked up without rebuilding.
2. Add `netbox_labels` to `PLUGINS` in your `configuration.py` (see the README's Installation
   section).
3. Run migrations: `python manage.py migrate netbox_labels`.
4. Restart NetBox (and its RQ worker, if running separately) after Python changes; static JS/CSS
   changes just need a browser refresh (and `collectstatic` if `DEBUG` is off).
5. Optionally, seed a few clearly-fake demo objects (sites, devices, and two QR templates, all
   named "Acme ...") to have something to click around or screenshot without touching real data:

   ```bash
   python manage.py netbox_labels_demo_data
   # Remove it again with:
   python manage.py netbox_labels_demo_data --flush
   ```

## Running tests

Python (needs the full NetBox app registry, so it's run through NetBox's own management command,
not plain `pytest`):

```bash
python manage.py test netbox_labels
# or, from the netbox-docker host:
docker compose exec netbox python /opt/netbox/netbox/manage.py test netbox_labels
```

JavaScript (the visual designer, bulk printing, and printer drivers), via
[Jest](https://jestjs.io/):

```bash
npm install
npm test
```

Lint (Python only — see `[tool.ruff]` in `pyproject.toml` for the deliberately narrow rule set):

```bash
pip install ruff
ruff check .
```

All three run in CI on every push and pull request (`.github/workflows/test.yml`).

## Making changes

- Keep PRs focused — one change per PR is easier to review than a bundle of unrelated ones.
- Add or update tests for behavior you add or fix; a bug fix without a regression test tends to
  come back.
- If you're changing user-facing English strings, they'll need retranslating for `uk` (or should
  at least fail gracefully in the meantime — Django falls back to the English source string for
  anything untranslated).
- Match the existing code style rather than introducing a new one (the JS files are plain ES5-ish
  IIFEs with no build step, on purpose — no bundler/transpiler is part of this project's runtime
  requirements for NetBox admins).

Maintainers: see [RELEASING.md](RELEASING.md) for how to cut a release.

## Reporting bugs / requesting features

Use [GitHub Issues](https://github.com/N34AY/netbox-labels/issues). Include your NetBox and
plugin version for bug reports, and enough detail to reproduce (a template's HTML/CSS/JS, if
relevant).

For security vulnerabilities, see [SECURITY.md](SECURITY.md) instead of opening a public issue.
