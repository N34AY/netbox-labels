'use strict';

const path = require('path');
const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/qr-render.js');

function jsonScript(id, value) {
  return `<script id="${id}" type="application/json">${JSON.stringify(value)}</script>`;
}

function loadRenderScript(bodyHtml) {
  document.body.innerHTML = bodyHtml;
  global.QRCode = jest.fn();
  global.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  jest.resetModules();
  delete window.NetBoxQR;
  require(SCRIPT_PATH);
}

describe('window.NetBoxQR population', () => {
  test('reads value/objectType/objectId from the meta json_script tag', () => {
    loadRenderScript(jsonScript('netbox-qr-meta', {
      value: 'https://netbox.example/dcim/sites/1/',
      objectType: 'dcim.site',
      objectTypeId: 18,
      objectId: 1,
    }));

    expect(window.NetBoxQR).toMatchObject({
      value: 'https://netbox.example/dcim/sites/1/',
      objectType: 'dcim.site',
      objectTypeId: 18,
      objectId: 1,
    });
  });

  test('defaults gracefully when the meta tag is entirely absent', () => {
    loadRenderScript('');

    expect(window.NetBoxQR).toMatchObject({
      value: '',
      objectType: null,
      objectTypeId: null,
      objectId: null,
      objectData: null,
    });
  });

  test('reads object data when present, and leaves it null when absent', () => {
    loadRenderScript(jsonScript('netbox-qr-meta', { value: 'x' }) + jsonScript('netbox-qr-object-data', { name: 'Site 1' }));
    expect(window.NetBoxQR.objectData).toEqual({ name: 'Site 1' });
  });
});

describe('QR code rendering into [data-netbox-qr] elements', () => {
  test('falls back to the global value and 200x200/black-on-white/H when attributes are absent', () => {
    loadRenderScript(jsonScript('netbox-qr-meta', { value: 'GLOBAL-VALUE' }) + '<div data-netbox-qr></div>');

    expect(global.QRCode).toHaveBeenCalledTimes(1);
    const [el, opts] = global.QRCode.mock.calls[0];
    expect(el.getAttribute('data-netbox-qr')).toBe('');
    expect(opts).toEqual({
      text: 'GLOBAL-VALUE',
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: 2, // H
    });
  });

  test('a per-element data-value overrides the global QR value', () => {
    loadRenderScript(
      jsonScript('netbox-qr-meta', { value: 'GLOBAL-VALUE' }) +
      '<div data-netbox-qr data-value="PER-ELEMENT"></div>'
    );

    expect(global.QRCode.mock.calls[0][1].text).toBe('PER-ELEMENT');
  });

  test("the element's own inner text (a per-element binding rendered by layout.py) overrides both data-value and the global value", () => {
    loadRenderScript(
      jsonScript('netbox-qr-meta', { value: 'GLOBAL-VALUE' }) +
      '<div data-netbox-qr data-value="DATA-VALUE">  https://netbox.example/dcim/sites/1/  </div>'
    );

    expect(global.QRCode.mock.calls[0][1].text).toBe('https://netbox.example/dcim/sites/1/');
  });

  test('parses width/height/colors/correct-level from data attributes', () => {
    loadRenderScript(
      jsonScript('netbox-qr-meta', { value: 'x' }) +
      '<div data-netbox-qr data-width="80" data-height="80" data-color-dark="#111111" data-color-light="#eeeeee" data-correct-level="l"></div>'
    );

    expect(global.QRCode.mock.calls[0][1]).toMatchObject({
      width: 80,
      height: 80,
      colorDark: '#111111',
      colorLight: '#eeeeee',
      correctLevel: 1, // L
    });
  });

  test('falls back to H for an unrecognized correct-level value', () => {
    loadRenderScript(
      jsonScript('netbox-qr-meta', { value: 'x' }) +
      '<div data-netbox-qr data-correct-level="bogus"></div>'
    );

    expect(global.QRCode.mock.calls[0][1].correctLevel).toBe(2); // H
  });

  test('renders one QR code per matching element on the page', () => {
    loadRenderScript(
      jsonScript('netbox-qr-meta', { value: 'x' }) +
      '<div data-netbox-qr></div><div data-netbox-qr></div><div></div>'
    );

    expect(global.QRCode).toHaveBeenCalledTimes(2);
  });

  test('a thrown error from one element is caught, shown as a placeholder, and does not stop the others from drawing', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'x' }) + '<div data-netbox-qr>bad</div><div data-netbox-qr>222</div>';
    global.QRCode = jest.fn().mockImplementationOnce(() => {
      throw new Error('bad value');
    });
    global.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
    jest.resetModules();
    delete window.NetBoxQR;
    require(SCRIPT_PATH);

    expect(global.QRCode).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith('[NetBoxQR]', 'render failed:', expect.any(Error));

    const [bad, ok] = document.querySelectorAll('[data-netbox-qr]');
    expect(bad.title).toBe('[NetBoxQR] bad value');
    expect(bad.textContent).toBe('!');
    expect(ok.title).toBe('');
  });

  test('when embedded in an iframe, a rejected value is reported to the parent window, prefixed with the element id', () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'x' }) + '<div data-netbox-qr data-element-id="qr-2">bad</div>';
    global.QRCode = jest.fn().mockImplementationOnce(() => {
      throw new Error('bad value');
    });
    global.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    const postMessage = jest.fn();
    Object.defineProperty(window, 'parent', { value: { postMessage }, configurable: true });
    jest.resetModules();
    delete window.NetBoxQR;
    require(SCRIPT_PATH);

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'netbox-qr-client-error', source: 'qr', errors: ['qr-2: bad value'] },
      '*'
    );

    Object.defineProperty(window, 'top', { value: window, configurable: true });
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
  });
});
