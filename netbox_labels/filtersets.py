import django_filters
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from netbox.filtersets import NetBoxModelFilterSet

from .models import QRSizePreset, QRTemplate


class QRTemplateFilterSet(NetBoxModelFilterSet):
    object_types = django_filters.ModelMultipleChoiceFilter(
        queryset=ContentType.objects.all(),
        label=_('Object types'),
    )

    class Meta:
        model = QRTemplate
        fields = ['id', 'name', 'slug', 'is_active', 'applies_to_all', 'object_types', 'width_mm', 'height_mm']

    def search(self, queryset, name, value):
        if not value.strip():
            return queryset
        return queryset.filter(name__icontains=value)


class QRSizePresetFilterSet(NetBoxModelFilterSet):
    class Meta:
        model = QRSizePreset
        fields = ['id', 'name', 'width_mm', 'height_mm']

    def search(self, queryset, name, value):
        if not value.strip():
            return queryset
        return queryset.filter(name__icontains=value)
