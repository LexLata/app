// Verwaltet flüchtige Aufträge zur bestätigten Historienübernahme nach Speicherung.
// Kein Datei-I/O und keine eigene Undo-Historie; Empfängerkennungen bleiben für
// die gesamte Fensterlaufzeit erhalten, auch nach Undo und React-Neuanmeldung.
import {
  hoereImEigenenFenster,
  sendeAnFenster,
  sendeGlobal,
  type HistorienNachricht,
} from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { MarkierungsAktion } from '@/lib/markierungen/eintrag/eintrag.index';

export interface MarkierungsUebertragung {
  readonly kennung: string;
}
export type MarkierungsUebertragungsErgebnis = 'bestaetigt' | 'offen';
export type MarkierungsSpeicherAbschluss =
  { art: 'erfolg' } | { art: 'uebertragungOffen'; uebertragung: MarkierungsUebertragung };

const NACHRICHT = 'markierung-historie-uebertragen';
const BESTAETIGUNG = 'markierung-historie-bestaetigt';
const VERSUCHE = 3;
const ANTWORTFRIST = 1000;
const PAUSE = 100;
const GESAMTFRIST = 5000;
interface Auftrag {
  aktion: MarkierungsAktion;
  empfaengerLabel: string;
  bestaetigt: boolean;
  wiederholung: boolean;
  laufend?: Promise<MarkierungsUebertragungsErgebnis>;
  abbrechen?: () => void;
}
const auftraege = new Map<MarkierungsUebertragung, Auftrag>();
const angenommen = new Set<string>();

/** Unmittelbar nach dem bestätigten Schreiben synchron anlegen, vor jedem IPC. */
export function erzeugeMarkierungsUebertragung(
  aktion: MarkierungsAktion,
  empfaengerLabel: string,
): MarkierungsUebertragung {
  const ref = Object.freeze({ kennung: crypto.randomUUID() });
  auftraege.set(ref, {
    aktion: structuredClone(aktion),
    empfaengerLabel,
    bestaetigt: false,
    wiederholung: false,
  });
  return ref;
}

/** Das Signal betrifft ausschließlich den bereits gespeicherten Auftrag. Es
 * erlaubt dem Aufrufer Aufräumen, bevor er den offenen Verweis erhalten hat;
 * Speicherung und deren Schreibbestätigung werden hier niemals abgebrochen. */
export async function schliesseMarkierungsSpeicherungAb(
  uebertragung: MarkierungsUebertragung,
  signal?: AbortSignal,
): Promise<MarkierungsSpeicherAbschluss> {
  const abbrechen = () => verwerfeMarkierungsUebertragung(uebertragung);
  if (signal?.aborted) {
    abbrechen();
    return { art: 'uebertragungOffen', uebertragung };
  }
  signal?.addEventListener('abort', abbrechen, { once: true });
  try {
    const ergebnis = await wiederholeMarkierungsUebertragung(uebertragung);
    if (ergebnis !== 'bestaetigt') {
      const auftrag = auftraege.get(uebertragung);
      if (auftrag) auftrag.wiederholung = true;
      return { art: 'uebertragungOffen', uebertragung };
    }
    return { art: 'erfolg' };
  } finally {
    signal?.removeEventListener('abort', abbrechen);
  }
}

/** Gemeinsamer erster Abschluss beider Speicherwege nach der Schreibbestätigung. */
export async function schliesseGespeicherteMarkierungsAktionAb(
  aktion: MarkierungsAktion,
  empfaengerLabel: string,
  signal?: AbortSignal,
): Promise<MarkierungsSpeicherAbschluss> {
  const uebertragung = erzeugeMarkierungsUebertragung(aktion, empfaengerLabel);
  meldeMarkierungsAnzeigeAenderung(aktion.gesetz);
  const abschluss = await schliesseMarkierungsSpeicherungAb(uebertragung, signal);
  if (abschluss.art === 'erfolg') verwerfeMarkierungsUebertragung(uebertragung);
  return abschluss;
}

/** Alle Aufrufer derselben Runde erhalten exakt dasselbe Promise. */
export function wiederholeMarkierungsUebertragung(
  uebertragung: MarkierungsUebertragung,
): Promise<MarkierungsUebertragungsErgebnis> {
  const auftrag = auftraege.get(uebertragung);
  if (!auftrag) throw new Error('Unbekannter oder verworfener Markierungsübertragungsauftrag');
  if (auftrag.bestaetigt) return Promise.resolve('bestaetigt');
  if (auftrag.laufend) return auftrag.laufend;
  return starteRunde(uebertragung, auftrag);
}

