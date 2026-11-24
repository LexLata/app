// einstellungenSpeicher.test.ts
//
// Tests für einstellungenSpeicher.ts. In-Memory-localStorage-Mock analog zum
// Muster in localStorageJSON.test.ts/aktivierungSpeicher.test.ts (kein
// globales localStorage in der Node-Testumgebung, siehe setupNode.ts).
//
// Die feste Zuordnung und die rohen Speicherwerte werden unabhängig vom
// Rundtrip gegen den eingefrorenen Satz von XML-Tags geprüft.

vi.mock('./einstellungenBackup', () => ({
  meldeEinstellungenGeaendert: vi.fn(),
  loescheEinstellungenBackup: async (aktion: () => void) => aktion(),
}));

import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  baueEinstellungenXML,
  einstellungenOhneVerarbeitungszeit,
  keineEinstellungExplizitGesetzt,
  wendeEinstellungenXMLAn,
  setzeEinstellungenZurueck,
} from './einstellungen.index';
import { FARBSCHEMA_KEY } from '@/lib/einstellungen/speicherschluessel';
import { APP_AKZENTFARBE_KEY } from '@/lib/einstellungen/speicherschluessel';
import { LETZTER_EXPORT_ORDNER_KEY } from '@/lib/einstellungen/speicherschluessel';
import { SCHRIFT_KEY } from '@/lib/einstellungen/speicherschluessel';

function localStorageMock(): Storage {
  const speicher = new Map<string, string>();
  return {
    getItem: (key: string) => speicher.get(key) ?? null,
    setItem: (key: string, wert: string) => void speicher.set(key, wert),
    removeItem: (key: string) => void speicher.delete(key),
    clear: () => speicher.clear(),
    key: (i: number) => Array.from(speicher.keys())[i] ?? null,
    get length() {
      return speicher.size;
    },
  } as Storage;
}

beforeEach(() => {
  globalThis.localStorage = localStorageMock();
});

describe('baueEinstellungenXML', () => {
  it('baut Tag-Namen ohne "lexlata."-Präfix (Bugfix: vorher blieb das volle Präfix im Tag-Namen erhalten)', () => {
    localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');

    const xml = baueEinstellungenXML();

    expect(xml).toContain('<farbschema>dunkel</farbschema>');
    expect(xml).not.toContain('lexlata.farbschema');
  });

  it('lässt Keys ohne expliziten localStorage-Wert aus (kein Default-Auffüllen)', () => {
    localStorage.setItem(FARBSCHEMA_KEY, 'hell');

    const xml = baueEinstellungenXML();

    expect(xml).toContain('<farbschema>hell</farbschema>');
    expect(xml).not.toContain('<appAkzentfarbe>');
  });

  it('exportiert NICHT den letzten Exportordner', () => {
    localStorage.setItem(LETZTER_EXPORT_ORDNER_KEY, '/Users/x/Downloads');
    localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');

    const xml = baueEinstellungenXML();

    expect(xml).not.toContain('letzterExportOrdner');
    expect(xml).not.toContain('/Users/x/Downloads');
  });

  it('enthält einen <verarbeitungszeit>-Tag mit dem aktuellen Zeitstempel (ISO ohne Millisekunden, mit Z)', () => {
    const xml = baueEinstellungenXML();
    expect(xml).toMatch(
      /<verarbeitungszeit>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/verarbeitungszeit>/,
    );
  });

  it('Edge-Case: kein einziger Wert gesetzt -> XML enthält nur Wurzel + verarbeitungszeit-Tag', () => {
    const xml = baueEinstellungenXML();
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<einstellungen version="1">',
        xml.match(/ {4}<verarbeitungszeit>.*<\/verarbeitungszeit>/)![0],
        '</einstellungen>',
      ].join('\n'),
    );
  });

  it('localStorage nicht verfügbar (getItem wirft) -> Wert wird wie "nicht gesetzt" behandelt, kein Crash', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('nicht verfügbar');
      },
    } as unknown as Storage;

    expect(() => baueEinstellungenXML()).not.toThrow();
    expect(baueEinstellungenXML()).not.toContain('<farbschema>');
  });
});

