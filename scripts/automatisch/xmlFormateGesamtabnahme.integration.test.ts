// @vitest-environment jsdom
// Gemeinsamer Dateivertrag: echte Fachmodule vom Anlegen bis zum ZIP-Rundlauf.
import { readFileSync, readdirSync } from 'node:fs';
import { URL as DateiURL } from 'node:url';
import { io, vorbereiten } from '@/test/import/gemischterZipNativeAttrappe';
import { act, createElement, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { unzipSync, strFromU8 } from 'fflate';
import { pruefeSchema } from './schema-hilfe';
import { exportiere, loeseImportKonflikt } from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import {
  ladeGesetzesXML,
  speichereGesetz,
  ladeNichtamtlicheTitel,
  leseNichtamtlicheTitelRohtext,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { leseImportindizesFuerExport } from '@/lib/import/import.index';
import { umschaltenFavorit, ladeFavoriten } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import {
  umschaltenLesezeichen,
  ladeLesezeichen,
} from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import {
  speichereGesetzeskurzbefehl,
  ladeAlleGesetzeskurzbefehle,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import {
  hinzufuegenMarkierung,
  ladeMarkierungen,
  speichereVerweismarkierung,
  speichereKommentar,
  pruefeAlleMarkierungen,
  initialisiereMarkierungen,
  ladeMarkierungskonflikteFuerAnzeige,
  aktualisiereVerknuepfungMitErgebnis,
  registriereMarkierungsHistorienEmpfang,
} from '@/lib/markierungen/markierungen.index';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

// Nur die externe Virtualisierung wird ersetzt: beide Elemente bleiben im DOM prüfbar.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey(i: number): string }) =>
    useMemo(
      () => ({
        getVirtualItems: () =>
          Array.from({ length: count }, (_, index) => ({
            index,
            key: getItemKey(index),
            start: index * 100,
            size: 100,
          })),
        getTotalSize: () => count * 100,
        getOffsetForIndex: (i: number) => [i * 100],
        measureElement() {},
        indexFromElement: (element: HTMLElement) => Number(element.dataset.index),
        resizeItem() {},
        scrollToOffset() {},
        scrollToIndex() {},
      }),
      [count, getItemKey],
    ),
}));

