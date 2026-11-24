// @vitest-environment jsdom
// Prüft alle vier Nutzerdatenspeicher mit echten Modulen und gemockten nativen Grenzen.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { beforeEach, expect, it } from 'vitest';
import {
  umschaltenFavorit,
  ladeFavoriten,
  ersetzeFavoritenDatei,
} from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import {
  umschaltenLesezeichen,
  ladeLesezeichen,
  ersetzeLesezeichenDatei,
  loescheAlleLesezeichen,
} from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import {
  speichereGesetzeskurzbefehl,
  ladeAlleGesetzeskurzbefehle,
  ersetzeGesetzeskurzbefehleDatei,
  loescheGesetzeskurzbefehl,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { ersetzeMarkierungsXML } from '@/lib/markierungen/eintrag/markierungSpeicher.aendern';
import { aktualisiereKommentar } from '@/lib/markierungen/eintrag/markierungSpeicher.aktionen';
import {
  ermittleGesetzeMitMarkierungen,
  ladeMarkierungen,
} from '@/lib/markierungen/eintrag/markierungSpeicher.lesen';
import { baueXML } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { sicherungenImDatenordnerSatz } from '@/lib/domain/app/meldungsgruppen';

function vorhanden<T>(wert: T | undefined): T {
  if (wert === undefined) throw new Error('Erwartete Testdaten fehlen.');
  return wert;
}

/** Gruppenschlüssel aller angezeigten Banner (Struktur statt Wortlaut). */
function gruppen(): string[] {
  return getSnapshot().flatMap(
    (banner) =>
      banner.gliederung?.kategorien.flatMap((k) => k.gruppen.map((g) => g.schluessel)) ?? [],
  );
}

const gesetz = { normgeber: 'de-bund', kurztitel: 'BGB' };
const kommentar = markierungsEintrag({
  typ: 'kommentar',
  kommentarText: 'Alt',
  bezug: { typ: 'pauschal', elementstand: { titel: '', textlaenge: 0 } },
});
const faelle = [
  {
    ersetzen: (xml: string) => ersetzeMarkierungsXML(gesetz, xml),
    format: 'Markierungen',
    pfad: 'markierungen/BGB_de-bund-markierungen.xml',
    xml: baueXML(gesetz, [kommentar]),
    lesen: () => ladeMarkierungen(gesetz),
    aendern: (nr: number) =>
      aktualisiereKommentar(
        gesetz,
        { ...kommentar, kommentarText: nr === 1 ? 'Alt' : 'Neu 1' },
        `Neu ${nr}`,
        { elementstand: { titel: '', textlaenge: 0 } },
      ),
    neu: 'Neu 1',
  },
  {
    ersetzen: (xml: string) => ersetzeFavoritenDatei(gesetz, xml),
    format: 'Favoriten',
    pfad: 'favoriten/BGB_de-bund-favoriten.xml',
    xml: '<favoriten version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>§ 1</bezeichnung></eintrag></inhalt></favoriten>',
    lesen: () => ladeFavoriten(gesetz),
    aendern: (nr: number) => umschaltenFavorit(gesetz, `§ ${nr + 1}`),
    neu: '§ 2',
  },
  {
    ersetzen: ersetzeLesezeichenDatei,
    format: 'Lesezeichen',
    pfad: 'lesezeichen/lesezeichen.xml',
    xml: '<lesezeichen version="1"><inhalt><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>§ 1</bezeichnung></eintrag></inhalt></lesezeichen>',
    lesen: ladeLesezeichen,
    aendern: (nr: number) => umschaltenLesezeichen(gesetz, `§ ${nr + 1}`),
    neu: '§ 2',
  },
  {
    ersetzen: ersetzeGesetzeskurzbefehleDatei,
    format: 'Gesetzeskurzbefehle',
    pfad: 'einstellungen/gesetzeskurzbefehle.xml',
    xml: '<gesetzeskurzbefehle version="1"><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste primaer="true">b</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>',
    lesen: ladeAlleGesetzeskurzbefehle,
    aendern: (nr: number) =>
      speichereGesetzeskurzbefehl(gesetz, {
        taste: `F${nr}`,
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      }),
    neu: 'F1',
  },
];
const sicherungen = () => [...aufbau.native.texte.keys()].filter((pfad) => pfad.endsWith('.bak'));
beforeEach(() => {
  aufbau.bereiteNativeAttrappeVor();
  alleBannerSchliessen();
  const vorher = vorhanden(aufbau.native.invoke.getMockImplementation());
  aufbau.native.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'app_daten_loeschen') {
      aufbau.native.texte.delete(aufbau.basis + String(vorhanden(args).relativerPfad));
      return;
    }
    if (befehl === 'sichere_abweichende_version') {
      const pfad = String(vorhanden(args).relativerPfad);
      const sicherung = `${pfad}.abweichende-version-20261105T120000.000Z-1-0.bak`;
      aufbau.native.texte.set(
        aufbau.basis + sicherung,
        vorhanden(aufbau.native.texte.get(aufbau.basis + pfad)),
      );
      return sicherung;
    }
    return vorher(befehl, args);
  });
});
it.each(faelle)(
  '$format liest Version 2, sichert vor der ersten Änderung und schreibt danach ohne zweite Sicherung',
  async (fall) => {
    const original = fall.xml
      .replace('version="1"', 'version="2"')
      .replace('</inhalt>', '</inhalt><zukunft>Unbekannt</zukunft>');
    aufbau.native.texte.set(aufbau.basis + fall.pfad, original);
    const gelesen = await fall.lesen();
    expect(Array.isArray(gelesen) ? gelesen.length : Object.keys(gelesen).length).toBe(1);
    expect(aufbau.native.emitTo).toHaveBeenCalledWith('main', 'schemaversion-abweichend');
    aufbau.native.emitTo.mockClear();
    await fall.aendern(1);
    expect(sicherungen()).toHaveLength(1);
    expect(aufbau.native.texte.get(vorhanden(sicherungen()[0]))).toBe(original);
    const geschrieben = aufbau.native.texte.get(aufbau.basis + fall.pfad);
    expect(geschrieben).toContain('version="1"');
    expect(geschrieben).toContain(fall.neu);
    // Die Änderung liest einmal; der zusätzliche Lesezugriff im Schreibweg darf keinen Hinweis senden.
    expect(
      aufbau.native.emitTo.mock.calls.filter(
        ([, ereignis]) => ereignis === 'schemaversion-abweichend',
      ),
    ).toHaveLength(1);
    expect(gruppen()).toContain('wegenSchemaversionGesichert');
    expect(getSnapshot().some((banner) => banner.text.includes('abweichende-version-'))).toBe(
      false,
    );
    await fall.aendern(2);
    expect(sicherungen()).toHaveLength(1);
  },
);
it.each(faelle)(
  '$format verändert bei gescheiterter Sicherung weder Datei noch Speicherstand',
  async (fall) => {
    const original = fall.xml.replace('version="1"', 'version="2"');
    aufbau.native.texte.set(aufbau.basis + fall.pfad, original);
    const stand = await fall.lesen();
    const vorher = vorhanden(aufbau.native.invoke.getMockImplementation());
    aufbau.native.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'sichere_abweichende_version') throw Error('Datenträger voll');
      return vorher(befehl, args);
    });
    await expect(fall.aendern(1)).rejects.toThrow('Datenträger voll');
    expect(aufbau.native.texte.get(aufbau.basis + fall.pfad)).toBe(original);
    expect(await fall.lesen()).toEqual(stand);
    expect(aufbau.native.invoke.mock.calls.some(([b]) => b === 'atomar_datei_schreiben')).toBe(
      false,
    );
    expect(getSnapshot()).toContainEqual(
      expect.objectContaining({ typ: 'fehler', text: expect.stringContaining('nicht gesichert') }),
    );
  },
);
it.each(['1', null, '0', 'abc'])(
  'sichert Version %s genau nach der Abweichungsregel',
  async (version) => {
    const fall = vorhanden(faelle[1]);
    const xml =
      version === null
        ? fall.xml.replace(' version="1"', '')
        : fall.xml.replace('version="1"', `version="${version}"`);
    aufbau.native.texte.set(aufbau.basis + fall.pfad, xml);
    await fall.aendern(1);
    expect(sicherungen()).toHaveLength(version === '0' || version === 'abc' ? 1 : 0);
  },
);
it('schreibt eine fehlende Datei ohne Sicherung', async () => {
  await umschaltenFavorit(gesetz, '§ 1');
  expect(sicherungen()).toEqual([]);
  expect(aufbau.native.texte.get(aufbau.basis + vorhanden(faelle[1]).pfad)).toContain('§ 1');
});

