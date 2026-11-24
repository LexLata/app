// markierungSpeicher.ereignisse.ts
//
// Subscriber-Kanäle für "eine oder mehrere Markierungen eines Gesetzes
// wurden geschrieben" – analog zu gesetzSpeicherEreignisse.ts (persistenz/
// gesetz), aber innerhalb von markierungen: markierungSpeicher.ts/
// .hinzufuegen.ts/.undo.ts sowie dateiimport/markierungSpeicher.dateiImport.ts
// müssen nach jedem tatsächlichen Schreibvorgang eine Markierungskonflikt-
// Neuprüfung anstoßen (markierungskonflikte/markierungskonflikteSpeicher.ts) – OHNE
// dorthin zu importieren: markierungskonflikteSpeicher.ts importiert bereits
// WERTSEITIG aus markierungSpeicher.ts (ladeEintraege, MARKIERUNGEN_ORDNER),
// ein echter oder dynamischer Gegen-Import hier würde einen zirkulären
// Modul-Import erzeugen.
//
// Zwei Kanäle für die zwei tatsächlich vorkommenden Prüf-Granularitäten
// (siehe markierungskonflikteSpeicher.ts, Kopfkommentar zu
// pruefeEineMarkierungSelektiv/pruefeMarkierungenSelektiv):
//   - beiMarkierungGeaendert: GENAU EIN geänderter Eintrag (entferneMarkierung/
//     aktualisiereZielnorm/aktualisiereKommentar in markierungSpeicher.ts,
//     Undo-Wiederherstellung in markierungSpeicher.undo.ts) – prüft
//     zusätzlich auch innerhalb des Gesetzes nur den einen Eintrag neu.
//   - beiMarkierungenBulkGeaendert: MEHRERE Einträge desselben Gesetzes auf
//     einmal (Datei-Import in markierungSpeicher.dateiImport.ts, Kombinieren/
//     Aufsplitten in markierungSpeicher.hinzufuegen.ts) – der Norminhalt des
//     betroffenen Gesetzes selbst ändert sich dabei nie, siehe
//     nurEigeneMarkierungen in markierungskonflikteSpeicher.ts.
//
// WICHTIG: Diese Datei darf NICHTS aus markierungSpeicher.ts oder aus
// markierungskonflikte/* importieren (auch nicht dynamisch) – sonst entsteht
// derselbe Zirkelbezug, den dieser Kanal gerade vermeiden soll.

import { alsFehler } from '@/lib/utils/fehler';
import {
  erfasseAktionsFolgelauf,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
type EinzelSubscriber = (
  gesetz: Gesetzesreferenz,
  schluessel: string,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
) => void | Promise<void>;
type BulkSubscriber = (
  gesetz: Gesetzesreferenz,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
) => void | Promise<void>;

const einzelSubscriber = new Set<EinzelSubscriber>();
const bulkSubscriber = new Set<BulkSubscriber>();

/** Meldet eine Funktion an, die aufgerufen wird, sobald GENAU EIN
 *  Markierungs-Eintrag eines Gesetzes geschrieben wurde. Gibt eine
 *  Abmeldefunktion zurück. */
export function beiMarkierungGeaendert(fn: EinzelSubscriber): () => void {
  einzelSubscriber.add(fn);
  return () => einzelSubscriber.delete(fn);
}

/** Benachrichtigt alle über beiMarkierungGeaendert angemeldeten Subscriber –
 *  EINZIGER Aufrufort in markierungSpeicher.ts/markierungSpeicher.undo.ts. */
export function meldeMarkierungGeaendert(
  gesetz: Gesetzesreferenz,
  schluessel: string,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<unknown[]> {
  const lauf = benachrichtige(
    [...einzelSubscriber].map(
      (fn) => () =>
        meldungEmpfangen
          ? fn(gesetz, schluessel, vorgang, meldungEmpfangen)
          : vorgang === undefined
            ? fn(gesetz, schluessel)
            : fn(gesetz, schluessel, vorgang),
    ),
  );
  erfasseBenachrichtigungsAbschluss(meldungEmpfangen, lauf);
  return lauf;
}

/** Meldet eine Funktion an, die aufgerufen wird, sobald mehrere
 *  Markierungs-Einträge desselben Gesetzes auf einmal geschrieben wurden.
 *  Gibt eine Abmeldefunktion zurück. */
export function beiMarkierungenBulkGeaendert(fn: BulkSubscriber): () => void {
  bulkSubscriber.add(fn);
  return () => bulkSubscriber.delete(fn);
}

/** Benachrichtigt alle über beiMarkierungenBulkGeaendert angemeldeten
 *  Subscriber – EINZIGER Aufrufort in markierungSpeicher.hinzufuegen.ts/
 *  dateiimport/markierungSpeicher.dateiImport.ts. */
export function meldeMarkierungenBulkGeaendert(
  gesetz: Gesetzesreferenz,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<unknown[]> {
  const lauf = benachrichtige(
    [...bulkSubscriber].map(
      (fn) => () =>
        meldungEmpfangen
          ? fn(gesetz, vorgang, meldungEmpfangen)
          : vorgang === undefined
            ? fn(gesetz)
            : fn(gesetz, vorgang),
    ),
  );
  erfasseBenachrichtigungsAbschluss(meldungEmpfangen, lauf);
  return lauf;
}

/** Synchrone Zustellung; asynchrone Prüfungen bleiben lokal abwartbar, ohne neue Queue. */
function benachrichtige(aktionen: (() => void | Promise<void>)[]): Promise<unknown[]> {
  const ergebnisse = aktionen.map((aktion) => {
    try {
      return Promise.resolve(aktion()).catch((fehler) => {
        console.error('Markierungsänderung: Benachrichtigung fehlgeschlagen.', fehler);
        throw fehler;
      });
    } catch (fehler) {
      console.error('Markierungsänderung: Benachrichtigung fehlgeschlagen.', fehler);
      return Promise.reject(alsFehler(fehler));
    }
  });
  return Promise.allSettled(ergebnisse).then((abgeschlossen) =>
    abgeschlossen.flatMap((ergebnis) => {
      if (ergebnis.status === 'fulfilled') return [];
      const grund: unknown = ergebnis.reason;
      return [grund];
    }),
  );
}

/** Der bisherige Fehlerlistenvertrag bleibt für direkte Aufrufer erhalten;
 * der ausdrücklich übergebene Besitzer erhält zusätzlich die Ablehnung. */
function erfasseBenachrichtigungsAbschluss(
  empfangen: AktionsMeldungEmpfaenger | undefined,
  lauf: Promise<unknown[]>,
): void {
  erfasseAktionsFolgelauf(
    empfangen,
    lauf.then((fehler) => {
      if (fehler.length) throw new AggregateError(fehler, fehler.map(String).join('; '));
    }),
  );
}
