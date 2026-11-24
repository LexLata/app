// dateiImport.ts
// Datei-Import mehrerer Dateien (Datei-Dialog-Mehrfachauswahl oder ein
// beim Import entpacktes ZIP-Archiv, siehe exportSpeicher.ts für das
// Gegenstück beim Export). Erkennt jede enthaltene Datei einzeln über
// erkenneDateiFormat (formatErkennung.ts) und klassifiziert sie in genau
// einen von drei Fällen (siehe Absprache):
//  - sofortiger Import: kein Bestand vorhanden → wird direkt geschrieben.
//  - Bericht: inhaltlich unverändert (Gesetz/Favoriten/Lesezeichen/
//    Gesetzeskurzbefehle/Markierungen jeweils ohne den geändert-/verarbeitungszeit-Tag
//    verglichen) bzw. Importindex nicht neuer als der Bestand → wird ignoriert,
//    nur gemeldet.
//  - Konflikt: Bestand vorhanden UND tatsächlich inhaltlich verändert →
//    Nutzerentscheidung im DateiImportOverlay.tsx nötig, hier nur
//    gesammelt, NICHT geschrieben.
// Reine Orchestrierungs-/Vergleichslogik ohne UI, analog zur bestehenden
// Trennung markierungskonfliktPruefung.ts (Logik) / markierungskonflikteSpeicher.ts
// (I/O) – gesetzDateiImport.ts bleibt für Dialog-Öffnen + Datei-Lesen
// zuständig und reicht die Rohdateien nur hierher durch.
//
// Der Importbericht wird NICHT hier zu fertigen Sätzen zusammengebaut,
// sondern nur als flache Liste von BerichtEintrag (Kategorie + Aktion +
// Name) gesammelt. Nach einer Nutzerentscheidung liefert loeseImportKonflikt
// aus dateiImport.aktionen.ts den zusätzlichen BerichtEintrag mit der
// Aktion 'ersetzt'/'zusammengefuehrt'. Das DateiImportOverlay übernimmt diesen
// Eintrag und zeigt beide Listen gemeinsam über gliedereImportbericht an.
// Dateibezogene Fehler werden als ImportFehler (mit Grund) gesammelt.
//
// Typen + Berichtsformatierung stehen in dateiImport.types.ts, die
// "einfachen" Formate (Favoriten/Lesezeichen/Gesetzeskurzbefehle/Markierungen/
// nichtamtliche Titel/Einstellungen) in dateiImport.einfach.ts, die
// Konfliktauflösung nach Nutzerentscheidung in dateiImport.aktionen.ts
// (alle drei aus dieser Datei ausgelagert, 500-Zeilen-Richtgröße) – hier
// verbleiben nur Gesetze/Indexe (strukturell anders, kein simples
// Bestand-lesen-und-vergleichen) sowie der Haupteinstiegspunkt. Alle drei
// bleiben privat; benötigte Konfliktoperationen und Berichtstypen werden über
// datei-import.index.ts öffentlich angeboten.

import { NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import {
  ImportAbschlussFehler,
  anzeigeDateiname,
  meldungAlsImportFehler,
} from '@/lib/import-export/datei-import/dateiImport.types';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { erkenneDateiFormat } from '@/lib/import-export/datei-import/formatErkennung';
import {
  mitGesetzDateiImport,
  type GesetzDateiImport,
  type GesetzDateiErgebnis,
  type GesetzDateiFormat,
} from '@/lib/import/import.index';
import { leseNachbereitungBeiImport } from '@/lib/einstellungen/einstellungen.index';
import { uebernehmeImportindexDatei } from '@/lib/import/import.index';
import {
  erzeugeImportAbschluss,
  verarbeiteEinfacheDatei,
} from '@/lib/import-export/datei-import/dateiImport.einfach';
import { pruefeSchemaversion } from '@/lib/persistenz/kern/kern.index';

import type {
  RohDatei,
  GesetzKonflikt,
  ImportKonflikt,
  BerichtEintrag,
  DateiImportFortschrittEmpfaenger,
  DateiImportErgebnis,
  ImportFehler,
} from '@/lib/import-export/datei-import/dateiImport.types';

// ---------------------------------------------------------------------------
// ZIP-Entpacken
// ---------------------------------------------------------------------------

/** Entpackt ein ZIP-Archiv (Sammel-Export, siehe exportSpeicher.ts) und
 *  gibt alle enthaltenen XML-Dateien zurück. Archivname und interner Pfad
 *  bleiben als Herkunft erhalten; die Formaterkennung läuft ausschließlich über
 *  den Dateiinhalt (robuster als ein Pfad-/Ordnernamen-Abgleich, und
 *  funktioniert dadurch identisch für Einzeldatei- wie ZIP-Import). */
export async function entpackeZip(zipDaten: ArrayBuffer, archivname?: string): Promise<RohDatei[]> {
  const { unzipSync, strFromU8 } = await import('fflate');
  const entpackt = unzipSync(new Uint8Array(zipDaten));

  const dateien: RohDatei[] = [];
  for (const [pfad, bytes] of Object.entries(entpackt)) {
    if (pfad.endsWith('/')) continue; // Verzeichnis-Eintrag
    const name = pfad.split('/').pop() ?? pfad;
    if (!/\.(xml|html?)$/i.test(name)) continue;
    dateien.push({
      name,
      inhalt: strFromU8(bytes),
      quelle: archivname ? `${archivname} → ${pfad}` : pfad,
    });
  }
  return dateien;
}

// ---------------------------------------------------------------------------
// Gesetze
// ---------------------------------------------------------------------------

/** Vergleicht ein bereits verarbeitetes Gesetz (verarbeiteGesetzDatei) gegen
 *  einen evtl. bestehenden Bestand (vergleicheMitBestand) und
 *  klassifiziert/speichert es. Ist kein Bestand vorhanden, wird SOFORT
 *  gespeichert (kein Konflikt möglich) – analog zum bisherigen
 *  Erst-Import-Verhalten (taggeUndSpeichereGesetzesXML). Bei
 *  inhaltlicher Änderung wird dagegen NICHT gespeichert, sondern ein
 *  GesetzKonflikt für die Nutzerentscheidung im DateiImportOverlay
 *  zurückgegeben (siehe Absprache).
 *
 *  `zeigeVerarbeitungszeitDaten`: nur bei bereits-GesetzesXML (Format
 *  'kanonisch-xml', z.B. ein Re-Import eines früheren Exports) spiegelt der
 *  verarbeitungszeit-Tag einen echten, für den Nutzer aussagekräftigen Zeitpunkt.
 *  Bei bja-xml/html-bw wird der Tag dagegen erst beim Vertaggen
 *  (verarbeiteGesetzDatei/gesetzesXMLBauer.ts – diese Quellen haben selbst
 *  keinen verarbeitungszeit-Begriff) mit dem aktuellen Verarbeitungszeitpunkt neu
 *  gesetzt, zeigt also für "Import" praktisch immer "gerade eben" und wäre
 *  irreführend, wenn man es im Konfliktdialog mit dem tatsächlichen (unter
 *  Umständen viel älteren) Erstellungszeitpunkt der bestehenden Version
 *  vergleicht. In diesem Fall werden daher gar keine Datumsangaben gesetzt
 *  (siehe Absprache). */
async function klassifiziereGesetzDatei(
  format: GesetzDateiFormat,
  inhalt: string,
  importiereGesetzDatei: GesetzDateiImport,
  meldeNachbereitungsfehler: (meldung: string) => void,
  meldungEmpfangen: AktionsMeldungEmpfaenger,
): Promise<GesetzVerarbeitungsErgebnis> {
  const ergebnis: GesetzDateiErgebnis = await importiereGesetzDatei(format, inhalt, {
    // Nutzer-Einstellung "Beim Import taggen" (ErweitertAbschnitt.tsx,
    // Default aus) – für extern erzeugte, noch unverarbeitete kanonische
    // XML-Dateien, nicht für Re-Importe eigener Exporte gedacht, die bereits
    // vollständig verarbeitet sind. Bei den anderen Quelldateien hat diese
    // Option keine Wirkung (verarbeiteGesetzDatei vertaggt dort ohnehin
    // immer), das Lesen der Einstellung schadet dort also nicht.
    nachbereitungBeiImport: leseNachbereitungBeiImport(),
    meldungEmpfangen,
  });
  if (ergebnis.art === 'fehler') return { art: 'fehler', fehler: ergebnis.fehler.meldung };
  ergebnis.nachbereitungsfehler?.forEach(meldeNachbereitungsfehler);
  if (ergebnis.art !== 'konflikt') return ergebnis;
  return { ...ergebnis, art: 'gesetz' };
}

type GesetzVerarbeitungsErgebnis =
  | { art: 'neu'; kurztitel: string }
  | { art: 'unveraendert'; kurztitel: string }
  | GesetzKonflikt
  | { art: 'fehler'; fehler: string };

/** Ordnet das Ergebnis sofort ein (Reihenfolge des Berichts bleibt erhalten).
 *  Der Gesetzabschluss kommt erst mit dem Ende des Sammelbatches; das Warten
 *  darauf und die davon abhängigen Berichtsangaben liefert die zurückgegebene
 *  Funktion, die der Aufrufer nach mitGesetzDateiImport ausführt. */
async function verarbeiteGesetzImport(
  format: GesetzDateiFormat,
  datei: RohDatei,
  importiereDatei: GesetzDateiImport,
  berichtEintraege: BerichtEintrag[],
  konflikte: ImportKonflikt[],
  fehler: ImportFehler[],
): Promise<(fristMs: number) => Promise<void>> {
  const quelle = datei.quelle ?? datei.name;
  const meldungen: AktionsMeldung[] = [];
  const abschluss = erzeugeImportAbschluss(meldungen);
  const ergebnis = await klassifiziereGesetzDatei(
    format,
    datei.inhalt,
    importiereDatei,
    (meldung) => {
      console.error(`Nachbereitung fehlgeschlagen (${quelle}):`, meldung);
      fehler.push({ grund: 'nachbereitung', datei: quelle, detail: meldung });
    },
    abschluss.meldungEmpfangen,
  );
  switch (ergebnis.art) {
    case 'fehler':
      berichtEintraege.push({
        kategorie: 'gesetz',
        aktion: 'nichtUebernommen',
        name: anzeigeDateiname(datei.name),
        meldungen,
        abschluss,
      });
      return async (fristMs) => {
        await abschluss.warte(fristMs);
        if (!meldungen.some((m) => m.text.includes(ergebnis.fehler)))
          abschluss.meldungEmpfangen({
            typ: 'fehler',
            art: 'fehler',
            anlass: 'import',
            aenderungsstand: 'keine',
            text: ergebnis.fehler,
          });
      };
    case 'unveraendert': {
      const eintrag: BerichtEintrag = {
        kategorie: 'gesetz',
        aktion: 'unveraendert',
        name: ergebnis.kurztitel,
      };
      berichtEintraege.push(eintrag);
      return async (fristMs) => {
        await abschluss.warte(fristMs);
        if (meldungen.length) (eintrag.meldungen ??= []).push(...meldungen);
      };
    }
    case 'neu':
      berichtEintraege.push({
        kategorie: 'gesetz',
        aktion: ergebnis.art,
        name: ergebnis.kurztitel,
        meldungen,
        abschluss,
      });
      return (fristMs) => abschluss.warte(fristMs);
    case 'gesetz': {
      const konflikt: ImportKonflikt = { ...ergebnis };
      konflikte.push(konflikt);
      return async (fristMs) => {
        await abschluss.warte(fristMs);
        if (meldungen.length) (konflikt.meldungen ??= []).push(...meldungen);
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Importindizes
// ---------------------------------------------------------------------------

async function verarbeiteImportindexDatei(
  datei: RohDatei,
  berichtEintraege: BerichtEintrag[],
): Promise<void> {
  const { kategorie, aktion } = await uebernehmeImportindexDatei(datei.inhalt);
  const name = kategorie === NORMGEBER_DE_BW ? 'Landesrecht BW' : 'Bundesrecht';
  berichtEintraege.push({ kategorie: 'index', aktion, name });
}

// ---------------------------------------------------------------------------
// Haupteinstiegspunkt
// ---------------------------------------------------------------------------

/**
 * Verarbeitet eine flache Liste bereits gelesener Dateien (Dialog-
 * Mehrfachauswahl oder entpackte ZIP, siehe entpackeZip). Jede Datei wird
 * einzeln erkannt und klassifiziert; alles ohne Konflikt wird sofort
 * geschrieben, alles mit Konflikt landet gesammelt im Rückgabewert für das
 * DateiImportOverlay. Dateibezogene Fehler werden mit Namen gesammelt; die
 * Verarbeitung fährt sequenziell fort. Aufbau und Abschluss des gemeinsamen
 * Vorgangs dürfen werfen. Bereits ausgeführte Schreiboperationen bleiben auch
 * bei späteren Fehlern erhalten; ein Rollback findet nicht statt.
 */
export async function verarbeiteDateien(
  dateien: RohDatei[],
  fortschritt?: DateiImportFortschrittEmpfaenger,
): Promise<DateiImportErgebnis> {
  // Gesetzabschlüsse folgen erst dem gemeinsamen Sammelbatch, also nach
  // mitGesetzDateiImport; erst danach ist das Ergebnis vollständig.
  const gesetzAbschluesse: ((fristMs: number) => Promise<void>)[] = [];
  const ergebnis = await mitGesetzDateiImport(async (importiereDatei) => {
    const konflikte: ImportKonflikt[] = [];
    const berichtEintraege: BerichtEintrag[] = [];
    const fehler: ImportFehler[] = [];

    for (const [index, datei] of dateien.entries()) {
      const quelle = datei.quelle ?? datei.name;
      fortschritt?.({
        phase: 'verarbeiten',
        erledigt: index,
        gesamt: dateien.length,
        datei: quelle,
      });
      const berichtAnfang = berichtEintraege.length;
      const konfliktAnfang = konflikte.length;
      // Eingangsmeldungen (Schemaversion) hängen am Ergebnis dieser Datei.
      const eingangsMeldungen: AktionsMeldung[] = [];
      try {
        const meldungEmpfangen: AktionsMeldungEmpfaenger = (meldung) => {
          if (eingangsMeldungen.some((m) => m.text === meldung.text)) return;
          eingangsMeldungen.push(meldung);
        };
        await pruefeSchemaversion(datei.inhalt, meldungEmpfangen);
        const format = erkenneDateiFormat(datei.inhalt, datei.name);

        switch (format) {
          case 'bja-xml':
          case 'kanonisch-xml':
          case 'html-bw': {
            gesetzAbschluesse.push(
              await verarbeiteGesetzImport(
                format,
                datei,
                importiereDatei,
                berichtEintraege,
                konflikte,
                fehler,
              ),
            );
            break;
          }

          case 'index-xml': {
            await verarbeiteImportindexDatei(datei, berichtEintraege);
            break;
          }

          case 'favoriten-xml':
          case 'lesezeichen-xml':
          case 'gesetzeskurzbefehle-xml':
          case 'markierung-xml':
          case 'nichtamtlicheTitel-xml':
          case 'einstellungen-xml': {
            const ergebnis = await verarbeiteEinfacheDatei(format, datei.inhalt);
            if ('importInhalt' in ergebnis) {
              konflikte.push(ergebnis);
            } else {
              const { art, ...bericht } = ergebnis;
              berichtEintraege.push({ ...bericht, aktion: art });
            }
            break;
          }

          case 'zip': {
            // Verschachtelte ZIPs werden bewusst nicht unterstützt (kein
            // genannter Anwendungsfall) – als unbekanntes Format melden.
            fehler.push({ grund: 'zipVerschachtelt', datei: quelle });
            break;
          }

          case 'unbekannt':
            fehler.push({ grund: 'formatUnbekannt', datei: quelle });
        }
      } catch (ausnahme) {
        erfasseImportFehler(ausnahme, quelle, berichtEintraege, fehler);
      }
      ergaenzeHerkunft(
        datei,
        berichtEintraege.slice(berichtAnfang),
        konflikte.slice(konfliktAnfang),
      );
      ordneEingangsMeldungenZu(
        eingangsMeldungen,
        quelle,
        berichtEintraege.slice(berichtAnfang),
        konflikte.slice(konfliktAnfang),
        fehler,
      );
    }
    // Schlussmeldung schon nach der letzten Datei: Der gemeinsame Abschluss
    // (Sammelbatch, Gesetzabschlüsse) kann dauern und gehört zu keiner Datei.
    fortschritt?.({ phase: 'verarbeiten', erledigt: dateien.length, gesamt: dateien.length });

    return { konflikte, berichtEintraege, fehler };
  });
  // Alle Gesetzabschlüsse laufen gleichzeitig ab dem Ende des Sammelbatches,
  // die gemeinsame Markierungskonfliktprüfung wächst mit der Dateizahl:
  // Frist daher 30 s plus 1 s je Datei (Regelfrist sonst 30 s).
  const fristMs = 30_000 + 1_000 * dateien.length;
  await Promise.all(gesetzAbschluesse.map((abschliessen) => abschliessen(fristMs)));
  return ergebnis;
}

/** Auch abgelehnte Aktionen können noch einen lebenden Abschluss besitzen. */
function erfasseImportFehler(
  ausnahme: unknown,
  quelle: string,
  berichte: BerichtEintrag[],
  fehler: ImportFehler[],
) {
  if (ausnahme instanceof ImportAbschlussFehler) {
    berichte.push(ausnahme.bericht);
    return;
  }
  console.error(`Datei-Import: unerwarteter Fehler bei ${quelle}:`, ausnahme);
  fehler.push({
    grund: 'unerwartet',
    datei: quelle,
    detail: ausnahme instanceof Error ? ausnahme.message : String(ausnahme),
  });
}

/** Eingangsmeldungen stehen als Hinweis am Ergebnis der Datei (Bericht oder
 *  Konflikt); ohne Ergebnis (Datei fehlgeschlagen) werden sie zum Fehler
 *  `meldung`. */
function ordneEingangsMeldungenZu(
  meldungen: readonly AktionsMeldung[],
  quelle: string,
  berichte: BerichtEintrag[],
  konflikte: ImportKonflikt[],
  fehler: ImportFehler[],
) {
  if (meldungen.length === 0) return;
  const ziele = [...berichte, ...konflikte];
  if (ziele.length > 0) {
    for (const ziel of ziele) (ziel.meldungen ??= []).push(...meldungen);
    return;
  }
  for (const m of meldungen) fehler.push(meldungAlsImportFehler(m, quelle));
}

/** Fachliche Klassifizierung bleibt unabhängig von der beim Eingang erhaltenen Herkunft. */
function ergaenzeHerkunft(
  datei: RohDatei,
  berichte: BerichtEintrag[],
  konflikte: ImportKonflikt[],
) {
  if (!datei.quelle) return;
  for (const eintrag of [...berichte, ...konflikte]) eintrag.quelle = datei.quelle;
}
