// verweisTagger.textstabilitaet.test.ts
// Der Verweisschritt setzt oder entfernt nur Tags: Zeichenfolge und Länge jedes Normtexts bleiben gleich.
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { gesetzNormen, normTextLaenge } from '@/lib/domain/gesetzDarstellungAuswertung';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { entferneBestehendeVerweise, taggeVerweise } from './verweisTagger';

const BGB = { kurztitel: 'BGB', normgeber: 'de-bund', langtitel: 'Bürgerliches Gesetzbuch' };

/** Text und Länge je Norm; zufällige Darstellungs-IDs bleiben außer Betracht. */
function normtexte(gesetz: GesetzDarstellung | null) {
  if (!gesetz) throw new Error('GesetzesXML nicht lesbar');
  return gesetzNormen(gesetz).map((n) => ({
    bezeichnung: n.bezeichnung,
    inhalt: JSON.stringify({ a: n.absaetze, z: n.zusatztexte }, (k, v: unknown) =>
      k === 'id' ? undefined : v,
    ),
    laenge: normTextLaenge(n),
  }));
}

function gesetzMitSatz(satz: string): string {
  return `<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>HGB</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)"><satz zahl="1">${satz}</satz></absatz></text></norm></inhalt></gesetz>`;
}

describe('taggeVerweise – Zeichenfolge um ein Zitat bleibt gleich', () => {
  it.each([
    ['einfach', 'Es gilt § 434 BGB entsprechend.', 31],
    ['Einrückung und Umbrüche', '\n    Es gilt\n      § 434 BGB\n    entsprechend.\n  ', 31],
    ['geschütztes Leerzeichen', 'Es gilt&#160;§ 434 BGB&#160;entsprechend.', 31],
    ['ausdrücklicher Umbruch', 'Es gilt<zeilenumbruch/>§ 434 BGB<zeilenumbruch/>entsprechend.', 31],
    ['Emoji', 'Es gilt 😀§ 434 BGB😀 entsprechend.', 35],
    ['bereits getaggt', 'Es gilt <verweis norm="§ 434">§ 434</verweis> BGB entsprechend.', 31],
  ])('%s', (_name, satz, laenge) => {
    const xml = gesetzMitSatz(satz);
    const getaggt = taggeVerweise(xml, { kurztitel: 'HGB', normgeber: 'de-bund' }, [BGB]);

    expect(getaggt).toMatch(/<verweis [^>]*norm="§ 434"/);
    const vorher = normtexte(parseGesetzesXML(xml));
    expect(vorher[0]?.laenge).toBe(laenge);
    expect(normtexte(parseGesetzesXML(getaggt))).toEqual(vorher);
  });
});

// Mitgelieferte GesetzesXML-Dateien (Wurzel <gesetz>) in den Ressourcen und Testdaten.
const quellordner = [
  new URL('../../../../src-tauri/resources/europa/', import.meta.url),
  new URL('../../../../docs/doku/testdaten/', import.meta.url),
];
const mitgelieferteGesetze = quellordner.flatMap((ordner) =>
  readdirSync(ordner)
    .filter((name) => name.endsWith('.xml'))
    .map((name) => ({ name, xml: readFileSync(new URL(name, ordner), 'utf8') }))
    .filter(({ xml }) => /^(<\?xml[^>]*\?>\s*)?<gesetz[\s>]/.test(xml)),
);

describe('Verweisschritt auf den mitgelieferten Gesetzen', () => {
  it('findet die mitgelieferten GesetzesXML-Dateien', () => {
    expect(mitgelieferteGesetze.map((g) => g.name).sort()).toEqual([
      'EMRK_europarat.xml',
      'mkh-gesetz.xml',
      'mkn-gesetz.xml',
    ]);
  });

  it.each(mitgelieferteGesetze)('verändert die Zeichenfolge je Norm nicht: $name', ({ xml }) => {
    const gesetz = parseGesetzesXML(xml);
    if (!gesetz) throw new Error('GesetzesXML nicht lesbar');
    const referenz = { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber };
    const vorher = normtexte(gesetz);

    expect(normtexte(parseGesetzesXML(entferneBestehendeVerweise(xml)))).toEqual(vorher);
    expect(normtexte(parseGesetzesXML(taggeVerweise(xml, referenz, [BGB])))).toEqual(vorher);
  });

  it('entfernt und setzt bei der EMRK tatsächlich Verweis-Tags', () => {
    const emrk = mitgelieferteGesetze.find((g) => g.name === 'EMRK_europarat.xml');
    if (!emrk) throw new Error('EMRK fehlt');
    const gesetz = parseGesetzesXML(emrk.xml);
    if (!gesetz) throw new Error('GesetzesXML nicht lesbar');
    const referenz = { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber };
    const ungetaggt = entferneBestehendeVerweise(emrk.xml);
    const verweisTags = (xml: string) => xml.match(/<verweis[\s>]/g)?.length ?? 0;

    expect(verweisTags(emrk.xml)).toBeGreaterThan(0);
    expect(verweisTags(ungetaggt)).toBe(0);
    expect(verweisTags(taggeVerweise(ungetaggt, referenz, [BGB]))).toBeGreaterThan(0);
  });
});
