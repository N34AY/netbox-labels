/**
 * Draws a barcode into every .netbox-labels-barcode canvas on the page,
 * using the vendored JsBarcode library — the barcode counterpart to
 * qr-render.js. Reads the encoded value from the canvas's own text content
 * (not a data-*="..." attribute — see layout.py's _render_barcode_element
 * for why) and format/color from data-* attributes.
 */
(function () {
	var LOG_PREFIX = '[NetBoxQR/Barcode]';

	// Same red-on-white treatment as render.html's "Template error" banner,
	// scaled down to fit inside a single element instead of across the
	// whole page — this is the only error surface for a value the barcode
	// library itself rejects (e.g. a name against EAN13), since that only
	// fails here in the browser, after layout.py/rendering.py have already
	// produced otherwise-valid HTML.
	var ERROR_BG = '#fff3f3';
	var ERROR_FG = '#842029';
	var ERROR_BORDER = '#dc3545';

	function drawErrorPlaceholder(canvas, message) {
		canvas.title = LOG_PREFIX + ' ' + message;
		var ctx = canvas.getContext('2d');
		if (!ctx) {
			return;
		}
		var w = canvas.width;
		var h = canvas.height;
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = ERROR_BG;
		ctx.fillRect(0, 0, w, h);
		var lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.02));
		ctx.strokeStyle = ERROR_BORDER;
		ctx.lineWidth = lineWidth;
		ctx.strokeRect(lineWidth / 2, lineWidth / 2, w - lineWidth, h - lineWidth);
		ctx.fillStyle = ERROR_FG;
		ctx.font = 'bold ' + Math.round(Math.min(w, h) * 0.5) + 'px ui-monospace, Menlo, Consolas, monospace';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('!', w / 2, h / 2);
	}

	var errors = [];

	document.querySelectorAll('.netbox-labels-barcode').forEach(function (canvas) {
		var value = canvas.textContent.trim();
		var format = canvas.getAttribute('data-barcode-format') || 'CODE128';
		var color = canvas.getAttribute('data-barcode-color') || '#000000';
		try {
			JsBarcode(canvas, value, {
				format: format,
				lineColor: color,
				background: 'transparent',
				displayValue: false,
				margin: 0,
			});
		} catch (e) {
			// One malformed value (e.g. non-numeric EAN13) must not stop the
			// rest of the label's barcodes/QR/text from drawing — draw an
			// error placeholder in this canvas alone instead of leaving it
			// blank with only a console error.
			console.error(LOG_PREFIX, 'render failed:', e);
			var message = e && e.message ? e.message : String(e);
			drawErrorPlaceholder(canvas, message);
			errors.push((canvas.getAttribute('data-element-id') || 'barcode') + ': ' + message);
		}
	});

	// Mirrors render.html's own netboxQrReportSize postMessage handshake so
	// the designer's Preview modal can surface a value the barcode library
	// itself rejected in the same debug error panel as a server-side Jinja2
	// binding error (see qr-designer.js's 'netbox-qr-client-error' handler) —
	// this only fails here in the browser, after layout.py/rendering.py have
	// already produced otherwise-valid HTML, so the designer has no other
	// way to learn about it.
	if (errors.length && window.self !== window.top) {
		window.parent.postMessage({ type: 'netbox-qr-client-error', source: 'barcode', errors: errors }, '*');
	}
})();
