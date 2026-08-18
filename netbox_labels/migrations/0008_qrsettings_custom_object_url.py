from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('netbox_labels', '0007_seed_niimbot_template'),
    ]

    operations = [
        migrations.AddField(
            model_name='qrsettings',
            name='custom_object_url',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
    ]
