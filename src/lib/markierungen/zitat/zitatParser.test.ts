// zitatParser.test.ts
//
// Tests für zitatParser.ts (kolokiert, Vitest). Deckt die reine
// Text-Grammatik ab (zitatParser kennt keine geladenen Gesetze – die
// eigentliche Auflösung von AmbiguerPunkt gegen eine GesetzDarstellung
// übernimmt der Aufrufer, siehe VerweismarkierungFenster.tsx/
// normStrukturPruefung.ts, und wird hier bewusst NICHT mitgetestet).
//
// Verwendet direkt it()/expect() (Vitest) wie alle übrigen Testdateien im
// Projekt – keine projektspezifischen pruefe/gleich-Wrapper (siehe
// Projekt-Konvention).

import { it, expect } from 'vitest';
import { parseZitat, type AmbiguerPunkt, type RohNormZitat } from './zitatParser';

it('Profilwahl folgt dem Gesetzesabschnitt auch genau am Beginn der nächsten Canon-Norm', () => {
  const text = '§ 5 BGB; can. 6 CIC';
  const anfragen: Array<{ gesetzRoh?: string; textStart: number }> = [];
  const { zitate } = parseZitat(text, (kontext) => {
    anfragen.push(kontext);
    return kontext.gesetzRoh === 'CIC' ? 'canon' : 'paragraph';
  });
  expect(anfragen).toContainEqual(expect.objectContaining({ gesetzRoh: 'CIC', textStart: 9 }));
  expect(zitate.map((z) => [z.normzahlRoh, z.gesetzRoh, z.praefix])).toEqual([
    ['5', 'BGB', ['§']],
    ['6', 'CIC', ['Can.']],
  ]);
});

it('Normen ohne Symbol erhalten auch bei verankerten Kandidaten kein Präfixfeld', () => {
  const { zitate, ambiguitaeten } = parseZitat('5 Abs. 1, 2 BGB');
  expect(zitate.map((z) => z.normzahlRoh)).toEqual(['5', '2']);
  expect(ambiguitaeten).toHaveLength(1);
  expect(zitate.map((z) => Object.hasOwn(z, 'praefix'))).toEqual([false, false]);
});

/** Kompakte Kurzform je Zitat für lesbarere Testerwartungen. */
function kurz(z: RohNormZitat) {
  return { norm: z.normzahlRoh, anzeige: z.anzeigeText, ohneZiel: !!z.ohneZiel };
}

/** Kompakte Kurzform je Ambiguität. */
function kurzAmb(a: AmbiguerPunkt) {
  return { index: a.index, vorheriger: a.vorherigerIndex, art: a.art, wert: a.wert };
}

// ---------------------------------------------------------------------------
// Grundfälle: §/§§/Art./Artt., Kommagrenzen ohne Zusatzinfo
// ---------------------------------------------------------------------------

it('§ Singular verhält sich wie Art. Singular: jeder Komma-Kandidat mehrdeutig (nicht mehr automatische Fortsetzung)', () => {
  const { zitate, ambiguitaeten } = parseZitat('§ 280 Abs. 1, 3, 281');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['280', '3', '281']);
  expect(ambiguitaeten.map(kurzAmb), 'ambiguitaeten').toEqual([
    { index: 1, vorheriger: 0, art: 'absatz', wert: '3' },
    { index: 2, vorheriger: 0, art: 'absatz', wert: '281' },
  ]);
});

it('Bare Zahl ohne Zusatzinfo nach Komma: immer neue Norm', () => {
  const { zitate } = parseZitat('§ 280, 281');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'normzahlRoh',
  ).toEqual(['280', '281']);
  expect([zitate[0]!.textStart, zitate[0]!.textEnde], 'span erste Norm (inkl. ", ")').toEqual([
    0, 7,
  ]);
  expect([zitate[1]!.textStart, zitate[1]!.textEnde], 'span zweite Norm').toEqual([7, 10]);
});

// ---------------------------------------------------------------------------
// §§/Artt. Plural: nur das letzte verbleibende Element ist ohne Prüfung sicher
// ---------------------------------------------------------------------------

it('§§ Abs. 1, 2 (nur ein Kandidat): sicher, keine Ambiguität', () => {
  const { zitate, ambiguitaeten } = parseZitat('§§ 280 Abs. 1, 2');
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '280', anzeige: '§§ 280', ohneZiel: false },
    { norm: '2', anzeige: '2', ohneZiel: false },
  ]);
  expect(ambiguitaeten, 'ambiguitaeten').toEqual([]);
});

it('§§ Abs. 1, 3, 281 (weiterer Kandidat folgt): "3" mehrdeutig, "281" sicher', () => {
  const { zitate, ambiguitaeten } = parseZitat('§§ 280 Abs. 1, 3, 281');
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '280', anzeige: '§§ 280', ohneZiel: false },
    { norm: '3', anzeige: '3', ohneZiel: false },
    { norm: '281', anzeige: '281', ohneZiel: false },
  ]);
  expect(ambiguitaeten.map(kurzAmb), 'ambiguitaeten').toEqual([
    { index: 1, vorheriger: 0, art: 'absatz', wert: '3' },
  ]);
});

it('§§ Abs. 1, 3, 5, 281: sowohl "3" als auch "5" gegen denselben Anker (280) geprüft', () => {
  const { zitate, ambiguitaeten } = parseZitat('§§ 280 Abs. 1, 3, 5, 281');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['280', '3', '5', '281']);
  expect(ambiguitaeten.map(kurzAmb), 'ambiguitaeten').toEqual([
    { index: 1, vorheriger: 0, art: 'absatz', wert: '3' },
    { index: 2, vorheriger: 0, art: 'absatz', wert: '5' },
  ]);
});

// ---------------------------------------------------------------------------
// Art. Singular bzw. kein Symbol: immer mehrdeutig (kein "letztes = sicher")
// ---------------------------------------------------------------------------

it('Art. Singular: jeder Komma-Kandidat mehrdeutig', () => {
  const { ambiguitaeten } = parseZitat('Art. 1 Abs. 1, 2');
  expect(ambiguitaeten.map(kurzAmb), 'ambiguitaeten').toEqual([
    { index: 1, vorheriger: 0, art: 'absatz', wert: '2' },
  ]);
});

it('Kein Symbol: verhält sich wie Art. Singular (nicht wie § Singular)', () => {
  const { zitate, ambiguitaeten } = parseZitat('280 Abs. 1, 3, 281');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['280', '3', '281']);
  expect(ambiguitaeten.map(kurzAmb), 'ambiguitaeten').toEqual([
    { index: 1, vorheriger: 0, art: 'absatz', wert: '3' },
    { index: 2, vorheriger: 0, art: 'absatz', wert: '281' },
  ]);
});

it('Kein Symbol ohne Komma-Fortsetzung: einfache Norm, keine Ambiguität', () => {
  const { zitate, ambiguitaeten } = parseZitat('1 GG');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '1', anzeige: '1', ohneZiel: false }]);
  expect(ambiguitaeten, 'ambiguitaeten').toEqual([]);
});

// ---------------------------------------------------------------------------
// Alt/Hs (Zahl < 3 Fortsetzung, sonst neu) vs. Var/Gr (Zahl < 10 Fortsetzung, sonst neu)
// ---------------------------------------------------------------------------

it('Alt: Zahl < 3 Fortsetzung (Alternativen sind praktisch nie > 2), Zahl >= 3 neue Norm', () => {
  expect(
    parseZitat('§ 280 Alt. 1, 2').zitate.map((z) => z.normzahlRoh),
    'Alt < 3',
  ).toEqual(['280']);
  expect(
    parseZitat('§ 280 Alt. 1, 3').zitate.map((z) => z.normzahlRoh),
    'Alt >= 3',
  ).toEqual(['280', '3']);
});