describe('keineEinstellungExplizitGesetzt', () => {
  it('true, wenn kein exportierbarer Key gesetzt ist', () => {
    expect(keineEinstellungExplizitGesetzt()).toBe(true);
  });

  it('false, sobald ein einziger exportierbarer Key gesetzt ist', () => {
    localStorage.setItem(SCHRIFT_KEY, '16');
    expect(keineEinstellungExplizitGesetzt()).toBe(false);
  });

  it('localStorage nicht verfügbar (getItem wirft) -> gilt als "nicht gesetzt" (true)', () => {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error('nicht verfügbar');
      },
    } as unknown as Storage;

    expect(keineEinstellungExplizitGesetzt()).toBe(true);
  });
});

describe('einstellungenOhneVerarbeitungszeit', () => {
  it('entfernt den verarbeitungszeit-Tag samt Inhalt', () => {
    const xml =
      '<einstellungen>\n    <verarbeitungszeit>2026-08-11T14:23:00Z</verarbeitungszeit>\n    <farbschema>dunkel</farbschema>\n</einstellungen>';
    expect(einstellungenOhneVerarbeitungszeit(xml)).toBe(
      '<einstellungen>\n    \n    <farbschema>dunkel</farbschema>\n</einstellungen>',
    );
  });

  it('Edge-Case: kein verarbeitungszeit-Tag vorhanden -> Eingabe bleibt unverändert', () => {
    const xml = '<einstellungen>\n    <farbschema>dunkel</farbschema>\n</einstellungen>';
    expect(einstellungenOhneVerarbeitungszeit(xml)).toBe(xml);
  });

  it('entfernt nur den ERSTEN verarbeitungszeit-Tag (kein globales Ersetzen nötig, da verarbeitungszeit nur einmal vorkommt)', () => {
    const xml =
      '<a><verarbeitungszeit>1</verarbeitungszeit><verarbeitungszeit>2</verarbeitungszeit></a>';
    expect(einstellungenOhneVerarbeitungszeit(xml)).toBe(
      '<a><verarbeitungszeit>2</verarbeitungszeit></a>',
    );
  });
});

describe('wendeEinstellungenXMLAn', () => {
  it('übernimmt einen in der XML enthaltenen Wert in localStorage', () => {
    wendeEinstellungenXMLAn(
      [
        '<?xml version="1.0"?>',
        '<einstellungen>',
        '    <farbschema>dunkel</farbschema>',
        '</einstellungen>',
      ].join('\n'),
    );

    expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('dunkel');
  });

  it('"Ersetzen"-Semantik: ein aktuell gesetzter Key, der in der importierten XML fehlt, wird entfernt', () => {
    localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
    localStorage.setItem(APP_AKZENTFARBE_KEY, '#ff0000');

    wendeEinstellungenXMLAn(
      [
        '<?xml version="1.0"?>',
        '<einstellungen>',
        '    <farbschema>hell</farbschema>',
        '</einstellungen>',
      ].join('\n'),
    );

    expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('hell');
    expect(localStorage.getItem(APP_AKZENTFARBE_KEY)).toBeNull();
  });

  it('rührt den letzten Exportordner nicht an, da er nicht Teil der exportierbaren Keys ist', () => {
    localStorage.setItem(LETZTER_EXPORT_ORDNER_KEY, '/pfad');

    wendeEinstellungenXMLAn('<einstellungen></einstellungen>');

    expect(localStorage.getItem(LETZTER_EXPORT_ORDNER_KEY)).toBe('/pfad');
  });

  it('Rundtrip: baueEinstellungenXML() -> wendeEinstellungenXMLAn() stellt denselben Zustand wieder her', () => {
    localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
    localStorage.setItem(SCHRIFT_KEY, '18');

    const xml = baueEinstellungenXML();
    localStorage.clear();
    wendeEinstellungenXMLAn(xml);

    expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('dunkel');
    expect(localStorage.getItem(SCHRIFT_KEY)).toBe('18');
  });

  it('localStorage nicht verfügbar (setItem/removeItem werfen) -> kein Crash', () => {
    globalThis.localStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('nicht verfügbar');
      },
      removeItem: () => {
        throw new Error('nicht verfügbar');
      },
    } as unknown as Storage;

    expect(() =>
      wendeEinstellungenXMLAn('<einstellungen><farbschema>dunkel</farbschema></einstellungen>'),
    ).not.toThrow();
  });
});

