// @vitest-environment jsdom
// G-A4: gemeinsamer Fachablauf mit echten Speichern, Konfliktaktionen und Renderern.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import {
  aktualisiereAusgangsVerknuepfungMitErgebnis,
  hinzufuegenMarkierung,
  ladeMarkierungen,
  ladeMarkierungskonflikteFuerAnzeige,
  pruefeAlleMarkierungen,
  registriereMarkierungsHistorienEmpfang,
  speichereVerweismarkierung,
  speichereKommentar,
  type MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import {
  MarkierungCtx,
  VerweisSuperscript,
} from '@/components/gesetzestextansicht/markierung/markierung.index';
import { TextBlatt } from './textBlatt';
import { UeberschriftZeile } from './ueberschriftZeile';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const wurzeln: Root[] = [];
const referenz = { kurztitel: 'TestG', normgeber: 'de-bund' };
const gesetzpfad = aufbau.basis + 'gesetze/TestG_de-bund.xml';
const markierungspfad = aufbau.basis + 'markierungen/TestG_de-bund-markierungen.xml';
const text = 'Unterstrichen Hervorgehoben Verweis';
const verweistext = '§ 6 EGBGB, Abs. 3 und GG';
function gesetzXML(kurztitel: string, inhalt: string) {
  return `<gesetz version="1"><infos><kurztitel>${kurztitel}</kurztitel><langtitel>Testgesetz</langtitel><normgeber>de-bund</normgeber></infos><inhalt>${inhalt}</inhalt></gesetz>`;
}
async function importiereFixture() {
  const dateien = [
    [
      'TestG',
      `<gliederung id="u1" gliederungskennzahl="001"><bezeichnung>Teil 1</bezeichnung><titel>Alter Titel</titel></gliederung><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz><satz>${text}</satz></absatz></text></norm><norm id="d1"><bezeichnung>§ 2</bezeichnung><text><absatz><satz>Doppelt.</satz></absatz></text></norm><norm id="d2"><bezeichnung>§ 2</bezeichnung><text><absatz><satz>Noch einmal.</satz></absatz></text></norm>`,
    ],
    [
      'EGBGB',
      '<norm id="e6"><bezeichnung>§ 6</bezeichnung><text><absatz><satz>Ziel.</satz></absatz></text></norm>',
    ],
    [
      'GG',
      '<norm id="g1"><bezeichnung>Art. 1</bezeichnung><text><absatz><satz>Ziel.</satz></absatz></text></norm>',
    ],
  ];
  for (const [name, inhalt] of dateien) {
    const pfad = `/import/${name}.xml`;
    aufbau.native.texte.set(pfad, gesetzXML(String(name), String(inhalt)));
    const bericht = await importierePfade([pfad]);
    expect(bericht.fehler).toEqual([]);
    expect(bericht.konflikte).toEqual([]);
  }
  const gesetz = (await ladeAlleGesetze()).find((g) => g.kurztitel === 'TestG');
  if (!gesetz) throw Error('Fixture-Gesetz fehlt');
  return gesetz;
}
async function legeVierTypenAn(gesetz: GesetzDarstellung) {
  for (const [typ, start, ende] of [
    ['unterstreichung', 0, 13],
    ['hervorhebung', 14, 27],
  ] as const) {
    const eintrag = markierungsEintrag({
      typ,
      ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
      bezug: {
        typ: 'bezugstext',
        textstelle: {
          pfad: { typ: 'normtext' },
          zeichenbereichStart: start,
          zeichenbereichEnde: ende,
        },
        bezugstext: text.slice(start, ende),
      },
    });
    expect((await hinzufuegenMarkierung(gesetz, eintrag)).erfolgreich).toBe(true);
  }
  const abmelden = await registriereMarkierungsHistorienEmpfang(() => {});
  aufbau.native.label = 'hilfe';
  try {
    expect(
      await speichereKommentar(
        {
          openerLabel: 'main',
          gesetz,
          ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl: '001' },
        },
        markierungsEinzelzugriffFuerTest,
        'Kommentar zur Überschrift',
        false,
      ),
    ).toEqual({ art: 'erfolg' });
    expect(
      await speichereVerweismarkierung(
        {
          openerLabel: 'main',
          gesetz,
          ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
        },
        markierungsEinzelzugriffFuerTest,
        verweistext,
        false,
        false,
        new Map(),
      ),
    ).toEqual({ art: 'erfolg' });
  } finally {
    aufbau.native.label = 'main';
    abmelden();
  }
}
async function zeigeGespeicherteMarkierungen(
  gesetz: GesetzDarstellung,
  eintraege: MarkierungsEintrag[],
) {
  const ueberschrift = gesetz.elemente.find((e) => e.typ === 'ueberschrift');
  if (ueberschrift?.typ !== 'ueberschrift') throw Error('Fixture-Überschrift fehlt');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  const kommentarKlick = vi.fn();
  const navigation = vi.fn();
  const norm = eintraege.filter((e) => e.ausgangsstelle.typ === 'norm');
  const pauschale = eintraege.filter((e) => e.ausgangsstelle.typ === 'ueberschrift');
  await act(async () =>
    root.render(
      <MarkierungCtx.Provider
        value={{
          markierungenNachXmlId: new Map([[ueberschrift.data.xmlId, pauschale]]),
          onKommentarKlick: kommentarKlick,
          onVerweisKlick: navigation,
        }}
      >
        <UeberschriftZeile u={ueberschrift.data} schrift={16} />
        <TextBlatt
          text={text}
          pfad={{ typ: 'normtext' }}
          markierungen={norm}
          style={{}}
          ausgangsXmlId="n1"
        />
        <VerweisSuperscript markierungen={norm} ausgangsXmlId="n1" />
      </MarkierungCtx.Provider>,
    ),
  );
  return { host, kommentarKlick, navigation };
}
async function pruefeTitelkonflikt() {
  const vorher = aufbau.native.texte.get(gesetzpfad);
  if (!vorher) throw Error('Gesetzdatei fehlt');
  aufbau.native.texte.set(gesetzpfad, vorher.replace('Alter Titel', 'Neuer Titel'));
  await pruefeAlleMarkierungen();
  const anzeige = await ladeMarkierungskonflikteFuerAnzeige();
  const gruppe = anzeige.gesetze.find((g) => g.gesetz.kurztitel === 'TestG');
  expect(gruppe?.eintraege).toHaveLength(1);
  const konflikt = gruppe?.eintraege[0];
  if (!konflikt) throw Error('Überschriftkonflikt fehlt');
  expect(konflikt.eigenerKonflikt).toBe('pauschalerBezugUnpassend');
  expect(
    (await aktualisiereAusgangsVerknuepfungMitErgebnis(referenz, konflikt.schluessel)).status,
  ).toBe('geaendert');
  await pruefeAlleMarkierungen();
  expect((await ladeMarkierungskonflikteFuerAnzeige()).gesetze.flatMap((g) => g.eintraege)).toEqual(
    [],
  );
  const kommentar = (await ladeMarkierungen(referenz)).find((e) => e.typ === 'kommentar');
  expect(kommentar?.bezug).toMatchObject({
    typ: 'pauschal',
    elementstand: { titel: 'Neuer Titel' },
  });
}
async function pruefeMehrdeutigeStelle() {
  const vorher = new Map(aufbau.native.texte);
  const schreibaufrufe = aufbau.native.invoke.mock.calls.filter(
    ([b]) => b === 'atomar_datei_schreiben',
  ).length;
  expect(
    await speichereKommentar(
      {
        openerLabel: 'main',
        gesetz: referenz,
        ausgangsstelle: { typ: 'norm', bezeichnung: '§ 2' },
      },
      markierungsEinzelzugriffFuerTest,
      'Nicht anlegen',
      false,
    ),
  ).toMatchObject({ art: 'fehler', ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig' });
  expect(aufbau.native.texte).toEqual(vorher);
  expect(
    aufbau.native.invoke.mock.calls.filter(([b]) => b === 'atomar_datei_schreiben'),
  ).toHaveLength(schreibaufrufe);
}
async function pruefeTeilladen() {
  const gueltig = aufbau.native.texte.get(markierungspfad);
  if (!gueltig) throw Error('Gespeicherte Markierungen fehlen');
  const teildefekt = gueltig.replace(
    '</inhalt>',
    '<kommentar><bezeichnung>§ 1</bezeichnung><kommentartext>Ohne Elementstand</kommentartext></kommentar></inhalt>',
  );
  aufbau.native.texte.set(markierungspfad, teildefekt);
  alleBannerSchliessen();
  expect(await ladeMarkierungen(referenz)).toHaveLength(4);
  const sicherungen = [...aufbau.native.texte.entries()].filter(([pfad]) => pfad.endsWith('.bak'));
  expect(sicherungen).toHaveLength(1);
  expect(sicherungen[0]?.[1]).toBe(teildefekt);
  expect(getSnapshot()).toHaveLength(1);
  // Gruppe „bereinigt“; die Anzahl entfernter Einträge bleibt als Detail sichtbar.
  const [bereinigt] = getSnapshot()[0]?.gliederung?.kategorien.flatMap((k) => k.gruppen) ?? [];
  expect(bereinigt?.schluessel).toBe('bereinigt');
  expect(bereinigt?.namen[0]?.detail).toMatch(/^1 /);
  expect(getSnapshot()[0]?.text).toContain(bereinigt?.namen[0]?.detail ?? '–');
  expect(await ladeMarkierungen(referenz)).toHaveLength(4);
  expect(getSnapshot()).toHaveLength(1);
  expect(aufbau.native.texte.get(markierungspfad)).not.toContain('Ohne Elementstand');
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  aufbau.bereiteNativeAttrappeVor();
  alleBannerSchliessen();
});
afterEach(async () => {
  await aufbau.raeumeTestFensterAuf(wurzeln);
  alleBannerSchliessen();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('erhält alle vier Typen über Speichern, Neuladen, Anzeige, Titelkonflikt und Auflösung und schützt mehrdeutige sowie teildefekte Eingaben', async () => {
  const gesetz = await importiereFixture();
  await legeVierTypenAn(gesetz);
  const geladen = await ladeMarkierungen(referenz);
  expect(geladen).toHaveLength(4);
  expect(new Set(geladen.map((e) => e.typ))).toEqual(
    new Set(['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung']),
  );
  const anzeige = await zeigeGespeicherteMarkierungen(gesetz, geladen);
  expect(anzeige.host.textContent).toContain('Alter Titel');
  expect(anzeige.host.textContent?.replaceAll('\u00a0', ' ')).toContain(text);
  expect(anzeige.host.textContent?.replaceAll('\u00a0', ' ')).toContain(verweistext);
  expect(anzeige.host.querySelector('[style*="text-decoration: underline"]')?.textContent).toBe(
    'Unterstrichen',
  );
  expect(anzeige.host.querySelector('[style*="background:"]')?.textContent).toBe('Hervorgehoben');
  const links = [
    ...anzeige.host.querySelectorAll<HTMLElement>('[style*="cursor: pointer"]'),
  ].filter((el) =>
    ['§ 6', ' EGBGB, ', 'GG'].includes(el.textContent?.replaceAll('\u00a0', ' ') ?? ''),
  );
  expect(links.map((el) => el.textContent?.replaceAll('\u00a0', ' '))).toEqual([
    '§ 6',
    ' EGBGB, ',
    'GG',
  ]);
  await act(async () => links.forEach((el) => el.click()));
  expect(anzeige.navigation.mock.calls.map((a) => a[1].typ)).toEqual([
    'zielnorm',
    'zielnorm',
    'ganzesGesetz',
  ]);
  const symbol = [...anzeige.host.querySelectorAll<HTMLElement>('[data-zitatanhang]')].find(
    (el) => el.textContent === 'ⓘ',
  );
  expect(symbol).toBeDefined();
  await act(async () => symbol?.click());
  expect(anzeige.kommentarKlick).toHaveBeenCalledExactlyOnceWith(
    'ueberschrift:001',
    geladen.find((e) => e.typ === 'kommentar'),
  );
  await pruefeAlleMarkierungen();
  expect((await ladeMarkierungskonflikteFuerAnzeige()).gesetze).toEqual([]);
  await pruefeTitelkonflikt();
  await pruefeMehrdeutigeStelle();
  await pruefeTeilladen();
});
