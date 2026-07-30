'use strict';

// Mirrors netbox_labels/templates/netbox_labels/qrtemplate_bulk_print.html
// closely enough for qr-bulk-print.js to boot and operate against it.
function bulkPrintFixtureHtml(objects) {
  var statusBadges = objects
    .map(function (obj) { return '<span id="qr-bulk-status-' + obj.id + '"></span>'; })
    .join('');
  var templateButtons =
    '<button type="button" data-template-id="1">Template A</button>' +
    '<button type="button" data-template-id="2">Template B</button>';

  return (
    '<div id="qr-bulk-template-list">' + templateButtons + '</div>' +
    '<iframe id="qr-bulk-preview-iframe" style="display:none"></iframe>' +
    '<div id="qr-bulk-preview-placeholder"></div>' +
    '<button type="button" id="qr-bulk-print-btn" disabled></button>' +
    '<button type="button" id="qr-bulk-reset-btn"></button>' +
    '<button type="button" id="qr-bulk-continue-btn"></button>' +
    '<div id="qr-bulk-error-footer" style="display:none">' +
    '  <span id="qr-bulk-error-message"></span>' +
    '</div>' +
    '<span id="qr-bulk-progress-count">0</span>' +
    '<iframe id="qr-bulk-worker-iframe" style="display:none"></iframe>' +
    '<div id="qr-bulk-driver-options" class="d-flex"></div>' +
    '<div id="qr-bulk-page-format-options" class="d-none"></div>' +
    '<div id="qr-bulk-print-modal"></div>' +
    statusBadges +
    '<script type="application/json" id="qr-bulk-objects-data">' + JSON.stringify(objects) + '</script>'
  );
}

module.exports = { bulkPrintFixtureHtml: bulkPrintFixtureHtml };
