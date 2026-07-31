'use strict';

const path = require('path');
const { designerFixtureHtml } = require('./helpers/designer-fixture');

const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/qr-designer.js');
const BASE_PX_PER_MM = 8;

// Waits for pending promise chains (e.g. fetch().then(r => r.json()).then(...))
// to settle, without having to count and match each test's own .then() depth
// by hand. A macrotask (setTimeout) runs after the whole microtask queue
// drains, so this flushes any number of chained .then()s in one await,
// unlike `Promise.resolve().then().then()...`.
function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// qr-designer.js attaches a handful of listeners directly on `document`
// (keydown/mousemove/mouseup), which in a real page load once per navigation.
// jsdom keeps a single `document` for this whole test file though, so without
// this bookkeeping those listeners would pile up across every loadDesigner()
// call and keep firing — against their own, by-then-detached DOM — alongside
// the current test's. Undo/redo/delete happen to self-null and no-op safely
// in that situation, but it's not something to rely on in general, so each
// load detaches whatever the previous one registered before requiring fresh.
let trackedDocumentListeners = [];

function loadDesigner(fixtureOptions) {
  trackedDocumentListeners.forEach(({ type, handler, options }) => {
    document.removeEventListener(type, handler, options);
  });
  trackedDocumentListeners = [];

  document.body.innerHTML = designerFixtureHtml(fixtureOptions);

  const originalAddEventListener = document.addEventListener.bind(document);
  document.addEventListener = function (type, handler, options) {
    trackedDocumentListeners.push({ type, handler, options });
    return originalAddEventListener(type, handler, options);
  };
  try {
    jest.resetModules();
    jest.isolateModules(() => {
      require(SCRIPT_PATH);
    });
  } finally {
    document.addEventListener = originalAddEventListener;
  }
}

function els() {
  return {
    canvas: document.getElementById('qr-canvas'),
    undo: document.getElementById('qr-undo'),
    redo: document.getElementById('qr-redo'),
    zoomIn: document.getElementById('qr-zoom-in'),
    zoomOut: document.getElementById('qr-zoom-out'),
    zoomReset: document.getElementById('qr-zoom-reset'),
    zoomLabel: document.getElementById('qr-zoom-label'),
    gridToggle: document.getElementById('qr-grid-toggle'),
    gridSizeLabel: document.getElementById('qr-grid-size-label'),
    gridSizeOption: function (value) {
      return document.querySelector('.qr-grid-size-option[data-value="' + value + '"]');
    },
    addText: document.getElementById('qr-add-text'),
    addQr: document.getElementById('qr-add-qr'),
    addBarcode: document.getElementById('qr-add-barcode'),
    properties: document.getElementById('qr-properties-body'),
    widthInput: document.getElementById('qr-canvas-width'),
    heightInput: document.getElementById('qr-canvas-height'),
    dimsLabel: document.getElementById('qr-dims-label'),
    saveForm: document.getElementById('qr-save-form'),
    layoutJsonInput: document.getElementById('qr-layout-json'),
    widthMmInput: document.getElementById('qr-width-mm-input'),
    heightMmInput: document.getElementById('qr-height-mm-input'),
    previewIframe: document.getElementById('qr-preview-iframe'),
    previewBtn: document.getElementById('qr-preview-btn'),
    previewModeObjectBtn: document.getElementById('qr-preview-mode-object'),
    previewContentType: document.getElementById('qr-preview-content-type'),
    previewSearch: document.getElementById('qr-preview-search'),
    previewResults: document.getElementById('qr-preview-results'),
    previewError: document.getElementById('qr-preview-error'),
    previewDataWrapper: document.getElementById('qr-preview-data-wrapper'),
  };
}

function qrEls() {
  return Array.from(document.querySelectorAll('.qr-el'));
}

