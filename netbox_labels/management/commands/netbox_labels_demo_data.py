from django.contrib.contenttypes.models import ContentType
from django.core.management.base import BaseCommand

from dcim.models import Device, DeviceRole, DeviceType, Manufacturer, Site
from netbox_labels.layout import layout_to_css, layout_to_html
from netbox_labels.models import QRTemplate

# Marks every record this command creates, so --flush can find them again
# without touching anything the user created themselves.
DEMO_MARKER = 'netbox_labels demo data'

SITE_NAMES = ['Acme HQ', 'Acme West DC', 'Acme East DC', 'Acme Test Lab']
DEVICE_COUNT = 4

TEMPLATE_LAYOUT = {
    'elements': [
        {
            'id': 'qr-1', 'type': 'qr',
            'x_mm': 0.6, 'y_mm': 0.6, 'width_mm': 10.5, 'height_mm': 10.5,
            'correct_level': 'L',
        },
        {
            'id': 'text-1', 'type': 'text',
            'x_mm': 12, 'y_mm': 1, 'width_mm': 27, 'height_mm': 4,
            'binding': 'object_type', 'font_size_mm': 2.1, 'font_weight': 'normal',
            'color': '#333333', 'text_align': 'left', 'text_transform': 'uppercase',
            'letter_spacing_mm': 0.1,
        },
        {
            'id': 'text-2', 'type': 'text',
            'x_mm': 12, 'y_mm': 5, 'width_mm': 27, 'height_mm': 5,
            'binding': 'object', 'font_size_mm': 3.1, 'font_weight': 'bold',
            'color': '#000000', 'text_align': 'left', 'text_transform': 'none',
            'letter_spacing_mm': 0,
        },
        {
            'id': 'text-3', 'type': 'text',
            'x_mm': 2, 'y_mm': 14, 'width_mm': 56, 'height_mm': 4,
            'binding': 'static', 'text': 'ACME CORP', 'font_size_mm': 5, 'font_weight': 'bold',
            'color': '#000000', 'text_align': 'left', 'text_transform': 'none',
            'letter_spacing_mm': 0,
        },
    ],
}
TEMPLATE_WIDTH_MM = 60
TEMPLATE_HEIGHT_MM = 30


class Command(BaseCommand):
    help = (
        'Creates (or removes, with --flush) a small set of clearly-fake demo objects '
        '(a manufacturer, device type/role, sites, and devices, all named "Acme ...") '
        'plus a couple of QR templates, so the plugin has something to try out or '
        'screenshot without touching real data. Safe to re-run — existing demo objects '
        'are reused rather than duplicated.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--flush', action='store_true',
            help='Remove previously-created demo data instead of creating it.',
        )

    def handle(self, *args, **options):
        if options['flush']:
            self._flush()
            return

        manufacturer, _created = Manufacturer.objects.get_or_create(
            name='Acme Manufacturing', defaults={'slug': 'acme-manufacturing', 'description': DEMO_MARKER},
        )
        device_type, _created = DeviceType.objects.get_or_create(
            manufacturer=manufacturer, model='Acme Switch 24',
            defaults={'slug': 'acme-switch-24', 'u_height': 1, 'description': DEMO_MARKER},
        )
        device_role, _created = DeviceRole.objects.get_or_create(
            name='Acme Access Switch',
            defaults={'slug': 'acme-access-switch', 'color': '2196f3', 'description': DEMO_MARKER},
        )

        sites = []
        for name in SITE_NAMES:
            slug = name.lower().replace(' ', '-')
            site, _created = Site.objects.get_or_create(
                name=name, defaults={'slug': slug, 'status': 'active', 'description': DEMO_MARKER},
            )
            sites.append(site)
        device_site = sites[0]

        for i in range(1, DEVICE_COUNT + 1):
            name = f'acme-sw-{i:02d}'
            Device.objects.get_or_create(
                name=name, site=device_site,
                defaults={
                    'device_type': device_type, 'role': device_role, 'status': 'active',
                    'description': DEMO_MARKER,
                },
            )

        site_ct = ContentType.objects.get_for_model(Site)
        device_ct = ContentType.objects.get_for_model(Device)

        site_template, _created = QRTemplate.objects.get_or_create(
            slug='demo-site-label',
            defaults={
                'name': 'Demo: Site Label',
                'description': DEMO_MARKER,
                'width_mm': TEMPLATE_WIDTH_MM,
                'height_mm': TEMPLATE_HEIGHT_MM,
                'layout': TEMPLATE_LAYOUT,
                'html_code': layout_to_html(TEMPLATE_LAYOUT, TEMPLATE_WIDTH_MM, TEMPLATE_HEIGHT_MM),
                'css_code': layout_to_css(TEMPLATE_LAYOUT, TEMPLATE_WIDTH_MM, TEMPLATE_HEIGHT_MM),
            },
        )
        site_template.object_types.set([site_ct])

        device_template, _created = QRTemplate.objects.get_or_create(
            slug='demo-device-label',
            defaults={
                'name': 'Demo: Device Label',
                'description': DEMO_MARKER,
                'width_mm': TEMPLATE_WIDTH_MM,
                'height_mm': TEMPLATE_HEIGHT_MM,
                'layout': TEMPLATE_LAYOUT,
                'html_code': layout_to_html(TEMPLATE_LAYOUT, TEMPLATE_WIDTH_MM, TEMPLATE_HEIGHT_MM),
                'css_code': layout_to_css(TEMPLATE_LAYOUT, TEMPLATE_WIDTH_MM, TEMPLATE_HEIGHT_MM),
            },
        )
        device_template.object_types.set([device_ct])

        self.stdout.write(self.style.SUCCESS(
            f'Created/verified {len(sites)} sites, {DEVICE_COUNT} devices, and 2 QR templates '
            f'("{site_template.name}", "{device_template.name}").'
        ))

    def _flush(self):
        templates, _n = QRTemplate.objects.filter(description=DEMO_MARKER).delete()
        devices, _n = Device.objects.filter(description=DEMO_MARKER).delete()
        sites, _n = Site.objects.filter(description=DEMO_MARKER).delete()
        device_types, _n = DeviceType.objects.filter(description=DEMO_MARKER).delete()
        device_roles, _n = DeviceRole.objects.filter(description=DEMO_MARKER).delete()
        manufacturers, _n = Manufacturer.objects.filter(description=DEMO_MARKER).delete()
        self.stdout.write(self.style.SUCCESS('Removed demo data.'))
