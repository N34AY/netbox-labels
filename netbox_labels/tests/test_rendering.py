import copy

from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase

from dcim.models import Site
from netbox_labels import rendering
from netbox_labels.models import QRTemplate


def _request():
    request = RequestFactory().get('/')
    request.user = get_user_model().objects.filter(is_superuser=True).first()
    if request.user is None:
        request.user = get_user_model().objects.create_superuser(username='qr-test-admin', email='', password='x')
    return request


class BuildContextTests(TestCase):
    def setUp(self):
        self.site = Site.objects.create(name='Test Site', slug='test-site')

    def test_includes_object_type_and_url(self):
        context = rendering.build_context(self.site, _request())
        self.assertEqual(context['object'], self.site)
        self.assertEqual(context['object_type'].model, 'site')
        self.assertIn(self.site.get_absolute_url(), context['object_url'])

    def test_includes_serialized_object_data(self):
        context = rendering.build_context(self.site, _request())
        self.assertEqual(context['object_data']['name'], 'Test Site')


class RenderTemplateXSSTests(TestCase):
    """Regression tests for the stored-XSS fix: object data reached via a
    binding must be HTML-escaped when inserted into body_html (which is later
    injected as raw HTML via {{ body_html|safe }}), but qr_value must stay
    unescaped since it's plain text/URL data encoded into the QR bitmap, not
    HTML — escaping it would corrupt a value containing "&"."""

    def test_body_html_escapes_object_data(self):
        site = Site.objects.create(name='<script>alert(1)</script>', slug='xss-site')
        template = QRTemplate(html_code='<div>{{ object }}</div>', qr_value='x', css_code='', js_code='')
        context = rendering.render_template(template, site, _request())
        self.assertNotIn('<script>', context['body_html'])
        self.assertIn('&lt;script&gt;', context['body_html'])

    def test_qr_value_is_not_html_escaped(self):
        site = Site.objects.create(name='Test Site', slug='amp-site')
        template = QRTemplate(html_code='', qr_value='{{ object_url }}&x=1', css_code='', js_code='')
        context = rendering.render_template(template, site, _request())
        self.assertIn('&x=1', context['qr_value'])
        self.assertNotIn('&amp;x=1', context['qr_value'])

    def test_custom_binding_object_data_is_also_escaped(self):
        site = Site.objects.create(name='Ordinary Name', slug='desc-site', description='<img src=x onerror=alert(1)>')
        template = QRTemplate(html_code="<div>{{ (object.description)|default('') }}</div>", qr_value='x', css_code='', js_code='')
        context = rendering.render_template(template, site, _request())
        self.assertNotIn('<img', context['body_html'])
        self.assertIn('&lt;img', context['body_html'])


class RenderPlaceholderTests(TestCase):
    def test_object_and_object_type_bindings_use_mock_strings(self):
        template = QRTemplate(html_code='<div>{{ object }} / {{ object_type.model }}</div>', qr_value='x', css_code='', js_code='')
        context = rendering.render_placeholder(template, _request())
        self.assertIn('Sample Object', context['body_html'])
        self.assertIn('object', context['body_html'])

    def test_custom_binding_falls_back_to_expression_text_when_undefined(self):
        # The placeholder object has no real fields, so a "custom" binding
        # referencing one (as text_content() generates for it) resolves via
        # its own default() fallback to the expression's own source text,
        # rather than rendering blank or raising.
        template = QRTemplate(
            html_code="<div>{{ (object.primary_ip)|default('object.primary_ip') }}</div>",
            qr_value='x', css_code='', js_code='',
        )
        context = rendering.render_placeholder(template, _request())
        self.assertIn('object.primary_ip', context['body_html'])

    def test_object_data_is_empty(self):
        template = QRTemplate(html_code='', qr_value='x', css_code='', js_code='')
        context = rendering.render_placeholder(template, _request())
        self.assertEqual(context['object_data'], {})


