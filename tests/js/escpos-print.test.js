'use strict';

const path = require('path');
const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/escpos-print.js');

function loadEscPos() {
  jest.resetModules();
  delete window.NetBoxQREscPos;
  require(SCRIPT_PATH);
  return window.NetBoxQREscPos;
}

function mockPrintCommon(bitmap) {
  window.NetBoxQRPrintCommon = {
    toMonochromeBitmap: jest.fn(() => bitmap),
    rasterizeLabel: jest.fn(() => ({ width: 320, height: 96 })),
  };
}

describe('NetBoxQREscPos.printLabel', () => {
  test('builds a GS v 0 raster command from the bitmap, not the raw canvas size', async () => {
    // width/height deliberately differ from the mocked bitmap's own
    // dimensions, to prove the header is built from the bitmap.
    mockPrintCommon({ bytes: Uint8Array.of(0xab, 0xcd), widthBytes: 2, height: 1 });
    const EscPos = loadEscPos();

    const written = [];
    const conn = { writer: { write: jest.fn(async (bytes) => written.push(bytes)) } };
    const canvas = { width: 999, height: 5 };

    await EscPos.printLabel(conn, canvas);

    expect(written).toHaveLength(1);
    expect(Array.from(written[0])).toEqual([
      0x1d, 0x76, 0x30, 0x00, // GS v 0
      0x02, 0x00, // widthBytes, little-endian
      0x01, 0x00, // height, little-endian
      0xab, 0xcd, // bitmap bytes
      0x0a, 0x0a, 0x0a, 0x0a, // feed past tear bar
    ]);
  });
});

describe('NetBoxQREscPos.connect', () => {
  afterEach(() => {
    delete global.navigator.serial;
  });

  test('throws when Web Serial is unavailable', async () => {
    const EscPos = loadEscPos();
    delete global.navigator.serial;
    await expect(EscPos.connect()).rejects.toThrow(/Web Serial is not available/);
  });

  test('sends ESC @ (initialize) immediately after opening the port', async () => {
    const EscPos = loadEscPos();
    const written = [];
    const writer = { write: jest.fn(async (bytes) => written.push(bytes)) };
    const port = { open: jest.fn(async () => {}), writable: { getWriter: jest.fn(() => writer) } };
    global.navigator.serial = { requestPort: jest.fn(async () => port) };

    await EscPos.connect();

    expect(written).toHaveLength(1);
    expect(Array.from(written[0])).toEqual([0x1b, 0x40]);
  });
});

describe('NetBoxQREscPos.disconnect', () => {
  test('is a no-op when there is no connection', async () => {
    const EscPos = loadEscPos();
    await expect(EscPos.disconnect(null)).resolves.toBeUndefined();
  });

  test('swallows errors from an already-released writer or already-closed port', async () => {
    const EscPos = loadEscPos();
    const conn = {
      writer: { releaseLock: jest.fn(() => { throw new Error('already released'); }) },
      port: { close: jest.fn(async () => { throw new Error('already closed'); }) },
    };
    await expect(EscPos.disconnect(conn)).resolves.toBeUndefined();
  });
});

describe('NetBoxQREscPos.print', () => {
  afterEach(() => {
    delete global.navigator.serial;
  });

  test('still disconnects when printing fails, and re-throws', async () => {
    mockPrintCommon({ bytes: Uint8Array.of(0x00), widthBytes: 1, height: 1 });
    const EscPos = loadEscPos();

    let writeCount = 0;
    const writer = {
      write: jest.fn(async () => {
        writeCount += 1;
        if (writeCount === 2) {
          // First write is ESC @ from connect(); second is the actual label.
          throw new Error('write failed');
        }
      }),
      releaseLock: jest.fn(),
    };
    const port = { open: jest.fn(async () => {}), writable: { getWriter: jest.fn(() => writer) }, close: jest.fn(async () => {}) };
    global.navigator.serial = { requestPort: jest.fn(async () => port) };

    await expect(EscPos.print({})).rejects.toThrow('write failed');
    expect(port.close).toHaveBeenCalled();
  });
});
