/**
 * No-code drag/resize label designer. Edits an in-memory list of elements
 * (text/qr/image, positioned in mm) plus a canvas size (mm), and on submit
 * serializes them into the hidden form fields for the server to turn into
 * html_code/css_code (see netbox_labels/layout.py).
 */
(function () {
	var _ = window.gettext || function (s) { return s; };

	var BASE_PX_PER_MM = 8;
	var ZOOM_MIN = 0.25;
	var ZOOM_MAX = 4;

	var root = document.getElementById('qr-designer');
	var canvasWidthMm = parseFloat(root.dataset.widthMm) || 40;
	var canvasHeightMm = parseFloat(root.dataset.heightMm) || 12;
	var previewUrl = root.dataset.previewUrl;
	var searchUrl = root.dataset.searchUrl;
	var docsUrl = root.dataset.docsUrl;

	var elements = JSON.parse(document.getElementById('qr-layout-data').textContent).elements || [];
	var selectedId = null;
	var zoom = 1;
	var dragState = null; // { id, mode: 'move'|'resize', dir, startX, startY, startXMm, startYMm, startWMm, startHMm }

	// Grid/snap is ephemeral UI state, like zoom — not part of currentState()/
	// restoreState(), so it isn't tracked by undo/redo and doesn't get saved.
	var showGrid = false;
	var gridSizeMm = 5;

	var canvas = document.getElementById('qr-canvas');
	var canvasWrapper = document.getElementById('qr-canvas-wrapper');
	var propertiesBody = document.getElementById('qr-properties-body');
	var undoBtn = document.getElementById('qr-undo');
	var redoBtn = document.getElementById('qr-redo');
	var zoomInBtn = document.getElementById('qr-zoom-in');
	var zoomOutBtn = document.getElementById('qr-zoom-out');
	var zoomResetBtn = document.getElementById('qr-zoom-reset');
	var zoomLabel = document.getElementById('qr-zoom-label');
	var gridToggleBtn = document.getElementById('qr-grid-toggle');
	var gridSizeLabel = document.getElementById('qr-grid-size-label');
	var gridSizeOptions = document.querySelectorAll('.qr-grid-size-option');
	var addTextLink = document.getElementById('qr-add-text');
	var addImageLink = document.getElementById('qr-add-image');
	var addQrLink = document.getElementById('qr-add-qr');
	var addBarcodeLink = document.getElementById('qr-add-barcode');
	var imageFileInput = document.getElementById('qr-image-file-input');
	var iconSearchInput = document.getElementById('qr-icon-search');
	var iconResults = document.getElementById('qr-icon-results');
	var iconMoreHint = document.getElementById('qr-icon-more-hint');
	var widthInput = document.getElementById('qr-canvas-width');
	var heightInput = document.getElementById('qr-canvas-height');
	var dimsLabel = document.getElementById('qr-dims-label');
	var saveForm = document.getElementById('qr-save-form');
	var layoutJsonInput = document.getElementById('qr-layout-json');
	var widthMmInput = document.getElementById('qr-width-mm-input');
	var heightMmInput = document.getElementById('qr-height-mm-input');
	var previewBtn = document.getElementById('qr-preview-btn');
	var previewModalEl = document.getElementById('qr-preview-modal');
	var previewModePlaceholderBtn = document.getElementById('qr-preview-mode-placeholder');
	var previewModeObjectBtn = document.getElementById('qr-preview-mode-object');
	var previewPicker = document.getElementById('qr-preview-object-picker');
	var previewContentType = document.getElementById('qr-preview-content-type');
	var previewSearch = document.getElementById('qr-preview-search');
	var previewResults = document.getElementById('qr-preview-results');
	var previewIframe = document.getElementById('qr-preview-iframe');
	var previewDataWrapper = document.getElementById('qr-preview-data-wrapper');
	var previewDataToggle = document.getElementById('qr-preview-data-toggle');
	var previewDataCollapseEl = document.getElementById('qr-preview-data-collapse');
	var previewDataJson = document.getElementById('qr-preview-data-json');
	var previewErrorEl = document.getElementById('qr-preview-error');

	function effectiveScale() {
		return BASE_PX_PER_MM * zoom;
	}

	function mmToPx(mm) {
		return mm * effectiveScale();
	}

	function pxToMm(px) {
		return px / effectiveScale();
	}

	function round1(value) {
		return Math.round(value * 10) / 10;
	}

	function snapMm(value) {
		return Math.round(value / gridSizeMm) * gridSizeMm;
	}

	function uid(prefix) {
		return prefix + '-' + Math.random().toString(36).slice(2, 9);
	}

	function findElement(id) {
		return elements.find(function (el) { return el.id === id; });
	}

	//
	// Copy / paste
	//

	var clipboardElement = null;

	function isTyping() {
		var active = document.activeElement;
		return active && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(active.tagName) !== -1;
	}

	function copySelected() {
		if (isTyping() || !selectedId) {
			return;
		}
		var el = findElement(selectedId);
		if (el) {
			clipboardElement = JSON.parse(JSON.stringify(el));
		}
	}

	function pasteClipboard() {
		if (isTyping() || !clipboardElement) {
			return;
		}
		var clone = JSON.parse(JSON.stringify(clipboardElement));
		clone.id = uid(clone.type);
		clone.x_mm = Math.max(0, round1(clone.x_mm + 2));
		clone.y_mm = Math.max(0, round1(clone.y_mm + 2));
		elements.push(clone);
		selectElement(clone.id);
		snapshot();
	}

	//
	// Undo / redo
	//

	var history = { stack: [], index: -1 };

	function currentState() {
		return JSON.stringify({ w: canvasWidthMm, h: canvasHeightMm, elements: elements });
	}

	function snapshot() {
		history.stack = history.stack.slice(0, history.index + 1);
		history.stack.push(currentState());
		history.index = history.stack.length - 1;
		updateUndoRedoButtons();
	}

	function restoreState(json) {
		var state = JSON.parse(json);
		canvasWidthMm = state.w;
		canvasHeightMm = state.h;
		elements = state.elements;
		selectedId = null;
		syncDimsUi();
		renderCanvas();
		renderProperties();
	}

	function undo() {
		if (history.index <= 0) {
			return;
		}
		history.index--;
		restoreState(history.stack[history.index]);
		updateUndoRedoButtons();
	}

	function redo() {
		if (history.index >= history.stack.length - 1) {
			return;
		}
		history.index++;
		restoreState(history.stack[history.index]);
		updateUndoRedoButtons();
	}

	function updateUndoRedoButtons() {
		undoBtn.disabled = history.index <= 0;
		redoBtn.disabled = history.index >= history.stack.length - 1;
	}

	//
	// Zoom
	//

	function setZoom(z) {
		zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
		zoomLabel.textContent = Math.round(zoom * 100) + '%';
		renderCanvas();
	}

	zoomInBtn.addEventListener('click', function () { setZoom(zoom * 1.25); });
	zoomOutBtn.addEventListener('click', function () { setZoom(zoom / 1.25); });
	zoomResetBtn.addEventListener('click', function () { setZoom(1); });

	canvasWrapper.addEventListener('wheel', function (event) {
		event.preventDefault();
		setZoom(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
	}, { passive: false });

	var pinchStartDist = null;
	var pinchStartZoom = 1;

	function touchDistance(touches) {
		var dx = touches[0].clientX - touches[1].clientX;
		var dy = touches[0].clientY - touches[1].clientY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	canvasWrapper.addEventListener('touchstart', function (event) {
		if (event.touches.length === 2) {
			pinchStartDist = touchDistance(event.touches);
			pinchStartZoom = zoom;
		}
	});
	canvasWrapper.addEventListener('touchmove', function (event) {
		if (event.touches.length === 2 && pinchStartDist) {
			event.preventDefault();
			setZoom(pinchStartZoom * (touchDistance(event.touches) / pinchStartDist));
		}
	}, { passive: false });
	canvasWrapper.addEventListener('touchend', function (event) {
		if (event.touches.length < 2) {
			pinchStartDist = null;
		}
	});

	//
	// Grid / snap
	//

	gridToggleBtn.addEventListener('click', function () {
		showGrid = !showGrid;
		gridToggleBtn.classList.toggle('active', showGrid);
		renderCanvas();
	});

	gridSizeOptions.forEach(function (option) {
		option.addEventListener('click', function (event) {
			event.preventDefault();
			gridSizeMm = parseFloat(option.dataset.value) || gridSizeMm;
			gridSizeLabel.textContent = option.textContent.trim();
			gridSizeOptions.forEach(function (o) { o.classList.toggle('active', o === option); });
			renderCanvas();
		});
	});

	//
	// Rendering
	//

	// A small, instantly-recognizable stand-in for a real qr/barcode element
	// in the canvas mockup — reuses the same vendored MDI glyphs already
	// shown for these types in the toolbar's Add menu (mdi-qrcode/
	// mdi-barcode), rather than plain "QR"/"CODE128" text, so it actually
	// looks like a (fake) code rather than a text label. window.MDI_ICONS
	// comes from mdi-icons-data.js, loaded before this file in
	// qrtemplate_design.html; absent in the JS test fixture, which doesn't
	// need real icon rendering, hence the empty-string fallback.
	function placeholderIconSvg(slug, color) {
		var path = (window.MDI_ICONS || {})[slug];
		if (!path) {
			return '';
		}
		// Percentage-only sizing: the element's own box is already in
		// zoomed pixels (mmToPx() bakes the current zoom level in), so a
		// fixed rem/px cap here would stay the same size as the canvas is
		// zoomed in/out instead of scaling proportionally with it.
		return (
			'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" ' +
			'style="width:60%;height:60%;flex:none">' +
			'<path fill="' + color + '" d="' + path + '"/></svg>'
		);
	}

	function previewText(el) {
		switch (el.binding) {
			case 'static': return el.text || _('(empty)');
			case 'object_url': return '{{ object_url }}';
			case 'object_type': return '{{ object_type.model }}';
			case 'custom': return '{{ ' + (el.expr || '') + ' }}';
			case 'format': return el.format || _('(empty)');
			case 'object':
			default: return '{{ object }}';
		}
	}

	function renderCanvas() {
		canvas.style.width = mmToPx(canvasWidthMm) + 'px';
		canvas.style.height = mmToPx(canvasHeightMm) + 'px';
		if (showGrid) {
			var gridPx = mmToPx(gridSizeMm);
			canvas.style.backgroundImage = [
				'linear-gradient(to right, #0002 1px, transparent 1px)',
				'linear-gradient(to bottom, #0002 1px, transparent 1px)',
			].join(',');
			canvas.style.backgroundSize = gridPx + 'px ' + gridPx + 'px';
		} else {
			canvas.style.backgroundImage = 'none';
		}
		canvas.innerHTML = '';

		elements.forEach(function (el) {
			var isSelected = el.id === selectedId;
			var div = document.createElement('div');
			div.className = 'qr-el';
			div.dataset.id = el.id;
			div.style.cssText = [
				'position:absolute',
				'left:' + mmToPx(el.x_mm) + 'px',
				'top:' + mmToPx(el.y_mm) + 'px',
				'width:' + mmToPx(el.width_mm) + 'px',
				'height:' + mmToPx(el.height_mm) + 'px',
				'box-sizing:border-box',
				'border:1px ' + (isSelected ? 'solid #0d6efd' : 'dashed #999'),
				'cursor:move',
				'user-select:none',
			].join(';');

			// Content is clipped to the element's own box (so overlong text/
			// images don't spill out), but that clipping must not apply to
			// the resize handles / delete icon below — those are meant to
			// stick out past the edge, so they live on the unclipped outer
			// div instead of this inner one.
			var content = document.createElement('div');
			content.style.cssText = [
				'width:100%', 'height:100%', 'overflow:hidden',
				'display:flex', 'align-items:center', 'font-size:11px',
				// The canvas itself is always a fixed white background (it's
				// mocking up a physical label, regardless of NetBox's own
				// light/dark theme) — an explicit color keeps this readable
				// either way, rather than inheriting NetBox's own (often
				// near-white, on dark mode) body text color and nearly
				// vanishing against the white. text/barcode/qr elements'
				// own color is used where there is one; image has no such
				// property, so it gets a plain neutral placeholder color.
				'color:' + (el.type === 'image' ? '#555' : (el.color || '#000000')),
				'background:' + ((el.type === 'qr' || el.type === 'barcode') ? '#f8f9fa' : el.type === 'image' && !el.src ? '#eee' : 'transparent'),
				// Text sitting flush against the box's left edge is hard to
				// tell apart from the border itself — a small inset here is
				// purely an editor legibility nicety (the real render, via
				// _render_text_element, is unpadded, matching the exact box
				// the admin drew).
				el.type === 'text' ? 'padding-left:3px' : '',
			].join(';');

			if (el.type === 'qr') {
				content.style.justifyContent = 'center';
				content.innerHTML = placeholderIconSvg('qrcode', el.color || '#555');
			} else if (el.type === 'barcode') {
				content.style.justifyContent = 'center';
				content.innerHTML = placeholderIconSvg('barcode', el.color || '#555');
				var formatLabel = document.createElement('span');
				formatLabel.style.cssText = 'margin-left:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
				formatLabel.textContent = el.barcode_format || 'CODE128';
				content.appendChild(formatLabel);
			} else if (el.type === 'image') {
				if (el.src) {
					var img = document.createElement('img');
					img.src = el.src;
					img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;';
					content.appendChild(img);
				} else {
					content.textContent = _('Image');
				}
			} else {
				content.textContent = previewText(el);
			}
			div.appendChild(content);

			div.addEventListener('mousedown', onElementMouseDown);
			canvas.appendChild(div);

			if (isSelected) {
				['nw', 'ne', 'sw', 'se'].forEach(function (dir) {
					var handle = document.createElement('div');
					handle.className = 'qr-handle';
					var cursor = (dir === 'nw' || dir === 'se') ? 'nwse-resize' : 'nesw-resize';
					handle.style.cssText = [
						'position:absolute', 'width:8px', 'height:8px',
						'background:#0d6efd', 'border:1px solid #fff', 'cursor:' + cursor,
						dir[0] === 'n' ? 'top:-4px' : 'bottom:-4px',
						dir[1] === 'w' ? 'left:-4px' : 'right:-4px',
					].join(';');
					handle.addEventListener('mousedown', function (event) {
						event.stopPropagation();
						startResize(event, el, dir);
					});
					div.appendChild(handle);
				});

				var deleteIcon = document.createElement('div');
				deleteIcon.className = 'qr-delete-icon';
				deleteIcon.innerHTML = '<i class="mdi mdi-close"></i>';
				deleteIcon.title = _('Delete');
				deleteIcon.style.cssText = [
					'position:absolute', 'top:-10px', 'right:-10px',
					'width:20px', 'height:20px', 'border-radius:50%',
					'background:#dc3545', 'color:#fff', 'display:flex',
					'align-items:center', 'justify-content:center',
					'cursor:pointer', 'font-size:13px', 'line-height:1', 'z-index:10',
				].join(';');
				deleteIcon.addEventListener('mousedown', function (event) {
					event.stopPropagation();
				});
				deleteIcon.addEventListener('click', function (event) {
					event.stopPropagation();
					deleteElement(el.id);
				});
				div.appendChild(deleteIcon);
			}
		});
	}

	function deleteElement(id) {
		elements = elements.filter(function (el) { return el.id !== id; });
		if (selectedId === id) {
			selectedId = null;
		}
		renderCanvas();
		renderProperties();
		snapshot();
	}

	function selectElement(id) {
		selectedId = id;
		renderCanvas();
		renderProperties();
	}

	//
	// Properties panel
	//

	function field(label, inputHtml, hint) {
		return '<div class="mb-2"><label class="form-label mb-0 small">' + label + '</label>' + inputHtml +
			(hint ? '<div class="form-text small">' + hint + '</div>' : '') + '</div>';
	}

	// A link icon appended to a field's label, opening docsUrl (the plugin's
	// static model docs page — see qrtemplate_design.html's data-docs-url,
	// empty when DOCS_ROOT is disabled) at the given anchor in a new tab.
	function docsIcon(anchor) {
		if (!docsUrl) {
			return '';
		}
		return (
			' <a href="' + docsUrl + '#' + anchor + '" target="_blank" rel="noopener" title="' +
			_('Documentation') + '"><i class="mdi mdi-information-outline"></i></a>'
		);
	}

	var BARCODE_FORMATS = [
		['CODE128', 'CODE128'], ['EAN13', 'EAN13'], ['EAN8', 'EAN8'], ['UPC', 'UPC'],
		['CODE39', 'CODE39'], ['ITF14', 'ITF14'], ['MSI', 'MSI'],
		['pharmacode', 'pharmacode'], ['codabar', 'codabar'],
	];

	// Whether a literal value is valid input for a barcode format other than
	// CODE128 (which accepts any text and is never checked against this).
	var BARCODE_FORMAT_VALIDATORS = {
		EAN13: function (v) { return /^\d{12,13}$/.test(v); },
		EAN8: function (v) { return /^\d{7,8}$/.test(v); },
		UPC: function (v) { return /^\d{11,12}$/.test(v); },
		CODE39: function (v) { return /^[A-Z0-9\-. $/+%]+$/.test(v); },
		ITF14: function (v) { return /^\d+$/.test(v) && v.length % 2 === 0; },
		MSI: function (v) { return /^\d+$/.test(v); },
		pharmacode: function (v) { return /^\d+$/.test(v) && +v >= 3 && +v <= 131070; },
		codabar: function (v) { return /^[0-9\-$:/.+]+$/.test(v); },
	};

	// Which barcode formats make sense for a barcode element's current
	// Content binding — see the "Visual designer: barcode formats" section
	// of the plugin's docs (docsIcon('barcode-formats') below) for the
	// reasoning. Only "object_url" (always a URL) and "static" (the literal
	// value is known up front) can actually be checked here; every other
	// binding resolves to a different value per object, which the designer
	// has no real object to test against, so nothing is filtered for those.
	function allowedBarcodeFormats(el) {
		if (el.binding === 'object_url') {
			return ['CODE128'];
		}
		if (el.binding === 'static') {
			var text = (el.text || '').trim();
			if (!text) {
				return BARCODE_FORMATS.map(function (pair) { return pair[0]; });
			}
			return BARCODE_FORMATS.map(function (pair) { return pair[0]; }).filter(function (format) {
				return format === 'CODE128' || BARCODE_FORMAT_VALIDATORS[format](text);
			});
		}
		return BARCODE_FORMATS.map(function (pair) { return pair[0]; });
	}

	function numberInput(prop, value) {
		return '<input type="number" step="0.1" class="form-control form-control-sm" data-prop="' + prop + '" value="' + value + '">';
	}

	function textInput(prop, value) {
		return '<input type="text" class="form-control form-control-sm" data-prop="' + prop + '" value="' + escapeAttr(value) + '">';
	}

	function colorInput(prop, value) {
		return '<input type="color" class="form-control form-control-sm form-control-color" data-prop="' + prop + '" value="' + value + '">';
	}

	function selectInput(prop, value, options) {
		var opts = options.map(function (pair) {
			return '<option value="' + pair[0] + '"' + (pair[0] === value ? ' selected' : '') + '>' + pair[1] + '</option>';
		}).join('');
		return '<select class="form-select form-select-sm" data-prop="' + prop + '">' + opts + '</select>';
	}

	function escapeAttr(value) {
		return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
	}

	function renderProperties() {
		var el = selectedId ? findElement(selectedId) : null;

		if (!el) {
			propertiesBody.innerHTML = '<p class="text-muted mb-0">' + _('Select an element to edit its properties.') + '</p>';
			return;
		}

		var rows = [];
		rows.push(field(_('X (mm)'), numberInput('x_mm', el.x_mm)));
		rows.push(field(_('Y (mm)'), numberInput('y_mm', el.y_mm)));
		rows.push(field(_('Width (mm)'), numberInput('width_mm', el.width_mm)));
		rows.push(field(_('Height (mm)'), numberInput('height_mm', el.height_mm)));

		if (el.type === 'image') {
			if (el.src) {
				rows.push('<div class="mb-2"><img src="' + el.src + '" style="max-width:100%;max-height:80px;border:1px solid #ccc"></div>');
			}
			rows.push(
				'<div class="mb-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="qr-replace-image">' +
				_('Replace image') + '</button></div>'
			);
			if (el._icon_name) {
				rows.push(field(_('Recolor icon'), colorInput('_icon_color', el._icon_color || '#000000')));
			}
		} else if (el.type === 'text' || el.type === 'barcode' || el.type === 'qr') {
			// Text, barcode and qr elements share the same "what data to
			// encode" binding UI — text renders it as a styled string,
			// barcode as scanlines, qr as a scannable code — see
			// text_content() in layout.py, which all three renderers call
			// identically. A qr element with no "binding" of its own yet
			// (only ever true of elements saved before this UI existed)
			// still falls back to the template-wide QR code value field, so
			// its default here is shown as "Object URL" to match that.
			var defaultBinding = el.type === 'qr' ? 'object_url' : 'object';
			rows.push(field(_('Content'), selectInput('binding', el.binding || defaultBinding, [
				['object', _('Object name')],
				['object_url', _('Object URL')],
				['object_type', _('Object type')],
				['static', _('Static text')],
				['format', _('Formatted text')],
				['custom', _('Custom Jinja2 expression')],
			])));
			if (el.binding === 'static') {
				rows.push(field(_('Text'), textInput('text', el.text || '')));
			}
			if (el.binding === 'format') {
				rows.push(field(
					_('Format'), textInput('format', el.format || ''),
					_('Mix literal text with ${expr} placeholders, e.g. "IP - ${object.primary_ip}"')
				));
			}
			if (el.binding === 'custom') {
				rows.push(field(_('Expression'), textInput('expr', el.expr || ''), 'e.g. object.status, object.rack.name'));
			}
			if (el.type === 'barcode') {
				var allowedFormats = allowedBarcodeFormats(el);
				if (allowedFormats.indexOf(el.barcode_format || 'CODE128') === -1) {
					// The Content binding just changed to something the
					// currently-picked format can't hold (e.g. switching to
					// Object URL while EAN13 was selected) — CODE128 accepts
					// anything, so it's always a safe format to fall back to.
					el.barcode_format = 'CODE128';
				}
				rows.push(field(
					_('Barcode format') + docsIcon('barcode-formats'),
					selectInput('barcode_format', el.barcode_format || 'CODE128', BARCODE_FORMATS.filter(function (pair) {
						return allowedFormats.indexOf(pair[0]) !== -1;
					}))
				));
				rows.push(field(_('Color'), colorInput('color', el.color || '#000000')));
			} else if (el.type === 'qr') {
				rows.push(field(_('Error correction'), selectInput('correct_level', el.correct_level || 'H', [
					['L', 'L (' + _('least redundant, smallest modules') + ')'],
					['M', 'M'], ['Q', 'Q'], ['H', 'H (' + _('most redundant') + ')'],
				])));
				rows.push(field(_('Color'), colorInput('color', el.color || '#000000')));
			} else {
				rows.push(field(_('Font size (mm)'), numberInput('font_size_mm', el.font_size_mm || 3)));
				rows.push(field(_('Weight'), selectInput('font_weight', el.font_weight || 'normal', [['normal', _('Normal')], ['bold', _('Bold')]])));
				rows.push(field(_('Color'), colorInput('color', el.color || '#000000')));
				rows.push(field(_('Align'), selectInput('text_align', el.text_align || 'left', [['left', _('Left')], ['center', _('Center')], ['right', _('Right')]])));
				rows.push(field(_('Transform'), selectInput('text_transform', el.text_transform || 'none', [
					['none', _('None')], ['uppercase', _('UPPERCASE')], ['lowercase', _('lowercase')], ['capitalize', _('Capitalize')],
				])));
				rows.push(field(_('Letter spacing (mm)'), numberInput('letter_spacing_mm', el.letter_spacing_mm || 0)));
			}
		}

		rows.push(
			'<hr><button type="button" class="btn btn-sm btn-outline-danger" id="qr-delete-element">' +
			'<i class="mdi mdi-trash-can-outline"></i> ' + _('Delete element') + '</button>'
		);

		propertiesBody.innerHTML = rows.join('');

		propertiesBody.querySelectorAll('[data-prop]').forEach(function (input) {
			var prop = input.dataset.prop;
			input.addEventListener('input', function () {
				var value = input.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
				el[prop] = value;
				if (prop === '_icon_color') {
					el.src = iconSvgDataUri(el._icon_path, value);
				}
				renderCanvas();
				if (prop === 'binding') {
					renderProperties();
				}
			});
			input.addEventListener('change', function () {
				if (el.type === 'barcode' && prop === 'text') {
					// The static text's own value only affects which barcode
					// formats fit it once the admin is done typing — refresh
					// the (possibly now-different) filtered format list here
					// rather than on every keystroke.
					renderProperties();
				}
				snapshot();
			});
		});

		document.getElementById('qr-delete-element').addEventListener('click', function () {
			deleteElement(el.id);
		});

		var replaceImageBtn = document.getElementById('qr-replace-image');
		if (replaceImageBtn) {
			replaceImageBtn.addEventListener('click', function () {
				pickImageFile(function (dataUrl) {
					el.src = dataUrl;
					renderCanvas();
					renderProperties();
					snapshot();
				});
			});
		}
	}

	//
	// Drag / resize
	//

	function onElementMouseDown(event) {
		var id = event.currentTarget.dataset.id;
		if (id !== selectedId) {
			selectElement(id);
		}
		var el = findElement(id);
		dragState = {
			id: id, mode: 'move',
			startX: event.clientX, startY: event.clientY,
			startXMm: el.x_mm, startYMm: el.y_mm,
		};
		event.preventDefault();
	}

	function startResize(event, el, dir) {
		dragState = {
			id: el.id, mode: 'resize', dir: dir,
			startX: event.clientX, startY: event.clientY,
			startXMm: el.x_mm, startYMm: el.y_mm,
			startWMm: el.width_mm, startHMm: el.height_mm,
		};
	}

	document.addEventListener('mousemove', function (event) {
		if (!dragState) {
			return;
		}
		var el = findElement(dragState.id);
		if (!el) {
			return;
		}
		var dxMm = pxToMm(event.clientX - dragState.startX);
		var dyMm = pxToMm(event.clientY - dragState.startY);
		var roundMm = showGrid ? snapMm : round1;

		if (dragState.mode === 'move') {
			el.x_mm = Math.max(0, roundMm(dragState.startXMm + dxMm));
			el.y_mm = Math.max(0, roundMm(dragState.startYMm + dyMm));
		} else {
			var dir = dragState.dir;
			if (dir.indexOf('e') >= 0) {
				el.width_mm = Math.max(1, roundMm(dragState.startWMm + dxMm));
			}
			if (dir.indexOf('s') >= 0) {
				el.height_mm = Math.max(1, roundMm(dragState.startHMm + dyMm));
			}
			if (dir.indexOf('w') >= 0) {
				el.width_mm = Math.max(1, roundMm(dragState.startWMm - dxMm));
				el.x_mm = roundMm(dragState.startXMm + dxMm);
			}
			if (dir.indexOf('n') >= 0) {
				el.height_mm = Math.max(1, roundMm(dragState.startHMm - dyMm));
				el.y_mm = roundMm(dragState.startYMm + dyMm);
			}
		}
		renderCanvas();
		renderProperties();
	});

	document.addEventListener('mouseup', function () {
		if (dragState) {
			dragState = null;
			snapshot();
		}
	});

	canvas.addEventListener('mousedown', function (event) {
		if (event.target === canvas) {
			selectElement(null);
		}
	});

	document.addEventListener('keydown', function (event) {
		if (!isTyping() && selectedId && (event.key === 'Delete' || event.key === 'Backspace')) {
			deleteElement(selectedId);
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
			event.preventDefault();
			if (event.shiftKey) {
				redo();
			} else {
				undo();
			}
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
			event.preventDefault();
			redo();
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
			copySelected();
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
			pasteClipboard();
		}
	});

	undoBtn.addEventListener('click', undo);
	redoBtn.addEventListener('click', redo);

	//
	// Add elements
	//

	function pickImageFile(callback) {
		imageFileInput.value = '';
		imageFileInput.onchange = function () {
			var file = imageFileInput.files[0];
			if (!file) {
				return;
			}
			var reader = new FileReader();
			reader.onload = function () {
				callback(reader.result);
			};
			reader.readAsDataURL(file);
		};
		imageFileInput.click();
	}

	addTextLink.addEventListener('click', function (event) {
		event.preventDefault();
		var el = {
			id: uid('text'), type: 'text',
			x_mm: 2, y_mm: 2, width_mm: Math.max(10, canvasWidthMm - 4), height_mm: 4,
			binding: 'object', font_size_mm: 3, font_weight: 'normal',
			color: '#000000', text_align: 'left', text_transform: 'none', letter_spacing_mm: 0,
		};
		elements.push(el);
		selectElement(el.id);
		snapshot();
	});

	addQrLink.addEventListener('click', function (event) {
		event.preventDefault();
		var size = Math.max(5, Math.min(canvasWidthMm, canvasHeightMm) - 2);
		var el = {
			id: uid('qr'), type: 'qr',
			x_mm: 1, y_mm: 1, width_mm: size, height_mm: size,
			correct_level: 'L', binding: 'object_url', color: '#000000',
		};
		elements.push(el);
		selectElement(el.id);
		snapshot();
	});

	addBarcodeLink.addEventListener('click', function (event) {
		event.preventDefault();
		var el = {
			id: uid('barcode'), type: 'barcode',
			x_mm: 1, y_mm: 1, width_mm: Math.max(10, canvasWidthMm - 2), height_mm: Math.max(5, canvasHeightMm / 2),
			barcode_format: 'CODE128', binding: 'object_url', color: '#000000',
		};
		elements.push(el);
		selectElement(el.id);
		snapshot();
	});

	addImageLink.addEventListener('click', function (event) {
		event.preventDefault();
		pickImageFile(function (dataUrl) {
			var el = {
				id: uid('image'), type: 'image',
				x_mm: 2, y_mm: 2, width_mm: 10, height_mm: 10,
				src: dataUrl,
			};
			elements.push(el);
			selectElement(el.id);
			snapshot();
		});
	});

	//
	// Icon picker — inserts an ordinary `image` element whose src is an SVG
	// data: URI built from the chosen MDI icon's path data, exactly like
	// addImageLink's callback above. Needs no layout.py/rendering changes:
	// _render_image_element already just echoes src into an <img>.
	//

	var ICON_RESULT_CAP = 300;

	function iconSvgDataUri(path, color) {
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
			'<path fill="' + color + '" d="' + path + '"/></svg>';
		return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
	}

	function addIconElement(name, path) {
		var color = '#000000';
		var el = {
			id: uid('image'), type: 'image',
			x_mm: 2, y_mm: 2, width_mm: 10, height_mm: 10,
			src: iconSvgDataUri(path, color),
			_icon_name: name, _icon_color: color, _icon_path: path,
		};
		elements.push(el);
		selectElement(el.id);
		snapshot();
		var dismissBtn = document.querySelector('#qr-icon-picker-modal [data-bs-dismiss="modal"]');
		if (dismissBtn) {
			dismissBtn.click();
		}
	}

	function renderIconResults(query) {
		var icons = window.MDI_ICONS || {};
		var names = Object.keys(icons);
		if (query) {
			names = names.filter(function (name) { return name.indexOf(query) !== -1; });
		}
		var truncated = names.length > ICON_RESULT_CAP;
		names = names.slice(0, ICON_RESULT_CAP);

		iconResults.innerHTML = '';
		names.forEach(function (name) {
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'netbox-qr-icon-btn';
			btn.title = name;
			btn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="' + icons[name] + '"/></svg>';
			btn.addEventListener('click', function () {
				addIconElement(name, icons[name]);
			});
			iconResults.appendChild(btn);
		});
		iconMoreHint.classList.toggle('d-none', !truncated);
	}

	iconSearchInput.addEventListener('input', function () {
		renderIconResults(iconSearchInput.value.trim().toLowerCase());
	});

	renderIconResults('');

	//
	// Canvas size (dropdown with presets + custom inputs)
	//

	function syncDimsUi() {
		widthInput.value = canvasWidthMm;
		heightInput.value = canvasHeightMm;
		dimsLabel.textContent = canvasWidthMm + ' × ' + canvasHeightMm + ' mm';
	}

	function setCanvasSize(w, h) {
		canvasWidthMm = w;
		canvasHeightMm = h;
		syncDimsUi();
		renderCanvas();
	}

	widthInput.addEventListener('input', function () {
		canvasWidthMm = parseFloat(widthInput.value) || canvasWidthMm;
		dimsLabel.textContent = canvasWidthMm + ' × ' + canvasHeightMm + ' mm';
		renderCanvas();
	});
	widthInput.addEventListener('change', snapshot);
	heightInput.addEventListener('input', function () {
		canvasHeightMm = parseFloat(heightInput.value) || canvasHeightMm;
		dimsLabel.textContent = canvasWidthMm + ' × ' + canvasHeightMm + ' mm';
		renderCanvas();
	});
	heightInput.addEventListener('change', snapshot);

	document.querySelectorAll('.qr-preset').forEach(function (link) {
		link.addEventListener('click', function (event) {
			event.preventDefault();
			setCanvasSize(parseFloat(link.dataset.w), parseFloat(link.dataset.h));
			snapshot();
		});
	});

	//
	// Save
	//

	saveForm.addEventListener('submit', function () {
		layoutJsonInput.value = JSON.stringify({ elements: elements });
		widthMmInput.value = canvasWidthMm;
		heightMmInput.value = canvasHeightMm;
	});

	//
	// Preview (rendered inline into the modal's iframe via srcdoc — no new tab)
	//

	// Guards against out-of-order responses: switching modes/objects quickly
	// can fire a second renderPreview() before the first's fetch resolves,
	// and there's no guarantee they resolve in request order — without this,
	// a slower, superseded request finishing later would clobber the correct,
	// already-displayed result.
	var previewRequestId = 0;

	// The server-side error (a Jinja2 binding failure — see
	// sanitize_layout_for_context() in rendering.py) is known as soon as the
	// preview HTML is fetched. A barcode/QR value the drawing library itself
	// rejects (see barcode-render.js/qr-render.js) is only known once the
	// iframe has actually executed those scripts, which happens later, via
	// postMessage — so the two are tracked separately and merged into the
	// same display whenever either one changes.
	var currentServerError = '';
	var currentClientErrors = [];

	function updatePreviewErrorDisplay() {
		var lines = [];
		if (currentServerError) {
			lines.push(currentServerError);
		}
		lines = lines.concat(currentClientErrors);
		var hasError = lines.length > 0;
		previewErrorEl.classList.toggle('d-none', !hasError);
		previewDataToggle.classList.toggle('text-danger', hasError);
		previewErrorEl.textContent = lines.join('\n\n');
		// An error needs the user's attention immediately rather than
		// staying hidden behind a click — expand the collapse directly via
		// its classes (matching what Bootstrap's own JS would leave it in)
		// rather than going through bootstrap.Collapse, which isn't exposed
		// as a global in this NetBox build.
		if (hasError) {
			previewDataCollapseEl.classList.add('show');
			previewDataToggle.setAttribute('aria-expanded', 'true');
			previewDataToggle.classList.remove('collapsed');
		}
	}

	// A malformed barcode/QR value's error arrives asynchronously, well after
	// this preview's own showPreviewResult() call has already run — so a
	// stale message from a since-superseded preview (the user switched
	// object/mode again before the old iframe's scripts finished) could in
	// principle still land here. Left unguarded: worth revisiting if that
	// turns out to happen in practice, but the iframe is fully replaced
	// (srcdoc reassignment) on every new preview, which stops the old one's
	// scripts running in every browser this has been tested against.
	window.addEventListener('message', function (event) {
		if (!event.data || event.data.type !== 'netbox-qr-client-error') {
			return;
		}
		currentClientErrors = currentClientErrors.concat(event.data.errors);
		updatePreviewErrorDisplay();
	});

	function renderPreview(contentTypeId, objectId) {
		var requestId = ++previewRequestId;
		var formData = new FormData();
		formData.append('csrfmiddlewaretoken', document.querySelector('#qr-save-form [name=csrfmiddlewaretoken]').value);
		formData.append('layout_json', JSON.stringify({ elements: elements }));
		formData.append('width_mm', canvasWidthMm);
		formData.append('height_mm', canvasHeightMm);
		var isRealObject = !!(contentTypeId && objectId);
		if (isRealObject) {
			formData.append('content_type_id', contentTypeId);
			formData.append('object_id', objectId);
		}
		fetch(previewUrl, { method: 'POST', body: formData })
			.then(function (response) { return response.text(); })
			.then(function (html) {
				if (requestId !== previewRequestId) {
					return;
				}
				previewIframe.srcdoc = html;
				showPreviewResult(isRealObject, html);
			});
	}

	// The rendered HTML (netbox_labels/render.html) already embeds the
	// object's serialized data (and, if a binding failed, the error) via
	// json_script — parsed straight out of the already-fetched HTML string
	// (not read back out of the iframe after the fact: srcdoc's 'load' event
	// timing turned out not reliable enough to depend on here). Both live in
	// the same collapsible "Object data (debug)" panel — the error on top,
	// object data below — rather than a separate always-visible box, since
	// they're the same "why is my binding doing that" debugging need.
	function showPreviewResult(isRealObject, html) {
		if (!isRealObject) {
			previewDataWrapper.classList.add('d-none');
			return;
		}
		currentClientErrors = [];
		var doc = new DOMParser().parseFromString(html, 'text/html');

		var errorEl = doc.getElementById('netbox-qr-render-error');
		currentServerError = errorEl ? JSON.parse(errorEl.textContent) : '';
		updatePreviewErrorDisplay();

		try {
			var dataEl = doc.getElementById('netbox-qr-object-data');
			var data = dataEl ? JSON.parse(dataEl.textContent) : {};
			previewDataJson.textContent = JSON.stringify(data, null, 2);
		} catch (e) {
			previewDataJson.textContent = '';
		}

		previewDataWrapper.classList.remove('d-none');
	}

	function setPreviewMode(mode) {
		previewModePlaceholderBtn.classList.toggle('active', mode === 'placeholder');
		previewModeObjectBtn.classList.toggle('active', mode === 'object');
		if (mode === 'placeholder') {
			previewPicker.classList.add('d-none');
			renderPreview(null, null);
		} else {
			previewPicker.classList.remove('d-none');
			runObjectSearch();
		}
	}

	previewBtn.addEventListener('click', function () {
		setPreviewMode('placeholder');
	});

	previewModePlaceholderBtn.addEventListener('click', function () {
		setPreviewMode('placeholder');
	});
	previewModeObjectBtn.addEventListener('click', function () {
		setPreviewMode('object');
	});

	var searchDebounce = null;

	// Same class of race renderPreview() guards against with previewRequestId
	// above: switching content type and typing a query in quick succession
	// fires overlapping requests with no guarantee they resolve in order —
	// without this, a slower, superseded search response finishing later
	// would silently replace the correct, already-shown results.
	var searchRequestId = 0;

	function runObjectSearch() {
		var contentTypeId = previewContentType.value;
		var query = previewSearch.value.trim();
		if (!contentTypeId) {
			return;
		}
		var requestId = ++searchRequestId;
		fetch(searchUrl + '?content_type_id=' + encodeURIComponent(contentTypeId) + '&q=' + encodeURIComponent(query))
			.then(function (response) { return response.json(); })
			.then(function (data) {
				if (requestId !== searchRequestId) {
					return;
				}
				previewResults.innerHTML = '';
				(data.results || []).forEach(function (result) {
					var item = document.createElement('a');
					item.href = '#';
					item.className = 'list-group-item list-group-item-action';
					item.textContent = result.display;
					item.addEventListener('click', function (event) {
						event.preventDefault();
						previewResults.querySelectorAll('.active').forEach(function (el) { el.classList.remove('active'); });
						item.classList.add('active');
						renderPreview(contentTypeId, result.id);
					});
					previewResults.appendChild(item);
				});
			});
	}

	previewContentType.addEventListener('change', runObjectSearch);
	previewSearch.addEventListener('input', function () {
		clearTimeout(searchDebounce);
		searchDebounce = setTimeout(runObjectSearch, 250);
	});

	// Only offer a content-type choice when the template actually applies to
	// more than one — with a single applicable type there's nothing to pick.
	if (previewContentType.options.length <= 1) {
		previewContentType.classList.add('d-none');
	}

	//
	// Init
	//

	syncDimsUi();
	renderCanvas();
	renderProperties();
	snapshot();
})();
