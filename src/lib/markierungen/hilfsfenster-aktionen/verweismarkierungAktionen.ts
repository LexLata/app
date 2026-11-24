// verweismarkierungAktionen.ts
//
// Kernlogik von speichern()/importVersuchen() aus VerweismarkierungFenster.tsx
// ausgelagert (500-Zeilen-Richtwert) – als Funktionen mit explizit
// übergebenem Kontext statt Closures über Komponenten-State (analog zum
// bereits etablierten Muster in konfliktaktionen.ts). Die
// Komponente selbst bleibt für State-Updates (setLaeuft/setFehler/…)
// zuständig und ruft diese Funktionen nur noch auf – siehe dortige
// Wrapper-Funktionen speichern()/importVersuchen().
//
// speichereVerweismarkierung ist bewusst nur noch ein dünner Orchestrator: die
// eigentliche Fachlogik steckt in zwei ausgelagerten Dateien (Cognitive-
// Complexity-Refactor, ursprünglich eine einzige ~370-Zeilen-Funktion mit
// Complexity 68) –
//   - verweismarkierungAktionen.zitatAufloesung.ts: Ambiguitäten- und
//     Zielnormen-Auflösung (Zitat-Text → Verweisziel[]/ZitatFehler[]).
//   - verweismarkierungAktionen.persistieren.ts: Textbezug/Elementstand-
//     Berechnung sowie das eigentliche Persistieren (Bearbeiten eines
//     bestehenden Verweises ODER Anlegen eines neuen). Definiert dort auch
//     SpeichernErgebnisVerweismarkierung (hier nur re-exportiert) – so bleibt die Import-
//     richtung einseitig (kein Kreis für dependency-cruiser: no-circular).
// Beide Dateien bekommen die dynamisch importierten Domain-Funktionen
// explizit als Parameter (Parameter-Injektion statt eigener Importe,
// analog zu versucheAktualisierung/versucheNeuImport unten) – dadurch sind
// sie ohne vi.mock() direkt testbar.

