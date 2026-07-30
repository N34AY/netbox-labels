/**
 * Prints to a Zebra printer over USB (Web Serial) using ZPL (Zebra
 * Programming Language) — the standard spoken by Zebra's desktop/industrial
 * label printers (GC/GX/ZD/GK series and similar).
 *
 * USB only, same reasoning as the generic ESC/POS driver: Zebra printers
 * that pair over Bluetooth use classic SPP, which Web Bluetooth (BLE/GATT
 * only) cannot reach from a browser.
 *
 * Exposes both a one-shot print() (single label: connect, print, disconnect)
 * and a connect()/printLabel()/disconnect() split — the latter lets a batch
 * job (qr-bulk-print.js) hold one open port across many labels instead of
 * re-prompting the device picker for every single one.
 */
(function () {
	var LOG_PREFIX = '[NetBoxQR/ZPL]';
	var DEFAULT_DPI = 203; // dots/inch — the most common Zebra printhead resolution
	var DEFAULT_BAUD_RATE = 9600;

	function toHex(bytes) {
		var hex = '';
		for (var i = 0; i < bytes.length; i++) {
			hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16).toUpperCase();
		}
		return hex;
	}

	function buildZpl(canvas) {
		var bitmap = NetBoxQRPrintCommon.toMonochromeBitmap(canvas);
		var totalBytes = bitmap.bytes.length;
		// ^GFA — ASCII-hex graphic field, uncompressed ("A" format).
		return (
			'^XA' +
			'^PW' + canvas.width +
			'^LL' + canvas.height +
			'^FO0,0^GFA,' + totalBytes + ',' + totalBytes + ',' + bitmap.widthBytes + ',' + toHex(bitmap.bytes) + '^FS' +
			'^XZ'
		);
	}

	async function connect(options) {
		options = options || {};
		var baudRate = options.baudRate || DEFAULT_BAUD_RATE;

		if (!navigator.serial) {
			throw new Error('Web Serial is not available in this browser — use Chrome or Edge.');
		}

		console.log(LOG_PREFIX, 'requesting USB device…');
		var port = await navigator.serial.requestPort();
		await port.open({ baudRate: baudRate });
		console.log(LOG_PREFIX, 'connected');

		var writer = port.writable.getWriter();
		return { port: port, writer: writer };
	}

	async function printLabel(conn, canvas) {
		var zpl = buildZpl(canvas);
		console.log(LOG_PREFIX, 'printing…');
		await conn.writer.write(new TextEncoder().encode(zpl));
		console.log(LOG_PREFIX, 'done');
	}

	async function disconnect(conn) {
		if (!conn) {
			return;
		}
		try {
			conn.writer.releaseLock();
		} catch (e) {
			// already released
		}
		try {
			await conn.port.close();
		} catch (e) {
			// already closed
		}
	}

	async function printToZpl(options) {
		options = options || {};
		var dpi = options.dpi || DEFAULT_DPI;

		console.log(LOG_PREFIX, 'starting print, dpi =', dpi);

		console.log(LOG_PREFIX, 'rasterizing label…');
		var canvas = NetBoxQRPrintCommon.rasterizeLabel(dpi);
		console.log(LOG_PREFIX, 'rasterized to', canvas.width + 'x' + canvas.height);

		var conn = await connect(options);
		try {
			await printLabel(conn, canvas);
		} catch (e) {
			console.error(LOG_PREFIX, 'print failed:', e);
			throw e;
		} finally {
			await disconnect(conn);
		}
	}

	window.NetBoxQRZpl = {
		print: printToZpl,
		connect: connect,
		printLabel: printLabel,
		disconnect: disconnect,
	};
})();
