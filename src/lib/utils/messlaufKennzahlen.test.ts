// messlaufKennzahlen.test.ts
// Verhaltenstests der Messlauf-Kennzahlen an durchgerechneten Beispielen.
import { expect, it } from 'vitest';
import {
  anteilUeberBildperiode,
  arbeitsfensterJeBild,
  bildzeitAufteilung,
  gesamthoehenDrift,
  hochrechnungVollmessung,
  korrekturKennzahlen,
  medianUndStreuung,
  neuaufbauKostenJeElement,
  restverschiebung,
  schaetzfehlerKennzahlen,
  schaetzfehlerUrsachen,
  textsprungKennzahlen,
  verteilung,
  werteMesslaufAus,
} from './messlaufKennzahlen';

it('Verteilung der Reihe 1 bis 20: Median 10,5, p95 und p99 nach Rangmethode 19 und 20', () => {
  const reihe = Array.from({ length: 20 }, (_, i) => 20 - i);
  expect(verteilung(reihe)).toEqual({
    anzahl: 20,
    mittel: 10.5,
    median: 10.5,
    p95: 19,
    p99: 20,
    maximum: 20,
  });
  expect(verteilung([3, 1, 2])).toMatchObject({ median: 2, p95: 3, p99: 3 });
});

it('Verteilung einer leeren Reihe ist überall 0', () => {
  expect(verteilung([])).toEqual({ anzahl: 0, mittel: 0, median: 0, p95: 0, p99: 0, maximum: 0 });
});

it('Anteil der Bilder über dem 1,5- und 3-Fachen der Bildperiode', () => {
  const bildzeiten = [16, 17, 25, 30, 50];
  expect(anteilUeberBildperiode(bildzeiten, 16, 1.5)).toBeCloseTo(0.6);
  expect(anteilUeberBildperiode(bildzeiten, 16, 3)).toBeCloseTo(0.2);
  expect(anteilUeberBildperiode([], 16, 1.5)).toBe(0);
});

it('Restverschiebung: Scrollschritt 30 px mit Bildschirmverschiebung −30 px ist 0, mit −27 px ist 3', () => {
  expect(restverschiebung({ scrollAenderung: 30, bildschirmVerschiebung: -30 })).toBe(0);
  expect(restverschiebung({ scrollAenderung: 30, bildschirmVerschiebung: -27 })).toBe(3);
});

it('Textsprung-Kennzahlen zählen Bilder über 1 px, größten Betrag und Betragssumme', () => {
  expect(
    textsprungKennzahlen([
      { scrollAenderung: 30, bildschirmVerschiebung: -30 },
      { scrollAenderung: 30, bildschirmVerschiebung: -27 },
      { scrollAenderung: 0, bildschirmVerschiebung: 2 },
      { scrollAenderung: 0, bildschirmVerschiebung: -0.5 },
    ]),
  ).toEqual({
    gueltigeVergleiche: 4,
    fehlendeVergleiche: 0,
    bilderUeber1px: 2,
    groesster: 3,
    summe: 5.5,
  });
});

it('Schätzfehler: Schätzung 100 und Messung 120 ergibt +20; Kennzahlen gesamt und nach Elementart', () => {
  const ergebnis = schaetzfehlerKennzahlen(
    [
      { art: 'norm', geschaetzt: 100, gemessen: 120 },
      { art: 'norm', geschaetzt: 100, gemessen: 90 },
      { art: 'ueberschrift', geschaetzt: 40, gemessen: 40 },
    ],
    15,
  );
  // Fehler +20, −10, 0: Mittel 10/3, Median 0, Streuung √(466,67/3) ≈ 12,47; über 15 px nur +20.
  expect(ergebnis.gesamt.anzahl).toBe(3);
  expect(ergebnis.gesamt.mittel).toBeCloseTo(10 / 3);
  expect(ergebnis.gesamt.median).toBe(0);
  expect(ergebnis.gesamt.streuung).toBeCloseTo(12.472, 3);
  expect(ergebnis.gesamt.anteilUeberZeile).toBeCloseTo(1 / 3);
  expect(ergebnis.nachArt.norm).toEqual({
    anzahl: 2,
    mittel: 5,
    median: 5,
    streuung: 15,
    anteilUeberZeile: 0.5,
  });
  expect(ergebnis.nachArt.ueberschrift).toEqual({
    anzahl: 1,
    mittel: 0,
    median: 0,
    streuung: 0,
    anteilUeberZeile: 0,
  });
});

