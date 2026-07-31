'use strict';

const path = require('path');
const { designerFixtureHtml } = require('./helpers/designer-fixture');

const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/qr-designer.js');

// Same stale-document-listener bookkeeping as qr-designer.test.js's
// loadDesigner() — see the comment there for why this is needed.
let trackedDocumentListeners = [];

function loadDesigner(fixtureOptions, icons) {
  trackedDocumentListeners.forEach(({ type, handler, options }) => {
    document.removeEventListener(type, handler, options);
  });
  trackedDocumentListeners = [];

  document.body.innerHTML = designerFixtureHtml(fixtureOptions);
  window.MDI_ICONS = icons || {};

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
    search: document.getElementById('qr-icon-search'),
    moreHint: document.getElementById('qr-icon-more-hint'),
    properties: document.getElementById('qr-properties-body'),
  };
}

function qrEls() {
  return Array.from(document.querySelectorAll('.qr-el'));
}

function resultButtons() {
  return Array.from(document.querySelectorAll('#qr-icon-results .netbox-qr-icon-btn'));
}

function typeInSearch(query) {
  els().search.value = query;
  els().search.dispatchEvent(new Event('input', { bubbles: true }));
}

function decodeDataUri(src) {
  return decodeURIComponent(src.replace('data:image/svg+xml;utf8,', ''));
}

const SAMPLE_ICONS = {
  home: 'M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z',
  'home-outline': 'M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z',
  account: 'M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4Z',
  qrcode: 'M3,11H5V13H3V11M11,7H13V9H11V7Z',
};

afterEach(() => {
  delete window.MDI_ICONS;
});

describe('icon search/filter', () => {
  test('with no query, shows every icon (under the result cap)', () => {
    loadDesigner({ elements: [] }, SAMPLE_ICONS);
    expect(resultButtons()).toHaveLength(Object.keys(SAMPLE_ICONS).length);
  });

  test('filters by case-insensitive substring match on name', () => {
    loadDesigner({ elements: [] }, SAMPLE_ICONS);
    typeInSearch('HOME');

    const titles = resultButtons().map((btn) => btn.title).sort();
    expect(titles).toEqual(['home', 'home-outline']);
  });

  test('clearing the search restores the full result set', () => {
    loadDesigner({ elements: [] }, SAMPLE_ICONS);
    typeInSearch('qrcode');
    expect(resultButtons()).toHaveLength(1);

    typeInSearch('');
    expect(resultButtons()).toHaveLength(Object.keys(SAMPLE_ICONS).length);
  });

  test('respects the 300-result cap and shows a "narrow your search" hint when truncated', () => {
    const manyIcons = {};
    for (let i = 0; i < 350; i++) {
      manyIcons['icon-' + i] = 'M0,0Z';
    }
    loadDesigner({ elements: [] }, manyIcons);

    expect(resultButtons()).toHaveLength(300);
    expect(els().moreHint.classList.contains('d-none')).toBe(false);
  });

  test('no hint shown when results are not truncated', () => {
    loadDesigner({ elements: [] }, SAMPLE_ICONS);
    expect(els().moreHint.classList.contains('d-none')).toBe(true);
  });
});

describe('selecting an icon', () => {
  test('inserts an image element with a well-formed, percent-encoded SVG data URI', () => {
    loadDesigner({ elements: [] }, SAMPLE_ICONS);
    typeInSearch('home');
    resultButtons().find((btn) => btn.title === 'home').click();

    expect(qrEls()).toHaveLength(1);
    const img = qrEls()[0].querySelector('img');
    expect(img).not.toBeNull();
    expect(img.src.startsWith('data:image/svg+xml;utf8,')).toBe(true);

    // The raw "#" of a color must not appear un-encoded in the URI (it's a
    // fragment delimiter in a URL, which would silently truncate the image).
    expect(img.src).not.toContain('#000000');
    expect(img.src).toContain('%23000000');

    const svg = decodeDataUri(img.src);
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
      '<path fill="#000000" d="' + SAMPLE_ICONS.home + '"/></svg>'
    );
  });

  test('the new element carries _icon_name/_icon_color, surfaced as a "Recolor icon" field', () => {
    loadDesigner({ elements: [] }, SAMPLE_ICONS);
    resultButtons().find((btn) => btn.title === 'qrcode').click();

    // addIconElement() selects the new element, so its properties panel
    // (with the icon-only "Recolor icon" field) is already showing.
    const recolorInput = els().properties.querySelector('[data-prop="_icon_color"]');
    expect(recolorInput).not.toBeNull();
    expect(recolorInput.value).toBe('#000000');
  });

  test('changing the recolor input regenerates the element\'s src with the new color', () => {
    loadDesigner({ elements: [] }, SAMPLE_ICONS);
    resultButtons().find((btn) => btn.title === 'qrcode').click();

    const recolorInput = els().properties.querySelector('[data-prop="_icon_color"]');
    recolorInput.value = '#ff0000';
    recolorInput.dispatchEvent(new Event('input', { bubbles: true }));

    const svg = decodeDataUri(qrEls()[0].querySelector('img').src);
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain(SAMPLE_ICONS.qrcode);
  });

  test('plain, non-icon image elements do not get a recolor input', () => {
    loadDesigner({
      elements: [{ id: 'img-1', type: 'image', x_mm: 2, y_mm: 2, width_mm: 10, height_mm: 10, src: 'data:image/png;base64,abc' }],
    }, SAMPLE_ICONS);

    qrEls()[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(els().properties.querySelector('[data-prop="_icon_color"]')).toBeNull();
  });
});
