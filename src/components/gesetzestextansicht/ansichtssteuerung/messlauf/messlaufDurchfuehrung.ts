// messlaufDurchfuehrung.ts
// Messlauf Stufe 2 unter Messlauf-Sperre, nur im Entwicklungsbetrieb (Aufruf über
// lexlataScrollMesslauf): Modus A Schrittmodus scrollt skriptgesteuert je Bild um
// Geschwindigkeit mal gemessene Bildperiode; Modus B Gleitmodus lässt den Browser weich über eine
// lange Strecke scrollen (scrollTo mit behavior 'smooth'). Je Szenario mehrere Wiederholungen;
// Kennzahlen über messlaufKennzahlen.ts, zusammengefasst nach Median und Streuung. Angehängt
// werden Umgebungsprotokoll mit Verankerungsprobe und Neuaufbau-Kosten aller Durchläufe.
//
// Begriffe (Plan „Scrollen in langen Gesetzen“, Grundlagen):
// - Messlauf: Messung von Stocken und Textsprüngen in Zahlen; Stufe 2 im echten WebView.
// - Textsprung: Der gelesene Text verschiebt sich sichtbar, ohne dass weitergescrollt wird.
//   Referenzelement ist das oberste sichtbare Element; je Bild wird seine Lage im Container
//   gelesen. Restverschiebung = Bildschirmverschiebung plus geschriebener Scrollschritt.
// - Stocken: ungleichmäßige Bewegung, weil Bilder zu spät fertig werden (Bildzeiten über dem
//   1,5- bzw. 3-Fachen der Bildperiode).
// - Höhenkorrektur, Höhenschätzung, Gesamthöhe: aus dem Rekorder der Ansicht (scrollen/).
// - Ungemessener Zustand (S4, G2): Die Bibliothek verwirft alle gemessenen Höhen; Elemente oberhalb
//   gelten wieder als geschätzt.
//
// Sperre und Wiederherstellung der Ausgangsposition liefert der Aufrufer (useMesslauf.ts).
import type { ScrollMesslaufOptionen } from '@/lib/utils/scrollMesslaufAnmeldung';
import type { Renderzeit } from '@/lib/utils/messlaufKennzahlen';
import type { MesslaufRekorder } from '@/components/gesetzestextansicht/ansichtssteuerung/scrollen/scrollen.index';
import { bild, erstelleBildreihen } from './messlaufBildreihen';
import {
  fasseZusammen,
  messeBildperiode,
  neuaufbauUeberAlle,
  textzusammenfassung,
  werteDurchlaufAus,
  BILDZEIT_AUFTEILUNG_HINWEIS,
  type Kennzahlen,
  type MesslaufBericht,
  type SzenarioErgebnis,
} from './messlaufBericht';
import { erstelleUmgebungsprotokoll, type UmgebungsAngaben } from './messlaufUmgebungsprotokoll';

interface Szenario {
  readonly name: string;
  /** A Schrittmodus, B Gleitmodus. */
  readonly modus: 'A' | 'B';
  readonly geschwindigkeitPxS: number;
  readonly richtung: 'runter' | 'hoch';
  readonly start: 'anfang' | 'mitte' | 'ende';
  /** Ohne Angabe bis zum Gesetzesende (Durchlauf). */
  readonly dauerS?: number;
  readonly wechselAlleS?: number;
  readonly ungemessen?: boolean;
  readonly durchlaeufe?: number;
}

