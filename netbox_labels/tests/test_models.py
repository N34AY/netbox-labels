from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from netbox_labels.models import QRSettings, QRTemplate


class QRTemplateAppliesToTests(TestCase):
    def setUp(self):
        self.site_ct = ContentType.objects.get(app_label='dcim', model='site')
        self.device_ct = ContentType.objects.get(app_label='dcim', model='device')

    def test_applies_to_all_matches_any_type(self):
        template = QRTemplate.objects.create(name='All', slug='all', applies_to_all=True)
        self.assertTrue(template.applies_to(self.site_ct))
        self.assertTrue(template.applies_to(self.device_ct))

    def test_applies_to_specific_type_only(self):
        template = QRTemplate.objects.create(name='Sites only', slug='sites-only', applies_to_all=False)
        template.object_types.set([self.site_ct])
        self.assertTrue(template.applies_to(self.site_ct))
        self.assertFalse(template.applies_to(self.device_ct))

    def test_applies_to_no_types_matches_nothing(self):
        template = QRTemplate.objects.create(name='None', slug='none', applies_to_all=False)
        self.assertFalse(template.applies_to(self.site_ct))


class QRSettingsSingletonTests(TestCase):
    def test_load_creates_singleton_on_first_call(self):
        self.assertEqual(QRSettings.objects.count(), 0)
        settings = QRSettings.load()
        self.assertEqual(settings.pk, 1)
        self.assertEqual(QRSettings.objects.count(), 1)

    def test_load_returns_same_row_on_repeated_calls(self):
        first = QRSettings.load()
        first.show_niimbot_button = False
        first.save()
        second = QRSettings.load()
        self.assertEqual(second.pk, first.pk)
        self.assertFalse(second.show_niimbot_button)
        self.assertEqual(QRSettings.objects.count(), 1)
