import json
import re
from decimal import Decimal, InvalidOperation

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.contrib.contenttypes.models import ContentType
from django.db.models import Q
from django.http import Http404, HttpResponseBadRequest, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.html import escape
from django.utils.translation import gettext_lazy as _
from django.views import View
from netbox.views import generic
from utilities.views import safe_for_redirect

from . import filtersets, forms, rendering, tables
from .layout import layout_to_css, layout_to_html
from .models import QRSettings, QRSizePreset, QRTemplate


def _redirect_back(request):
    """Redirect back to the referring page after a form error, without trusting
    HTTP_REFERER blindly — it's a client-supplied header, so it's validated as a
    same-host/relative URL first (same check NetBox's own GetReturnURLMixin uses
    for its return_url parameter) to avoid an open redirect."""
    referer = request.META.get('HTTP_REFERER')
    if referer and safe_for_redirect(referer):
        return redirect(referer)
    return redirect('home')

# Standard printer page formats offered for bulk-printing a full sheet of
# labels via the browser's own print dialog (as opposed to the label-printer
# drivers, which print one physical label per job). CSS 'size' keywords
# (a4/a5/letter/legal) are used for @page; the mm dimensions here are only
# for laying out the label grid itself, so a 10mm margin is assumed on
# every side regardless of what the print dialog's own margin is set to.
PAGE_FORMATS = {
    'A4': {'label': 'A4 (210 × 297 mm)', 'css_size': 'a4', 'width_mm': 210, 'height_mm': 297},
    'A5': {'label': 'A5 (148 × 210 mm)', 'css_size': 'a5', 'width_mm': 148, 'height_mm': 210},
    'LETTER': {'label': 'Letter (215.9 × 279.4 mm)', 'css_size': 'letter', 'width_mm': 215.9, 'height_mm': 279.4},
    'LEGAL': {'label': 'Legal (215.9 × 355.6 mm)', 'css_size': 'legal', 'width_mm': 215.9, 'height_mm': 355.6},
}
PAGE_MARGIN_MM = 10


def _css_mm(value):
    """Format a number for use as a raw CSS length (e.g. in a <style> block
    built with plain {{ }} interpolation, not a length-aware template tag).
    Rendering a Decimal/float directly would go through Django's locale-aware
    number formatting, which for uk uses a comma decimal separator (e.g.
    "40,0") — invalid CSS. This always produces a plain period-decimal string
    with no unnecessary trailing zeros (40.0 -> "40", 215.9 -> "215.9")."""
    return f'{float(value):g}'


# Matches QRTemplate.width_mm/height_mm (DecimalField, max_digits=6, decimal_places=1).
_MAX_DIMENSION_MM = Decimal('99999.9')


def _parse_dimension_mm(raw, fallback):
    """Parse a POSTed width_mm/height_mm value into something safe to assign
    directly to a QRTemplate field. save() doesn't call full_clean(), so an
    out-of-range or non-numeric value posted straight to this endpoint (bypassing
    the designer UI's own numeric input) would otherwise reach the database layer
    as a raw decimal.InvalidOperation/DataError instead of being handled here."""
    if not raw:
        return fallback
    try:
        value = Decimal(str(raw)).quantize(Decimal('0.1'))
    except (InvalidOperation, ValueError):
        return fallback
    if value <= 0 or value > _MAX_DIMENSION_MM:
        return fallback
    return value

DEFAULT_LAYOUT = {
    'elements': [
        {
            'id': 'qr-1', 'type': 'qr',
            'x_mm': 0.6, 'y_mm': 0.6, 'width_mm': 10.5, 'height_mm': 10.5,
            'correct_level': 'L',
        },
        {
            'id': 'text-1', 'type': 'text',
            'x_mm': 12, 'y_mm': 1, 'width_mm': 27, 'height_mm': 4,
            'binding': 'object_type', 'font_size_mm': 2.1, 'font_weight': 'normal',
            'color': '#333333', 'text_align': 'left', 'text_transform': 'uppercase',
            'letter_spacing_mm': 0.1,
        },
        {
            'id': 'text-2', 'type': 'text',
            'x_mm': 12, 'y_mm': 5, 'width_mm': 27, 'height_mm': 5,
            'binding': 'object', 'font_size_mm': 3.1, 'font_weight': 'bold',
            'color': '#000000', 'text_align': 'left', 'text_transform': 'none',
            'letter_spacing_mm': 0,
        },
    ],
}


