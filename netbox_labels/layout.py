"""
Converts a visual-designer layout (see qr-designer.js) into the same
html_code/css_code a hand-written QRTemplate would have, so the rest of the
plugin (Jinja2 rendering, the Niimbot rasterizer, printing) never needs to
know a template was built visually rather than by hand.

Canvas size lives on QRTemplate.width_mm/height_mm (not in the layout dict
itself) so it can be filtered/sorted on and reused as the designer's default.

Layout shape:
{
    "elements": [
        {
            "id": str, "type": "text" | "qr" | "image" | "barcode",
            "x_mm": float, "y_mm": float, "width_mm": float, "height_mm": float,
            # text and barcode:
            "binding": "static" | "object" | "object_type" | "custom" | "format",
            "text": str,   # used when binding == "static"
            "expr": str,   # used when binding == "custom" (a Jinja2 expression, no {{ }})
            "format": str, # used when binding == "format" (literal text with ${expr}
                            # placeholders, e.g. "Ip - ${object.primary_ip}")
            # text only:
            "font_size_mm": float, "font_weight": "normal" | "bold",
            "color": str, "text_align": "left" | "center" | "right",
            "text_transform": "none" | "uppercase" | "lowercase" | "capitalize",
            "letter_spacing_mm": float,
            # qr only:
            "correct_level": "L" | "M" | "Q" | "H",
            # image only:
            "src": str,  # a data: URI (uploaded file, embedded inline)
            # barcode only:
            "barcode_format": "CODE128" | "EAN13" | "EAN8" | "UPC" | "CODE39" | "ITF14" |
                               "MSI" | "pharmacode" | "codabar",
            # barcode also uses "color" (line/text color), like text elements do.
        },
        ...
    ],
}
"""
import re

from django.utils.html import escape

from .models import DEFAULT_HEIGHT_MM, DEFAULT_WIDTH_MM

# Matches a "${expr}" placeholder in a "format" binding string, e.g. the
# "${object.primary_ip}" in "Ip - ${object.primary_ip}" — deliberately not
# greedy across "}" so a malformed/unclosed "${" is simply left as literal
# text rather than swallowing the rest of the string.
_FORMAT_PLACEHOLDER_RE = re.compile(r'\$\{([^}]*)\}')


def _num(value, default):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _jinja_str_literal(value):
    """Encode a plain string as Jinja2 single-quoted string-literal source."""
    return "'" + value.replace('\\', '\\\\').replace("'", "\\'") + "'"


def _render_format_string(format_str):
    """Turn a JS-template-literal-style string (literal text with ${expr}
    placeholders, e.g. "Ip - ${object.primary_ip}") into Jinja2 source: each
    ${expr} becomes a {{ expr }} expression (evaluated — and, since html_code
    is rendered with autoescape on, HTML-escaped — at render time), while
    every literal segment between placeholders is escaped and wrapped in
    {% raw %} so it can't be misread as further Jinja2 syntax itself."""
    parts = []
    pos = 0
    for match in _FORMAT_PLACEHOLDER_RE.finditer(format_str):
        literal = format_str[pos:match.start()]
        if literal:
            parts.append('{% raw %}' + escape(literal) + '{% endraw %}')
        expr = match.group(1).strip()
        if expr:
            # default() falls back to the expression's own source text when
            # it evaluates to Undefined (e.g. previewing with placeholder
            # data and the expression references an attribute — like
            # object.primary_ip — the placeholder object doesn't have) so
            # the element shows *what* would go there instead of rendering
            # blank. Never overrides a real, defined value.
            parts.append('{{ (' + expr + ')|default(' + _jinja_str_literal(expr) + ') }}')
        pos = match.end()
    trailing = format_str[pos:]
    if trailing:
        parts.append('{% raw %}' + escape(trailing) + '{% endraw %}')
    return ''.join(parts)


def text_content(element):
    """The Jinja2 source (not yet rendered) for a single text element's
    binding — e.g. '{{ object }}' or a "custom"/"format" expression wrapped
    in a default() fallback. Also called directly by rendering.py to
    test-render a risky element's fragment standalone before it's part of a
    full document (see sanitize_layout_for_context()), so this stays a
    real part of the module's interface, not html_code-generation-only."""
    binding = element.get('binding', 'object')
    if binding == 'static':
        # Wrapped in {% raw %} so literal "{{ ... }}"-looking text in a static
        # label can't be misinterpreted as Jinja2 syntax when the generated
        # html_code is itself rendered.
        return '{% raw %}' + escape(element.get('text', '')) + '{% endraw %}'
    if binding == 'object':
        return '{{ object }}'
    if binding == 'object_type':
        return '{{ object_type.model }}'
    if binding == 'custom':
        expr = element.get('expr', '').strip()
        if not expr:
            # No expression typed yet (e.g. the binding was just switched to
            # "custom" in the designer) — "{{ () }}" would be valid-but-wrong
            # Jinja2 (an empty tuple), and bare "{{ }}" is a syntax error.
            return ''
        return '{{ (' + expr + ')|default(' + _jinja_str_literal(expr) + ') }}'
    if binding == 'format':
        return _render_format_string(element.get('format', ''))
    return ''