class SanitizeLayoutForContextTests(TestCase):
    """Covers the per-element failure isolation added so a single broken
    "custom"/"format" binding doesn't blank an entire label (all elements are
    otherwise combined into one Jinja2 template and rendered together)."""

    def _context(self):
        return {'object': None, 'object_type': None, 'object_url': '', 'object_data': {}}

    def test_failing_element_is_blanked_and_reported(self):
        layout = {'elements': [{'id': 'bad', 'type': 'text', 'binding': 'custom', 'expr': '1/0'}]}
        safe_layout, errors = rendering.sanitize_layout_for_context(layout, self._context())
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0][0], 'bad')
        self.assertIn('ZeroDivisionError', errors[0][1])
        blanked = safe_layout['elements'][0]
        self.assertEqual(blanked['binding'], 'static')
        self.assertEqual(blanked['text'], '')

    def test_working_elements_are_untouched_and_no_error_reported_for_them(self):
        layout = {'elements': [
            {'id': 'ok', 'type': 'text', 'binding': 'custom', 'expr': "'hello'"},
            {'id': 'bad', 'type': 'text', 'binding': 'custom', 'expr': '1/0'},
        ]}
        safe_layout, errors = rendering.sanitize_layout_for_context(layout, self._context())
        self.assertEqual([e[0] for e in errors], ['bad'])
        self.assertEqual(safe_layout['elements'][0], layout['elements'][0])

    def test_non_text_elements_are_never_touched(self):
        layout = {'elements': [{'id': 'q1', 'type': 'qr', 'correct_level': 'H'}]}
        safe_layout, errors = rendering.sanitize_layout_for_context(layout, self._context())
        self.assertEqual(errors, [])
        self.assertEqual(safe_layout['elements'][0], layout['elements'][0])

    def test_barcode_failing_custom_binding_is_blanked_and_reported_like_text(self):
        layout = {'elements': [{'id': 'bad', 'type': 'barcode', 'binding': 'custom', 'expr': '1/0'}]}
        safe_layout, errors = rendering.sanitize_layout_for_context(layout, self._context())
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0][0], 'bad')
        self.assertIn('ZeroDivisionError', errors[0][1])
        blanked = safe_layout['elements'][0]
        self.assertEqual(blanked['binding'], 'static')
        self.assertEqual(blanked['text'], '')

    def test_barcode_working_custom_binding_is_untouched(self):
        layout = {'elements': [{'id': 'ok', 'type': 'barcode', 'binding': 'custom', 'expr': "'12345'"}]}
        safe_layout, errors = rendering.sanitize_layout_for_context(layout, self._context())
        self.assertEqual(errors, [])
        self.assertEqual(safe_layout['elements'][0], layout['elements'][0])

    def test_barcode_object_binding_is_never_test_rendered(self):
        layout = {'elements': [{'id': 'b1', 'type': 'barcode', 'binding': 'object'}]}
        safe_layout, errors = rendering.sanitize_layout_for_context(layout, self._context())
        self.assertEqual(errors, [])

    def test_object_and_static_bindings_are_never_test_rendered(self):
        # Only "custom"/"format" bindings carry an admin-authored expression
        # that could raise — object/object_type/static are fixed, safe
        # Jinja2 source generated by text_content() itself.
        layout = {'elements': [{'id': 't1', 'type': 'text', 'binding': 'object'}]}
        safe_layout, errors = rendering.sanitize_layout_for_context(layout, self._context())
        self.assertEqual(errors, [])

    def test_does_not_mutate_the_original_layout(self):
        layout = {'elements': [{'id': 'bad', 'type': 'text', 'binding': 'custom', 'expr': '1/0'}]}
        original = copy.deepcopy(layout)
        rendering.sanitize_layout_for_context(layout, self._context())
        self.assertEqual(layout, original)

    def test_no_elements_key_returns_empty_safely(self):
        safe_layout, errors = rendering.sanitize_layout_for_context({}, self._context())
        self.assertEqual(errors, [])
        self.assertEqual(safe_layout.get('elements', []), [])
