from django.contrib.contenttypes.models import ContentType
from netbox.api.fields import ContentTypeField
from netbox.api.serializers import NetBoxModelSerializer

from ..models import QRSizePreset, QRTemplate


class QRTemplateSerializer(NetBoxModelSerializer):
    object_types = ContentTypeField(
        queryset=ContentType.objects.all(),
        many=True,
        required=False,
    )

    class Meta:
        model = QRTemplate
        fields = [
            'id', 'url', 'display_url', 'display', 'name', 'slug', 'description', 'is_active',
            'applies_to_all', 'object_types', 'qr_value', 'width_mm', 'height_mm', 'html_code',
            'css_code', 'js_code', 'layout', 'tags', 'custom_fields', 'created', 'last_updated',
        ]
        brief_fields = ('id', 'url', 'display', 'name', 'slug')


class QRSizePresetSerializer(NetBoxModelSerializer):
    class Meta:
        model = QRSizePreset
        fields = [
            'id', 'url', 'display_url', 'display', 'name', 'description', 'width_mm', 'height_mm',
            'tags', 'custom_fields', 'created', 'last_updated',
        ]
        brief_fields = ('id', 'url', 'display', 'name', 'width_mm', 'height_mm')
