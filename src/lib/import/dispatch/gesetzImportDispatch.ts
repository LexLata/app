// gesetzImportDispatch.ts
//
// Orchestriert Erstimporte aus Bund, BW, Cellar und dem GesetzesXML-Bundle (derzeit EMRK, Normgeber Europarat).
// Automatische Importwahl versucht BW nur bei fehlendem Bundeseintrag.
// Bund/BW suchen anhand des Kurztitels im Importindex; Europa benötigt einen
// vollständigen Eintrag mit CELEX oder Bundle-Dateiname. Der tatsächliche
// Normgeber bestimmt Bestandsreferenz und Gesetzsperre.

import {
  NORMGEBER_EU,
  NORMGEBER_DE_BUND,
  NORMGEBER_DE_BW,
  NORMGEBER_EUROPARAT,
} from '@/lib/domain/normgeber';
import {
  mitReferenzKontext,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import type { GesetzDarstellung, Normgeber } from '@/lib/domain/gesetzTypes';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { parallelMitLimit, berechneImportParallelitaet } from '@/lib/import/basis/basis.index';
import {
  versucheGesetzSperreZuErhalten,
  gibGesetzSperreFrei,
  mitManuellemImportVorgang,
} from '@/lib/import/dispatch/importVorgang';
import type {
  GesetzImportErgebnis,
  GesetzImportEingabe,
  ImportEinzelErgebnis,
  ImportFehler,
  ImportFortschritt,
} from '@/lib/import/importVertrag.types';
import { erstelleFehlersicherenFortschritt } from '@/lib/import/dispatch/fortschritt';

/** Ein einzelner Import-Eintrag – siehe Datei-Kommentar zur Abrufkennung-Auswertung. */
export type { GesetzImportEingabe } from '@/lib/import/importVertrag.types';

function kurztitelVon(eingabe: GesetzImportEingabe): string {
  return typeof eingabe === 'string' ? eingabe : eingabe.kurztitel;
}

async function importiereEinzelnesGesetz(
  eingabe: GesetzImportEingabe,
  quellenwahl: Normgeber | undefined,
  meldungWeiterleiten: (f: ImportFortschritt) => void,
  kontext: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis> {
  // Ohne Quellenauswahl wird zuerst Bund gesucht; die geladene Referenz ist vollständig.
  const verwendeterNormgeber = quellenwahl === undefined ? NORMGEBER_DE_BUND : quellenwahl;
  const normgeber = [NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EUROPARAT, NORMGEBER_EU].find(
    (wert) => wert === verwendeterNormgeber,
  );
  if (normgeber === undefined) {
    return {
      art: 'fehler',
      fehler: {
        grund: 'nichtVerfuegbar',
        meldung: `‚${kurztitelVon(eingabe)}‘ ist für den Import nicht verfügbar.`,
      },
    };
  }
  const gesetz = {
    kurztitel: kurztitelVon(eingabe),
    normgeber,
  };
  if (!(await versucheGesetzSperreZuErhalten(gesetz)))
    return {
      art: 'fehler',
      fehler: {
        grund: 'beschaeftigt',
        meldung: `${gesetz.kurztitel} wird bereits an anderer Stelle importiert oder aktualisiert.`,
      },
    };
  let ergebnis: ImportEinzelErgebnis;
  try {
    ergebnis = await importiereGesetzNachNormgeber(
      eingabe,
      gesetz.normgeber,
      meldungWeiterleiten,
      kontext,
      meldungEmpfangen,
    );
  } finally {
    await gibGesetzSperreFrei(gesetz);
  }
  if (
    quellenwahl === undefined &&
    ergebnis.art === 'fehler' &&
    ergebnis.fehler.grund === 'nichtImIndex'
  ) {
    return importiereEinzelnesGesetz(
      eingabe,
      NORMGEBER_DE_BW,
      meldungWeiterleiten,
      kontext,
      meldungEmpfangen,
    );
  }
  return ergebnis;
}

async function importiereEuOderMitgeliefertesGesetz(
  eingabe: GesetzImportEingabe,
  normgeber: Normgeber,
  meldungWeiterleiten: (f: ImportFortschritt) => void,
  kontext: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis> {
  const kurztitel = kurztitelVon(eingabe);
  if (typeof eingabe === 'string') {
    return {
      art: 'fehler',
      fehler: {
        grund: 'sonstiger',
        meldung: 'Für Europa-Recht wird der volle Eintrag (mit Link) benötigt.',
      },
    };
  }
  if (!eingabe.abrufkennung.toLowerCase().endsWith('.xml')) {
    if (normgeber !== NORMGEBER_EU)
      return {
        art: 'fehler',
        fehler: { grund: 'nichtVerfuegbar', meldung: 'Fassung nicht verfügbar.' },
      };
    const [{ importiereVomInternetEU }, { alleImportindexEintraege }] = await Promise.all([
      import('@/lib/import/eu/eu.index'),
      import('@/lib/import/importindex/importindex.index'),
    ]);
    const eintrag = (await alleImportindexEintraege(NORMGEBER_EU)).find(
      (e) =>
        e.abrufkennung === eingabe.abrufkennung &&
        e.kurztitel === kurztitel &&
        (e.normgeber ?? NORMGEBER_EU) === NORMGEBER_EU,
    );
    if (!eintrag)
      return {
        art: 'fehler',
        fehler: { grund: 'nichtImIndex', meldung: 'EU-Angebot nicht im Verzeichnis.' },
      };
    return importiereVomInternetEU(
      eintrag,
      meldungWeiterleiten,
      undefined,
      kontext,
      meldungEmpfangen,
    );
  }
  // Kein Download: eingabe.abrufkennung ist der Dateiname in
  // src-tauri/resources/europa/ (siehe europaVerzeichnis.ts). Die Datei ist
  // bereits vorverarbeitetes GesetzesXML. Der GesetzesXML-Import
  // entscheidet über die Version und speichert ohne erneute Nachbereitung.
  const [{ ressourcenPfad: resolveResource }, { readTextFile }, { importiereGesetzesXML }] =
    await Promise.all([
      import('@/lib/plattform/dateipfade'),
      import('@tauri-apps/plugin-fs'),
      import('@/lib/import/importabschluss/importabschluss.index'),
    ]);
  let xmlString: string;
  try {
    const resourcePfad = await resolveResource(`resources/europa/${eingabe.abrufkennung}`);
    xmlString = await readTextFile(resourcePfad);
  } catch (ursache) {
    return {
      art: 'fehler',
      fehler: {
        grund: 'format',
        meldung: ursache instanceof Error ? ursache.message : String(ursache),
      },
    };
  }
  return importiereGesetzesXML(xmlString, meldungWeiterleiten, meldungEmpfangen);
}

async function importiereGesetzNachNormgeber(
  eingabe: GesetzImportEingabe,
  normgeber: Normgeber,
  meldungWeiterleiten: (f: ImportFortschritt) => void,
  kontext: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis> {
  const kurztitel = kurztitelVon(eingabe);

  if (normgeber === NORMGEBER_EU || normgeber === NORMGEBER_EUROPARAT)
    return importiereEuOderMitgeliefertesGesetz(
      eingabe,
      normgeber,
      meldungWeiterleiten,
      kontext,
      meldungEmpfangen,
    );

  if (normgeber === NORMGEBER_DE_BW) {
    const { importiereGesetzVomInternetBW } = await import('@/lib/import/bw/bw.index');
    return importiereGesetzVomInternetBW(
      kurztitel,
      meldungWeiterleiten,
      undefined,
      kontext,
      meldungEmpfangen,
    );
  }

  const { importiereVomInternet } = await import('@/lib/import/bund/bund.index');
  const ergebnis = await importiereVomInternet(
    kurztitel,
    meldungWeiterleiten,
    undefined,
    kontext,
    meldungEmpfangen,
  );

  return ergebnis;
}

/**
 * Importiert eine oder mehrere Gesetze aus dem Internet (oder, bei
 * Normgeber EU/Europarat, auch aus dem App-Bundle) – siehe import.index.ts für die
 * vollständige Dokumentation der öffentlichen Schnittstelle.
 */
export async function importiereGesetze(
  eingaben: GesetzImportEingabe[],
  quellenwahl?: Normgeber,
  fortschritt?: (
    kurztitel: string,
    status: 'laden' | 'ok' | 'fehler',
    ergebnis?: GesetzDarstellung | ImportFehler,
    meldung?: string,
  ) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzImportErgebnis> {
  if (eingaben.length === 0) return { erfolgreiche: [], fehlgeschlagene: [] };

  return mitManuellemImportVorgang(() =>
    mitReferenzKontext(
      (kontext) =>
        importiereGesetzeOhneVorgang(eingaben, kontext, quellenwahl, fortschritt, meldungEmpfangen),
      meldungEmpfangen,
    ),
  );
}

async function importiereGesetzeOhneVorgang(
  eingaben: GesetzImportEingabe[],
  kontext: ReferenzKontext,
  quellenwahl?: Normgeber,
  fortschritt?: (
    kurztitel: string,
    status: 'laden' | 'ok' | 'fehler',
    ergebnis?: GesetzDarstellung | ImportFehler,
    meldung?: string,
  ) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
) {
  const erfolgreiche: GesetzDarstellung[] = [];
  const fehlgeschlagene: { kurztitel: string; fehler: ImportFehler }[] = [];
  const { melden: meldeFortschritt, wirfErstenFehler } =
    erstelleFehlersicherenFortschritt<Parameters<NonNullable<typeof fortschritt>>>(fortschritt);

  // Reiner HTTP-Download (Bund) bzw. automatischer Fallback: begrenzt auf 10
  // gleichzeitig, aus Rücksicht auf den Server von gesetze-im-internet.de
  // (siehe konfliktaktionen.ts::
  // importFehlenderNormen – dieselbe Grenze auch dort für den
  // Fallback-Fall). Bei explizit gewähltem BW dagegen echte, ressourcen-
  // intensive WebView-Fenster: Limit dynamisch an die Kernanzahl gekoppelt,
  // geklammert auf 2–4.
  const limit = berechneImportParallelitaet(quellenwahl);

  await parallelMitLimit(eingaben, limit, async (eingabe) => {
    const kurztitel = kurztitelVon(eingabe);

    try {
      meldeFortschritt(kurztitel, 'laden');
      const ergebnis = await importiereEinzelnesGesetz(
        eingabe,
        quellenwahl,
        (f) => meldeFortschritt(kurztitel, 'laden', undefined, f.meldung),
        kontext,
        meldungEmpfangen,
      );

      if (ergebnis.art === 'fehler') {
        fehlgeschlagene.push({ kurztitel, fehler: ergebnis.fehler });
        meldeFortschritt(kurztitel, 'fehler', ergebnis.fehler);
        return;
      }

      erfolgreiche.push(ergebnis.gesetz);
      meldeFortschritt(kurztitel, 'ok', ergebnis.gesetz);
    } catch (ursache) {
      const fehler = {
        meldung: ursache instanceof Error ? ursache.message : String(ursache),
        grund: 'sonstiger' as const,
      };
      fehlgeschlagene.push({ kurztitel, fehler });
      meldeFortschritt(kurztitel, 'fehler', fehler);
    }
  });

  wirfErstenFehler();

  return { erfolgreiche, fehlgeschlagene };
}
