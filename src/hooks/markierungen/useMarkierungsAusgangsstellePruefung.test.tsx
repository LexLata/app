// @vitest-environment jsdom
// Formularprüfung mit echtem Ausgangsresolver: Änderungen, Ladefehler und alte Abschlüsse.
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { act, useEffect } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { KommentarKontext } from '@/lib/markierungen/markierungen.index';
import { useMarkierungsAusgangsstellePruefung } from './useVerweismarkierungUndKommentarHilfsfenster';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const native = vi.hoisted(() => ({
  laden: vi.fn(),
  callbacks: new Map<string, (event: { payload: unknown[] }) => void>(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({ ladeAlleGesetze: native.laden }));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', () => ({
  hoereGlobal: (name: string, callback: (event: { payload: unknown[] }) => void) => {
    native.callbacks.set(name, callback);
    return { bereit: Promise.resolve(), abmelden: () => native.callbacks.delete(name) };
  },
}));
const dom = domTestWurzel();
const kontext: KommentarKontext = {
  gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
  openerLabel: 'main',
  ausgangsstelle: normAusgangsstelle('§ 9'),
  bearbeiten: {
    kommentarText: 'Alt',
    vorher: { elementstand: testElementstand(), kommentarText: 'Alt' },
  },
};
function gesetze(bezeichnungen: string[]): GesetzDarstellung[] {
  return [
    gesetzMitNormen(bezeichnungen, {
      ...kontext.gesetz,
      langtitel: 'BGB',
      kennung: (i) => `n-${i}`,
    }),
  ];
}
let ergebnis: ReturnType<typeof useMarkierungsAusgangsstellePruefung>;
function FormularPruefung() {
  const aktuell = useMarkierungsAusgangsstellePruefung(kontext, markierungsEinzelzugriffFuerTest);
  useEffect(() => {
    ergebnis = aktuell;
  }, [aktuell]);
  return null;
}
it('erkennt verschwundene/mehrdeutige Ausgangsstelle und trennt Ladefehler davon', async () => {
  native.laden.mockResolvedValue(gesetze(['§ 9']));
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(ergebnis.bezugErhalten).toBe(false);
  expect(ergebnis.bezugPruefungLaeuft).toBe(false);
  for (const namen of [['§ 90'], ['§ 9', '§ 9'], []]) {
    native.laden.mockResolvedValue(gesetze(namen));
    await act(async () =>
      native.callbacks.get('gesetze-geaendert')!({
        payload: [{ kurztitel: 'BGB', normgeber: 'de-bund' }],
      }),
    );
    expect(ergebnis).toMatchObject({
      bezugErhalten: true,
      bezugPruefungLaeuft: false,
      bezugPrueffehler: null,
    });
  }
  native.laden.mockImplementation(async (melde) => {
    melde([{ status: 'unlesbar', dateiBasis: 'BGB_de-bund', fehler: 'Lesefehler' }]);
    return [];
  });
  await act(async () => native.callbacks.get('gesetze-geloescht')!({ payload: [] }));
  expect(ergebnis.bezugErhalten).toBe(false);
  expect(ergebnis.bezugPrueffehler).toContain('nicht zuverlässig gelesen');
  native.laden.mockResolvedValue(gesetze(['§ 9']));
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(ergebnis).toMatchObject({
    bezugErhalten: false,
    bezugPruefungLaeuft: false,
    bezugPrueffehler: null,
  });
  await act(async () => dom.root.render(null));
  expect(native.callbacks.size).toBe(0);
});
it('ein alter Ladeabschluss gibt eine inzwischen verschwundene Stelle nicht wieder frei', async () => {
  let abschliessen!: (gesetze: GesetzDarstellung[]) => void;
  native.laden.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        abschliessen = resolve;
      }),
  );
  await act(async () => dom.root.render(<FormularPruefung />));
  expect(ergebnis.bezugPruefungLaeuft).toBe(true);
  native.laden.mockResolvedValue(gesetze(['§ 90']));
  await act(async () =>
    native.callbacks.get('gesetze-geaendert')!({
      payload: [{ kurztitel: 'BGB', normgeber: 'de-bund' }],
    }),
  );
  expect(ergebnis.bezugErhalten).toBe(true);
  await act(async () => abschliessen(gesetze(['§ 9'])));
  expect(ergebnis.bezugErhalten).toBe(true);
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: native.laden,
}));