const SZENARIEN: Record<string, Szenario> = {
  S1: {
    name: 'S1 Lesen',
    modus: 'A',
    geschwindigkeitPxS: 400,
    richtung: 'runter',
    start: 'mitte',
    dauerS: 5,
  },
  S2: {
    name: 'S2 Überfliegen',
    modus: 'A',
    geschwindigkeitPxS: 2000,
    richtung: 'runter',
    start: 'anfang',
    dauerS: 5,
  },
  S3: {
    name: 'S3 Durchlauf',
    modus: 'A',
    geschwindigkeitPxS: 10_000,
    richtung: 'runter',
    start: 'anfang',
    durchlaeufe: 2,
  },
  S4: {
    name: 'S4 Hochscrollen',
    modus: 'A',
    geschwindigkeitPxS: 2000,
    richtung: 'hoch',
    start: 'ende',
    dauerS: 5,
    ungemessen: true,
  },
  Richtungswechsel: {
    name: 'Richtungswechsel',
    modus: 'A',
    geschwindigkeitPxS: 2000,
    richtung: 'runter',
    start: 'mitte',
    dauerS: 20,
    wechselAlleS: 5,
  },
  // Gleitmodus: über die ganze Länge; Geschwindigkeit bestimmt der Browser.
  G1: {
    name: 'G1 Gleiten runter',
    modus: 'B',
    geschwindigkeitPxS: 0,
    richtung: 'runter',
    start: 'anfang',
  },
  G2: {
    name: 'G2 Gleiten hoch',
    modus: 'B',
    geschwindigkeitPxS: 0,
    richtung: 'hoch',
    start: 'ende',
    ungemessen: true,
  },
};
const STANDARD_WIEDERHOLUNGEN = 5;
/** Abbruchgrenze eines Durchlaufs, falls das Ende nie erreicht wird (wachsende Gesamthöhe). */
const HOECHSTDAUER_DURCHLAUF_S = 600;
const BERUHIGUNG_BILDER = 3;
/** Gleitmodus: Ende, wenn sich die Scrollposition so viele Bilder nicht mehr ändert. */
const RUHE_BILDER = 10;

export interface MesslaufUmgebung {
  readonly container: HTMLElement;
  readonly rekorder: MesslaufRekorder;
  readonly zeilenhoehe: number;
  readonly elementzahl: number;
  readonly gesetz: UmgebungsAngaben['gesetz'];
  readonly einstellungen: UmgebungsAngaben['einstellungen'];
  /** Commit-Enden der Ansicht während des Laufs (performance.now()). */
  commitZeitpunkte(): readonly number[];
  /** React-Renderzeiten der Ansicht während des Laufs (Profiler). */
  renderzeiten(): readonly Renderzeit[];
  /** Sperrt Nachführung und Rückmeldungen; liefert Wiederherstellung und Entsperren. */
  sperren(): Promise<() => Promise<void>>;
}

