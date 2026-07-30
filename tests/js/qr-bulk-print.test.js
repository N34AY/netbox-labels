'use strict';

const path = require('path');
const { bulkPrintFixtureHtml } = require('./helpers/bulk-print-fixture');

const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/qr-bulk-print.js');

const OBJECTS = [
  { id: 10, display: 'Site A' },
  { id: 11, display: 'Site B' },
];

function loadBulkPrint(objects) {
  document.body.innerHTML = bulkPrintFixtureHtml(objects || OBJECTS);
  window.NETBOX_QR_BULK_RENDER_URL_TEMPLATE = '/plugins/labels/render/18/0/0/';
  window.NETBOX_QR_BULK_SHEET_URL = '/plugins/labels/bulk-print/sheet/';
  window.NETBOX_QR_BULK_CONTENT_TYPE_ID = '18';
  jest.resetModules();
  jest.isolateModules(() => {
    require(SCRIPT_PATH);
  });
}

function selectTemplate(templateId) {
  document.querySelector('[data-template-id="' + templateId + '"]').click();
}

describe('driver/page-format panel toggling', () => {
  test('showing page formats swaps d-flex/d-none on both panels together', () => {
    loadBulkPrint();
    window.netboxQrBulkShowPageFormats();

    const driverOptions = document.getElementById('qr-bulk-driver-options');
    const pageFormatOptions = document.getElementById('qr-bulk-page-format-options');
    expect(driverOptions.classList.contains('d-none')).toBe(true);
    expect(driverOptions.classList.contains('d-flex')).toBe(false);
    expect(pageFormatOptions.classList.contains('d-flex')).toBe(true);
    expect(pageFormatOptions.classList.contains('d-none')).toBe(false);
  });

  test('showing driver options reverses it', () => {
    loadBulkPrint();
    window.netboxQrBulkShowPageFormats();
    window.netboxQrBulkShowDriverOptions();

    const driverOptions = document.getElementById('qr-bulk-driver-options');
    const pageFormatOptions = document.getElementById('qr-bulk-page-format-options');
    expect(driverOptions.classList.contains('d-flex')).toBe(true);
    expect(pageFormatOptions.classList.contains('d-none')).toBe(true);
  });
});

describe('template selection', () => {
  test('picking a template marks it active and enables the print button', () => {
    loadBulkPrint();
    selectTemplate(1);

    expect(document.querySelector('[data-template-id="1"]').classList.contains('active')).toBe(true);
    expect(document.getElementById('qr-bulk-print-btn').disabled).toBe(false);
  });

  test('picking a different template deactivates the previous one', () => {
    loadBulkPrint();
    selectTemplate(1);
    selectTemplate(2);

    expect(document.querySelector('[data-template-id="1"]').classList.contains('active')).toBe(false);
    expect(document.querySelector('[data-template-id="2"]').classList.contains('active')).toBe(true);
  });
});

describe('netboxQrBulkPrintSheet', () => {
  let submitSpy;

  beforeEach(() => {
    submitSpy = jest.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function () {
      this._submittedFields = Array.from(this.querySelectorAll('input')).map((input) => [input.name, input.value]);
    });
  });

  afterEach(() => {
    submitSpy.mockRestore();
  });

  test('builds and submits a hidden form with the template, page format, and every selected object', () => {
    loadBulkPrint();
    selectTemplate(2);

    window.netboxQrBulkPrintSheet('A4');

    expect(submitSpy).toHaveBeenCalledTimes(1);
    const form = submitSpy.mock.instances[0];
    expect(form._submittedFields).toEqual([
      ['csrfmiddlewaretoken', ''],
      ['content_type_id', '18'],
      ['template_id', '2'],
      ['page_format', 'A4'],
      ['object_id', '10'],
      ['object_id', '11'],
    ]);
    // The form is removed from the DOM again right after submitting.
    expect(document.body.contains(form)).toBe(false);
  });

  test('does nothing when no template is selected', () => {
    loadBulkPrint();
    window.netboxQrBulkPrintSheet('A4');
    expect(submitSpy).not.toHaveBeenCalled();
  });
});

