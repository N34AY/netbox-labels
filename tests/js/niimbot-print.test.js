'use strict';

const path = require('path');
const SCRIPT_PATH = path.join(__dirname, '../../netbox_labels/static/netbox_labels/niimbot-print.js');

function loadNiimbot() {
  jest.resetModules();
  delete window.NetBoxQRNiimbot;
  require(SCRIPT_PATH);
  return window.NetBoxQRNiimbot;
}

function fakePrintTask() {
  const calls = [];
  return {
    calls: calls,
    printInit: jest.fn(async () => calls.push('printInit')),
    printPage: jest.fn(async (encoded, page) => calls.push(['printPage', encoded, page])),
    waitForPageFinished: jest.fn(async () => calls.push('waitForPageFinished')),
    waitForFinished: jest.fn(async () => calls.push('waitForFinished')),
    printEnd: jest.fn(async () => calls.push('printEnd')),
  };
}

describe('NetBoxQRNiimbot.connect', () => {
  afterEach(() => {
    delete global.navigator.bluetooth;
    delete global.navigator.serial;
    delete global.niimbluelib;
  });

  test('defaults to bluetooth and throws when Web Bluetooth is unavailable', async () => {
    const Niimbot = loadNiimbot();
    delete global.navigator.bluetooth;
    await expect(Niimbot.connect()).rejects.toThrow(/Web Bluetooth is not available/);
  });

  test('throws when transport is serial and Web Serial is unavailable', async () => {
    const Niimbot = loadNiimbot();
    delete global.navigator.serial;
    await expect(Niimbot.connect('serial')).rejects.toThrow(/Web Serial is not available/);
  });

  test('instantiates the requested transport and connects', async () => {
    const Niimbot = loadNiimbot();
    global.navigator.bluetooth = {};
    const client = { connect: jest.fn(async () => {}) };
    global.niimbluelib = { instantiateClient: jest.fn(() => client) };

    const result = await Niimbot.connect('bluetooth');

    expect(global.niimbluelib.instantiateClient).toHaveBeenCalledWith('bluetooth');
    expect(client.connect).toHaveBeenCalled();
    expect(result).toBe(client);
  });
});

describe('NetBoxQRNiimbot.printLabel', () => {
  afterEach(() => {
    delete global.niimbluelib;
  });

  test('prefers the print task type reported by the connected device', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = {
      getPrintTaskType: jest.fn(() => 'D110M_V4'),
      abstraction: { newPrintTask: jest.fn(() => task) },
    };
    global.niimbluelib = { ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await Niimbot.printLabel(client, {}, { printTaskName: 'H1S' });

    expect(client.abstraction.newPrintTask).toHaveBeenCalledWith('D110M_V4', {
      totalPages: 1,
      statusPollIntervalMs: 100,
      statusTimeoutMs: 8000,
    });
  });

  test('falls back to options.printTaskName when the device reports none', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => null), abstraction: { newPrintTask: jest.fn(() => task) } };
    global.niimbluelib = { ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await Niimbot.printLabel(client, {}, { printTaskName: 'H1S' });

    expect(client.abstraction.newPrintTask).toHaveBeenCalledWith('H1S', expect.anything());
  });

  test('falls back to B1 when neither the device nor options name a task', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => null), abstraction: { newPrintTask: jest.fn(() => task) } };
    global.niimbluelib = { ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await Niimbot.printLabel(client, {});

    expect(client.abstraction.newPrintTask).toHaveBeenCalledWith('B1', expect.anything());
  });

  test('drives the print task through its full lifecycle in order', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => task) } };
    global.niimbluelib = { ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await Niimbot.printLabel(client, {});

    expect(task.calls).toEqual(['printInit', ['printPage', 'ENCODED', 1], 'waitForPageFinished', 'waitForFinished', 'printEnd']);
  });

  test('defaults print direction to left, but honors an override', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => task) } };
    const encodeCanvas = jest.fn(() => 'ENCODED');
    global.niimbluelib = { ImageEncoder: { encodeCanvas: encodeCanvas } };
    const canvas = {};

    await Niimbot.printLabel(client, canvas);
    expect(encodeCanvas).toHaveBeenLastCalledWith(canvas, 'left');

    await Niimbot.printLabel(client, canvas, { printDirection: 'right' });
    expect(encodeCanvas).toHaveBeenLastCalledWith(canvas, 'right');
  });
});

describe('NetBoxQRNiimbot.disconnect', () => {
  test('disconnects a live client', () => {
    const Niimbot = loadNiimbot();
    const client = { disconnect: jest.fn() };
    Niimbot.disconnect(client);
    expect(client.disconnect).toHaveBeenCalled();
  });

  test('is a no-op without a client', () => {
    const Niimbot = loadNiimbot();
    expect(() => Niimbot.disconnect(null)).not.toThrow();
  });
});

describe('NetBoxQRNiimbot.print', () => {
  afterEach(() => {
    delete global.navigator.bluetooth;
    delete global.niimbluelib;
  });

  test('still disconnects when printing fails, and re-throws', async () => {
    window.NetBoxQRPrintCommon = { rasterizeLabel: jest.fn(() => ({ width: 1, height: 1 })) };
    const Niimbot = loadNiimbot();

    global.navigator.bluetooth = {};
    const client = { connect: jest.fn(async () => {}), disconnect: jest.fn(), getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => ({ printInit: jest.fn(async () => { throw new Error('device offline'); }) })) } };
    global.niimbluelib = { instantiateClient: jest.fn(() => client), ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await expect(Niimbot.print({})).rejects.toThrow('device offline');
    expect(client.disconnect).toHaveBeenCalled();
  });
});
