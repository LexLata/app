// referenzNachbereitung.integration.test.ts
// Echte Referenzverzeichnisse, Tagger und Persistenzlesen; nur Tauri-I/O simuliert.
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import { assert, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  speichern: vi.fn(),
  ereignis: vi.fn(),
  lesen: vi.fn(),
  fetch: vi.fn(),
  ordner: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
vi.mock('@tauri-apps/api/path', () => ({
  resolveResource: async (pfad: string) => pfad,
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (pfad: string) => io.lesen(pfad),
  readDir: () => io.ordner(),
  mkdir: async () => {},
  exists: async () => false,
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
    if (befehl === 'gesetz_dateistempel_lesen')
      return [...io.dateien]
        .filter(([p]) => p.startsWith('/daten/LexLata/gesetze/') && p.endsWith('.xml'))
        .map(([p, t]) => ({
          name: p.slice('/daten/LexLata/gesetze/'.length),
          dateistempel: { groesse: String(t.length), aenderungszeit: '1' },
        }));
    if (befehl !== 'atomar_datei_schreiben') throw new Error(`Unerwarteter Befehl ${befehl}`);
    io.dateien.set(`/daten/LexLata/${args.relativerPfad}`, args.inhalt);
  },
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: (...args: unknown[]) => io.ereignis(...args) }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  speichereGesetz: (...args: unknown[]) => io.speichern(...args),
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
}));
import { taggeGesetzesXML, taggeUndSpeichereGesetzesXML } from './gesetzImportAbschluss';
import { nachbereiteGesetzesXML } from './gesetzesXMLNachbereiten';
import { mitReferenzKontext } from './referenzKontext';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { verweisZuXmlId } from '@/lib/domain/norm/norm.index';
import { getSnapshot, alleBannerSchliessen } from '@/lib/banner/banner.index';
import { importiereBundXML } from '@/lib/import/bund/bund.index';
import { importiereGesetzHTMLBW } from '@/lib/import/bw/bw.index';
import { importiereVomInternetEU } from '@/lib/import/eu/eu.index';
import { zipSync, strToU8 } from 'fflate';
import { vergleicheGesetzesXMLMitBestand } from './gesetzImportAbschluss';
import { leseGesetzInfos } from '@/lib/persistenz/gesetz/gesetz.index';
function gesetz(normgeber = 'de-bund') {
  return `<gesetz version="1"><infos><langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel><normgeber>${normgeber}</normgeber></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><text><absatz>Siehe § 5 BGB. Weiterer Satz.</absatz></text></norm></inhalt></gesetz>`;
}
function index(version = '1') {
  return `<importindex version="${version}"><infos><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung>L</abrufkennung></gesetz></inhalt></importindex>`;
}
beforeEach(() => {
  vi.clearAllMocks();
  alleBannerSchliessen();
  io.dateien.clear();
  io.dateien.set(
    '/daten/LexLata/cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  io.dateien.set('resources/europa/europaKuratiert.json', '[]');
  io.ordner.mockResolvedValue([]);
  io.speichern.mockImplementation(async (gesetz) => referenzVon(gesetz));
  io.ereignis.mockResolvedValue(undefined);
  io.lesen.mockImplementation(async (pfad: string) => {
    if (!io.dateien.has(pfad)) throw new Error('Nicht lesbar');
    return io.dateien.get(pfad)!;
  });
});
it('repariert über echtes Persistenzlesen und erhält den unabhängigen Schemaversionhinweis', async () => {
  io.dateien.set('/daten/LexLata/importindizes/de-bund.xml', index('9'));
  io.dateien.set('resources/importindizes/de-bund.xml', index());
  const result = await taggeGesetzesXML(gesetz(), 'TestG', 'de-bund');
  expect(result).toContain('<verweis gesetz="BGB" normgeber="de-bund" norm="§ 5">');
  expect(io.ereignis).toHaveBeenCalledWith('main', 'schemaversion-abweichend');
  expect(getSnapshot()).toEqual([]);
  expect(io.dateien.get('/daten/LexLata/importindizes/de-bund.xml')).toContain('version="1"');
});
it('taggt bei endgültig leerer Referenzliste ausdrücklich mit akzeptierter falscher Eigenzuordnung und speichert', async () => {
  const ergebnis = await taggeUndSpeichereGesetzesXML(gesetz(), 'TestG');
  expect(ergebnis.art).toBe('erfolg');
  expect(io.speichern).toHaveBeenCalledTimes(1);
  const xml = io.speichern.mock.calls[0]![1];
  expect(xml).toContain('<verweis norm="§ 5">');
  expect(xml).not.toContain('gesetz="BGB"');
  expect(getSnapshot()).toHaveLength(1);
});
it('tokenisiert und taggt auch bei Referenzfehlern; gemeinsamer Kontext meldet einmal', async () => {
  await mitReferenzKontext(async (kontext) => {
    const xml = await nachbereiteGesetzesXML(gesetz(), kontext);
    expect(xml).toContain('<satz zahl="1">');
    expect(xml).toContain('<verweis norm="§ 5">');
    await taggeUndSpeichereGesetzesXML(
      gesetz(),
      'TestG',
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      kontext,
    );
    expect(getSnapshot()).toHaveLength(0);
  });
  expect(getSnapshot()).toHaveLength(1);
});
it.each(['', 'A_B'])(
  'hält den ungültigen Normgeber %s als Formatfehler vor Quellenlesen fest',
  async (normgeber) => {
    const ergebnis = await taggeUndSpeichereGesetzesXML(gesetz(normgeber), 'TestG');
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'format' } });
    expect(io.lesen).not.toHaveBeenCalled();
    expect(io.speichern).not.toHaveBeenCalled();
    expect(getSnapshot()).toHaveLength(0);
  },
);
it('taggt mit Europarestliste trotz endgültigem Bundesindexfehler und EU-Dateiteilfehler', async () => {
  io.ordner.mockResolvedValue([
    { name: 'bgb.xml', isFile: true },
    { name: 'defekt.xml', isFile: true },
  ]);
  io.dateien.set(
    'resources/europa/bgb.xml',
    '<gesetz><infos><normgeber>eu</normgeber><kurztitel>BGB</kurztitel><titel>Bürgerliches Gesetzbuch</titel></infos></gesetz>',
  );
  const ergebnis = await taggeUndSpeichereGesetzesXML(gesetz(), 'TestG');
  expect(ergebnis.art).toBe('erfolg');
  expect(io.speichern.mock.calls[0]![1]).toContain(
    '<verweis gesetz="BGB" normgeber="eu" norm="§ 5">',
  );
  expect(getSnapshot()).toHaveLength(1);
  expect(getSnapshot()[0]!.text).toContain('bund:');
  expect(getSnapshot()[0]!.text).toContain('eu:');
});
it('standalone Nachbereitung mit Normgeber unbekannt taggt Sätze und interne Verweise ohne Quellenlesen', async () => {
  const xml = gesetz()
    .replace('<normgeber>de-bund</normgeber>', '<normgeber>unbekannt</normgeber>')
    .replace('<titel>Testgesetz</titel>', '')
    .replace('§ 5 BGB', '§ 1 und beachte die Regel');
  const result = await nachbereiteGesetzesXML(xml);
  expect(result).toContain('<satz zahl="1">');
  expect(result).toContain('<verweis norm="§ 1">');
  expect(result).toContain('<normgeber>unbekannt</normgeber>');
  expect(io.lesen).not.toHaveBeenCalled();
  expect(getSnapshot()).toHaveLength(0);
});
it('verweigert einen zum XML unpassenden Normgeber vor Quellenlesen', async () => {
  await expect(taggeGesetzesXML(gesetz('de-bw'), 'TestG', 'unbekannt')).rejects.toThrow(
    'Normgeber',
  );
  expect(io.lesen).not.toHaveBeenCalled();
});