describe('setzeEinstellungenZurueck', () => {
  it('entfernt alle exportierbaren Keys', async () => {
    localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
    localStorage.setItem(SCHRIFT_KEY, '16');

    await setzeEinstellungenZurueck();

    expect(localStorage.getItem(FARBSCHEMA_KEY)).toBeNull();
    expect(localStorage.getItem(SCHRIFT_KEY)).toBeNull();
  });

  it('entfernt ZUSÄTZLICH den letzten Exportordner (anders als wendeEinstellungenXMLAn)', async () => {
    localStorage.setItem(LETZTER_EXPORT_ORDNER_KEY, '/pfad');

    await setzeEinstellungenZurueck();

    expect(localStorage.getItem(LETZTER_EXPORT_ORDNER_KEY)).toBeNull();
  });

  it('localStorage nicht verfügbar (removeItem wirft) -> kein Crash', async () => {
    globalThis.localStorage = {
      getItem: () => null,
      removeItem: () => {
        throw new Error('nicht verfügbar');
      },
    } as unknown as Storage;

    await expect(setzeEinstellungenZurueck()).resolves.toEqual({ erfolgreich: true });
  });
});

it('schreibt wohlgeformtes XML auch mit Sonderzeichen und wörtlichen Entities', () => {
  const wert = `&<>"' &amp; &lt;`;
  localStorage.setItem(FARBSCHEMA_KEY, wert);
  pruefeXmlWohlgeformtheit(baueEinstellungenXML());
  const xml = baueEinstellungenXML();
  expect(
    new DOMParser().parseFromString(xml, 'text/xml').querySelector('farbschema')?.textContent,
  ).toBe(wert);
  localStorage.clear();
  wendeEinstellungenXMLAn(xml);
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe(wert);
});

it('dekodiert die fünf XML-Entities beim Import genau einmal', () => {
  wendeEinstellungenXMLAn(
    '<einstellungen version="1"><farbschema>&amp;&lt;&gt;&quot;&apos; &amp;amp; &amp;lt;</farbschema></einstellungen>',
  );
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe(`&<>"' &amp; &lt;`);
});

it('liest Einstellungen nur direkt und ignoriert Attribute, Zusatzkinder und Kommentare', () => {
  wendeEinstellungenXMLAn(
    `<einstellungen extra='x'><neu><farbschema>hell</farbschema></neu><!-- <farbschema>hell</farbschema> --><farbschema extra='x'>dunkel</farbschema><neu/></einstellungen>`,
  );
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('dunkel');
});
it('beschädigte XML löscht keine vorhandenen Einstellungen', () => {
  localStorage.setItem(FARBSCHEMA_KEY, 'hell');
  expect(() =>
    wendeEinstellungenXMLAn('<einstellungen><farbschema>dunkel</einstellungen>'),
  ).toThrow('Datei ungültig');
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('hell');
});

const FESTE_EINSTELLUNGS_TAGS = [
  'farbschema',
  'appAkzentfarbe',
  'gesetzestextAkzentfarbe',
  'hervorhebungsfarbe',
  'schriftgroesse',
  'leistenSchriftgroesse',
  'schriftart',
  'zeilenabstand',
  'satzNeuZeile',
  'blocksatz',
  'silbentrennung',
  'randbreite',
  'strukturKontextLeisteGroesse',
  'lesbareZeilenlaenge',
  'lesbareZeilenlaengeBreite',
  'uiGroesse',
  'markierungenDeaktiviert',
  'minimalistischerModus',
  'nachbereitungBeiImport',
  'euFassung',
  'euDurchfuehrungsaktSuche',
  'seitenleistenTastenkuerzel',
  'autoAktualisierungIntervall',
  'linuxTitelleistenPraeferenz',
  'plattformfremdeUiAnzeigen',
  'zitatAbkuerzungenAktiv',
  'zitatOhnePunkt',
  'zitatRoemischeAbsaetze',
  'leistenTauschen',
  'appUpdatesAutomatischSuchen',
] as const;

