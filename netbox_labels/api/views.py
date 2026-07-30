from netbox.api.viewsets import NetBoxModelViewSet

from .. import filtersets
from ..models import QRSizePreset, QRTemplate
from .serializers import QRSizePresetSerializer, QRTemplateSerializer


class QRTemplateViewSet(NetBoxModelViewSet):
    queryset = QRTemplate.objects.all()
    serializer_class = QRTemplateSerializer
    filterset_class = filtersets.QRTemplateFilterSet


class QRSizePresetViewSet(NetBoxModelViewSet):
    queryset = QRSizePreset.objects.all()
    serializer_class = QRSizePresetSerializer
    filterset_class = filtersets.QRSizePresetFilterSet