it.each(['de-bund', 'de-sn'])(
  'vergleicht den Normgeber %s ohne Beachtung der Schreibweise',
  async (normgeber) => {
    await expect(
      taggeGesetzesXML(gesetz(normgeber), 'TestG', normgeber.toLowerCase()),
    ).resolves.toContain('<kurztitel>TestG</kurztitel>');
  },
);

function canonGesetz(mitProfil = true) {
  return `<gesetz version="1"><infos><normgeber>unbekannt</normgeber><langtitel>Codex Iuris Canonici</langtitel><kurztitel>CIC</kurztitel>${mitProfil ? '<normpraefix>Can.</normpraefix>' : ''}</infos><inhalt><norm id="canon-9"><bezeichnung>Can. 9</bezeichnung><text><absatz>Siehe can. 9 § 2 und § 3 BGB.</absatz></text></norm></inhalt></gesetz>`;
}
it('importiert Canon-Eigenverweise mit echtem Profil und ohne zusätzliche Referenzquellen', async () => {
  const ergebnis = await taggeUndSpeichereGesetzesXML(canonGesetz(), 'CIC');
  expect(ergebnis.art).toBe('erfolg');
  expect(io.speichern.mock.calls[0]![1]).toContain('<verweis norm="Can. 9">can. 9 § 2</verweis>');
  expect(io.speichern.mock.calls[0]![1]).not.toContain('norm="§ 3"');
  expect(io.lesen).not.toHaveBeenCalled();
});
it('nachvertaggt frühere falsche Paragraphenverweise im Canon-Profil idempotent', async () => {
  const original = canonGesetz().replace(
    'can. 9 § 2',
    'can. 9 <verweis gesetz="CIC" normgeber="unbekannt" norm="§ 2">§ 2</verweis>',
  );
  const xml = await nachbereiteGesetzesXML(original);
  expect(xml).toContain('<verweis norm="Can. 9">can. 9 § 2</verweis>');
  expect(xml).not.toContain('norm="§ 2"');
  expect(xml).not.toContain('norm="§ 3"');
  const gesetz = parseGesetzesXML(xml);
  expect(gesetz).not.toBeNull();
  expect(verweisZuXmlId(gesetz!, 'Can. 9')).toBe('canon-9');
  expect(await nachbereiteGesetzesXML(xml)).toBe(xml);
  expect(io.lesen).not.toHaveBeenCalled();
});
it('erhält bei Nachbereitung ohne Profil den bisherigen Paragraphenverweis', async () => {
  const xml = await nachbereiteGesetzesXML(canonGesetz(false));
  expect(xml).toContain('norm="§ 2"');
  expect(xml).not.toContain('norm="Can. 9"');
});

