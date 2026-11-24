// @vitest-environment jsdom
// Klappen meldet die vorab nachgeführte Stelle an den echten Verlaufsbesitzer.
import { act, useLayoutEffect, useRef } from 'react';
import { expect, it, vi } from 'vitest';
import { useVerlaufSteuerung } from '@/hooks/tabs/useVerlaufSteuerung';
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import {
  richteNavigationAnsichtEin,
  useTestVirtualizer,
  leistenProps,
} from '@/test/gesetz/navigationAnsicht';
import { useAnsichtssteuerung, StrukturKontextLeiste } from './ansichtssteuerung.index';
let verlauf: ReturnType<typeof useVerlaufSteuerung>;
let meldungen: { xmlId: string; art: string }[];
const fixture = richteNavigationAnsichtEin(
  (optionen) => {
    const tabs = useRef([tabFuerTest({ id: 'tab', gesetz: optionen.gesetz })]);
    verlauf = useVerlaufSteuerung(tabs);
    useLayoutEffect(() => {
      verlauf.verlaufSichtbarkeit('tab');
    }, []);
    return useAnsichtssteuerung({
      ...optionen,
      initialAktivesElementId: 'n0',
      onBedienung: () => verlauf.verlaufBedienung('tab'),
      onAktivierung(meldung) {
        meldungen.push(meldung);
        verlauf.verlaufAktivierung(
          'tab',
          { gesetzesreferenz: optionen.gesetz, xmlId: meldung.xmlId },
          meldung.art,
        );
      },
    });
  },
  (ansicht) => <StrukturKontextLeiste modell={ansicht.kontextLeiste} {...leistenProps} />,
);
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (o: Parameters<typeof useTestVirtualizer>[0]) => useTestVirtualizer(o),
}));
async function starten() {
  meldungen = [];
  await fixture.starten();
}
it('P4-A1/A3/A9: Zuklappen verlässt die sofort nachgeführte Stelle; Zurück führt dorthin', async () => {
  await starten();
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  await fixture.abwarten();
  fixture.container().scrollTop = 520;
  meldungen = [];
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  expect(meldungen).toEqual([
    { xmlId: 'n5', art: 'nachfuehrung' },
    { xmlId: 'u4', art: 'sprung' },
  ]);
  expect(fixture.ansicht.baum.aktivesElementId).toBe('u4');
  expect(verlauf.verlaufLesen('tab')?.eintraege.map((e) => e.xmlId)).toContain('n5');
  const oeffnen = vi.fn<Parameters<typeof verlauf.verlaufNavigieren>[2]>(() => () => {});
  await act(async () => verlauf.verlaufNavigieren('tab', 'zurueck', oeffnen));
  expect(oeffnen.mock.calls[0]?.[0]).toMatchObject({ xmlId: 'n5' });
});
it.each(['aufklappen', 'zuklappen'] as const)(
  'P4-A2/A3/A4/A7: %s führt ohne Nutzerscrollen einmal vorab nach und trägt erst nach 60 Sekunden ein',
  async (bedienung) => {
    await starten();
    fixture.container().scrollTop = 520;
    meldungen = [];
    const vorher = verlauf.verlaufLesen('tab')?.eintraege;
    await act(async () => fixture.ansicht.klappstufen[bedienung]());
    expect(meldungen).toEqual([{ xmlId: 'n5', art: 'nachfuehrung' }]);
    expect(fixture.ansicht.baum.aktivesElementId).toBe('n5');
    expect(verlauf.verlaufLesen('tab')?.eintraege).toBe(vorher);
    await act(async () => vi.advanceTimersByTime(250));
    expect(meldungen).toHaveLength(1);
    await act(async () => vi.advanceTimersByTime(59_750));
    expect(verlauf.verlaufLesen('tab')?.eintraege[0]?.xmlId).toBe('n5');
  },
);

it('P4-A6: sichtbares aktives Element wird beim Klappstufenwechsel nicht erneut gemeldet', async () => {
  await starten();
  meldungen = [];
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  expect(fixture.ansicht.baum.aktivesElementId).toBe('n0');
  expect(meldungen).toEqual([]);
});
it('P4-A5: laufender Zielauftrag unterdrückt die Nachführung vorab', async () => {
  await starten();
  await act(async () => fixture.ansicht.springeZuXmlId('n15', 'sprung'));
  fixture.container().scrollTop = 520;
  meldungen = [];
  await act(async () => fixture.ansicht.klappstufen.zuklappen());
  expect(meldungen.some((m) => m.art === 'nachfuehrung')).toBe(false);
  expect(fixture.ansicht.baum.aktivesElementId).toBe('n15');
});
