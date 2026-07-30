from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import RequestFactory, TestCase

from dcim.models import Site
from netbox_labels.models import QRTemplate
from netbox_labels.views import _css_mm, _parse_dimension_mm, _redirect_back


class ParseDimensionMmTests(TestCase):
    """Regression tests: the design-save and preview endpoints both assign
    this straight onto a DecimalField without full_clean(), so a malformed
    value must never reach the database layer as a raw error."""

    def test_valid_value_is_parsed_and_quantized(self):
        self.assertEqual(_parse_dimension_mm('12.5', Decimal('1')), Decimal('12.5'))

    def test_non_numeric_falls_back(self):
        self.assertEqual(_parse_dimension_mm('not-a-number', Decimal('7')), Decimal('7'))

    def test_negative_or_zero_falls_back(self):
        self.assertEqual(_parse_dimension_mm('-5', Decimal('7')), Decimal('7'))
        self.assertEqual(_parse_dimension_mm('0', Decimal('7')), Decimal('7'))

    def test_out_of_range_falls_back(self):
        self.assertEqual(_parse_dimension_mm('999999999', Decimal('7')), Decimal('7'))

    def test_empty_or_none_falls_back(self):
        self.assertEqual(_parse_dimension_mm('', Decimal('7')), Decimal('7'))
        self.assertEqual(_parse_dimension_mm(None, Decimal('7')), Decimal('7'))


class CssMmTests(TestCase):
    def test_strips_trailing_zero(self):
        self.assertEqual(_css_mm(40), '40')

    def test_keeps_significant_decimal(self):
        self.assertEqual(_css_mm(215.9), '215.9')

    def test_decimal_input(self):
        self.assertEqual(_css_mm(Decimal('40.0')), '40')


class RedirectBackTests(TestCase):
    """Regression tests for the open-redirect fix: HTTP_REFERER is a
    client-supplied header and must be validated as a same-host/relative URL
    before being used as a redirect target."""

    def test_external_referer_is_rejected(self):
        request = RequestFactory().get('/', HTTP_REFERER='https://evil.example.com/phish')
        response = _redirect_back(request)
        self.assertEqual(response.url, '/')

    def test_relative_referer_is_used(self):
        request = RequestFactory().get('/', HTTP_REFERER='/dcim/devices/')
        response = _redirect_back(request)
        self.assertEqual(response.url, '/dcim/devices/')

    def test_missing_referer_falls_back_home(self):
        request = RequestFactory().get('/')
        response = _redirect_back(request)
        self.assertEqual(response.url, '/')


class QRRenderViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_superuser(username='qr-render-admin', email='', password='x')
        cls.site = Site.objects.create(name='Render Test Site', slug='render-test-site')
        cls.site_ct = ContentType.objects.get_for_model(Site)
        cls.template = QRTemplate.objects.create(
            name='Site label', slug='site-label', is_active=True,
            html_code='<div>{{ object }}</div>', qr_value='{{ object_url }}',
        )
        cls.template.object_types.set([cls.site_ct])

    def _url(self, template_id=None):
        return f'/plugins/labels/render/{self.site_ct.pk}/{self.site.pk}/{template_id or self.template.pk}/'

    def test_requires_login(self):
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 302)

    def test_renders_successfully_for_applicable_template(self):
        self.client.force_login(self.user)
        response = self.client.get(self._url())
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'id="netbox-qr-root"', response.content)
        self.assertIn(b'Render Test Site', response.content)

    def test_404_for_template_not_applicable_to_content_type(self):
        device_ct = ContentType.objects.get(app_label='dcim', model='device')
        other_template = QRTemplate.objects.create(name='Device only', slug='device-only', is_active=True)
        other_template.object_types.set([device_ct])
        self.client.force_login(self.user)
        response = self.client.get(self._url(template_id=other_template.pk))
        self.assertEqual(response.status_code, 404)

    def test_404_for_inactive_template(self):
        inactive = QRTemplate.objects.create(name='Inactive', slug='inactive', is_active=False)
        inactive.object_types.set([self.site_ct])
        self.client.force_login(self.user)
        response = self.client.get(self._url(template_id=inactive.pk))
        self.assertEqual(response.status_code, 404)

    def test_broken_binding_degrades_gracefully_instead_of_500(self):
        # Regression test: this view previously had no error handling at all
        # — a template that raises for a given object (e.g. a custom
        # expression assuming a field every object doesn't have) took down
        # the whole request with an unhandled 500.
        broken = QRTemplate.objects.create(
            name='Broken', slug='broken', is_active=True,
            html_code='<div>{{ 1 / 0 }}</div>', qr_value='x',
        )
        broken.object_types.set([self.site_ct])
        self.client.force_login(self.user)
        response = self.client.get(self._url(template_id=broken.pk))
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'id="netbox-qr-root"', response.content)
        # The raw exception must not be shown to an arbitrary viewer.
        self.assertNotIn(b'ZeroDivisionError', response.content)


