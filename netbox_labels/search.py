from netbox.search import SearchIndex, register_search

from .models import QRTemplate


@register_search
class QRTemplateIndex(SearchIndex):
    model = QRTemplate
    fields = (
        ('name', 100),
        ('slug', 200),
        ('description', 500),
    )