it.each(['aus', 'verweise', 'saetze', 'saetze-und-verweise'] as const)(
  'verarbeitet den unabhängigen Modus %s',
  async (modus) => {
    const original = gesetz()
      .replace('<normgeber>de-bund</normgeber>', '<normgeber>unbekannt</normgeber>')
      .replace(
        'Siehe § 5 BGB. Weiterer Satz.',
        'Siehe <verweis gesetz="EigenesZiel" normgeber="unbekannt" norm="§ 9" absatz="3">§ 5</verweis> und beachte die Regel. Weiterer Satz.',
      );
    const xml = await nachbereiteGesetzesXML(original, undefined, modus);
    if (modus === 'aus') expect(xml).toBe(original);
    expect(xml.includes('<satz zahl="1">')).toBe(
      modus === 'saetze' || modus === 'saetze-und-verweise',
    );
    expect(xml.includes('gesetz="EigenesZiel" normgeber="unbekannt" norm="§ 9" absatz="3"')).toBe(
      modus === 'aus' || modus === 'saetze',
    );
    expect(xml.includes('<verweis norm="§ 5">')).toBe(
      modus === 'verweise' || modus === 'saetze-und-verweise',
    );
    expect(await nachbereiteGesetzesXML(xml, undefined, modus)).toBe(xml);
    expect(io.lesen).not.toHaveBeenCalled();
  },
);

it('Nur Verweise erhält vorhandene Satzzahlen und innere Satzstruktur', async () => {
  const original = gesetz()
    .replace('<normgeber>de-bund</normgeber>', '<normgeber>unbekannt</normgeber>')
    .replace(
      '<absatz>Siehe § 5 BGB. Weiterer Satz.</absatz>',
      '<absatz><satz zahl="7">Siehe § 5.</satz><satz zahl="9">Weiterer Satz.</satz></absatz>',
    );
  const result = await nachbereiteGesetzesXML(original, undefined, 'verweise');
  expect(result).toContain('<satz zahl="7">');
  expect(result).toContain('<satz zahl="9">');
  expect(result).not.toContain('<satz zahl="1">');
});

