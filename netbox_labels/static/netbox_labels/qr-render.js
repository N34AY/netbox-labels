/**
 * Bridges the JSON blobs injected by netbox_labels/render.html into a
 * window.NetBoxQR global, then draws a QR code into every
 * [data-netbox-qr] element on the page using the vendored QRCode library.
 */
(function () {
	var LOG_PREFIX = '[NetBoxQR]';

	function readJSON(id) {
		var el = document.getElementById(id);
		return el ? JSON.parse(el.textContent) : null;
	}

	var meta = readJSON('netbox-qr-meta') || {};

	window.NetBoxQR = {
		value: meta.value || '',
		objectType: meta.objectType || null,
		objectTypeId: meta.objectTypeId || null,
		objectId: meta.objectId || null,
		objectData: readJSON('netbox-qr-object-data'),
	};

	// Same red-on-white treatment as render.html's "Template error" banner
	// and barcode-render.js's placeholder (identical ERROR_* values —
	// kept in sync by hand, not shared, like LOG_PREFIX above), scaled down
	// to fit inside a single element — the only error surface for a value
	// the QR library itself rejects (e.g. empty text), since that only
	// fails here in the browser, after layout.py/rendering.py have already
	// produced otherwise-valid HTML.
	var ERROR_BG = '#fff3f3';
	var ERROR_FG = '#842029';
	var ERROR_BORDER = '#dc3545';

	function showErrorPlaceholder(el, message) {
		el.title = LOG_PREFIX + ' ' + message;
		el.innerHTML = '';
		el.style.background = ERROR_BG;
		el.style.border = '2px solid ' + ERROR_BORDER;
		el.style.boxSizing = 'border-box';
		el.style.display = 'flex';
		el.style.alignItems = 'center';
		el.style.justifyContent = 'center';
		el.style.color = ERROR_FG;
		el.style.fontFamily = 'ui-monospace, Menlo, Consolas, monospace';
		el.style.fontWeight = 'bold';
		el.style.fontSize = '150%';
		el.textContent = '!';
	}

	var errors = [];

	document.querySelectorAll('[data-netbox-qr]').forEach(function (el) {
		var correctLevelName = (el.getAttribute('data-correct-level') || 'H').toUpperCase();
		// Read before QRCode() below replaces el's contents with its own
		// canvas/img: a per-element binding (see layout.py's
		// _render_qr_element) renders its value as el's own inner text,
		// which takes priority over the page-global data-value/NetBoxQR.value
		// fallback used by elements with no binding of their own.
		var ownValue = el.textContent.trim();
		var text = ownValue || el.getAttribute('data-value') || window.NetBoxQR.value;
		try {
			new QRCode(el, {
				text: text,
				width: parseInt(el.getAttribute('data-width'), 10) || 200,
				height: parseInt(el.getAttribute('data-height'), 10) || 200,
				colorDark: el.getAttribute('data-color-dark') || '#000000',
				colorLight: el.getAttribute('data-color-light') || '#ffffff',
				correctLevel: QRCode.CorrectLevel[correctLevelName] ?? QRCode.CorrectLevel.H,
			});
		} catch (e) {
			// One malformed value must not stop the rest of the label's QR
			// codes/barcodes/text from drawing — without this, a throwing
			// iteration would abort the whole forEach, silently skipping
			// every element still to come, not just this one.
			console.error(LOG_PREFIX, 'render failed:', e);
			var message = e && e.message ? e.message : String(e);
			showErrorPlaceholder(el, message);
			errors.push((el.getAttribute('data-element-id') || 'qr') + ': ' + message);
		}
	});

	// See barcode-render.js's identical handshake — surfaces this in the
	// designer's Preview modal debug panel alongside server-side errors.
	if (errors.length && window.self !== window.top) {
		window.parent.postMessage({ type: 'netbox-qr-client-error', source: 'qr', errors: errors }, '*');
	}
})();