it('Hs verhält sich wie Alt (Schwelle 3, nicht wie Var/Gr mit Schwelle 10)', () => {
  expect(
    parseZitat('§ 280 Hs. 1, 2').zitate.map((z) => z.normzahlRoh),
    'Hs < 3',
  ).toEqual(['280']);
  expect(
    parseZitat('§ 280 Hs. 1, 3').zitate.map((z) => z.normzahlRoh),
    'Hs >= 3',
  ).toEqual(['280', '3']);
});

it('Var: Zahl < 10 Fortsetzung, Zahl >= 10 neue Norm', () => {
  expect(
    parseZitat('§ 280 Var. 1, 3').zitate.map((z) => z.normzahlRoh),
    'Var < 10',
  ).toEqual(['280']);
  expect(
    parseZitat('§ 280 Var. 1, 12').zitate.map((z) => z.normzahlRoh),
    'Var >= 10',
  ).toEqual(['280', '12']);
});

it('Gr verhält sich wie Var (nicht wie Alt/Hs)', () => {
  expect(
    parseZitat('§ 280 Gr. 1, 3').zitate.map((z) => z.normzahlRoh),
    'Gr < 10',
  ).toEqual(['280']);
  expect(
    parseZitat('§ 280 Gr. 1, 12').zitate.map((z) => z.normzahlRoh),
    'Gr >= 10',
  ).toEqual(['280', '12']);
});

// ---------------------------------------------------------------------------
// Römische Zahlen als Absatz-Kurzform
// ---------------------------------------------------------------------------

it('Römische Zahl direkt nach Normzahl: als Absatz erkannt, keine eigene Norm', () => {
  const { zitate } = parseZitat('§ 280 I');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '280', anzeige: '§ 280', ohneZiel: false }]);
  expect([zitate[0]!.textStart, zitate[0]!.textEnde], 'span (voller Text inkl. "I")').toEqual([
    0, 7,
  ]);
});

it('§§ 280 I, III, 281: römische Fortsetzung wie Dezimalzahl behandelt (mehrdeutig)', () => {
  const { zitate, ambiguitaeten } = parseZitat('§§ 280 I, III, 281');
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '280', anzeige: '§§ 280', ohneZiel: false },
    { norm: '3', anzeige: 'III', ohneZiel: false }, // Anzeige bleibt Original-Schreibweise
    { norm: '281', anzeige: '281', ohneZiel: false },
  ]);
  expect(ambiguitaeten.map(kurzAmb), 'ambiguitaeten').toEqual([
    { index: 1, vorheriger: 0, art: 'absatz', wert: '3' }, // Prüfung gegen Dezimalwert
  ]);
});

it('Ungültige römische Zahl (IIII) wird nicht als Absatz erkannt', () => {
  const { zitate } = parseZitat('§ 280, IIII');
  // "IIII" ist kein gültiges römisches Zahlwort -> fällt auf normale
  // Wort-Klassifizierung zurück (hier: unbekanntes Wort, keine Auswirkung
  // auf die Normerkennung).
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['280']);
});

it('Kurztitel-Kollision (SGB IV) bleibt unverändert – kein Absatz, "IV" gehört zum mehrteiligen Kurztitel', () => {
  const { zitate } = parseZitat('§ 40 SGB IV');
  expect(zitate.length, 'zitate.length').toEqual(1);
  expect(zitate[0]!.normzahlRoh, 'normzahlRoh').toEqual('40');
  expect(zitate[0]!.gesetzRoh, 'gesetzRoh').toEqual('SGB IV');
});

// ---------------------------------------------------------------------------
// Zusatzinfo ohne Anker -> Verweis OHNE Ziel (nicht: keine Norm / bogus Norm)
// ---------------------------------------------------------------------------

it('Alleinstehendes "Abs. 3": ein Zitat ohne Ziel, keine Norm erfunden', () => {
  const { zitate } = parseZitat('Abs. 3');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '', anzeige: '', ohneZiel: true }]);
  expect([zitate[0]!.textStart, zitate[0]!.textEnde], 'span').toEqual([0, 6]);
});

it('Alleinstehende römische Zahl "III": ebenfalls ohneZiel', () => {
  const { zitate } = parseZitat('III');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '', anzeige: '', ohneZiel: true }]);
});

it('Alleinstehendes "S. 2": ebenfalls ohneZiel (nicht nur Abs betroffen)', () => {
  const { zitate } = parseZitat('S. 2');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '', anzeige: '', ohneZiel: true }]);
});

it('"§ 280; Abs. 3": echte Norm + separates ohneZiel-Zitat, lückenlos', () => {
  const text = '§ 280; Abs. 3';
  const { zitate } = parseZitat(text);
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '280', anzeige: '§ 280', ohneZiel: false },
    { norm: '', anzeige: '', ohneZiel: true },
  ]);
  // Lückenlose Kachelung: jedes Zeichen von text gehört zu genau einem Zitat.
  expect(zitate[0]!.textStart, 'erster Start').toEqual(0);
  expect(zitate[zitate.length - 1]!.textEnde, 'letztes Ende').toEqual(text.length);
  for (let i = 1; i < zitate.length; i++) {
    expect(zitate[i]!.textStart, `Übergang ${i - 1}->${i}`).toEqual(zitate[i - 1]!.textEnde);
  }
});

it('"Abs. 3 § 280": führendes ohneZiel-Zitat, danach echte Norm, lückenlos', () => {
  const text = 'Abs. 3 § 280';
  const { zitate } = parseZitat(text);
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '', anzeige: '', ohneZiel: true },
    { norm: '280', anzeige: '§ 280', ohneZiel: false },
  ]);
  expect(zitate[0]!.textStart, 'erster Start').toEqual(0);
  expect(zitate[zitate.length - 1]!.textEnde, 'letztes Ende').toEqual(text.length);
  expect(zitate[1]!.textStart, 'Übergang 0->1').toEqual(zitate[0]!.textEnde);
});

it('"§ 280 Abs. 1; Abs. 3; § 281": ohneZiel-Zitat mittendrin, lückenlos', () => {
  const text = '§ 280 Abs. 1; Abs. 3; § 281';
  const { zitate } = parseZitat(text);
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '280', anzeige: '§ 280', ohneZiel: false },
    { norm: '', anzeige: '', ohneZiel: true },
    { norm: '281', anzeige: '§ 281', ohneZiel: false },
  ]);
  expect(zitate[0]!.textStart, 'erster Start').toEqual(0);
  expect(zitate[zitate.length - 1]!.textEnde, 'letztes Ende').toEqual(text.length);
  for (let i = 1; i < zitate.length; i++) {
    expect(zitate[i]!.textStart, `Übergang ${i - 1}->${i}`).toEqual(zitate[i - 1]!.textEnde);
  }
});

it('Komma innerhalb eines ohneZiel-Zitats erzeugt keine neue Norm', () => {
  const { zitate } = parseZitat('Abs. 3, 4');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '', anzeige: '', ohneZiel: true }]);
});

// ---------------------------------------------------------------------------
// Regressionstest: normaler Fall bleibt unverändert
// ---------------------------------------------------------------------------

it('Regression: "§ 280 Abs. 3" unverändert eine einzelne Norm', () => {
  const text = '§ 280 Abs. 3';
  const { zitate, ambiguitaeten } = parseZitat(text);
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '280', anzeige: '§ 280', ohneZiel: false }]);
  expect([zitate[0]!.textStart, zitate[0]!.textEnde], 'span (voller Text inkl. "Abs. 3")').toEqual([
    0,
    text.length,
  ]);
  expect(ambiguitaeten, 'ambiguitaeten').toEqual([]);
});

// ---------------------------------------------------------------------------
// "analog"/"vgl"/"sh"/"siehe": textlich immer Teil der DANACH kommenden
// Norm (nie der davor kommenden), außer wenn direkt ein Komma folgt
// ---------------------------------------------------------------------------