it('liefert Versionssicherungen beim Auflisten der Markierungsdateien nicht mit', async () => {
  const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
  aufbau.native.texte.set(aufbau.basis + pfad, baueXML(gesetz, [kommentar]));
  aufbau.native.texte.set(
    aufbau.basis + pfad + '.abweichende-version-20261105T120000.000Z-1-0.bak',
    'gesichert',
  );
  aufbau.native.texte.set(
    aufbau.basis +
      'markierungen/GG_de-bund-markierungen.xml.abweichende-version-20261105T120000.000Z-1-1.bak',
    'nur Sicherung',
  );
  expect(await ermittleGesetzeMitMarkierungen()).toEqual([gesetz]);
});

it.each(faelle)(
  '$format erhält beim Ersetzen das Roh-XML mit Ausnahme des eigenen Versionsattributs',
  async (fall) => {
    const original = fall.xml.replace('version="1"', 'version="2"');
    aufbau.native.texte.set(aufbau.basis + fall.pfad, original);
    const importiert =
      `\ufeff<?xml version="1.0"?>\r\n<!-- version="2" -->` +
      fall.xml
        // Eine zweite XML-Deklaration wäre nicht wohlgeformt und würde nicht geschrieben.
        .replace(/^<\?xml[^>]*\?>\s*/, '')
        .replace('version="1"', "extra=\"version='2'\" version = '2'")
        .replace('</inhalt>', '</inhalt><zukunft version="7">Unbekannt &amp; erhalten</zukunft>');
    const erwartet = importiert.replace(" version = '2'", " version = '1'");
    await fall.ersetzen(importiert);
    expect(aufbau.native.texte.get(aufbau.basis + fall.pfad)).toBe(erwartet);
    expect(aufbau.native.texte.get(vorhanden(sicherungen()[0]))).toBe(original);
    await fall.ersetzen(importiert);
    expect(sicherungen()).toHaveLength(1);
  },
);