const gesetz = { kurztitel: 'TestG', normgeber: 'de-bund' };
const pfade = [
  'gesetze/TestG_de-bund.xml',
  'favoriten/TestG_de-bund-favoriten.xml',
  'lesezeichen/lesezeichen.xml',
  'einstellungen/gesetzeskurzbefehle.xml',
  'markierungen/TestG_de-bund-markierungen.xml',
  'nichtamtliche-titel/TestG_de-bund-nichtamtliche-titel.xml',
  'importindizes/de-bund.xml',
  'markierungskonflikte.xml',
];
const quelle = `<gesetz version="1"><infos><kurztitel>TestG</kurztitel><normgeber>de-bund</normgeber><datenquelle name="Testquelle"/></infos><inhalt>
<norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Erste Norm</titel><text><absatz zahl="(1)">Alpha Beta Gamma Delta.</absatz></text></norm>
<norm id="anhang1"><bezeichnung>Anhang 1</bezeichnung><titel>Anhang</titel><text><absatz>Anhangtext.</absatz></text></norm>
<norm id="a229" gliederungskennzahl="001"><bezeichnung>Art. 229</bezeichnung><titel>Übergangsrecht</titel><text>Einleitung.</text></norm>
<norm id="p3"><bezeichnung>§ 3</bezeichnung><text>Untertext.</text></norm>
</inhalt></gesetz>`;
const eigeneTitel = `<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">TestG</gesetz><geaendert>2026-11-05T10:00:00Z</geaendert></infos><inhalt><norm><bezeichnung>Art. 229 § 3</bezeichnung><titel>Mein Übergangstitel</titel></norm></inhalt></nichtamtlicheTitel>`;
const importindex = `<importindex version="1"><infos><verarbeitungszeit herkunft="nutzer">2026-11-05T10:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel><abrufkennung>testg</abrufkennung></gesetz></inhalt></importindex>`;
function zeit(stunde: number) {
  vi.setSystemTime(new Date(`2026-11-05T${stunde}:00:00Z`));
}
function textmarkierung(typ: 'unterstreichung' | 'hervorhebung', start: number, ende: number) {
  return markierungsEintrag({
    typ,
    ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
    textstelle: {
      pfad: { typ: 'normtext', absatz: '(1)' },
      zeichenbereichStart: start,
      zeichenbereichEnde: ende,
    },
    bezugstext: 'Alpha Beta Gamma Delta.'.slice(start, ende),
  });
}
async function importiere(pfad: string, xml: string) {
  io.dateien.set(pfad, xml);
  const ergebnis = await importierePfade([pfad]);
  expect(ergebnis.fehler).toEqual([]);
  for (const konflikt of ergebnis.konflikte) await loeseImportKonflikt(konflikt, 'zusammenfuehren');
  io.dateien.delete(pfad);
}
async function pruefeDateien() {
  for (const [pfad, xml] of io.dateien) {
    if (pfad.startsWith('/import')) continue;
    expect(pfade, pfad).toContain(pfad);
    await pruefeDateiSchema(pfad, xml);
  }
}
async function pruefeDateiSchema(pfad: string, xml: string) {
  const wurzel = new DOMParser().parseFromString(xml, 'application/xml').documentElement.tagName;
  const schema = wurzel === 'nichtamtlicheTitel' ? 'nichtamtliche-titel' : wurzel;
  expect((await pruefeSchema(schema, xml)).valid, pfad).toBe(true);
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('erhält alle Nutzerformate samt vollen Bezeichnungen und Zeitstempeln beim Export und Import', async () => {
  vorbereiten();
  initialisiereMarkierungen();
  vi.useFakeTimers({ toFake: ['Date'] });
  const abmelden = await registriereMarkierungsHistorienEmpfang(() => {});
  zeit(10);
  await importiere('/import/gesetz.xml', quelle);
  await importiere('/import/eigene-titel.xml', eigeneTitel);
  await importiere('/import/importindex.xml', importindex);
  expect(await ladeNichtamtlicheTitel(gesetz)).toEqual(
    new Map([['Art. 229 § 3', 'Mein Übergangstitel']]),
  );
  expect(await leseImportindizesFuerExport()).toEqual([
    { name: 'de-bund.xml', inhalt: importindex },
  ]);
  await umschaltenFavorit(gesetz, '§ 1');
  await importiere(
    '/import/favoriten.xml',
    '<favoriten version="1"><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><eintrag><bezeichnung>Anhang 1</bezeichnung></eintrag></inhalt></favoriten>',
  );
  await umschaltenLesezeichen(gesetz, 'Art. 229 § 3');
  expect(
    await speichereGesetzeskurzbefehl(gesetz, {
      taste: 't',
      meta: true,
      ctrl: false,
      shift: true,
      alt: false,
    }),
  ).toBe('ok');
  await pruefeDateien();

  expect(
    (await hinzufuegenMarkierung(gesetz, textmarkierung('unterstreichung', 0, 5))).erfolgreich,
  ).toBe(true);
  zeit(11);
  expect(
    (await hinzufuegenMarkierung(gesetz, textmarkierung('unterstreichung', 5, 10))).erfolgreich,
  ).toBe(true);
  const verschmolzen = await ladeMarkierungen(gesetz);
  expect(verschmolzen).toHaveLength(1);
  expect(verschmolzen[0]).toMatchObject({
    erstellt: '2026-11-05T11:00:00Z',
    bezug: {
      textstelle: { zeichenbereichStart: 0, zeichenbereichEnde: 10 },
      bezugstext: 'Alpha Beta',
    },
  });
  await pruefeDateien();
  zeit(12);
  expect(
    (await hinzufuegenMarkierung(gesetz, textmarkierung('hervorhebung', 4, 6))).erfolgreich,
  ).toBe(true);
  const geteilt = await ladeMarkierungen(gesetz);
  expect(
    geteilt.map((e) => [e.typ, e.bezug.typ === 'bezugstext' && e.bezug.bezugstext, e.erstellt]),
  ).toEqual([
    ['unterstreichung', 'Alph', '2026-11-05T12:00:00Z'],
    ['hervorhebung', 'a ', '2026-11-05T12:00:00Z'],
    ['unterstreichung', 'Beta', '2026-11-05T12:00:00Z'],
  ]);
  const kontext = {
    openerLabel: 'main',
    gesetz,
    ausgangsstelle: { typ: 'norm' as const, bezeichnung: 'Anhang 1' },
  };
  await speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Erste Notiz', false);
  const kommentar = (await ladeMarkierungen(gesetz)).find((e) => e.typ === 'kommentar')!;
  expect(kommentar.bezug.typ).toBe('pauschal');
  zeit(13);
  await speichereKommentar(
    {
      ...kontext,
      bearbeiten: {
        kommentarText: 'Erste Notiz',
        vorher: {
          kommentarText: 'Erste Notiz',
          elementstand:
            kommentar.bezug.typ === 'pauschal' ? kommentar.bezug.elementstand : undefined,
        },
      },
    },
    markierungsEinzelzugriffFuerTest,
    'Geänderte Notiz',
    false,
  );
  await speichereVerweismarkierung(
    { openerLabel: 'main', gesetz, ausgangsstelle: { typ: 'norm', bezeichnung: 'Art. 229 § 3' } },
    markierungsEinzelzugriffFuerTest,
    '§ 1 TestG',
    false,
    false,
    new Map(),
  );
  expect((await ladeMarkierungen(gesetz)).find((e) => e.typ === 'kommentar')).toMatchObject({
    kommentarText: 'Geänderte Notiz',
    erstellt: '2026-11-05T12:00:00Z',
    geaendert: '2026-11-05T13:00:00Z',
  });
  expect((await ladeMarkierungen(gesetz)).find((e) => e.typ === 'verweismarkierung')).toMatchObject(
    {
      ausgangsstelle: { bezeichnung: 'Art. 229 § 3' },
      verweisinhalt: { verweisziele: [{ bezeichnung: '§ 1' }] },
    },
  );
  await pruefeDateien();

  zeit(14);
  await speichereGesetz(
    gesetz,
    quelle.replace('Alpha Beta Gamma Delta.', 'Alpha Beta Gamma Delta. Ergänzung.'),
  );
  await pruefeAlleMarkierungen();
  const konflikte = await ladeMarkierungskonflikteFuerAnzeige();
  const verweis = konflikte.gesetze
    .flatMap((g) => g.eintraege)
    .find((e) => e.markierungstyp === 'verweismarkierung')!;
  expect(verweis.zielKonflikte).toHaveLength(1);
  const verweisKonfliktXML = io.dateien.get('markierungskonflikte.xml')!;
  expect(verweisKonfliktXML).toContain('<verweismarkierung>');
  expect(verweisKonfliktXML).toContain('typ="ziel-norm-unpassend"');
  expect(verweisKonfliktXML).not.toContain('<markierung typ=');
  await pruefeDateien();
  const verknuepft = await aktualisiereVerknuepfungMitErgebnis(
    gesetz,
    verweis.schluessel,
    gesetz,
    'verknuepfen',
    { zeilenart: 'zielNormUnpassend', verweisziele: [{ bezeichnung: '§ 1' }] },
  );
  expect(verknuepft.status).toBe('geaendert');
  expect(verknuepft).not.toHaveProperty('nachgelagerterFehler');
  expect((await ladeMarkierungen(gesetz)).find((e) => e.typ === 'verweismarkierung')).toMatchObject(
    { erstellt: '2026-11-05T13:00:00Z', geaendert: '2026-11-05T14:00:00Z' },
  );
  await speichereGesetz(
    gesetz,
    quelle
      .replace('Alpha Beta Gamma Delta.', 'Alpha Beta Gamma Delta. Ergänzung.')
      .replace('Anhangtext.', 'Neuer Anhangtext.'),
  );
  await pruefeAlleMarkierungen();
  const stand = await ladeMarkierungskonflikteFuerAnzeige();
  expect(stand.gesetze.flatMap((g) => g.eintraege)).toEqual([
    expect.objectContaining({
      markierungstyp: 'kommentar',
      eigenerKonflikt: 'pauschalerBezugUnpassend',
      ausgangsstelle: { typ: 'norm', bezeichnung: 'Anhang 1' },
    }),
  ]);
  const kommentarKonfliktXML = io.dateien.get('markierungskonflikte.xml')!;
  expect(kommentarKonfliktXML).toContain('<kommentar>');
  expect(kommentarKonfliktXML).toContain('typ="pauschaler-bezug-unpassend"');
  await pruefeDateien();
  expect([...io.dateien.keys()].sort()).toEqual([...pfade].sort());
  const vorher = {
    gesetze: await ladeGesetzesXML(gesetz),
    favoriten: await ladeFavoriten(gesetz),
    lesezeichen: await ladeLesezeichen(),
    kurzbefehle: await ladeAlleGesetzeskurzbefehle(),
    markierungen: await ladeMarkierungen(gesetz),
    nichtamtlicheTitel: await ladeNichtamtlicheTitel(gesetz),
    titelXML: await leseNichtamtlicheTitelRohtext(gesetz),
    importindizes: await leseImportindizesFuerExport(),
    konflikte: stand,
  };
  expect(vorher.favoriten).toEqual(['§ 1', 'Anhang 1']);
  expect(await exportiere(new Set(['vollstaendigeSammlung']), {})).toBe('exportiert');
  const [zipPfad, bytes] = [...io.archive][0]!;
  const zip = unzipSync(bytes);
  expect(Object.keys(zip).sort()).toEqual(
    [
      'Gesetze/TestG_de-bund.xml',
      'Favoriten/TestG_de-bund-favoriten.xml',
      'Markierungen/TestG_de-bund-markierungen.xml',
      'Nichtamtliche Titel/TestG_de-bund-nichtamtliche-titel.xml',
      'Importindizes/de-bund.xml',
      'lesezeichen.xml',
      'Einstellungen/gesetzeskurzbefehle.xml',
      'Einstellungen/Einstellungen.xml',
    ].sort(),
  );
  expect(strFromU8(zip['Nichtamtliche Titel/TestG_de-bund-nichtamtliche-titel.xml']!)).toBe(
    eigeneTitel,
  );
  expect(strFromU8(zip['Importindizes/de-bund.xml']!)).toBe(importindex);
  for (const [pfad, inhalt] of Object.entries(zip)) {
    await pruefeDateiSchema(pfad, strFromU8(inhalt));
  }
  io.dateien.clear();
  localStorage.clear();
  initialisiereMarkierungen();
  const bericht = await importierePfade([zipPfad]);
  expect(bericht.fehler).toEqual([]);
  expect(bericht.konflikte).toEqual([]);
  await pruefeAlleMarkierungen();
  expect({
    gesetze: await ladeGesetzesXML(gesetz),
    favoriten: await ladeFavoriten(gesetz),
    lesezeichen: await ladeLesezeichen(),
    kurzbefehle: await ladeAlleGesetzeskurzbefehle(),
    markierungen: await ladeMarkierungen(gesetz),
    nichtamtlicheTitel: await ladeNichtamtlicheTitel(gesetz),
    titelXML: await leseNichtamtlicheTitelRohtext(gesetz),
    importindizes: await leseImportindizesFuerExport(),
    konflikte: await ladeMarkierungskonflikteFuerAnzeige(),
  }).toEqual(vorher);
  await pruefeDateien();
  abmelden();
}, 20000);

it('erhält gespeicherte Überschrift- und Normmarkierungen nach einem Satzwechsel gemeinsam in der Anzeige', async () => {
  vorbereiten();
  initialisiereMarkierungen();
  const xml = `<gesetz version="1"><infos><kurztitel>TestG</kurztitel><normgeber>de-bund</normgeber><datenquelle name="Testquelle"/></infos><inhalt>
<gliederung gliederungskennzahl="100"><bezeichnung>Teil 1</bezeichnung><titel>Allgemeines</titel><text><absatz>Text unter der Überschrift.</absatz></text></gliederung>
<norm id="100"><bezeichnung>§ 100</bezeichnung><titel>Normtitel</titel><text><absatz zahl="(1)">Erster Satz.</absatz></text></norm>
</inhalt></gesetz>`;
  await importiere('/import/gesetz.xml', xml);
  const eintraege = [
    markierungsEintrag({
      typ: 'hervorhebung',
      ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl: '100' },
      textstelle: {
        pfad: { typ: 'bereich', bereich: 'amtlicherTitel' },
        zeichenbereichStart: 0,
        zeichenbereichEnde: 11,
      },
      bezugstext: 'Allgemeines',
    }),
    markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: { typ: 'norm', bezeichnung: '§ 100' },
      textstelle: {
        pfad: { typ: 'normtext', absatz: '(1)' },
        zeichenbereichStart: 0,
        zeichenbereichEnde: 12,
      },
      bezugstext: 'Erster Satz.',
    }),
  ];
  for (const eintrag of eintraege) {
    expect((await hinzufuegenMarkierung(gesetz, eintrag)).erfolgreich).toBe(true);
  }
  const gespeichert = await ladeMarkierungen(gesetz);
  expect(gespeichert).toHaveLength(2);
  const markierungsXML = io.dateien.get('markierungen/TestG_de-bund-markierungen.xml')!;
  expect(markierungsXML).toContain('<bereich>amtlicher-titel</bereich>');
  expect(markierungsXML).toContain('<hervorhebung>');
  expect(markierungsXML).toContain('<unterstreichung>');
  await pruefeDateiSchema('Markierungen', markierungsXML);
  await speichereGesetz(
    gesetz,
    xml.replace(
      'Erster Satz.',
      '<satz zahl="1">Erster Satz.</satz><satz zahl="2">Zweiter Satz.</satz>',
    ),
  );
  initialisiereMarkierungen();
  expect(await ladeMarkierungen(gesetz)).toEqual(gespeichert);
  await pruefeAlleMarkierungen();
  expect((await ladeMarkierungskonflikteFuerAnzeige()).gesetze).toEqual([]);
  const konfliktXML = io.dateien.get('markierungskonflikte.xml')!;
  await pruefeDateiSchema('Konflikte', konfliktXML);
  const neu = parseGesetzesXML((await ladeGesetzesXML(gesetz))!);
  expect(neu).not.toBeNull();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(Gesetzestextansicht, { gesetz: neu! })));
    await vi.waitFor(() => {
      const unterstrichen = [...host.querySelectorAll<HTMLElement>('span')].filter(
        (el) => el.style.textDecoration === 'underline',
      );
      expect(unterstrichen.map((el) => el.textContent).join('')).toBe('Erster Satz.');
      const hervorgehoben = [
        ...host.querySelectorAll<HTMLElement>('[data-xml-id="ueberschrift:100"] span'),
      ].filter((el) => el.style.background !== '');
      expect(hervorgehoben.map((el) => el.textContent).join('')).toBe('Allgemeines');
    });
    expect(host.textContent).toContain('Zweiter Satz.');
    expect(host.querySelector('[data-nicht-markierbar]')?.textContent).toContain(
      'Text unter der Überschrift.',
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('speichert Kommentar mit Steuerzeichen lesbar, verträgt zerlegte Umlaute und weist beschädigtes Ersetzen ab', async () => {
  vorbereiten();
  initialisiereMarkierungen();
  const normtext = 'Die Prüfung über Größe.';
  const umlautGesetz = quelle.replace('Alpha Beta Gamma Delta.', normtext).normalize('NFC');
  await importiere('/import/gesetz.xml', umlautGesetz);
  const unterstreichung = markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
    textstelle: {
      pfad: { typ: 'normtext', absatz: '(1)' },
      zeichenbereichStart: 4,
      zeichenbereichEnde: 11,
    },
    bezugstext: 'Prüfung',
  });
  expect((await hinzufuegenMarkierung(gesetz, unterstreichung)).erfolgreich).toBe(true);
  await speichereKommentar(
    { openerLabel: 'main', gesetz, ausgangsstelle: { typ: 'norm', bezeichnung: 'Anhang 1' } },
    markierungsEinzelzugriffFuerTest,
    'Zeile eins\u000BZeile zwei',
    false,
  );
  const pfad = 'markierungen/TestG_de-bund-markierungen.xml';
  const gespeichertXML = io.dateien.get(pfad)!;
  expect(gespeichertXML).toContain('<kommentartext>');
  expect(gespeichertXML).not.toContain('\u000B');
  const dokument = new DOMParser().parseFromString(gespeichertXML, 'application/xml');
  expect(dokument.querySelector('parsererror')).toBeNull();
  await pruefeDateiSchema(pfad, gespeichertXML);
  initialisiereMarkierungen();
  const geladen = await ladeMarkierungen(gesetz);
  expect(geladen.map((e) => e.typ).sort()).toEqual(['kommentar', 'unterstreichung']);
  expect(geladen.find((e) => e.typ === 'kommentar')).toMatchObject({
    kommentarText: 'Zeile eins\nZeile zwei',
  });
  expect(geladen.find((e) => e.typ === 'unterstreichung')).toMatchObject({
    bezug: { bezugstext: 'Prüfung' },
  });

  const zerlegt = umlautGesetz.normalize('NFD');
  expect(zerlegt).not.toBe(umlautGesetz);
  io.dateien.set('/import/zerlegt.xml', zerlegt);
  const gesetzBericht = await importierePfade(['/import/zerlegt.xml']);
  expect(gesetzBericht.fehler).toEqual([]);
  for (const konflikt of gesetzBericht.konflikte) await loeseImportKonflikt(konflikt, 'ersetzen');
  expect(await ladeGesetzesXML(gesetz)).toBe(zerlegt);
  await pruefeAlleMarkierungen();
  expect((await ladeMarkierungskonflikteFuerAnzeige()).gesetze).toEqual([]);
  expect(await ladeMarkierungen(gesetz)).toEqual(geladen);

  const beschaedigt = gespeichertXML.replace('</markierungen>', '');
  io.dateien.set('/import/TestG_de-bund-markierungen.xml', beschaedigt);
  const markierungsBericht = await importierePfade(['/import/TestG_de-bund-markierungen.xml']);
  // Der Leser weist die Datei vor der Ersetzen-Entscheidung zurück.
  expect(markierungsBericht.konflikte).toEqual([]);
  expect(markierungsBericht.fehler).toEqual([
    expect.objectContaining({
      grund: 'unerwartet',
      datei: 'TestG_de-bund-markierungen.xml',
      detail: expect.stringContaining('Datei ungültig'),
    }),
  ]);
  expect(io.dateien.get(pfad)).toBe(gespeichertXML);
  initialisiereMarkierungen();
  expect(await ladeMarkierungen(gesetz)).toEqual(geladen);
});

