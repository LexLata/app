// messlaufKennzahlen.ts
// Reine Auswertung der Messlauf-Rohdaten (ohne DOM); einzige Quelle der Verteilungskennzahlen
// für Messlauf Stufe 1 und Stufe 2.
//
// Begriffe (Plan „Scrollen in langen Gesetzen“, Grundlagen):
// - Textsprung: Der gelesene Text verschiebt sich sichtbar, ohne dass weitergescrollt wird.
//   Gemessen als Restverschiebung je Bild: Bildschirmverschiebung eines Referenzelements plus
//   Änderung der Scrollposition (beim reinen Scrollen genau 0).
// - Stocken: Die Scrollbewegung läuft ungleichmäßig, weil Bilder zu spät fertig werden
//   (Bildzeiten über einem Vielfachen der Bildperiode).
// - Höhenschätzung: angenommene Höhe eines noch nicht gemessenen Elements; Gegenstück: gemessene
//   Höhe. Schätzfehler = gemessene minus geschätzte Höhe.
// - Höhenkorrektur: vom Programm geschriebene Änderung der Scrollposition, wenn ein Element
//   oberhalb des Sichtbereichs seine Höhe ändert.
// - Vormessung: Messen aller Höhen vor dem Hinscrollen; hier nur hochgerechnet.
// - Messlauf: Messung von Stocken und Textsprüngen in Zahlen; Stufe 1 in Vitest ohne Layout,
//   Stufe 2 im Entwicklungsbetrieb der App.

export interface Hoehenpaar {
  /** Nur zur Diagnose (größte Schätzfehler); fehlt in Stufe 1. Die Element-ID wird beim Parsen
   * zufällig erzeugt; im XML auffindbar machen erst XML-ID und Bezeichnung. */
  readonly elementId?: string;
  readonly xmlId?: string;
  /** Normbezeichnung bzw. gekürzter Überschriftentext. */
  readonly bezeichnung?: string;
  readonly art: string;
  readonly geschaetzt: number;
  readonly gemessen: number;
}

export interface MesslaufRohdaten {
  readonly hoehen: readonly Hoehenpaar[];
  readonly korrekturen: readonly { betrag: number; zeitpunkt: number }[];
  readonly gesamthoehen: readonly { zeitpunkt: number; hoehe: number }[];
  readonly aufrufe: { readonly getItemKey: number; readonly estimateSize: number };
}

export interface Bildverschiebung {
  readonly scrollAenderung: number;
  readonly bildschirmVerschiebung: number;
}

/** Median: Mittel der beiden mittleren Werte bei gerader Anzahl. p95/p99: Rangmethode
 * (nearest rank), also der Wert an Rang ⌈p·n⌉ der aufsteigend sortierten Reihe. */
export function verteilung(werte: readonly number[]) {
  if (werte.length === 0) return { anzahl: 0, mittel: 0, median: 0, p95: 0, p99: 0, maximum: 0 };
  const s = [...werte].sort((a, b) => a - b);
  const an = (i: number) => s.at(i) ?? Number.NaN;
  const rang = (p: number) => an(Math.ceil(s.length * p) - 1);
  return {
    anzahl: s.length,
    mittel: summe(s) / s.length,
    median: median(s),
    p95: rang(0.95),
    p99: rang(0.99),
    maximum: an(-1),
  };
}

/** Anteil der Bildzeiten über dem k-Fachen der Bildperiode. */
export function anteilUeberBildperiode(
  bildzeitenMs: readonly number[],
  bildperiodeMs: number,
  faktor: number,
) {
  if (bildzeitenMs.length === 0) return 0;
  return bildzeitenMs.filter((zeit) => zeit > faktor * bildperiodeMs).length / bildzeitenMs.length;
}

export function restverschiebung({ scrollAenderung, bildschirmVerschiebung }: Bildverschiebung) {
  return bildschirmVerschiebung + scrollAenderung;
}

/** Gültige und fehlende Vergleiche sowie Sprungbeträge; ohne gültigen Vergleich sind
 * Sprungkennzahlen nicht messbar (null), statt einen sprungfreien Lauf vorzutäuschen. */