export async function fuehreMesslaufDurch(
  umgebung: MesslaufUmgebung,
  optionen: ScrollMesslaufOptionen,
): Promise<{ bericht: MesslaufBericht; zusammenfassung: string }> {
  const auswahl = (optionen.szenarien ?? Object.keys(SZENARIEN)).map((name) => {
    const szenario = SZENARIEN[name];
    if (!szenario)
      throw new Error(
        `Unbekanntes Szenario „${name}“; vorhanden: ${Object.keys(SZENARIEN).join(', ')}`,
      );
    return szenario;
  });
  const wiederholungen = optionen.wiederholungen ?? STANDARD_WIEDERHOLUNGEN;
  const textsprung = optionen.textsprung ?? true;
  if (!Number.isInteger(wiederholungen) || wiederholungen < 1)
    throw new Error('wiederholungen erwartet eine ganze Zahl ab 1');
  const entsperren = await umgebung.sperren();
  try {
    const bildperiodeMs = await messeBildperiode();
    const szenarien: SzenarioErgebnis[] = [];
    const neuaufbauKostenMs: number[] = [];
    for (const szenario of auswahl) {
      const dauerS = optionen.dauerSekunden ?? szenario.dauerS;
      const laeufe: Kennzahlen[][] = [];
      for (let w = 0; w < wiederholungen; w++) {
        const durchlaeufe: Kennzahlen[] = [];
        for (let d = 0; d < (szenario.durchlaeufe ?? 1); d++)
          durchlaeufe.push(
            await messeDurchlauf(umgebung, szenario, {
              dauerS,
              bildperiodeMs,
              neuaufbauKostenMs,
              textsprung,
            }),
          );
        laeufe.push(durchlaeufe);
      }
      const parameter = {
        ...parameterVon(szenario, dauerS, wiederholungen, bildperiodeMs),
        textsprungMessung: textsprung,
      };
      for (let d = 0; d < (szenario.durchlaeufe ?? 1); d++) {
        const reihe = laeufe.flatMap((durchlaeufe) => durchlaeufe.slice(d, d + 1));
        szenarien.push({
          name: szenario.durchlaeufe ? `${szenario.name} ${d + 1}` : szenario.name,
          parameter,
          kennzahlen: { wiederholungen: reihe, zusammenfassung: fasseZusammen(reihe) },
        });
      }
    }
    const bericht: MesslaufBericht = {
      stufe: 2,
      erstelltAm: new Date().toISOString(),
      umgebung: await erstelleUmgebungsprotokoll({ ...umgebung, bildperiodeMs }),
      szenarien,
      neuaufbauKosten: neuaufbauUeberAlle(neuaufbauKostenMs, umgebung.elementzahl),
      hinweise: [
        'Modus A Schrittmodus und Modus B Gleitmodus: skriptgesteuertes Scrollen ersetzt kein Trackpad (dafür lexlataScrollAufzeichnung).',
        'Modus B: Textsprung aus der gelesenen Scrolländerung ohne die Höhenkorrekturen des Programms.',
        'Arbeitszeit je Bild: erstes Scrollereignis eines Bildes bis Ende des folgenden Commits der Gesetzestextansicht im selben Bild; Bilder ohne solchen Commit entfallen.',
        'Neuaufbau-Kosten: Näherung aus Arbeitszeit (bis zur letzten Erstmessung im Bild) über der Grundlast je erstmals gemessenem Element; Hochrechnung der Vollmessung = Elementzahl mal Median.',
        textsprung
          ? 'Referenzelement: oberstes sichtbares Element; seine Lage wird je Bild einmal gebündelt nach dem Bild gelesen (eigene Aufgabe nach dem Zeichnen, Layout bereits berechnet), nicht mehr im Bildrückruf; die Messung erhöht die gemessene Arbeit nicht.'
          : 'Textsprung nicht gemessen (textsprung: false): keine Lage gelesen, kein erzwungenes Layout.',
        BILDZEIT_AUFTEILUNG_HINWEIS,
        'Entwicklungsbetrieb: React ist langsamer und rendert doppelt; Vergleiche gelten nur untereinander.',
        'Zusammenfassung je Kennzahl: Median und Streuung (Standardabweichung) über die Wiederholungen.',
      ],
    };
    return { bericht, zusammenfassung: textzusammenfassung(bericht) };
  } finally {
    await entsperren();
  }
}

function parameterVon(
  szenario: Szenario,
  dauerS: number | undefined,
  wiederholungen: number,
  bildperiodeMs: number,
) {
  const schrittmodus = szenario.modus === 'A';
  return {
    modus: schrittmodus ? 'A Schrittmodus' : 'B Gleitmodus',
    ...(schrittmodus && { geschwindigkeitPxS: szenario.geschwindigkeitPxS }),
    richtung: szenario.richtung,
    start: szenario.start,
    dauerS: dauerS ?? 'bis Gesetzesende',
    ...(szenario.wechselAlleS && { richtungswechselAlleS: szenario.wechselAlleS }),
    ...(szenario.ungemessen && { ungemessenerZustand: true }),
    wiederholungen,
    ...(schrittmodus && { schrittPx: (szenario.geschwindigkeitPxS * bildperiodeMs) / 1000 }),
  };
}

