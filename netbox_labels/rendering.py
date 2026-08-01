import copy

from django.contrib.contenttypes.models import ContentType
from utilities.api import get_serializer_for_model
from utilities.jinja2 import render_jinja2

from .layout import text_content


# Only the html_code render goes through autoescape — its output is inserted into the
# page as raw HTML ({{ body_html|safe }} in render.html), so any object data reached via
# a binding (e.g. {{ object }}, a device name) must be entity-escaped to prevent stored
# XSS. qr_value is plain text/URL data encoded into the QR bitmap, never inserted as
# HTML, so it must stay unescaped (escaping would corrupt values containing "&").
_HTML_ENV_PARAMS = {'autoescape': True}


def build_context(instance, request):
    """Context made available to a QRTemplate's Jinja2 fields (qr_value, html_code)."""
    serializer_class = get_serializer_for_model(instance)
    serializer = serializer_class(instance, context={'request': request})

    return {
        'object': instance,
        'object_type': ContentType.objects.get_for_model(instance),
        'object_url': request.build_absolute_uri(instance.get_absolute_url()),
        'object_data': serializer.data,
    }


class _PlaceholderObjectType:
    model = 'object'
    app_label = 'preview'

    def __str__(self):
        return 'Object'


class _PlaceholderObject:
    """Stands in for a real object in preview rendering. Jinja2 turns any
    attribute access that doesn't exist here (e.g. a custom `object.status`
    binding) into an empty Undefined rather than an error."""

    def __str__(self):
        return 'Sample Object'


def build_placeholder_context(request):
    """Mock-data counterpart to build_context(), for previewing without a real object."""
    return {
        'object': _PlaceholderObject(),
        'object_type': _PlaceholderObjectType(),
        'object_url': request.build_absolute_uri('/'),
        'object_data': {},
    }


def _render_with_context(qr_template, context):
    return {
        'qr_value': render_jinja2(qr_template.qr_value, context).strip(),
        'body_html': render_jinja2(qr_template.html_code, context, environment_params=_HTML_ENV_PARAMS),
        'css_code': qr_template.css_code,
        'js_code': qr_template.js_code,
        'object_data': context['object_data'],
        'object_type': context['object_type'],
        'object': context['object'],
    }


def render_template(qr_template, instance, request):
    """Render a QRTemplate for a specific object instance."""
    return _render_with_context(qr_template, build_context(instance, request))


def render_placeholder(qr_template, request):
    """Render a QRTemplate with mock data, for previewing without a real object."""
    return _render_with_context(qr_template, build_placeholder_context(request))


def sanitize_layout_for_context(layout, context, mark_errors=True):
    """Test-renders every "custom"/"format" text/barcode/qr element's own Jinja2
    fragment against the given context, and — in a deep copy of layout —
    falls back any element whose fragment raises to a static display of its
    own raw expression/format string, rather than letting the *entire* label
    fail to render (and thus disappear completely from the preview) over one
    broken binding.

    mark_errors (recolors the fallback red for text/barcode) should only be
    true when context is real object data: the placeholder object has no
    attributes of its own at all, so chaining even one level past its first
    (always-Undefined) attribute — e.g. object.a_terminations[0].device —
    raises unconditionally, regardless of whether the expression is actually
    fine for a real object. Recoloring that red would flag countless
    ordinary expressions as broken purely because the mock object can't
    satisfy them, not because anything is wrong.

    Returns (sanitized_layout, errors), where errors is a list of
    (element_id, message) pairs for whichever elements were rewritten.

    This does mean a successful "custom"/"format" fragment gets rendered
    twice per call — once here, standalone, and again as part of the full
    combined document a moment later — rather than reusing this pass's
    already-rendered result. That's deliberate, not an oversight: caching
    the rendered *text* and splicing it into the layout as literal content
    would make it part of the html_code string that then goes through a
    *second* Jinja2 render for the full document — and Jinja2's own output
    is not escaped against being re-interpreted as more Jinja2 syntax on a
    second pass. An object whose data happens to render as something that
    looks like "{{ some_expression }}" (rare, but not something a template
    author controls — it's whatever the bound object's own field values are)
    would have that text evaluated as real template code the second time
    around, which is a bug this module has otherwise been careful to keep
    out entirely (see render_template()'s autoescape comment above). Two
    renders of a handful of small fragments on a low-traffic preview
    endpoint is a trivial cost next to reopening that door.
    """
    sanitized = copy.deepcopy(layout)
    errors = []
    for element in sanitized.get('elements', []):
        if element.get('type') not in ('text', 'barcode', 'qr') or element.get('binding') not in ('custom', 'format'):
            continue
        fragment = text_content(element)
        if not fragment:
            continue
        try:
            render_jinja2(fragment, context, environment_params=_HTML_ENV_PARAMS)
        except Exception as e:
            errors.append((element.get('id', '?'), f'{e.__class__.__name__}: {e}'))
            # Falls back to showing the admin-authored expression/format
            # string itself (as plain static text — see text_content()'s
            # 'static' case, which escapes it like any other static text)
            # rather than going blank, so the broken element is still
            # visible on the label itself, not just in the preview's error
            # panel. Recolored red so it's obviously not the real content —
            # but only when mark_errors confirms this against real data (see
            # the docstring above).
            raw_source = element.get('expr' if element.get('binding') == 'custom' else 'format', '')
            element['binding'] = 'static'
            element['text'] = raw_source
            if mark_errors and element.get('type') in ('text', 'barcode'):
                element['color'] = '#dc3545'
    return sanitized, errors
