'use strict';

// Mirrors the element structure of netbox_labels/templates/netbox_labels/
// qrtemplate_design.html closely enough for qr-designer.js to boot and
// operate against it (every id/class the script looks up via
// getElementById/querySelector must exist), without dragging in Django
// template tags or Bootstrap/NetBox chrome that the script never touches.
function designerFixtureHtml(options) {
  options = options || {};
  var widthMm = options.widthMm != null ? options.widthMm : 40;
  var heightMm = options.heightMm != null ? options.heightMm : 12;
  var elements = options.elements || [];
  var contentTypeOptions = options.contentTypeOptions || [{ value: '18', label: 'dcim | site' }];

  var contentTypeOptionsHtml = contentTypeOptions
    .map(function (opt) { return '<option value="' + opt.value + '">' + opt.label + '</option>'; })
    .join('');

  return (
    '<div id="qr-designer" data-width-mm="' + widthMm + '" data-height-mm="' + heightMm + '" ' +
    'data-preview-url="/plugins/labels/templates/1/design/preview/" ' +
    'data-search-url="/plugins/labels/templates/object-search/">' +
    '  <div id="qr-toolbar">' +
    '    <button type="button" id="qr-undo" disabled></button>' +
    '    <button type="button" id="qr-redo" disabled></button>' +
    '    <button type="button" id="qr-zoom-out"></button>' +
    '    <button type="button" id="qr-zoom-reset"><span id="qr-zoom-label">100%</span></button>' +
    '    <button type="button" id="qr-zoom-in"></button>' +
    '    <button type="button" id="qr-grid-toggle"></button>' +
    '    <select id="qr-grid-size">' +
    '      <option value="1">1 mm</option>' +
    '      <option value="2">2 mm</option>' +
    '      <option value="5" selected>5 mm</option>' +
    '      <option value="10">10 mm</option>' +
    '    </select>' +
    '    <a href="#" id="qr-add-text">Text</a>' +
    '    <a href="#" id="qr-add-image">Image</a>' +
    '    <a href="#" id="qr-add-qr">QR Code</a>' +
    '    <input type="file" id="qr-image-file-input" accept="image/*">' +
    '    <span id="qr-dims-label"></span>' +
    '    <input type="number" id="qr-canvas-width">' +
    '    <input type="number" id="qr-canvas-height">' +
    '    <button type="button" id="qr-preview-btn"></button>' +
    '  </div>' +
    '  <div id="qr-canvas-wrapper"><div id="qr-canvas"></div></div>' +
    '  <div id="qr-properties-body"></div>' +
    '  <form id="qr-save-form">' +
    '    <input type="hidden" name="csrfmiddlewaretoken" value="test-csrf-token">' +
    '    <input type="hidden" id="qr-layout-json" name="layout_json">' +
    '    <input type="hidden" id="qr-width-mm-input" name="width_mm">' +
    '    <input type="hidden" id="qr-height-mm-input" name="height_mm">' +
    '  </form>' +
    '</div>' +
    '<div id="qr-preview-modal">' +
    '  <button type="button" id="qr-preview-mode-placeholder"></button>' +
    '  <button type="button" id="qr-preview-mode-object"></button>' +
    '  <div id="qr-preview-object-picker" class="d-none">' +
    '    <select id="qr-preview-content-type">' + contentTypeOptionsHtml + '</select>' +
    '    <input type="text" id="qr-preview-search">' +
    '    <div id="qr-preview-results"></div>' +
    '  </div>' +
    '  <iframe id="qr-preview-iframe"></iframe>' +
    '  <div id="qr-preview-data-wrapper" class="d-none">' +
    '    <button type="button" id="qr-preview-data-toggle"></button>' +
    '    <div id="qr-preview-data-collapse">' +
    '      <div id="qr-preview-error" class="d-none"></div>' +
    '      <pre id="qr-preview-data-json"></pre>' +
    '    </div>' +
    '  </div>' +
    '</div>' +
    '<script type="application/json" id="qr-layout-data">' + JSON.stringify({ elements: elements }) + '</script>'
  );
}

module.exports = { designerFixtureHtml: designerFixtureHtml };
