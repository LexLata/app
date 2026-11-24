// @vitest-environment jsdom
// Prüft Anzeigewechsel über den öffentlichen Hook und den echten lokalen Speicher.
import { act, StrictMode } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import {
  ladeAnzeigezeitpunkte,
  merkeAnzeige,
} from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { useZuletztAngezeigt } from './useZuletztAngezeigt';
const extern = vi.hoisted(() => ({ invoke: vi.fn(), lesen: vi.fn(), schreiben: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: extern.invoke, isTauri: () => false }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: extern.lesen,
  writeTextFile: extern.schreiben,
}));
const dom = domTestWurzel();
const a = gesetzesreferenz({ kurztitel: 'A' });
const b = gesetzesreferenz({ kurztitel: 'B' });
function Anzeige({ gesetz }: { gesetz: Gesetzesreferenz | null }) {
  useZuletztAngezeigt(gesetz);
  return null;
}
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
it('erfasst das erste Gesetz unter StrictMode genau einmal und ignoriert leere Tabs', async () => {
  const schreiben = vi.spyOn(Storage.prototype, 'setItem');
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <Anzeige gesetz={null} />
      </StrictMode>,
    ),
  );
  expect(schreiben).not.toHaveBeenCalled();
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <Anzeige gesetz={a} />
      </StrictMode>,
    ),
  );
  expect(schreiben).toHaveBeenCalledTimes(1);
  expect(ladeAnzeigezeitpunkte().has(gesetzesreferenzSchluessel(a))).toBe(true);
});
it('überbrückt leere Zwischenzustände und gleiche Referenzen auch nach einer Anzeige im anderen Fenster', async () => {
  await act(async () => dom.root.render(<Anzeige gesetz={a} />));
  merkeAnzeige(b);
  const vorher = ladeAnzeigezeitpunkte();
  const schreiben = vi.spyOn(Storage.prototype, 'setItem');
  await act(async () => dom.root.render(<Anzeige gesetz={null} />));
  await act(async () => dom.root.render(<Anzeige gesetz={{ ...a, kurztitel: 'a' }} />));
  expect(schreiben).not.toHaveBeenCalled();
  expect(ladeAnzeigezeitpunkte()).toEqual(vorher);
  await act(async () => dom.root.render(<Anzeige gesetz={b} />));
  await act(async () => dom.root.render(<Anzeige gesetz={a} />));
  expect(schreiben).toHaveBeenCalledTimes(1);
  const zeitpunktB = vorher.get(gesetzesreferenzSchluessel(b));
  assert(zeitpunktB !== undefined);
  expect(ladeAnzeigezeitpunkte().get(gesetzesreferenzSchluessel(a))).toBeGreaterThan(zeitpunktB);
});

it('schreibt beim Einhängen unter StrictMode trotz doppeltem Effekt nur einmal', async () => {
  const schreiben = vi.spyOn(Storage.prototype, 'setItem');
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <Anzeige gesetz={a} />
      </StrictMode>,
    ),
  );
  expect(schreiben).toHaveBeenCalledTimes(1);
});

it('erfasst und lädt die Liste ohne Datei- oder IPC-Zugriffe', async () => {
  await act(async () => dom.root.render(<Anzeige gesetz={a} />));
  await act(async () => dom.root.render(<Anzeige gesetz={b} />));
  expect(ladeAnzeigezeitpunkte().size).toBe(2);
  expect(extern.invoke).not.toHaveBeenCalled();
  expect(extern.lesen).not.toHaveBeenCalled();
  expect(extern.schreiben).not.toHaveBeenCalled();
});
