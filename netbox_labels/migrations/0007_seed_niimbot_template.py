from django.db import migrations

SLUG = 'niimbot-d110-label'

HTML_CODE = (
    '<div style="position:relative;width:40.0mm;height:12.0mm;overflow:hidden;background:#ffffff;">'
    '<div data-netbox-qr data-width="300" data-height="300" data-correct-level="L" '
    'style="position:absolute;left:0.6mm;top:0.6mm;width:10.5mm;height:10.5mm;background:#fff;"></div>'
    '<div style="position:absolute;left:12.0mm;top:1.0mm;width:27.0mm;height:4.0mm;font-size:2.1mm;'
    'font-weight:normal;color:#333333;text-align:left;text-transform:uppercase;letter-spacing:0.1mm;'
    'overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-family:Arial,Helvetica,sans-serif;">'
    '{{ object_type.model }}</div>'
    '<div style="position:absolute;left:12.0mm;top:5.0mm;width:27.0mm;height:5.0mm;font-size:3.1mm;'
    'font-weight:bold;color:#000000;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;'
    'font-family:Arial,Helvetica,sans-serif;">{{ object }}</div>'
    '</div>'
)

CSS_CODE = '@page { size: 40.0mm 12.0mm; margin: 0; }\nhtml, body { width: 40.0mm; height: 12.0mm; }'

LAYOUT = {
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
    ],
}


def seed_template(apps, schema_editor):
    QRTemplate = apps.get_model('netbox_labels', 'QRTemplate')
    ContentType = apps.get_model('contenttypes', 'ContentType')

    if QRTemplate.objects.filter(slug=SLUG).exists():
        return

    template = QRTemplate.objects.create(
        name='Niimbot D110 Label (40x12mm)',
        slug=SLUG,
        description=(
            'Compact label for the Niimbot D110 (12mm print height, 40mm length). '
            'Works for devices and cables.'
        ),
        is_active=True,
        applies_to_all=False,
        qr_value='{{ object_url }}',
        width_mm=40,
        height_mm=12,
        html_code=HTML_CODE,
        css_code=CSS_CODE,
        js_code='',
        layout=LAYOUT,
    )
    object_types = ContentType.objects.filter(
        app_label='dcim', model__in=['device', 'cable'],
    )
    template.object_types.set(object_types)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('contenttypes', '0002_remove_content_type_name'),
        ('netbox_labels', '0006_seed_size_presets'),
    ]

    operations = [
        migrations.RunPython(seed_template, noop),
    ]