export function textsprungKennzahlen(bilder: readonly Bildverschiebung[], fehlendeVergleiche = 0) {
  const reste = bilder.map((bild) => Math.abs(restverschiebung(bild)));
  return {
    gueltigeVergleiche: bilder.length,
    fehlendeVergleiche,
    bilderUeber1px: reste.length ? reste.filter((rest) => rest > 1).length : null,
    groesster: reste.length ? Math.max(...reste) : null,
    summe: reste.length ? summe(reste) : null,
  };
}

/** Streuung als Standardabweichung der Grundgesamtheit; „über einer Zeile“: Betrag größer als
 * die Zeilenhöhe. */
export function schaetzfehlerKennzahlen(paare: readonly Hoehenpaar[], zeilenhoehe: number) {
  const auswerten = (auswahl: readonly Hoehenpaar[]) => {
    const fehler = auswahl.map((paar) => paar.gemessen - paar.geschaetzt);
    if (fehler.length === 0)
      return { anzahl: 0, mittel: 0, median: 0, streuung: 0, anteilUeberZeile: 0 };
    const mittel = summe(fehler) / fehler.length;
    return {
      anzahl: fehler.length,
      mittel,
      median: median([...fehler].sort((a, b) => a - b)),
      streuung: streuung(fehler),
      anteilUeberZeile: fehler.filter((f) => Math.abs(f) > zeilenhoehe).length / fehler.length,
    };
  };
  const arten = [...new Set(paare.map((paar) => paar.art))];
  return {
    gesamt: auswerten(paare),
    nachArt: Object.fromEntries(
      arten.map((art) => [art, auswerten(paare.filter((paar) => paar.art === art))]),
    ),
  };
}

/** Grenze, bis zu der ein Fehler noch als ganzes Zeilenvielfaches gilt (Rundung der Messung). */
const ZEILENVIELFACHES_TOLERANZ_PX = 1;

/** Ordnet Schätzfehler einer Ursache zu: „exakt“ (0 px), „Zeilenumbruch“ (ein von 0
 * verschiedenes Vielfaches der Zeilenhöhe bis auf 1 px: falsch geschätzte Zeilenzahl) und
 * „sonstige“ (feste Abstände, Titel, Rundung). Dazu die betragsgrößten Fehler mit Element. */
export function schaetzfehlerUrsachen(
  paare: readonly Hoehenpaar[],
  zeilenhoehe: number,
  groessteAnzahl = 20,
) {
  const mitFehler = paare.map((paar) => {
    const fehler = paar.gemessen - paar.geschaetzt;
    return { ...paar, fehler, zeilen: fehler / zeilenhoehe };
  });
  const art = ({ fehler, zeilen }: { fehler: number; zeilen: number }) => {
    if (fehler === 0) return 'exakt';
    const vielfaches = Math.round(zeilen);
    return vielfaches !== 0 &&
      Math.abs(fehler - vielfaches * zeilenhoehe) <= ZEILENVIELFACHES_TOLERANZ_PX
      ? 'zeilenumbruch'
      : 'sonstige';
  };
  const anteil = (gesucht: string) =>
    mitFehler.length === 0
      ? 0
      : mitFehler.filter((paar) => art(paar) === gesucht).length / mitFehler.length;
  return {
    anteile: {
      exakt: anteil('exakt'),
      zeilenumbruch: anteil('zeilenumbruch'),
      sonstige: anteil('sonstige'),
    },
    groesste: [...mitFehler]
      .sort((a, b) => Math.abs(b.fehler) - Math.abs(a.fehler))
      .slice(0, groessteAnzahl),
  };
}

/** Summe und größte Korrektur über Beträge. */
export function korrekturKennzahlen(betraege: readonly number[]) {
  const absolut = betraege.map(Math.abs);
  return { anzahl: betraege.length, summe: summe(absolut), groesste: Math.max(0, ...absolut) };
}

/** Größte Änderung der Gesamthöhe zwischen zwei Ständen, die höchstens eine Sekunde
 * auseinanderliegen; Reihe zeitlich aufsteigend. */
export function gesamthoehenDrift(reihe: readonly { zeitpunkt: number; hoehe: number }[]) {
  let groesste = 0;
  reihe.forEach((von, i) => {
    for (const bis of reihe.slice(i + 1)) {
      if (bis.zeitpunkt - von.zeitpunkt > 1000) break;
      groesste = Math.max(groesste, Math.abs(bis.hoehe - von.hoehe));
    }
  });
  return {
    anfang: reihe[0]?.hoehe ?? 0,
    ende: reihe.at(-1)?.hoehe ?? 0,
    groessteAenderungJeSekunde: groesste,
  };
}

