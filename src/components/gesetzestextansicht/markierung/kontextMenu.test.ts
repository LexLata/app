// kontextMenu.test.ts
// Echte Tauri-JS-Kanäle gegen einen Adapter für die native Ressourcenlebensdauer.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { zeigeMarkierungKontextMenu } from './kontextMenu';

interface NativeOptionen {
  kind: string;
  handler: { id: number };
  options: { text?: string; items?: ({ handler: { id: number } } | [number, string])[] };
  rid: number;
}
let nummer = 0;
let letztesPopup: number[] = [];
const kanaele = new Map<number, number>();
const menues = new Map<number, number[]>();
const geschlossen: number[] = [];
const beschriftungen: string[] = [];

function sende(kanal: number, nachricht: unknown) {
  const intern = window as unknown as {
    __TAURI_INTERNALS__: { runCallback: (id: number, daten: unknown) => void };
  };
  intern.__TAURI_INTERNALS__.runCallback(kanal, nachricht);
}

beforeEach(() => {
  vi.stubGlobal('window', { crypto: globalThis.crypto });
  mockWindows('main');
  mockIPC((cmd, argumente) => {
    const a = argumente as unknown as NativeOptionen;
    if (cmd === 'plugin:menu|new') {
      const rid = ++nummer;
      if (a.kind === 'MenuItem') {
        kanaele.set(rid, a.handler.id);
        beschriftungen.push(a.options.text!);
      } else {
        const eintraege = (a.options.items ?? []).map((item) => {
          if (Array.isArray(item)) return item[0];
          // Tauri 2.12: Inline-Einträge verlieren beim Ende von MenuBuilder::build
          // ihren letzten Tauri-Wrapper; dessen Drop entfernt den Aktionskanal.
          sende(item.handler.id, { end: true, index: 0 });
          return ++nummer;
        });
        menues.set(rid, eintraege);
      }
      return [rid, `menue-${rid}`];
    }
    if (cmd === 'plugin:menu|popup') letztesPopup = menues.get(a.rid)!;
    if (cmd === 'plugin:resources|close') {
      geschlossen.push(a.rid);
      kanaele.delete(a.rid);
      menues.delete(a.rid);
    }
    return null;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('führt beide Aktionen auch nach Rückkehr aus popup aus und gibt das vorige Menü später frei', async () => {
  const bearbeiten = vi.fn();
  const loeschen = vi.fn();
  await zeigeMarkierungKontextMenu([
    { text: 'Verweis bearbeiten', action: bearbeiten },
    { text: 'Markierung löschen', action: loeschen },
  ]);
  const ersteEintraege = [...letztesPopup];
  expect(ersteEintraege).toHaveLength(2);
  for (const rid of ersteEintraege) {
    const kanal = kanaele.get(rid);
    expect(kanal).toBeDefined();
    sende(kanal!, { message: `menue-${rid}`, index: 0 });
  }
  expect(bearbeiten).toHaveBeenCalledOnce();
  expect(loeschen).toHaveBeenCalledOnce();
  expect(ersteEintraege.every((rid) => !geschlossen.includes(rid))).toBe(true);

  await zeigeMarkierungKontextMenu([{ text: 'Markierung löschen', action: vi.fn() }]);
  expect(ersteEintraege.every((rid) => geschlossen.includes(rid))).toBe(true);
});

it('schützt an der echten nativen Menüübergabe, ohne Einträge umzuschreiben', async () => {
  const eintrag = { text: 'Art. 1 Abs. 1 bearbeiten', action: vi.fn() };
  await zeigeMarkierungKontextMenu([eintrag]);
  expect(beschriftungen.at(-1)).toBe('Art.\u00a01 Abs.\u00a01 bearbeiten');
  expect(eintrag.text).toBe('Art. 1 Abs. 1 bearbeiten');
});
