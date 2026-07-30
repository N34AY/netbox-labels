/**
 * Bulk-print orchestration: connect once, print a sequence of previously-
 * selected objects' labels over that same connection, and track per-object
 * status so that a failure (e.g. the printer runs out of paper) doesn't lose
 * progress — the operator can fix the printer and click Continue to resume
 * from the first object that isn't done yet, rather than restarting the
 * whole batch.
 *
 * Each object's label is rendered by loading its normal render.html page
 * (the same one used everywhere else in the plugin) into a single hidden,
 * reused iframe, then asking that document to rasterize itself via
 * postMessage — see the 'netbox-qr-rasterize-request' handler in
 * render.html. This reuses the existing Jinja2/QR rendering pipeline as-is
 * instead of duplicating it here.
 */
(function () {
	var _ = window.gettext || function (s) { return s; };
	var LOG_PREFIX = '[NetBoxQR/BulkPrint]';
	var RASTERIZE_TIMEOUT_MS = 15000;

	var objects = JSON.parse(document.getElementById('qr-bulk-objects-data').textContent);
	var statuses = {}; // id -> 'pending' | 'printing' | 'success' | 'failed'
	objects.forEach(function (obj) { statuses[obj.id] = 'pending'; });

	var selectedTemplateId = null;
	var isRunning = false;
	var lastDriver = null;
	var lastTransport = null;

	var templateListEl = document.getElementById('qr-bulk-template-list');
	var previewIframe = document.getElementById('qr-bulk-preview-iframe');
	var previewPlaceholder = document.getElementById('qr-bulk-preview-placeholder');
	var printBtn = document.getElementById('qr-bulk-print-btn');
	var resetBtn = document.getElementById('qr-bulk-reset-btn');
	var continueBtn = document.getElementById('qr-bulk-continue-btn');
	var errorFooter = document.getElementById('qr-bulk-error-footer');
	var errorMessageEl = document.getElementById('qr-bulk-error-message');
	var progressCountEl = document.getElementById('qr-bulk-progress-count');
	var workerIframe = document.getElementById('qr-bulk-worker-iframe');

	function renderUrl(objectId, templateId) {
		return window.NETBOX_QR_BULK_RENDER_URL_TEMPLATE.replace('/0/0/', '/' + objectId + '/' + templateId + '/');
	}

	//
	// Template selection
	//

	if (templateListEl) {
		templateListEl.addEventListener('click', function (event) {
			var btn = event.target.closest('[data-template-id]');
			if (!btn) {
				return;
			}
			Array.prototype.forEach.call(templateListEl.children, function (child) {
				child.classList.remove('active');
			});
			btn.classList.add('active');
			selectedTemplateId = btn.dataset.templateId;
			if (printBtn) {
				printBtn.disabled = false;
			}
			updatePreview();
		});
	}

	function updatePreview() {
		if (!selectedTemplateId || objects.length === 0) {
			return;
		}
		// ?preview=1 reuses the same zoom-to-fit/centering treatment built for
		// the designer's preview dialog (see render.html's preview_mode) —
		// without it, a small physical label would render true-size (tiny)
		// in this comfortably large preview box. The rasterization worker
		// iframe below must NOT use this: it applies a CSS transform that
		// would throw off rasterizeLabel()'s measured size.
		previewIframe.src = renderUrl(objects[0].id, selectedTemplateId) + '?preview=1';
		previewIframe.style.display = 'block';
		previewPlaceholder.style.display = 'none';
	}

	//
	// Status table
	//

	var STATUS_LABELS = {
		pending: _('Pending'),
		printing: _('Printing…'),
		success: _('Done'),
		failed: _('Failed'),
	};
	var STATUS_CLASSES = {
		pending: 'text-bg-secondary',
		printing: 'text-bg-info',
		success: 'text-bg-success',
		failed: 'text-bg-danger',
	};

	function setStatus(objectId, status) {
		statuses[objectId] = status;
		var badge = document.getElementById('qr-bulk-status-' + objectId);
		if (badge) {
			badge.textContent = STATUS_LABELS[status];
			badge.className = 'badge ' + STATUS_CLASSES[status];
		}
		updateProgress();
	}

	function updateProgress() {
		var done = objects.filter(function (obj) { return statuses[obj.id] === 'success'; }).length;
		if (progressCountEl) {
			progressCountEl.textContent = done;
		}
	}

	function showError(message) {
		errorMessageEl.textContent = message;
		errorFooter.style.display = 'block';
	}

	function hideError() {
		errorFooter.style.display = 'none';
	}

	//
	// Rasterization via the hidden worker iframe
	//

	function rasterizeObject(objectId, templateId) {
		return new Promise(function (resolve, reject) {
			var settled = false;

			var timeout = setTimeout(function () {
				if (settled) {
					return;
				}
				settled = true;
				window.removeEventListener('message', onMessage);
				reject(new Error(_('Timed out waiting for the label to render.')));
			}, RASTERIZE_TIMEOUT_MS);

			function onMessage(event) {
				if (settled || !event.data || event.data.type !== 'netbox-qr-rasterize-response') {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				window.removeEventListener('message', onMessage);

				var img = new Image();
				img.onload = function () {
					var canvas = document.createElement('canvas');
					canvas.width = event.data.width;
					canvas.height = event.data.height;
					canvas.getContext('2d').drawImage(img, 0, 0);
					resolve(canvas);
				};
				img.onerror = function () {
					reject(new Error(_('Could not decode the rendered label image.')));
				};
				img.src = event.data.dataUrl;
			}

			function onLoad() {
				window.addEventListener('message', onMessage);
				workerIframe.contentWindow.postMessage({ type: 'netbox-qr-rasterize-request', dpi: 203 }, '*');
			}

			workerIframe.addEventListener('load', onLoad, { once: true });
			workerIframe.src = renderUrl(objectId, templateId);
		});
	}

	//
	// Batch loop
	//

	async function runBatch(driver, transport) {
		if (isRunning || !selectedTemplateId) {
			return;
		}
		isRunning = true;
		lastDriver = driver;
		lastTransport = transport;
		hideError();
		if (printBtn) {
			printBtn.disabled = true;
		}

		var impl = NetBoxQRPrintCommon.getDriver(driver);
		if (!impl) {
			console.error(LOG_PREFIX, 'unknown driver', driver);
			isRunning = false;
			if (printBtn) {
				printBtn.disabled = false;
			}
			return;
		}

		var conn;
		try {
			conn = await impl.connect(transport);
		} catch (e) {
			console.error(LOG_PREFIX, 'connect failed:', e);
			showError(e.message || String(e));
			isRunning = false;
			if (printBtn) {
				printBtn.disabled = false;
			}
			return;
		}

		var pending = objects.filter(function (obj) { return statuses[obj.id] !== 'success'; });
		console.log(LOG_PREFIX, 'starting batch:', pending.length, 'of', objects.length, 'remaining');

		for (var i = 0; i < pending.length; i++) {
			var obj = pending[i];
			setStatus(obj.id, 'printing');
			try {
				var canvas = await rasterizeObject(obj.id, selectedTemplateId);
				await impl.printLabel(conn, canvas);
				setStatus(obj.id, 'success');
			} catch (e) {
				console.error(LOG_PREFIX, 'print failed for object', obj.id, e);
				setStatus(obj.id, 'failed');
				showError((obj.display || obj.id) + ': ' + (e.message || String(e)));
				await impl.disconnect(conn);
				isRunning = false;
				if (printBtn) {
					printBtn.disabled = false;
				}
				return;
			}
		}

		await impl.disconnect(conn);
		isRunning = false;
		if (printBtn) {
			printBtn.disabled = false;
		}
		console.log(LOG_PREFIX, 'batch complete');
	}

	window.netboxQrBulkStart = function (driver, transport) {
		runBatch(driver, transport);
	};

	if (continueBtn) {
		continueBtn.addEventListener('click', function () {
			if (lastDriver) {
				runBatch(lastDriver, lastTransport);
			}
		});
	}

	if (resetBtn) {
		resetBtn.addEventListener('click', function () {
			if (isRunning) {
				return;
			}
			objects.forEach(function (obj) { setStatus(obj.id, 'pending'); });
			hideError();
		});
	}

	//
	// Default printer: combines every selected object onto as few standard
	// page-format sheets as possible, printed via the browser's own print
	// dialog instead of a direct connection to a label printer. This is a
	// separate one-shot action from the device-driver batch above — it
	// doesn't touch the per-object status tracking, since (unlike a direct
	// serial/USB write) there's no way to know whether the physical print
	// actually succeeded once it's handed off to the OS print dialog.
	//

	var driverOptionsEl = document.getElementById('qr-bulk-driver-options');
	var pageFormatOptionsEl = document.getElementById('qr-bulk-page-format-options');
	var printModalEl = document.getElementById('qr-bulk-print-modal');

	// Bootstrap's .d-flex/.d-none utility classes are both !important, so
	// toggling via .style.display directly gets silently overridden by
	// whichever utility class is still present — both classes are swapped
	// together instead, never left in a conflicting combination.
	window.netboxQrBulkShowPageFormats = function () {
		if (driverOptionsEl) {
			driverOptionsEl.classList.remove('d-flex');
			driverOptionsEl.classList.add('d-none');
		}
		if (pageFormatOptionsEl) {
			pageFormatOptionsEl.classList.remove('d-none');
			pageFormatOptionsEl.classList.add('d-flex');
		}
	};

	window.netboxQrBulkShowDriverOptions = function () {
		if (pageFormatOptionsEl) {
			pageFormatOptionsEl.classList.remove('d-flex');
			pageFormatOptionsEl.classList.add('d-none');
		}
		if (driverOptionsEl) {
			driverOptionsEl.classList.remove('d-none');
			driverOptionsEl.classList.add('d-flex');
		}
	};

	if (printModalEl) {
		printModalEl.addEventListener('hidden.bs.modal', function () {
			window.netboxQrBulkShowDriverOptions();
		});
	}

	window.netboxQrBulkPrintSheet = function (pageFormat) {
		if (!selectedTemplateId) {
			return;
		}
		var csrfInput = document.querySelector('input[name="csrfmiddlewaretoken"]');

		var form = document.createElement('form');
		form.method = 'post';
		form.action = window.NETBOX_QR_BULK_SHEET_URL;
		form.target = '_blank';
		form.style.display = 'none';

		function addField(name, value) {
			var input = document.createElement('input');
			input.type = 'hidden';
			input.name = name;
			input.value = value;
			form.appendChild(input);
		}

		addField('csrfmiddlewaretoken', csrfInput ? csrfInput.value : '');
		addField('content_type_id', window.NETBOX_QR_BULK_CONTENT_TYPE_ID);
		addField('template_id', selectedTemplateId);
		addField('page_format', pageFormat);
		objects.forEach(function (obj) {
			addField('object_id', obj.id);
		});

		document.body.appendChild(form);
		form.submit();
		document.body.removeChild(form);
	};
})();