// runBatch() rasterizes each object by loading its render.html page into a
// hidden worker iframe and asking that document to rasterize itself via
// postMessage (see rasterizeObject() in qr-bulk-print.js and the
// 'netbox-qr-rasterize-request' handler in render.html). jsdom doesn't
// actually navigate iframes or decode images, so this drives that handshake
// by hand: fire the iframe's 'load' event, then reply on `window` with the
// same message shape render.html would post back, with Image and
// canvas.getContext mocked out so the resulting <img>/<canvas> plumbing
// doesn't require real image decoding or a real 2D canvas.
describe('runBatch (via netboxQrBulkStart)', () => {
  let getContextSpy;

  beforeEach(() => {
    getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: jest.fn() });
    global.Image = class {
      set src(value) {
        this._src = value;
        Promise.resolve().then(() => { if (this.onload) this.onload(); });
      }
      get src() { return this._src; }
    };
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    delete global.Image;
  });

  async function flush(times) {
    for (let i = 0; i < (times || 6); i++) {
      await Promise.resolve();
    }
  }

  async function respondToRasterizeRequest(width, height) {
    // Wait for rasterizeObject() to have attached its 'load' listener and
    // set workerIframe.src.
    await flush();
    document.getElementById('qr-bulk-worker-iframe').dispatchEvent(new Event('load'));
    await flush();
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'netbox-qr-rasterize-response', width: width || 10, height: height || 10, dataUrl: 'data:image/png;base64,x' },
    }));
    await flush();
  }

  test('prints every object over one connection and marks each as done', async () => {
    loadBulkPrint();
    selectTemplate(1);

    const connectCalls = [];
    const impl = {
      connect: jest.fn(async (transport) => { connectCalls.push(transport); return { name: 'conn' }; }),
      printLabel: jest.fn(async () => {}),
      disconnect: jest.fn(async () => {}),
    };
    window.NetBoxQRPrintCommon = { getDriver: jest.fn(() => impl) };

    window.netboxQrBulkStart('niimbot', 'bluetooth');
    await respondToRasterizeRequest();
    await respondToRasterizeRequest();
    await flush();

    expect(connectCalls).toEqual(['bluetooth']);
    expect(impl.printLabel).toHaveBeenCalledTimes(2);
    expect(impl.disconnect).toHaveBeenCalledTimes(1);
    expect(document.getElementById('qr-bulk-status-10').textContent).toBe('Done');
    expect(document.getElementById('qr-bulk-status-11').textContent).toBe('Done');
    expect(document.getElementById('qr-bulk-progress-count').textContent).toBe('2');
    expect(document.getElementById('qr-bulk-print-btn').disabled).toBe(false);
  });

  test('a failure stops the batch, reports the failing object, and preserves prior progress for Continue', async () => {
    loadBulkPrint();
    selectTemplate(1);

    const impl = {
      connect: jest.fn(async () => ({ name: 'conn' })),
      printLabel: jest.fn()
        .mockImplementationOnce(async () => {}) // object 10 succeeds
        .mockImplementationOnce(async () => { throw new Error('printer offline'); }), // object 11 fails
      disconnect: jest.fn(async () => {}),
    };
    window.NetBoxQRPrintCommon = { getDriver: jest.fn(() => impl) };

    window.netboxQrBulkStart('niimbot', 'bluetooth');
    await respondToRasterizeRequest();
    await respondToRasterizeRequest();
    await flush();

    expect(document.getElementById('qr-bulk-status-10').textContent).toBe('Done');
    expect(document.getElementById('qr-bulk-status-11').textContent).toBe('Failed');
    expect(document.getElementById('qr-bulk-error-footer').style.display).toBe('block');
    expect(document.getElementById('qr-bulk-error-message').textContent).toBe('Site B: printer offline');
    expect(impl.disconnect).toHaveBeenCalledTimes(1);
    expect(document.getElementById('qr-bulk-print-btn').disabled).toBe(false);

    // Continue only re-attempts objects that never reached 'success'.
    impl.printLabel.mockReset().mockImplementation(async () => {});
    document.getElementById('qr-bulk-continue-btn').click();
    await respondToRasterizeRequest();
    await flush();

    expect(impl.printLabel).toHaveBeenCalledTimes(1); // only the previously-failed object
    expect(document.getElementById('qr-bulk-status-11').textContent).toBe('Done');
    expect(document.getElementById('qr-bulk-progress-count').textContent).toBe('2');
  });

  test('reset clears every status back to pending', async () => {
    loadBulkPrint();
    selectTemplate(1);
    const impl = { connect: jest.fn(async () => ({})), printLabel: jest.fn(async () => {}), disconnect: jest.fn(async () => {}) };
    window.NetBoxQRPrintCommon = { getDriver: jest.fn(() => impl) };

    window.netboxQrBulkStart('niimbot', 'bluetooth');
    await respondToRasterizeRequest();
    await respondToRasterizeRequest();
    await flush();

    document.getElementById('qr-bulk-reset-btn').click();

    expect(document.getElementById('qr-bulk-status-10').textContent).toBe('Pending');
    expect(document.getElementById('qr-bulk-status-11').textContent).toBe('Pending');
    expect(document.getElementById('qr-bulk-error-footer').style.display).toBe('none');
  });
});
