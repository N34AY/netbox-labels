'use strict';

const path = require('path');
const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/barcode-render.js');

function loadRenderScript(bodyHtml) {
  document.body.innerHTML = bodyHtml;
  global.JsBarcode = jest.fn();
  jest.resetModules();
  require(SCRIPT_PATH);
}

afterEach(() => {
  delete global.JsBarcode;
  jest.restoreAllMocks();
});

describe('barcode rendering into .netbox-labels-barcode canvases', () => {
  test('draws with the value read from the canvas\'s own text content, trimmed', () => {
    loadRenderScript('<canvas class="netbox-labels-barcode">  12345  </canvas>');

    expect(global.JsBarcode).toHaveBeenCalledTimes(1);
    const [el, value] = global.JsBarcode.mock.calls[0];
    expect(el.classList.contains('netbox-labels-barcode')).toBe(true);
    expect(value).toBe('12345');
  });

  test('falls back to CODE128 and #000000 when data-* attributes are absent', () => {
    loadRenderScript('<canvas class="netbox-labels-barcode">12345</canvas>');

    const opts = global.JsBarcode.mock.calls[0][2];
    expect(opts).toEqual({
      format: 'CODE128',
      lineColor: '#000000',
      background: 'transparent',
      displayValue: false,
      margin: 0,
    });
  });

  test('reads format/color from data-barcode-format/data-barcode-color', () => {
    loadRenderScript(
      '<canvas class="netbox-labels-barcode" data-barcode-format="EAN13" data-barcode-color="#ff0000">4006381333931</canvas>'
    );

    const [, value, opts] = global.JsBarcode.mock.calls[0];
    expect(value).toBe('4006381333931');
    expect(opts.format).toBe('EAN13');
    expect(opts.lineColor).toBe('#ff0000');
  });

  test('renders one barcode per matching canvas on the page', () => {
    loadRenderScript(
      '<canvas class="netbox-labels-barcode">111</canvas>' +
      '<canvas class="netbox-labels-barcode">222</canvas>' +
      '<canvas></canvas>'
    );

    expect(global.JsBarcode).toHaveBeenCalledTimes(2);
  });

  test('a thrown error from one canvas is caught and does not stop the others from drawing', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.JsBarcode = jest.fn().mockImplementationOnce(() => {
      throw new Error('bad value');
    });
    document.body.innerHTML =
      '<canvas class="netbox-labels-barcode">bad</canvas>' +
      '<canvas class="netbox-labels-barcode">222</canvas>';
    jest.resetModules();
    require(SCRIPT_PATH);

    expect(global.JsBarcode).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith('[NetBoxQR/Barcode]', 'render failed:', expect.any(Error));
  });

  test('a canvas whose value JsBarcode rejects gets an error tooltip instead of staying silently blank', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.JsBarcode = jest.fn().mockImplementationOnce(() => {
      throw new Error('"bad" is not a valid input for EAN13');
    });
    document.body.innerHTML = '<canvas class="netbox-labels-barcode">bad</canvas>';
    jest.resetModules();
    require(SCRIPT_PATH);

    const canvas = document.querySelector('.netbox-labels-barcode');
    expect(canvas.title).toBe('[NetBoxQR/Barcode] "bad" is not a valid input for EAN13');
  });

  test('when embedded in an iframe, a rejected value is reported to the parent window, prefixed with the element id', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    global.JsBarcode = jest.fn().mockImplementationOnce(() => {
      throw new Error('bad value');
    });
    document.body.innerHTML = '<canvas class="netbox-labels-barcode" data-element-id="barcode-3">bad</canvas>';
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    const postMessage = jest.fn();
    Object.defineProperty(window, 'parent', { value: { postMessage }, configurable: true });
    jest.resetModules();
    require(SCRIPT_PATH);

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'netbox-qr-client-error', source: 'barcode', errors: ['barcode-3: bad value'] },
      '*'
    );

    Object.defineProperty(window, 'top', { value: window, configurable: true });
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
  });

  test('does not post a message to the parent when not embedded in an iframe', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(window, 'postMessage');
    global.JsBarcode = jest.fn().mockImplementationOnce(() => {
      throw new Error('bad value');
    });
    document.body.innerHTML = '<canvas class="netbox-labels-barcode">bad</canvas>';
    jest.resetModules();
    require(SCRIPT_PATH);

    expect(window.postMessage).not.toHaveBeenCalled();
  });
});
