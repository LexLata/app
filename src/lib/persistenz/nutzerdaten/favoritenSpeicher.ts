// favoritenSpeicher.ts
//
// Persistenz: Favoriten (gemerkte Normen) pro Gesetz als XML-Datei in
// AppData speichern, laden und löschen.
//
// Dateiformat:  favoriten/{Kurztitel kodiert}_{Normgeber}-favoriten.xml
// Bezeichnung-Format: für normale Normen das letzte Token der Bezeichnung
//               (z.B. „433" aus „§ 433"), für Unterartikel-Normen das
//               Zwei-Token-Format „249 3" – kompatibel mit dem
//               Öffnen-Overlay (parseSuchanfrage in OeffnenOverlay.tsx)
//               und der Bezeichnungslogik im Normmodul (normKurzform.ts).
//
// Jeder Favorit steht als <eintrag><bezeichnung>…</bezeichnung></eintrag>.
// Die Datei wird bei jeder Änderung vollständig neu geschrieben.
// Wenn der letzte Favorit entfernt wird, wird die Datei gelöscht.
import { FAVORITEN_ORDNER } from '@/lib/persistenz/kern/kern.index';
import { FAVORITEN_SUFFIX } from '@/lib/persistenz/kern/kern.index';

import { erzeugeAktionsMeldungsWeiterleitung } from '@/lib/domain/app/aktionsMeldung';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { optionaleXmlAttribut } from '@/lib/utils/xmlVerarbeitung';
import {
  istGleichesGesetz,
  istGueltigerNormgeber,
  liesPflichtNormgeber,
} from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

import { nutzerdatenAenderungMelden } from './nutzerdatenAenderungMelden';

import {
  escapeXML,
  isoZeitstempel,
  liesXmlWurzel,
  xmlKind,
  xmlKinder,
} from '@/lib/utils/xmlVerarbeitung';
import { sortiereBezeichnung } from '@/lib/domain/norm/norm.index';
import {
  sicherstelleOrdner as sicherstelleOrdnerBasis,
  appDatenOrdnerLesen,
  appDatenLesen,
  bereinigeXmlBestand,
  appDatenLesenGeschuetzt,
  appDatenLesenOderNull,
  mitGesetzDateiSperre,
  nutzerdatenSchreiben,
  sichereNutzerdatenVorAenderung,
  appDatenLoeschen,
  ermittleGesetzDateipfad,
  meldePersistenzBefund,
} from '@/lib/persistenz/kern/kern.index';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

async function sicherstelleOrdner(): Promise<void> {
  await sicherstelleOrdnerBasis(FAVORITEN_ORDNER);
}

async function ermittleFavoritenDateipfad(gesetz: Gesetzesreferenz): Promise<string> {
  return ermittleGesetzDateipfad(gesetz, FAVORITEN_ORDNER, FAVORITEN_SUFFIX);
}

function baueXML(gesetz: Gesetzesreferenz, bezeichnungListe: string[]): string {
  const bezeichnungZeilen = bezeichnungListe
    .map((e) => `        <eintrag><bezeichnung>${escapeXML(e)}</bezeichnung></eintrag>`)
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<favoriten version="1">',
    '    <infos>',
    `        <gesetz${optionaleXmlAttribut('normgeber', gesetz.normgeber)}>${escapeXML(gesetz.kurztitel)}</gesetz>`,
    `        <verarbeitungszeit>${isoZeitstempel(new Date())}</verarbeitungszeit>`,
    '    </infos>',
    '    <inhalt>',
    bezeichnungZeilen,
    '    </inhalt>',
    '</favoriten>',
  ].join('\n');
}

/** Parst die bisherigen Favoriten-Bezeichnungen für Laden und XML-Zusammenführung. */
function parseBezeichnungListe(
  xml: string,
  gesetz?: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): string[] {
  const wurzel = liesXmlWurzel(xml, 'favoriten');
  const el = xmlKind(xmlKind(wurzel, 'infos'), 'gesetz');
  if (!el?.hasAttribute('normgeber')) {
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
    return [];
  }
  const referenz = {
    kurztitel: el?.textContent?.trim() ?? '',
    normgeber: liesPflichtNormgeber(el?.getAttribute('normgeber') ?? undefined),
  };
  if (!referenz.kurztitel || (gesetz && !istGleichesGesetz(referenz, gesetz)))
    throw new Error('Favoriten-Datei ist einem anderen Gesetz zugeordnet.');
  const inhalt = xmlKind(wurzel, 'inhalt');
  return xmlKinder(inhalt, 'eintrag')
    .map((el) => (xmlKind(el, 'bezeichnung')?.textContent ?? '').trim())
    .filter(Boolean);
}

