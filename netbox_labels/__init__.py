from netbox.plugins import PluginConfig


class LabelsConfig(PluginConfig):
    name = 'netbox_labels'
    verbose_name = 'NetBox Labels'
    author = 'Dmytro Penziakov'
    description = 'Generate scannable QR code labels for NetBox objects from admin-defined HTML/CSS/JS templates'
    version = '0.1.0'
    base_url = 'labels'
    min_version = '4.5.0'


config = LabelsConfig
