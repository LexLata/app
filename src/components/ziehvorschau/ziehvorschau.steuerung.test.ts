// @vitest-environment jsdom
// ziehvorschau.steuerung.test.ts – Lebensdauer und Ausfallregel am öffentlichen Interface.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { beginneZiehvorschau } from './ziehvorschau.index';

const { befehl, cursor, nativ } = vi.hoisted(() => ({
  befehl: vi.fn(),
  cursor: vi.fn(),
  nativ: { aktiv: true },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: befehl, isTauri: () => nativ.aktiv }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ setCursorIcon: cursor }) }));
const warten = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
beforeEach(() => {
  nativ.aktiv = true;
  vi.useFakeTimers();
  befehl.mockReset().mockResolvedValue(undefined);
  cursor.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('öffnet ohne Entwicklungsschalter mit Faust und ohne Variantenparameter', async () => {
  const zug = beginneZiehvorschau('BGB', document.createElement('div'), 7);
  await warten();
  expect(befehl).toHaveBeenCalledWith('ziehvorschau_oeffnen', {
    zugkennung: expect.any(Number),
    titel: 'BGB',
    aussehen: expect.any(Object),
  });
  expect(cursor).toHaveBeenCalledWith('grabbing');
  zug.beenden();
  await warten();
});
it('fasst Bewegungen je Frame zusammen und verbirgt bei Rückkehr', async () => {
  const zug = beginneZiehvorschau('BGB', document.createElement('div'), 7);
  await warten();
  zug.melden(10, 20, true);
  zug.melden(30, 40, true);
  await vi.advanceTimersByTimeAsync(17);
  expect(befehl).toHaveBeenCalledWith(
    'ziehvorschau_bewegen',
    expect.objectContaining({ x: 30, y: 40 }),
  );
  expect(befehl.mock.calls.filter(([name]) => name === 'ziehvorschau_bewegen')).toHaveLength(1);
  zug.melden(30, 40, false);
  await vi.advanceTimersByTimeAsync(17);
  expect(befehl).toHaveBeenCalledWith('ziehvorschau_verbergen', expect.anything());
  zug.beenden();
  await warten();
  expect(befehl.mock.calls.at(-1)?.[0]).toBe('ziehvorschau_schliessen');
});
it('schließt A nach verzögertem Öffnen vor B und verwirft alle Frames aus A', async () => {
  let fertig!: () => void;
  befehl.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        fertig = resolve;
      }),
  );
  const a = beginneZiehvorschau('A', document.createElement('div'), 7);
  await warten();
  a.melden(10, 20, true);
  a.beenden();
  const b = beginneZiehvorschau('B', document.createElement('div'), 7);
  b.melden(30, 40, true);
  await vi.advanceTimersByTimeAsync(17);
  expect(befehl).toHaveBeenCalledTimes(1);
  fertig();
  await warten();
  expect(befehl.mock.calls.slice(0, 3).map(([name]) => name)).toEqual([
    'ziehvorschau_oeffnen',
    'ziehvorschau_schliessen',
    'ziehvorschau_oeffnen',
  ]);
  const kennungA = befehl.mock.calls[0]?.[1]?.zugkennung;
  expect(
    befehl.mock.calls.filter(
      ([name, arg]) => name === 'ziehvorschau_bewegen' && arg.zugkennung === kennungA,
    ),
  ).toHaveLength(0);
  b.beenden();
  await warten();
});
it('räumt auch bei fehlgeschlagenem Öffnen auf und meldet nur einmal', async () => {
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  befehl.mockRejectedValue(new Error('Fehler'));
  const zug = beginneZiehvorschau('BGB', document.createElement('div'), 7);
  await warten();
  zug.melden(10, 20, true);
  zug.beenden();
  await warten();
  expect(befehl.mock.calls.map(([name]) => name)).toEqual([
    'ziehvorschau_oeffnen',
    'ziehvorschau_schliessen',
  ]);
  expect(warnung).toHaveBeenCalledTimes(1);
  warnung.mockRestore();
});
it('setzt den nativen Zeiger auch nach schnellem Ende zurück', async () => {
  const zug = beginneZiehvorschau('BGB', null, 7);
  zug.beenden();
  await warten();
  expect(cursor.mock.calls.at(-1)).toEqual(['default']);
});

