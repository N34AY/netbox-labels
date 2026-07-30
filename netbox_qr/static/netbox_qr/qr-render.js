/**
 * Bridges the JSON blobs injected by netbox_qr/render.html into a
 * window.NetBoxQR global, then draws a QR code into every
 * [data-netbox-qr] element on the page using the vendored QRCode library.
 */
(function () {
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

	document.querySelectorAll('[data-netbox-qr]').forEach(function (el) {
		var correctLevelName = (el.getAttribute('data-correct-level') || 'H').toUpperCase();
		new QRCode(el, {
			text: el.getAttribute('data-value') || window.NetBoxQR.value,
			width: parseInt(el.getAttribute('data-width'), 10) || 200,
			height: parseInt(el.getAttribute('data-height'), 10) || 200,
			colorDark: el.getAttribute('data-color-dark') || '#000000',
			colorLight: el.getAttribute('data-color-light') || '#ffffff',
			correctLevel: QRCode.CorrectLevel[correctLevelName] ?? QRCode.CorrectLevel.H,
		});
	});
})();