class QRTemplateListView(generic.ObjectListView):
    queryset = QRTemplate.objects.all()
    filterset = filtersets.QRTemplateFilterSet
    filterset_form = forms.QRTemplateFilterForm
    table = tables.QRTemplateTable


class QRTemplateView(generic.ObjectView):
    queryset = QRTemplate.objects.all()


class QRTemplateEditView(generic.ObjectEditView):
    queryset = QRTemplate.objects.all()
    form = forms.QRTemplateForm
    template_name = 'netbox_labels/qrtemplate_edit.html'


class QRTemplateDeleteView(generic.ObjectDeleteView):
    queryset = QRTemplate.objects.all()


class QRTemplateBulkDeleteView(generic.BulkDeleteView):
    queryset = QRTemplate.objects.all()
    filterset = filtersets.QRTemplateFilterSet
    table = tables.QRTemplateTable


class QRSizePresetListView(generic.ObjectListView):
    queryset = QRSizePreset.objects.all()
    filterset = filtersets.QRSizePresetFilterSet
    filterset_form = forms.QRSizePresetFilterForm
    table = tables.QRSizePresetTable


class QRSizePresetView(generic.ObjectView):
    queryset = QRSizePreset.objects.all()


class QRSizePresetEditView(generic.ObjectEditView):
    queryset = QRSizePreset.objects.all()
    form = forms.QRSizePresetForm


class QRSizePresetDeleteView(generic.ObjectDeleteView):
    queryset = QRSizePreset.objects.all()


class QRSizePresetBulkDeleteView(generic.BulkDeleteView):
    queryset = QRSizePreset.objects.all()
    filterset = filtersets.QRSizePresetFilterSet
    table = tables.QRSizePresetTable


class QRTemplateDesignView(LoginRequiredMixin, PermissionRequiredMixin, View):
    """No-code drag/resize designer: edits QRTemplate.layout and (re)generates html_code/css_code from it."""

    permission_required = 'netbox_labels.change_qrtemplate'

    def get(self, request, pk):
        qr_template = get_object_or_404(QRTemplate, pk=pk)
        layout = qr_template.layout or DEFAULT_LAYOUT
        if qr_template.applies_to_all:
            object_type_choices = list(
                ContentType.objects.filter(app_label__in=PREVIEW_APP_LABELS).order_by('app_label', 'model')
            )
        else:
            object_type_choices = list(qr_template.object_types.order_by('app_label', 'model'))
        return render(request, 'netbox_labels/qrtemplate_design.html', {
            'object': qr_template,
            'layout': layout,
            'object_type_choices': object_type_choices,
            'size_presets': QRSizePreset.objects.all(),
        })

    def post(self, request, pk):
        qr_template = get_object_or_404(QRTemplate, pk=pk)
        try:
            layout = json.loads(request.POST.get('layout_json', ''))
        except ValueError:
            messages.error(request, _('Could not parse the submitted layout.'))
            return redirect('plugins:netbox_labels:qrtemplate_design', pk=qr_template.pk)

        qr_template.width_mm = _parse_dimension_mm(request.POST.get('width_mm'), qr_template.width_mm)
        qr_template.height_mm = _parse_dimension_mm(request.POST.get('height_mm'), qr_template.height_mm)
        qr_template.layout = layout
        qr_template.html_code = layout_to_html(layout, qr_template.width_mm, qr_template.height_mm)
        qr_template.css_code = layout_to_css(layout, qr_template.width_mm, qr_template.height_mm)
        qr_template.save()
        messages.success(request, _('Design saved.'))
        return redirect('plugins:netbox_labels:qrtemplate', pk=qr_template.pk)


# Curated set of apps offered for the design page's "preview with a real
# object" picker when a template applies to all object types (there's no
# NetBox API for "every content type that makes sense to preview").
PREVIEW_APP_LABELS = ('dcim', 'virtualization', 'ipam', 'circuits', 'tenancy')


class QRTemplateObjectSearchView(LoginRequiredMixin, PermissionRequiredMixin, View):
    """JSON endpoint backing the design page's real-object preview picker."""

    permission_required = 'netbox_labels.change_qrtemplate'

    def get(self, request):
        content_type = get_object_or_404(ContentType, pk=request.GET.get('content_type_id'))
        model = content_type.model_class()
        if model is None:
            raise Http404

        queryset = model.objects.restrict(request.user, 'view')
        query = request.GET.get('q', '').strip()
        if query:
            field_names = {f.name for f in model._meta.get_fields()}
            if 'name' in field_names:
                queryset = queryset.filter(name__icontains=query)
            elif 'label' in field_names:
                queryset = queryset.filter(label__icontains=query)
            elif query.isdigit():
                queryset = queryset.filter(pk=query)

        results = [{'id': obj.pk, 'display': str(obj)} for obj in queryset[:20]]
        return JsonResponse({'results': results})


