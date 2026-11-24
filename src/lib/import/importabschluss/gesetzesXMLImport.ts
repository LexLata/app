// gesetzesXMLImport.ts
//
// Zweig für mitgelieferte, fertig verarbeitete GesetzesXML-Dateien der Import-Pipeline. Übernimmt vollständig verarbeitetes
// GesetzesXML aus dem App-Bundle. Die Operation
// gehört zu lib/import: Sie installiert ein Gesetz aus dem Öffnen-Overlay und
// ist kein Austausch von Nutzerdateien über lib/import-export.

import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { speichereImportGesetz } from './gesetzImportSpeichern';
import { leseGesetz } from '@/lib/persistenz/gesetz/gesetz.index';
import type { ImportEinzelErgebnis, ImportFortschritt } from '@/lib/import/importVertrag.types';

/** Zweig "bereits fertig importiertes GesetzesXML", NUR für den Import
 *  mitgelieferter GesetzesXML-Dateien (derzeit EMRK, Normgeber Europarat) aus src-tauri/resources/europa/ (siehe
 *  import.index.ts::importiereGesetze; Kategorie Europarecht) genutzt: dort ist
 *  das GesetzesXML aus dem Bundle vertrauenswürdig und es soll ohne Nutzer-
 *  Konfliktdialog direkt übernommen/ersetzt werden, wenn sie neuer ist als
 *  eine evtl. bereits installierte Version. Läuft bewusst OHNE
 *  Satztokenisierung/Verweistagging (die mitgelieferten GesetzesXML-Dateien
 *  sind bereits vollständig verarbeitet) – die Option "Beim Import
 *  taggen" (ErweitertAbschnitt.tsx) wirkt ausschließlich im regulären
 *  Datei-Import (siehe gesetzDateiVerarbeitung.ts und den Datei-Import). */
export async function importiereGesetzesXML(
  xmlString: string,
  fortschritt?: (f: ImportFortschritt) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis> {
  fortschritt?.({ phase: 'parsen', meldung: 'Kanonisches XML wird gelesen …' });
  const gesetz = parseGesetzesXML(xmlString);
  if (!gesetz || !gesetz.normgeber)
    return {
      art: 'fehler',
      fehler: {
        grund: 'format',
        meldung: 'XML konnte nicht gelesen werden oder enthält keinen gültigen Normgeber.',
      },
    };

  const gelesen = await leseGesetz(gesetz, meldungEmpfangen);
  if (gelesen.status === 'nicht-lesbar')
    return {
      art: 'fehler',
      fehler: {
        grund: 'laden',
        meldung: 'Das vorhandene Gesetz konnte nicht verlässlich geprüft werden.',
      },
    };
  const bestehendes = gelesen.status === 'geladen' ? gelesen.gesetz : undefined;

  if (bestehendes) {
    const beideMitLetzterNeuerung = gesetz.letzteNeuerung && bestehendes.letzteNeuerung;
    const neu =
      (beideMitLetzterNeuerung ? gesetz.letzteNeuerung : gesetz.verarbeitungszeit)?.getTime() ?? 0;
    const alt =
      (beideMitLetzterNeuerung
        ? bestehendes.letzteNeuerung
        : bestehendes.verarbeitungszeit
      )?.getTime() ?? 0;
    if (neu <= alt) {
      return {
        art: 'fehler',
        fehler: {
          grund: 'bereitsVorhanden',
          meldung: `„${gesetz.kurztitel}" ist bereits in einer gleich aktuellen oder neueren Version vorhanden.`,
        },
      };
    }
  }

  fortschritt?.({ phase: 'speichern', meldung: 'Wird gespeichert …' });
  const fehler = await speichereImportGesetz(gesetz, xmlString, undefined, meldungEmpfangen);
  if (fehler) return { art: 'fehler', fehler };

  fortschritt?.({
    phase: 'fertig',
    meldung: `${gesetz.kurztitel} erfolgreich ${bestehendes ? 'ersetzt' : 'importiert'}.`,
  });

  return { art: 'erfolg', gesetz };
}
