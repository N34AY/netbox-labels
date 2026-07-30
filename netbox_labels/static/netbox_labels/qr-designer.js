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

	var elements = JSON.parse(document.getElementById('qr-layout-data').textContent).elements || [];
	var selectedId = null;
	var zoom = 1;
	var dragState = null; // { id, mode: 'move'|'resize', dir, startX, startY, startXMm, startYMm, startWMm, startHMm }

	var canvas = document.getElementById('qr-canvas');
	var canvasWrapper = document.getElementById('qr-canvas-wrapper');
	var propertiesBody = document.getElementById('qr-properties-body');
	var undoBtn = document.getElementById('qr-undo');
	var redoBtn = document.getElementById('qr-redo');
	var zoomInBtn = document.getElementById('qr-zoom-in');
	var zoomOutBtn = document.getElementById('qr-zoom-out');
	var zoomResetBtn = document.getElementById('qr-zoom-reset');
	var zoomLabel = document.getElementById('qr-zoom-label');
	var addTextLink = document.getElementById('qr-add-text');
	var addImageLink = document.getElementById('qr-add-image');
	var addQrLink = document.getElementById('qr-add-qr');
	var imageFileInput = document.getElementById('qr-image-file-input');
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

	function uid(prefix) {
		return prefix + '-' + Math.random().toString(36).slice(2, 9);
	}

	function findElement(id) {
		return elements.find(function (el) { return el.id === id; });
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
	// Rendering
	//

	function previewText(el) {
		switch (el.binding) {
			case 'static': return el.text || _('(empty)');
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
				'background:' + (el.type === 'qr' ? 'repeating-linear-gradient(45deg,#eee,#eee 4px,#fff 4px,#fff 8px)' : el.type === 'image' && !el.src ? '#eee' : 'transparent'),
			].join(';');

			if (el.type === 'qr') {
				content.textContent = 'QR';
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

		if (el.type === 'qr') {
			rows.push(field(_('Error correction'), selectInput('correct_level', el.correct_level || 'H', [
				['L', 'L (' + _('least redundant, smallest modules') + ')'],
				['M', 'M'], ['Q', 'Q'], ['H', 'H (' + _('most redundant') + ')'],
			])));
		} else if (el.type === 'image') {
			if (el.src) {
				rows.push('<div class="mb-2"><img src="' + el.src + '" style="max-width:100%;max-height:80px;border:1px solid #ccc"></div>');
			}
			rows.push(
				'<div class="mb-2"><button type="button" class="btn btn-sm btn-outline-secondary" id="qr-replace-image">' +
				_('Replace image') + '</button></div>'
			);
		} else {
			rows.push(field(_('Content'), selectInput('binding', el.binding || 'object', [
				['object', _('Object (works for every type)')],
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
			rows.push(field(_('Font size (mm)'), numberInput('font_size_mm', el.font_size_mm || 3)));
			rows.push(field(_('Weight'), selectInput('font_weight', el.font_weight || 'normal', [['normal', _('Normal')], ['bold', _('Bold')]])));
			rows.push(field(_('Color'), colorInput('color', el.color || '#000000')));
			rows.push(field(_('Align'), selectInput('text_align', el.text_align || 'left', [['left', _('Left')], ['center', _('Center')], ['right', _('Right')]])));
			rows.push(field(_('Transform'), selectInput('text_transform', el.text_transform || 'none', [
				['none', _('None')], ['uppercase', _('UPPERCASE')], ['lowercase', _('lowercase')], ['capitalize', _('Capitalize')],
			])));
			rows.push(field(_('Letter spacing (mm)'), numberInput('letter_spacing_mm', el.letter_spacing_mm || 0)));
		}

		rows.push(
			'<hr><button type="button" class="btn btn-sm btn-outline-danger" id="qr-delete-element">' +
			'<i class="mdi mdi-trash-can-outline"></i> ' + _('Delete element') + '</button>'
		);

		propertiesBody.innerHTML = rows.join('');

		propertiesBody.querySelectorAll('[data-prop]').forEach(function (input) {
			input.addEventListener('input', function () {
				var prop = input.dataset.prop;
				var value = input.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
				el[prop] = value;
				renderCanvas();
				if (prop === 'binding') {
					renderProperties();
				}
			});
			input.addEventListener('change', snapshot);
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

		if (dragState.mode === 'move') {
			el.x_mm = Math.max(0, round1(dragState.startXMm + dxMm));
			el.y_mm = Math.max(0, round1(dragState.startYMm + dyMm));
		} else {
			var dir = dragState.dir;
			if (dir.indexOf('e') >= 0) {
				el.width_mm = Math.max(1, round1(dragState.startWMm + dxMm));
			}
			if (dir.indexOf('s') >= 0) {
				el.height_mm = Math.max(1, round1(dragState.startHMm + dyMm));
			}
			if (dir.indexOf('w') >= 0) {
				el.width_mm = Math.max(1, round1(dragState.startWMm - dxMm));
				el.x_mm = round1(dragState.startXMm + dxMm);
			}
			if (dir.indexOf('n') >= 0) {
				el.height_mm = Math.max(1, round1(dragState.startHMm - dyMm));
				el.y_mm = round1(dragState.startYMm + dyMm);
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
		var active = document.activeElement;
		var typing = active && ['INPUT', 'TEXTAREA', 'SELECT'].indexOf(active.tagName) !== -1;
		if (!typing && selectedId && (event.key === 'Delete' || event.key === 'Backspace')) {
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
			correct_level: 'L',
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
		var doc = new DOMParser().parseFromString(html, 'text/html');

		var errorEl = doc.getElementById('netbox-qr-render-error');
		var hasError = !!errorEl;
		previewErrorEl.classList.toggle('d-none', !hasError);
		previewDataToggle.classList.toggle('text-danger', hasError);
		if (hasError) {
			previewErrorEl.textContent = JSON.parse(errorEl.textContent);
		}

		try {
			var dataEl = doc.getElementById('netbox-qr-object-data');
			var data = dataEl ? JSON.parse(dataEl.textContent) : {};
			previewDataJson.textContent = JSON.stringify(data, null, 2);
		} catch (e) {
			previewDataJson.textContent = '';
		}

		previewDataWrapper.classList.remove('d-none');

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
