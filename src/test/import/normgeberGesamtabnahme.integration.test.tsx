import { geladenesTabGesetz } from '@/test/tabs/tabFabriken';
// @vitest-environment jsdom
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// Gesamtabnahme eigener Normgeber über echten Import, Öffnung, Persistenz und erneuten Appzustand.
import { io, vorbereiten } from './gemischterZipNativeAttrappe';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import { importiereGesetze } from '@/lib/import/import.index';
import { berechneTreffer } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { Navigationsziel } from '@/lib/domain/appTypes';
import { act, useEffect, useState } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { ladeGesetzBestand } from '@/test/tabs/gesetzBestandAbschluss';

import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { GesetzInfoOverlay } from '@/components/overlays/overlays.index';
import {
  hinzufuegenMarkierung,
  initialisiereMarkierungen,
  ladeMarkierungen,
} from '@/lib/markierungen/markierungen.index';
import { ladeLesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { ladeAlleGesetzeskurzbefehle } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { ladeFavoriten, umschaltenFavorit } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
const netz = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: netz.fetch }));
const dom = domTestWurzel();
const ref = { kurztitel: 'TestG', normgeber: 'at-bund' };
const xml =
  '<gesetz version="1"><infos><kurztitel>TestG</kurztitel><normgeber>at-bund</normgeber></infos><inhalt><norm id="n"><bezeichnung>§ 1</bezeichnung><text>Testtext</text></norm></inhalt></gesetz>';
let tabs: ReturnType<typeof useAppTabs>;
function Appzustand({
  gesetze,
  ziel = { gesetzesreferenz: ref, bezeichnung: '1' },
}: {
  gesetze: GesetzDarstellung[];
  ziel?: Navigationsziel;
}) {
  const zustand = useAppTabs();
  useEffect(() => {
    tabs = zustand;
  });
  const [info, setInfo] = useState(false);
  const oeffnen = useGesetzOeffnen({
    ...gesetzOeffnenFixture(zustand, gesetze),

    ladeGesetz: einzelzugriffFuerTest(ladeGesetzBestand),
  });
  const aktiv = zustand.holeTabGesetz(zustand.tabs.find((t) => t.id === zustand.aktiverTabId));
  return (
    <>
      <button onClick={() => oeffnen.gesetzesreferenzOeffnen(ziel)}>Öffnen</button>
      {aktiv && <button onClick={() => setInfo(true)}>Informationen</button>}
      {aktiv && info && <GesetzInfoOverlay gesetz={aktiv} onSchliessen={() => setInfo(false)} />}
    </>
  );
}
beforeEach(() => {
  vorbereiten();
  initialisiereMarkierungen();
});
async function oeffnen() {
  const button = [...dom.host.querySelectorAll('button')].find((b) => b.textContent === 'Öffnen');
  assert(button);
  await act(async () => button.click());
  const aktiv = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabIdRef.current);
  expect(tabs.holeTabGesetz(aktiv)).toMatchObject(ref);
  assert(aktiv);
  expect(tabs.verlaufLesen(aktiv!.id)?.eintraege.at(-1)?.xmlId).toBe('n');
}
it('behält importiertes at-bund, Markierung und Favorit nach neu aufgebautem Appzustand und zeigt den Code in den Informationen', async () => {
  io.dateien.set('/import/TestG.xml', xml);
  expect((await importierePfade(['/import/TestG.xml'])).fehler).toEqual([]);
  await act(async () =>
    dom.root.render(<Appzustand gesetze={(await ladeGesetzBestand()).liste} />),
  );
  await oeffnen();
  const markierung = markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
    bezug: {
      typ: 'bezugstext',
      textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 0, zeichenbereichEnde: 4 },
      bezugstext: 'Test',
    },
  });
  expect((await hinzufuegenMarkierung(ref, markierung)).erfolgreich).toBe(true);
  await umschaltenFavorit(ref, '1');
  // Die gesamte Hookinstanz wird entfernt; nachfolgend ausschließlich aus Dateien frisch lesen.
  await act(async () => dom.root.render(null));
  const neu = await ladeGesetzBestand();
  expect(io.dateien.get('gesetze/TestG_at-bund.xml')).toContain('<normgeber>at-bund</normgeber>');
  expect(io.dateien.get('markierungen/TestG_at-bund-markierungen.xml')).toContain(
    'normgeber="at-bund"',
  );
  expect(io.dateien.get('favoriten/TestG_at-bund-favoriten.xml')).toContain('normgeber="at-bund"');
  expect(await ladeMarkierungen(ref)).toEqual([{ ...markierung, erstellt: expect.any(String) }]);
  expect(await ladeFavoriten(ref)).toEqual(['1']);
  await act(async () => dom.root.render(<Appzustand gesetze={neu.liste} />));
  expect(tabs.tabsRef.current.every((t) => !tabs.holeTabGesetz(t))).toBe(true);
  await oeffnen();
  const info = [...dom.host.querySelectorAll('button')].find(
    (b) => b.textContent === 'Informationen',
  );
  assert(info);
  await act(async () => info.click());
  const label = [...dom.host.querySelectorAll('span')].find((e) => e.textContent === 'Normgeber');
  expect(label?.parentElement?.textContent).toBe('Normgeberat-bund');
});