it('exportiert jeden eingefrorenen Speicherschlüssel genau einmal mit seinem festen XML-Tag', () => {
  for (const [index, tag] of FESTE_EINSTELLUNGS_TAGS.entries())
    localStorage.setItem(`lexlata.${tag}`, ` ${index}:true & "false" `);
  const lesen = vi.spyOn(localStorage, 'getItem');
  const xml = baueEinstellungenXML();
  expect(lesen.mock.calls.map(([key]) => key)).toEqual(
    FESTE_EINSTELLUNGS_TAGS.map((tag) => `lexlata.${tag}`),
  );
  lesen.mockRestore();
  const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
  expect(Array.from(root.children).map((el) => el.tagName)).toEqual([
    'verarbeitungszeit',
    ...FESTE_EINSTELLUNGS_TAGS,
  ]);
  localStorage.clear();
  wendeEinstellungenXMLAn(xml);
  expect(localStorage.length).toBe(FESTE_EINSTELLUNGS_TAGS.length);
  for (const [index, tag] of FESTE_EINSTELLUNGS_TAGS.entries())
    expect(localStorage.getItem(`lexlata.${tag}`)).toBe(` ${index}:true & "false" `);
});

it.each(['aus', 'verweise', 'saetze', 'saetze-und-verweise'])(
  'exportiert, importiert und setzt den Nachbereitungsmodus %s zurück',
  async (modus) => {
    localStorage.setItem('lexlata.nachbereitungBeiImport', modus);
    const xml = baueEinstellungenXML();
    expect(xml).toContain(`<nachbereitungBeiImport>${modus}</nachbereitungBeiImport>`);
    localStorage.clear();
    wendeEinstellungenXMLAn(xml);
    expect(localStorage.getItem('lexlata.nachbereitungBeiImport')).toBe(modus);
    await setzeEinstellungenZurueck();
    expect(localStorage.getItem('lexlata.nachbereitungBeiImport')).toBeNull();
  },
);

const ALTE_OPTIONEN = {
  markierungenAktiviert: 'false',
  strukturLeisteSkalierung: 'gross',
  gesetzestextAkzent: 'rot',
  zeilenlaengeBreite: 'breit',
};
it('liest, überschreibt und entfernt ausschließlich alte Optionsschlüssel niemals', async () => {
  for (const [tag, wert] of Object.entries(ALTE_OPTIONEN))
    localStorage.setItem(`lexlata.${tag}`, wert);
  const lesen = vi.spyOn(localStorage, 'getItem');
  expect(keineEinstellungExplizitGesetzt()).toBe(true);
  expect(baueEinstellungenXML()).not.toMatch(
    /<(markierungenAktiviert|strukturLeisteSkalierung|gesetzestextAkzent|zeilenlaengeBreite)>/,
  );
  wendeEinstellungenXMLAn(
    `<einstellungen>${Object.entries(ALTE_OPTIONEN)
      .map(([tag, wert]) => `<${tag}>${wert}</${tag}>`)
      .join('')}</einstellungen>`,
  );
  await setzeEinstellungenZurueck();
  for (const tag of Object.keys(ALTE_OPTIONEN))
    expect(lesen.mock.calls.map(([key]) => key)).not.toContain(`lexlata.${tag}`);
  lesen.mockRestore();
  for (const [tag, wert] of Object.entries(ALTE_OPTIONEN))
    expect(localStorage.getItem(`lexlata.${tag}`)).toBe(wert);
});

