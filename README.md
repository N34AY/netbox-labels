# NetBox Labels

[![Tests](https://github.com/N34AY/netbox-labels/actions/workflows/test.yml/badge.svg)](https://github.com/N34AY/netbox-labels/actions/workflows/test.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

A [NetBox](https://github.com/netbox-community/netbox) plugin that generates scannable QR
code labels for your objects (devices, racks, cables, sites, tenants, IP addresses, ...) from
admin-defined HTML/CSS/JS templates, with a no-code visual designer and printing support for
both direct label printers and regular printers.

- **Repository:** https://github.com/N34AY/netbox-labels
- **Issues / bug reports / feature requests:** https://github.com/N34AY/netbox-labels/issues

## Features

- **Visual template designer** — drag/resize text, image, and QR elements on a canvas sized
  to your label (mm), no HTML/CSS required. Undo/redo, zoom, and reusable size presets.
- **Code editor** — for anyone who prefers to write the HTML/CSS/JS by hand, or fine-tune what
  the designer generated.
- **Per-object-type templates** — a template can apply to one, several, or all object types,
  and every applicable template is offered on that object's detail page.
- **Live preview** — against placeholder data or a real object, before saving.
- **Single-object printing** — print any object's label via the browser's print dialog, or
  directly to a label printer (see below).
- **Bulk printing** — select any number of objects on a list page, pick a template, and print
  them all in one batch: either combined onto as few standard-size sheets as possible (A4/A5/
  Letter/Legal, via the browser's print dialog) or one-by-one to a direct label printer, with
  per-object progress tracking and resume-on-failure (e.g. if the printer runs out of paper
  mid-batch).
- **Direct label-printer support** — Niimbot, Zebra (ZPL), and generic ESC/POS printers, over
  Bluetooth or USB, straight from the browser via the Web Bluetooth / Web Serial APIs. No
  server-side printer drivers or agents required.
- **Ukrainian localization** included out of the box (`uk`), alongside the default English.

## Requirements

- NetBox >= 4.5
- Python >= 3.12
- A Chromium-based browser (Chrome, Edge) for direct label-printer support — Web Bluetooth and
  Web Serial aren't implemented by Firefox or Safari. Everything else (templates, designer,
  browser-print bulk printing) works in any modern browser.

## Installation

1. Install the package into NetBox's Python environment:

   ```bash
   # From GitHub, latest main:
   pip install git+https://github.com/N34AY/netbox-labels.git

   # Or pin a specific ref:
   pip install git+https://github.com/N34AY/netbox-labels.git@<tag-or-commit>
   ```

   If you're running NetBox via the official [netbox-docker](https://github.com/netbox-community/netbox-docker)
   image, add the line above to your `plugin_requirements.txt` (or build a custom image that
   installs it) rather than running `pip install` inside the container directly, so it
   survives container recreation.

2. Enable the plugin in NetBox's `configuration.py`:

   ```python
   PLUGINS = [
       "netbox_labels",
   ]

   PLUGINS_CONFIG = {
       "netbox_labels": {},
   }
   ```

3. Run migrations and collect static files:

   ```bash
   python manage.py migrate netbox_labels
   python manage.py collectstatic --no-input
   ```

4. Restart NetBox (and its RQ worker, if running as a separate process).

## Configuration

Once installed, admin-level settings (e.g. whether to offer direct label-printer printing at
all) live in-app under **Plugins → QR Codes → Settings**, not in `configuration.py` — no
further static configuration is required beyond the `PLUGINS`/`PLUGINS_CONFIG` entries above.

## Getting started

1. Go to **QR Коди → Templates** in the sidebar and create a template, or use the visual
   designer (the palette icon next to a template) to build one without writing code.
2. Pick which object type(s) it applies to (or "apply to all").
3. Open any matching object's detail page — a **QR Codes** panel appears with every
   applicable template, ready to view/print.
4. To print many objects at once, select their checkboxes on that object type's list page and
   use the **Bulk print QR** button that appears in the selection toolbar.

### Template context

Templates are Jinja2 + HTML. When rendered for a specific object, the following is available:

- In the `HTML` and `QR code value` fields (Jinja2):
  - `{{ object }}` — the model instance (e.g. a `Device`)
  - `{{ object_type }}` — its `ContentType`
  - `{{ object_url }}` — absolute URL to the object's NetBox detail page
  - `{{ object_data }}` — the object serialized the same way the REST API would
- In JavaScript, once the page loads:
  - `window.NetBoxQR.value` — the rendered QR code value
  - `window.NetBoxQR.objectData` — the same `object_data`, as JSON
  - Any `<div data-netbox-qr></div>` in the template's HTML is automatically filled with a
    scannable QR code (via a bundled QR library — no external network requests).

Object data interpolated into the HTML template is HTML-escaped automatically, so it's safe to
bind a template to fields your users (not just template authors) can edit.

## Trust model

`html_code`/`css_code`/`js_code` are rendered and executed as-is — the same trust model
NetBox itself uses for Export Templates and Custom Links. Only users with
`netbox_labels.add_qrtemplate` / `change_qrtemplate` permission can author or edit templates, so
that permission should be granted only to trusted staff, the same as NetBox's own scripting
and export-template features.

## Running tests

Like any NetBox plugin, the test suite needs a full NetBox environment (it exercises real
`dcim` models and the plugin's own migrations), so it's run through NetBox's own management
command rather than directly with `pytest`:

```bash
python manage.py test netbox_labels
```

From inside the netbox-docker `netbox` container, that's:

```bash
docker compose exec netbox python /opt/netbox/netbox/manage.py test netbox_labels
```

The static JS assets (the visual designer, bulk printing, printer drivers) have their own suite,
run with [Jest](https://jestjs.io/):

```bash
npm install
npm test
```

## Contributing

Issues and pull requests are welcome at
[github.com/N34AY/netbox-labels](https://github.com/N34AY/netbox-labels). Please include your
NetBox and plugin version when reporting a bug. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev
setup and how to run the test suites.

Found a security issue? Please see [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