def _element_style(element):
    return (
        f"position:absolute;"
        f"left:{_num(element.get('x_mm'), 0)}mm;"
        f"top:{_num(element.get('y_mm'), 0)}mm;"
        f"width:{_num(element.get('width_mm'), 10)}mm;"
        f"height:{_num(element.get('height_mm'), 10)}mm;"
    )


def _render_qr_element(element):
    correct_level = element.get('correct_level') or 'H'
    if correct_level not in ('L', 'M', 'Q', 'H'):
        correct_level = 'H'
    style = _element_style(element) + 'background:#fff;'
    return (
        f'<div data-netbox-qr data-width="300" data-height="300" '
        f'data-correct-level="{escape(correct_level)}" style="{style}"></div>'
    )


def _render_image_element(element):
    style = _element_style(element) + 'object-fit:contain;'
    src = escape(element.get('src', ''))
    return f'<img src="{src}" style="{style}">'


_BARCODE_FORMATS = ('CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'MSI', 'pharmacode', 'codabar')


def _render_barcode_element(element):
    barcode_format = element.get('barcode_format') or 'CODE128'
    if barcode_format not in _BARCODE_FORMATS:
        barcode_format = 'CODE128'
    style = _element_style(element) + 'background:#fff;'
    color = escape(element.get('color') or '#000000')
    # The encoded value is the canvas's own inner text (read via .textContent
    # by barcode-render.js), not a data-*="..." attribute — text_content()'s
    # output is only safe to splice in raw where it's HTML *content*, like
    # _render_text_element's <div> below: for "custom"/"format" bindings it
    # contains admin-authored Jinja2 source that isn't attribute-escaped, so
    # embedding it inside a quoted attribute could let a literal `"` in an
    # expression break out of the attribute.
    return (
        f'<canvas class="netbox-labels-barcode" '
        f'data-barcode-format="{escape(barcode_format)}" data-barcode-color="{color}" '
        f'width="600" height="200" style="{style}">{text_content(element)}</canvas>'
    )


def _render_text_element(element):
    style = _element_style(element)
    style += f"font-size:{_num(element.get('font_size_mm'), 3)}mm;"
    style += f"font-weight:{escape(element.get('font_weight') or 'normal')};"
    style += f"color:{escape(element.get('color') or '#000000')};"
    style += f"text-align:{escape(element.get('text_align') or 'left')};"
    text_transform = element.get('text_transform') or 'none'
    if text_transform != 'none':
        style += f"text-transform:{escape(text_transform)};"
    letter_spacing = element.get('letter_spacing_mm')
    if letter_spacing:
        style += f"letter-spacing:{_num(letter_spacing, 0)}mm;"
    style += 'overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-family:Arial,Helvetica,sans-serif;'
    return f'<div style="{style}">{text_content(element)}</div>'


_RENDERERS = {
    'qr': _render_qr_element,
    'image': _render_image_element,
    'text': _render_text_element,
    'barcode': _render_barcode_element,
}


def layout_to_html(layout, width_mm=DEFAULT_WIDTH_MM, height_mm=DEFAULT_HEIGHT_MM):
    parts = []
    for element in layout.get('elements', []):
        renderer = _RENDERERS.get(element.get('type'))
        if renderer:
            parts.append(renderer(element))

    root_style = (
        f'position:relative;width:{_num(width_mm, DEFAULT_WIDTH_MM)}mm;'
        f'height:{_num(height_mm, DEFAULT_HEIGHT_MM)}mm;'
        f'overflow:hidden;background:#ffffff;'
    )
    return f'<div style="{root_style}">' + ''.join(parts) + '</div>'


def layout_to_css(layout, width_mm=DEFAULT_WIDTH_MM, height_mm=DEFAULT_HEIGHT_MM):
    width_mm = _num(width_mm, DEFAULT_WIDTH_MM)
    height_mm = _num(height_mm, DEFAULT_HEIGHT_MM)
    return (
        f'@page {{ size: {width_mm}mm {height_mm}mm; margin: 0; }}\n'
        f'html, body {{ width: {width_mm}mm; height: {height_mm}mm; }}'
    )
