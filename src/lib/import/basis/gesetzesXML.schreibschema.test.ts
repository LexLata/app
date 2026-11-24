// @vitest-environment jsdom
// gesetzesXML.schreibschema.test.ts
// Prüft den strengen Schreibvertrag unabhängig vom toleranten Leseschema.
import { readdirSync, readFileSync } from 'node:fs';
import { URL as DateiURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  baueGesetzesXML,
  type GesammelteNorm,
  type ImpAbsatz,
} from '@/lib/import/basis/basis.index';
import { nachbereiteGesetzesXML } from '@/lib/import/importabschluss/importabschluss.index';
import { importiereBundXML } from '@/lib/import/bund/bund.index';
import { importiereGesetzHTMLBW } from '@/lib/import/bw/bw.index';
import { konvertiereEuQuelle } from '@/lib/import/eu/eu.index';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';

const hülle = (text: string) =>
  `<gesetz version="1"><infos><kurztitel>G</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text>${text}</text></norm></inhalt></gesetz>`;
async function erwarteGueltig(xml: string | undefined, gültig = true) {
  if (xml === undefined) throw new Error('Die Importquelle hat kein XML erzeugt.');
  const ergebnis = await pruefeSchema('gesetz-schreibschema', xml);
  expect(ergebnis.valid, JSON.stringify(ergebnis.errors)).toBe(gültig);
}
const absatz = (nummer?: string): ImpAbsatz => ({
  nummer,
  elemente: [{ type: 'texte', saetze: ['Erster Satz.', 'Zweiter Satz.'] }],
});
const norm = (absaetze: ImpAbsatz[], zusatz: Partial<GesammelteNorm> = {}): GesammelteNorm => ({
  type: 'paragraph',
  bez: '',
  normBezeichnung: '§ 1',
  ebene: 1,
  gliederungskennzahl: '',
  absaetze,
  ...zusatz,
});

