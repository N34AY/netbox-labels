/**
 * DOM-to-canvas rasterizer shared by every printer driver (Niimbot,
 * ESC/POS, ZPL, ...). Not html2canvas: it reliably hung on this page —
 * likely due to the fixed-position toolbar buttons — and pulls in ~200KB
 * for a job this simple. This renderer walks #netbox-qr-root drawing each
 * <canvas>/<img> and each leaf element's own text, which covers the
 * realistic case for a small label (a QR code plus a couple of short text
 * lines) without the cost/fragility of full arbitrary-CSS rendering.
 */
(function () {
	function isPrintUi(el) {
		return el.classList && (
			el.classList.contains('netbox-qr-print-btn') ||
			el.classList.contains('netbox-qr-niimbot-btn')
		);
	}

	function ownText(node) {
		var text = '';
		for (var i = 0; i < node.childNodes.length; i++) {
			var child = node.childNodes[i];
			if (child.nodeType === Node.TEXT_NODE) {
				text += child.textContent;
			}
		}
		return text.trim();
	}

	function drawNode(ctx, node, rootRect, scale) {
		if (node.nodeType !== Node.ELEMENT_NODE || isPrintUi(node)) {
			return;
		}
		var rect = node.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) {
			return;
		}
		var x = (rect.left - rootRect.left) * scale;
		var y = (rect.top - rootRect.top) * scale;
		var w = rect.width * scale;
		var h = rect.height * scale;

		if (node.tagName === 'CANVAS' || (node.tagName === 'IMG' && node.complete)) {
			ctx.drawImage(node, x, y, w, h);
			return;
		}

		for (var i = 0; i < node.children.length; i++) {
			drawNode(ctx, node.children[i], rootRect, scale);
		}

		var text = ownText(node);
		if (text) {
			var cs = getComputedStyle(node);
			if (cs.textTransform === 'uppercase') {
				text = text.toUpperCase();
			} else if (cs.textTransform === 'lowercase') {
				text = text.toLowerCase();
			} else if (cs.textTransform === 'capitalize') {
				text = text.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
			}
			ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + (parseFloat(cs.fontSize) * scale) + 'px ' + cs.fontFamily;
			if ('letterSpacing' in ctx) {
				ctx.letterSpacing = (parseFloat(cs.letterSpacing) || 0) * scale + 'px';
			}
			ctx.fillStyle = cs.color;
			ctx.textBaseline = 'middle';
			ctx.textAlign = cs.textAlign === 'center' || cs.textAlign === 'right' ? cs.textAlign : 'left';
			var textX = ctx.textAlign === 'right' ? x + w : ctx.textAlign === 'center' ? x + w / 2 : x;
			ctx.fillText(text, textX, y + h / 2, w);
		}
	}

	function rasterizeLabel(dpi) {
		var root = document.getElementById('netbox-qr-root');
		var rootRect = root.getBoundingClientRect();
		var scale = dpi / 96; // labels are laid out at 96px/inch (CSS mm units); scale up to the printer's native DPI

		var canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(rootRect.width * scale));
		canvas.height = Math.max(1, Math.round(rootRect.height * scale));

		var ctx = canvas.getContext('2d');
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		drawNode(ctx, root, rootRect, scale);

		return canvas;
	}

	// Shared 1-bit monochrome conversion for protocols (ESC/POS, ZPL, ...)
	// that print raw bitmap data rather than accepting a color image —
	// threshold-based, no dithering: fine for high-contrast QR/text labels.
	function toMonochromeBitmap(canvas, threshold) {
		threshold = threshold || 128;
		var ctx = canvas.getContext('2d');
		var image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		var widthBytes = (canvas.width + 7) >> 3;
		var bytes = new Uint8Array(widthBytes * canvas.height);

		for (var y = 0; y < canvas.height; y++) {
			for (var x = 0; x < canvas.width; x++) {
				var idx = (y * canvas.width + x) * 4;
				var luminance = 0.299 * image[idx] + 0.587 * image[idx + 1] + 0.114 * image[idx + 2];
				var alpha = image[idx + 3];
				if (alpha > 0 && luminance < threshold) {
					var byteIndex = y * widthBytes + (x >> 3);
					bytes[byteIndex] |= 0x80 >> (x & 7);
				}
			}
		}
		return { bytes: bytes, widthBytes: widthBytes, height: canvas.height };
	}

	// Single source of truth for driver-name -> implementation lookup, used by
	// every surface that offers a "Print via…" choice (render.html, the object
	// detail panel, bulk print) instead of each reimplementing its own
	// if/else chain over 'niimbot'/'zpl'/'escpos' that has to be kept in sync
	// by hand. Looked up lazily by global name (not a plain object built at
	// load time) since niimbot-print.js/zpl-print.js/escpos-print.js are only
	// loaded — and only define these globals — when show_niimbot_button is on.
	var DRIVER_GLOBALS = {
		niimbot: 'NetBoxQRNiimbot',
		zpl: 'NetBoxQRZpl',
		escpos: 'NetBoxQREscPos',
	};

	function getDriver(name) {
		var globalName = DRIVER_GLOBALS[name];
		return globalName ? window[globalName] : null;
	}

	window.NetBoxQRPrintCommon = {
		rasterizeLabel: rasterizeLabel,
		toMonochromeBitmap: toMonochromeBitmap,
		getDriver: getDriver,
	};
})();
