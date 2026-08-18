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

// The real vendored QRCode() exposes the resulting module count via
// `this._oQRCode.getModuleCount()` (see qrcode.js's makeCode/Drawing) — this
// mock reproduces just that shape, keyed by the numeric correctLevel value
// each candidate probe is called with, so "auto" selection can be tested
// against controlled scenarios without needing real QR capacity math.
function mockQRCodeWithModuleCounts(moduleCountByLevel) {
  const mock = jest.fn(function (el, opts) {
    this._oQRCode = { getModuleCount: () => moduleCountByLevel[opts.correctLevel] };
  });
  mock.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  return mock;
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
  test('falls back to the global value, 200x200/black-on-white, and "auto" error correction when attributes are absent', () => {
    // Equal module counts at every level means auto-selection lands on H
    // (the first candidate checked) — same as an explicit data-correct-level="auto"
    // would for a short value (see the "auto" describe block below); this just
    // confirms an element with no data-correct-level attribute at all goes
    // through that same auto-selection path, not a fixed level.
    global.QRCode = mockQRCodeWithModuleCounts({ 2: 21, 3: 21, 0: 21, 1: 21 });
    document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'GLOBAL-VALUE' }) + '<div data-netbox-qr></div>';
    jest.resetModules();
    delete window.NetBoxQR;
    require(SCRIPT_PATH);

    const realEl = document.querySelector('[data-netbox-qr]');
    expect(realEl.getAttribute('data-netbox-qr')).toBe('');
    const realCall = global.QRCode.mock.calls.find((call) => call[0] === realEl);
    expect(realCall[1]).toEqual({
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

  test('clears the element\'s raw bound text before drawing, so it does not leak next to the QR code', () => {
    // The real vendored QRCode() constructor only *appends* a <canvas>/<img>
    // to the element — it never clears any pre-existing content first (see
    // qrcode.js's Drawing constructor). Reproduces that exact append-only
    // behavior here (rather than the other tests' plain jest.fn(), which
    // touches the DOM not at all) to prove the raw "https://…" text this
    // element started with is actually gone by the time QRCode() runs, not
    // just that QRCode() was called with the right value.
    global.QRCode = jest.fn(function (el) {
      el.appendChild(document.createElement('canvas'));
    });
    global.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
    document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'x' }) +
      '<div data-netbox-qr>https://netbox.example/dcim/devices/1/</div>';
    jest.resetModules();
    delete window.NetBoxQR;
    require(SCRIPT_PATH);

    const el = document.querySelector('[data-netbox-qr]');
    expect(el.textContent).toBe('');
    expect(el.querySelector('canvas')).not.toBeNull();
  });

  describe('"auto" error correction level', () => {
    function loadWithAutoLevel(moduleCountByLevel, text) {
      global.QRCode = mockQRCodeWithModuleCounts(moduleCountByLevel);
      document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'x' }) +
        '<div data-netbox-qr data-correct-level="auto">' + text + '</div>';
      jest.resetModules();
      delete window.NetBoxQR;
      require(SCRIPT_PATH);
      const realEl = document.querySelector('[data-netbox-qr]');
      const realCall = global.QRCode.mock.calls.find((call) => call[0] === realEl);
      return realCall[1];
    }

    test('picks H when every level fits in the same module count (a short value has spare capacity)', () => {
      const opts = loadWithAutoLevel({ 2: 21, 3: 21, 0: 21, 1: 21 }, 'SHORT');
      expect(opts.correctLevel).toBe(2); // H
      expect(opts.text).toBe('SHORT');
    });

    test('falls back to L when only L avoids growing to a bigger module grid (a long value has no spare capacity)', () => {
      const opts = loadWithAutoLevel({ 2: 33, 3: 29, 0: 25, 1: 21 }, 'A LONG VALUE');
      expect(opts.correctLevel).toBe(1); // L
    });

    test('picks the strongest level that still matches the L baseline, not always an extreme', () => {
      const opts = loadWithAutoLevel({ 2: 25, 3: 25, 0: 21, 1: 21 }, 'MEDIUM VALUE');
      expect(opts.correctLevel).toBe(0); // M
    });

    test('an explicit (non-auto) level is used as-is, unaffected by the auto-selection path', () => {
      global.QRCode = mockQRCodeWithModuleCounts({});
      document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'x' }) +
        '<div data-netbox-qr data-correct-level="q">VALUE</div>';
      jest.resetModules();
      delete window.NetBoxQR;
      require(SCRIPT_PATH);

      expect(global.QRCode.mock.calls).toHaveLength(1); // no probes — auto-selection never runs
      expect(global.QRCode.mock.calls[0][1].correctLevel).toBe(3); // Q
    });

    test('falls back to H if the module-count probe itself throws, without aborting the real render', () => {
      global.QRCode = jest.fn(function () {
        throw new Error('probe failed');
      });
      global.QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
      document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'x' }) +
        '<div data-netbox-qr data-correct-level="auto">X</div>';
      jest.resetModules();
      delete window.NetBoxQR;
      require(SCRIPT_PATH);

      // First call is the L-baseline probe; since every call throws
      // (including this one), pickAutoCorrectLevel's own try/catch falls
      // back to H rather than letting that exception escape — the second,
      // real call (against the actual element) is then made with H, and
      // that one throwing is left to the existing per-element error
      // handling (error placeholder), not this fallback.
      expect(global.QRCode.mock.calls).toHaveLength(2);
      const realEl = document.querySelector('[data-netbox-qr]');
      expect(global.QRCode.mock.calls[1][0]).toBe(realEl);
      expect(global.QRCode.mock.calls[1][1].correctLevel).toBe(2); // H
    });
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
    // Pinned to a fixed level (rather than the "auto" default) so this test's
    // call count reflects one real draw per element, undisturbed by auto's
    // own extra probe-only QRCode() calls (covered separately above).
    loadRenderScript(
      jsonScript('netbox-qr-meta', { value: 'x' }) +
      '<div data-netbox-qr data-correct-level="H"></div><div data-netbox-qr data-correct-level="H"></div><div></div>'
    );

    expect(global.QRCode).toHaveBeenCalledTimes(2);
  });

  test('a thrown error from one element is caught, shown as a placeholder, and does not stop the others from drawing', () => {
    // Pinned to a fixed level so the mock's one-shot throw lands on the real
    // render call being tested here, not on auto's own preceding probe call.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'x' }) +
      '<div data-netbox-qr data-correct-level="H">bad</div><div data-netbox-qr data-correct-level="H">222</div>';
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
    // Pinned to a fixed level for the same reason as above — the throw must
    // land on the real render call, not auto's own preceding probe call.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    document.body.innerHTML = jsonScript('netbox-qr-meta', { value: 'x' }) +
      '<div data-netbox-qr data-element-id="qr-2" data-correct-level="H">bad</div>';
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
