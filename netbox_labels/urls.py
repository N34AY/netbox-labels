from django.urls import path
from django.views.i18n import JavaScriptCatalog
from netbox.views.generic import ObjectChangeLogView

from . import models, views

urlpatterns = (
    path('jsi18n/', JavaScriptCatalog.as_view(packages=['netbox_labels']), name='javascript_catalog'),
    path('settings/', views.QRSettingsView.as_view(), name='settings'),
    path('templates/', views.QRTemplateListView.as_view(), name='qrtemplate_list'),
    path('templates/add/', views.QRTemplateEditView.as_view(), name='qrtemplate_add'),
    path('templates/delete/', views.QRTemplateBulkDeleteView.as_view(), name='qrtemplate_bulk_delete'),
    path('templates/<int:pk>/', views.QRTemplateView.as_view(), name='qrtemplate'),
    path('templates/<int:pk>/edit/', views.QRTemplateEditView.as_view(), name='qrtemplate_edit'),
    path('templates/<int:pk>/delete/', views.QRTemplateDeleteView.as_view(), name='qrtemplate_delete'),
    path('templates/<int:pk>/design/', views.QRTemplateDesignView.as_view(), name='qrtemplate_design'),
    path('templates/<int:pk>/design/preview/', views.QRTemplatePreviewView.as_view(), name='qrtemplate_preview'),
    path('design/object-search/', views.QRTemplateObjectSearchView.as_view(), name='qrtemplate_object_search'),
    path(
        'templates/<int:pk>/changelog/',
        ObjectChangeLogView.as_view(),
        name='qrtemplate_changelog',
        kwargs={'model': models.QRTemplate},
    ),
    path('size-presets/', views.QRSizePresetListView.as_view(), name='qrsizepreset_list'),
    path('size-presets/add/', views.QRSizePresetEditView.as_view(), name='qrsizepreset_add'),
    path('size-presets/delete/', views.QRSizePresetBulkDeleteView.as_view(), name='qrsizepreset_bulk_delete'),
    path('size-presets/<int:pk>/', views.QRSizePresetView.as_view(), name='qrsizepreset'),
    path('size-presets/<int:pk>/edit/', views.QRSizePresetEditView.as_view(), name='qrsizepreset_edit'),
    path('size-presets/<int:pk>/delete/', views.QRSizePresetDeleteView.as_view(), name='qrsizepreset_delete'),
    path(
        'size-presets/<int:pk>/changelog/',
        ObjectChangeLogView.as_view(),
        name='qrsizepreset_changelog',
        kwargs={'model': models.QRSizePreset},
    ),
    path(
        'render/<int:object_type_id>/<int:object_id>/<int:template_id>/',
        views.QRRenderView.as_view(),
        name='render_qr',
    ),
    path('bulk-print/', views.QRBulkPrintView.as_view(), name='qrbulk_print'),
    path('bulk-print/sheet/', views.QRBulkPrintSheetView.as_view(), name='qrbulk_print_sheet'),
)