function starteRunde(ref: MarkierungsUebertragung, auftrag: Auftrag) {
  let aktiv = true;
  let unlisten: (() => void) | undefined;
  let warteTimer: ReturnType<typeof setTimeout> | undefined;
  let beendeWarten: (() => void) | undefined;
  let resolve!: (ergebnis: MarkierungsUebertragungsErgebnis) => void;
  const promise = new Promise<MarkierungsUebertragungsErgebnis>((r) => {
    resolve = r;
  });
  auftrag.laufend = promise;
  const gesamtTimer = setTimeout(() => fertig('offen'), GESAMTFRIST);
  function fertig(ergebnis: MarkierungsUebertragungsErgebnis) {
    if (!aktiv) return;
    aktiv = false;
    clearTimeout(gesamtTimer);
    clearTimeout(warteTimer);
    beendeWarten?.();
    meldeAb(unlisten);
    auftrag.laufend = undefined;
    auftrag.abbrechen = undefined;
    if (ergebnis === 'bestaetigt') {
      auftrag.bestaetigt = true;
      if (auftrag.wiederholung) meldeMarkierungsAnzeigeAenderung(auftrag.aktion.gesetz);
    }
    resolve(ergebnis);
  }
  auftrag.abbrechen = () => fertig('offen');
  function warte(ms: number) {
    return new Promise<void>((r) => {
      beendeWarten = r;
      warteTimer = setTimeout(r, ms);
    });
  }
  async function versende() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (!aktiv) return;
    const senderLabel = getCurrentWindow().label;
    const anmeldung = hoereImEigenenFenster(BESTAETIGUNG, (event) => {
      if (
        aktiv &&
        event.payload.kennung === ref.kennung &&
        event.payload.empfaengerLabel === auftrag.empfaengerLabel
      )
        fertig('bestaetigt');
    });
    unlisten = anmeldung.abmelden;
    await anmeldung.bereit;
    if (!aktiv) {
      anmeldung.abmelden();
      return;
    }
    const payload: HistorienNachricht<MarkierungsAktion> = {
      kennung: ref.kennung,
      senderLabel,
      empfaengerLabel: auftrag.empfaengerLabel,
      aktion: auftrag.aktion,
    };
    for (let versuch = 0; versuch < VERSUCHE && aktiv; versuch++) {
      // Die Antwort darf auch eintreffen, wenn das Versand-Promise hängen bleibt.
      void sendeAnFenster(auftrag.empfaengerLabel, NACHRICHT, payload).catch(() => {});
      if (!aktiv) return;
      await warte(ANTWORTFRIST);
      if (aktiv && versuch < VERSUCHE - 1) await warte(PAUSE);
    }
    fertig('offen');
  }
  void versende().catch(() => fertig('offen'));
  return promise;
}

function meldeAb(unlisten: (() => void) | undefined) {
  try {
    unlisten?.();
  } catch {
    /* Ein Abmeldefehler ändert kein Transportergebnis. */
  }
}

export function verwerfeMarkierungsUebertragung(uebertragung: MarkierungsUebertragung): void {
  const auftrag = auftraege.get(uebertragung);
  auftrag?.abbrechen?.();
  auftraege.delete(uebertragung);
}

/** Der Callback muss ausschließlich die lokale Historie synchron übernehmen. */
export async function registriereMarkierungsHistorienEmpfang(
  uebernehme: (aktion: MarkierungsAktion) => void,
): Promise<() => void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const label = getCurrentWindow().label;
  let aktiv = false;
  const anmeldung = hoereImEigenenFenster<typeof NACHRICHT, MarkierungsAktion>(
    NACHRICHT,
    (event) => {
      const payload = event.payload;
      if (!aktiv || payload.empfaengerLabel !== label || !payload.kennung || !payload.senderLabel)
        return;
      if (!angenommen.has(payload.kennung)) {
        try {
          uebernehme(payload.aktion);
        } catch {
          return;
        }
        angenommen.add(payload.kennung);
      }
      try {
        void sendeAnFenster(payload.senderLabel, BESTAETIGUNG, {
          kennung: payload.kennung,
          empfaengerLabel: label,
        }).catch(() => {});
      } catch {
        /* Auch ein synchroner IPC-Fehler lässt die Übernahme bestehen. */
      }
    },
  );
  await anmeldung.bereit;
  aktiv = true;
  return () => {
    aktiv = false;
    meldeAb(anmeldung.abmelden);
  };
}

/** Anzeige unabhängig vom Historienabschluss; auch hängendes IPC hält ihn nicht auf. */
export function meldeMarkierungsAnzeigeAenderung(gesetz: Gesetzesreferenz): void {
  void (async () => {
    await sendeGlobal('markierungen-geaendert', { gesetz });
  })().catch((fehler) => {
    console.error('Änderung der Markierungen konnte nicht gemeldet werden:', fehler);
  });
}