it('kombinierter Modus baut trotz altem Verweis über einer Satzgrenze sofort und idempotent Sätze auf', async () => {
  const original = gesetz()
    .replace('<normgeber>de-bund</normgeber>', '<normgeber>unbekannt</normgeber>')
    .replace(
      'Siehe § 5 BGB. Weiterer Satz.',
      'Siehe <verweis gesetz="AltesZiel" normgeber="unbekannt" norm="§ 9">diese Regel. Eine weitere Regel</verweis> gilt nach § 5.',
    );
  const xml = await nachbereiteGesetzesXML(original, undefined, 'saetze-und-verweise');
  expect(xml).toContain('<satz zahl="1">Siehe diese Regel.</satz>');
  expect(xml).toContain('<satz zahl="2">Eine weitere Regel gilt nach <verweis norm="§ 5">');
  expect(xml).not.toContain('gesetz="AltesZiel"');
  expect(await nachbereiteGesetzesXML(xml, undefined, 'saetze-und-verweise')).toBe(xml);
});

it('erkennt bei der Nachbereitung eines Gesetzes aus dem Bundesrecht weiterhin kein Landesrecht', async () => {
  io.dateien.set('resources/importindizes/de-bund.xml', index());
  io.dateien.set(
    'resources/importindizes/de-bw.xml',
    index().replaceAll('BGB', 'LV').replace('Bürgerliches Gesetzbuch', 'Landesverfassung'),
  );
  const xml = await nachbereiteGesetzesXML(gesetz().replace('§ 5 BGB', '§ 5 LV'));
  expect(xml).toContain('<verweis norm="§ 5">');
  expect(xml).not.toContain('gesetz="LV"');
  expect(io.lesen.mock.calls.map(([pfad]) => pfad)).not.toContain(
    'resources/importindizes/de-bw.xml',
  );
});

const importBeispiele = [
  {
    format: 'bja-xml',
    normgeber: 'de-bund',
    importieren: importiereBundXML,
    inhalt:
      '<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>TestG</jurabk><langue>Testgesetz</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Ein erster Satz. Siehe § 1. Weiterer Satz.</P></Content></text></textdaten></norm></dokumente>',
  },
  {
    format: 'html-bw',
    normgeber: 'de-bw',
    importieren: importiereGesetzHTMLBW,
    inhalt:
      '<html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000</title><meta charset="utf-8"></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 1 Titel</h4><p>Ein erster Satz. Siehe § 1. Weiterer Satz.</p></div></body></html>',
  },
  {
    format: 'formex',
    normgeber: 'eu',
    importieren: async (inhalt: string) => {
      const archiv = zipSync({
        'test.doc.xml': strToU8(
          '<DOC><DOC.MAIN.PUB><DATE ISO="20000101"/></DOC.MAIN.PUB><REF.PHYS TYPE="DOC.XML" FILE="test.xml"/></DOC>',
        ),
        'test.xml': strToU8(inhalt),
      });
      io.fetch.mockResolvedValue(
        new Response(new Uint8Array(archiv), { headers: { 'content-type': 'application/zip' } }),
      );
      const ergebnis = await importiereVomInternetEU(
        { kurztitel: 'TestG', langtitel: 'Testgesetz', abrufkennung: '32000R0001' },
        undefined,
        undefined,
        undefined,
        undefined,
        'original',
      );
      if (ergebnis.art !== 'erfolg') throw new Error(JSON.stringify(ergebnis));
      expect(io.speichern).toHaveBeenCalledTimes(1);
      return { xmlString: io.speichern.mock.calls[0]![1] as string };
    },
    inhalt:
      '<ACT><ENACTING.TERMS><ARTICLE><TI.ART>Artikel 1</TI.ART><ALINEA>Ein erster Satz. Siehe Artikel 1. Weiterer Satz.</ALINEA></ARTICLE></ENACTING.TERMS></ACT>',
  },
] as const;

