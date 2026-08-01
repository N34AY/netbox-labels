from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.urls import reverse
from django.utils.translation import gettext_lazy as _
from netbox.models import NetBoxModel

DEFAULT_WIDTH_MM = 40
DEFAULT_HEIGHT_MM = 12


class QRTemplate(NetBoxModel):
    name = models.CharField(
        max_length=200,
        unique=True,
        verbose_name=_('name'),
    )
    slug = models.SlugField(
        max_length=200,
        unique=True,
        verbose_name=_('slug'),
    )
    description = models.CharField(
        max_length=500,
        blank=True,
        verbose_name=_('description'),
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name=_('active'),
        help_text=_('Inactive templates are not offered on object detail pages or renderable.'),
    )
    applies_to_all = models.BooleanField(
        default=False,
        verbose_name=_('apply to all object types'),
        help_text=_('Make this template available for every object type, ignoring the selection below.'),
    )
    object_types = models.ManyToManyField(
        to=ContentType,
        related_name='+',
        blank=True,
        verbose_name=_('object types'),
        help_text=_('The object type(s) this template applies to (ignored if "apply to all" is enabled).'),
    )
    qr_value = models.CharField(
        max_length=500,
        default='{{ object_url }}',
        verbose_name=_('QR code value'),
        help_text=_('Jinja2 template for the data encoded in the QR code.'),
    )
    width_mm = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        default=DEFAULT_WIDTH_MM,
        verbose_name=_('width (mm)'),
        help_text=_('Physical label width. Used as the default canvas size in the visual designer.'),
    )
    height_mm = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        default=DEFAULT_HEIGHT_MM,
        verbose_name=_('height (mm)'),
        help_text=_('Physical label height. Used as the default canvas size in the visual designer.'),
    )
    html_code = models.TextField(
        blank=True,
        verbose_name=_('HTML'),
        help_text=_('Jinja2 + HTML. Add <div data-netbox-qr></div> where the QR code image should appear.'),
    )
    css_code = models.TextField(
        blank=True,
        verbose_name=_('CSS'),
    )
    js_code = models.TextField(
        blank=True,
        verbose_name=_('JavaScript'),
        help_text=_('Runs after the QR code has been drawn. window.NetBoxQR is available.'),
    )
    layout = models.JSONField(
        blank=True,
        null=True,
        verbose_name=_('layout'),
        help_text=_('Visual designer elements. Populated by the visual designer.'),
    )

    class Meta:
        ordering = ('name',)
        verbose_name = _('label template')
        verbose_name_plural = _('label templates')

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse('plugins:netbox_labels:qrtemplate', args=[self.pk])

    def applies_to(self, content_type):
        return self.applies_to_all or self.object_types.filter(pk=content_type.pk).exists()


class QRSizePreset(NetBoxModel):
    """A named label size (mm), offered as a quick pick in the visual designer."""

    name = models.CharField(
        max_length=200,
        unique=True,
        verbose_name=_('name'),
    )
    description = models.CharField(
        max_length=500,
        blank=True,
        verbose_name=_('description'),
    )
    width_mm = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        verbose_name=_('width (mm)'),
    )
    height_mm = models.DecimalField(
        max_digits=6,
        decimal_places=1,
        verbose_name=_('height (mm)'),
    )

    class Meta:
        ordering = ('name',)
        verbose_name = _('label size preset')
        verbose_name_plural = _('label size presets')

    def __str__(self):
        return f'{self.name} ({self.width_mm} × {self.height_mm}mm)'

    def get_absolute_url(self):
        return reverse('plugins:netbox_labels:qrsizepreset', args=[self.pk])


class QRSettings(models.Model):
    """Singleton model for plugin-wide label settings."""

    show_niimbot_button = models.BooleanField(
        default=True,
        verbose_name=_('show "Print via…" button'),
        help_text=_(
            'Offer direct printing to a label printer (Niimbot, Zebra/ZPL, or generic ESC/POS, '
            'over Bluetooth or USB) on rendered labels.'
        ),
    )

    class Meta:
        verbose_name = _('label settings')
        verbose_name_plural = _('label settings')

    def __str__(self):
        return 'Label Settings'

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(pk=1)
        return obj
