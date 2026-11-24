// lesezeichenSpeicher.ts
//
// Persistenz: Lesezeichen (gesetzesübergreifende Markierungen) in einer
// einzigen Datei in AppData – im Gegensatz zu Favoriten, die pro Gesetz
// abgelegt werden.
//
// Dateiformat:  lesezeichen/lesezeichen.xml (unter AppData)
// Eintrags-Format: Gesetz + Bezeichnung, z.B. „433 BGB" oder „249 3 EGBGB".
// Reihenfolge:  sortiert nach Gesetz (alphabetisch), innerhalb eines
//               Gesetzes nach Bezeichnung (numerisch, wie bei Favoriten) – wird
//               beim Hinzufügen neu sortiert geschrieben, siehe
//               favoritenSpeicher.ts. Beim Laden wird der Dateiinhalt
//               unverändert übernommen (kein erneutes Sortieren).
// Toggle:       Eintrag hinzufügen wenn nicht vorhanden, entfernen wenn
//               vorhanden. Bei leerer Liste wird die Datei gelöscht.

import { meldeScrollDiagnose } from '@/lib/utils/scrollAufzeichnungDiagnose';
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import { erzeugeAktionsMeldungsWeiterleitung } from '@/lib/domain/app/aktionsMeldung';
import { LESEZEICHEN_DATEINAME } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { optionaleXmlAttribut } from '@/lib/utils/xmlVerarbeitung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  istGleichesGesetz,
  istGueltigerNormgeber,
  liesPflichtNormgeber,
} from '@/lib/domain/gesetzesreferenz';
import { nutzerdatenAenderungMelden } from './nutzerdatenAenderungMelden';

import {
  escapeXML,
  isoZeitstempel,
  liesXmlWurzel,
  xmlKind,
  xmlKinder,
  xmlText,
} from '@/lib/utils/xmlVerarbeitung';
import {
  appDatenLesen,
  bereinigeXmlBestand,
  appDatenLesenGeschuetzt,
  appDatenLesenOderNull,
  mitDateiSperre,
  nutzerdatenSchreiben,
  sichereNutzerdatenVorAenderung,
  sicherstelleOrdner,
  appDatenLoeschen,
  meldePersistenzBefund,
} from '@/lib/persistenz/kern/kern.index';
import { vergleicheBezeichnung } from '@/lib/domain/norm/norm.index';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface Lesezeichen {
  bezeichnung: string;
  gesetz: Gesetzesreferenz;
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

const DATEINAME = `lesezeichen/${LESEZEICHEN_DATEINAME}`;

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Vergleicht zwei Lesezeichen für die Sortierung: zuerst nach Gesetz
 * (alphabetisch), bei gleichem Gesetz nach Bezeichnung (numerisch, siehe
 * vergleicheBezeichnung in lib/domain/bezeichnungVergleich.ts).
 */
function vergleicheLesezeichen(a: Lesezeichen, b: Lesezeichen): number {
  const gesetzVergleich =
    kurztitelVergleichsform(a.gesetz.kurztitel).localeCompare(
      kurztitelVergleichsform(b.gesetz.kurztitel),
      'de',
    ) || a.gesetz.normgeber.localeCompare(b.gesetz.normgeber, 'de');
  if (gesetzVergleich !== 0) return gesetzVergleich;
  return vergleicheBezeichnung(a.bezeichnung, b.bezeichnung);
}

function baueXML(eintraege: Lesezeichen[]): string {
  const zeilen = eintraege
    .map((e) =>
      [
        '        <eintrag>',
        `            <bezeichnung>${escapeXML(e.bezeichnung)}</bezeichnung>`,
        `            <gesetz${optionaleXmlAttribut('normgeber', e.gesetz.normgeber)}>${escapeXML(e.gesetz.kurztitel)}</gesetz>`,
        '        </eintrag>',
      ].join('\n'),
    )
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<lesezeichen version="1">',
    '    <infos>',
    `        <verarbeitungszeit>${isoZeitstempel(new Date())}</verarbeitungszeit>`,
    '    </infos>',
    '    <inhalt>',
    zeilen,
    '    </inhalt>',
    '</lesezeichen>',
  ].join('\n');
}

