from django.utils.translation import gettext_lazy as _
from netbox.choices import ButtonColorChoices
from netbox.plugins import PluginMenu, PluginMenuButton, PluginMenuItem

menu = PluginMenu(
    label=_('QR Коди'),
    icon_class='mdi mdi-qrcode',
    groups=(
        (_('QR Коди'), (
            PluginMenuItem(
                link='plugins:netbox_qr:qrtemplate_list',
                link_text=_('Templates'),
                permissions=['netbox_qr.view_qrtemplate'],
                buttons=(
                    PluginMenuButton(
                        link='plugins:netbox_qr:qrtemplate_add',
                        title=_('Add'),
                        icon_class='mdi mdi-plus-thick',
                        color=ButtonColorChoices.GREEN,
                        permissions=['netbox_qr.add_qrtemplate'],
                    ),
                ),
            ),
        )),
        (_('Configuration'), (
            PluginMenuItem(
                link='plugins:netbox_qr:settings',
                link_text=_('Settings'),
                permissions=['netbox_qr.change_qrtemplate'],
            ),
            PluginMenuItem(
                link='plugins:netbox_qr:qrsizepreset_list',
                link_text=_('Size Presets'),
                permissions=['netbox_qr.view_qrsizepreset'],
                buttons=(
                    PluginMenuButton(
                        link='plugins:netbox_qr:qrsizepreset_add',
                        title=_('Add'),
                        icon_class='mdi mdi-plus-thick',
                        color=ButtonColorChoices.GREEN,
                        permissions=['netbox_qr.add_qrsizepreset'],
                    ),
                ),
            ),
        )),
    ),
)
