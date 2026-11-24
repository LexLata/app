// @vitest-environment jsdom
// Hintergrundstart und echte Suchoberfläche arbeiten ohne geladene Darstellung auf der Cachedatei.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
import { OeffnenOverlay } from '@/components/overlays/overlays.index';
import { useSuchverzeichnisAbgleich } from '@/hooks/useSuchverzeichnis';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { leseSuchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';

import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  leiteSuchverzeichniseintragAb,
  parseSuchanfrage,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  loeseNormzielNachImportAuf,
  bereiteSuchverzeichnisVor,
} from '@/lib/gesetz-laden/gesetz-laden.index';
import { alleBannerSchliessen, getSnapshot, meldeDateibefund } from '@/lib/banner/banner.index';
import { berechneTreffer } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';

const dom = domTestWurzel();
function Probe({ startAbgeschlossen }: { startAbgeschlossen: boolean }) {
  useSuchverzeichnisAbgleich(startAbgeschlossen);
  return (
    <OeffnenOverlay
      gesetze={[]}
      aktivesGesetz={null}
      initialInput="1"
      onSchliessen={() => {}}
      onGesetzOeffnen={() => {}}
      onNeuenTabOeffnen={() => {}}
      onInstalliertOeffnen={suchtrefferOeffnenFuerTest(
        [],
        () => {},
        () => {},
      )}
    />
  );
}
const gesetzXML = (kurztitel: string) =>
  `<gesetz><infos><kurztitel>${kurztitel}</kurztitel><langtitel>Probegesetz</langtitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Inhalt</absatz></text></norm></inhalt></gesetz>`;
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  initialisiereMarkierungen();
  alleBannerSchliessen();
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  io.dateien.set('gesetze/Erste_de-bund.xml', gesetzXML('Erste'));
  io.dateien.set('gesetze/Zweite_de-bund.xml', gesetzXML('Zweite'));
});
it('beginnt erst nach dem Fensterstart, zeigt Fortschritt und liefert erste Treffer vor Abschluss', async () => {
  let freigeben!: () => void;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  io.vorLesen = (pfad) => (pfad.endsWith('/Zweite_de-bund.xml') ? warten : undefined);
  await act(async () => dom.root.render(<Probe startAbgeschlossen={false} />));
  expect(io.dateien.has('cache/suchverzeichnis.json')).toBe(false);
  expect(dom.host.textContent).toContain('Gesetzesliste wird vorbereitet');
  await act(async () => dom.root.render(<Probe startAbgeschlossen />));
  await act(async () => {
    await vi.waitFor(async () => expect((await leseSuchverzeichnis()).eintraege).toHaveLength(1));
  });
  expect(dom.host.textContent).toContain('Gesetzesliste wird vorbereitet … (1 von 2)');
  expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(1);
  expect(dom.host.textContent).toContain('Erste');
  await act(async () => {
    freigeben();
    await vi.waitFor(async () => expect((await leseSuchverzeichnis()).abgeglichen).toBe(true));
  });
  expect(dom.host.textContent).not.toContain('Gesetzesliste wird vorbereitet');
  expect(dom.host.querySelectorAll('[data-idx]')).toHaveLength(2);
  const stand = await leseSuchverzeichnis();
  expect(berechneTreffer('1 Zweite', stand.eintraege, null, null)).toMatchObject([
    { art: 'installiert', gesetzesreferenz: { kurztitel: 'Zweite' }, norm: { xmlId: 'p1' } },
  ]);
});

it('zeigt einen bereits sichtbaren Titeldateifehler einmal und einen anderen Quellenfehler zusätzlich', async () => {
  const fehlertext = (titel: string) =>
    `Die Titeldatei für „${titel}“ konnte nicht gelesen werden. Ihre Titel werden derzeit nicht angezeigt.`;
  meldeDateibefund({
    typ: 'fehler',
    grund: 'nichtLesbar',
    betroffen: 'Erste_de-bund-nichtamtliche-titel.xml',
    text: fehlertext('Erste'),
  });
  for (const titel of ['Erste', 'Zweite'])
    io.dateien.set(`nichtamtliche-titel/${titel}_de-bund-nichtamtliche-titel.xml`, 'vorhanden');
  io.vorLesen = (pfad) => {
    if (pfad.includes('/nichtamtliche-titel/')) throw new Error('Titelzugriff gesperrt');
    return undefined;
  };
  await act(async () => bereiteSuchverzeichnisVor());
  // Der bereits gemeldete Befund wird nicht erneut geführt; der neue erweitert das Banner.
  const banner = getSnapshot();
  expect(banner).toHaveLength(1);
  expect(
    banner[0]?.gliederung?.kategorien.flatMap((k) =>
      k.gruppen.map((g) => [g.schluessel, g.namen.map((n) => n.name)]),
    ),
  ).toEqual([
    [
      'nichtLesbar',
      ['Erste_de-bund-nichtamtliche-titel.xml', 'Zweite_de-bund-nichtamtliche-titel.xml'],
    ],
  ]);
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(true);
});

it.each([
  ['leer', false],
  ['leer', true],
  ['reparierbar', false],
  ['reparierbar', true],
] as const)(
  'zeigt den Gesetz-Ladebefund %s mit vorherigem Startladen %s genau einmal und erhält das Reparaturangebot',
  async (status, zuvorGeladen) => {
    io.dateien.clear();
    io.dateien.set(
      'gesetze/Probe_de-bund.xml',
      status === 'leer'
        ? ''
        : '<gesetz><infos><kurztitel>Probe</kurztitel><normgeber>de-bund</normgeber></infos>',
    );
    if (zuvorGeladen)
      await erzeugeGeladeneGesetze().ladeGesetz({ kurztitel: 'Probe', normgeber: 'de-bund' });
    const vorher = getSnapshot();
    if (zuvorGeladen) expect(vorher).toHaveLength(1);
    await act(async () => bereiteSuchverzeichnisVor());
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot().map((banner) => banner.aktion?.label)).toEqual([
      status === 'reparierbar' ? 'Alle aktualisieren' : undefined,
    ]);
    if (zuvorGeladen) expect(getSnapshot()).toEqual(vorher);
  },
);

it('verwendet einen stempelbestätigten Eintrag auch bei noch nicht abgeschlossenem Gesamtabgleich ohne XML-Zweitlesen', async () => {
  const xml = gesetzXML('Erste');
  const gesetz = parseGesetzesXML(xml);
  if (!gesetz) throw new Error('Testgesetz ungültig');
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({
      version: 1,
      abgeglichen: false,
      eintraege: [
        leiteSuchverzeichniseintragAb(gesetz, { groesse: String(xml.length), aenderungszeit: '1' }),
      ],
    }),
  );
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) throw new Error('XML darf nicht erneut gelesen werden');
    return undefined;
  };
  expect(await loeseNormzielNachImportAuf(gesetz, parseSuchanfrage('1 Erste'))).toBe('p1');
  expect(getSnapshot()).toEqual([]);
});