function mousedown(el, x, y) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
}
function mousemove(x, y) {
  document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
}
function mouseup() {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

const TEXT_EL = { id: 'text-1', type: 'text', x_mm: 2, y_mm: 2, width_mm: 20, height_mm: 5, binding: 'static', text: 'Hello' };
const QR_EL = { id: 'qr-1', type: 'qr', x_mm: 5, y_mm: 5, width_mm: 10, height_mm: 10, correct_level: 'H' };
const BARCODE_EL = { id: 'barcode-1', type: 'barcode', x_mm: 2, y_mm: 2, width_mm: 30, height_mm: 10, barcode_format: 'EAN13', binding: 'object', color: '#000000' };

afterEach(() => {
  delete global.fetch;
});

describe('initial render', () => {
  test('draws one .qr-el per layout element, positioned/sized in px at zoom=1', () => {
    loadDesigner({ elements: [TEXT_EL] });
    const [div] = qrEls();
    expect(qrEls()).toHaveLength(1);
    expect(div.style.left).toBe(2 * BASE_PX_PER_MM + 'px');
    expect(div.style.top).toBe(2 * BASE_PX_PER_MM + 'px');
    expect(div.style.width).toBe(20 * BASE_PX_PER_MM + 'px');
    expect(div.style.height).toBe(5 * BASE_PX_PER_MM + 'px');
  });

  test('shows a static text element\'s own text as its preview content', () => {
    loadDesigner({ elements: [TEXT_EL] });
    expect(qrEls()[0].textContent).toBe('Hello');
  });

  test('shows Jinja2-ish placeholders for non-static bindings', () => {
    loadDesigner({
      elements: [
        { id: 't1', type: 'text', x_mm: 0, y_mm: 0, width_mm: 10, height_mm: 5, binding: 'object' },
        { id: 't2', type: 'text', x_mm: 0, y_mm: 6, width_mm: 10, height_mm: 5, binding: 'object_type' },
        { id: 't3', type: 'text', x_mm: 0, y_mm: 12, width_mm: 10, height_mm: 5, binding: 'custom', expr: 'object.status' },
      ],
    });
    const [a, b, c] = qrEls();
    expect(a.textContent).toBe('{{ object }}');
    expect(b.textContent).toBe('{{ object_type.model }}');
    expect(c.textContent).toBe('{{ object.status }}');
  });
});

describe('selection and properties panel', () => {
  test('selecting an element shows its x/y/width/height fields and a delete button', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    const { properties } = els();
    expect(properties.querySelector('[data-prop="x_mm"]').value).toBe('2');
    expect(properties.querySelector('[data-prop="width_mm"]').value).toBe('20');
    expect(document.getElementById('qr-delete-element')).not.toBeNull();
  });

  test('nothing selected shows the placeholder hint instead', () => {
    loadDesigner({ elements: [TEXT_EL] });
    expect(els().properties.textContent).toMatch(/Select an element/);
  });

  test('selecting a barcode element shows the shared binding UI plus format/color, but no text-only styling fields', () => {
    loadDesigner({ elements: [BARCODE_EL] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    const { properties } = els();
    expect(properties.querySelector('[data-prop="binding"]').value).toBe('object');
    expect(properties.querySelector('[data-prop="barcode_format"]').value).toBe('EAN13');
    expect(properties.querySelector('[data-prop="color"]')).not.toBeNull();
    expect(properties.querySelector('[data-prop="font_size_mm"]')).toBeNull();
    expect(properties.querySelector('[data-prop="text_align"]')).toBeNull();
  });

  test('switching a barcode element to a static binding shows a text field, mirroring text elements', () => {
    loadDesigner({ elements: [BARCODE_EL] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    const bindingSelect = els().properties.querySelector('[data-prop="binding"]');
    bindingSelect.value = 'static';
    bindingSelect.dispatchEvent(new Event('input', { bubbles: true }));

    expect(els().properties.querySelector('[data-prop="text"]')).not.toBeNull();
  });

  test('an Object URL barcode only offers CODE128 as a format (a URL is not valid input for any other format)', () => {
    loadDesigner({ elements: [{ id: 'b1', type: 'barcode', x_mm: 2, y_mm: 2, width_mm: 30, height_mm: 10, barcode_format: 'CODE128', binding: 'object_url', color: '#000000' }] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    const formatSelect = els().properties.querySelector('[data-prop="barcode_format"]');
    expect(Array.from(formatSelect.options).map((o) => o.value)).toEqual(['CODE128']);
  });

  test('switching a barcode to Object URL while an incompatible format was selected snaps the format back to CODE128', () => {
    loadDesigner({ elements: [{ id: 'b1', type: 'barcode', x_mm: 2, y_mm: 2, width_mm: 30, height_mm: 10, barcode_format: 'EAN13', binding: 'object', color: '#000000' }] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    const bindingSelect = els().properties.querySelector('[data-prop="binding"]');
    bindingSelect.value = 'object_url';
    bindingSelect.dispatchEvent(new Event('input', { bubbles: true }));

    expect(els().properties.querySelector('[data-prop="barcode_format"]').value).toBe('CODE128');
  });

  test('a static barcode value is filtered to the formats it actually fits, once typing is done', () => {
    loadDesigner({ elements: [{ id: 'b1', type: 'barcode', x_mm: 2, y_mm: 2, width_mm: 30, height_mm: 10, barcode_format: 'CODE128', binding: 'static', text: '', color: '#000000' }] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    const textInputEl = els().properties.querySelector('[data-prop="text"]');
    textInputEl.value = '5901234123457'; // a 13-digit EAN13 value
    textInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    textInputEl.dispatchEvent(new Event('change', { bubbles: true }));

    const formatValues = Array.from(els().properties.querySelector('[data-prop="barcode_format"]').options).map((o) => o.value);
    expect(formatValues).toContain('CODE128');
    expect(formatValues).toContain('EAN13');
    // Wrong digit count for these: EAN8 (7-8), UPC (11-12), ITF14 (even length only).
    expect(formatValues).not.toContain('EAN8');
    expect(formatValues).not.toContain('UPC');
    expect(formatValues).not.toContain('ITF14');
  });

  test('a static barcode value that fits nothing but CODE128 only offers CODE128', () => {
    loadDesigner({ elements: [{ id: 'b1', type: 'barcode', x_mm: 2, y_mm: 2, width_mm: 30, height_mm: 10, barcode_format: 'CODE128', binding: 'static', text: '', color: '#000000' }] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    const textInputEl = els().properties.querySelector('[data-prop="text"]');
    textInputEl.value = 'lowercase not valid for code39/codabar';
    textInputEl.dispatchEvent(new Event('input', { bubbles: true }));
    textInputEl.dispatchEvent(new Event('change', { bubbles: true }));

    expect(Array.from(els().properties.querySelector('[data-prop="barcode_format"]').options).map((o) => o.value)).toEqual(['CODE128']);
  });

  test('object/object_type/custom/format bindings leave every barcode format selectable', () => {
    loadDesigner({ elements: [{ id: 'b1', type: 'barcode', x_mm: 2, y_mm: 2, width_mm: 30, height_mm: 10, barcode_format: 'CODE128', binding: 'custom', expr: 'object.serial', color: '#000000' }] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    expect(Array.from(els().properties.querySelector('[data-prop="barcode_format"]').options).map((o) => o.value)).toEqual([
      'CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'MSI', 'pharmacode', 'codabar',
    ]);
  });

  test('selecting a qr element shows the shared binding UI plus error correction and color, but no barcode/text-only fields', () => {
    loadDesigner({ elements: [{ ...QR_EL, binding: 'object_url', color: '#ff0000' }] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    const { properties } = els();
    expect(properties.querySelector('[data-prop="binding"]').value).toBe('object_url');
    expect(properties.querySelector('[data-prop="correct_level"]').value).toBe('H');
    expect(properties.querySelector('[data-prop="color"]').value).toBe('#ff0000');
    expect(properties.querySelector('[data-prop="barcode_format"]')).toBeNull();
    expect(properties.querySelector('[data-prop="font_size_mm"]')).toBeNull();
  });

  test('a qr element with no color of its own shows black as the default', () => {
    loadDesigner({ elements: [QR_EL] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    expect(els().properties.querySelector('[data-prop="color"]').value).toBe('#000000');
  });

  test('a qr element with no binding of its own (saved before per-element bindings existed) shows Object URL as its default', () => {
    loadDesigner({ elements: [QR_EL] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    expect(els().properties.querySelector('[data-prop="binding"]').value).toBe('object_url');
  });
});

describe('add / delete elements', () => {
  test('adding a text element appends it, selects it, and enables undo', () => {
    loadDesigner({ elements: [] });
    els().addText.click();

    expect(qrEls()).toHaveLength(1);
    expect(els().undo.disabled).toBe(false);
    expect(document.getElementById('qr-delete-element')).not.toBeNull();
  });

  test('deleting via the delete icon removes the element', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();
    document.querySelector('.qr-delete-icon').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(qrEls()).toHaveLength(0);
  });

  test('deleting via the Delete key only fires when an element is selected and focus is not in a form field', () => {
    loadDesigner({ elements: [TEXT_EL] });

    // Not selected: no-op.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(qrEls()).toHaveLength(1);

    mousedown(qrEls()[0], 0, 0);
    mouseup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(qrEls()).toHaveLength(0);
  });

  test('adding a qr element defaults its binding to Object URL and its color to black', () => {
    loadDesigner({ elements: [] });
    els().addQr.click();

    expect(qrEls()).toHaveLength(1);
    expect(els().properties.querySelector('[data-prop="binding"]').value).toBe('object_url');
    expect(els().properties.querySelector('[data-prop="color"]').value).toBe('#000000');
  });

  test('adding a barcode element appends it with CODE128/object URL defaults, selects it, and enables undo', () => {
    loadDesigner({ elements: [] });
    els().addBarcode.click();

    expect(qrEls()).toHaveLength(1);
    expect(els().undo.disabled).toBe(false);
    expect(qrEls()[0].textContent).toContain('CODE128');
    expect(els().properties.querySelector('[data-prop="binding"]').value).toBe('object_url');
    expect(els().properties.querySelector('[data-prop="barcode_format"]').value).toBe('CODE128');
  });
});

describe('undo / redo', () => {
  test('Ctrl+Z undoes the last change, Ctrl+Shift+Z redoes it', () => {
    loadDesigner({ elements: [] });
    els().addText.click();
    expect(qrEls()).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(qrEls()).toHaveLength(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
    expect(qrEls()).toHaveLength(1);
  });

  test('undo is disabled at the start of history and redo disabled at the end', () => {
    loadDesigner({ elements: [] });
    const { undo, redo } = els();
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    els().addText.click();
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(true);
  });

  test('Ctrl+Y also redoes, as an alternative to Ctrl+Shift+Z', () => {
    loadDesigner({ elements: [] });
    els().addText.click();
    expect(qrEls()).toHaveLength(1);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(qrEls()).toHaveLength(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
    expect(qrEls()).toHaveLength(1);
  });
});

describe('copy / paste', () => {
  function ctrlKey(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: key, ctrlKey: true, bubbles: true }));
  }

  test('Ctrl+C then Ctrl+V duplicates the selected element with a +2mm offset, a fresh id, and other properties intact', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 0, 0); // select
    mouseup();

    ctrlKey('c');
    ctrlKey('v');

    expect(qrEls()).toHaveLength(2);
    const pasted = qrEls()[1];
    expect(pasted.dataset.id).not.toBe(TEXT_EL.id);
    expect(pasted.style.left).toBe((TEXT_EL.x_mm + 2) * BASE_PX_PER_MM + 'px');
    expect(pasted.style.top).toBe((TEXT_EL.y_mm + 2) * BASE_PX_PER_MM + 'px');
    expect(pasted.style.width).toBe(TEXT_EL.width_mm * BASE_PX_PER_MM + 'px');
    expect(pasted.textContent).toContain('Hello');
  });

  test('pasting selects the new element and is undoable as a single step', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    ctrlKey('c');
    ctrlKey('v');
    expect(qrEls()).toHaveLength(2);

    ctrlKey('z');
    expect(qrEls()).toHaveLength(1);
  });

  test('Ctrl+V is a no-op when nothing has been copied yet', () => {
    loadDesigner({ elements: [TEXT_EL] });
    ctrlKey('v');
    expect(qrEls()).toHaveLength(1);
  });

  test('Ctrl+C is a no-op when nothing is selected', () => {
    loadDesigner({ elements: [TEXT_EL] });
    ctrlKey('c');
    ctrlKey('v');
    expect(qrEls()).toHaveLength(1);
  });

  test('Ctrl+C/Ctrl+V do nothing while focus is in a form field', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 0, 0);
    mouseup();

    els().widthInput.focus();
    ctrlKey('c');
    ctrlKey('v');
    expect(qrEls()).toHaveLength(1);
  });
});

describe('zoom', () => {
  test('zooming in scales element geometry and updates the label', () => {
    loadDesigner({ elements: [TEXT_EL] });
    els().zoomIn.click();
    expect(els().zoomLabel.textContent).toBe('125%');
    expect(qrEls()[0].style.left).toBe(2 * BASE_PX_PER_MM * 1.25 + 'px');
  });

  test('zoom is clamped between 25% and 400%', () => {
    loadDesigner({ elements: [] });
    for (let i = 0; i < 30; i++) {
      els().zoomIn.click();
    }
    expect(els().zoomLabel.textContent).toBe('400%');

    for (let i = 0; i < 60; i++) {
      els().zoomOut.click();
    }
    expect(els().zoomLabel.textContent).toBe('25%');
  });

  test('reset returns to 100%', () => {
    loadDesigner({ elements: [] });
    els().zoomIn.click();
    els().zoomReset.click();
    expect(els().zoomLabel.textContent).toBe('100%');
  });
});

describe('drag and resize', () => {
  test('dragging an element moves it by the mouse delta, in whole-mm-tenths, clamped at 0', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 100, 100);
    mousemove(100 + 8 * BASE_PX_PER_MM, 100 + 4 * BASE_PX_PER_MM); // +8mm x, +4mm y
    mouseup();

    const div = qrEls()[0];
    expect(div.style.left).toBe((2 + 8) * BASE_PX_PER_MM + 'px');
    expect(div.style.top).toBe((2 + 4) * BASE_PX_PER_MM + 'px');
  });

  test('dragging past the top-left edge clamps position at 0', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 100, 100);
    mousemove(100 - 999, 100 - 999);
    mouseup();

    const div = qrEls()[0];
    expect(div.style.left).toBe('0px');
    expect(div.style.top).toBe('0px');
  });

  test('a drag is undoable as a single step', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 100, 100);
    mousemove(100 + 8 * BASE_PX_PER_MM, 100);
    mouseup();
    expect(qrEls()[0].style.left).toBe((2 + 8) * BASE_PX_PER_MM + 'px');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(qrEls()[0].style.left).toBe(2 * BASE_PX_PER_MM + 'px');
  });

  test('dragging the SE handle resizes width and height without moving the element', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 0, 0); // select, to render resize handles
    mouseup();

    const seHandle = document.querySelectorAll('.qr-handle')[3];
    mousedown(seHandle, 200, 200);
    mousemove(200 + 4 * BASE_PX_PER_MM, 200 + 3 * BASE_PX_PER_MM);
    mouseup();

    const div = qrEls()[0];
    expect(div.style.width).toBe((20 + 4) * BASE_PX_PER_MM + 'px');
    expect(div.style.height).toBe((5 + 3) * BASE_PX_PER_MM + 'px');
    expect(div.style.left).toBe(2 * BASE_PX_PER_MM + 'px');
  });
});

describe('grid / snap', () => {
  test('grid off: dragging lands on the usual whole-mm-tenths position', () => {
    loadDesigner({ elements: [TEXT_EL] });
    mousedown(qrEls()[0], 100, 100);
    mousemove(100 + 8 * BASE_PX_PER_MM, 100 + 4 * BASE_PX_PER_MM); // start (2,2) + (8,4) = (10,6)
    mouseup();

    const div = qrEls()[0];
    expect(div.style.left).toBe(10 * BASE_PX_PER_MM + 'px');
    expect(div.style.top).toBe(6 * BASE_PX_PER_MM + 'px');
  });

  test('grid on (default 5mm): dragging snaps x/y to the nearest grid line', () => {
    loadDesigner({ elements: [TEXT_EL] });
    els().gridToggle.click();

    mousedown(qrEls()[0], 100, 100);
    mousemove(100 + 8 * BASE_PX_PER_MM, 100 + 4 * BASE_PX_PER_MM); // start (2,2) + (8,4) = (10,6) -> snaps to (10,5)
    mouseup();

    const div = qrEls()[0];
    expect(div.style.left).toBe(10 * BASE_PX_PER_MM + 'px');
    expect(div.style.top).toBe(5 * BASE_PX_PER_MM + 'px');
  });

  test('changing grid size changes the snap increment', () => {
    loadDesigner({ elements: [TEXT_EL] });
    els().gridToggle.click();
    els().gridSizeOption('10').click();

    mousedown(qrEls()[0], 100, 100);
    mousemove(100 + 8 * BASE_PX_PER_MM, 100 + 4 * BASE_PX_PER_MM); // start (2,2) + (8,4) = (10,6) -> snaps to (10,10)
    mouseup();

    const div = qrEls()[0];
    expect(div.style.left).toBe(10 * BASE_PX_PER_MM + 'px');
    expect(div.style.top).toBe(10 * BASE_PX_PER_MM + 'px');
  });

  test('toggling grid off again restores whole-mm-tenths precision', () => {
    loadDesigner({ elements: [TEXT_EL] });
    els().gridToggle.click();
    els().gridToggle.click();

    mousedown(qrEls()[0], 100, 100);
    mousemove(100 + 8 * BASE_PX_PER_MM, 100 + 4 * BASE_PX_PER_MM); // start (2,2) + (8,4) = (10,6)
    mouseup();

    const div = qrEls()[0];
    expect(div.style.left).toBe(10 * BASE_PX_PER_MM + 'px');
    expect(div.style.top).toBe(6 * BASE_PX_PER_MM + 'px');
  });
});

describe('canvas size', () => {
  test('changing width/height updates the dimensions label and canvas geometry', () => {
    loadDesigner({ elements: [], widthMm: 40, heightMm: 12 });
    const { widthInput, heightInput, dimsLabel } = els();

    widthInput.value = '50';
    widthInput.dispatchEvent(new Event('input', { bubbles: true }));
    heightInput.value = '20';
    heightInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(dimsLabel.textContent).toBe('50 × 20 mm');
    expect(document.getElementById('qr-canvas').style.width).toBe(50 * BASE_PX_PER_MM + 'px');
  });
});

describe('save', () => {
  test('submitting serializes the current elements and canvas size into the hidden fields', () => {
    loadDesigner({ elements: [TEXT_EL, QR_EL], widthMm: 40, heightMm: 12 });
    const { saveForm, layoutJsonInput, widthMmInput, heightMmInput } = els();

    saveForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(JSON.parse(layoutJsonInput.value)).toEqual({ elements: [TEXT_EL, QR_EL] });
    expect(widthMmInput.value).toBe('40');
    expect(heightMmInput.value).toBe('12');
  });
});

describe('preview: out-of-order response guard (regression)', () => {
  test('renderPreview only applies the most recently issued request\'s response', async () => {
    loadDesigner({ elements: [] });

    let resolveFirst, resolveSecond;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const second = new Promise((resolve) => { resolveSecond = resolve; });
    global.fetch = jest.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    els().previewBtn.click(); // fires request #1
    els().previewBtn.click(); // fires request #2, supersedes #1

    // Resolve out of order: the stale first request finishes last.
    resolveSecond({ text: () => Promise.resolve('HTML-2') });
    await flushPromises();
    resolveFirst({ text: () => Promise.resolve('HTML-1') });
    await flushPromises();

    expect(els().previewIframe.srcdoc).toBe('HTML-2');
  });

  test('runObjectSearch only renders the most recently issued query\'s results', async () => {
    loadDesigner({ elements: [] });

    let resolveFirst, resolveSecond;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    const second = new Promise((resolve) => { resolveSecond = resolve; });
    global.fetch = jest.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);

    const { previewModeObjectBtn, previewSearch } = els();
    previewModeObjectBtn.click(); // switches to object mode, fires search #1 (empty query)
    previewSearch.value = 'site';
    // Changing content type fires search #2 synchronously (no debounce),
    // exercising the same requestId guard as the debounced keystroke path.
    document.getElementById('qr-preview-content-type').dispatchEvent(new Event('change', { bubbles: true }));

    resolveSecond({ json: () => Promise.resolve({ results: [{ id: 2, display: 'Second' }] }) });
    await flushPromises();
    resolveFirst({ json: () => Promise.resolve({ results: [{ id: 1, display: 'First' }] }) });
    await flushPromises();

    expect(els().previewResults.textContent).toBe('Second');
  });
});

describe('preview: error panel', () => {
  async function selectFirstRealObjectResult() {
    els().previewModeObjectBtn.click(); // fires the (mocked) search
    await flushPromises();
    els().previewResults.querySelector('a').click(); // fires the (mocked) renderPreview
    await flushPromises();
  }

  test('shows the server-side render error (see rendering.py\'s sanitize_layout_for_context) for a real-object preview', async () => {
    loadDesigner({ elements: [] });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ results: [{ id: 5, display: 'Device X' }] }) })
      .mockResolvedValueOnce({ text: () => Promise.resolve(
        '<script id="netbox-qr-render-error" type="application/json">"text-2: UndefinedError: \'ddsds\' is undefined"</script>'
      ) });

    await selectFirstRealObjectResult();

    expect(els().previewError.classList.contains('d-none')).toBe(false);
    expect(els().previewError.textContent).toBe("text-2: UndefinedError: 'ddsds' is undefined");
  });

  test('a later client-side draw error (postMessage from barcode-render.js/qr-render.js) is merged into the same panel', async () => {
    loadDesigner({ elements: [] });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ results: [{ id: 5, display: 'Device X' }] }) })
      .mockResolvedValueOnce({ text: () => Promise.resolve('<div id="netbox-qr-root"></div>') });

    await selectFirstRealObjectResult();
    expect(els().previewError.classList.contains('d-none')).toBe(true);

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'netbox-qr-client-error', source: 'barcode', errors: ['barcode-3: "Device X" is not a valid input for EAN13'] },
    }));

    expect(els().previewError.classList.contains('d-none')).toBe(false);
    expect(els().previewError.textContent).toBe('barcode-3: "Device X" is not a valid input for EAN13');
  });

  test('a server-side error and a later client-side error are both shown together', async () => {
    loadDesigner({ elements: [] });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ results: [{ id: 5, display: 'Device X' }] }) })
      .mockResolvedValueOnce({ text: () => Promise.resolve(
        '<script id="netbox-qr-render-error" type="application/json">"text-2: UndefinedError: \'ddsds\' is undefined"</script>'
      ) });

    await selectFirstRealObjectResult();
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'netbox-qr-client-error', source: 'qr', errors: ['qr-1: bad value'] },
    }));

    expect(els().previewError.textContent).toBe("text-2: UndefinedError: 'ddsds' is undefined\n\nqr-1: bad value");
  });

  test('picking a new preview object clears a previously reported client-side error', async () => {
    loadDesigner({ elements: [] });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ results: [{ id: 5, display: 'Device X' }] }) })
      .mockResolvedValueOnce({ text: () => Promise.resolve('<div id="netbox-qr-root"></div>') })
      .mockResolvedValueOnce({ text: () => Promise.resolve('<div id="netbox-qr-root"></div>') });

    await selectFirstRealObjectResult();
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'netbox-qr-client-error', source: 'qr', errors: ['qr-1: bad value'] },
    }));
    expect(els().previewError.classList.contains('d-none')).toBe(false);

    els().previewResults.querySelector('a').click(); // re-picks the same object, firing a fresh preview
    await flushPromises();

    expect(els().previewError.classList.contains('d-none')).toBe(true);
  });

  test('unrelated postMessage events are ignored', async () => {
    loadDesigner({ elements: [] });
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ json: () => Promise.resolve({ results: [{ id: 5, display: 'Device X' }] }) })
      .mockResolvedValueOnce({ text: () => Promise.resolve('<div id="netbox-qr-root"></div>') });

    await selectFirstRealObjectResult();
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'some-other-message' } }));

    expect(els().previewError.classList.contains('d-none')).toBe(true);
  });
});
