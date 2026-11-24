// @vitest-environment jsdom
// Konfliktseitenleiste.anzeige.test.tsx
// Reale Konfliktseitenleiste: zusammenhängende Meldungen, Schutzgruppen, Rohdaten und native Dialoge.

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Konfliktseitenleiste } from './Konfliktseitenleiste';
import type { Auswahl } from './MarkierungskonfliktFenster.helpers';
import { zeilenVonEintrag } from './MarkierungskonfliktFenster.helpers';
import type { AnzeigeKonfliktEintrag } from '@/lib/markierungen/markierungen.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const mocks = vi.hoisted(() => ({
  live: vi.fn(),
  ziel: vi.fn(),
  loeschen: vi.fn(),
  alleLoeschen: vi.fn(),
  confirm: vi.fn(),
  navigation: vi.fn(),
  bearbeiten: vi.fn(),
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  ladeAktuelleMarkierung: mocks.live,
  ermittleFehlendeGesetze: () => [],
  importFehlenderNormen: vi.fn(),
  loescheAusgewaehlt: mocks.loeschen,
  loescheAlleMitKonflikten: mocks.alleLoeschen,
  aktualisiereVerknuepfungMitErgebnis: mocks.ziel,
  aktualisiereAusgangsVerknuepfungMitErgebnis: vi.fn(),
  ermittleAktuelleVerknuepfungsMoeglichkeit: vi.fn(),
  verknuepfeMitAktuellenNormen: vi.fn(),
  pruefeAlleMarkierungen: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: mocks.confirm }));