it('bleibt außerhalb von Tauri ohne Wirkung', async () => {
  nativ.aktiv = false;
  const zug = beginneZiehvorschau('BGB', null, 7);
  zug.melden(1, 2, true);
  zug.beenden();
  await warten();
  expect(befehl).not.toHaveBeenCalled();
});
it('bewahrt bei HMR die steigende Kennung und Lebensdauerkette', async () => {
  const a = beginneZiehvorschau('A', null, 7);
  await warten();
  const ersteKennung = befehl.mock.calls[0]?.[1]?.zugkennung;
  a.beenden();
  vi.resetModules();
  const { beginneZiehvorschau: neuBeginnen } = await import('./ziehvorschau.index');
  const b = neuBeginnen('B', null, 7);
  await warten();
  expect(
    befehl.mock.calls.filter(([name]) => name === 'ziehvorschau_oeffnen')[1]?.[1]?.zugkennung,
  ).toBeGreaterThan(ersteKennung);
  b.beenden();
  await warten();
});
it('sendet nach verzögertem Öffnen nur die letzte Position statt eines Rückstaus', async () => {
  let fertig!: () => void;
  befehl.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        fertig = resolve;
      }),
  );
  const zug = beginneZiehvorschau('BGB', null, 7);
  await warten();
  for (let x = 0; x < 5; x++) {
    zug.melden(x, 20, true);
    await vi.advanceTimersByTimeAsync(17);
  }
  expect(befehl).toHaveBeenCalledTimes(1);
  fertig();
  await warten();
  expect(befehl.mock.calls.at(-1)).toEqual([
    'ziehvorschau_bewegen',
    expect.objectContaining({ x: 4, y: 20 }),
  ]);
  expect(befehl).toHaveBeenCalledTimes(2);
  zug.beenden();
  await warten();
});
it('wartet beim Zugwechsel auch auf die alte Bewegung und setzt danach ausschließlich B fort', async () => {
  let fertig!: () => void;
  const a = beginneZiehvorschau('A', null, 7);
  await warten();
  befehl.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        fertig = resolve;
      }),
  );
  a.melden(1, 2, true);
  await vi.advanceTimersByTimeAsync(17);
  a.beenden();
  const b = beginneZiehvorschau('B', null, 7);
  b.melden(3, 4, true);
  await vi.advanceTimersByTimeAsync(17);
  expect(befehl).toHaveBeenCalledTimes(2);
  fertig();
  await warten();
  expect(befehl.mock.calls.map(([name]) => name)).toEqual([
    'ziehvorschau_oeffnen',
    'ziehvorschau_bewegen',
    'ziehvorschau_schliessen',
    'ziehvorschau_oeffnen',
    'ziehvorschau_bewegen',
  ]);
  expect(befehl.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ x: 3, y: 4 }));
  b.beenden();
  await warten();
});
it('beendet beim Bewegungsfehler den Zug und setzt die Faust zurück', async () => {
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const zug = beginneZiehvorschau('BGB', null, 7);
  await warten();
  expect(cursor).toHaveBeenCalledWith('grabbing');
  befehl.mockRejectedValueOnce(new Error('Bewegen fehlgeschlagen'));
  zug.melden(1, 2, true);
  await vi.advanceTimersByTimeAsync(17);
  await warten();
  expect(befehl.mock.calls.at(-1)?.[0]).toBe('ziehvorschau_schliessen');
  expect(cursor.mock.calls.at(-1)).toEqual(['default']);
  const anzahl = befehl.mock.calls.length;
  zug.melden(3, 4, true);
  await vi.advanceTimersByTimeAsync(17);
  expect(befehl).toHaveBeenCalledTimes(anzahl);
  expect(warnung).toHaveBeenCalledTimes(1);
  warnung.mockRestore();
});

it('setzt auch einen verspätet gesetzten Zeiger von A vor dem Beginn von B zurück', async () => {
  let fertig!: () => void;
  cursor.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        fertig = resolve;
      }),
  );
  const a = beginneZiehvorschau('A', null, 7);
  await warten();
  a.beenden();
  const b = beginneZiehvorschau('B', null, 7);
  await warten();
  expect(befehl).toHaveBeenCalledTimes(1);
  fertig();
  await warten();
  expect(cursor.mock.calls.map(([icon]) => icon)).toEqual(['grabbing', 'default', 'grabbing']);
  expect(befehl.mock.calls.map(([name]) => name)).toEqual([
    'ziehvorschau_oeffnen',
    'ziehvorschau_schliessen',
    'ziehvorschau_oeffnen',
  ]);
  b.beenden();
  await warten();
  expect(cursor.mock.calls.at(-1)).toEqual(['default']);
});

it.each([
  ['oklch(23.5% 0 0)', [30, 30, 30, 255]],
  ['#123456', [18, 52, 86, 255]],
  ['rgb(18 52 86 / 50%)', [18, 52, 86, 128]],
])(
  'übergibt die Browserauflösung von %s als opaken nativen und Seitenhintergrund',
  async (farbe, pixel) => {
    // jsdom zeichnet keine Pixel: ausschließlich die Canvas-Browsergrenze ersetzen.
    const kontext = {
      fillStyle: '',
      fillRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(pixel) })),
    };
    const canvas = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(vi.fn().mockReturnValue(kontext));
    document.documentElement.style.setProperty('--bg-haupt', farbe);
    const zug = beginneZiehvorschau('BGB', null, 7);
    try {
      await warten();
      expect(kontext.fillStyle).toBe(farbe);
      expect(befehl).toHaveBeenCalledWith(
        'ziehvorschau_oeffnen',
        expect.objectContaining({
          aussehen: expect.objectContaining({
            hintergrund: `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`,
            hintergrundNativ: [...pixel.slice(0, 3), 255],
          }),
        }),
      );
    } finally {
      zug.beenden();
      await warten();
      document.documentElement.style.removeProperty('--bg-haupt');
      canvas.mockRestore();
    }
  },
);

it('bewahrt ohne Canvas die Vorschau mit der vorhandenen CSS-Farbe', async () => {
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  document.documentElement.style.setProperty('--bg-haupt', '#123456');
  const zug = beginneZiehvorschau('BGB', null, 7);
  try {
    await warten();
    expect(befehl).toHaveBeenCalledWith(
      'ziehvorschau_oeffnen',
      expect.objectContaining({
        aussehen: expect.objectContaining({ hintergrund: '#123456', hintergrundNativ: null }),
      }),
    );
  } finally {
    zug.beenden();
    await warten();
    document.documentElement.style.removeProperty('--bg-haupt');
    canvas.mockRestore();
  }
});
