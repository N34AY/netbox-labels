/**
 * Prints to a Niimbot printer over Web Bluetooth or USB (Web Serial).
 *
 * Uses niimbluelib (vendored, MIT) for the printer protocol. Rasterization
 * is shared with the other printer drivers — see qr-print-common.js.
 *
 * Exposes both a one-shot print() (single label: connect, print, disconnect)
 * and a connect()/printLabel()/disconnect() split — the latter lets a batch
 * job (qr-bulk-print.js) hold one open connection across many labels instead
 * of re-prompting the device picker for every single one.
 */
(function () {
	var LOG_PREFIX = '[NetBoxQR/Niimbot]';
	// Print task names (niimbluelib's internal protocol implementations, e.g.
	// "B1"/"D110"/"D110M_V4"/"H1S") are NOT the same as printer model names
	// (e.g. "D110_M") — a task implementation is shared across several
	// models. 'B1' is the correct task for a D110/D110_M on the default
	// (v1) protocol; client.getPrintTaskType() below auto-detects the right
	// one (including newer protocol versions) from the connected device.
	var FALLBACK_PRINT_TASK_NAME = 'B1';
	var DEFAULT_DPI = 203;
	var DEFAULT_PRINT_DIRECTION = 'left';

	async function connect(transport) {
		transport = transport || 'bluetooth';

		if (transport === 'serial') {
			if (!navigator.serial) {
				throw new Error('Web Serial is not available in this browser — use Chrome or Edge.');
			}
		} else if (!navigator.bluetooth) {
			throw new Error('Web Bluetooth is not available in this browser — use Chrome or Edge.');
		}

		var client = niimbluelib.instantiateClient(transport);
		console.log(LOG_PREFIX, transport === 'serial' ? 'requesting USB device…' : 'requesting Bluetooth device…');
		await client.connect();
		console.log(LOG_PREFIX, 'connected');
		return client;
	}

	async function printLabel(client, canvas, options) {
		options = options || {};
		var printDirection = options.printDirection || DEFAULT_PRINT_DIRECTION;

		var printTaskName = client.getPrintTaskType() || options.printTaskName || FALLBACK_PRINT_TASK_NAME;
		console.log(LOG_PREFIX, 'print task =', printTaskName);

		var encoded = niimbluelib.ImageEncoder.encodeCanvas(canvas, printDirection);

		var printTask = client.abstraction.newPrintTask(printTaskName, {
			totalPages: 1,
			statusPollIntervalMs: 100,
			statusTimeoutMs: 8000,
		});

		console.log(LOG_PREFIX, 'printing…');
		await printTask.printInit();
		await printTask.printPage(encoded, 1);
		await printTask.waitForPageFinished();
		await printTask.waitForFinished();
		await printTask.printEnd();
		console.log(LOG_PREFIX, 'done');
	}

	function disconnect(client) {
		if (client) {
			client.disconnect();
		}
	}

	async function printToNiimbot(options) {
		options = options || {};
		var dpi = options.dpi || DEFAULT_DPI;
		var transport = options.transport || 'bluetooth';

		console.log(LOG_PREFIX, 'starting print, dpi =', dpi, ', transport =', transport);

		console.log(LOG_PREFIX, 'rasterizing label…');
		var canvas = NetBoxQRPrintCommon.rasterizeLabel(dpi);
		console.log(LOG_PREFIX, 'rasterized to', canvas.width + 'x' + canvas.height);

		var client = await connect(transport);
		try {
			await printLabel(client, canvas, options);
		} catch (e) {
			console.error(LOG_PREFIX, 'print failed:', e);
			throw e;
		} finally {
			disconnect(client);
		}
	}

	window.NetBoxQRNiimbot = {
		print: printToNiimbot,
		connect: connect,
		printLabel: printLabel,
		disconnect: disconnect,
	};
})();
