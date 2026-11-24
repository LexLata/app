// Konfliktaktionen: loeschen; nutzt gemeinsame Helfer ohne eigenen Zustand.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { aendereEintraege, entferneMarkierung } from '@/lib/markierungen/eintrag/eintrag.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { loescheMarkierungsDatei } from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/markierungskonflikteAktionen';
import type { AnzeigeGesetzKonflikte } from '@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige';
import { verifiziereBekannteKonflikte } from '@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige';
import { reiheInPruefungsKetteEin } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefkette';
import { pruefeAlleMarkierungen } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefsteuerung';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';

import {
  ladeLiveEintrag,
  pruefeNachLoeschung,
  synceMarkierungsAenderung,
} from './konfliktaktionen';
// ---------------------------------------------------------------------------
// Aktionen für einen MARKIERUNGSDATENSATZ (gesetzFehlt)
// ---------------------------------------------------------------------------

/** Löscht nach Bestätigung den ganzen Datensatz und synchronisiert nach dem Prüfabschluss. */
async function loescheDatensatz(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  await loescheMarkierungsDatei(gesetz, ...(meldungEmpfangen ? [meldungEmpfangen] : []));
  await pruefeNachLoeschung(
    () => reiheInPruefungsKetteEin(async () => {}, true, false, false, false, meldungEmpfangen),
    meldungEmpfangen,
  );
  await synceMarkierungsAenderung(gesetz, meldungEmpfangen);
  return true;
}

// ---------------------------------------------------------------------------
// Aktionen für EINE MARKIERUNG (alle Typen)
// ---------------------------------------------------------------------------

/** "Markierung löschen" – betrifft genau EINEN Eintrag, daher die günstigste
 *  Prüf-Variante (siehe Kopfkommentar). */
async function loescheMarkierung(
  gesetz: Gesetzesreferenz,
  schluessel: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  const live = await ladeLiveEintrag(gesetz, schluessel, meldungEmpfangen);
  // Auch eine zwischenzeitliche Löschung muss den bekannten Konflikt entfernen.
  if (!live) {
    await verifiziereBekannteKonflikte(meldungEmpfangen);
    await synceMarkierungsAenderung(gesetz, meldungEmpfangen, false);
    return false;
  }
  // entferneMarkierung löst die Konfliktprüfung für GENAU diesen Eintrag
  // jetzt selbst zentral aus (siehe markierungSpeicher.ts) – kein expliziter
  // pruefeEineMarkierungSelektiv-Aufruf hier mehr nötig.
  const geaendert = await entferneMarkierung(gesetz, live, meldungEmpfangen);
  await synceMarkierungsAenderung(gesetz, meldungEmpfangen, geaendert);
  return geaendert;
}

/** Entfernt gesetzweit Titelmarkierungen mit einer Bulkoperation. */
async function entferneMarkierungenMitNichtamtlichemTitel(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  return aendereEintraege(
    gesetz,
    (alle) => {
      const verbleibende = alle.filter(
        (e) => e.bezug.textstelle?.pfad.bereich !== 'nichtamtlicherTitel',
      );
      return verbleibende.length === alle.length
        ? { art: 'unveraendert', ergebnis: false }
        : { art: 'geaendert', eintraege: verbleibende, ergebnis: true };
    },
    meldungEmpfangen,
  );
}

/** Entfernt alle Markierungen nichtamtlicher Titel dieses Gesetzes. */
async function loescheMarkierungenNichtamtlicherTitel(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  const geaendert = await entferneMarkierungenMitNichtamtlichemTitel(gesetz, meldungEmpfangen);
  // Betrifft potenziell MEHRERE Einträge auf einmal (alle mit
  // Bereich nichtamtlicherTitel), daher pruefeMarkierungenSelektiv statt der auf
  // genau einen Eintrag zugeschnittenen pruefeEineMarkierungSelektiv.
  await pruefeNachLoeschung(
    () => reiheInPruefungsKetteEin(async () => {}, true, false, false, false, meldungEmpfangen),
    meldungEmpfangen,
    geaendert,
  );
  await synceMarkierungsAenderung(gesetz, meldungEmpfangen, geaendert);
  return geaendert;
}