it.each(importBeispiele)(
  'erhält $format durch echten Import, Nachbereitung, Infoslesen und Dateivergleich',
  async ({ format, normgeber, inhalt, importieren }) => {
    const ergebnis = await importieren(inhalt);
    if (!ergebnis.xmlString) throw new Error('Import lieferte kein GesetzesXML.');
    const xml = await nachbereiteGesetzesXML(ergebnis.xmlString);
    const gelesen = leseGesetzInfos(xml);
    if (!gelesen) throw new Error('GesetzInfos nicht lesbar');
    const infos = gelesen;
    expect(infos).toMatchObject({
      kurztitel: 'TestG',
      normgeber,
      ausfertigung: '2000-01-01',
    });
    expect(leseGesetzInfos(xml)).toMatchObject({
      kurztitel: 'TestG',
      normgeber,
      ausfertigung: '2000-01-01',
    });
    if (format === 'formex') {
      expect(infos.datenquelle?.name).toBe('EUR-Lex');
      expect(xml).toContain('CELEX:32000R0001');
    }
    expect(xml).toContain('<langtitel>Testgesetz</langtitel>');
    expect(xml).toContain('<satz zahl="1">');
    expect(xml).toContain(`<verweis norm="${format === 'formex' ? 'Art. 1' : '§ 1'}">`);
    expect(parseGesetzesXML(xml)?.normgeber).toBe(normgeber);
    await expect(vergleicheGesetzesXMLMitBestand(infos, xml)).resolves.toBe('neu');
    const pfad = `/daten/LexLata/gesetze/TestG_${normgeber}.xml`;
    io.dateien.set(pfad, xml);
    await expect(vergleicheGesetzesXMLMitBestand(infos, xml)).resolves.toBe('unveraendert');
    const neueZeiten = xml.replace(
      /<(verarbeitungszeit|letzteNeuerung)>[^<]*<\/\1>/g,
      '<$1>2099-01-01T00:00:00Z</$1>',
    );
    await expect(vergleicheGesetzesXMLMitBestand(infos, neueZeiten)).resolves.toBe('unveraendert');
    const geaenderterText = xml.replace('Weiterer Satz.', 'Geänderter Satz.');
    await expect(vergleicheGesetzesXMLMitBestand(infos, geaenderterText)).resolves.toBe(
      'geaendert',
    );
    expect(io.speichern).toHaveBeenCalledTimes(format === 'formex' ? 1 : 0);
  },
);

it('liefert echte Referenzdiagnosen beim Import nur an den Vorgang', async () => {
  const meldungen: AktionsMeldung[] = [];
  const ergebnis = await taggeUndSpeichereGesetzesXML(
    gesetz(),
    'TestG',
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    (meldung) => meldungen.push(meldung),
  );
  expect(ergebnis.art).toBe('erfolg');
  expect(meldungen).toHaveLength(1);
  expect(meldungen[0]).toMatchObject({ art: 'fehler', anlass: 'lesen', aenderungsstand: 'keine' });
  expect(meldungen[0]!.text).toContain('eingeschränkt');
  expect(meldungen[0]!.text).not.toContain('durchgeführt');
  expect(getSnapshot()).toEqual([]);
});

it('erhält echte Referenzbefunde neben einem Schreibfehler ohne Speicherung zu behaupten', async () => {
  io.speichern.mockRejectedValueOnce(new Error('Schreibfehler'));
  const meldungen: AktionsMeldung[] = [];
  const ergebnis = await taggeUndSpeichereGesetzesXML(
    gesetz(),
    'TestG',
    undefined,
    undefined,
    false,
    undefined,
    undefined,
    undefined,
    (meldung) => meldungen.push(meldung),
  );
  expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'speichern' } });
  expect(meldungen).toHaveLength(1);
  expect(meldungen[0]!.text).toContain('bund:');
  expect(meldungen[0]!.text).not.toContain('gespeichert');
  expect(getSnapshot()).toEqual([]);
});

it('trennt parallele echte Nachbereitungen mit eigenen Empfängern', async () => {
  const bund: AktionsMeldung[] = [];
  const bw: AktionsMeldung[] = [];
  const ergebnisse = await Promise.all([
    nachbereiteGesetzesXML(gesetz(), undefined, 'saetze-und-verweise', undefined, (m) =>
      bund.push(m),
    ),
    nachbereiteGesetzesXML(gesetz('de-bw'), undefined, 'saetze-und-verweise', undefined, (m) =>
      bw.push(m),
    ),
  ]);
  expect(ergebnisse.every((xml) => xml.includes('<satz zahl="1">'))).toBe(true);
  expect(bund).toHaveLength(1);
  expect(bw).toHaveLength(1);
  expect(bund[0]!.text).not.toContain('bw:');
  expect(bw[0]!.text).toContain('bw:');
  expect(getSnapshot()).toEqual([]);
});