it('Schätzfehler-Ursachen: Anteile exakt, Zeilenumbruch und sonstige; größte Abweichungen mit Element', () => {
  // Zeilenhöhe 24. Fehler 0 → exakt; +48 (2 Zeilen) und −25 (−1 Zeile, Rest 1 px) → Zeilenumbruch;
  // +1 und +10 → sonstige (fester Abstand, Rundung). Größte zwei nach Betrag: +48, dann −25.
  const paar = (elementId: string, gemessen: number) => ({
    elementId,
    xmlId: `x${elementId}`,
    bezeichnung: `§ ${elementId}`,
    art: 'norm',
    geschaetzt: 100,
    gemessen,
  });
  const ergebnis = schaetzfehlerUrsachen(
    [paar('a', 100), paar('b', 148), paar('c', 75), paar('d', 101), paar('e', 110)],
    24,
    2,
  );
  expect(ergebnis.anteile).toEqual({ exakt: 0.2, zeilenumbruch: 0.4, sonstige: 0.4 });
  expect(ergebnis.groesste).toEqual([
    {
      ...{ elementId: 'b', xmlId: 'xb', bezeichnung: '§ b', art: 'norm', geschaetzt: 100 },
      ...{ gemessen: 148, fehler: 48, zeilen: 2 },
    },
    {
      ...{ elementId: 'c', xmlId: 'xc', bezeichnung: '§ c', art: 'norm', geschaetzt: 100 },
      ...{ gemessen: 75, fehler: -25, zeilen: -25 / 24 },
    },
  ]);
  expect(schaetzfehlerUrsachen([], 24).anteile).toEqual({
    exakt: 0,
    zeilenumbruch: 0,
    sonstige: 0,
  });
});

it('Korrekturkennzahlen: Anzahl, Betragssumme und größter Betrag', () => {
  expect(korrekturKennzahlen([3, -5, 2])).toEqual({ anzahl: 3, summe: 10, groesste: 5 });
  expect(korrekturKennzahlen([])).toEqual({ anzahl: 0, summe: 0, groesste: 0 });
});

it('Gesamthöhen-Drift: Anfang, Ende und größte Änderung innerhalb einer Sekunde', () => {
  expect(
    gesamthoehenDrift([
      { zeitpunkt: 0, hoehe: 1000 },
      { zeitpunkt: 500, hoehe: 1100 },
      { zeitpunkt: 1500, hoehe: 1050 },
      { zeitpunkt: 1600, hoehe: 1400 },
    ]),
  ).toEqual({ anfang: 1000, ende: 1400, groessteAenderungJeSekunde: 350 });
  expect(gesamthoehenDrift([])).toEqual({ anfang: 0, ende: 0, groessteAenderungJeSekunde: 0 });
});

it('Hochrechnung der Vollmessung: Elementzahl mal Median der Neuaufbau-Kosten', () => {
  expect(hochrechnungVollmessung(2839, [0.4, 2, 0.5])).toBeCloseTo(1419.5);
});

it('Gesamtauswertung fasst die Rohdaten des Rekorders zusammen', () => {
  const kennzahlen = werteMesslaufAus(
    {
      hoehen: [{ art: 'norm', geschaetzt: 100, gemessen: 120 }],
      korrekturen: [{ betrag: 20, zeitpunkt: 5 }],
      gesamthoehen: [
        { zeitpunkt: 0, hoehe: 1000 },
        { zeitpunkt: 5, hoehe: 1020 },
      ],
      aufrufe: { getItemKey: 7, estimateSize: 3 },
    },
    { zeilenhoehe: 25.6 },
  );
  expect(kennzahlen.schaetzfehler.gesamt.mittel).toBe(20);
  expect(kennzahlen.schaetzfehlerUrsachen.anteile.sonstige).toBe(1);
  expect(kennzahlen.korrekturen).toEqual({ anzahl: 1, summe: 20, groesste: 20 });
  expect(kennzahlen.gesamthoehe.groessteAenderungJeSekunde).toBe(20);
  expect(kennzahlen.aufrufe).toEqual({ getItemKey: 7, estimateSize: 3 });
});

it('Gesamtauswertung ergänzt Bildzeit, Textsprung und Hochrechnung aus den Bildreihen', () => {
  const kennzahlen = werteMesslaufAus(
    { hoehen: [], korrekturen: [], gesamthoehen: [], aufrufe: { getItemKey: 0, estimateSize: 0 } },
    { zeilenhoehe: 25.6 },
    {
      bildperiodeMs: 16,
      bildzeitenMs: [16, 17, 25, 30, 50],
      bildverschiebungen: [{ scrollAenderung: 30, bildschirmVerschiebung: -27 }],
      neuaufbauKostenMs: [0.4, 2, 0.5],
      arbeitszeitenMs: [1, 4, 2],
      aufteilung: {
        reactRenderMs: [1, 3, 2],
        uebrigeBisCommitMs: [0, 1, 0],
        nachCommitMs: [9, 5, 7],
      },
      elementzahl: 2839,
    },
  );
  expect(kennzahlen.bildzeitAufteilungMs).toMatchObject({
    reactRender: { median: 2, p95: 3 },
    uebrigeBisCommit: { median: 0, p95: 1 },
    nachCommit: { median: 7, p95: 9 },
  });
  expect(kennzahlen.arbeitszeitMs).toMatchObject({ median: 2, p95: 4, maximum: 4 });
  expect(kennzahlen.bildzeitMs).toMatchObject({ median: 25, anteilUeber1_5: 0.6 });
  expect(kennzahlen.bildzeitMs?.anteilUeber3).toBeCloseTo(0.2);
  expect(kennzahlen.textsprung).toEqual({
    gueltigeVergleiche: 1,
    fehlendeVergleiche: 0,
    bilderUeber1px: 1,
    groesster: 3,
    summe: 3,
  });
  expect(kennzahlen.neuaufbauKostenMs?.hochrechnungVollmessung).toBeCloseTo(1419.5);
});

