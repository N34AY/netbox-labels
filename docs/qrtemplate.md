# QR Template

Part of the [NetBox Labels](https://github.com/N34AY/netbox-labels) plugin.

A **QR Template** defines an HTML/CSS/JS label — plus a Jinja2 expression for what the QR code
itself encodes — for one or more NetBox object types. Once a template is created, NetBox shows a
"QR Codes" panel on the detail page of every object it applies to, letting you preview, print via
the browser, or print directly to a label printer — Niimbot, Zebra, or any generic ESC/POS
printer — over Bluetooth or USB.

## Fields

### Name

A unique name for the template.

### Slug

A unique URL-friendly identifier, generated automatically from the name.

### Description

A short description of the template's purpose (optional).

### Active

Inactive templates are hidden from object detail panels and cannot be rendered.

### Apply to all object types

When enabled, the template is offered for every object type in NetBox, and the **Object types**
selection below is ignored.

### Object types

The specific object type(s) (e.g. `dcim.device`, `dcim.cable`) this template applies to. At least
one type must be selected unless **Apply to all object types** is enabled.

### QR code value

A Jinja2 expression evaluated against the object being rendered, producing the data encoded in
the QR code. Defaults to `{{ object_url }}` — the object's absolute NetBox URL, so scanning the
code opens that object.

### HTML

Jinja2 + HTML for the label body. Add `<div data-netbox-qr></div>` anywhere the QR code image
itself should appear — it's filled in automatically by the bundled QR library.

### CSS

Styles for the label. For printed labels, size the page precisely with real physical units, e.g.:

```css
@page { size: 40mm 12mm; margin: 0; }
html, body { width: 40mm; height: 12mm; }
```

### JavaScript

Runs after the QR code has been drawn. See [JavaScript API](#javascript-api) below.

## Jinja2 context

Available in the **HTML** and **QR code value** fields:

| Variable | Description |
| --- | --- |
| `object` | The model instance being rendered (e.g. a `Device` or `Cable`). Use `{{ object }}` for its display string — this works for every object type, unlike `{{ object.name }}`, which some models (like Cable) don't have. |
| `object_type` | The object's `ContentType` (e.g. `{{ object_type.model }}` gives `"device"`). |
| `object_url` | Absolute URL to the object's NetBox detail page. |
| `object_data` | The object serialized the same way the REST API would return it. |

## JavaScript API

Available once the page has loaded:

| Global | Description |
| --- | --- |
| `window.NetBoxQR.value` | The rendered QR code value. |
| `window.NetBoxQR.objectType` | The object's content type, as `"app_label.model"`. |
| `window.NetBoxQR.objectId` | The object's primary key. |
| `window.NetBoxQR.objectData` | Same as the Jinja2 `object_data` variable, as JSON. |

Any `[data-netbox-qr]` element is filled with a scannable QR code automatically. Optional
attributes on that element:

| Attribute | Default | Description |
| --- | --- | --- |
| `data-value` | `NetBoxQR.value` | Override what this specific code encodes. |
| `data-width` / `data-height` | `200` | Canvas size in pixels. For print labels, render at a higher resolution than the CSS box (e.g. matching the printer's DPI) and let CSS scale it down — see the bundled "Niimbot D110 Label" template. |
| `data-color-dark` / `data-color-light` | `#000000` / `#ffffff` | QR module colors. |
| `data-correct-level` | `H` | Error-correction level (`L`/`M`/`Q`/`H`). Lower levels need fewer modules for the same data — useful for keeping small physical labels scannable. |

## Visual designer: barcode formats

A **qr** or **barcode** element added in the visual designer has its own **Content** field — the
same binding options as a text element (Object name, Object URL, Object type, Static text,
Formatted text, Custom Jinja2 expression) — instead of the template-wide **QR code value** field
above. Both default to **Object URL**.

Unlike a QR code, a barcode format constrains what it can encode: only `CODE128` accepts
arbitrary text such as a URL. Every other format expects a specific digit count or character set:

| Format | Valid input |
| --- | --- |
| `CODE128` | Any text. |
| `EAN13` | 12 or 13 digits. |
| `EAN8` | 7 or 8 digits. |
| `UPC` | 11 or 12 digits. |
| `ITF14` | An even number of digits. |
| `MSI` | Digits only. |
| `pharmacode` | A number from 3 to 131070. |
| `CODE39` | Uppercase letters, digits, and `-. $/+%`. |
| `codabar` | Digits and `-$:/.+`. |

The designer's **Barcode format** dropdown is filtered to match, but only for the two bindings
whose value it can actually check up front:

- **Object URL** is always a URL, so only `CODE128` is offered.
- **Static text** is filtered to whatever formats the text you typed actually fits.
- **Object name**, **Object type**, **Formatted text**, and **Custom Jinja2 expression** resolve
  to a different value per object, which the designer has no way to check — every format stays
  selectable, so pick one that matches the data you expect (e.g. a device's serial number against
  `EAN13`). A value that doesn't fit the chosen format at render time fails silently: the barcode
  is left blank and the mismatch is only logged to the browser console, prefixed
  `[NetBoxQR/Barcode]`.

## Where templates appear

- A "QR Codes" panel on the detail page of every object type the template applies to, showing a
  live preview at the label's true rendered size plus **Print** / **Print via…** buttons.
- A standalone render page at
  `/plugins/labels/render/<content_type_id>/<object_id>/<template_id>/`.

## Printing to a label printer

The **Print via…** button (hidden if disabled under **QR Codes → Settings** in your NetBox
instance's sidebar) opens a small picker offering direct printing to a label printer, bypassing
the OS print dialog
entirely. Four drivers are supported:

| Driver | Transport | Notes |
| --- | --- | --- |
| **Niimbot** | Bluetooth or USB | Uses the community [niimbluelib](https://github.com/MultiMote/niimbluelib) project, which auto-detects the correct protocol for the connected model. Covers essentially the full current Niimbot lineup (D11/D110, B1/B21 series, H1S, and dozens more) — see the library's `PrinterModel` enum for the exact list. It's a pinned/vendored snapshot, so brand-new models released after that snapshot won't be recognized until it's updated. |
| **Zebra — ZPL** | USB only | Generates [ZPL](https://en.wikipedia.org/wiki/Zebra_Programming_Language) (`^GFA` graphic field), the language spoken by Zebra's desktop/industrial printers (GC/GX/ZD/GK series and similar). |
| **Generic — ESC/POS** | USB only | Generates a raw ESC/POS raster bit image (`GS v 0`) — the de-facto standard spoken by most unbranded Bluetooth/USB thermal label printers. |

Every driver requires:

- Chrome or Edge (Web Bluetooth and Web Serial aren't supported in Firefox or Safari)
- HTTPS, or `localhost`, to serve NetBox
- Picking your printer via the browser's native device picker — a real click only you can make,
  once per browser/origin

**Why USB-only for Zebra and generic ESC/POS:** those printers almost universally pair over
classic Bluetooth (SPP), which the
[Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) cannot
reach at all from a browser — it only speaks Bluetooth Low Energy (GATT). Niimbot printers use
BLE, so Bluetooth works for that driver specifically.

Progress and errors are logged to the browser console, prefixed `[NetBoxQR/Niimbot]`,
`[NetBoxQR/ZPL]`, or `[NetBoxQR/ESC-POS]` depending on the driver used.

Printer not listed, or a driver not working for your model? Use the **Report a bug / request
device support** link in the same picker.

## Security

The **HTML**, **CSS**, and **JavaScript** fields are rendered and executed as written — the same
trust model NetBox uses for Export Templates and Custom Links. Only users with
`netbox_labels.add_qrtemplate` / `change_qrtemplate` permission can author or edit templates.
