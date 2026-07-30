from django.db import migrations

PRESETS = [
    ('Niimbot D110', '', 40, 12),
    ('30 x 15mm', '', 30, 15),
    ('40 x 30mm', '', 40, 30),
    ('50 x 30mm', '', 50, 30),
    ('50 x 80mm', '', 50, 80),
]


def seed_presets(apps, schema_editor):
    QRSizePreset = apps.get_model('netbox_qr', 'QRSizePreset')
    for name, description, width_mm, height_mm in PRESETS:
        QRSizePreset.objects.get_or_create(
            name=name,
            defaults={'description': description, 'width_mm': width_mm, 'height_mm': height_mm},
        )


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('netbox_qr', '0005_qrsizepreset'),
    ]

    operations = [
        migrations.RunPython(seed_presets, noop),
    ]
