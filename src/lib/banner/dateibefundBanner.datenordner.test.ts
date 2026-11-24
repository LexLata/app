// Prüft den Knopf „Datenordner öffnen“ im Dateibefund-Banner über den
// Bannerspeicher; Plattform und nativer Befehl sind gemockt.
import { beforeEach, expect, it, vi } from 'vitest';

const nativ = vi.hoisted(() => ({
  plattform: 'macos',
  invoke: vi.fn(async (_name: string, _argumente?: unknown) => {}),
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => nativ.plattform }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke }));

import { alleBannerSchliessen, getSnapshot, meldeDateibefund } from './banner.index';
import { holePlattform } from '@/lib/plattform/tauriHelpers';

function gesichert(n: number) {
  return {
    typ: 'warnung' as const,
    grund: 'imDatenordnerGesichert' as const,
    betroffen: `Datei${n}.xml`,
    sicherung: `markierungen/Datei${n}.beschaedigt.xml`,
    text: `Datei${n}.xml gesichert.`,
  };
}

async function klicke(): Promise<void> {
  const aktion = getSnapshot().find((b) => b.art === 'dateibefunde')?.aktion;
  expect(aktion).toBeDefined();
  aktion?.onClick();
  await vi.waitFor(() => expect(nativ.invoke).toHaveBeenCalled());
}

beforeEach(async () => {
  alleBannerSchliessen();
  nativ.invoke.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await holePlattform();
});

it('öffnet bei genau einer Sicherung deren Ordner', async () => {
  meldeDateibefund(gesichert(1));
  await klicke();
  expect(nativ.invoke).toHaveBeenCalledWith('datenordner_oeffnen', {
    relativerOrdner: 'markierungen',
  });
});

it('öffnet bei mehreren Sicherungen den Datenordner', async () => {
  meldeDateibefund(gesichert(1));
  meldeDateibefund(gesichert(2));
  expect(getSnapshot()).toHaveLength(1);
  await klicke();
  expect(nativ.invoke).toHaveBeenCalledWith('datenordner_oeffnen', {});
});

it('zeigt ohne Sicherung keinen Knopf', () => {
  meldeDateibefund({ typ: 'fehler', grund: 'nichtLesbar', betroffen: 'a.xml', text: 'a.xml' });
  expect(getSnapshot()[0]?.aktion).toBeUndefined();
});

it('meldet einen Fehler beim Öffnen als Bedienhinweis', async () => {
  nativ.invoke.mockRejectedValueOnce(new Error('kein Dateimanager'));
  meldeDateibefund(gesichert(1));
  await klicke();
  await vi.waitFor(() =>
    expect(getSnapshot().some((b) => b.art === 'bedienhinweis' && b.typ === 'fehler')).toBe(true),
  );
});