import {
  erzeugeAktionsMeldungsWeiterleitung,
  type AktionsMeldung,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import { schliesseGespeicherteMarkierungsAktionAb } from './markierungsUebertragung';

import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import { type GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import { ersetzeUnzulaessigeXmlZeichen } from '@/lib/utils/xmlVerarbeitung';
import { type GesetzLadeabschluss } from '@/lib/persistenz/gesetz/gesetz.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { VerweismarkierungKontext } from '@/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext';
import type { VerweisInhalt } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  baueAktualisierungsNachricht,
  type AktualisierungsKategorie,
  type AktualisierungsErgebnis,
  type GesetzesreferenzImportErgebnis,
  type ImportEinzelErgebnis,
} from '@/lib/import/import.index';
import {
  loeseAmbiguitaeten,
  loeseVerweiszieleAuf,
  loeseZielgesetzAuf,
} from './verweismarkierungAktionen.zitatAufloesung';
import {
  baueTextbezugUndElementstand,
  findeMarkierungsAusgangselement,
  ladeGesetzeMitGepruefterAusgangsquelle,
  persistiereBearbeiten,
  persistiereNeuenVerweis,
  type SpeichernErgebnisVerweismarkierung,
  type PersistierenErgebnis,
} from './verweismarkierungAktionen.persistieren';
export type { SpeichernErgebnisVerweismarkierung } from './verweismarkierungAktionen.persistieren';

function uebernehmeGespeicherteZiele(
  kontext: VerweismarkierungKontext,
  text: string,
  gewaehlt: Map<string, Gesetzesreferenz>,
): void {
  if (text === kontext.bearbeiten?.zitatText.trim()) {
    for (const ziel of kontext.bearbeiten.vorher.verweisinhalt.verweisziele) {
      if (!gewaehlt.has(String(ziel.verweistextZeichenbereich[0]))) {
        gewaehlt.set(String(ziel.verweistextZeichenbereich[0]), ziel.gesetz ?? kontext.gesetz);
      }
    }
  }
}

/** Erfolgsantworten gelten ausschließlich für genau die angeforderte Referenz. */
function importFehler(
  gesetz: Gesetzesreferenz,
  ergebnis: ImportEinzelErgebnis,
): string | undefined {
  if (ergebnis.art === 'fehler') return ergebnis.fehler.meldung;
  return istGleichesGesetz(ergebnis.gesetz, gesetz)
    ? undefined
    : 'Das angeforderte Gesetz konnte nicht importiert werden.';
}

// ---------------------------------------------------------------------------
// speichereVerweismarkierung – Kern von speichern() (Parsen, Auflösen, Persistieren)
// ---------------------------------------------------------------------------

/**
 * Parst zitatText, löst jede erkannte Normzahl auf und persistiert das
 * Ergebnis (Bearbeiten-Modus: aktualisiereZielnorm; sonst:
 * hinzufuegenMarkierung) – inkl. Undo-Historie-Meldung ans Aufrufer-Fenster,
 * 'markierungen-geaendert'-Broadcast und selektiver Markierungskonflikt-Prüfung.
 * `fehlgeschlageneImports` (normalisierter Referenzschlüssel → konkreter Fehlertext,
 * z.B. FEHLERTEXT_KEINE_VERBINDUNG) wird NUR gelesen – Mutation bleibt beim
 * Aufrufer (fehlgeschlageneImportsRef in der Komponente).
 */
export async function speichereVerweismarkierung(
  kontext: VerweismarkierungKontext,
  ladeGesetz: GesetzLader,
  zitatText: string,
  textbezug: boolean,
  ohneElementstand: boolean,
  fehlgeschlageneImports: ReadonlyMap<string, string | undefined>,
  gewaehlt = new Map<string, Gesetzesreferenz>(),
  signal?: AbortSignal,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<SpeichernErgebnisVerweismarkierung> {
  const alle = await ladeGesetzeMitGepruefterAusgangsquelle(
    kontext.gesetz,
    ladeGesetz,
    meldungEmpfangen,
  );
  const { verweisZuXmlId, vollstaendigeBezeichnung } = await import('@/lib/domain/norm/norm.index');
  const { berechneElementstand, gesetzNormen } =
    await import('@/lib/domain/gesetzDarstellungAuswertung');
  const { parseZitat, analysiereZitatZiele } = await import('@/lib/markierungen/zitat/zitat.index');
  const { pruefeZusatzangabe, pruefeZusatzangabeMitKette } =
    await import('@/lib/domain/norm/norm.index');

  const text = ersetzeUnzulaessigeXmlZeichen(zitatText).trim();
  const { ladeGesetzeskandidaten } = await import('@/lib/import/import.index');
  const kandidaten = await ladeGesetzeskandidaten(meldungEmpfangen, kontext.gesetz);
  const vorlaeufig = analysiereZitatZiele(text, kandidaten);
  uebernehmeGespeicherteZiele(kontext, text, gewaehlt);
  const auswahl = { kandidaten, gewaehlt };
  // Vorläufige Kandidaten können andere Gesetzesangaben als der endgültige
  // Parse enthalten. Ihre Profilabfrage darf keine bindende Auswahl hinterlegen.
  const profilAuswahl = { kandidaten, gewaehlt: new Map(gewaehlt) };
  // Nur tatsächlich im Zitat bestimmte Zielreferenzen benötigen ihren Text.
  // Der profilfreie Vorlauf kennt auch Canon-Ziele vor der endgültigen Grammatik.
  const geladen = new Set(alle.map((gesetz) => gesetzesreferenzSchluessel(gesetz)));
  for (const zitat of vorlaeufig) {
    const ziel = loeseZielgesetzAuf(zitat, alle, kontext.gesetz, profilAuswahl).referenz;
    if (!ziel || geladen.has(gesetzesreferenzSchluessel(ziel))) continue;
    geladen.add(gesetzesreferenzSchluessel(ziel));
    const ergebnis = await ladeGesetz(ziel, meldungEmpfangen);
    if (ergebnis.status === 'geladen') alle.push(ergebnis.gesetz);
  }
  const verweiszieleFns = {
    verweisZuXmlId,
    gesetzNormen,
    vollstaendigeBezeichnung,
    berechneElementstand,
  };
  // Bei einem bekannten, noch nicht geladenen Canon-Ziel fehlt auch das
  // Profil. Zunächst den Gesetzesfehler melden, damit nach dem Import mit
  // bekanntem Profil erneut geparst wird; keine vorläufigen Ziele speichern.
  const fehlendeCanonZiele = vorlaeufig.filter((zitat) => {
    if (zitat.gesetzRoh === undefined || zitat.praefix?.[0] !== 'Can.') return false;
    const ziel = loeseZielgesetzAuf(zitat, alle, kontext.gesetz, profilAuswahl);
    return ziel.referenz !== undefined && ziel.gefunden === undefined;
  });
  const { zitate: roh, ambiguitaeten } = parseZitat(
    text,
    (zitat) => loeseZielgesetzAuf(zitat, alle, kontext.gesetz, profilAuswahl).gefunden?.normpraefix,
    kandidaten,
  );

  if (roh.length === 0) {
    return {
      art: 'fehler' as const,
      fehler: [{ art: 'sonst' as const, text: 'Es konnte keine Norm erkannt werden.' }],
    };
  }

  const zitate = loeseAmbiguitaeten(
    roh,
    ambiguitaeten,
    alle,
    kontext.gesetz,
    {
      verweisZuXmlId,
      gesetzNormen,
      pruefeZusatzangabe,
      pruefeZusatzangabeMitKette,
    },
    auswahl,
  );

  const { fehlerListe: fehlendeCanonFehler } = loeseVerweiszieleAuf(
    ohneElementstand ? [] : fehlendeCanonZiele,
    alle,
    kontext.gesetz,
    false,
    fehlgeschlageneImports,
    verweiszieleFns,
    profilAuswahl,
  );
  // Innerhalb eines noch unbekannten Canon-Profils ist die endgültige
  // Grammatik nicht bestimmbar. Dort den Gesetzesfehler statt Fehlern aus
  // einzelnen Fragmenten melden; alle übrigen Zitate weiterhin prüfen.
  const zitateFuerAufloesung = ohneElementstand
    ? zitate
    : zitate.filter(
        (zitat) =>
          !fehlendeCanonZiele.some(
            (fehlend) => zitat.textStart >= fehlend.textStart && zitat.textStart < fehlend.textEnde,
          ),
      );
  const { fehlerListe, verweisziele } = loeseVerweiszieleAuf(
    zitateFuerAufloesung,
    alle,
    kontext.gesetz,
    ohneElementstand,
    fehlgeschlageneImports,
    verweiszieleFns,
    auswahl,
  );

  const fehler = [
    ...fehlendeCanonFehler,
    ...fehlerListe.filter(
      (f) =>
        f.art !== 'gesetz' ||
        !fehlendeCanonFehler.some((canon) =>
          canon.gesetz && f.gesetz ? istGleichesGesetz(canon.gesetz, f.gesetz) : false,
        ),
    ),
  ];
  if (fehler.length > 0) {
    return { art: 'fehler' as const, fehler };
  }

  const verweisinhalt: VerweisInhalt = { verweistext: text, verweisziele: verweisziele };

  // Eine Zielauswahl kann auf Nutzerinteraktion warten. Vor der Ableitung
  // der Ausgangsdaten deshalb erneut laden; niemals den Formularkontext nutzen.
  const { findeElementZuBezeichnung, ausgangsstelleNichtEindeutigMeldung } =
    await import('@/lib/markierungen/gemeinsam/gemeinsam.index');
  const { aktuellerTextAnPfad } = await import('@/lib/domain/textpfad/textpfad.index');

  const aktuellerBestand = await ladeGesetzeMitGepruefterAusgangsquelle(
    kontext.gesetz,
    ladeGesetz,
    meldungEmpfangen,
  );
  if (!kontext.bearbeiten && !findeMarkierungsAusgangselement(kontext, aktuellerBestand)) {
    return {
      art: 'fehler',
      fehler: [{ art: 'sonst', text: ausgangsstelleNichtEindeutigMeldung }],
      ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig',
    };
  }

  const { neuerTextbezug, elementstand } = baueTextbezugUndElementstand(
    kontext,
    textbezug,
    aktuellerBestand,
    { findeElementZuBezeichnung, aktuellerTextAnPfad, berechneElementstand },
  );

  let ergebnis: PersistierenErgebnis;
  if (kontext.bearbeiten) {
    const { aktualisiereZielnorm } = await import('@/lib/markierungen/eintrag/eintrag.index');
    ergebnis = await persistiereBearbeiten(
      { ...kontext, bearbeiten: kontext.bearbeiten },
      verweisinhalt,
      neuerTextbezug,
      elementstand,
      aktualisiereZielnorm,
      meldungEmpfangen,
    );
  } else {
    const { hinzufuegenMarkierung } = await import('@/lib/markierungen/eintrag/eintrag.index');
    ergebnis = await persistiereNeuenVerweis(
      kontext,
      verweisinhalt,
      neuerTextbezug,
      elementstand,
      hinzufuegenMarkierung,
      meldungEmpfangen,
    );
  }

  if (ergebnis.art !== 'erfolg' || !ergebnis.aktion) return ergebnis;
  return schliesseGespeicherteMarkierungsAktionAb(ergebnis.aktion, kontext.openerLabel, signal);
}

// ---------------------------------------------------------------------------
// versucheFehlendeGesetzeImportieren – Kern von importVersuchen()
// ---------------------------------------------------------------------------

/** Vollständige Gesetzesreferenz + der konkrete Fehlertext des zuletzt gescheiterten
 *  Import-/Aktualisierungsversuchs (z.B. FEHLERTEXT_KEINE_VERBINDUNG aus
 *  internetVerbindung.ts, oder "„X“ wurde im Importindex … nicht gefunden.") –
 *  fehler ist optional, da ein völlig unerwarteter Fehlschlag ohne
 *  gesetztes ergebnis.fehler theoretisch möglich bleibt. */
interface FehlgeschlagenerImport {
  gesetz: Gesetzesreferenz;
  fehler?: string;
}

/** Flüchtige Arbeitsabschlüsse, unabhängig von Zitat-/Verweisspeicherung und Anzeige.
 * Ein Import kann bereits gespeichert sein, obwohl sein frisches Laden scheitert.
 * Ohne bestätigten Abschluss behaupten wir keinen bestimmten Änderungsstand. */
type ImportVersuchAbschluss = { meldungen: AktionsMeldung[] } & (
  | { gesetz: Gesetzesreferenz; art: 'import'; ergebnis: GesetzesreferenzImportErgebnis }
  | { gesetz: Gesetzesreferenz; art: 'aktualisierung'; ergebnis: AktualisierungsErgebnis }
  | { gesetz: Gesetzesreferenz; art: 'nichtAbgeschlossen'; fehler: string }
);

export interface ImportVersuchErgebnis {
  /** Mindestens ein Ziel ist für eine erneute Zitatprüfung verfügbar;
   * kein Nachweis einer Speicherung oder Inhaltsänderung. */
  mindestensEinErfolg: boolean;
  bestandspruefung: GesetzLadeabschluss;
  /** Zugeordnete Rohbefunde, auch ohne weiterleitenden Empfänger; spätere
   * Folgeläufe ergänzen die Bündel bis zum begrenzten Abschlusswarten. */
  bestandsMeldungen: AktionsMeldung[];
  abschluesse: ImportVersuchAbschluss[];
  aktualisierungsHinweis: string | null;
  /** Gescheiterte Zielvorbereitung, Import-/Aktualisierungsversuche
   *  inkl. konkretem Fehlertext – der Aufrufer trägt diese in seine eigene
   *  fehlgeschlageneImportsRef-Map ein (Mutation bleibt bewusst dort, siehe
   *  Kopfkommentar). */
  neuFehlgeschlagen: FehlgeschlagenerImport[];
}

async function pruefeImportZiel(
  gesetz: Gesetzesreferenz,
  ladeGesetz: GesetzLader,
  bestandspruefung: GesetzLadeabschluss,
  empfangen: AktionsMeldungEmpfaenger | undefined,
) {
  const geladen = await ladeGesetz(gesetz, empfangen);
  bestandspruefung.befunde.push(...geladen.befunde);
  if (geladen.befunde.some((befund) => befund.status === 'ordner_unlesbar'))
    bestandspruefung.ordnerLesbar = false;
  if (geladen.status === 'geladen') bestandspruefung.liste.push(geladen.gesetz);
  return geladen;
}

/**
 * Importiert/aktualisiert alle vollständigen Zielreferenzen (siehe Aufrufer:
 * Ziele aus der aktuellen Fehlerliste) – bei mehreren betroffenen
 * Gesetzen (z.B. "§ 1 ZPO, § 1 StPO" beide noch nicht importiert) werden
 * alle in einem Rutsch versucht (siehe Absprache: Button-Text differenziert
 * nur zwischen "importieren"/"aktualisieren"/"beides", nicht nach EINEM
 * konkreten Gesetz).
 *
 * Bereits installierte Gesetze werden über `aktualisiereGesetz` (vergleichs-
 * basiert, siehe import.index.ts) aktualisiert statt blind neu importiert –
 * sonst würde eine unveränderte Datei ohne Vergleich überschrieben. Fehlende
 * Ziele werden parallel über importiereGesetzesreferenz aus genau der bereits
 * gewählten Quelle importiert; namensgleiche andere Gesetze ersetzen sie nie.
 */
export async function versucheFehlendeGesetzeImportieren(
  zielgesetze: Gesetzesreferenz[],
  ladeGesetz: GesetzLader,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportVersuchErgebnis> {
  const { importiereGesetzesreferenz, aktualisiereGesetz } =
    await import('@/lib/import/import.index');
  // Originalbefunde bleiben beim jeweiligen Arbeitsabschluss. Die Weiterleitung
  // erhält insbesondere die Folgelaufregistrierung; Anzeige und Deduplizierung
  // entscheidet ausschließlich die Ergebnisaufbereitung im Hilfsfenster.
  const empfaengerFuer = (meldungen: AktionsMeldung[]) =>
    erzeugeAktionsMeldungsWeiterleitung(meldungEmpfangen ?? (() => {}), (meldung) => {
      meldungen.push(meldung);
      meldePersistenzBefund(meldung, meldungEmpfangen);
    });
  const bestandsMeldungen: AktionsMeldung[] = [];
  const bestandspruefung: GesetzLadeabschluss = { liste: [], befunde: [], ordnerLesbar: true };
  const abschluesse: ImportVersuchAbschluss[] = [];

  let mindestensEinErfolg = false;
  const neuFehlgeschlagen: FehlgeschlagenerImport[] = [];
  const aktualisierungsErgebnisse: {
    kurztitel: string;
    kategorie: AktualisierungsKategorie;
  }[] = [];
  const neuZuImportieren: Gesetzesreferenz[] = [];

  const nichtAbgeschlossen = (
    gesetz: Gesetzesreferenz,
    fehler: string,
    meldungen: AktionsMeldung[] = [],
  ) => {
    abschluesse.push({ gesetz, meldungen, art: 'nichtAbgeschlossen', fehler });
    neuFehlgeschlagen.push({ gesetz, fehler });
  };

  for (const gesetz of zielgesetze) {
    const geladen = await pruefeImportZiel(
      gesetz,
      ladeGesetz,
      bestandspruefung,
      empfaengerFuer(bestandsMeldungen),
    );
    if (geladen.status === 'nicht-lesbar') {
      nichtAbgeschlossen(gesetz, 'Das Gesetz konnte nicht verlässlich geladen werden.');
      continue;
    }
    const bestehendesGesetz = geladen.status === 'geladen' ? geladen.gesetz : undefined;
    if (!bestehendesGesetz) {
      neuZuImportieren.push(gesetz);
      continue;
    }

    const meldungen: AktionsMeldung[] = [];
    let ergebnis: AktualisierungsErgebnis;
    try {
      ergebnis = await aktualisiereGesetz(bestehendesGesetz, undefined, empfaengerFuer(meldungen));
    } catch (fehler) {
      console.error('Gesetzesaktualisierung konnte nicht abgeschlossen werden:', fehler);
      nichtAbgeschlossen(
        gesetz,
        'Die Aktualisierung konnte nicht abgeschlossen werden.',
        meldungen,
      );
      continue;
    }
    abschluesse.push({ gesetz, art: 'aktualisierung', ergebnis, meldungen });
    const fehler = importFehler(gesetz, ergebnis);
    if (fehler !== undefined) {
      // Siehe ImportVersuchErgebnis.neuFehlgeschlagen: merkt sich den
      // ECHTEN Fehlschlag samt konkretem Fehlertext für die nächste
      // speichern()-Fehlermeldung beim Aufrufer.
      neuFehlgeschlagen.push({
        gesetz,
        fehler,
      });
    } else if (ergebnis.art === 'erfolg') {
      mindestensEinErfolg = true;
      aktualisierungsErgebnisse.push({
        kurztitel: bestehendesGesetz.kurztitel,
        kategorie: ergebnis.kategorie,
      });
    }
  }

  const importErgebnisse = await Promise.all(
    neuZuImportieren.map(async (gesetz): Promise<ImportVersuchAbschluss> => {
      const meldungen: AktionsMeldung[] = [];
      try {
        const ergebnis = await importiereGesetzesreferenz(
          gesetz,
          undefined,
          empfaengerFuer(meldungen),
        );
        return { gesetz, art: 'import', ergebnis, meldungen };
      } catch (fehler) {
        // Alle gestarteten Worker werden abgewartet. Ein unerwarteter Abbruch
        // darf weder andere Abschlüsse noch ihre wichtigen Hinweise verlieren.
        console.error('Gesetzesimport konnte nicht abgeschlossen werden:', fehler);
        return {
          gesetz,
          art: 'nichtAbgeschlossen',
          meldungen,
          fehler: 'Der Import konnte nicht abgeschlossen werden.',
        };
      }
    }),
  );
  importErgebnisse.forEach((abschluss) => {
    abschluesse.push(abschluss);
    const fehler =
      abschluss.art === 'nichtAbgeschlossen'
        ? abschluss.fehler
        : importFehler(abschluss.gesetz, abschluss.ergebnis);
    if (fehler === undefined) {
      mindestensEinErfolg = true;
      return;
    }
    neuFehlgeschlagen.push({ gesetz: abschluss.gesetz, fehler });
  });

  // Hinweis nur, wenn tatsächlich mindestens ein bereits installiertes
  // Gesetz aktualisiert wurde (Neu-Importe haben ihre eigene Erfolgs-
  // Rückmeldung über speichern()/fehler). Wird hinter der bestehenden
  // Fehlermeldung angezeigt (siehe VerweismarkierungFormular.tsx).
  return {
    mindestensEinErfolg,
    bestandspruefung,
    bestandsMeldungen,
    abschluesse,
    aktualisierungsHinweis: baueAktualisierungsNachricht(aktualisierungsErgebnisse),
    neuFehlgeschlagen,
  };
}