class QRTemplatePreviewView(LoginRequiredMixin, PermissionRequiredMixin, View):
    """Renders the design page's in-progress (possibly unsaved) layout, either
    against placeholder data or a real object the user picked."""

    permission_required = 'netbox_labels.change_qrtemplate'

    def post(self, request, pk):
        qr_template = get_object_or_404(QRTemplate, pk=pk)
        try:
            layout = json.loads(request.POST.get('layout_json', ''))
        except ValueError:
            return HttpResponseBadRequest('Invalid layout JSON.')

        width_mm = request.POST.get('width_mm') or qr_template.width_mm
        height_mm = request.POST.get('height_mm') or qr_template.height_mm
        html_code = layout_to_html(layout, width_mm, height_mm)
        css_code = layout_to_css(layout, width_mm, height_mm)
        qr_value = request.POST.get('qr_value') or qr_template.qr_value

        content_type_id = request.POST.get('content_type_id')
        object_id = request.POST.get('object_id')

        preview_template = QRTemplate(html_code=html_code, css_code=css_code, qr_value=qr_value)
        is_real_object = bool(content_type_id and object_id)

        # A broken binding (bad Jinja2 syntax, a typo'd attribute chain that
        # raises instead of resolving to Undefined, etc.) would otherwise
        # bubble up as an unhandled exception here — a 500 page with no
        # label and no indication of what's wrong. Since this view only ever
        # backs the designer's own live preview (never an actual printed
        # label), it's caught and surfaced in the response instead, so the
        # preview can show the user exactly what broke. Only surfaced for a
        # real-object preview though: against placeholder data, an
        # expression that's actually fine for a real object (e.g. one
        # involving an attribute the placeholder object doesn't have) can
        # easily raise in ways that don't mean anything is really wrong —
        # already-Undefined attribute access is handled gracefully (see
        # layout.py's default() fallback), but not every possible failure
        # mode is, so a genuinely broken expression is confirmed against
        # real data rather than flagged as an error against fake data.
        render_error = None
        try:
            if is_real_object:
                content_type = get_object_or_404(ContentType, pk=content_type_id)
                model = content_type.model_class()
                if model is None:
                    raise Http404
                instance = get_object_or_404(model.objects.restrict(request.user, 'view'), pk=object_id)
                context = rendering.render_template(preview_template, instance, request)
            else:
                context = rendering.render_placeholder(preview_template, request)
        except Http404:
            raise
        except Exception as e:
            # Still caught (never a 500) either way — only surfaced as a
            # visible error for a real-object preview; for placeholder data
            # it just falls back to a blank label, same as before this
            # error-reporting existed.
            if is_real_object:
                render_error = f'{e.__class__.__name__}: {e}'
            context = {'qr_value': '', 'body_html': '', 'css_code': css_code, 'js_code': '', 'object_data': {}}

        context['qr_template'] = qr_template
        context['show_niimbot_button'] = False
        context['preview_mode'] = True
        context['render_error'] = render_error
        context['netbox_labels_meta'] = {
            'value': context['qr_value'],
            'objectType': None,
            'objectTypeId': None,
            'objectId': None,
        }
        return render(request, 'netbox_labels/render.html', context)


class QRRenderView(LoginRequiredMixin, View):
    """Renders a single QRTemplate for a specific object instance."""

    def get(self, request, object_type_id, object_id, template_id):
        content_type = get_object_or_404(ContentType, pk=object_type_id)
        model = content_type.model_class()
        if model is None:
            raise Http404

        instance = get_object_or_404(model.objects.restrict(request.user, 'view'), pk=object_id)
        qr_template = get_object_or_404(QRTemplate.objects.filter(is_active=True), pk=template_id)

        if not qr_template.applies_to(content_type):
            raise Http404

        context = rendering.render_template(qr_template, instance, request)
        context['qr_template'] = qr_template
        context['show_niimbot_button'] = QRSettings.load().show_niimbot_button
        # Opt-in via ?preview=1: reuses the same zoom-to-fit/centering treatment
        # built for the designer's preview dialog (see render.html) — for a
        # true-size embed (the object detail panel, or bulk-print's headless
        # rasterization worker) this must stay off, since it applies a CSS
        # transform that would throw off rasterizeLabel()'s measured size.
        context['preview_mode'] = bool(request.GET.get('preview'))
        context['netbox_labels_meta'] = {
            'value': context['qr_value'],
            'objectType': f'{content_type.app_label}.{content_type.model}',
            'objectTypeId': content_type.pk,
            'objectId': instance.pk,
        }

        return render(request, 'netbox_labels/render.html', context)