class QRBulkPrintSheetViewTests(TestCase):
    """Regression tests for isolating one object's render failure from the
    rest of a bulk-print batch."""

    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_superuser(username='qr-bulk-admin', email='', password='x')
        cls.site_ct = ContentType.objects.get_for_model(Site)
        cls.good_site = Site.objects.create(name='Good Site', slug='good-site')
        cls.bad_site = Site.objects.create(name='Bad Site', slug='bad-site', description='trigger')
        cls.template = QRTemplate.objects.create(
            name='Conditional', slug='conditional', is_active=True,
            # Fails only for the site whose description is "trigger".
            html_code="<div>{{ 1 / (object.description != 'trigger') }}</div>",
            qr_value='x', width_mm=40, height_mm=12,
        )
        cls.template.object_types.set([cls.site_ct])

    def _post(self, object_ids):
        self.client.force_login(self.user)
        return self.client.post('/plugins/labels/bulk-print/sheet/', {
            'content_type_id': self.site_ct.pk,
            'template_id': self.template.pk,
            'page_format': 'A4',
            'object_id': object_ids,
        })

    def test_mixed_batch_skips_only_the_failing_object(self):
        response = self._post([self.good_site.pk, self.bad_site.pk])
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertEqual(content.count('netbox-qr-sheet-cell">'), 1)
        self.assertIn('Bad Site', content)  # named in the skipped-objects warning

    def test_all_objects_failing_redirects_with_message(self):
        response = self._post([self.bad_site.pk])
        self.assertEqual(response.status_code, 302)

    def test_all_objects_succeeding_renders_every_label(self):
        second_good = Site.objects.create(name='Second Good Site', slug='second-good-site')
        response = self._post([self.good_site.pk, second_good.pk])
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertEqual(content.count('netbox-qr-sheet-cell">'), 2)
        self.assertNotIn('could not be rendered', content)

    def test_no_valid_objects_redirects(self):
        response = self._post([])
        self.assertEqual(response.status_code, 302)


class QRTemplatePreviewViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_superuser(username='qr-preview-admin', email='', password='x')
        cls.plain_user = get_user_model().objects.create_user(username='qr-preview-plain', password='x')
        cls.template = QRTemplate.objects.create(name='Preview target', slug='preview-target', is_active=True)

    def test_requires_change_qrtemplate_permission(self):
        self.client.force_login(self.plain_user)
        response = self.client.post(
            f'/plugins/labels/templates/{self.template.pk}/design/preview/',
            {'layout_json': '{"elements": []}', 'width_mm': '40', 'height_mm': '12'},
        )
        self.assertEqual(response.status_code, 403)

    def test_superuser_gets_placeholder_preview(self):
        self.client.force_login(self.user)
        response = self.client.post(
            f'/plugins/labels/templates/{self.template.pk}/design/preview/',
            {'layout_json': '{"elements": []}', 'width_mm': '40', 'height_mm': '12'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'id="netbox-qr-root"', response.content)

    def test_invalid_layout_json_returns_bad_request(self):
        self.client.force_login(self.user)
        response = self.client.post(
            f'/plugins/labels/templates/{self.template.pk}/design/preview/',
            {'layout_json': 'not json', 'width_mm': '40', 'height_mm': '12'},
        )
        self.assertEqual(response.status_code, 400)
