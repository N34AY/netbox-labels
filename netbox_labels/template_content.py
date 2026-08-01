from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.urls import reverse
from netbox.plugins import PluginTemplateExtension

from .models import QRSettings, QRTemplate

# NetBox's plugin API has no wildcard hook for "every object type" — each model that
# should show the Labels panel on its detail page has to be named explicitly here.
PANEL_MODELS = (
    'dcim.device', 'dcim.devicetype', 'dcim.rack', 'dcim.location', 'dcim.site',
    'dcim.module', 'dcim.inventoryitem', 'dcim.cable', 'dcim.powerpanel', 'dcim.powerfeed',
    'virtualization.virtualmachine', 'ipam.prefix', 'ipam.ipaddress',
    'circuits.circuit', 'tenancy.tenant',
)


def _make_panel_extension(model_label):
    class QRObjectPanel(PluginTemplateExtension):
        models = [model_label]

        def right_page(self):
            obj = self.context['object']
            content_type = ContentType.objects.get_for_model(obj)
            qr_templates = QRTemplate.objects.filter(is_active=True).filter(
                Q(applies_to_all=True) | Q(object_types=content_type)
            ).distinct()
            if not qr_templates:
                return ''
            return self.render('netbox_labels/inc/object_qr_panel.html', extra_context={
                'qr_templates': qr_templates,
                'object_type_id': content_type.pk,
                'show_niimbot_button': QRSettings.load().show_niimbot_button,
            })

    QRObjectPanel.__name__ = f'QRObjectPanel_{model_label.replace(".", "_")}'
    return QRObjectPanel


def _make_list_button_extension(model_label):
    class QRListButton(PluginTemplateExtension):
        models = [model_label]

        def list_buttons(self):
            # NetBox's own list-buttons context stores the model class under
            # the 'object' key (same as the 'model' param passed to the
            # plugin_list_buttons template tag) despite what the base class
            # docstring says — see utilities/templatetags/plugins.py.
            model = self.context['object']
            content_type = ContentType.objects.get_for_model(model)
            # Not gated on show_niimbot_button: bulk printing via the browser's
            # own print dialog (the "Default printer" option on the bulk print
            # page) doesn't depend on that setting — only the direct
            # label-printer drivers (Niimbot/Zebra/ESC-POS) do.
            has_templates = QRTemplate.objects.filter(is_active=True).filter(
                Q(applies_to_all=True) | Q(object_types=content_type)
            ).exists()
            if not has_templates:
                return ''
            return self.render('netbox_labels/inc/bulk_print_button.html', extra_context={
                'content_type_id': content_type.pk,
                'bulk_print_url': reverse('plugins:netbox_labels:qrbulk_print'),
            })

    QRListButton.__name__ = f'QRListButton_{model_label.replace(".", "_")}'
    return QRListButton


template_extensions = (
    [_make_panel_extension(model_label) for model_label in PANEL_MODELS]
    + [_make_list_button_extension(model_label) for model_label in PANEL_MODELS]
)
