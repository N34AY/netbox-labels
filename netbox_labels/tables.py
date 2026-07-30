import django_tables2 as tables
from django.utils.translation import gettext_lazy as _
from netbox.tables import NetBoxTable, columns

from .models import QRSizePreset, QRTemplate

DESIGN_BUTTON = """
{% load i18n %}
{% if perms.netbox_labels.change_qrtemplate %}
<a href="{% url 'plugins:netbox_labels:qrtemplate_design' record.pk %}" title="{% trans 'Design visually' %}" class="btn btn-primary btn-sm">
  <i class="mdi mdi-palette" aria-hidden="true"></i>
</a>
{% endif %}
"""


class QRTemplateTable(NetBoxTable):
    name = tables.Column(
        linkify=True,
        verbose_name=_('Name'),
    )
    object_types = columns.ContentTypesColumn(
        verbose_name=_('Object Types'),
    )
    applies_to_all = columns.BooleanColumn(
        verbose_name=_('All Types'),
    )
    is_active = columns.BooleanColumn(
        verbose_name=_('Active'),
    )
    width_mm = tables.Column(
        verbose_name=_('Width (mm)'),
    )
    height_mm = tables.Column(
        verbose_name=_('Height (mm)'),
    )
    tags = columns.TagColumn()
    actions = columns.ActionsColumn(
        extra_buttons=DESIGN_BUTTON,
    )

    class Meta(NetBoxTable.Meta):
        model = QRTemplate
        fields = (
            'pk', 'id', 'name', 'slug', 'description', 'object_types', 'applies_to_all',
            'is_active', 'width_mm', 'height_mm', 'tags', 'created', 'last_updated', 'actions',
        )
        default_columns = (
            'pk', 'name', 'object_types', 'applies_to_all', 'is_active',
        )


class QRSizePresetTable(NetBoxTable):
    name = tables.Column(
        linkify=True,
        verbose_name=_('Name'),
    )
    width_mm = tables.Column(
        verbose_name=_('Width (mm)'),
    )
    height_mm = tables.Column(
        verbose_name=_('Height (mm)'),
    )
    tags = columns.TagColumn()

    class Meta(NetBoxTable.Meta):
        model = QRSizePreset
        fields = (
            'pk', 'id', 'name', 'description', 'width_mm', 'height_mm', 'tags', 'created', 'last_updated', 'actions',
        )
        default_columns = (
            'pk', 'name', 'width_mm', 'height_mm',
        )