async function messeDurchlauf(
  umgebung: MesslaufUmgebung,
  szenario: Szenario,
  {
    dauerS,
    bildperiodeMs,
    neuaufbauKostenMs,
    textsprung,
  }: {
    dauerS: number | undefined;
    bildperiodeMs: number;
    neuaufbauKostenMs: number[];
    textsprung: boolean;
  },
): Promise<Kennzahlen> {
  const { container, rekorder, elementzahl } = umgebung;
  await setzeAn(container, rekorder, szenario);
  const dauerMs = (dauerS ?? HOECHSTDAUER_DURCHLAUF_S) * 1000;
  const reihen = erstelleBildreihen(umgebung, { textsprung });
  const bewegung = { container, reihen, szenario, dauerMs, anfang: await bild() };
  if (szenario.modus === 'A') await scrolleSchrittweise(bewegung, bildperiodeMs);
  else await scrolleGleitend(bewegung);
  const ergebnis = await reihen.beenden(bildperiodeMs, elementzahl);
  neuaufbauKostenMs.push(...ergebnis.neuaufbauKostenMs);
  return werteDurchlaufAus(umgebung, ergebnis);
}

interface Bewegung {
  readonly container: HTMLElement;
  readonly reihen: ReturnType<typeof erstelleBildreihen>;
  readonly szenario: Szenario;
  readonly dauerMs: number;
  readonly anfang: number;
}

/** Modus A: je Bild ein geschriebener Schritt bis Dauer oder Gesetzesrand. */
async function scrolleSchrittweise(
  { container, reihen, szenario, dauerMs, anfang }: Bewegung,
  bildperiodeMs: number,
) {
  const schritt = (szenario.geschwindigkeitPxS * bildperiodeMs) / 1000;
  for (let zeit = anfang; ; zeit = await bild()) {
    reihen.erfasse(zeit);
    const vergangen = zeit - anfang;
    if (vergangen >= dauerMs) return;
    const vorher = container.scrollTop;
    const ziel = Math.min(
      hoechsterScrollstand(container),
      Math.max(0, vorher + (laeuftRunter(szenario, vergangen) ? schritt : -schritt)),
    );
    if (ziel === vorher) return;
    reihen.merkeSchritt(ziel - vorher);
    container.scrollTop = ziel;
  }
}

/** Modus B: ein weiches Scrollen des Browsers über die ganze Länge, bis Ziel, Ruhe oder Dauer. */
async function scrolleGleitend({ container, reihen, szenario, dauerMs, anfang }: Bewegung) {
  const ziel = szenario.richtung === 'runter' ? hoechsterScrollstand(container) : 0;
  container.scrollTo({ top: ziel, behavior: 'smooth' });
  let ruhe = 0;
  let zuletzt = container.scrollTop;
  for (let zeit = anfang; ; zeit = await bild()) {
    reihen.erfasse(zeit);
    ruhe = container.scrollTop === zuletzt ? ruhe + 1 : 0;
    zuletzt = container.scrollTop;
    if (zeit - anfang >= dauerMs || Math.abs(zuletzt - ziel) < 1 || ruhe >= RUHE_BILDER) return;
  }
}

function hoechsterScrollstand(container: HTMLElement) {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

/** Startposition, Beruhigung und für S4/G2 der ungemessene Zustand; danach frische Rohdaten. */
async function setzeAn(container: HTMLElement, rekorder: MesslaufRekorder, szenario: Szenario) {
  const hoechst = hoechsterScrollstand(container);
  container.scrollTop = { anfang: 0, mitte: hoechst / 2, ende: hoechst }[szenario.start];
  for (let i = 0; i < BERUHIGUNG_BILDER; i++) await bild();
  if (szenario.ungemessen) {
    rekorder.messungenVerwerfen();
    for (let i = 0; i < BERUHIGUNG_BILDER; i++) await bild();
  }
  rekorder.zuruecksetzen();
}

function laeuftRunter(szenario: Szenario, vergangenMs: number) {
  const wechsel = szenario.wechselAlleS
    ? Math.floor(vergangenMs / (szenario.wechselAlleS * 1000))
    : 0;
  return (szenario.richtung === 'runter') === (wechsel % 2 === 0);
}