it('"vgl" ganz am Textanfang: Teil der (einzigen) folgenden Norm, nicht verschluckt', () => {
  const text = 'vgl § 280';
  const { zitate } = parseZitat(text);
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['280']);
  expect([zitate[0]!.textStart, zitate[0]!.textEnde], 'span (inkl. führendem "vgl")').toEqual([
    0,
    text.length,
  ]);
});

it('"siehe"/"sh" verhalten sich wie "vgl" (ganze SONSTIGE_WOERTER-Gruppe)', () => {
  expect(parseZitat('siehe § 280').zitate[0]!.textStart, 'siehe: span-Start').toEqual(0);
  expect(parseZitat('sh § 280').zitate[0]!.textStart, 'sh: span-Start').toEqual(0);
});

it('"§ 241, analog § 280": "analog" gehört zur NACHFOLGENDEN Norm (280), nicht zu 241', () => {
  const text = '§ 241, analog § 280';
  const { zitate } = parseZitat(text);
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['241', '280']);
  expect(text.slice(zitate[0]!.textStart, zitate[0]!.textEnde), 'Norm 241 OHNE "analog"').toEqual(
    '§ 241, ',
  );
  expect(text.slice(zitate[1]!.textStart, zitate[1]!.textEnde), 'Norm 280 MIT "analog"').toEqual(
    'analog § 280',
  );
});

// ---------------------------------------------------------------------------
// "Artikel" (ausgeschrieben) verhält sich wie "Art." (Singular, keine
// Pluralerkennung) – inkl. Eröffnung einer neuen Norm nach Komma
// ---------------------------------------------------------------------------

it('"Artikel 434": wie "Art. 434" erkannt, nicht als Kurztitel-Rest verschluckt', () => {
  const text = 'Artikel 434';
  const { zitate } = parseZitat(text);
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '434', anzeige: 'Artikel 434', ohneZiel: false },
  ]);
  expect([zitate[0]!.textStart, zitate[0]!.textEnde], 'span (inkl. "Artikel")').toEqual([
    0,
    text.length,
  ]);
});

it('"§ 280 Abs 1, Artikel 2": "Artikel" eröffnet wie "Art."/"§" eine neue Norm', () => {
  const { zitate, ambiguitaeten } = parseZitat('§ 280 Abs 1, Artikel 2');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['280', '2']);
  expect(
    ambiguitaeten,
    'ambiguitaeten (Artikel eröffnet direkt, keine Komma-Mehrdeutigkeit)',
  ).toEqual([]);
});

// ---------------------------------------------------------------------------
// Hierarchischer Kontext (AmbiguerPunkt.absatzKontext/satzKontext/
// nummerKontext) für die spätere Existenzprüfung durch den Aufrufer – siehe
// Kopfkommentar: die eigentliche Prüfung GEGEN eine GesetzDarstellung
// bleibt bewusst außerhalb dieser Datei (normStrukturPruefung.ts).
// ---------------------------------------------------------------------------

/** Kompakte Kurzform je Ambiguität inkl. hierarchischem Kontext. */
function kurzAmbKontext(a: AmbiguerPunkt) {
  return {
    art: a.art,
    wert: a.wert,
    absatz: a.absatzKontext,
    satz: a.satzKontext,
    nummer: a.nummerKontext,
  };
}

it('Reine Absatz-Mehrdeutigkeit: kein tieferer Kontext nötig/gesetzt', () => {
  const { ambiguitaeten } = parseZitat('Art 6 Abs 1, 2');
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'absatz', wert: '2', absatz: undefined, satz: undefined, nummer: undefined },
  ]);
});

it('"Nr"-Mehrdeutigkeit OHNE vorherigen Absatz: kein Kontext (normweite Prüfung durch Aufrufer)', () => {
  const { ambiguitaeten } = parseZitat('434 Nr 1, 4');
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'nummer', wert: '4', absatz: undefined, satz: undefined, nummer: undefined },
  ]);
});

it('"434 III 2 Nr 1, 4": Satz-Kurzform ("III 2" = Abs. 3 S. 2) liefert Absatz- UND Satz-Kontext für "Nr"', () => {
  const { zitate, ambiguitaeten } = parseZitat('434 III 2 Nr 1, 4');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['434', '4']);
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'nummer', wert: '4', absatz: '3', satz: '2', nummer: undefined },
  ]);
});

it('"434 I 2 Nr 1, 4": Satz-Kurzform funktioniert für jeden Absatz, nicht nur III', () => {
  const { ambiguitaeten } = parseZitat('434 I 2 Nr 1, 4');
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'nummer', wert: '4', absatz: '1', satz: '2', nummer: undefined },
  ]);
});

it('"§ 3 Abs 3 S 2 Nr 1, 4": ausgeschriebene Form ("Abs"/"S") liefert denselben Kontext wie die Kurzform', () => {
  const { ambiguitaeten } = parseZitat('§ 3 Abs 3 S 2 Nr 1, 4');
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'nummer', wert: '4', absatz: '3', satz: '2', nummer: undefined },
  ]);
});

it('"§ 3 Abs 3 2 Nr 1, 4": Satz-Kurzform auch nach ausgeschriebenem "Abs" (nicht nur nach römischer Zahl)', () => {
  const { ambiguitaeten } = parseZitat('§ 3 Abs 3 2 Nr 1, 4');
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'nummer', wert: '4', absatz: '3', satz: '2', nummer: undefined },
  ]);
});

it('"Satz"-Mehrdeutigkeit bekommt nur Absatz-Kontext (kein Satz-Kontext für sich selbst)', () => {
  const { ambiguitaeten } = parseZitat('§ 3 Abs 3 S 1, 2');
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'satz', wert: '2', absatz: '3', satz: undefined, nummer: undefined },
  ]);
});

// ---------------------------------------------------------------------------
// Litera-Buchstaben (a, b, i, ii, ...): eigene Token-Art 'buchstabe' – nie
// Kurztitel-Kandidat, nie existenzgeprüft (anders als Zahlen kann ein
// Buchstabe nie eine eigenständige neue Norm sein)
// ---------------------------------------------------------------------------

it('"434 lit i, ii, 433": i/ii als Litera erkannt (nicht als Kurztitel), 433 bleibt eigene Norm', () => {
  const { zitate, ambiguitaeten } = parseZitat('434 lit i, ii, 433');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate (kein gesetzRoh, "i"/"ii" wurden NICHT als Kurztitel-Wort verschluckt)',
  ).toEqual([
    { norm: '434', gesetz: undefined },
    { norm: '433', gesetz: undefined },
  ]);
  expect(
    ambiguitaeten.map(kurzAmb),
    'ambiguitaeten (nur "433" wird geprüft, "i"/"ii" werden nie existenzgeprüft)',
  ).toEqual([{ index: 1, vorheriger: 0, art: 'litera', wert: '433' }]);
});

it('"434 lit a, b, 433": einzelne Kleinbuchstaben verhalten sich wie i/ii', () => {
  const { zitate } = parseZitat('434 lit a, b, 433');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['434', '433']);
});

it('"434 lit a" (kein Komma): einzelner Litera-Wert direkt nach "lit" wird konsumiert, keine eigene Norm', () => {
  const { zitate } = parseZitat('434 lit a');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '434', anzeige: '434', ohneZiel: false }]);
});

it('Einzelner/verdoppelter Kleinbuchstabe wird NIE zum Kurztitel, auch ohne vorangehendes "lit"', () => {
  const { zitate } = parseZitat('434, a');
  // "a" hat hier keine erkennbare Rolle (kein "lit" davor) und wird schlicht
  // ignoriert – insbesondere NICHT als Gesetz-Kurztitel für "434" übernommen.
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([{ norm: '434', gesetz: undefined }]);
});

it('"§ 5 lit. aa" (kein Komma): verdoppelter Litera-Buchstabe wird wie ein einzelner konsumiert', () => {
  const { zitate } = parseZitat('§ 5 lit. aa');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '5', anzeige: '§ 5', ohneZiel: false }]);
});