async function ladeBezeichnungListe(
  gesetz: Gesetzesreferenz,
  token?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string[]> {
  const empfangen = meldungEmpfangen;
  const pfad = await ermittleFavoritenDateipfad(gesetz);
  meldungEmpfangen =
    empfangen &&
    erzeugeAktionsMeldungsWeiterleitung(empfangen, (meldung) =>
      empfangen({ ...meldung, text: `Bestandsdatei ‚${pfad}': ${meldung.text}` }),
    );
  let xml = meldungEmpfangen
    ? await appDatenLesenGeschuetzt(pfad, 'favoriten', token, undefined, meldungEmpfangen)
    : await appDatenLesenGeschuetzt(pfad, 'favoriten', token);
  if (xml !== null)
    xml = await bereinigeXmlBestand(
      pfad,
      xml,
      (inhalt) => {
        const wurzel = liesXmlWurzel(inhalt, 'favoriten');
        const referenz = xmlKind(xmlKind(wurzel, 'infos'), 'gesetz');
        const normgeber = referenz?.getAttribute('normgeber') ?? '';
        const kurztitel = referenz?.textContent?.trim() ?? '';
        if (
          !istGueltigerNormgeber(normgeber) ||
          !kurztitel ||
          !istGleichesGesetz({ normgeber, kurztitel }, gesetz)
        )
          return null;
        let veraendert = false;
        for (const el of xmlKinder(xmlKind(wurzel, 'inhalt'), 'eintrag')) {
          if (!xmlKind(el, 'bezeichnung')?.textContent?.trim()) {
            el.remove();
            veraendert = true;
          }
        }
        return veraendert ? new XMLSerializer().serializeToString(wurzel.ownerDocument) : inhalt;
      },
      () => nutzerdatenAenderungMelden('favoriten-geaendert', meldungEmpfangen),
      token,
      meldungEmpfangen,
    );
  return xml === null ? [] : parseBezeichnungListe(xml, gesetz, meldungEmpfangen);
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

/**
 * Schaltet einen Favoriten (Bezeichnung-String) für das angegebene Gesetz um:
 * – Noch kein Favorit → sortiert einfügen, Datei neu schreiben.
 * – Bereits Favorit → entfernen; ist die Liste danach leer, wird die Datei
 *   vollständig gelöscht.
 */
export async function umschaltenFavorit(
  gesetz: Gesetzesreferenz,
  bezeichnung: string,
): Promise<void> {
  await mitGesetzDateiSperre(gesetz, FAVORITEN_ORDNER, FAVORITEN_SUFFIX, async (token) => {
    await sicherstelleOrdner();
    const bisherige = await ladeBezeichnungListe(gesetz, token);

    if (bisherige.includes(bezeichnung)) {
      // Entfernen
      const aktualisiert = bisherige.filter((e) => e !== bezeichnung);
      if (aktualisiert.length === 0) {
        const pfad = await ermittleFavoritenDateipfad(gesetz);
        await sichereNutzerdatenVorAenderung(pfad, token);
        await appDatenLoeschen(pfad, token);
      } else {
        await nutzerdatenSchreiben(
          await ermittleFavoritenDateipfad(gesetz),
          baueXML(gesetz, aktualisiert),
          token,
        );
      }
    } else {
      // Hinzufügen (sortiert einfügen, damit XML lesbar bleibt)
      const aktualisiert = sortiereBezeichnung([...bisherige, bezeichnung]);
      await nutzerdatenSchreiben(
        await ermittleFavoritenDateipfad(gesetz),
        baueXML(gesetz, aktualisiert),
        token,
      );
    }
  });
  await nutzerdatenAenderungMelden('favoriten-geaendert');
}

/**
 * Gibt alle gespeicherten Bezeichnung-Werte für ein Gesetz zurück (in
 * Datei-Reihenfolge, also bereits sortiert). Leere Liste wenn keine
 * Favoriten vorhanden.
 */
export async function ladeFavoriten(gesetz: Gesetzesreferenz): Promise<string[]> {
  return ladeBezeichnungListe(gesetz);
}

/**
 * Fügt mehrere Bezeichnung-Werte als Favoriten für das angegebene Gesetz hinzu.
 * Bereits vorhandene Einträge werden übersprungen (kein Toggle).
 * Die resultierende Liste wird sortiert und vollständig neu geschrieben.
 *
 * Gibt die Menge der tatsächlich neu hinzugefügten Bezeichnung-Werte zurück.
 */
export async function hinzufuegenFavoriten(
  gesetz: Gesetzesreferenz,
  neueBezeichnungen: string[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Set<string>> {
  const ergebnis = await mitGesetzDateiSperre(
    gesetz,
    FAVORITEN_ORDNER,
    FAVORITEN_SUFFIX,
    async (token) => {
      await sicherstelleOrdner();
      const bisherige = await ladeBezeichnungListe(gesetz, token, meldungEmpfangen);
      const bisherigeMenge = new Set(bisherige);

      const hinzugefuegt = new Set<string>();
      for (const bezeichnung of neueBezeichnungen) {
        if (!bisherigeMenge.has(bezeichnung)) {
          hinzugefuegt.add(bezeichnung);
        }
      }

      if (hinzugefuegt.size === 0) return hinzugefuegt;

      const aktualisiert = sortiereBezeichnung([...bisherige, ...hinzugefuegt]);
      await nutzerdatenSchreiben(
        await ermittleFavoritenDateipfad(gesetz),
        baueXML(gesetz, aktualisiert),
        token,
      );

      return hinzugefuegt;
    },
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
  if (ergebnis.size > 0) await nutzerdatenAenderungMelden('favoriten-geaendert', meldungEmpfangen);
  return ergebnis;
}

/**
 * Liest den rohen Favoriten-XML-Text eines Gesetzes, oder null wenn keine
 * Favoriten-Datei existiert. Für den Datei-Import-Inhaltsvergleich (siehe
 * dateiImport.ts: „abgesehen vom geändert-Tag" – nur den Vergleich,
 * kein Toggle/Merge).
 */
export async function leseFavoritenRohtext(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  return appDatenLesenOderNull(await ermittleFavoritenDateipfad(gesetz), meldungEmpfangen);
}

/**
 * Ersetzt die Favoriten-Datei eines Gesetzes vollständig durch importInhalt
 * (Datei-Import „Ersetzen", siehe dateiImport.ts/DateiImportOverlay.tsx)
 * – im Gegensatz zu hinzufuegenFavoriten wird hier NICHT zusammengeführt,
 * sondern die bestehende Datei 1:1 durch die importierte ersetzt.
 */
export async function ersetzeFavoritenDatei(
  gesetz: Gesetzesreferenz,
  importInhalt: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  await mitGesetzDateiSperre(
    gesetz,
    FAVORITEN_ORDNER,
    FAVORITEN_SUFFIX,
    async (token) => {
      await sicherstelleOrdner();
      await nutzerdatenSchreiben(await ermittleFavoritenDateipfad(gesetz), importInhalt, token);
    },
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
  await nutzerdatenAenderungMelden('favoriten-geaendert', meldungEmpfangen);
}

/** Führt importiertes XML über die bestehende Hinzufügeoperation zusammen. */
export async function zusammenfuehrenFavoriten(
  gesetz: Gesetzesreferenz,
  importiertesXML: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Set<string>> {
  return hinzufuegenFavoriten(
    gesetz,
    parseBezeichnungListe(importiertesXML, gesetz, meldungEmpfangen),
    ...(meldungEmpfangen ? [meldungEmpfangen] : []),
  );
}

/** Liefert rohe Exportdateien; unlesbare Dateien und Ordner werden ausgelassen. */
export async function leseFavoritenFuerExport(): Promise<Array<{ name: string; inhalt: string }>> {
  try {
    const eintraege = await appDatenOrdnerLesen(FAVORITEN_ORDNER);
    const dateien: Array<{ name: string; inhalt: string }> = [];
    for (const eintrag of eintraege) {
      if (!eintrag.name?.endsWith('.xml')) continue;
      try {
        const inhalt = await appDatenLesen(`${FAVORITEN_ORDNER}/${eintrag.name}`);
        dateien.push({ name: eintrag.name, inhalt });
      } catch {
        /* Unlesbare Einzeldatei auslassen. */
      }
    }
    return dateien;
  } catch {
    return [];
  }
}

/** Schreibfreie Eingangsdiagnose für Vergleich und Ersetzen beim Dateiimport. */
export function pruefeFavoritenImport(
  xml: string,
  gesetz: Gesetzesreferenz | undefined,
  meldungEmpfangen: AktionsMeldungEmpfaenger,
): number {
  return parseBezeichnungListe(xml, gesetz, meldungEmpfangen).length;
}