it('validiert alle vollständigen XML-Beispiele der Dokumentation gegen ihr Formatschema', async () => {
  const schemas = new Map([
    ['gesetz', 'gesetz'],
    ['markierungen', 'markierungen'],
    ['markierungskonflikte', 'markierungskonflikte'],
    ['favoriten', 'favoriten'],
    ['lesezeichen', 'lesezeichen'],
    ['gesetzeskurzbefehle', 'gesetzeskurzbefehle'],
    ['einstellungen', 'einstellungen'],
    ['importindex', 'importindex'],
    ['nichtamtlicheTitel', 'nichtamtliche-titel'],
    ['praefixstrukturen', 'praefixstrukturen'],
    ['datenbankindex', 'datenbankindex'],
    ['grundbestand', 'grundbestand'],
  ]);
  const dokuOrdner = new DateiURL('../../docs/doku/', import.meta.url);
  const gepruefteFormate = new Set<string>();
  for (const datei of readdirSync(dokuOrdner, { recursive: true })) {
    if (!datei.endsWith('.md')) continue;
    const markdown = readFileSync(new DateiURL(datei, dokuOrdner), 'utf8');
    for (const [block, inhalt] of markdown.matchAll(/```xml\r?\n([\s\S]*?)```/g)) {
      const xml = inhalt.trim();
      // Vollständige Dateien tragen eine XML-Deklaration oder eine Version
      // am Wurzelelement; Fragmente wie ein einzelner Importindex-Eintrag nicht.
      if (!/^<\?xml\s/.test(xml) && !/^<[^>]+\sversion\s*=/.test(xml)) continue;
      const dokument = new DOMParser().parseFromString(xml, 'application/xml');
      const wurzel = dokument.documentElement.tagName;
      const kontext = `${datei}: ${block}`;
      expect(dokument.querySelector('parsererror'), kontext).toBeNull();
      const schema = schemas.get(wurzel);
      expect(schema, kontext).toBeDefined();
      const ergebnis = await pruefeSchema(schema!, xml);
      expect(ergebnis.valid, `${kontext}\n${JSON.stringify(ergebnis.errors)}`).toBe(true);
      gepruefteFormate.add(wurzel);
    }
  }
  expect([...gepruefteFormate].sort()).toEqual([...schemas.keys()].sort());
});
