'use strict';

const path = require('path');
const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/zpl-print.js');

function loadZpl() {
  jest.resetModules();
  delete window.NetBoxQRZpl;
  require(SCRIPT_PATH);
  return window.NetBoxQRZpl;
}

function mockPrintCommon(bitmap) {
  window.NetBoxQRPrintCommon = {
    toMonochromeBitmap: jest.fn(() => bitmap),
    rasterizeLabel: jest.fn(() => ({ width: 320, height: 96 })),
  };
}

describe('NetBoxQRZpl.printLabel', () => {
  test('encodes the bitmap as an ASCII-hex ^GFA graphic field', async () => {
    mockPrintCommon({ bytes: Uint8Array.of(0xff, 0x00), widthBytes: 2, height: 1 });
    const Zpl = loadZpl();

    const written = [];
    const conn = { writer: { write: jest.fn(async (bytes) => written.push(bytes)) } };
    const canvas = { width: 40, height: 12 };

    await Zpl.printLabel(conn, canvas);

    expect(written).toHaveLength(1);
    const zpl = new TextDecoder().decode(written[0]);
    expect(zpl).toBe('^XA^PW40^LL12^FO0,0^GFA,2,2,2,FF00^FS^XZ');
  });
});

describe('NetBoxQRZpl.connect', () => {
  afterEach(() => {
    delete global.navigator.serial;
  });

  test('throws when Web Serial is unavailable', async () => {
    const Zpl = loadZpl();
    delete global.navigator.serial;
    await expect(Zpl.connect()).rejects.toThrow(/Web Serial is not available/);
  });

  test('opens the port at the requested baud rate and returns a writer', async () => {
    const Zpl = loadZpl();
    const writer = {};
    const port = { open: jest.fn(async () => {}), writable: { getWriter: jest.fn(() => writer) } };
    global.navigator.serial = { requestPort: jest.fn(async () => port) };

    const conn = await Zpl.connect({ baudRate: 19200 });

    expect(port.open).toHaveBeenCalledWith({ baudRate: 19200 });
    expect(conn).toEqual({ port: port, writer: writer });
  });

  test('defaults to 9600 baud when unspecified', async () => {
    const Zpl = loadZpl();
    const port = { open: jest.fn(async () => {}), writable: { getWriter: jest.fn(() => ({})) } };
    global.navigator.serial = { requestPort: jest.fn(async () => port) };

    await Zpl.connect();

    expect(port.open).toHaveBeenCalledWith({ baudRate: 9600 });
  });
});

describe('NetBoxQRZpl.disconnect', () => {
  test('is a no-op when there is no connection', async () => {
    const Zpl = loadZpl();
    await expect(Zpl.disconnect(null)).resolves.toBeUndefined();
  });

  test('swallows errors from an already-released writer or already-closed port', async () => {
    const Zpl = loadZpl();
    const conn = {
      writer: { releaseLock: jest.fn(() => { throw new Error('already released'); }) },
      port: { close: jest.fn(async () => { throw new Error('already closed'); }) },
    };
    await expect(Zpl.disconnect(conn)).resolves.toBeUndefined();
    expect(conn.writer.releaseLock).toHaveBeenCalled();
    expect(conn.port.close).toHaveBeenCalled();
  });
});

describe('NetBoxQRZpl.print', () => {
  afterEach(() => {
    delete global.navigator.serial;
  });

  test('connects, prints, and disconnects in order', async () => {
    mockPrintCommon({ bytes: Uint8Array.of(0x00), widthBytes: 1, height: 1 });
    const Zpl = loadZpl();

    const calls = [];
    const writer = { write: jest.fn(async () => calls.push('write')), releaseLock: jest.fn() };
    const port = {
      open: jest.fn(async () => calls.push('open')),
      writable: { getWriter: jest.fn(() => writer) },
      close: jest.fn(async () => calls.push('close')),
    };
    global.navigator.serial = { requestPort: jest.fn(async () => { calls.push('requestPort'); return port; }) };

    await Zpl.print({});

    expect(calls).toEqual(['requestPort', 'open', 'write', 'close']);
  });

  test('still disconnects when printing fails, and re-throws', async () => {
    mockPrintCommon({ bytes: Uint8Array.of(0x00), widthBytes: 1, height: 1 });
    const Zpl = loadZpl();

    const writer = { write: jest.fn(async () => { throw new Error('write failed'); }), releaseLock: jest.fn() };
    const port = {
      open: jest.fn(async () => {}),
      writable: { getWriter: jest.fn(() => writer) },
      close: jest.fn(async () => {}),
    };
    global.navigator.serial = { requestPort: jest.fn(async () => port) };

    await expect(Zpl.print({})).rejects.toThrow('write failed');
    expect(port.close).toHaveBeenCalled();
  });
});