/** Geschätzte Dauer einer Vormessung aller Elemente. */
export function hochrechnungVollmessung(elementzahl: number, neuaufbauKostenMs: readonly number[]) {
  return elementzahl * verteilung(neuaufbauKostenMs).median;
}

/** Zeitspanne der Arbeit eines Bildes (ms, gleiche Zeitbasis wie performance.now()) und Ende
 * des Bildes (nächste Bildgrenze). */
export interface Arbeitsfenster {
  readonly beginn: number;
  readonly ende: number;
  readonly bildEnde: number;
}

/** Arbeitszeit je Bild: Scroll-Verarbeitung bis Ende des folgenden Commits. Je Bild (zwischen
 * zwei aufeinanderfolgenden Bildgrenzen) beginnt das Fenster mit dem ersten Scrollereignis und
 * endet mit dem ersten Commit danach im selben Bild; Bilder ohne solchen Commit entfallen. */
export function arbeitsfensterJeBild(
  scrollZeitpunkte: readonly number[],
  commitZeitpunkte: readonly number[],
  bildgrenzen: readonly number[],
): Arbeitsfenster[] {
  const fenster: Arbeitsfenster[] = [];
  bildgrenzen.slice(1).forEach((bis, i) => {
    const von = bildgrenzen[i] ?? bis;
    const beginn = scrollZeitpunkte.find((zeit) => zeit >= von && zeit < bis);
    if (beginn === undefined) return;
    const ende = commitZeitpunkte.find((zeit) => zeit >= beginn && zeit < bis);
    if (ende !== undefined) fenster.push({ beginn, ende, bildEnde: bis });
  });
  return fenster;
}

/** Neuaufbau-Kosten je neu erscheinendem Element: Arbeitszeit eines Bildes über der Grundlast
 * (Median der Bilder ohne neu gemessene Elemente, sonst 0), geteilt durch die im Bild erstmals
 * gemessenen Elemente; je Element ein Wert, nie negativ. Erstmessungen zählen vom Beginn des
 * Arbeitsfensters bis zum Bildende, weil die Bibliothek während des Scrollens erst über den
 * ResizeObserver nach dem Commit misst; die Arbeitszeit reicht dann bis zur letzten Erstmessung.
 * Näherung, keine Einzelmessung. */
export function neuaufbauKostenJeElement(
  fenster: readonly Arbeitsfenster[],
  messzeitpunkte: readonly number[],
) {
  const bilder = fenster.map(({ beginn, ende, bildEnde }) => {
    const neu = messzeitpunkte.filter((zeit) => zeit >= beginn && zeit < bildEnde);
    return { dauer: Math.max(ende, ...neu) - beginn, neu: neu.length };
  });
  const grundlast = verteilung(bilder.filter((b) => b.neu === 0).map((b) => b.dauer)).median;
  return bilder.flatMap(({ dauer, neu }) =>
    Array.from({ length: neu }, () => Math.max(0, dauer - grundlast) / neu),
  );
}

/** React-Renderzeit eines Commits (Profiler: actualDuration) und Beginn seiner Commitphase. */
export interface Renderzeit {
  readonly commitZeit: number;
  readonly dauerMs: number;
}

/** Teilt die Arbeit je Bild auf: React-Renderzeit (Summe der Commits mit Commitbeginn im
 * Arbeitsfenster), übrige Zeit bis Commit-Ende (Scrollverarbeitung, Bibliothek, eigene
 * Renderlogik der Ansicht, Commit und Layout-Effekte; nie negativ) und die Zeit nach dem Commit
 * bis Bildende (Layout, Zeichnen, ResizeObserver-Messungen und Warten auf das nächste Bild). */
export function bildzeitAufteilung(
  fenster: readonly Arbeitsfenster[],
  renderzeiten: readonly Renderzeit[],
) {
  const reactRenderMs = fenster.map(({ beginn, ende }) =>
    summe(
      renderzeiten
        .filter(({ commitZeit }) => commitZeit >= beginn && commitZeit <= ende)
        .map(({ dauerMs }) => dauerMs),
    ),
  );
  return {
    reactRenderMs,
    uebrigeBisCommitMs: fenster.map(({ beginn, ende }, i) =>
      Math.max(0, ende - beginn - (reactRenderMs[i] ?? 0)),
    ),
    nachCommitMs: fenster.map(({ ende, bildEnde }) => bildEnde - ende),
  };
}

