# NetBox Labels

QR code / barcode label templates for NetBox objects, with a no-code visual designer and
printing support for label printers (Niimbot, Zebra ZPL, generic ESC/POS) over Bluetooth or USB.

A **QR Template** defines an HTML/CSS/JS label for one or more NetBox object types — written by
hand, or built without code in the visual designer. Once a template is created, NetBox shows a
"QR Codes" panel on the detail page of every object it applies to, letting you preview, print via
the browser, or print directly to a label printer.

See the project [README](https://github.com/N34AY/netbox-labels#readme) for installation and a
getting-started walkthrough.

## Models

- [QR Template](qrtemplate.md) — the label itself: what it looks like, what data it encodes, and
  which object types it applies to.
- [QR Size Preset](qrsizepreset.md) — named label sizes offered as quick picks in the visual
  designer.
