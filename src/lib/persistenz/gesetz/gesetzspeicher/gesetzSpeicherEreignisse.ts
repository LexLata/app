// gesetzSpeicherEreignisse.ts
//
// Zähler-/Debounce-Mechanik für "ein Speicher-/Lösch-Batch auf Gesetze ist
// zur Ruhe gekommen" – ursprünglich Teil von markierungskonflikteSpeicher.ts
// (dort einziger Anwendungsfall: Markierungskonflikt-Prüfung nach jedem
// Speichern/Löschen eines Gesetzes). Hierher ausgelagert, weil ein zweiter,
// unabhängiger Anwendungsfall hinzukam: der fensterübergreifende
// 'gesetze-geaendert'-Broadcast (siehe unten), der bisher verstreut bei
// jedem einzelnen Aufrufer (OeffnenOverlay.tsx, VerweismarkierungFenster.tsx,
// useHintergrundAktualisierung.ts) manuell gesendet werden musste – und in
// konfliktaktionen.ts schlicht VERGESSEN wurde, wodurch ein
// dort importiertes Gesetz erst nach einem Neuladen der Gesetzesübersicht
// sichtbar war. Beide Anwendungsfälle brauchen denselben Zeitpunkt ("Batch
// fertig"), aber unabhängige Reaktionen – daher hier nur der gemeinsame
// Zähler/Timer plus ein einfaches Subscriber-Array, keine fachliche Logik.
//
// WICHTIG: Diese Datei darf NICHTS aus gesetzSpeicher.ts importieren (auch
// nicht dynamisch) – sonst entsteht derselbe Zirkelbezug, den der bisherige
// dynamische Import in gesetzSpeicher.ts ursprünglich vermeiden sollte
// (gesetzSpeicher.ts importiert diese Datei, nicht umgekehrt).

