from django import forms
from django.contrib.contenttypes.models import ContentType
from django.utils.translation import gettext_lazy as _
from netbox.forms import NetBoxModelFilterSetForm, NetBoxModelForm
from utilities.forms.fields import ContentTypeMultipleChoiceField, SlugField
from utilities.forms.rendering import FieldSet

from .models import QRSettings, QRSizePreset, QRTemplate


class QRTemplateForm(NetBoxModelForm):
    slug = SlugField()
    object_types = ContentTypeMultipleChoiceField(
        queryset=ContentType.objects.all(),
        required=False,
        label=_('Object types'),
    )

    fieldsets = (
        FieldSet('name', 'slug', 'description', 'is_active', 'tags', name=_('General')),
        FieldSet('applies_to_all', 'object_types', name=_('Applies To')),
        FieldSet('qr_value', 'width_mm', 'height_mm', name=_('QR Code')),
        FieldSet('html_code', 'css_code', 'js_code', name=_('Template')),
    )

    class Meta:
        model = QRTemplate
        fields = [
            'name', 'slug', 'description', 'is_active', 'applies_to_all', 'object_types',
            'qr_value', 'width_mm', 'height_mm', 'html_code', 'css_code', 'js_code', 'tags',
        ]
        widgets = {
            'html_code': forms.Textarea(attrs={'class': 'font-monospace', 'rows': 16}),
            'css_code': forms.Textarea(attrs={'class': 'font-monospace', 'rows': 10}),
            'js_code': forms.Textarea(attrs={'class': 'font-monospace', 'rows': 10}),
            'qr_value': forms.TextInput(attrs={'class': 'font-monospace'}),
        }

    def clean(self):
        super().clean()
        cleaned_data = self.cleaned_data
        if not cleaned_data.get('applies_to_all') and not cleaned_data.get('object_types'):
            raise forms.ValidationError({
                'object_types': _('Select at least one object type, or enable "apply to all object types".'),
            })
        return cleaned_data


class QRTemplateFilterForm(NetBoxModelFilterSetForm):
    model = QRTemplate

    fieldsets = (
        FieldSet('q', 'is_active', 'object_types'),
    )

    is_active = forms.NullBooleanField(
        required=False,
        widget=forms.Select(choices=[(None, '---------'), (True, _('Yes')), (False, _('No'))]),
    )
    object_types = ContentTypeMultipleChoiceField(
        queryset=ContentType.objects.all(),
        required=False,
    )


class QRSizePresetForm(NetBoxModelForm):
    fieldsets = (
        FieldSet('name', 'description', 'width_mm', 'height_mm', 'tags', name=_('Label Size Preset')),
    )

    class Meta:
        model = QRSizePreset
        fields = ['name', 'description', 'width_mm', 'height_mm', 'tags']


class QRSizePresetFilterForm(NetBoxModelFilterSetForm):
    model = QRSizePreset

    fieldsets = (
        FieldSet('q'),
    )


class QRSettingsForm(forms.ModelForm):
    class Meta:
        model = QRSettings
        fields = ['show_niimbot_button']
        widgets = {
            'show_niimbot_button': forms.CheckboxInput(),
        }