it.each(faelle)(
  '$format schreibt bekannte und fehlende Versionen sowie fehlende Dateien ohne Sicherung',
  async (fall) => {
    for (const original of [fall.xml, fall.xml.replace(' version="1"', ''), null]) {
      aufbau.native.texte.delete(aufbau.basis + fall.pfad);
      if (original !== null) aufbau.native.texte.set(aufbau.basis + fall.pfad, original);
      await fall.ersetzen(fall.xml);
      expect(aufbau.native.texte.get(aufbau.basis + fall.pfad)).toBe(fall.xml);
      expect(sicherungen()).toEqual([]);
    }
  },
);
it('meldet bei fehlgeschlagenem Schreiben die Sicherung ohne Pfad und erhält beide Originale', async () => {
  const fall = vorhanden(faelle[1]);
  const original = fall.xml.replace('version="1"', 'version="2"');
  aufbau.native.texte.set(aufbau.basis + fall.pfad, original);
  const vorher = vorhanden(aufbau.native.invoke.getMockImplementation());
  aufbau.native.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'atomar_datei_schreiben') throw Error('Schreibfehler');
    return vorher(befehl, args);
  });
  await expect(fall.aendern(1)).rejects.toThrow('Schreibfehler');
  expect(aufbau.native.texte.get(aufbau.basis + fall.pfad)).toBe(original);
  expect(aufbau.native.texte.get(vorhanden(sicherungen()[0]))).toBe(original);
  expect(getSnapshot().map((banner) => banner.typ)).toContain('fehler');
  expect(gruppen()).toEqual(
    expect.arrayContaining(['wegenSchemaversionGesichert', 'nichtSpeicherbar']),
  );
  expect(
    getSnapshot().some((banner) =>
      [1, 2].some((anzahl) => banner.text.includes(sicherungenImDatenordnerSatz(anzahl))),
    ),
  ).toBe(true);
  expect(JSON.stringify(getSnapshot())).not.toContain('abweichende-version-');
});