it('"§ 5 lit. aa, bb": Komma-Fortsetzung mit verdoppelten Litera-Buchstaben bleibt eine Norm', () => {
  const { zitate } = parseZitat('§ 5 lit. aa, bb');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '5', anzeige: '§ 5', ohneZiel: false }]);
});

// ---------------------------------------------------------------------------
// Ausgeschriebene Zusatzwörter: Ziff/Ziffer/Ziffern (Synonym für Nr/Nummer)
// sowie Nummer/Absatz/Satz/Variante/Halbsatz/Alternative/Gruppe allgemein
// ---------------------------------------------------------------------------

it('"Ziff"/"Ziffer"/"Ziffern" werden wie "Nr"/"Nummer" erkannt (kein Kurztitel-Wort)', () => {
  for (const text of ['434 II Ziff 1', '434 II Ziffer 1', '434 II Ziffern 1', '434 II Nummer 1']) {
    const { zitate } = parseZitat(text);
    expect(zitate.map(kurz), text).toEqual([{ norm: '434', anzeige: '434', ohneZiel: false }]);
  }
});

// ---------------------------------------------------------------------------
// "n. Alt"/"n. Var"/"n. Gr"/"n. Hs": Ordnungszahl VOR Alt/Var/Gr/Hs gehört
// zur Zusatzangabe, ist kein zweites Binnenparagraph-Token und kein eigener
// Existenz-Kandidat – gilt sowohl direkt (auch nach einem führenden Symbol),
// als auch nach einem Komma, als auch OHNE jede vorangehende Norm
// ---------------------------------------------------------------------------

it('"812 1. Alt"/"1. Var"/"1. Gr": Ordnungszahl wird nicht in normzahlRoh übernommen', () => {
  for (const text of ['812 1. Alt', '812 1. Var', '812 1. Gr']) {
    expect(
      parseZitat(text).zitate.map((z) => z.normzahlRoh),
      text,
    ).toEqual(['812']);
  }
});

it('"§ 812 1. Alt"/"Art. 229 1. Alt": dieselbe Regel auch DIREKT nach führendem Symbol+Zahl (Bugfix – Symbol-Zweig hatte den Guard zunächst nicht)', () => {
  expect(parseZitat('§ 812 1. Alt').zitate.map(kurz), '§ 812 1. Alt').toEqual([
    { norm: '812', anzeige: '§ 812', ohneZiel: false },
  ]);
  expect(parseZitat('Art. 229 1. Alt').zitate.map(kurz), 'Art. 229 1. Alt').toEqual([
    { norm: '229', anzeige: 'Art. 229', ohneZiel: false },
  ]);
});

it('"1. Alt"/"1. Hs" GANZ OHNE vorangehende Norm: reine Zusatzinfo (ohneZiel), NICHT Verweis auf Norm "1"', () => {
  expect(parseZitat('1. Alt').zitate.map(kurz), '1. Alt').toEqual([
    { norm: '', anzeige: '', ohneZiel: true },
  ]);
  expect(parseZitat('1. Hs').zitate.map(kurz), '1. Hs').toEqual([
    { norm: '', anzeige: '', ohneZiel: true },
  ]);
});

it('"§ 823 1. Hs., 2. Hs.": "Hs" verhält sich wie Alt/Var/Gr (im ersten Anlauf vergessen, s. Bugfix)', () => {
  const { zitate } = parseZitat('§ 823 1. Hs., 2. Hs.');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '823', anzeige: '§ 823', ohneZiel: false }]);
});

it('"Art. 229 § 2, 1. Alt": explizites "Art. N § M"-Binnenparagraph-Format bleibt von alldem unberührt', () => {
  const { zitate } = parseZitat('Art. 229 § 2, 1. Alt');
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '229 2', anzeige: 'Art. 229 § 2', ohneZiel: false },
  ]);
});

it('"434 I 1, 9. Var": dieselbe Regel auch nach einem Komma (nicht als Satz-9-Existenzkandidat geprüft)', () => {
  const { zitate, ambiguitaeten } = parseZitat('434 I 1, 9. Var');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate (kein eigenständiges "9")',
  ).toEqual(['434']);
  expect(ambiguitaeten, 'ambiguitaeten (keine Existenzprüfung für die "9")').toEqual([]);
});

it('"434 I 1, 2. Alt": Regression – funktioniert wie "9. Var" auch bei kleinen Zahlen', () => {
  expect(
    parseZitat('434 I 1, 2. Alt').zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['434']);
});

// ---------------------------------------------------------------------------
// Token.warOrdnungszahl: nur eine Zahl mit UNMITTELBAR folgendem Punkt im
// Quelltext ("6.") ist eine Ordnungszahl vor Alt/Var/Gr/Hs – eine Zahl OHNE
// Punkt ("6") ist immer eine eigenständige Zahl (neue Norm nach Komma bzw.
// zweiter Binnenparagraph-Teil direkt nach Symbol+Zahl), selbst wenn direkt
// danach ein Alt/Var/Gr/Hs-Wort folgt. Ohne dieses Unterscheidungsmerkmal
// (Bugfix) waren "6 Var. 1" und "6. Var" auf Tokenebene nicht unterscheidbar.
// ---------------------------------------------------------------------------

it('"§ 5, 6 Var. 1": Zahl OHNE Punkt nach Komma ist eine eigene neue Norm, nicht die Ordnungszahl von "Var"', () => {
  const { zitate } = parseZitat('§ 5, 6 Var. 1');
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '5', anzeige: '§ 5', ohneZiel: false },
    { norm: '6', anzeige: '6', ohneZiel: false },
  ]);
});

it('"Art. 229 6 Var. 1": Zahl OHNE Punkt direkt nach Symbol+Zahl bleibt zweiter Binnenparagraph-Teil, nicht die Ordnungszahl von "Var"', () => {
  const { zitate } = parseZitat('Art. 229 6 Var. 1');
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '229 6', anzeige: 'Art. 229 6', ohneZiel: false },
  ]);
});

it('"9. Var" (mit Punkt) bleibt weiterhin korrekt als Ordnungszahl erkannt – keine Regression durch warOrdnungszahl', () => {
  expect(parseZitat('9. Var').zitate.map(kurz), 'zitate').toEqual([
    { norm: '', anzeige: '', ohneZiel: true },
  ]);
});

// ---------------------------------------------------------------------------
// Alphanumerische Listen-Nummern ("1a", "1b", ...): der Kleinbuchstabe direkt
// nach einer Zahl OHNE Leerzeichen gehört zur Zahl selbst (übliche
// Schreibweise für Unterpunkte, z.B. § 312 Abs. 1a BGB, § 204 Abs. 1 Nr. 1a
// BGB) – NICHT der separate Litera-Mechanismus. Ohne den Bugfix ging der
// Buchstabe verloren bzw. wurde eine Komma-Fortsetzung gegen die FALSCHE
// (Buchstaben-lose) Zahl geprüft.
// ---------------------------------------------------------------------------

it('"§ 5 Nr. 1a" (kein Komma): alphanumerischer Wert wird intern konsumiert, keine eigene Norm/Ambiguität', () => {
  const { zitate, ambiguitaeten } = parseZitat('§ 5 Nr. 1a');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '5', anzeige: '§ 5', ohneZiel: false }]);
  expect(ambiguitaeten, 'ambiguitaeten').toEqual([]);
});

it('"§ 5 Nr. 1a, 1b": Komma-Fortsetzung prüft korrekt gegen "1b" (nicht mehr gegen die bloße Zahl "1")', () => {
  const { zitate, ambiguitaeten } = parseZitat('§ 5 Nr. 1a, 1b');
  expect(zitate.map(kurz), 'zitate').toEqual([
    { norm: '5', anzeige: '§ 5', ohneZiel: false },
    { norm: '1b', anzeige: '1b', ohneZiel: false },
  ]);
  expect(ambiguitaeten.map(kurzAmb), 'ambiguitaeten').toEqual([
    { index: 1, vorheriger: 0, art: 'nummer', wert: '1b' },
  ]);
});