class QRBulkPrintView(LoginRequiredMixin, View):
    """Landing page for bulk-printing QR labels for a set of selected objects
    (reached from the "Bulk print QR" button injected into object list
    views — see template_content.py)."""

    def post(self, request):
        content_type = get_object_or_404(ContentType, pk=request.POST.get('content_type_id'))
        model = content_type.model_class()
        if model is None:
            raise Http404

        object_ids = request.POST.getlist('object_id')
        objects = list(model.objects.restrict(request.user, 'view').filter(pk__in=object_ids))
        if not objects:
            messages.error(request, _('No valid objects were selected.'))
            return _redirect_back(request)

        qr_templates = QRTemplate.objects.filter(is_active=True).filter(
            Q(applies_to_all=True) | Q(object_types=content_type)
        ).distinct()

        objects_data = [{'id': obj.pk, 'display': str(obj)} for obj in objects]

        return render(request, 'netbox_labels/qrtemplate_bulk_print.html', {
            'content_type': content_type,
            'objects': objects,
            'objects_json': objects_data,
            'qr_templates': qr_templates,
            'page_formats': PAGE_FORMATS,
            'show_niimbot_button': QRSettings.load().show_niimbot_button,
        })


class QRBulkPrintSheetView(LoginRequiredMixin, View):
    """Combines every selected object's label onto as few standard-printer
    pages as possible, for printing via the browser's own print dialog (and
    whatever printer — the OS default or otherwise — the user picks there),
    instead of one physical label per job like the direct label-printer
    drivers (Niimbot/Zebra/ESC-POS)."""

    def post(self, request):
        content_type = get_object_or_404(ContentType, pk=request.POST.get('content_type_id'))
        model = content_type.model_class()
        if model is None:
            raise Http404

        qr_template = get_object_or_404(QRTemplate.objects.filter(is_active=True), pk=request.POST.get('template_id'))
        if not qr_template.applies_to(content_type):
            raise Http404

        object_ids = request.POST.getlist('object_id')
        objects = list(model.objects.restrict(request.user, 'view').filter(pk__in=object_ids))
        if not objects:
            messages.error(request, _('No valid objects were selected.'))
            return _redirect_back(request)

        page_format = PAGE_FORMATS.get(request.POST.get('page_format'), PAGE_FORMATS['A4'])

        labels = []
        for obj in objects:
            context = rendering.render_template(qr_template, obj, request)
            # The generated markup relies on a page-global window.NetBoxQR.value
            # for what a [data-netbox-qr] element encodes (fine when each label
            # is its own document) — on a combined sheet every label needs its
            # own value, so it's pinned here via data-value, which qr-render.js
            # already prefers over the global when present.
            body_html = re.sub(
                r'data-netbox-qr\b',
                f'data-netbox-qr data-value="{escape(context["qr_value"])}"',
                context['body_html'],
            )
            labels.append(body_html)

        content_width_mm = page_format['width_mm'] - 2 * PAGE_MARGIN_MM

        return render(request, 'netbox_labels/qrtemplate_bulk_print_sheet.html', {
            'qr_template': qr_template,
            'labels': labels,
            'page_format': page_format,
            'page_margin_mm': _css_mm(PAGE_MARGIN_MM),
            'content_width_mm': _css_mm(content_width_mm),
            'label_width_mm': _css_mm(qr_template.width_mm),
            'label_height_mm': _css_mm(qr_template.height_mm),
        })


class QRSettingsView(LoginRequiredMixin, PermissionRequiredMixin, View):
    permission_required = 'netbox_labels.change_qrtemplate'

    def get(self, request):
        settings = QRSettings.load()
        form = forms.QRSettingsForm(instance=settings)
        return render(request, 'netbox_labels/settings.html', {'form': form})

    def post(self, request):
        settings = QRSettings.load()
        form = forms.QRSettingsForm(request.POST, instance=settings)
        if form.is_valid():
            form.save()
            messages.success(request, _('QR settings saved.'))
            return redirect('plugins:netbox_labels:settings')
        return render(request, 'netbox_labels/settings.html', {'form': form})