const leerungsFaelle = [
  { ...vorhanden(faelle[1]), entfernen: () => umschaltenFavorit(gesetz, '§ 1') },
  { ...vorhanden(faelle[2]), entfernen: () => umschaltenLesezeichen(gesetz, '§ 1') },
  { ...vorhanden(faelle[3]), entfernen: () => loescheGesetzeskurzbefehl(gesetz) },
];

it.each(leerungsFaelle)(
  '$format sichert beim Entfernen des letzten bekannten Eintrags auch unbekannte Daten vor dem Löschen',
  async (fall) => {
    const original = fall.xml
      .replace('version="1"', 'version="2"')
      .replace('</inhalt>', '</inhalt><zukunft>Unbekannt &amp; erhalten</zukunft>');
    aufbau.native.texte.set(aufbau.basis + fall.pfad, original);
    await fall.entfernen();
    expect(aufbau.native.texte.has(aufbau.basis + fall.pfad)).toBe(false);
    expect(sicherungen()).toHaveLength(1);
    expect(aufbau.native.texte.get(vorhanden(sicherungen()[0]))).toBe(original);
    const sicherung = aufbau.native.invoke.mock.calls.find(
      ([befehl]) => befehl === 'sichere_abweichende_version',
    );
    const loeschung = aufbau.native.invoke.mock.calls.find(
      ([befehl]) => befehl === 'app_daten_loeschen',
    );
    expect(sicherung).toEqual([
      'sichere_abweichende_version',
      { relativerPfad: fall.pfad, token: expect.any(String) },
    ]);
    expect(loeschung).toEqual(['app_daten_loeschen', vorhanden(sicherung)[1]]);
    expect(aufbau.native.invoke.mock.calls.indexOf(vorhanden(sicherung))).toBeLessThan(
      aufbau.native.invoke.mock.calls.indexOf(vorhanden(loeschung)),
    );
    expect(gruppen()).toContain('wegenSchemaversionGesichert');
    expect(JSON.stringify(getSnapshot())).not.toContain('abweichende-version-');
  },
);
it.each(leerungsFaelle)(
  '$format erhält bei gescheiterter Sicherung den letzten Eintrag und meldet keine Bestandsänderung',
  async (fall) => {
    const original = fall.xml.replace('version="1"', 'version="2"');
    aufbau.native.texte.set(aufbau.basis + fall.pfad, original);
    const stand = await fall.lesen();
    aufbau.native.emitTo.mockClear();
    const vorher = vorhanden(aufbau.native.invoke.getMockImplementation());
    aufbau.native.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'sichere_abweichende_version') throw Error('Datenträger voll');
      return vorher(befehl, args);
    });
    await expect(fall.entfernen()).rejects.toThrow('Datenträger voll');
    expect(aufbau.native.texte.get(aufbau.basis + fall.pfad)).toBe(original);
    expect(await fall.lesen()).toEqual(stand);
    expect(aufbau.native.invoke.mock.calls.some(([b]) => b === 'app_daten_loeschen')).toBe(false);
    expect(
      aufbau.native.emitTo.mock.calls.every(
        ([, ereignis]) => ereignis === 'schemaversion-abweichend',
      ),
    ).toBe(true);
    expect(getSnapshot()).toContainEqual(
      expect.objectContaining({ typ: 'fehler', text: expect.stringContaining('nicht gesichert') }),
    );
  },
);
it.each(leerungsFaelle)(
  '$format löscht beim Entfernen des letzten Eintrags bekannte und versionslose Dateien ohne Sicherung',
  async (fall) => {
    for (const original of [fall.xml, fall.xml.replace(' version="1"', '')]) {
      aufbau.native.texte.set(aufbau.basis + fall.pfad, original);
      await fall.entfernen();
      expect(aufbau.native.texte.has(aufbau.basis + fall.pfad)).toBe(false);
      expect(sicherungen()).toEqual([]);
    }
  },
);
it('löscht bei ausdrücklich gewähltem Entfernen aller Lesezeichen weiterhin ohne Versionssicherung', async () => {
  const fall = vorhanden(faelle[2]);
  aufbau.native.texte.set(aufbau.basis + fall.pfad, fall.xml.replace('version="1"', 'version="2"'));
  await loescheAlleLesezeichen();
  expect(aufbau.native.texte.has(aufbau.basis + fall.pfad)).toBe(false);
  expect(sicherungen()).toEqual([]);
});
