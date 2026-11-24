// gesetzAktualisierungDispatch.ts
//
// Wählt bei Einzel- und Sammelaktualisierungen die Quelle anhand des
// gespeicherten Gesetzes. Die Quellenmodule werden erst bei Bedarf geladen;
// eine Bund-Aktualisierung lädt daher den BW-Importer nicht mit.
// Vorgangsregistrierung und Gesetzsperre gelten auch für Einzelaufrufe.

import type { GesetzAktualisierungsBestand } from '@/lib/domain/gesetzTypes';
import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  IMPORTINDEX_KATEGORIEN,
  NORMGEBER_DE_BUND,
  NORMGEBER_DE_BW,
  NORMGEBER_EU,
} from '@/lib/domain/normgeber';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import {
  mitReferenzKontext,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  erzeugeAktionsMeldungsWeiterleitung,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import {
  versucheGesetzSperreZuErhalten,
  gibGesetzSperreFrei,
  mitManuellemImportVorgang,
  mitAutomatischemImportVorgang,
} from '@/lib/import/dispatch/importVorgang';
import { parallelMitLimit, pruefeQuelleErreichbar } from '@/lib/import/basis/basis.index';
import {
  baueAktualisierungsNachricht,
  type AktualisierungsKategorie,
} from '@/lib/import/dispatch/aktualisierungsNachricht';
import { ermittleAktualisierbareGesetze } from './aktualisierungsKandidaten';
import { erstelleFehlersicherenFortschritt } from '@/lib/import/dispatch/fortschritt';
import type {
  AktualisierungsErgebnis,
  AutomatischeAktualisierungErgebnis,
  GesetzAktualisierungsErgebnis,
  ImportFehler,
  ImportFehlerGrund,
} from '@/lib/import/importVertrag.types';
import type { MeldungsGrund } from '@/lib/domain/app/aktionsMeldung';

/** Gruppe der Bannergliederung für ein nicht aktualisiertes Gesetz. */
function aktualisierungsfehlerGrund(grund: ImportFehlerGrund): MeldungsGrund {
  if (grund === 'keineVerbindung' || grund === 'beschaeftigt') return grund;
  return grund === 'download' ? 'downloadFehlgeschlagen' : 'aktualisierungFehlgeschlagen';
}

/**
 * Aktualisiert ein einzelnes Gesetz vom Internet – wählt anhand von
 * `gesetz.normgeber` automatisch zwischen Bund (gesetze-im-internet.de),
 * Landesrecht BW (landesrecht-bw.de) und EU (EUR-Lex).
 *
 * `fortschritt` (import.index.ts: aktualisiereGesetz) meldet 'laden' vor dem
 * Download/Vergleich und 'ok'/'fehler' danach – der Aufrufer bekommt das
 * vollständige Ergebnis ohnehin über den Rückgabewert, der Callback dient
 * hier nur der Lade-Anzeige währenddessen.
 */
export async function aktualisiereGesetz(
  gesetz: GesetzAktualisierungsBestand,
  fortschritt?: (status: 'laden' | 'ok' | 'fehler') => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis> {
  return mitManuellemImportVorgang(() =>
    mitReferenzKontext(
      (kontext) => aktualisiereGesetzOhneVorgang(gesetz, kontext, fortschritt, meldungEmpfangen),
      meldungEmpfangen,
    ),
  );
}

async function aktualisiereGesetzOhneVorgang(
  gesetz: GesetzAktualisierungsBestand,
  kontext: ReferenzKontext,
  fortschritt?: (status: 'laden' | 'ok' | 'fehler') => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis> {
  const normgeber = gesetz.normgeber;
  if (
    normgeber !== NORMGEBER_DE_BUND &&
    normgeber !== NORMGEBER_DE_BW &&
    normgeber !== NORMGEBER_EU
  ) {
    fortschritt?.('fehler');
    return {
      art: 'fehler',
      fehler: { grund: 'format', meldung: 'Ungültiger oder fehlender Normgeber im Gesetz-XML.' },
    };
  }
  // Verhindert, dass dasselbe Gesetz gleichzeitig ein zweites Mal
  // aktualisiert (oder importiert, siehe gesetzImportDispatch.ts – dieselbe
  // Sperre) wird – z.B. Hintergrund-Aktualisierung und ein manueller Aufruf
  // aus dem Verweismarkierungfenster für dasselbe Gesetz. Hier zentral statt in
  // aktualisiereGesetze UND jedem manuellen Aufrufer einzeln,
  // da beide Pfade über diese Funktion laufen (siehe Dateikopf-Kommentar).
  if (!(await versucheGesetzSperreZuErhalten(gesetz))) {
    fortschritt?.('fehler');
    return {
      art: 'fehler',
      fehler: {
        grund: 'beschaeftigt',
        meldung: `${gesetz.kurztitel} wird bereits an anderer Stelle aktualisiert.`,
      },
    };
  }

  try {
    fortschritt?.('laden');
    let ergebnis: AktualisierungsErgebnis;
    try {
      if (normgeber === NORMGEBER_DE_BW) {
        const { aktualisierungGesetzVomInternetBW } = await import('@/lib/import/bw/bw.index');
        ergebnis = await aktualisierungGesetzVomInternetBW(
          gesetz,
          undefined,
          kontext,
          meldungEmpfangen,
        );
      } else if (normgeber === NORMGEBER_EU) {
        const { aktualisierungVomInternetEU } = await import('@/lib/import/eu/eu.index');
        ergebnis = await aktualisierungVomInternetEU(gesetz, undefined, kontext, meldungEmpfangen);
      } else {
        const { aktualisierungVomInternet } = await import('@/lib/import/bund/bund.index');
        ergebnis = await aktualisierungVomInternet(gesetz, undefined, kontext, meldungEmpfangen);
      }
    } catch (ursache) {
      const fehler: ImportFehler = {
        grund: 'sonstiger',
        meldung: ursache instanceof Error ? ursache.message : String(ursache),
      };
      fortschritt?.('fehler');
      return { art: 'fehler', fehler };
    }

    fortschritt?.(ergebnis.art === 'fehler' ? 'fehler' : 'ok');
    return ergebnis;
  } finally {
    await gibGesetzSperreFrei(gesetz);
  }
}

// ---------------------------------------------------------------------------
// Batch-Aktualisierung (useHintergrundAktualisierung.ts)
// ---------------------------------------------------------------------------
//
// Die Sammelaktualisierung nutzt dieselbe Quellenwahl und Gesetzsperre wie
// der Einzelaufruf; pro Gesetz werden Ergebnis und Fortschritt gesammelt.

export type HintergrundAktualisierungsErgebnis = GesetzAktualisierungsErgebnis;

/** Aktualisiert alle übergebenen Kandidaten und aggregiert das Ergebnis –
 *  fachlich identisch zu AktualisierenOverlay.alleAktualisieren (gleiche
 *  Quellfunktionen, gleiche Parallelisierung mit limit 10, siehe
 *  parallelMitLimit.ts-Kommentar), nur ohne die dortige Pro-Zeile-UI. Fehler
 *  einzelner Gesetze werden bewusst verschluckt (nur gezählt, nicht
 *  geworfen) – ein einzelnes nicht erreichbares Gesetz darf die übrigen
 *  Aktualisierungen nicht verhindern, analog zum Overlay-Verhalten.
 *
 *  `fortschritt` (import.index.ts: aktualisiereGesetze) meldet pro Gesetz
 *  'laden' vor dem Start und 'ok'/'fehler' danach samt Ergebnis – Grundlage
 *  für AktualisierenOverlay.tsx, das darüber pro Zeile Kategorie bzw.
 *  Fehlertext anzeigt (siehe Absprache/Entwurf: ohne das Ergebnis ließe sich
 *  das aus dem Aggregat-Rückgabewert nicht mehr pro Zeile rekonstruieren). */
export async function aktualisiereGesetze(
  kandidaten: GesetzAktualisierungsBestand[],
  fortschritt?: (
    gesetz: Gesetzesreferenz,
    status: 'laden' | 'ok' | 'fehler',
    ergebnis?: { kategorie: AktualisierungsKategorie } | ImportFehler,
  ) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<HintergrundAktualisierungsErgebnis> {
  return mitManuellemImportVorgang(() =>
    mitReferenzKontext(
      (kontext) =>
        aktualisiereGesetzeOhneVorgang(kandidaten, kontext, fortschritt, meldungEmpfangen),
      meldungEmpfangen,
    ),
  );
}

async function aktualisiereGesetzeOhneVorgang(
  kandidaten: GesetzAktualisierungsBestand[],
  kontext: ReferenzKontext,
  fortschritt?: (
    gesetz: Gesetzesreferenz,
    status: 'laden' | 'ok' | 'fehler',
    ergebnis?: { kategorie: AktualisierungsKategorie } | ImportFehler,
  ) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<HintergrundAktualisierungsErgebnis> {
  const erfolge: { kurztitel: string; kategorie: AktualisierungsKategorie }[] = [];
  const aktualisierteReferenzen: Gesetzesreferenz[] = [];
  const unveraenderteGesetze: GesetzDarstellung[] = [];
  const fehlgeschlagene: { gesetz: Gesetzesreferenz; fehler: ImportFehler }[] = [];
  const { melden: meldeFortschritt, wirfErstenFehler } =
    erstelleFehlersicherenFortschritt<Parameters<NonNullable<typeof fortschritt>>>(fortschritt);

  await parallelMitLimit(kandidaten, 10, async (gesetz) => {
    meldeFortschritt(gesetz, 'laden');
    // Ohne eigenen fortschritt-Callback aufgerufen: der 'laden'/'ok'/'fehler'-
    // Status wird bereits hier auf Batch-Ebene gemeldet (mit Gesetzesreferenz
    // + ergebnis), ein zusätzlicher Aufruf aus aktualisiereGesetz
    // selbst (nur status, keine Gesetzesreferenz/Ergebnis) würde denselben
    // Übergang doppelt und mit unterschiedlicher Signatur melden.
    let ergebnis;
    try {
      ergebnis = await aktualisiereGesetzOhneVorgang(
        gesetz,
        kontext,
        undefined,
        erzeugeAktionsMeldungsWeiterleitung(meldungEmpfangen, (meldung) => {
          const kurzpraefix = `${gesetz.kurztitel}: `;
          const text = meldung.text.startsWith(kurzpraefix)
            ? meldung.text.slice(kurzpraefix.length)
            : meldung.text;
          meldungEmpfangen?.({
            ...meldung,
            betroffen: meldung.betroffen ?? (meldung.grund ? gesetz.kurztitel : undefined),
            text: `${gesetz.kurztitel} (${gesetz.normgeber}): ${text}`,
          });
        }),
      );
    } catch (ursache) {
      const fehler = {
        meldung: ursache instanceof Error ? ursache.message : String(ursache),
        grund: 'sonstiger' as const,
      };
      fehlgeschlagene.push({ gesetz, fehler });
      meldeFortschritt(gesetz, 'fehler', fehler);
      return;
    }

    if (ergebnis.art === 'fehler') {
      meldungEmpfangen?.({
        grund: aktualisierungsfehlerGrund(ergebnis.fehler.grund),
        betroffen: gesetz.kurztitel,
        detail: ergebnis.fehler.meldung,
        text: `${gesetz.kurztitel} (${gesetz.normgeber}): ${ergebnis.fehler.meldung}`,
        typ: 'fehler',
        art: 'fehler',
        anlass: 'import',
        aenderungsstand: 'keine',
      });
      meldeFortschritt(gesetz, 'fehler', ergebnis.fehler);
      fehlgeschlagene.push({ gesetz, fehler: ergebnis.fehler });
      return;
    }

    meldeFortschritt(gesetz, 'ok', { kategorie: ergebnis.kategorie });
    erfolge.push({ kurztitel: gesetz.kurztitel, kategorie: ergebnis.kategorie });
    if (ergebnis.kategorie === 'unveraendert') {
      unveraenderteGesetze.push(ergebnis.gesetz);
    } else {
      aktualisierteReferenzen.push(referenzVon(gesetz));
    }
  });

  wirfErstenFehler();

  return {
    aktualisierteReferenzen,
    unveraenderteGesetze,
    fehlgeschlagene,
    nachricht: baueAktualisierungsNachricht(erfolge),
  };
}

/** Prüft jede benötigte Quelle einmal und behält nur Gesetze erreichbarer Quellen.
 *  Nicht unterstützte Normgeber bleiben unverändert (sie filtert die Kandidatenauswahl).
 *  Verbindungsausfälle sind still; andere Fehler der Prüfung werden weitergegeben. */
async function filtereErreichbareQuellen(
  gesetze: LesbarerSuchverzeichniseintrag[],
): Promise<LesbarerSuchverzeichniseintrag[]> {
  const quellen = IMPORTINDEX_KATEGORIEN.filter((normgeber) =>
    gesetze.some((gesetz) => gesetz.normgeber === normgeber),
  );
  const erreichbar = new Set<string>();
  // Nacheinander: ein Ausfall kostet höchstens die Frist je Quelle, im Hintergrund unkritisch.
  for (const normgeber of quellen) {
    if (!(await pruefeQuelleErreichbar(normgeber)).fehler) erreichbar.add(normgeber);
  }
  return gesetze.filter((gesetz) => erreichbar.has(gesetz.normgeber));
}

/** Registriert vor der Indexvorprüfung; Freigabe bei jedem Abschluss, keine verschachtelte Registrierung. */
export async function aktualisiereGesetzeAutomatisch(
  faelligeGesetze: LesbarerSuchverzeichniseintrag[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AutomatischeAktualisierungErgebnis> {
  const vorgang = await mitAutomatischemImportVorgang<AutomatischeAktualisierungErgebnis>(
    async () => {
      const erreichbare = await filtereErreichbareQuellen(faelligeGesetze);
      if (erreichbare.length === 0) return { art: 'keineVerbindung' };
      const auswahl = await ermittleAktualisierbareGesetze(erreichbare);
      if (auswahl.art === 'importindexNichtLesbar') return auswahl;
      const ergebnis = await mitReferenzKontext(
        (kontext) =>
          aktualisiereGesetzeOhneVorgang(auswahl.kandidaten, kontext, undefined, meldungEmpfangen),
        meldungEmpfangen,
      );
      return { art: 'ausgefuehrt', ergebnis };
    },
  );
  return vorgang.gestartet ? vorgang.ergebnis : { art: 'zurueckgestellt' };
}