// ---------------------------------------------------------------------------
// "f."/"ff." ("und folgende"): treffen zufällig auf denselben Mechanismus wie
// einzelne/verdoppelte Litera-Buchstaben (LITERA_BUCHSTABE_MUSTER matcht
// "f"/"ff" ebenso wie "a"/"aa") und werden dadurch wirkungslos verschluckt –
// KEINE echte Bereichs-Semantik ("und folgende Normen" wird NICHT verlinkt),
// aber auch keine Störung der Grunderkennung. Bewusst dokumentiertes
// Verhalten, kein Bugfix (RohNormZitat kennt ohnehin kein Bereichs-Konzept).
// ---------------------------------------------------------------------------

it('"§ 5 f."/"§ 5 ff.": werden wirkungslos verschluckt (wie ein Litera-Buchstabe), stören aber die Normerkennung nicht', () => {
  expect(parseZitat('§ 5 f.').zitate.map(kurz), '§ 5 f.').toEqual([
    { norm: '5', anzeige: '§ 5', ohneZiel: false },
  ]);
  expect(parseZitat('§ 5 ff.').zitate.map(kurz), '§ 5 ff.').toEqual([
    { norm: '5', anzeige: '§ 5', ohneZiel: false },
  ]);
});

it('"§§ 5 ff., 20 BGB": "ff." verhindert weder die Komma-Fortsetzung noch die Gesetz-Zuordnung', () => {
  const { zitate } = parseZitat('§§ 5 ff., 20 BGB');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([
    { norm: '5', gesetz: 'BGB' },
    { norm: '20', gesetz: 'BGB' },
  ]);
});

// ---------------------------------------------------------------------------
// Ausgeschriebene vs. Kurzform-Zusatzinfo nach Komma: bewusst inkonsistentes,
// vom Nutzer bestätigt GEWOLLTES Verhalten (kein Bugfix!) – die Kurzform
// ("Abs. 1, 2") ist unklar genug, um eine Existenzprüfung zu rechtfertigen;
// bei der ausgeschriebenen Form ("Abs. 1, Abs. 2") stellt sich die Frage gar
// nicht erst, es wird daher keine Ambiguität erzeugt.
// ---------------------------------------------------------------------------

it('"§ 280 Abs. 1, Abs. 2": ausgeschriebene Wiederholung erzeugt bewusst KEINE Ambiguität (anders als die Kurzform)', () => {
  const { zitate, ambiguitaeten } = parseZitat('§ 280 Abs. 1, Abs. 2');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '280', anzeige: '§ 280', ohneZiel: false }]);
  expect(ambiguitaeten, 'ambiguitaeten').toEqual([]);
});

// ---------------------------------------------------------------------------
// Alt/Hs mit weiterem Kandidaten im Plural-Cluster (§§ ..., n, m): dieselbe
// Schwelle-3-Regel wie im Singular
// ---------------------------------------------------------------------------

it('"§§ 280 Alt. 1, 2, 320": "2" bleibt Alternative (< 3), "320" eigene Norm', () => {
  expect(
    parseZitat('§§ 280 Alt. 1, 2, 320').zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['280', '320']);
});

it('"§§ 280 Alt. 1, 3, 320": "3" ist bereits eigene Norm (>= 3), "320" ebenfalls', () => {
  expect(
    parseZitat('§§ 280 Alt. 1, 3, 320').zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['280', '3', '320']);
});

// ---------------------------------------------------------------------------
// Verfeinerungskette: präzisiert eine Abs/S/Nr/lit-Angabe DIREKT nach dem
// Komma-Kandidaten diesen selbst (statt den Anker), muss der Kandidat SELBST
// diese Kette enthalten – strukturell unmögliche Ketten (z.B. Absatz direkt
// nach Absatz, da Absätze keine Absätze haben) werden schon beim Parsen
// erkannt und erzeugen gar keine Ambiguität mehr (kein Datenzugriff nötig).
// Die eigentliche Existenzprüfung EINER gültigen Kette erfolgt außerhalb
// dieser Datei (siehe Kopfkommentar) – hier wird nur geprüft, dass die Kette
// korrekt eingesammelt bzw. eine ungültige korrekt verworfen wird.
// ---------------------------------------------------------------------------

it('"434 Abs 1, 2 Abs 3": Absatz nach Absatz ist strukturell unmöglich -> "2" sofort neue Norm, keine Ambiguität', () => {
  const { zitate, ambiguitaeten } = parseZitat('434 Abs 1, 2 Abs 3');
  expect(
    zitate.map((z) => z.normzahlRoh),
    'zitate',
  ).toEqual(['434', '2']);
  expect(
    ambiguitaeten,
    'ambiguitaeten (keine Prüfung nötig, Ergebnis steht strukturell schon fest)',
  ).toEqual([]);
});

it('"434 Abs 1, 2 S 1 Nr 1 lit a": gültige, echt tiefere Kette wird korrekt eingesammelt', () => {
  const { ambiguitaeten } = parseZitat('434 Abs 1, 2 S 1 Nr 1 lit a');
  expect(
    ambiguitaeten.map((a) => ({ art: a.art, wert: a.wert, verfeinerung: a.verfeinerung })),
    'ambiguitaeten',
  ).toEqual([
    {
      art: 'absatz',
      wert: '2',
      verfeinerung: [
        { art: 'satz', wert: '1' },
        { art: 'nummer', wert: '1' },
        { art: 'litera', wert: 'a' },
      ],
    },
  ]);
});

// ---------------------------------------------------------------------------
// Gesetz-Kurztitel-Warteliste: wird bei JEDEM neuen §/§§/Art./Artt.-Symbol
// zurückgesetzt (nicht mehr nur bei ";"), damit ein wiederholtes Symbol eine
// neue, unabhängige Gesetzesprüfung eröffnet
// ---------------------------------------------------------------------------

it('"§ 3, § 4 ZPO": wiederholtes "§" eröffnet neue Gesetzesprüfung, ZPO gilt NUR für § 4', () => {
  const { zitate } = parseZitat('§ 3, § 4 ZPO');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([
    { norm: '3', gesetz: undefined },
    { norm: '4', gesetz: 'ZPO' },
  ]);
});

it('"§§ 3, 4 ZPO": Regression – reine Komma-Fortsetzung ohne erneutes Symbol bleibt in derselben Gruppe', () => {
  const { zitate } = parseZitat('§§ 3, 4 ZPO');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([
    { norm: '3', gesetz: 'ZPO' },
    { norm: '4', gesetz: 'ZPO' },
  ]);
});

it('"§ 3 BGB, § 4 ZPO": Regression – bereits zugeordnetes Kurztitel bleibt unberührt', () => {
  const { zitate } = parseZitat('§ 3 BGB, § 4 ZPO');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([
    { norm: '3', gesetz: 'BGB' },
    { norm: '4', gesetz: 'ZPO' },
  ]);
});

// ---------------------------------------------------------------------------
// UAbs/Unterabsatz: eigene ZusatzArt zwischen Absatz und Satz (siehe
// AbsatzDarstellung.unterabsaetze in gesetzTypes.ts, zitierfähig als
// "Art. 6 Abs. 1 UAbs. 2 Satz 1", bisher v.a. EU-Recht). Die eigentliche
// hierarchische Existenzprüfung (Absatz -> UAbs -> Satz/Nr/lit) erfolgt
// außerhalb dieser Datei (normStrukturPruefung.ts) – hier wird nur geprüft,
// dass die Grenzerkennung sowie der an den Aufrufer durchgereichte
// unterabsatzKontext korrekt sind.
// ---------------------------------------------------------------------------

/** Kompakte Kurzform je Ambiguität inkl. Unterabsatz-Kontext. */
function kurzAmbUAbsKontext(a: AmbiguerPunkt) {
  return {
    art: a.art,
    wert: a.wert,
    absatz: a.absatzKontext,
    unterabsatz: a.unterabsatzKontext,
    satz: a.satzKontext,
  };
}

