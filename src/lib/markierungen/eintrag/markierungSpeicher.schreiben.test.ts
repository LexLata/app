// @vitest-environment jsdom
// Prüft, dass eine Markierungsdatei nur wohlgeformt geschrieben wird (gemockt: native Grenze).
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { beforeEach, expect, it } from 'vitest';
import { schreibeMarkierungsXML } from './markierungSpeicher.schreiben';
import { ersetzeMarkierungsXML } from './markierungSpeicher.aendern';

const gesetz = { normgeber: 'de-bund', kurztitel: 'BGB' };
const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
const nutzertext = 'Geheimer Nutzertext';
const gueltig = (kommentartext: string, wurzel = 'markierungen') =>
  `<${wurzel} version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt>` +
  `<kommentar><kommentartext>${kommentartext}</kommentartext></kommentar></inhalt></${wurzel}>`;
// Version 2 löst beim Schreiben eine Sicherung aus; bleibt sie aus, lief der Schreibweg nicht an.
const bestand = gueltig('Bestand').replace('version="1"', 'version="2"');

const schreibbefehle = () =>
  aufbau.native.invoke.mock.calls
    .map(([befehl]) => befehl)
    .filter(
      (befehl) => befehl === 'atomar_datei_schreiben' || befehl === 'sichere_abweichende_version',
    );

beforeEach(() => {
  aufbau.bereiteNativeAttrappeVor();
  aufbau.native.texte.set(aufbau.basis + pfad, bestand);
});

const unzulaessig = [
  { fall: 'vertikaler Tabulator U+000B', inhalt: gueltig(`${nutzertext}\u000B`) },
  { fall: 'einzelnes Surrogat', inhalt: gueltig(`${nutzertext}\uD800`) },
  { fall: 'nicht wohlgeformtes XML', inhalt: gueltig(`${nutzertext}</kommentar>`) },
  { fall: 'falsche Wurzel', inhalt: gueltig(nutzertext, 'favoriten') },
];

it.each(unzulaessig)(
  'schreibt bei $fall nichts, sichert nichts und nennt keinen Nutzertext',
  async ({ inhalt }) => {
    const fehler = await schreibeMarkierungsXML(pfad, inhalt, 'token-x').catch((f: unknown) => f);
    expect(fehler).toBeInstanceOf(Error);
    expect(String(fehler)).not.toContain(nutzertext);
    expect(aufbau.native.texte.get(aufbau.basis + pfad)).toBe(bestand);
    expect([...aufbau.native.texte.keys()].filter((p) => p.endsWith('.bak'))).toEqual([]);
    expect(schreibbefehle()).toEqual([]);
  },
);

it('schreibt wohlgeformten Inhalt', async () => {
  aufbau.native.texte.delete(aufbau.basis + pfad);
  await schreibeMarkierungsXML(pfad, gueltig('Zeile 1\nZeile 2 & mehr'.replace('&', '&amp;')));
  expect(aufbau.native.texte.get(aufbau.basis + pfad)).toBe(gueltig('Zeile 1\nZeile 2 &amp; mehr'));
});

it.each(unzulaessig.filter(({ fall }) => fall !== 'falsche Wurzel'))(
  'Import „Ersetzen“ weist $fall zurück, ohne Datei oder Sicherung zu verändern',
  async ({ inhalt }) => {
    await expect(ersetzeMarkierungsXML(gesetz, inhalt)).rejects.toThrow();
    expect(aufbau.native.texte.get(aufbau.basis + pfad)).toBe(bestand);
    expect([...aufbau.native.texte.keys()].filter((p) => p.endsWith('.bak'))).toEqual([]);
    expect(schreibbefehle()).toEqual([]);
  },
);