/** Gesetzweiter Datensatz, Einzelmarkierung oder alle nichtamtlichen Titelmarkierungen. */
export type MarkierungsAuswahl =
  | { art: 'datensatz'; gesetz: Gesetzesreferenz }
  | { art: 'markierung'; gesetz: Gesetzesreferenz; schluessel: string }
  | { art: 'nichtamtlicheTitelXmlFehlt'; gesetz: Gesetzesreferenz };

/**
 * Löscht je nach `auswahl` einen kompletten Datensatz (ganze Gesetz-Datei,
 * gesetzFehlt), einen einzelnen Eintrag, oder alle Markierungen mit
 * nichtamtlichem Titel eines Gesetzes (nichtamtlicheTitelXmlFehlt) – ersetzt die drei
 * früheren Einzelfunktionen loescheDatensatz/loescheMarkierung/
 * loescheMarkierungenNichtamtlicherTitel (bleiben als interne Bausteine
 * erhalten, siehe oben).
 */
export async function loescheAusgewaehlt(
  auswahl: MarkierungsAuswahl,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  switch (auswahl.art) {
    case 'datensatz':
      return loescheDatensatz(auswahl.gesetz, meldungEmpfangen);
    case 'markierung':
      return loescheMarkierung(auswahl.gesetz, auswahl.schluessel, meldungEmpfangen);
    case 'nichtamtlicheTitelXmlFehlt':
      return loescheMarkierungenNichtamtlicherTitel(auswahl.gesetz, meldungEmpfangen);
  }
}

/** Löscht jede angezeigte Konfliktmarkierung einmal; fehlende Datensätze und Titeldateien gesetzweit. */
export async function loescheAlleMitKonflikten(
  gesetze: AnzeigeGesetzKonflikte[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  // Ein Gesetz kann Titeldatei- und Einzelkonflikte zugleich enthalten.
  const betroffeneKurztitel = new Map<string, Gesetzesreferenz>();
  let geaendert = false;
  try {
    for (const g of gesetze) {
      if (g.fehlendesGesetz) {
        await loescheMarkierungsDatei(g.gesetz, meldungEmpfangen);
        geaendert = true;
        betroffeneKurztitel.set(gesetzesreferenzSchluessel(g.gesetz), g.gesetz);
        continue;
      }
      const schluessel = new Set(g.eintraege.map((e) => e.schluessel));
      if (!g.nichtamtlicheTitelXmlFehlt && schluessel.size === 0) continue;
      const geloescht = await aendereEintraege(
        g.gesetz,
        (alle) => {
          const verbleibende = alle.filter(
            (e) =>
              !(
                g.nichtamtlicheTitelXmlFehlt &&
                e.bezug.textstelle?.pfad.bereich === 'nichtamtlicherTitel'
              ) && !schluessel.has(identitaetsSchluessel(e)),
          );
          return verbleibende.length === alle.length
            ? { art: 'unveraendert', ergebnis: false }
            : { art: 'geaendert', eintraege: verbleibende, ergebnis: true };
        },
        meldungEmpfangen,
      );
      geaendert ||= geloescht;
      betroffeneKurztitel.set(gesetzesreferenzSchluessel(g.gesetz), g.gesetz);
    }
  } catch (fehler) {
    if (geaendert)
      meldePersistenzBefund(
        {
          text: 'Ein Teil der Markierungen wurde gelöscht. Die übrigen Markierungen konnten nicht vollständig gelöscht werden.',
          typ: 'warnung',
          art: 'hinweis',
          anlass: 'synchronisation',
          aenderungsstand: 'teilweise',
        },
        meldungEmpfangen,
      );
    for (const gesetz of betroffeneKurztitel.values()) {
      try {
        await synceMarkierungsAenderung(gesetz, meldungEmpfangen);
      } catch (syncfehler) {
        console.error('Teillöschung konnte nicht synchronisiert werden:', syncfehler);
      }
    }
    throw fehler;
  }

  await pruefeNachLoeschung(
    () => pruefeAlleMarkierungen(meldungEmpfangen),
    meldungEmpfangen,
    geaendert,
  );

  for (const gesetz of betroffeneKurztitel.values()) {
    await synceMarkierungsAenderung(gesetz, meldungEmpfangen);
  }
  return geaendert;
}