it('"Art. 6 Abs. 1 UAbs. 2 Satz 1 EUV": UAbs. wird wie Abs/Satz als Zusatzinfo konsumiert, keine eigene Norm', () => {
  const text = 'Art. 6 Abs. 1 UAbs. 2 Satz 1 EUV';
  const { zitate, ambiguitaeten } = parseZitat(text);
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([{ norm: '6', gesetz: 'EUV' }]);
  expect([zitate[0]!.textStart, zitate[0]!.textEnde], 'span (voller Text)').toEqual([
    0,
    text.length,
  ]);
  expect(ambiguitaeten, 'ambiguitaeten').toEqual([]);
});

it('"Art. 1 Unterabsatz 3 AEUV": ausgeschriebene Form wird wie "UAbs." erkannt', () => {
  const { zitate } = parseZitat('Art. 1 Unterabsatz 3 AEUV');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([{ norm: '1', gesetz: 'AEUV' }]);
});

it('"Art. 1 UAbs. 1, 2 AEUV": Komma-Kandidat nach UAbs (Art. Singular) ist mehrdeutig wie bei Abs/Satz/Nr/lit', () => {
  const { ambiguitaeten } = parseZitat('Art. 1 UAbs. 1, 2 AEUV');
  expect(ambiguitaeten.map(kurzAmb), 'ambiguitaeten').toEqual([
    { index: 1, vorheriger: 0, art: 'unterabsatz', wert: '2' },
  ]);
});

it('"Art. 1 Abs. 1 UAbs. 1 Satz 1, 2 AEUV": Komma-Fortsetzung nach Satz führt sowohl Absatz- als auch Unterabsatz-Kontext mit', () => {
  const { ambiguitaeten } = parseZitat('Art. 1 Abs. 1 UAbs. 1 Satz 1, 2 AEUV');
  expect(ambiguitaeten.map(kurzAmbUAbsKontext), 'ambiguitaeten').toEqual([
    { art: 'satz', wert: '2', absatz: '1', unterabsatz: '1', satz: undefined },
  ]);
});

it('Alleinstehendes "UAbs. 2" ohne Anker: Verweis ohne Ziel, wie bei Abs/Satz', () => {
  const { zitate } = parseZitat('UAbs. 2');
  expect(zitate.map(kurz), 'zitate').toEqual([{ norm: '', anzeige: '', ohneZiel: true }]);
});

// ---------------------------------------------------------------------------
// Mehrteilige Kurztitel (z.B. "SGB 2", "SGB XIV"): jedes DIREKT folgende
// Wort- oder Zahl-Token ohne andere Tokenart dazwischen gehört noch zum
// Kurztitel (siehe Absprache) – "und" ist dafür explizit als Trennwort
// aufgenommen worden (SONSTIGE_WOERTER im Tokenizer).
// ---------------------------------------------------------------------------

it('"1 SGB 2": arabische Buchnummer wird vollständig als Kurztitel übernommen (vorheriger Bug: nur "SGB")', () => {
  const { zitate } = parseZitat('1 SGB 2');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([{ norm: '1', gesetz: 'SGB 2' }]);
});

it('"1 SGB XIV": römische Buchnummer wird ebenfalls vollständig übernommen', () => {
  const { zitate } = parseZitat('1 SGB XIV');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([{ norm: '1', gesetz: 'SGB XIV' }]);
});

it('"§ 1 BGB und § 2 ZPO": "und" beendet die Kurztitel-Kette, verschluckt NICHT das zweite Zitat', () => {
  const { zitate } = parseZitat('§ 1 BGB und § 2 ZPO');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([
    { norm: '1', gesetz: 'BGB' },
    { norm: '2', gesetz: 'ZPO' },
  ]);
});

it('Regression: "280 BGB" (einteiliger Kurztitel) bleibt unverändert', () => {
  expect(
    parseZitat('280 BGB').zitate.map((z) => z.gesetzRoh),
    'gesetzRoh',
  ).toEqual(['BGB']);
});

it('Regression: "434, 90 ZVG" – Kurztitel gilt weiterhin für mehrere kommagetrennte Normen', () => {
  expect(
    parseZitat('434, 90 ZVG').zitate.map((z) => z.gesetzRoh),
    'gesetzRoh',
  ).toEqual(['ZVG', 'ZVG']);
});

it('Regression: "§ 280 Abs. 1 BGB analog" – "analog" NACH dem Kurztitel wird weiterhin nicht angehängt', () => {
  expect(
    parseZitat('§ 280 Abs. 1 BGB analog').zitate.map((z) => z.gesetzRoh),
    'gesetzRoh',
  ).toEqual(['BGB']);
});

it('Bugfix: "1 Abs 1 GG, 3, 5" – "3"/"5" sind eigenständige neue Normen OHNE Gesetzangabe, nicht mehr Absatz-Kandidaten von "1 GG"', () => {
  const { zitate, ambiguitaeten } = parseZitat('1 Abs 1 GG, 3, 5');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh })),
    'zitate',
  ).toEqual([
    { norm: '1', gesetz: 'GG' },
    { norm: '3', gesetz: undefined },
    { norm: '5', gesetz: undefined },
  ]);
  expect(ambiguitaeten, 'keine Mehrdeutigkeiten mehr für "3"/"5"').toEqual([]);
});

// ---------------------------------------------------------------------------
// Schrägstrich als Komma-Äquivalent (Mutation-Testing-Fund: verarbeiteToken
// prüft `tok.art === 'komma' || tok.art === 'schraegstrich'` – der
// Schrägstrich-Zweig war bisher durch keinen Test über parseZitat erreicht).
// ---------------------------------------------------------------------------

it('"§ 280 Abs. 1/2": Schrägstrich verhält sich wie Komma (mehrdeutiger Absatz-Kandidat)', () => {
  const kommaVariante = parseZitat('§ 280 Abs. 1, 2');
  const schraegstrichVariante = parseZitat('§ 280 Abs. 1/2');
  expect(
    schraegstrichVariante.zitate.map((z) => z.normzahlRoh),
    'normzahlRoh',
  ).toEqual(kommaVariante.zitate.map((z) => z.normzahlRoh));
  expect(
    schraegstrichVariante.ambiguitaeten.map((a) => ({ art: a.art, wert: a.wert })),
    'ambiguitaeten',
  ).toEqual([{ art: 'absatz', wert: '2' }]);
});

// ---------------------------------------------------------------------------
// Kontext-Reset zwischen Normen (Mutation-Testing-Fund: setzeKontextZurueck
// wird beim Öffnen einer neuen Norm/eines Zitats für ein ganzes Gesetz aufgerufen,
// damit aktiverAbsatzWert/aktiverSatzWert/... NICHT von der vorherigen Norm
// in die Mehrdeutigkeits-Prüfung der neuen Norm durchsickern. Bisher gab es
// keinen Test, der Kontext einer Norm setzt, dann eine ZWEITE Norm öffnet
// und danach die Mehrdeutigkeits-Prüfung der zweiten Norm beobachtet.)
// ---------------------------------------------------------------------------

it('Kontext-Reset bei neuer Norm: Absatz/Satz der ERSTEN Norm dürfen NICHT in die Mehrdeutigkeits-Prüfung der ZWEITEN Norm durchsickern', () => {
  // "434 III 2" setzt aktiverAbsatzWert='3'/aktiverSatzWert='2' (satzOhneWort-
  // Kurzform). "§ 6 Nr 1, 2" öffnet danach eine komplett neue Norm; ohne
  // Kontext-Reset würde die Mehrdeutigkeits-Prüfung für "2" fälschlich
  // absatz:'3'/satz:'2' von der ERSTEN Norm übernehmen.
  const { ambiguitaeten } = parseZitat('434 III 2, § 6 Nr 1, 2');
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'nummer', wert: '2', absatz: undefined, satz: undefined, nummer: undefined },
  ]);
});

