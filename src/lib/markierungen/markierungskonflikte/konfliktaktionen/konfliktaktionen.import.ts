// Konfliktaktionen: import; nutzt gemeinsame Helfer ohne eigenen Zustand.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import {
  importiereGesetzesreferenzen,
  type ImportFehler,
  type ImportFehlerGrund,
  type ImportFehlerKategorie,
} from '@/lib/import/import.index';
import { pruefeMarkierungenSelektiv } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.selektiv';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';

import { ermittleFehlendeGesetze } from './konfliktaktionen';
export interface ImportBerichtEintrag {
  gesetz: Gesetzesreferenz;
  erfolg: boolean;
  /** Bestätigter Dispatchabschluss; vorhandener Bestand allein beweist keinen Import. */
  gespeichert?: true;
  fehler?: string;
  /** Nur bei erfolg === false gesetzt; aus dem stabilen Importfehlergrund abgeleitet. */
  kategorie?: ImportFehlerKategorie;
}

function berichtskategorie(grund: ImportFehlerGrund): ImportFehlerKategorie {
  const fehler: Pick<ImportFehler, 'grund'> = { grund };
  return fehler.grund === 'keineVerbindung' || fehler.grund === 'nichtImIndex'
    ? fehler.grund
    : 'sonstiger';
}

/** Importiert deduplizierte Gesetzesreferenzen in den bestehenden zwei Durchgängen. */
export async function importFehlenderNormen(
  gesetzListe: Gesetzesreferenz[],
  fortschritt?: (bericht: ImportBerichtEintrag) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportBerichtEintrag[]> {
  const ergebnisse: ImportBerichtEintrag[] = [];
  const versucht = new Set<string>();

  async function pruefeImportFolge<T>(aktion: () => Promise<T>): Promise<{ ergebnis: T } | null> {
    try {
      return { ergebnis: await aktion() };
    } catch (fehler) {
      if (!meldungEmpfangen || !ergebnisse.some((e) => e.gespeichert)) throw fehler;
      meldePersistenzBefund(
        {
          text: 'Mindestens ein Gesetz wurde importiert. Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden. Bitte „Alle Markierungen neu prüfen“ ausführen.',
          typ: 'warnung',
          art: 'hinweis',
          anlass: 'pruefabschluss',
          grund: 'konfliktpruefungOffen',
          aenderungsstand: 'vollstaendig',
        },
        meldungEmpfangen,
      );
      return null;
    }
  }

  async function durchgang(liste: Gesetzesreferenz[]): Promise<boolean> {
    for (const gesetz of liste) versucht.add(gesetzesreferenzSchluessel(gesetz));
    const abschluesse = await importiereGesetzesreferenzen(
      liste,
      (gesetz, ergebnis) => {
        const eintrag: ImportBerichtEintrag =
          ergebnis.art === 'fehler'
            ? {
                gesetz,
                erfolg: false,
                fehler: ergebnis.fehler.meldung,
                kategorie: berichtskategorie(ergebnis.fehler.grund),
              }
            : istGleichesGesetz(gesetz, ergebnis.gesetz)
              ? { gesetz, erfolg: true }
              : {
                  gesetz,
                  erfolg: false,
                  fehler: 'Das angeforderte Gesetz konnte nicht importiert werden.',
                  kategorie: 'sonstiger',
                };
        ergebnisse.push(eintrag);
        fortschritt?.(eintrag);
      },
      ...(meldungEmpfangen ? [meldungEmpfangen] : []),
    );
    for (const { referenz, ergebnis } of abschluesse ?? []) {
      if (!ergebnis.importergebnis?.erfolgreiche.some((g) => istGleichesGesetz(g, referenz)))
        continue;
      const eintrag = ergebnisse.find((e) => istGleichesGesetz(e.gesetz, referenz));
      if (eintrag) eintrag.gespeichert = true;
      if (ergebnis.art === 'fehler')
        meldePersistenzBefund(
          {
            text: `Das Gesetz ${referenz.kurztitel} wurde importiert. Das anschließende Laden konnte jedoch nicht zuverlässig abgeschlossen werden.`,
            typ: 'warnung',
            art: 'hinweis',
            anlass: 'lesen',
            aenderungsstand: 'vollstaendig',
          },
          meldungEmpfangen,
        );
    }
    const erfolgreiche = ergebnisse
      .filter((e) => e.erfolg && liste.some((g) => istGleichesGesetz(g, e.gesetz)))
      .map((e) => e.gesetz);
    if (erfolgreiche.length > 0) {
      const pruefung = await pruefeImportFolge(() =>
        pruefeMarkierungenSelektiv(
          erfolgreiche,
          ...(meldungEmpfangen ? [{ meldungEmpfangen }] : []),
        ),
      );
      if (!pruefung) return false;
    }
    return true;
  }

  if (!(await durchgang(gesetzListe))) return ergebnisse;

  const { ladeMarkierungskonflikteFuerAnzeige } =
    await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
  const anzeige = await pruefeImportFolge(() =>
    ladeMarkierungskonflikteFuerAnzeige(meldungEmpfangen),
  );
  if (!anzeige) return ergebnisse;
  const aktuelleKonflikte = anzeige.ergebnis;
  const neuFehlende = ermittleFehlendeGesetze(aktuelleKonflikte.gesetze).filter(
    (k) => !versucht.has(gesetzesreferenzSchluessel(k)),
  );
  if (neuFehlende.length > 0) {
    await durchgang(neuFehlende);
  }

  return ergebnisse;
}
