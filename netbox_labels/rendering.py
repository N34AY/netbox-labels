from django.contrib.contenttypes.models import ContentType
from utilities.api import get_serializer_for_model
from utilities.jinja2 import render_jinja2


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


def render_template(qr_template, instance, request):
    """Render a QRTemplate for a specific object instance."""
    context = build_context(instance, request)

    return {
        'qr_value': render_jinja2(qr_template.qr_value, context).strip(),
        'body_html': render_jinja2(qr_template.html_code, context, environment_params=_HTML_ENV_PARAMS),
        'css_code': qr_template.css_code,
        'js_code': qr_template.js_code,
        'object_data': context['object_data'],
        'object_type': context['object_type'],
        'object': instance,
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


def render_placeholder(qr_template, request):
    """Render a QRTemplate with mock data, for previewing without a real object."""
    context = {
        'object': _PlaceholderObject(),
        'object_type': _PlaceholderObjectType(),
        'object_url': request.build_absolute_uri('/'),
        'object_data': {},
    }

    return {
        'qr_value': render_jinja2(qr_template.qr_value, context).strip(),
        'body_html': render_jinja2(qr_template.html_code, context, environment_params=_HTML_ENV_PARAMS),
        'css_code': qr_template.css_code,
        'js_code': qr_template.js_code,
        'object_data': context['object_data'],
        'object_type': context['object_type'],
        'object': context['object'],
    }