it('öffnet den XML-Verweis aus de-bund auf die mitgelieferte EMRK und findet dieselbe europarat-Referenz in der Suche', async () => {
  io.dateien.set(
    'resources/europa/EMRK_europarat.xml',
    readFileSync('src-tauri/resources/europa/EMRK_europarat.xml', 'utf8'),
  );
  expect(
    (
      await importiereGesetze(
        [{ kurztitel: 'EMRK', abrufkennung: 'EMRK_europarat.xml' }],
        'europarat',
      )
    ).fehlgeschlagene,
  ).toEqual([]);
  io.dateien.set(
    '/import/VerweisG.xml',
    '<gesetz version="1"><infos><kurztitel>VerweisG</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text>Siehe <verweis gesetz="EMRK" normgeber="europarat" norm="Art. 1">Art. 1 EMRK</verweis>.</text></norm></inhalt></gesetz>',
  );
  expect((await importierePfade(['/import/VerweisG.xml'])).fehler).toEqual([]);
  const gesetze = (await ladeGesetzBestand()).liste;
  const quelle = gesetze.find((g) => g.kurztitel === 'VerweisG');
  const norm = quelle?.elemente.find((e) => e.typ === 'norm');
  assert(norm?.typ === 'norm');
  const verweis = norm.data.getaggteVerweise?.[0];
  assert(verweis?.zielgesetz);
  const zielgesetz = verweis.zielgesetz;
  expect(verweis.zielgesetz).toEqual({ kurztitel: 'EMRK', normgeber: 'europarat' });
  await act(async () =>
    dom.root.render(
      <Appzustand
        gesetze={gesetze}
        ziel={{ gesetzesreferenz: zielgesetz, bezeichnung: verweis.zielBezeichnung }}
      />,
    ),
  );
  const button = dom.host.querySelector('button');
  assert(button);
  await act(async () => button.click());
  const aktiv = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabIdRef.current);
  expect(tabs.holeTabGesetz(aktiv)).toMatchObject({ kurztitel: 'EMRK', normgeber: 'europarat' });
  assert(tabs.holeTabGesetz(aktiv));
  const zielnorm = geladenesTabGesetz(tabs, aktiv).elemente.find(
    (e) => e.typ === 'norm' && e.data.bezeichnung === 'Artikel 1',
  );
  assert(zielnorm);
  expect(tabs.verlaufLesen(aktiv!.id)?.eintraege.at(-1)?.xmlId).toBe(zielnorm.data.xmlId);
  const treffer = berechneTreffer('EMRK', alsSuchverzeichniseintraege(gesetze), null, {
    'de-bund': [],
    'de-bw': [],
    eu: [],
  });
  expect(treffer).toHaveLength(1);
  expect(treffer[0]).toMatchObject({
    art: 'installiert',
    gesetzesreferenz: { kurztitel: 'EMRK', normgeber: 'europarat' },
  });
});