it('Kontext-Reset gilt auch beim Öffnen eines Zitats für ein ganzes Gesetz (Gesetz-Kürzel ohne Normzahl)', () => {
  // "434 III 2" setzt wieder Absatz/Satz-Kontext. "BGB" verbraucht den noch
  // offenen Kurztitel-Slot von Norm 434. "ZPO" ist danach ein eigenständiges
  // Verweis auf ein ganzes Gesetz (das vorherige Fenster ist geschlossen) – dessen
  // eigener Kontext-Reset darf nicht fehlen, sonst sickert der Absatz/Satz-
  // Kontext von Norm 434 in die nachfolgende "Nr 1, 2"-Mehrdeutigkeitsprüfung.
  const { zitate, ambiguitaeten } = parseZitat('434 III 2, BGB, ZPO Nr 1, 2');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh, ganzesGesetz: z.ganzesGesetz })),
    'zitate',
  ).toEqual([
    { norm: '434', gesetz: 'BGB', ganzesGesetz: undefined },
    { norm: '', gesetz: 'ZPO', ganzesGesetz: true },
    { norm: '2', gesetz: undefined, ganzesGesetz: undefined },
  ]);
  expect(ambiguitaeten.map(kurzAmbKontext), 'ambiguitaeten').toEqual([
    { art: 'nummer', wert: '2', absatz: undefined, satz: undefined, nummer: undefined },
  ]);
});

// ---------------------------------------------------------------------------
// Mehrdeutige (verankerte) Kandidaten gehören zum offenen Gesetzesabschnitt.
// ---------------------------------------------------------------------------

it('Offener Gesetzesabschnitt nach mehrdeutigem Kandidaten: ein folgendes Gesetz-Kürzel erzeugt KEIN drittes, falsches Zitat für ein ganzes Gesetz', () => {
  const { zitate, ambiguitaeten } = parseZitat('Art. 1 Abs. 1, 2 AEUV');
  expect(
    zitate.map((z) => ({ norm: z.normzahlRoh, gesetz: z.gesetzRoh, ganzesGesetz: z.ganzesGesetz })),
    'zitate',
  ).toEqual([
    { norm: '1', gesetz: 'AEUV', ganzesGesetz: undefined },
    { norm: '2', gesetz: 'AEUV', ganzesGesetz: undefined },
  ]);
  expect(ambiguitaeten.length, 'genau eine Mehrdeutigkeit, kein drittes Zitat').toBe(1);
});

// ---------------------------------------------------------------------------
// gesetzRoh: Property "kein Gesetz zugeordnet" muss ein FEHLENDES Property
// sein, nicht ein Property mit Wert undefined (Mutation-Testing-Fund: die
// bisherigen gesetzRoh-Prüfungen lasen alle über Property-Zugriff
// (z.gesetzRoh) und konnten `{gesetzRoh: undefined}` daher nicht von einem
// fehlenden Property unterscheiden – toEqual behandelt beides gleich).
// ---------------------------------------------------------------------------

it('gesetzRoh ist bei neueNorm ein FEHLENDES Property, nicht `gesetzRoh: undefined`, wenn kein Gesetz im Fenster liegt', () => {
  const { zitate } = parseZitat('§ 280 Abs. 1');
  expect(Object.prototype.hasOwnProperty.call(zitate[0]!, 'gesetzRoh')).toBe(false);
});

it('gesetzRoh ist bei einem mehrdeutigen (verankerten) Kandidaten ein FEHLENDES Property, wenn kein Gesetz im Fenster liegt', () => {
  const { zitate } = parseZitat('Art. 1 UAbs. 1, 2');
  expect(Object.prototype.hasOwnProperty.call(zitate[1]!, 'gesetzRoh')).toBe(false);
});

it('gesetzRoh wird bei einem mehrdeutigen (verankerten) Kandidaten im offenen Gesetzesabschnitt korrekt zugeordnet, wenn einer vorhanden ist', () => {
  const { zitate } = parseZitat('Art. 1 UAbs. 1, 2 AEUV');
  expect(zitate[1]!.gesetzRoh, 'gesetzRoh des mehrdeutigen Kandidaten').toBe('AEUV');
});

it('erhält kanonische Einzelpräfixe in expliziten Zahlenketten', () => {
  expect(parseZitat('§§ 5, 7').zitate.map((z) => z.praefix)).toEqual([['§'], ['§']]);
  expect(parseZitat('Artt. 5, 7').zitate.map((z) => z.praefix)).toEqual([['Art.'], ['Art.']]);
  expect(parseZitat('Art. 229 § 6 EGBGB').zitate[0]!.praefix).toEqual(['Art.', '§']);
  expect(parseZitat('Art. 229 6 EGBGB').zitate[0]!.praefix).toEqual(['Art.']);
  expect(parseZitat('5, 7').zitate.map((z) => z.praefix)).toEqual([undefined, undefined]);
  expect(parseZitat('§ 5; 7').zitate.map((z) => z.praefix)).toEqual([['§'], undefined]);
});

it('führt bei expliziten Binnenparagraphen nur deren Einzelpräfix fort, ohne Artikelzahl-Fortgeltung', () => {
  const zitate = parseZitat('Art. 229 § 6, 7 EGBGB').zitate;
  expect(zitate.map((z) => z.normzahlRoh)).toEqual(['229 6', '7']);
  expect(zitate.map((z) => z.praefix)).toEqual([['Art.', '§'], ['§']]);
  expect(parseZitat('Art. 229 6, 7 EGBGB').zitate.map((z) => z.praefix)).toEqual([
    ['Art.'],
    undefined,
  ]);
});

it.each(['2278 § 1', '2278, § 1', 'can. 2278 § 1', 'canon 2278', 'c.2278', 'Kan. 2278'])(
  'Canon-Profil: %s bleibt eine Norm',
  (text) => {
    const { zitate } = parseZitat(text, () => 'canon');
    expect(zitate.map((z) => z.normzahlRoh)).toEqual(['2278']);
    expect(zitate[0]!.praefix).toEqual(/^\d/.test(text) ? undefined : ['Can.']);
  },
);

it('Canon-Zielkontext endet am Gesetzeskürzel', () => {
  const { zitate } = parseZitat('Can. 9 CIC, § 5 BGB', (z) =>
    z.gesetzRoh === 'CIC' ? 'canon' : undefined,
  );
  expect(zitate.map((z) => [z.normzahlRoh, z.gesetzRoh, z.praefix])).toEqual([
    ['9', 'CIC', ['Can.']],
    ['5', 'BGB', ['§']],
  ]);
});

it.each(['Can. 9 CIC, 5', '§ 9 BGB, 5', 'Art. 9 GG, 5'])(
  'Gesetzesangabe beendet die Präfixfortgeltung: %s',
  (text) => {
    const { zitate } = parseZitat(text, (z) => (z.gesetzRoh === 'CIC' ? 'canon' : undefined));
    expect(zitate).toHaveLength(2);
    expect(zitate[1]).toMatchObject({ normzahlRoh: '5' });
    expect(zitate[1]!.praefix).toBeUndefined();
    expect(zitate[1]!.gesetzRoh).toBeUndefined();
  },
);

it('Canon-Ketten behalten Präfixe und Zusatzangaben', () => {
  const { zitate, ambiguitaeten } = parseZitat(
    'Canons 2265, § 2, 2275, n. 3, and 2283',
    () => 'canon',
  );
  expect(zitate.map((z) => z.normzahlRoh)).toEqual(['2265', '2275', '2283']);
  expect(zitate.map((z) => z.praefix)).toEqual([['Can.'], ['Can.'], ['Can.']]);
  expect(ambiguitaeten.map((a) => a.art)).toEqual(['absatz']);
});

