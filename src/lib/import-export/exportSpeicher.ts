// exportSpeicher.ts
//
// Sammel-Export für das ExportOverlay.tsx: liest die zu den gewählten
// Kategorien gehörenden, bereits bestehenden AppData-Dateien (Gesetze,
// Markierungen, Favoriten, Lesezeichen, Gesetzeskurzbefehle, Importindizes) und
// schreibt sie über den nativen Speichern-Dialog auf die Platte – entweder
// als Einzeldatei (genau eine Datei im Ergebnis) oder als Zip mit einem
// Unterordner pro Kategorie (mehrere Dateien im Ergebnis).
//
// Bewusst getrennt von den einzelnen *Speicher.ts-Modulen (gesetzSpeicher.ts,
// favoritenSpeicher.ts, markierungSpeicher.ts, lesezeichenSpeicher.ts,
// gesetzeskurzbefehlSpeicher.ts, importindexSuche.ts): diese sind für ihre jeweiligen
// Speicher- und Exportabfragen zuständig. exportSpeicher.ts
// kombiniert die fertigen Dateien für den Sammel-Export.

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { appDatenLesen, appDatenOrdnerLesen, dateiBasis } from '@/lib/persistenz/kern/kern.index';
import { zipSync, strToU8 } from 'fflate';
import {
  leseGesetz,
  leseGesetzesreferenzen,
  ladeGesetzesXML,
  leseNichtamtlicheTitelFuerExport,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { MARKIERUNGEN_ORDNER } from '@/lib/markierungen/markierungen.index';
import { leseGesetzeskurzbefehleFuerExport } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import {
  leseImportindizesFuerExport,
  type ImportindexExportDatei,
} from '@/lib/import/import.index';
import { baueEinstellungenXML } from '@/lib/einstellungen/einstellungen.index';
import { waehleExportZiel } from './exportZiel';
import { messeAsync } from '@/lib/utils/perfMessung';

// ---------------------------------------------------------------------------
// Öffentliche Typen
// ---------------------------------------------------------------------------

/** Eine Kategorie in der Auswahlliste des ExportOverlay.tsx.
 *  'aktuellesGesetz' und 'alleGesetze' schließen sich gegenseitig aus,
 *  'vollstaendigeSammlung' schließt alle anderen aus – siehe ExportOverlay.tsx. */
export type ExportKategorie =
  | 'aktuellesGesetz'
  | 'alleGesetze'
  | 'alleMarkierungen'
  | 'alleFavoriten'
  | 'alleNichtamtlicheTitel'
  | 'lesezeichen'
  | 'gesetzeskurzbefehle'
  | 'importindizes'
  | 'einstellungen'
  | 'vollstaendigeSammlung';

export interface ExportKontext {
  /** Gesetzesreferenz des aktuell im aktiven Tab offenen Gesetzes, falls vorhanden –
   *  wird nur für die Kategorie 'aktuellesGesetz' gebraucht. */
  aktuellesGesetz?: Gesetzesreferenz;
}

export type ExportErgebnis = 'exportiert' | 'abgebrochen' | 'keineDaten';

// ---------------------------------------------------------------------------
// Anzeige-/Ordnernamen je Kategorie (case-sensitiv wie in der Zip gewünscht)
// ---------------------------------------------------------------------------

/** Anzeigename einer Datei-Gruppe – wird sowohl als Zip-Unterordner als auch
 *  (bei genau einer Gruppe) als Basis für den Zip-Dateinamen verwendet.
 *  'aktuellesGesetz' und 'alleGesetze' landen bewusst in derselben Gruppe
 *  ("Gesetze"), da beide inhaltlich Gesetz-XML-Dateien liefern. */
const GRUPPEN_ANZEIGE: Record<
  | 'gesetze'
  | 'markierungen'
  | 'favoriten'
  | 'nichtamtlicheTitel'
  | 'lesezeichen'
  | 'gesetzeskurzbefehle'
  | 'importindizes'
  | 'einstellungen',
  string
> = {
  gesetze: 'Gesetze',
  markierungen: 'Markierungen',
  favoriten: 'Favoriten',
  nichtamtlicheTitel: 'Nichtamtliche Titel',
  lesezeichen: 'Lesezeichen',
  gesetzeskurzbefehle: 'Gesetzeskurzbefehle',
  importindizes: 'Importindizes',
  einstellungen: 'Einstellungen',
};

type GruppenSchluessel = keyof typeof GRUPPEN_ANZEIGE;

interface ExportDatei {
  name: string;
  inhalt: string;
}

export interface ExportGruppe {
  schluessel: GruppenSchluessel;
  dateien: ExportDatei[];
}

// ---------------------------------------------------------------------------
// Sammeln je Kategorie
// ---------------------------------------------------------------------------

async function sammleGesetzeDateien(
  kategorien: Set<ExportKategorie>,
  kontext: ExportKontext,
): Promise<ExportDatei[]> {
  const dateien: ExportDatei[] = [];

  if (kategorien.has('alleGesetze') || kategorien.has('vollstaendigeSammlung')) {
    return messeAsync(
      'export.alleGesetze',
      async () => {
        const referenzen = await leseGesetzesreferenzen().catch(() => []);
        for (const referenz of referenzen) {
          const ergebnis = await leseGesetz(referenz);
          if (ergebnis.status !== 'geladen') continue;
          const xml = await ladeGesetzesXML(referenz);
          if (!xml) continue;
          dateien.push({
            name: `${dateiBasis(ergebnis.gesetz)}.xml`,
            inhalt: xml,
          });
        }
        return dateien;
      },
      (ergebnis) => `${ergebnis.length} Dateien`,
    );
  }

  if (kategorien.has('aktuellesGesetz') && kontext.aktuellesGesetz) {
    return messeAsync(
      'export.aktuellesGesetz',
      async () => {
        const xml = await ladeGesetzesXML(kontext.aktuellesGesetz!);
        if (xml) {
          const name = dateiBasis(kontext.aktuellesGesetz!);
          dateien.push({
            name: `${name}.xml`,
            inhalt: xml,
          });
        }
        return dateien;
      },
      (ergebnis) => `${ergebnis.length} Dateien`,
    );
  }

  return dateien;
}

/** Liest alle .xml-Dateien eines flachen AppData-Ordners für Markierungen. */
async function sammleOrdnerDateien(ordner: string): Promise<ExportDatei[]> {
  try {
    const eintraege = await appDatenOrdnerLesen(ordner);
    const dateien: ExportDatei[] = [];
    for (const eintrag of eintraege) {
      if (!eintrag.name?.endsWith('.xml')) continue;
      try {
        const inhalt = await appDatenLesen(`${ordner}/${eintrag.name}`);
        dateien.push({ name: eintrag.name, inhalt });
      } catch {
        /* einzelne Datei nicht lesbar – überspringen */
      }
    }
    return dateien;
  } catch {
    return []; // Ordner existiert noch nicht
  }
}

/** Anders als alle anderen Kategorien KEIN Datei-Read: die Einstellungen-XML
 *  wird nie auf der Platte gespeichert (siehe einstellungenSpeicher.ts-
 *  Kopfkommentar), sondern hier bei jedem Export frisch aus dem aktuellen
 *  localStorage gebaut. */
function sammleEinstellungenDatei(): ExportDatei[] {
  return [{ name: 'Einstellungen.xml', inhalt: baueEinstellungenXML() }];
}

async function sammleImportindexDateien(): Promise<ExportDatei[]> {
  const dateien: ImportindexExportDatei[] = await leseImportindizesFuerExport();
  return dateien;
}

/** Sammelt alle Dateien aller in `kategorien` gewählten Kategorien, gruppiert
 *  nach Zielordner/Anzeigename. Leere Gruppen (z. B. noch keine Favoriten
 *  gespeichert) werden weggelassen. */
async function sammleGruppen(
  kategorien: Set<ExportKategorie>,
  kontext: ExportKontext,
): Promise<ExportGruppe[]> {
  const vollstaendig = kategorien.has('vollstaendigeSammlung');

  // Dynamisch statt statisch importiert: favoritenSpeicher.ts/
  // lesezeichenSpeicher.ts werden andernorts (useFavoritenleiste.ts,
  // useLesezeichenUndFavoriten.ts, FavoritenHinzufuegenOverlay.tsx) bereits
  // dynamisch importiert, um sie in einen eigenen Chunk auszulagern – ein
  // zusätzlicher statischer Import hier hätte das unterlaufen (Vite-Warnung INEFFECTIVE_DYNAMIC_IMPORT).
  const [{ leseFavoritenFuerExport }, { leseLesezeichenFuerExport }] = await Promise.all([
    import('@/lib/persistenz/nutzerdaten/favoritenSpeicher'),
    import('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher'),
  ]);

  const eintraege: Array<[GruppenSchluessel, Promise<ExportDatei[]>]> = [
    ['gesetze', sammleGesetzeDateien(kategorien, kontext)],
    ...(vollstaendig || kategorien.has('alleMarkierungen')
      ? [
          ['markierungen', sammleOrdnerDateien(MARKIERUNGEN_ORDNER)] as [
            GruppenSchluessel,
            Promise<ExportDatei[]>,
          ],
        ]
      : []),
    ...(vollstaendig || kategorien.has('alleFavoriten')
      ? [['favoriten', leseFavoritenFuerExport()] as [GruppenSchluessel, Promise<ExportDatei[]>]]
      : []),
    ...(vollstaendig || kategorien.has('alleNichtamtlicheTitel')
      ? [
          ['nichtamtlicheTitel', leseNichtamtlicheTitelFuerExport()] as [
            GruppenSchluessel,
            Promise<ExportDatei[]>,
          ],
        ]
      : []),
    ...(vollstaendig || kategorien.has('lesezeichen')
      ? [
          ['lesezeichen', leseLesezeichenFuerExport()] as [
            GruppenSchluessel,
            Promise<ExportDatei[]>,
          ],
        ]
      : []),
    ...(vollstaendig || kategorien.has('gesetzeskurzbefehle')
      ? [
          ['gesetzeskurzbefehle', leseGesetzeskurzbefehleFuerExport()] as [
            GruppenSchluessel,
            Promise<ExportDatei[]>,
          ],
        ]
      : []),
    ...(vollstaendig || kategorien.has('importindizes')
      ? [
          ['importindizes', sammleImportindexDateien()] as [
            GruppenSchluessel,
            Promise<ExportDatei[]>,
          ],
        ]
      : []),
    ...(vollstaendig || kategorien.has('einstellungen')
      ? [
          ['einstellungen', Promise.resolve(sammleEinstellungenDatei())] as [
            GruppenSchluessel,
            Promise<ExportDatei[]>,
          ],
        ]
      : []),
  ];

  const gruppen: ExportGruppe[] = [];
  for (const [schluessel, versprechen] of eintraege) {
    const dateien = await versprechen;
    if (dateien.length > 0) gruppen.push({ schluessel, dateien });
  }
  return gruppen;
}

// ---------------------------------------------------------------------------
// Speichern (Datei-Dialog)
// ---------------------------------------------------------------------------

/** ISO-Datum ohne Uhrzeit, z. B. „2026-05-19“. */
function heutigesDatum(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ermittelt den Zip-Dateinamen (ohne Endung) nach den Absprache-Regeln:
 *  Vollständige Sammlung → "Gesetzessammlung {Datum}", genau eine
 *  resultierende Kategorie → "{Kategorie} {Datum}", mehrere Kategorien →
 *  "Gesetzesexport {Datum}". Basiert bewusst auf den tatsächlich nicht
 *  leeren Gruppen (nicht auf der reinen Auswahl) – eine leere Kategorie
 *  soll die Benennung nicht beeinflussen. */
export function ermittleZipName(kategorien: Set<ExportKategorie>, gruppen: ExportGruppe[]): string {
  const datum = heutigesDatum();
  if (kategorien.has('vollstaendigeSammlung')) return `Gesetzessammlung ${datum}`;
  // gruppen[0] beweisbar sicher durch die length === 1-Prüfung direkt davor.
  if (gruppen.length === 1) return `${GRUPPEN_ANZEIGE[gruppen[0]!.schluessel]} ${datum}`;
  return `Gesetzesexport ${datum}`;
}

/** Baut die Zip-Einträge (Pfad -> Bytes) aus den gesammelten Gruppen: ein
 *  Unterordner pro Kategorie – außer bei Lesezeichen, das naturgemäß immer
 *  nur aus einer einzigen Datei besteht und daher direkt im Zip-Root liegt
 *  (kein Unterordner mit genau einem Kind). Gesetzeskurzbefehle UND Einstellungen
 *  teilen sich stattdessen einen gemeinsamen Ordner "Einstellungen/"
 *  (Absprache) – beide sind konzeptionell App-Einstellungen, nicht
 *  inhaltliche Nutzerdaten wie Gesetze/Markierungen/Favoriten. Reine
 *  Funktion (kein I/O), ausgelagert aus exportiere() zur Senkung von dessen
 *  Cognitive Complexity – siehe exportSpeicher.test.ts.
 */
export function baueZipEintraege(gruppen: ExportGruppe[]): Record<string, Uint8Array> {
  const zipEintraege: Record<string, Uint8Array> = {};
  for (const gruppe of gruppen) {
    const praefix =
      gruppe.schluessel === 'lesezeichen'
        ? ''
        : gruppe.schluessel === 'gesetzeskurzbefehle' || gruppe.schluessel === 'einstellungen'
          ? `${GRUPPEN_ANZEIGE.einstellungen}/`
          : `${GRUPPEN_ANZEIGE[gruppe.schluessel]}/`;
    for (const datei of gruppe.dateien) {
      zipEintraege[`${praefix}${datei.name}`] = strToU8(datei.inhalt);
    }
  }
  return zipEintraege;
}

/** Führt den Export für die gewählten Kategorien aus. Liefert `exportiert`,
 * `abgebrochen` bei geschlossenem Dialog, `keineDaten` ohne exportierbare
 * Dateien. Schreibt über den gemeinsamen Speichern-Dialog; Schreib- und
 * Dialogfehler werden unverändert an Aufrufer weitergereicht. */
export async function exportiere(
  kategorien: Set<ExportKategorie>,
  kontext: ExportKontext,
): Promise<ExportErgebnis> {
  const gruppen = await sammleGruppen(kategorien, kontext);
  const gesamt = gruppen.flatMap((g) => g.dateien);
  if (gesamt.length === 0) return 'keineDaten';

  // Genau eine Datei im Ergebnis (einzelnes Gesetz, oder mehrere gewählte
  // Kategorien, von denen aber nur eine überhaupt Inhalt hatte): ohne
  // Zip-Wrapper, unter ihrem eigenen internen Namen ausgeben.
  if (gesamt.length === 1) {
    // datei beweisbar sicher durch die length === 1-Prüfung direkt davor.
    const datei = gesamt[0]!;
    const pfad = await waehleExportZiel(datei.name, {
      name: 'XML',
      extensions: ['xml'],
    });
    if (!pfad) return 'abgebrochen';
    await writeTextFile(pfad, datei.inhalt);
    return 'exportiert';
  }

  // Mehrere Dateien: als Zip ausgeben.
  const zipBytes = zipSync(baueZipEintraege(gruppen));
  const zipName = `${ermittleZipName(kategorien, gruppen)}.zip`;
  const pfad = await waehleExportZiel(zipName, {
    name: 'ZIP',
    extensions: ['zip'],
  });
  if (!pfad) return 'abgebrochen';
  await writeFile(pfad, zipBytes);
  return 'exportiert';
}
