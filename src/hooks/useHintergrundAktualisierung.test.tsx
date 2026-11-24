import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// @vitest-environment jsdom
// Prüft Startfreigabe und Auslöser der Automatik mit echter Importkoordination.
import { act, StrictMode, useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { useHintergrundAktualisierung } from './useHintergrundAktualisierung';

const nativ = vi.hoisted(() => ({ invoke: vi.fn(), listener: new Map<string, () => void>() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, callback: () => void) => {
    nativ.listener.set(name, callback);
    return () => nativ.listener.delete(name);
  },
}));
const dom = domTestWurzel();
const gesetz: GesetzDarstellung = {
  kurztitel: 'BGB',
  normgeber: 'de-bund',
  langtitel: '',
  hatGliederungsartikel: false,
  elemente: [],
  verarbeitungszeit: new Date('2020-01-01'),
};
let ersterDurchlaufBeendet: boolean | undefined;
function Ansicht({
  abgeschlossen,
  gesetze = [gesetz],
  bestandAbgeglichen,
}: {
  abgeschlossen: boolean;
  gesetze?: GesetzDarstellung[];
  bestandAbgeglichen?: boolean;
}) {
  const beendet = useHintergrundAktualisierung({
    startAbgeschlossen: abgeschlossen,
    bestandAbgeglichen,
    gesetze: alsSuchverzeichniseintraege(gesetze),
    onInfoAktualisiert: () => {},
  });
  useEffect(() => {
    ersterDurchlaufBeendet = beendet;
  });
  return null;
}
async function zeit(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
const laeufe = () =>
  nativ.invoke.mock.calls.filter(([name]) => name === 'import_aktualisierung_automatisch_starten')
    .length;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04'));
  nativ.invoke.mockReset().mockResolvedValue(null); // Ein anderer Vorgang stellt den Lauf zurück.
  nativ.listener.clear();
  localStorage.setItem('lexlata.autoAktualisierungIntervall', 'taeglich');
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});
it('wartet auch bei überfälligem Bestand, Ereignis und Stundentimer auf den Start', async () => {
  await act(async () => dom.root.render(<Ansicht abgeschlossen={false} />));
  nativ.listener.get('gesetze-geaendert')?.();
  await zeit(3_600_000);
  expect(laeufe()).toBe(0);
  await act(async () => dom.root.render(<Ansicht abgeschlossen />));
  await zeit(9_999);
  expect(laeufe()).toBe(0);
  await zeit(1);
  expect(laeufe()).toBe(1);
});
it('prüft nach Zurückstellung erst stündlich erneut und reagiert nicht auf Bestandsereignisse', async () => {
  await act(async () => dom.root.render(<Ansicht abgeschlossen />));
  await zeit(10_000);
  expect(laeufe()).toBe(1);
  nativ.listener.get('gesetze-geaendert')?.();
  await act(async () => dom.root.render(<Ansicht abgeschlossen gesetze={[{ ...gesetz }]} />));
  await zeit(1_000);
  expect(laeufe()).toBe(1);
  await zeit(3_589_000);
  expect(laeufe()).toBe(2);
});
it('holt die erste Prüfung nach, wenn der Bestand erst nach der Wartezeit geladen wird', async () => {
  await act(async () => dom.root.render(<Ansicht abgeschlossen gesetze={[]} />));
  await zeit(10_000);
  expect(laeufe()).toBe(0);
  await act(async () => dom.root.render(<Ansicht abgeschlossen />));
  expect(laeufe()).toBe(1);
});
it('startet bei Einstellung nie auch nach Freigabe und Stundentimer keinen Lauf', async () => {
  localStorage.setItem('lexlata.autoAktualisierungIntervall', 'nie');
  await act(async () => dom.root.render(<Ansicht abgeschlossen />));
  await zeit(3_600_000);
  expect(laeufe()).toBe(0);
});
it('räumt den Wartetimer beim Unmount auf', async () => {
  await act(async () => dom.root.render(<Ansicht abgeschlossen />));
  await act(async () => dom.root.render(null));
  await zeit(3_600_000);
  expect(laeufe()).toBe(0);
});
it('startet unter StrictMode nach der Wartezeit genau einmal', async () => {
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <Ansicht abgeschlossen />
      </StrictMode>,
    ),
  );
  expect(laeufe()).toBe(0);
  await zeit(10_000);
  expect(laeufe()).toBe(1);
});

it('meldet den ersten Durchlauf erst nach dessen Ende als beendet', async () => {
  let freigeben: (wert: null) => void = () => {};
  nativ.invoke.mockImplementation(
    (name: string) =>
      new Promise((resolve) => {
        if (name === 'import_aktualisierung_automatisch_starten') freigeben = resolve;
        else resolve(null);
      }),
  );
  await act(async () => dom.root.render(<Ansicht abgeschlossen={false} />));
  await zeit(3_600_000);
  expect(ersterDurchlaufBeendet).toBe(false);
  await act(async () => dom.root.render(<Ansicht abgeschlossen />));
  await zeit(10_000);
  expect(laeufe()).toBe(1);
  expect(ersterDurchlaufBeendet).toBe(false);
  await act(async () => freigeben(null));
  await zeit(0);
  expect(ersterDurchlaufBeendet).toBe(true);
});
it('meldet den ersten Durchlauf als nicht fällig bei abgeschalteter Einstellung', async () => {
  localStorage.setItem('lexlata.autoAktualisierungIntervall', 'nie');
  await act(async () => dom.root.render(<Ansicht abgeschlossen />));
  await zeit(10_000);
  expect(ersterDurchlaufBeendet).toBe(true);
  expect(laeufe()).toBe(0);
});
it('meldet bei leerem Bestand erst nach dem Suchverzeichnisabgleich „nicht fällig“', async () => {
  await act(async () => dom.root.render(<Ansicht abgeschlossen gesetze={[]} />));
  await zeit(10_000);
  expect(ersterDurchlaufBeendet).toBe(false);
  await act(async () => dom.root.render(<Ansicht abgeschlossen gesetze={[]} bestandAbgeglichen />));
  expect(ersterDurchlaufBeendet).toBe(true);
  expect(laeufe()).toBe(0);
});