/** Im Messlauf (Phase 5/6) erhobene Reihen, die nicht aus dem Rekorder stammen. */
export interface MesslaufBildreihen {
  readonly bildperiodeMs: number;
  readonly bildzeitenMs: readonly number[];
  readonly bildverschiebungen: readonly Bildverschiebung[];
  /** Vergleiche ohne weiter vorhandenes Referenzelement; die erste Ausgangslage zählt nicht. */
  readonly textsprungFehlendeVergleiche?: number;
  readonly neuaufbauKostenMs: readonly number[];
  /** Arbeitszeit je Bild, siehe arbeitsfensterJeBild. */
  readonly arbeitszeitenMs: readonly number[];
  /** Je Arbeitsfenster, siehe bildzeitAufteilung. */
  readonly aufteilung?: ReturnType<typeof bildzeitAufteilung>;
  readonly elementzahl: number;
}

/** Kennzahlen aus den Rohdaten eines Rekorders der Gesetzestextansicht, auf Wunsch ergänzt um
 * die Bildreihen des Messlaufs. */
export function werteMesslaufAus(
  roh: MesslaufRohdaten,
  { zeilenhoehe }: { zeilenhoehe: number },
  bildreihen?: MesslaufBildreihen,
) {
  return {
    schaetzfehler: schaetzfehlerKennzahlen(roh.hoehen, zeilenhoehe),
    schaetzfehlerUrsachen: schaetzfehlerUrsachen(roh.hoehen, zeilenhoehe),
    korrekturen: korrekturKennzahlen(roh.korrekturen.map((k) => k.betrag)),
    gesamthoehe: gesamthoehenDrift(roh.gesamthoehen),
    aufrufe: { ...roh.aufrufe },
    ...(bildreihen && {
      bildzeitMs: {
        ...verteilung(bildreihen.bildzeitenMs),
        anteilUeber1_5: anteilUeberBildperiode(
          bildreihen.bildzeitenMs,
          bildreihen.bildperiodeMs,
          1.5,
        ),
        anteilUeber3: anteilUeberBildperiode(bildreihen.bildzeitenMs, bildreihen.bildperiodeMs, 3),
      },
      textsprung: textsprungKennzahlen(
        bildreihen.bildverschiebungen,
        bildreihen.textsprungFehlendeVergleiche,
      ),
      arbeitszeitMs: verteilung(bildreihen.arbeitszeitenMs),
      bildzeitAufteilungMs: {
        reactRender: verteilung(bildreihen.aufteilung?.reactRenderMs ?? []),
        uebrigeBisCommit: verteilung(bildreihen.aufteilung?.uebrigeBisCommitMs ?? []),
        nachCommit: verteilung(bildreihen.aufteilung?.nachCommitMs ?? []),
      },
      neuaufbauKostenMs: {
        ...verteilung(bildreihen.neuaufbauKostenMs),
        hochrechnungVollmessung: hochrechnungVollmessung(
          bildreihen.elementzahl,
          bildreihen.neuaufbauKostenMs,
        ),
      },
    }),
  };
}

/** Zusammenfassung einer Kennzahl über die Wiederholungen eines Szenarios; Streuung wie bei
 * den Schätzfehlern als Standardabweichung der Grundgesamtheit. */
export function medianUndStreuung(werte: readonly number[]) {
  if (werte.length === 0) return { median: 0, streuung: 0 };
  return { median: median([...werte].sort((a, b) => a - b)), streuung: streuung(werte) };
}

function streuung(werte: readonly number[]) {
  const mittel = summe(werte) / werte.length;
  return Math.sqrt(summe(werte.map((w) => (w - mittel) ** 2)) / werte.length);
}

function summe(werte: readonly number[]) {
  return werte.reduce((a, b) => a + b, 0);
}

/** Erwartet eine aufsteigend sortierte, nicht leere Reihe. */
function median(sortiert: readonly number[]) {
  const mitte = sortiert.length / 2;
  const an = (i: number) => sortiert.at(i) ?? Number.NaN;
  return sortiert.length % 2 ? an(Math.floor(mitte)) : (an(mitte - 1) + an(mitte)) / 2;
}
