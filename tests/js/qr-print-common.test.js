'use strict';

const path = require('path');
const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/qr-print-common.js');

function fakeCanvas(width, height, pixels) {
  // pixels: array of [r,g,b,a] per pixel, row-major, length === width*height
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((px, i) => {
    data[i * 4] = px[0];
    data[i * 4 + 1] = px[1];
    data[i * 4 + 2] = px[2];
    data[i * 4 + 3] = px[3];
  });
  return {
    width: width,
    height: height,
    getContext: () => ({
      getImageData: () => ({ data: data }),
    }),
  };
}

describe('NetBoxQRPrintCommon.toMonochromeBitmap', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.NetBoxQRPrintCommon;
    require(SCRIPT_PATH);
  });

  test('sets the bit for an opaque dark pixel', () => {
    const canvas = fakeCanvas(1, 1, [[0, 0, 0, 255]]);
    const bitmap = window.NetBoxQRPrintCommon.toMonochromeBitmap(canvas);
    expect(bitmap.widthBytes).toBe(1);
    expect(bitmap.height).toBe(1);
    expect(bitmap.bytes[0]).toBe(0x80);
  });

  test('leaves the bit clear for an opaque light pixel', () => {
    const canvas = fakeCanvas(1, 1, [[255, 255, 255, 255]]);
    const bitmap = window.NetBoxQRPrintCommon.toMonochromeBitmap(canvas);
    expect(bitmap.bytes[0]).toBe(0x00);
  });

  test('leaves the bit clear for a fully transparent dark pixel', () => {
    const canvas = fakeCanvas(1, 1, [[0, 0, 0, 0]]);
    const bitmap = window.NetBoxQRPrintCommon.toMonochromeBitmap(canvas);
    expect(bitmap.bytes[0]).toBe(0x00);
  });

  test('respects a custom threshold', () => {
    // Luminance ~150: below the default threshold (128) it stays clear;
    // raising the threshold past 150 sets it.
    const canvas = fakeCanvas(1, 1, [[150, 150, 150, 255]]);
    expect(window.NetBoxQRPrintCommon.toMonochromeBitmap(canvas).bytes[0]).toBe(0x00);
    expect(window.NetBoxQRPrintCommon.toMonochromeBitmap(canvas, 200).bytes[0]).toBe(0x80);
  });

  test('packs bits MSB-first and pads a partial final byte', () => {
    // 9 pixels wide -> 2 bytes/row. First pixel dark (bit 7 of byte 0),
    // ninth pixel dark (bit 7 of byte 1, the padded byte).
    const pixels = new Array(9).fill([255, 255, 255, 255]);
    pixels[0] = [0, 0, 0, 255];
    pixels[8] = [0, 0, 0, 255];
    const canvas = fakeCanvas(9, 1, pixels);
    const bitmap = window.NetBoxQRPrintCommon.toMonochromeBitmap(canvas);
    expect(bitmap.widthBytes).toBe(2);
    expect(bitmap.bytes[0]).toBe(0x80);
    expect(bitmap.bytes[1]).toBe(0x80);
  });
});

describe('NetBoxQRPrintCommon.getDriver', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.NetBoxQRPrintCommon;
    delete window.NetBoxQRNiimbot;
    delete window.NetBoxQRZpl;
    delete window.NetBoxQREscPos;
    require(SCRIPT_PATH);
  });

  test('returns null for an unknown driver name', () => {
    expect(window.NetBoxQRPrintCommon.getDriver('bogus')).toBeNull();
  });

  test('returns undefined when the matching driver script was not loaded', () => {
    expect(window.NetBoxQRPrintCommon.getDriver('zpl')).toBeUndefined();
  });

  test('resolves each known driver name to its global once loaded', () => {
    window.NetBoxQRNiimbot = { print: () => {} };
    window.NetBoxQRZpl = { print: () => {} };
    window.NetBoxQREscPos = { print: () => {} };
    expect(window.NetBoxQRPrintCommon.getDriver('niimbot')).toBe(window.NetBoxQRNiimbot);
    expect(window.NetBoxQRPrintCommon.getDriver('zpl')).toBe(window.NetBoxQRZpl);
    expect(window.NetBoxQRPrintCommon.getDriver('escpos')).toBe(window.NetBoxQREscPos);
  });
});