it('berichtet echte Teilübernahme nach fehlgeschlagenem Entfernen und Setzen', () => {
  localStorage.setItem(APP_AKZENTFARBE_KEY, 'alt');
  const entfernen = localStorage.removeItem.bind(localStorage);
  const setzen = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'removeItem').mockImplementation((key) => {
    if (key === APP_AKZENTFARBE_KEY) throw new Error('Entfernen verweigert');
    entfernen(key);
  });
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, wert) => {
    if (key === SCHRIFT_KEY) throw new Error('Setzen verweigert');
    setzen(key, wert);
  });
  const ergebnis = wendeEinstellungenXMLAn(
    '<einstellungen><farbschema>hell</farbschema><schriftgroesse>18</schriftgroesse></einstellungen>',
  );
  expect(ergebnis).toMatchObject({ aenderungsstand: 'teilweise' });
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('hell');
  expect(localStorage.getItem(APP_AKZENTFARBE_KEY)).toBe('alt');
  expect(localStorage.getItem(SCHRIFT_KEY)).toBeNull();
});

describe('Leisten tauschen im vereinbarten XML-Format', () => {
  it.each(['true', 'false'])('exportiert %s zuletzt und importiert den Wert', (wert) => {
    localStorage.setItem('lexlata.farbschema', 'hell');
    localStorage.setItem('lexlata.leistenTauschen', wert);
    const xml = baueEinstellungenXML();
    expect(xml).toContain(`<leistenTauschen>${wert}</leistenTauschen>\n</einstellungen>`);
    localStorage.clear();
    wendeEinstellungenXMLAn(xml);
    expect(localStorage.getItem('lexlata.leistenTauschen')).toBe(wert);
  });
  it('lässt den ungesetzten Standard aus und entfernt beim Import ohne Tag den Altwert', () => {
    expect(baueEinstellungenXML()).not.toContain('<leistenTauschen>');
    localStorage.setItem('lexlata.leistenTauschen', 'true');
    wendeEinstellungenXMLAn(
      '<einstellungen version="1"><farbschema>hell</farbschema></einstellungen>',
    );
    expect(localStorage.getItem('lexlata.leistenTauschen')).toBeNull();
  });
});

describe('Automatisch nach Updates suchen im vereinbarten XML-Format', () => {
  it.each(['true', 'false'])('exportiert %s zuletzt und importiert den Wert', (wert) => {
    localStorage.setItem('lexlata.appUpdatesAutomatischSuchen', wert);
    const xml = baueEinstellungenXML();
    expect(xml).toContain(
      `<appUpdatesAutomatischSuchen>${wert}</appUpdatesAutomatischSuchen>\n</einstellungen>`,
    );
    localStorage.clear();
    wendeEinstellungenXMLAn(xml);
    expect(localStorage.getItem('lexlata.appUpdatesAutomatischSuchen')).toBe(wert);
  });
  it('ein fehlendes Element entfernt den gespeicherten Wert', () => {
    localStorage.setItem('lexlata.appUpdatesAutomatischSuchen', 'false');
    wendeEinstellungenXMLAn(
      '<einstellungen version="1"><farbschema>hell</farbschema></einstellungen>',
    );
    expect(localStorage.getItem('lexlata.appUpdatesAutomatischSuchen')).toBeNull();
  });
  it('Zurücksetzen entfernt den gespeicherten Wert', async () => {
    localStorage.setItem('lexlata.appUpdatesAutomatischSuchen', 'false');
    await setzeEinstellungenZurueck();
    expect(localStorage.getItem('lexlata.appUpdatesAutomatischSuchen')).toBeNull();
  });
});

it.each(['true', 'false'])('erhält Seitenleisten-Tastenkürzel beim XML-Rundlauf: %s', (wert) => {
  localStorage.setItem('lexlata.seitenleistenTastenkuerzel', wert);
  const xml = baueEinstellungenXML();
  expect(xml).toContain(`<seitenleistenTastenkuerzel>${wert}</seitenleistenTastenkuerzel>`);
  localStorage.clear();
  wendeEinstellungenXMLAn(xml);
  expect(localStorage.getItem('lexlata.seitenleistenTastenkuerzel')).toBe(wert);
});
it('übernimmt den früheren Seitenleisten-Tag nicht', () => {
  wendeEinstellungenXMLAn(
    '<einstellungen version="1"><tastaturHinweiseAusblenden>false</tastaturHinweiseAusblenden></einstellungen>',
  );
  expect(localStorage.getItem('lexlata.seitenleistenTastenkuerzel')).toBeNull();
});