describe('Strenges Schreibschema des GesetzesXML', () => {
  it('prüft alle erzeugten Textformen und ihre Nachbereitung', async () => {
    const liste: ImpAbsatz = {
      nummer: '(1)',
      elemente: [
        { type: 'texte', saetze: ['Es gilt:'] },
        {
          type: 'liste',
          eintraege: [
            {
              bezeichnung: '1.',
              texteVor: ['Nummer'],
              texteNach: ['Abschluss.'],
              unterlistenTyp: 'other',
              untereintraege: [
                {
                  bezeichnung: 'a)',
                  texteVor: ['Erster Satz. Zweiter Satz.'],
                  texteNach: [],
                  untereintraege: [],
                  unterlistenTyp: 'other',
                },
              ],
            },
          ],
        },
        { type: 'texte', saetze: ['Weitere Regel.'] },
      ],
    };
    const mitUnterabsätzen = absatz('(1)');
    mitUnterabsätzen.elemente.push(
      { type: 'unterabsatz' },
      { type: 'texte', saetze: ['Weiterer Text.'] },
    );
    for (const normen of [
      [norm([absatz('(1)'), absatz('(2)')])],
      [norm([mitUnterabsätzen])],
      [norm([liste])],
      [
        norm([
          { zwischenueberschrift: true, elemente: [{ type: 'texte', saetze: ['Zwischentitel'] }] },
          absatz('(1)'),
        ]),
      ],
      [
        norm([], { titel: '(weggefallen)' }),
        norm([absatz()], { normBezeichnung: 'E1', istErwaegungsgrund: true }),
      ],
      [
        norm([absatz()], {
          type: 'gliederung',
          gliederungskennzahl: '001',
          normBezeichnung: undefined,
          bez: 'Teil 1',
        }),
      ],
      [norm([{ elemente: [{ type: 'texte', saetze: ['Fließtext.'] }] }])],
    ]) {
      const xml = baueGesetzesXML(
        { kurztitel: 'G', langtitel: 'Gesetz', normgeber: 'de-bund' },
        normen,
      );
      await erwarteGueltig(xml);
      await erwarteGueltig(await nachbereiteGesetzesXML(xml, undefined, 'saetze'));
    }
    await erwarteGueltig(hülle('<satz zahl="1">Einzelsatz.</satz>'));
    await erwarteGueltig(hülle('Text <verweis norm="§ 1">§ 1</verweis><zeilenumbruch/>weiter.'));
  });

  it('prüft Ausgaben aller Importquellen mit sämtlichen vorhandenen Quelldateien', async () => {
    const bund = new DateiURL('../bund/testdaten/', import.meta.url);
    for (const datei of readdirSync(bund).filter((name) => name.endsWith('.xml'))) {
      const ergebnis = importiereBundXML(readFileSync(new DateiURL(datei, bund), 'utf8'));
      expect(ergebnis.fehler).toBeUndefined();
      await erwarteGueltig(ergebnis.xmlString);
    }
    const bw = importiereGesetzHTMLBW(
      '<html><head><title>Landesrecht BW - G | Landesnorm Baden-Württemberg | Gesamtausgabe | Gesetz (G) vom 1. Januar 2000 | gültig ab: 2000-01-01</title></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 1 Titel</h4><p>(1) Erster Satz. Zweiter Satz.</p></div></body></html>',
    );
    expect(bw.fehler).toBeUndefined();
    await erwarteGueltig(bw.xmlString);
    const eu = new DateiURL('../eu/testdaten/formex/', import.meta.url);
    for (const datei of readdirSync(eu).filter((name) => name.endsWith('.fmx4'))) {
      const ergebnis = konvertiereEuQuelle(
        { kurztitel: 'G', langtitel: 'Gesetz', abrufkennung: '32024R1689' },
        {
          archive: {
            original: new Uint8Array(readFileSync(new DateiURL(encodeURIComponent(datei), eu))),
          },
          herkunft: {
            basisCelex: '32024R1689',
            celex: datei,
            fassung: 'original',
            ergaenzung: 'nicht-noetig',
          },
        },
        new Date('2026-11-16T12:00:00Z'),
      );
      if ('fehler' in ergebnis) throw new Error(ergebnis.fehler.meldung);
      await erwarteGueltig(ergebnis.xml);
    }
  }, 60_000);

  it('prüft sämtliche gebündelten Gesetze und die dokumentierten Konflikt-Testgesetze', async () => {
    const ordner = new DateiURL('../../../../src-tauri/resources/europa/', import.meta.url);
    for (const datei of readdirSync(ordner).filter((name) => name.endsWith('.xml'))) {
      await erwarteGueltig(readFileSync(new DateiURL(datei, ordner), 'utf8'));
    }
    for (const name of ['mkh', 'mkn']) {
      await erwarteGueltig(
        readFileSync(
          new DateiURL(`../../../../docs/doku/testdaten/${name}-gesetz.xml`, import.meta.url),
          'utf8',
        ),
      );
    }
  }, 30_000);

  it('erhält tolerant gelesene Erweiterungen unter dem Leseschema', async () => {
    const xml = hülle(
      '<zusatz>Unbekannter Block.</zusatz><absatz>Bekannter Text.</absatz>',
    ).replace('</infos>', '<metadaten>Erweiterung</metadaten></infos>');
    const ausgabe = await nachbereiteGesetzesXML(xml, undefined, 'saetze');
    expect(ausgabe).toContain('<zusatz>Unbekannter Block.</zusatz>');
    expect(ausgabe).toContain('<metadaten>Erweiterung</metadaten>');
    const ergebnis = await pruefeSchema('gesetz', ausgabe);
    expect(ergebnis.valid, JSON.stringify(ergebnis.errors)).toBe(true);
    await erwarteGueltig(ausgabe, false);
  });

  it.each([
    '<satz zahl="1"><absatz>Falsch.</absatz></satz>',
    '<satz zahl="1"><satz zahl="1">Falsch.</satz></satz>',
    '<absatz>Text.</absatz><litera buchstabe="a)">Falsch.</litera>',
    '<absatz typ="unbekannt">Text.</absatz>',
  ])('weist strukturell nicht erzeugte Textformen ab: %s', async (text) => {
    await erwarteGueltig(hülle(text), false);
  });

  it.each([
    hülle('Text.').replace('</infos>', '<unbekannt/></infos>'),
    hülle('Text.').replace('</inhalt>', '<unbekannt/></inhalt>'),
    hülle('Text.').replace(' id="1"', ''),
    hülle('Text.').replace('</text>', '</text><text/>'),
    hülle('Text.').replace('de-bund', 'de bund'),
    hülle('Text.').replace('id="1"', 'id="1" status="unbekannt"'),
    hülle('Text.').replace('id="1"', 'id="1" typ="unbekannt"'),
    hülle('Text.').replace('id="1"', 'id="1" gliederungskennzahl="01"'),
  ])('weist nicht erzeugte Kopf- und Inhaltsangaben ab: %s', async (xml) => {
    await erwarteGueltig(xml, false);
  });
});
