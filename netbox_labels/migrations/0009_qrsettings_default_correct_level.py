from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('netbox_labels', '0008_qrsettings_custom_object_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='qrsettings',
            name='default_correct_level',
            field=models.CharField(
                choices=[
                    ('auto', 'Auto (recommended) — let each template/element choose its own level'),
                    ('L', 'L — least redundant, smallest modules'),
                    ('M', 'M'),
                    ('Q', 'Q'),
                    ('H', 'H — most redundant, most damage-resistant'),
                ],
                default='auto',
                max_length=4,
            ),
        ),
    ]