vi.mock('@/hooks/fenster/useInterneNavigation', () => ({ oeffneInternesZiel: mocks.navigation }));
vi.mock(
  '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster.ausgangskontext',
  () => ({
    bearbeiteVerweismarkierung: mocks.bearbeiten,
  }),
);
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useTextRollen', () => ({
  useIconGroessen: () => ({ standard: 16 }),
  useTextRollen: () => ({ standardtext: {}, standardtextBetont: {}, fehlertext: {} }),
}));
vi.mock('@/hooks/stil/useAbstandRollen', () => ({
  useAbstandRollen: () => ({ standard: 8, kompakt: 4, gross: 12 }),
}));
vi.mock('@/hooks/stil/useButtonRollen', () => ({
  useButtonRollen: () => ({ sekundaerKompakt: () => ({}), paddingFaktorKompakt: () => '5px 8px' }),
}));
let host: HTMLDivElement;
let root: Root;
const gesetz = { kurztitel: 'ZPO', normgeber: 'de-bund' };
const eintrag: AnzeigeKonfliktEintrag = {
  schluessel: 'Art. 1',
  ausgangsstelle: normAusgangsstelle('§ 98'),
  bezeichnungAnzeige: '§ 98',
  markierungstyp: 'verweismarkierung',
  zielKonflikte: [],
};
const gesetze = [{ gesetz, eintraege: [eintrag] }];
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mocks.confirm.mockResolvedValue(true);
  mocks.ziel.mockResolvedValue({
    status: 'unveraendert',
    ergebnis: { elementstaende: 0, verweisziele: 0, markierungen: 0 },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function rendern(auswahl: Auswahl) {
  await act(async () =>
    root.render(
      <Konfliktseitenleiste
        ladeGesetz={markierungsEinzelzugriffFuerTest}
        auswahl={auswahl}
        gesetze={gesetze}
        verknuepfungsMoeglichkeit={{ moeglich: true, fehler: null }}
        wirdGeladen={false}
        aktionsAbschlussOffen={false}
        onErfolgreicherImport={vi.fn()}
        onAlleGeprueft={vi.fn()}
      />,
    ),
  );
}
function button(text: string) {
  return [...host.querySelectorAll('button')].find((el) => el.textContent === text)!;
}
async function klicken(text: string) {
  await act(async () => button(text).click());
}
async function zielRendern(
  zeilenart: 'zielNormUnpassend' | 'zielNormNichtEindeutig' | 'zielNormFehlt',
  anzahl = 1,
) {
  const verweisziele = Array.from({ length: anzahl }, (_, i) => ({
    bezeichnung: '§ ' + String(98 + i),
  }));
  const live = {
    verweisinhalt: { verweisziele: [...verweisziele, { bezeichnung: '§ 9999' }] },
  };
  mocks.live.mockResolvedValue(live);
  const konflikt: AnzeigeKonfliktEintrag = {
    ...eintrag,
    zielKonflikte: [
      {
        gesetz,
        typ: zeilenart === 'zielNormUnpassend' ? 'zielNormUnpassend' : 'zielNormFehlt',
        bezeichnungenAnzeige: verweisziele.map((z) => ({
          ...z,
          befund:
            zeilenart === 'zielNormNichtEindeutig'
              ? 'nichtEindeutig'
              : zeilenart === 'zielNormFehlt'
                ? 'fehlt'
                : 'unpassend',
        })),
      },
    ],
  };
  const auswahl: Auswahl = {
    art: 'zeile',
    gesetz,
    eintrag: konflikt,
    zeile: zeilenVonEintrag(konflikt)[0]!,
  };
  await rendern(auswahl);
  return { live, auswahl };
}
it.each(['zielNormUnpassend', 'zielNormNichtEindeutig', 'zielNormFehlt'] as const)(
  'bietet ausschließlich Aktionen der Zeilenart %s an; Öffnen nutzt die einzelne Zeilennorm',
  async (art) => {
    const { live, auswahl } = await zielRendern(art);
    expect(button('Markierung löschen')).toBeDefined();
    expect(button('Verweis bearbeiten')).toBeDefined();
    expect(button('Verknüpfung entfernen')).toBeDefined();
    expect(!!button('Zielnorm öffnen')).toBe(art === 'zielNormUnpassend');
    expect(!!button('Mit aktueller Norm verknüpfen')).toBe(art === 'zielNormUnpassend');
    expect(host.textContent).not.toContain('Mit vorhandenen Normen verknüpfen');
    expect(host.textContent).not.toContain('bleibt bestehen');
    expect(host.textContent).not.toContain('werden übersprungen');
    await klicken('Verweis bearbeiten');
    expect(mocks.bearbeiten).toHaveBeenCalledWith(
      gesetz,
      markierungsEinzelzugriffFuerTest,
      live,
      expect.any(Function),
    );
    if (art === 'zielNormUnpassend') {
      await klicken('Zielnorm öffnen');
      expect(mocks.navigation).toHaveBeenCalledWith({
        gesetz,
        ziel: { type: 'norm', bezeichnung: '§ 98' },
      });
      await klicken('Mit aktueller Norm verknüpfen');
      expect(mocks.ziel).toHaveBeenCalledWith(
        gesetz,
        eintrag.schluessel,
        gesetz,
        'verknuepfen',
        { zeilenart: art, verweisziele: auswahl.zeile.verweisziele },
        expect.any(Function),
      );
    }
  },
);
it.each([1, 2])(
  'verwendet bei %s Zielnormen die passende Zahlform in Buttons und Dialog',
  async (anzahl) => {
    await zielRendern('zielNormUnpassend', anzahl);
    const plural = anzahl === 2;
    expect(
      button(plural ? 'Mit aktuellen Normen verknüpfen' : 'Mit aktueller Norm verknüpfen'),
    ).toBeDefined();
    expect(!!button('Zielnorm öffnen')).toBe(!plural);
    const titel = plural ? 'Verknüpfungen entfernen' : 'Verknüpfung entfernen';
    await klicken(titel);
    expect(mocks.confirm).toHaveBeenCalledWith(
      plural
        ? 'Wenn die markierte Norm nicht mit den Zielnormen verknüpft ist, wird nicht geprüft, ob die Zielnormen sich verändern. Verknüpfungen wirklich entfernen?'
        : 'Wenn die markierte Norm nicht mit der Zielnorm verknüpft ist, wird nicht geprüft, ob die Zielnorm sich verändert. Verknüpfung wirklich entfernen?',
      expect.objectContaining({ title: titel }),
    );
  },
);

it('führt die vier Bestätigungswege über die native Anzeigegrenze und behält Aktionsdaten', async () => {
  await rendern({ art: 'datensatz', gesetz });
  await klicken('Markierungen löschen');
  expect(mocks.loeschen).toHaveBeenCalledWith({ art: 'datensatz', gesetz }, expect.any(Function));
  const titelGesetz = { kurztitel: 'Art. 1', normgeber: 'de-bund' };
  await rendern({ art: 'nichtamtlicheTitelXmlFehlt', gesetz: titelGesetz });
  await klicken('Markierungen nichtamtlicher Titel löschen');
  expect(mocks.confirm).toHaveBeenLastCalledWith(
    'Alle Markierungen nichtamtlicher Titel des Gesetzes Art.\u00a01 werden unwiderruflich gelöscht. Wirklich löschen?',
    expect.objectContaining({ title: 'Markierungen nichtamtlicher Titel löschen' }),
  );
  expect(mocks.loeschen).toHaveBeenLastCalledWith(
    {
      art: 'nichtamtlicheTitelXmlFehlt',
      gesetz: titelGesetz,
    },
    expect.any(Function),
  );
  await klicken('Alle betroffenen Markierungen löschen');
  expect(mocks.alleLoeschen).toHaveBeenCalledWith(gesetze, expect.any(Function));
  await zielRendern('zielNormFehlt');
  await klicken('Verknüpfung entfernen');
  expect(mocks.confirm).toHaveBeenCalledTimes(4);
  expect(mocks.confirm.mock.calls.map((call) => call[1].title)).toEqual([
    'Markierungen löschen',
    'Markierungen nichtamtlicher Titel löschen',
    'Alle Markierungen löschen',
    'Verknüpfung entfernen',
  ]);
  expect(mocks.ziel).toHaveBeenLastCalledWith(
    gesetz,
    eintrag.schluessel,
    gesetz,
    'entfernen',
    { zeilenart: 'zielNormFehlt', verweisziele: [{ bezeichnung: '§ 98' }] },
    expect.any(Function),
  );
  expect(titelGesetz.kurztitel).toBe('Art. 1');
});