/** Parst die bisherigen Lesezeichen-Einträge für Laden und XML-Zusammenführung. */
function parseLesezeichenEintraege(
  xml: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Lesezeichen[] {
  const eintraege: Lesezeichen[] = [];
  const inhalt = xmlKind(liesXmlWurzel(xml, 'lesezeichen'), 'inhalt');
  let normgeberFehlt = false;
  for (const el of xmlKinder(inhalt, 'eintrag')) {
    if (!xmlKind(el, 'gesetz')?.hasAttribute('normgeber')) {
      normgeberFehlt = true;
      continue;
    }
    const bezeichnung = xmlText(el, 'bezeichnung')?.trim();
    const gesetz = xmlText(el, 'gesetz')?.trim();
    if (bezeichnung && gesetz)
      eintraege.push({
        bezeichnung,
        gesetz: {
          kurztitel: gesetz,
          normgeber: liesPflichtNormgeber(
            xmlKind(el, 'gesetz')?.getAttribute('normgeber') ?? undefined,
          ),
        },
      });
  }
  if (normgeberFehlt)
    meldePersistenzBefund(
      {
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'lesen',
        aenderungsstand: 'keine',
        text: 'Einträge ohne Normgeber wurden nicht geladen.',
      },
      ...(meldungEmpfangen ? [meldungEmpfangen] : []),
    );
  return eintraege;
}

async function ladeEintraege(
  token?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Lesezeichen[]> {
  const empfangen = meldungEmpfangen;
  const pfad = DATEINAME;
  meldungEmpfangen =
    empfangen &&
    erzeugeAktionsMeldungsWeiterleitung(empfangen, (meldung) =>
      empfangen({ ...meldung, text: `Bestandsdatei ‚${pfad}': ${meldung.text}` }),
    );
  let xml = meldungEmpfangen
    ? await appDatenLesenGeschuetzt(DATEINAME, 'lesezeichen', token, undefined, meldungEmpfangen)
    : await appDatenLesenGeschuetzt(DATEINAME, 'lesezeichen', token);
  if (xml !== null)
    xml = await bereinigeXmlBestand(
      DATEINAME,
      xml,
      (inhalt) => {
        const wurzel = liesXmlWurzel(inhalt, 'lesezeichen');
        let veraendert = false;
        for (const el of xmlKinder(xmlKind(wurzel, 'inhalt'), 'eintrag')) {
          const gesetz = xmlKind(el, 'gesetz');
          if (
            !istGueltigerNormgeber(gesetz?.getAttribute('normgeber') ?? '') ||
            !gesetz?.textContent?.trim() ||
            !xmlText(el, 'bezeichnung')?.trim()
          ) {
            el.remove();
            veraendert = true;
          }
        }
        return veraendert ? new XMLSerializer().serializeToString(wurzel.ownerDocument) : inhalt;
      },
      () => nutzerdatenAenderungMelden('lesezeichen-geaendert', meldungEmpfangen),
      token,
      meldungEmpfangen,
    );
  return xml === null ? [] : parseLesezeichenEintraege(xml, meldungEmpfangen);
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

/**
 * Schaltet ein Lesezeichen um:
 * – Noch nicht vorhanden → sortiert einfügen (Gesetz, dann Bezeichnung).
 * – Bereits vorhanden    → entfernen; ist die Liste danach leer, wird die
 *   Datei vollständig gelöscht.
 *
 * Gibt zurück ob das Lesezeichen nach der Operation vorhanden ist (true =
 * hinzugefügt, false = entfernt).
 */
export async function umschaltenLesezeichen(
  gesetz: Gesetzesreferenz,
  bezeichnung: string,
): Promise<boolean> {
  const ergebnis = await mitDateiSperre(DATEINAME, async (token) => {
    const bisherige = await ladeEintraege(token);
    const istVorhanden = bisherige.some(
      (e) => e.bezeichnung === bezeichnung && istGleichesGesetz(e.gesetz, gesetz),
    );

    if (istVorhanden) {
      const aktualisiert = bisherige.filter(
        (e) => !(e.bezeichnung === bezeichnung && istGleichesGesetz(e.gesetz, gesetz)),
      );
      if (aktualisiert.length === 0) {
        await sichereNutzerdatenVorAenderung(DATEINAME, token);
        await appDatenLoeschen(DATEINAME, token);
      } else {
        await sicherstelleOrdner('lesezeichen');
        await nutzerdatenSchreiben(DATEINAME, baueXML(aktualisiert), token);
      }
      return false;
    } else {
      const aktualisiert = [...bisherige, { bezeichnung, gesetz }].sort(vergleicheLesezeichen);
      await sicherstelleOrdner('lesezeichen');
      await nutzerdatenSchreiben(DATEINAME, baueXML(aktualisiert), token);
      return true;
    }
  });
  meldeScrollDiagnose({ art: ergebnis ? 'lesezeichen-hinzugefuegt' : 'lesezeichen-geloescht' });
  await nutzerdatenAenderungMelden('lesezeichen-geaendert');
  return ergebnis;
}

/**
 * Lädt alle gespeicherten Lesezeichen, sortiert nach Gesetz und (innerhalb
 * eines Gesetzes) nach Bezeichnung – siehe vergleicheLesezeichen. Leere Liste
 * wenn keine Lesezeichen vorhanden.
 */
export async function ladeLesezeichen(): Promise<Lesezeichen[]> {
  return ladeEintraege();
}

/**
 * Fügt mehrere Lesezeichen hinzu (Datei-Import, siehe dateiImport.ts).
 * Bereits vorhandene Einträge (gleiches Gesetz + gleiche Bezeichnung) werden
 * übersprungen, kein Toggle – analog zu hinzufuegenFavoriten
 * (favoritenSpeicher.ts). Schreibt die Datei nur, wenn tatsächlich neue
 * Einträge hinzukamen. Liefert true ausschließlich nach einer solchen Speicherung.
 */
export async function hinzufuegenLesezeichen(
  neue: Lesezeichen[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  const ergebnis = await mitDateiSperre(
    DATEINAME,
    async (token) => {
      const bisherige = await ladeEintraege(token, meldungEmpfangen);
      const istVorhanden = (n: Lesezeichen) =>
        bisherige.some(
          (e) => e.bezeichnung === n.bezeichnung && istGleichesGesetz(e.gesetz, n.gesetz),
        );

      const hinzuzufuegen = neue.filter((n) => !istVorhanden(n));
      if (hinzuzufuegen.length === 0) return false;

      const aktualisiert = [...bisherige, ...hinzuzufuegen].sort(vergleicheLesezeichen);
      await sicherstelleOrdner('lesezeichen');
      await nutzerdatenSchreiben(DATEINAME, baueXML(aktualisiert), token);
      return true;
    },
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
  if (ergebnis) await nutzerdatenAenderungMelden('lesezeichen-geaendert', meldungEmpfangen);
  return ergebnis;
}

/**
 * Liest den rohen Lesezeichen-XML-Text, oder null wenn keine Datei
 * existiert. Für den Datei-Import-Inhaltsvergleich (siehe
 * dateiImport.ts).
 */
export async function leseLesezeichenRohtext(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  return appDatenLesenOderNull(DATEINAME, meldungEmpfangen);
}

/**
 * Ersetzt die Lesezeichen-Datei vollständig durch importInhalt (Datei-Import
 * „Ersetzen", siehe dateiImport.ts/DateiImportOverlay.tsx).
 */
export async function ersetzeLesezeichenDatei(
  importInhalt: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  await mitDateiSperre(
    DATEINAME,
    async (token) => {
      await sicherstelleOrdner('lesezeichen');
      await nutzerdatenSchreiben(DATEINAME, importInhalt, token);
    },
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
  await nutzerdatenAenderungMelden('lesezeichen-geaendert', meldungEmpfangen);
}

/**
 * Löscht alle Lesezeichen unwiderruflich (entfernt die Datei vollständig).
 * Der Aufrufer ist für eine vorherige Bestätigung durch den Nutzer
 * verantwortlich (siehe handleAlleLesezeichenEntfernen in App.tsx).
 */
export async function loescheAlleLesezeichen(): Promise<void> {
  await mitDateiSperre(DATEINAME, async (token) => {
    await appDatenLoeschen(DATEINAME, token);
  });
  meldeScrollDiagnose({ art: 'lesezeichen-geloescht', umfang: 'alle' });
  await nutzerdatenAenderungMelden('lesezeichen-geaendert');
}

/** Führt importiertes XML zusammen; false bestätigt einen unveränderten Bestand. */
export async function zusammenfuehrenLesezeichen(
  importiertesXML: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  return hinzufuegenLesezeichen(
    parseLesezeichenEintraege(importiertesXML, meldungEmpfangen),
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
}

/** Liest die Exportdatei roh und ohne Archivierungs-/Schreibnebenwirkungen. */
export async function leseLesezeichenFuerExport(): Promise<
  Array<{ name: string; inhalt: string }>
> {
  try {
    return [{ name: LESEZEICHEN_DATEINAME, inhalt: await appDatenLesen(DATEINAME) }];
  } catch {
    return [];
  }
}

/** Schreibfreie Eingangsdiagnose für Vergleich und Ersetzen beim Dateiimport. */
export function pruefeLesezeichenImport(
  xml: string,
  meldungEmpfangen: AktionsMeldungEmpfaenger,
): number {
  return parseLesezeichenEintraege(xml, meldungEmpfangen).length;
}