import {
  erfasseAktionsFolgelauf,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import { alsFehler } from '@/lib/utils/fehler';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';

// ---------------------------------------------------------------------------
// Zähler/Debounce
// ---------------------------------------------------------------------------

type SpeicherBatchAusloeser = {
  gesetz: Gesetzesreferenz;
  vorgang?: string;
  meldungEmpfangen?: AktionsMeldungEmpfaenger;
};

// Sammelt, was während eines Batches TATSÄCHLICH inhaltlich betroffen war
// (siehe nachSpeichernPruefen: nur bei inhaltGeaendert=true eingetragen) –
// wird beim Abschluss an alle Subscriber übergeben. Zwei Besitzer: die
// fensterweite Sammlung (Zähler + Nachlauf-Frist) und je ein ausdrücklich
// übergebener Sammelbatch (siehe mitSpeicherSammelbatch).
type BatchSammlung = {
  betroffeneGesetze: Map<string, Gesetzesreferenz>;
  betroffeneVorgaenge: Set<string>;
  ausloeser: SpeicherBatchAusloeser[];
  abschliessen: ((fehler: unknown[]) => void)[];
};

function neueBatchSammlung(): BatchSammlung {
  return {
    betroffeneGesetze: new Map(),
    betroffeneVorgaenge: new Set(),
    ausloeser: [],
    abschliessen: [],
  };
}

let fensterSammlung = neueBatchSammlung();

/** Ausdrücklich durchgereichter Batch eines Datei-Imports (siehe
 *  mitSpeicherSammelbatch). Für Aufrufer undurchsichtig. */
export type SpeicherSammelbatch = { readonly sammlung: BatchSammlung };

// Zählt Speicher-/Löschvorgänge, die GERADE laufen. Ein Zeit-Debounce allein
// wäre hier ungeeignet: bei langsamer Internetverbindung könnten zwei
// Vorgänge eines Sammel-Updates weiter auseinanderliegen als jede sinnvolle
// feste Wartezeit, sodass der Batch fälschlich schon mitten im Durchlauf als
// abgeschlossen gälte. Der Zähler dagegen weiß exakt, ob noch etwas läuft –
// unabhängig davon, wie lange es dauert.
let laufendeSpeichervorgaenge = 0;

// Kurze Nachlauf-Frist, NACHDEM der Zähler auf 0 gefallen ist: parallelMitLimit
// (siehe AktualisierenOverlay.tsx) startet bei einem Sammel-Update sofort den
// nächsten Speichervorgang, sobald einer der bis zu 10 gleichzeitigen Plätze
// frei wird – zwischen "Zähler kurz auf 0" und "nächster Speichervorgang
// beginnt" liegt dabei praktisch kein messbarer zeitlicher Abstand. 200ms
// reichen dafür mit deutlichem Sicherheitsabstand.
const NACHLAUF_MS = 200;
let nachlaufTimer: ReturnType<typeof setTimeout> | null = null;
// Asynchrone Reaktionen auf den Batch (insbesondere der Broadcast) müssen vor
// dem Schließen des auslösenden Fensters ebenfalls beendet sein.
const ausstehendeBenachrichtigungen = new Set<Promise<void>>();

type Subscriber = (
  betroffene: Gesetzesreferenz[],
  vorgaenge?: string[],
  ausloeser?: SpeicherBatchAusloeser[],
) => void | Promise<void>;
const subscriber = new Set<Subscriber>();
const jederBatch = new Set<Subscriber>();

/** Meldet eine Funktion an, die aufgerufen wird, sobald ein Speicher-/
 *  Lösch-Batch zur Ruhe gekommen ist – MIT den in diesem Batch tatsächlich
 *  inhaltlich betroffenen Gesetzesreferenzen (kann bei einem reinen
 *  inhaltGeaendert=false-Batch auch leer sein, siehe Aufrufer). Gibt eine
 *  Abmeldefunktion zurück. */
export function beiSpeicherBatchAbgeschlossen(
  fn: Subscriber,
  auchUnveraendert = false,
): () => void {
  const empfaenger = auchUnveraendert ? jederBatch : subscriber;
  empfaenger.add(fn);
  return () => empfaenger.delete(fn);
}

function benachrichtigeBatchSubscriber(
  fn: Subscriber,
  betroffene: Gesetzesreferenz[],
  vorgaenge: string[],
  batchAusloeser: SpeicherBatchAusloeser[],
): void | Promise<void> {
  try {
    if (batchAusloeser.some((a) => a.meldungEmpfangen))
      return fn(betroffene, vorgaenge, batchAusloeser);
    return vorgaenge.length > 0 ? fn(betroffene, vorgaenge) : fn(betroffene);
  } catch (fehler) {
    console.error('Speicher-Batch: Benachrichtigung fehlgeschlagen.', fehler);
    return Promise.reject(alsFehler(fehler));
  }
}

/** Gemeinsamer Abschluss beider Batch-Wege: benachrichtigt die Subscriber
 *  und erfüllt danach die Abschlussversprechen der Auslöser. */
function schliesseBatchAb(sammlung: BatchSammlung): void {
  const betroffene = Array.from(sammlung.betroffeneGesetze.values());
  const vorgaenge = [...sammlung.betroffeneVorgaenge];
  const batchAusloeser = sammlung.ausloeser;
  const abschliessen = sammlung.abschliessen;
  const benachrichtigungen: Promise<void>[] = [];
  const empfaenger = betroffene.length > 0 ? [...subscriber, ...jederBatch] : [...jederBatch];
  for (const fn of empfaenger) {
    const ergebnis = benachrichtigeBatchSubscriber(fn, betroffene, vorgaenge, batchAusloeser);
    if (ergebnis) {
      benachrichtigungen.push(ergebnis);
      ausstehendeBenachrichtigungen.add(ergebnis);
      void ergebnis
        .then(
          () => ausstehendeBenachrichtigungen.delete(ergebnis),
          () => ausstehendeBenachrichtigungen.delete(ergebnis),
        )
        .then(meldeSpeicherAbschluss);
    }
  }
  void Promise.allSettled(benachrichtigungen).then((ergebnisse) => {
    const fehler = ergebnisse.flatMap((e) => {
      if (e.status === 'fulfilled') return [];
      const grund: unknown = e.reason;
      return [grund];
    });
    for (const ende of abschliessen) ende(fehler);
  });
}

function planeBenachrichtigungFallsRuhig(): void {
  if (nachlaufTimer) clearTimeout(nachlaufTimer);
  nachlaufTimer = setTimeout(() => {
    nachlaufTimer = null;
    // Sicherheitscheck: falls in der Nachlauf-Frist doch noch ein neuer
    // Speichervorgang begonnen hat, jetzt NICHT benachrichtigen – der wird
    // beim Abschluss dieses neuen Vorgangs selbst wieder einen Durchlauf
    // anstoßen.
    if (laufendeSpeichervorgaenge === 0) {
      const sammlung = fensterSammlung;
      fensterSammlung = neueBatchSammlung();
      schliesseBatchAb(sammlung);
      meldeSpeicherAbschluss();
    }
  }, NACHLAUF_MS);
}

// Offene Sammelbatches (siehe mitSpeicherSammelbatch) – nur für die Beenden-Anfrage.
let offeneSammelbatches = 0;

/**
 * Führt `arbeit` mit einem eigenen Sammelbatch aus und schließt ihn danach
 * genau einmal ab, auch wenn `arbeit` wirft. Der fensterweite Batch bleibt
 * unberührt: parallele Speichervorgänge ohne Sammelbatch schließen
 * unabhängig davon ab. Ein offener Sammelbatch hält istSpeicherBatchRuhig
 * bewusst NICHT auf false (sonst warteten Normsprung, Reparatur-Banner und
 * Markierungskonflikte-Fenster bis zum Ende eines Datei-Imports); erst seine
 * Abschluss-Benachrichtigungen zählen wie beim fensterweiten Batch zu
 * ausstehendeBenachrichtigungen. Datei-Importe laufen nur im Hauptfenster,
 * dessen Schließen nicht über warteAufSpeicherBatchAbschluss abgesichert ist;
 * die Beenden-Anfrage wartet dagegen auch auf offene Sammelbatches (siehe
 * beendenVorbereiten).
 */
export async function mitSpeicherSammelbatch<T>(
  arbeit: (batch: SpeicherSammelbatch) => Promise<T>,
): Promise<T> {
  // Ohne Anhalten synchron zählen, damit beendenVorbereiten den Vorgang sieht.
  while (neueSpeichervorgaengeAngehalten()) await anhalten?.freigegeben;
  const batch: SpeicherSammelbatch = { sammlung: neueBatchSammlung() };
  offeneSammelbatches += 1;
  try {
    return await arbeit(batch);
  } finally {
    offeneSammelbatches -= 1;
    schliesseBatchAb(batch.sammlung);
    meldeSpeicherAbschluss();
  }
}

// Angehaltene neue Speichervorgänge (siehe beendenVorbereiten).
let anhalten: { freigegeben: Promise<void>; freigeben: () => void } | null = null;

/** Hält neue Speichervorgänge an und wartet auf laufende Vorgänge einschließlich
 * Datei-Importen und deren Benachrichtigungen. Das Abbruchsignal gibt neue
 * Vorgänge auch dann frei, wenn die Vorbereitung noch wartet. */
export async function beendenVorbereiten(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  let freigeben!: () => void;
  const freigegeben = new Promise<void>((resolve) => (freigeben = resolve));
  const eigenes = { freigegeben, freigeben };
  anhalten?.freigeben();
  anhalten = eigenes;
  signal.addEventListener(
    'abort',
    () => {
      if (anhalten === eigenes) anhalten = null;
      eigenes.freigeben();
    },
    { once: true },
  );
  await warteAufSpeicherAbschluss(() => offeneSammelbatches === 0, signal);
}

// Nur neue Vorgänge warten: Innerhalb eines laufenden Vorgangs oder
// Sammelbatches würde Warten die Beenden-Vorbereitung blockieren.
function neueSpeichervorgaengeAngehalten(): boolean {
  return anhalten !== null && laufendeSpeichervorgaenge === 0 && offeneSammelbatches === 0;
}

/** Ob GERADE kein Speicher-/Lösch-Batch mehr läuft, kein Nachlauf-Timer
 *  und keine asynchrone Batch-Benachrichtigung mehr aussteht – für markierungskonflikteSpeicher.ts::
 *  planeFensterOeffnen, das zusätzlich zur eigenen pruefungsKette auch
 *  dies abwarten muss, bevor es das Markierungskonflikte-Fenster öffnet
 *  (siehe dortiger Kommentar für die Begründung). */
export function istSpeicherBatchRuhig(): boolean {
  return (
    laufendeSpeichervorgaenge === 0 &&
    nachlaufTimer === null &&
    ausstehendeBenachrichtigungen.size === 0
  );
}

/**
 * Wartet, bis ein GERADE laufender oder unmittelbar bevorstehender
 * Speicher-Batch inkl. Nachlauf-Frist und asynchroner Benachrichtigungen
 * wirklich abgeschlossen ist (siehe
 * istSpeicherBatchRuhig oben). Für Fenster gedacht, die sich SELBST
 * unmittelbar nach einem eigenen Speichervorgang schließen (siehe
 * useFensterSchliessenAbsichern.ts: CloseRequested-Listener) – ohne dieses Warten wird der
 * Nachlauf-Timer (NACHLAUF_MS) beim Schließen des Fensters gekappt (der
 * Timer lebt im JS-Kontext GENAU dieses Fensters), der 'gesetze-geaendert'-
 * Broadcast (gesetzSpeicher.ts) käme dann nie an und andere offene Fenster
 * (z.B. die Gesetzesübersicht) blieben veraltet, bis irgendein ANDERER
 * Speichervorgang zufällig dieselbe Gesetzesreferenz erneut broadcastet.
 */
export async function warteAufSpeicherBatchAbschluss(): Promise<void> {
  await warteAufSpeicherAbschluss(() => true);
}

const speicherAbschlussEmpfaenger = new Set<() => void>();

function meldeSpeicherAbschluss() {
  for (const pruefen of speicherAbschlussEmpfaenger) pruefen();
}

async function warteAufSpeicherAbschluss(zusatzbedingung: () => boolean, signal?: AbortSignal) {
  while (!signal?.aborted && !(istSpeicherBatchRuhig() && zusatzbedingung())) {
    await new Promise<void>((resolve) => {
      function pruefen() {
        speicherAbschlussEmpfaenger.delete(pruefen);
        signal?.removeEventListener('abort', pruefen);
        resolve();
      }
      speicherAbschlussEmpfaenger.add(pruefen);
      signal?.addEventListener('abort', pruefen, { once: true });
    });
  }
}

/**
 * Umschließt EINEN Speicher- oder Löschvorgang (siehe speichereGesetz/
 * loescheGesetz in gesetzSpeicher.ts, die EINZIGEN vorgesehenen Aufrufer)
 * und benachrichtigt danach – sobald wirklich KEIN Vorgang mehr läuft – alle
 * über beiSpeicherBatchAbgeschlossen angemeldeten Subscriber. So ist jeder
 * Import-/Aktualisierungs-/Lösch-Pfad (heute UND künftig) automatisch
 * abgedeckt, ohne dass jede einzelne Stelle im Code selbst daran denken
 * muss. try/finally, damit der Zähler auch bei einem Fehler im Vorgang
 * korrekt wieder heruntergezählt wird.
 *
 * `inhaltGeaendert` = false bedeutet: der Vorgang selbst lief zwar (z.B. ein
 * reiner Prüf-Refresh, bei dem nur der verarbeitungszeit-Tag aufgefrischt wird),
 * hat aber INHALTLICH nichts verändert, das eine Benachrichtigung
 * rechtfertigen würde – die Gesetzesreferenz wird dann NICHT in die
 * Sammelmenge aufgenommen (siehe Absprache: nicht jede Aktualisierung
 * verändert etwas).
 *
 * Mit `sammelbatch` landen die Auslöser dort; fensterweiter Zähler und
 * Nachlauf-Frist bleiben dann unberührt (siehe mitSpeicherSammelbatch).
 */
export async function nachSpeichernPruefen<T>(
  gesetz: Gesetzesreferenz,
  inhaltGeaendert: boolean,
  vorgang: () => Promise<T>,
  {
    pruefvorgang,
    meldungEmpfangen,
    sammelbatch,
  }: {
    pruefvorgang?: string;
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
    sammelbatch?: SpeicherSammelbatch;
  } = {},
): Promise<T> {
  if (!sammelbatch) {
    while (neueSpeichervorgaengeAngehalten()) await anhalten?.freigegeben;
    laufendeSpeichervorgaenge++;
  }
  try {
    const ergebnis = await vorgang();
    if (inhaltGeaendert) {
      const { ausloeser, abschliessen, betroffeneVorgaenge, betroffeneGesetze } =
        sammelbatch?.sammlung ?? fensterSammlung;
      ausloeser.push({ gesetz, vorgang: pruefvorgang, meldungEmpfangen });
      if (meldungEmpfangen) {
        const abschluss = new Promise<void>((resolve, reject) =>
          abschliessen.push((fehler) => {
            if (fehler.length) reject(new AggregateError(fehler, fehler.map(String).join('; ')));
            else resolve();
          }),
        );
        erfasseAktionsFolgelauf(meldungEmpfangen, abschluss);
      }
      if (pruefvorgang) betroffeneVorgaenge.add(pruefvorgang);
      const schluessel = gesetzesreferenzSchluessel(gesetz);
      if (!betroffeneGesetze.has(schluessel))
        betroffeneGesetze.set(schluessel, {
          kurztitel: gesetz.kurztitel,
          normgeber: gesetz.normgeber,
        });
    }
    return ergebnis;
  } finally {
    if (!sammelbatch) {
      laufendeSpeichervorgaenge--;
      if (laufendeSpeichervorgaenge === 0) planeBenachrichtigungFallsRuhig();
    }
  }
}

// ---------------------------------------------------------------------------
// Änderung nichtamtlicher Titel (dritter, unabhängiger Anwendungsfall
// dieser Datei)
// ---------------------------------------------------------------------------

// Anders als oben KEIN Batch/Debounce: jeder Schreibvorgang und jede
// bestätigte Archivierung einer
// nichtamtlicheTitel-Datei (siehe nichtamtlicheTitelSpeicher.ts) ist bereits
// ein für sich abgeschlossenes Einzelereignis, kein Sammel-Update wie bei
// speichereGesetz(). Eigener, schlanker Subscriber-Kanal statt Wiederver-
// wendung von beiSpeicherBatchAbgeschlossen: andere Auslöser-Semantik
// (Titel- statt Norminhalt-Änderung) und andere Signatur (eine einzelne
// Gesetzesreferenz statt einer Sammelmenge).
type TitelSubscriber = (
  gesetz: Gesetzesreferenz,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
) => void | Promise<void>;
const titelSubscriber = new Set<TitelSubscriber>();

/** Meldet eine Funktion an, die aufgerufen wird, sobald eine
 *  nichtamtlicheTitel-Datei für ein Gesetz geschrieben oder nach vollständiger
 *  Sicherung entfernt wurde (siehe
 *  meldeNichtamtlicheTitelGeschrieben, EINZIGER Aufrufort in
 *  nichtamtlicheTitelSpeicher.ts). Gibt eine Abmeldefunktion zurück. */
export function beiNichtamtlicheTitelGeschrieben(fn: TitelSubscriber): () => void {
  titelSubscriber.add(fn);
  return () => titelSubscriber.delete(fn);
}

/** Benachrichtigt alle über beiNichtamtlicheTitelGeschrieben angemeldeten
 *  Subscriber nach Schreiben oder bestätigter Archivierung. Der bestehende
 *  Funktionsname bleibt für beide Änderungen erhalten. Ermöglicht
 *  nichtamtlicheTitelSpeicher.ts, eine Prüfung in
 *  markierungen anzustoßen, ohne markierungen selbst zu importieren –
 *  markierungen meldet sich stattdessen hier als Abonnent an (siehe
 *  markierungskonflikteSpeicher.ts). */
export function meldeNichtamtlicheTitelGeschrieben(
  gesetz: Gesetzesreferenz,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  for (const fn of titelSubscriber) {
    try {
      const lauf = meldungEmpfangen
        ? fn(gesetz, vorgang, meldungEmpfangen)
        : vorgang === undefined
          ? fn(gesetz)
          : fn(gesetz, vorgang);
      if (lauf) {
        erfasseAktionsFolgelauf(meldungEmpfangen, lauf);
        void lauf.catch((fehler) =>
          console.error('Benachrichtigung nach Titeländerung fehlgeschlagen:', fehler),
        );
      }
    } catch (fehler) {
      console.error('Benachrichtigung nach Titeländerung fehlgeschlagen:', fehler);
      if (meldungEmpfangen)
        erfasseAktionsFolgelauf(meldungEmpfangen, Promise.reject(alsFehler(fehler)));
    }
  }
}