it('importiert Bundes- und Landesrecht über ihre Indizes bis zu den gespeicherten Codedateien', async () => {
  for (const [code, datenquellenname] of [
    ['de-bund', 'gesetze-im-internet.de'],
    ['de-bw', 'landesrecht-bw.de'],
  ]) {
    io.dateien.set(
      `importindizes/${code}.xml`,
      `<importindex version="1"><infos><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>${code}</normgeber><datenquelle name="${datenquellenname}"/></infos><inhalt><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>TestG</abrufkennung></gesetz></inhalt></importindex>`,
    );
  }
  const bundXML =
    '<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>TestG</jurabk><langue>Testgesetz</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Ein erster Satz.</P></Content></text></textdaten></norm></dokumente>';
  netz.fetch.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => zipSync({ 'gesetz.xml': strToU8(bundXML) }).buffer,
  });
  const original = io.invoke.getMockImplementation();
  assert(original);
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'lade_gesetz_html_bw')
      return '<html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000</title><meta charset="utf-8"></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 1 Titel</h4><p>Ein erster Satz.</p></div></body></html>';
    return original(name, args);
  });
  for (const code of ['de-bund', 'de-bw']) {
    const ergebnis = await importiereGesetze(['TestG'], code);
    expect(ergebnis.fehlgeschlagene).toEqual([]);
    expect(ergebnis.erfolgreiche).toEqual([
      expect.objectContaining({ kurztitel: 'TestG', normgeber: code }),
    ]);
    expect(io.dateien.get(`gesetze/TestG_${code}.xml`)).toContain(`<normgeber>${code}</normgeber>`);
  }
  expect((await ladeGesetzBestand()).liste.map((g) => g.normgeber).sort()).toEqual([
    'de-bund',
    'de-bw',
  ]);
});

it.each([
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'BW' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
])('sichert alte Nutzerdateien mit %s vollständig vor ihrer Bereinigung', async (code) => {
  const dateien = [
    [
      'favoriten/TestG_at-bund-favoriten.xml',
      `<favoriten><infos><gesetz normgeber="${code}">TestG</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>`,
    ],
    [
      'lesezeichen/lesezeichen.xml',
      `<lesezeichen><inhalt><eintrag><bezeichnung>1</bezeichnung><gesetz normgeber="${code}">TestG</gesetz></eintrag></inhalt></lesezeichen>`,
    ],
    [
      'einstellungen/gesetzeskurzbefehle.xml',
      `<gesetzeskurzbefehle><inhalt><gesetzeskurzbefehl><gesetz normgeber="${code}">TestG</gesetz><taste primaer="true">t</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>`,
    ],
  ];
  for (const [pfad, inhalt] of dateien) {
    assert(pfad !== undefined && inhalt !== undefined);
    io.dateien.set(pfad, inhalt);
  }
  await expect(ladeFavoriten(ref)).resolves.toEqual([]);
  await expect(ladeLesezeichen()).resolves.toEqual([]);
  await expect(ladeAlleGesetzeskurzbefehle()).resolves.toEqual({});
  for (const [pfad, inhalt] of dateien) {
    expect(io.dateien.get(pfad + '.sicherung')).toBe(inhalt);
    expect(io.dateien.get(pfad ?? '')).not.toBe(inhalt);
  }
  expect(io.dateien.has('favoriten/TestG_at-bund-favoriten.xml')).toBe(false);
  await expect(ladeLesezeichen()).resolves.toEqual([]);
  await expect(ladeAlleGesetzeskurzbefehle()).resolves.toEqual({});
  expect(
    io.invoke.mock.calls.filter(([name]) => name === 'archiviere_beschaedigte_datei'),
  ).toHaveLength(3);
});
