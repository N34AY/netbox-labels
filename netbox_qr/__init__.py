from netbox.plugins import PluginConfig


class QRConfig(PluginConfig):
    name = 'netbox_qr'
    verbose_name = 'NetBox QR'
    author = 'Dmytro Penziakov'
    description = 'Generate scannable QR codes for NetBox objects from admin-defined HTML/CSS/JS templates'
    version = '0.1.0'
    base_url = 'qr'
    min_version = '4.5.0'


config = QRConfig