it.each(['paragraph', 'artikel', undefined] as const)(
  'Profil %s erhält bestehende Grammatik',
  (profil) => {
    expect(parseZitat('2278 § 1', () => profil)).toEqual(parseZitat('2278 § 1'));
    expect(parseZitat('can. 2278 § 1', () => profil)).toEqual(parseZitat('can. 2278 § 1'));
  },
);

it.each(['can.', 'canon', 'c.', 'Kan.', 'Kanon', 'cann.', 'canons', 'canones', 'cc.', 'Kanones'])(
  'Canon-Alias %s und Zahlenkette',
  (alias) => {
    expect(
      parseZitat(`${alias} 5, 7`, () => 'canon').zitate.map((z) => [z.normzahlRoh, z.praefix]),
    ).toEqual([
      ['5', ['Can.']],
      ['7', ['Can.']],
    ]);
  },
);

it.each(['can. 2278 § 1 CIC', '2278 § 1 CIC', '2278, § 1 CIC'])(
  'nachgestelltes Canon-Ziel: %s',
  (text) => {
    const zitate = parseZitat(text, (z) => (z.gesetzRoh === 'CIC' ? 'canon' : undefined)).zitate;
    expect(zitate.map((z) => [z.normzahlRoh, z.gesetzRoh])).toEqual([['2278', 'CIC']]);
  },
);

it('Nicht-Canon-Ziel erhält keine Grammatik des Ausgangsgesetzes', () => {
  expect(
    parseZitat('9 § 2 BGB', (z) => (z.gesetzRoh ? undefined : 'canon')).zitate.map(
      (z) => z.normzahlRoh,
    ),
  ).toEqual(['9', '2']);
});

it.each(['Can. 9; § 5', 'Can. 9 CIC, § 5', 'Can. 9 Art. 5', 'Can. 9 § 2, § 5'])(
  'Canon-Absatzanker endet lokal: %s',
  (text) => {
    expect(parseZitat(text, () => 'canon').zitate).toHaveLength(2);
  },
);

it('und ist wie and und et eine Komma-Fortsetzung', () => {
  const parse = (wort: string) => parseZitat(`Canons 5, § 1, 7, n. 3, ${wort} 9`, () => 'canon');
  expect(parse('and').zitate.map((z) => z.normzahlRoh)).toEqual(['5', '7', '9']);
  expect(parse('et').ambiguitaeten).toEqual(parse('und').ambiguitaeten);
});

it.each(['C. 1', 'CC. 1, 2', 'CAN. 1', 'CANN. 1, 2'])(
  'Canon-Aliase ignorieren Groß-/Kleinschreibung auch vor römischer Erkennung: %s',
  (text) => {
    const zitate = parseZitat(text, () => 'canon').zitate;
    expect(zitate.map((z) => z.normzahlRoh)).toEqual(text.includes(',') ? ['1', '2'] : ['1']);
    expect(zitate.map((z) => z.praefix)).toEqual(zitate.map(() => ['Can.']));
  },
);

it.each([
  ['§ 5 § 6', ['§ 5', '§ 6'], [undefined, undefined]],
  ['§§ 5 § 6', ['§§ 5', '§ 6'], [undefined, undefined]],
  ['§ 5 § 6 BGB', ['§ 5', '§ 6'], [undefined, 'BGB']],
  ['Art. 5 Art. 6 GG', ['Art. 5', 'Art. 6'], [undefined, 'GG']],
])('getrennte Symbolnormen in %s behalten eigene Gesetzesabschnitte', (text, anzeigen, gesetze) => {
  const { zitate } = parseZitat(text);
  expect(zitate.map((zitat) => zitat.normzahlRoh)).toEqual(['5', '6']);
  expect(zitate.map((zitat) => zitat.anzeigeText)).toEqual(anzeigen);
  expect(zitate.map((zitat) => zitat.gesetzRoh)).toEqual(gesetze);
  expect(zitate[0]!.textStart).toBe(0);
  expect(zitate[0]!.textEnde).toBe(zitate[1]!.textStart);
  expect(zitate[1]!.textEnde).toBe(text.length);
});

it('zeigt den expliziten Binnenparagraphen unter dem Gliederungsartikel an', () => {
  const { zitate } = parseZitat('Art. 229 § 2 EGBGB');
  expect(zitate).toHaveLength(1);
  expect(zitate[0]).toMatchObject({
    normzahlRoh: '229 2',
    anzeigeText: 'Art. 229 § 2',
    praefix: ['Art.', '§'],
    gesetzRoh: 'EGBGB',
    textStart: 0,
    textEnde: 18,
  });
});

it.each(['§ § 90', '§§ § 90', '§ § § 90', '§§§ 90', '§ § 90 BGB', '§§ § 90 BGB'])(
  'wiederholte Paragraphensymbole ohne erste Zahl in %s bezeichnen einen normalen Paragraphen',
  (text) => {
    const { zitate, ambiguitaeten } = parseZitat(text);
    expect(zitate).toHaveLength(1);
    expect(zitate[0]).toMatchObject({
      normzahlRoh: '90',
      anzeigeText: '§ 90',
      praefix: ['§'],
      textStart: 0,
      textEnde: text.length,
    });
    expect(zitate[0]!.gesetzRoh).toBe(text.endsWith('BGB') ? 'BGB' : undefined);
    expect(ambiguitaeten).toEqual([]);
  },
);

it.each(['§, § 90', '§; § 90', '§ / § 90'])(
  'führt Paragraphensymbole über den Trenner in %s nicht zusammen',
  (text) => {
    const { zitate } = parseZitat(text);
    expect(zitate.map((zitat) => zitat.normzahlRoh)).toEqual(['', '90']);
    expect(zitate.map((zitat) => zitat.anzeigeText)).toEqual(['§', '§ 90']);
    expect(zitate[0]!.textEnde).toBe(zitate[1]!.textStart);
    expect(zitate[1]!.textEnde).toBe(text.length);
  },
);

it('lässt wiederholte Paragraphensymbole ohne abschließende Zahl unverändert', () => {
  const { zitate } = parseZitat('§ §');
  expect(zitate.map(kurz)).toEqual([
    { norm: '', anzeige: '§', ohneZiel: false },
    { norm: '', anzeige: '§', ohneZiel: false },
  ]);
});

it.each(['5aa', '5ab', '1bb', '5f'])(
  'erhält die vollständige Normnummer %s und den Originalbereich',
  (nummer) => {
    const text = `§ ${nummer} BGB`;
    const { zitate } = parseZitat(text);
    expect(zitate).toHaveLength(1);
    expect(zitate[0]).toMatchObject({
      normzahlRoh: nummer,
      gesetzRoh: 'BGB',
      textStart: 0,
      textEnde: text.length,
    });
  },
);

it.each(['1abc', '5bis', '5aBGB'])(
  'erhält bei %s das vollständige Wort als Kurztitel-Kandidat',
  (nummer) => {
    const { zitate } = parseZitat(`§ ${nummer} BGB`);
    expect(zitate).toHaveLength(1);
    expect(zitate[0]).toMatchObject({
      normzahlRoh: nummer[0],
      gesetzRoh: `${nummer.slice(1)} BGB`,
    });
  },
);

it('erhält 5ff als Folgeangabe statt Normsuffix', () => {
  const { zitate } = parseZitat('§ 5ff BGB');
  expect(zitate).toHaveLength(1);
  expect(zitate[0]).toMatchObject({ normzahlRoh: '5', gesetzRoh: 'BGB' });
});

it('liest zweibuchstabige Zusatznummern und Verfeinerungsketten vollständig', () => {
  const { zitate, ambiguitaeten } = parseZitat('§ 5 Abs. 1ab, 2ab Nr. 3ab lit. a BGB');
  expect(zitate.map((z) => z.normzahlRoh)).toEqual(['5', '2ab']);
  expect(ambiguitaeten).toMatchObject([
    {
      art: 'absatz',
      wert: '2ab',
      verfeinerung: [
        { art: 'nummer', wert: '3ab' },
        { art: 'litera', wert: 'a' },
      ],
    },
  ]);
});
