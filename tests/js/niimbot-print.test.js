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

  // width/height are multiples of 8 here so padForEncoder() is a no-op and
  // the exact same canvas reference reaches encodeCanvas() — padding itself
  // is covered separately below.
  test('prefers the print task type reported by the connected device', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = {
      getPrintTaskType: jest.fn(() => 'D110M_V4'),
      abstraction: { newPrintTask: jest.fn(() => task) },
    };
    global.niimbluelib = { ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await Niimbot.printLabel(client, { width: 8, height: 8 }, { printTaskName: 'H1S' });

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

    await Niimbot.printLabel(client, { width: 8, height: 8 }, { printTaskName: 'H1S' });

    expect(client.abstraction.newPrintTask).toHaveBeenCalledWith('H1S', expect.anything());
  });

  test('falls back to B1 when neither the device nor options name a task', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => null), abstraction: { newPrintTask: jest.fn(() => task) } };
    global.niimbluelib = { ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await Niimbot.printLabel(client, { width: 8, height: 8 });

    expect(client.abstraction.newPrintTask).toHaveBeenCalledWith('B1', expect.anything());
  });

  test('drives the print task through its full lifecycle in order', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => task) } };
    global.niimbluelib = { ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await Niimbot.printLabel(client, { width: 8, height: 8 });

    expect(task.calls).toEqual(['printInit', ['printPage', 'ENCODED', 1], 'waitForPageFinished', 'waitForFinished', 'printEnd']);
  });

  test('defaults print direction to left, but honors an override', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => task) } };
    const encodeCanvas = jest.fn(() => 'ENCODED');
    global.niimbluelib = { ImageEncoder: { encodeCanvas: encodeCanvas } };
    const canvas = { width: 8, height: 8 };

    await Niimbot.printLabel(client, canvas);
    expect(encodeCanvas).toHaveBeenLastCalledWith(canvas, 'left');

    await Niimbot.printLabel(client, canvas, { printDirection: 'right' });
    expect(encodeCanvas).toHaveBeenLastCalledWith(canvas, 'right');
  });
});

describe('NetBoxQRNiimbot.printLabel padding for encodeCanvas', () => {
  afterEach(() => {
    delete global.niimbluelib;
    jest.restoreAllMocks();
  });

  function fakePaddedCanvas() {
    const ctx = { fillRect: jest.fn(), drawImage: jest.fn() };
    return { ctx: ctx, getContext: jest.fn(() => ctx) };
  }

  // Reproduces the GitHub issue #4 repro: a 12.5mm-tall label rasterizes to
  // 100px at 203 DPI, which niimbluelib's default 'left' printDirection
  // rejects outright since 100 isn't a multiple of 8.
  test('pads canvas.height to the next multiple of 8 when printDirection is left', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => task) } };
    const encodeCanvas = jest.fn(() => 'ENCODED');
    global.niimbluelib = { ImageEncoder: { encodeCanvas: encodeCanvas } };

    const canvas = { width: 871, height: 100 };
    const padded = fakePaddedCanvas();
    const createElement = jest.spyOn(document, 'createElement').mockReturnValue(padded);

    await Niimbot.printLabel(client, canvas);

    expect(createElement).toHaveBeenCalledWith('canvas');
    expect(padded.width).toBe(871);
    expect(padded.height).toBe(104);
    expect(padded.ctx.fillStyle).toBe('#ffffff');
    expect(padded.ctx.fillRect).toHaveBeenCalledWith(0, 0, 871, 104);
    // Split evenly (2px top, 2px bottom) rather than dumped entirely on one
    // edge — a corner-anchored pad would print the real content shifted
    // off-center on the tape's physical width once niimbluelib rotates this
    // axis for printDirection 'left' (see padForEncoder's own comment).
    expect(padded.ctx.drawImage).toHaveBeenCalledWith(canvas, 0, 2);
    expect(encodeCanvas).toHaveBeenCalledWith(padded, 'left');
  });

  test('pads canvas.width instead when printDirection is not left', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => task) } };
    const encodeCanvas = jest.fn(() => 'ENCODED');
    global.niimbluelib = { ImageEncoder: { encodeCanvas: encodeCanvas } };

    const canvas = { width: 100, height: 871 };
    const padded = fakePaddedCanvas();
    jest.spyOn(document, 'createElement').mockReturnValue(padded);

    await Niimbot.printLabel(client, canvas, { printDirection: 'right' });

    expect(padded.width).toBe(104);
    expect(padded.height).toBe(871);
    expect(padded.ctx.drawImage).toHaveBeenCalledWith(canvas, 2, 0);
    expect(encodeCanvas).toHaveBeenCalledWith(padded, 'right');
  });

  test('an odd pad splits as floor on the leading edge, remainder on the trailing edge', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => task) } };
    const encodeCanvas = jest.fn(() => 'ENCODED');
    global.niimbluelib = { ImageEncoder: { encodeCanvas: encodeCanvas } };

    // height 97 -> pad 7 (97 + 7 = 104, the next multiple of 8) -> 3px leading, 4px trailing.
    const canvas = { width: 50, height: 97 };
    const padded = fakePaddedCanvas();
    jest.spyOn(document, 'createElement').mockReturnValue(padded);

    await Niimbot.printLabel(client, canvas);

    expect(padded.height).toBe(104);
    expect(padded.ctx.drawImage).toHaveBeenCalledWith(canvas, 0, 3);
  });

  test('does not pad, and reuses the original canvas, when already a multiple of 8', async () => {
    const Niimbot = loadNiimbot();
    const task = fakePrintTask();
    const client = { getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => task) } };
    const encodeCanvas = jest.fn(() => 'ENCODED');
    global.niimbluelib = { ImageEncoder: { encodeCanvas: encodeCanvas } };
    const createElement = jest.spyOn(document, 'createElement');

    const canvas = { width: 871, height: 96 };
    await Niimbot.printLabel(client, canvas);

    expect(createElement).not.toHaveBeenCalled();
    expect(encodeCanvas).toHaveBeenCalledWith(canvas, 'left');
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
    window.NetBoxQRPrintCommon = { rasterizeLabel: jest.fn(() => ({ width: 8, height: 8 })) };
    const Niimbot = loadNiimbot();

    global.navigator.bluetooth = {};
    const client = { connect: jest.fn(async () => {}), disconnect: jest.fn(), getPrintTaskType: jest.fn(() => 'B1'), abstraction: { newPrintTask: jest.fn(() => ({ printInit: jest.fn(async () => { throw new Error('device offline'); }) })) } };
    global.niimbluelib = { instantiateClient: jest.fn(() => client), ImageEncoder: { encodeCanvas: jest.fn(() => 'ENCODED') } };

    await expect(Niimbot.print({})).rejects.toThrow('device offline');
    expect(client.disconnect).toHaveBeenCalled();
  });
});
