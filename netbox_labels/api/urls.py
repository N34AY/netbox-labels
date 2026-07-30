from netbox.api.routers import NetBoxRouter

from . import views

router = NetBoxRouter()
router.register('templates', views.QRTemplateViewSet)
router.register('size-presets', views.QRSizePresetViewSet)

urlpatterns = router.urls
