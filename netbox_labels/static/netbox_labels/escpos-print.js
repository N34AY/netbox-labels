/**
 * Prints to a generic ESC/POS thermal/label printer over USB (Web Serial).
 * ESC/POS (Epson's de-facto standard) is what the vast majority of
 * unbranded Bluetooth/USB thermal label printers speak — unlike Niimbot's
 * own protocol, it isn't tied to one vendor's app/SDK.
 *
 * Bluetooth isn't offered for this driver: these printers overwhelmingly
 * pair over classic Bluetooth SPP, which the Web Bluetooth API (BLE/GATT
 * only) cannot reach from a browser at all — USB is the only realistic
 * transport here.
 *
 * Exposes both a one-shot print() (single label: connect, print, disconnect)
 * and a connect()/printLabel()/disconnect() split — the latter lets a batch
 * job (qr-bulk-print.js) hold one open port across many labels instead of
 * re-prompting the device picker for every single one.
 */
(function () {
	var LOG_PREFIX = '[NetBoxQR/ESC-POS]';
	var DEFAULT_DPI = 203; // dots/inch — the near-universal resolution for these printers
	var DEFAULT_BAUD_RATE = 9600;

	var ESC = 0x1B;
	var GS = 0x1D;

	function buildRasterCommand(canvas) {
		var bitmap = NetBoxQRPrintCommon.toMonochromeBitmap(canvas);
		// GS v 0 — print raster bit image, normal mode.
		var header = new Uint8Array([
			GS, 0x76, 0x30, 0x00,
			bitmap.widthBytes & 0xff, (bitmap.widthBytes >> 8) & 0xff,
			bitmap.height & 0xff, (bitmap.height >> 8) & 0xff,
		]);
		var trailer = new Uint8Array([0x0a, 0x0a, 0x0a, 0x0a]); // feed past the tear bar
		var out = new Uint8Array(header.length + bitmap.bytes.length + trailer.length);
		out.set(header, 0);
		out.set(bitmap.bytes, header.length);
		out.set(trailer, header.length + bitmap.bytes.length);
		return out;
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
		await writer.write(new Uint8Array([ESC, 0x40])); // ESC @ — initialize
		return { port: port, writer: writer };
	}

	async function printLabel(conn, canvas) {
		var data = buildRasterCommand(canvas);
		console.log(LOG_PREFIX, 'printing…');
		await conn.writer.write(data);
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

	async function printToEscPos(options) {
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

	window.NetBoxQREscPos = {
		print: printToEscPos,
		connect: connect,
		printLabel: printLabel,
		disconnect: disconnect,
	};
})();