it('erhält Satzaufbaubefunde und den bisherigen Importbericht ohne zusätzliche Banner', async () => {
  const meldungen: AktionsMeldung[] = [];
  const bericht = vi.fn();
  const original = gesetz().replace(
    '<absatz>Siehe § 5 BGB. Weiterer Satz.</absatz>',
    '<fremd>Unbekannte Struktur.</fremd>',
  );
  const xml = await nachbereiteGesetzesXML(original, undefined, 'saetze', bericht, (m) =>
    meldungen.push(m),
  );
  expect(xml).toContain('<fremd>Unbekannte Struktur.</fremd>');
  expect(bericht).toHaveBeenCalledTimes(1);
  expect(meldungen).toHaveLength(1);
  expect(meldungen[0]).toMatchObject({
    text: bericht.mock.calls[0]![0],
    art: 'fehler',
    aenderungsstand: 'keine',
  });
  expect(getSnapshot()).toEqual([]);
});

it('bündelt echte Referenzbefunde des gemeinsamen Kontexts auch bei einem Arbeitsabbruch', async () => {
  const meldungen: AktionsMeldung[] = [];
  const fehler = new Error('Nachbereitung abgebrochen');
  await expect(
    mitReferenzKontext(
      async (kontext) => {
        await Promise.all([
          nachbereiteGesetzesXML(gesetz(), kontext),
          taggeGesetzesXML(gesetz(), 'TestG', 'de-bund', kontext),
        ]);
        expect(meldungen).toEqual([]);
        throw fehler;
      },
      (m) => meldungen.push(m),
    ),
  ).rejects.toBe(fehler);
  expect(meldungen).toHaveLength(1);
  expect(meldungen[0]!.text.match(/bund:/g)).toHaveLength(1);
  expect(getSnapshot()).toEqual([]);
});

it('liefert standalone Taggerdiagnosen an den ausdrücklichen Empfänger', async () => {
  const empfangen = vi.fn();
  await taggeGesetzesXML(gesetz(), 'TestG', 'de-bund', undefined, empfangen);
  expect(empfangen).toHaveBeenCalledTimes(1);
  expect(getSnapshot()).toEqual([]);
});

it('trennt parallele Importdiagnosen beim Erfolg und beim Zielfehler', async () => {
  const bund: AktionsMeldung[] = [];
  const bw: AktionsMeldung[] = [];
  const ergebnisse = await Promise.all([
    taggeUndSpeichereGesetzesXML(
      gesetz(),
      'TestG',
      undefined,
      undefined,
      false,
      undefined,
      undefined,
      undefined,
      (m) => bund.push(m),
    ),
    taggeUndSpeichereGesetzesXML(
      gesetz('de-bw'),
      'TestG',
      undefined,
      undefined,
      false,
      undefined,
      {
        ziel: { dateiBasis: 'Falsch_de-bw', quelle: 'de-bw', kurztitel: 'Falsch' },
        vorSchreiben: async () => {},
      },
      undefined,
      (m) => bw.push(m),
    ),
  ]);
  expect(ergebnisse[0]!.art).toBe('erfolg');
  expect(ergebnisse[1]!.art).toBe('fehler');
  expect(io.speichern).toHaveBeenCalledTimes(1);
  expect(bund).toHaveLength(1);
  expect(bw).toHaveLength(1);
  expect(bund[0]!.text).not.toContain('bw:');
  expect(bw[0]!.text).toContain('bw:');
  expect(getSnapshot()).toEqual([]);
});

it('schreibt Eigen- und Fremdverweis gemeinsam und liest beide Ziele aus der nachbereiteten Datei', async () => {
  io.dateien.set('resources/importindizes/de-bund.xml', index());
  const original = gesetz().replace('Siehe § 5 BGB. Weiterer Satz.', 'Siehe § 2 und § 5 BGB.');
  const xml = await nachbereiteGesetzesXML(original);
  expect(xml).toContain('<verweis norm="§ 2">§ 2</verweis>');
  expect(xml).toContain('<verweis gesetz="BGB" normgeber="de-bund" norm="§ 5">§ 5</verweis>');
  const gelesen = parseGesetzesXML(xml);
  assert(gelesen);
  const norm = gelesen.elemente[0];
  assert(norm);
  assert(norm.typ === 'norm');
  const verweise = norm.data.getaggteVerweise;
  assert(verweise);
  expect(verweise).toHaveLength(2);
  const [eigenverweis, fremdverweis] = verweise;
  assert(eigenverweis);
  expect(eigenverweis).toMatchObject({ zielBezeichnung: '§ 2' });
  expect(eigenverweis.zielgesetz).toBeUndefined();
  expect(fremdverweis).toMatchObject({
    zielBezeichnung: '§ 5',
    zielgesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
  });
});