it('Median und Streuung über Wiederholungen: Reihe 1 bis 4 ergibt 2,5 und √1,25', () => {
  const ergebnis = medianUndStreuung([4, 1, 3, 2]);
  expect(ergebnis.median).toBe(2.5);
  expect(ergebnis.streuung).toBeCloseTo(Math.sqrt(1.25));
  expect(medianUndStreuung([])).toEqual({ median: 0, streuung: 0 });
});

it('Arbeitsfenster je Bild: erstes Scrollereignis eines Bildes bis zum Ende des folgenden Commits im selben Bild', () => {
  // Bildgrenzen 0, 16, 32, 48. Bild 1: Scroll 10 und 12, Commits 5 (davor, zählt nicht), 11, 14
  // → 10 bis 11. Bild 2: Scroll 26, Commit 30 → 26 bis 30. Bild 3: Scroll 40 ohne Commit bis 48
  // → kein Fenster. Scroll 50 nach der letzten Grenze ist kein vollständiges Bild.
  expect(arbeitsfensterJeBild([10, 12, 26, 40, 50], [5, 11, 14, 30, 49], [0, 16, 32, 48])).toEqual([
    { beginn: 10, ende: 11, bildEnde: 16 },
    { beginn: 26, ende: 30, bildEnde: 32 },
  ]);
  expect(arbeitsfensterJeBild([], [1], [0, 16])).toEqual([]);
});

it('Neuaufbau-Kosten je neu erscheinendem Element: Arbeitszeit bis zur letzten Erstmessung des Bildes über der Grundlast, geteilt durch die neuen Elemente', () => {
  // Zwei Fenster ohne neue Elemente mit je 1 ms: Grundlast 1 ms (Median). Bild 3: Commit bei 35,
  // Erstmessungen danach im selben Bild bei 36, 38, 39 (beim Scrollen misst die Bibliothek erst
  // über den ResizeObserver nach dem Commit) → Arbeit 32 bis 39 = 7 ms, (7 − 1) / 3 = 2 ms je
  // Element. Bild 4: Messungen 50 und 52 vor dem Commit bei 57 → 9 ms, (9 − 1) / 2 = 4 ms.
  // Messung 70 liegt in keinem Bild mit Arbeitsfenster.
  const fenster = [
    { beginn: 0, ende: 1, bildEnde: 16 },
    { beginn: 16, ende: 17, bildEnde: 32 },
    { beginn: 32, ende: 35, bildEnde: 48 },
    { beginn: 48, ende: 57, bildEnde: 64 },
  ];
  expect(neuaufbauKostenJeElement(fenster, [36, 38, 39, 50, 52, 70])).toEqual([2, 2, 2, 4, 4]);
  // Ohne Fenster ohne neue Elemente ist die Grundlast 0; nie negativ.
  expect(neuaufbauKostenJeElement([{ beginn: 0, ende: 2, bildEnde: 16 }], [1, 1])).toEqual([1, 1]);
  expect(hochrechnungVollmessung(1000, [2, 2, 2, 4, 4])).toBe(2000);
});

it('Bildzeit-Aufteilung je Arbeitsfenster: React-Renderzeit der Commits im Fenster, übrige Zeit bis Commit-Ende und Zeit nach dem Commit bis Bildende', () => {
  // Fenster 1: 10 bis 14, Bildende 16; Render-Commits bei 12 (1,5 ms) und 14 (0,5 ms) → Render 2,
  // übrig 4 − 2 = 2, nach dem Commit 16 − 14 = 2. Commit bei 5 liegt vor dem Fenster. Fenster 2:
  // 20 bis 30, Bildende 48, kein Render → Render 0, übrig 10, nach dem Commit 18.
  const fenster = [
    { beginn: 10, ende: 14, bildEnde: 16 },
    { beginn: 20, ende: 30, bildEnde: 48 },
  ];
  const renders = [
    { commitZeit: 5, dauerMs: 3 },
    { commitZeit: 12, dauerMs: 1.5 },
    { commitZeit: 14, dauerMs: 0.5 },
  ];
  expect(bildzeitAufteilung(fenster, renders)).toEqual({
    reactRenderMs: [2, 0],
    uebrigeBisCommitMs: [2, 10],
    nachCommitMs: [2, 18],
  });
  // Messrauschen: Renderzeit über der Arbeitszeit ergibt keinen negativen Rest.
  expect(
    bildzeitAufteilung([{ beginn: 0, ende: 1, bildEnde: 16 }], [{ commitZeit: 1, dauerMs: 2 }])
      .uebrigeBisCommitMs,
  ).toEqual([0]);
});
