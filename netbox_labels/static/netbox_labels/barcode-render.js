/**
 * Draws a barcode into every .netbox-labels-barcode canvas on the page,
 * using the vendored JsBarcode library — the barcode counterpart to
 * qr-render.js. Reads the encoded value from the canvas's own text content
 * (not a data-*="..." attribute — see layout.py's _render_barcode_element
 * for why) and format/color from data-* attributes.
 */
(function () {
	var LOG_PREFIX = '[NetBoxQR/Barcode]';

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
			// rest of the label's barcodes/QR/text from drawing.
			console.error(LOG_PREFIX, 'render failed:', e);
		}
	});
})();
