// markierungSpeicher.dateiImport.ts
//
// Zusammenführung importierter Markierungen mit dem Bestand (siehe
// dateiImport.ts), ausgelagert aus markierungSpeicher.ts (500-Zeilen-
// Richtwert) – nur von dort genutzt, daher fachlich klar abgegrenzt von der
// übrigen, allgemeinen Markierungs-Persistenz-API.

import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  aendereEintraege,
  ersetzeMarkierungsXML,
  leseMarkierungsXML,
  bereichUeberlappt,
  istIdentischeAllgemeineMarkierung,
} from '@/lib/markierungen/eintrag/eintrag.index';
import type { EintragsAenderung } from '@/lib/markierungen/eintrag/eintrag.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  baueXML,
  eintraegeSindGleich,
  parseEintraege,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import type { MarkierungsBefund } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

/**
 * Führt eine per Datei-Import importierte Eintragsliste mit den bereits
 * bestehenden Markierungen EINES Gesetzes zusammen (siehe Absprache zum
 * Datei-Import). Zwei Dopplungsarten:
 *   - Dopplung (+): die importierte Markierung hat einen Textbezug
 *     (zeichenbereichStart/zeichenbereichEnde) und überlappt eine bestehende Markierung
 *     an derselben Stelle – unabhängig vom jeweiligen Typ.
 *   - Dopplung (-): ein allgemeiner Verweis oder Kommentar (kein Textbezug)
 *     ist inhaltlich identisch zu einem bereits bestehenden (siehe
 *     istIdentischeAllgemeineMarkierung in markierungSpeicher.ts – einheitlich
 *     für Verweis UND Kommentar, gleiche Prüfung wie beim Live-Anlegen).
 * Bewusst getrennt von hinzufuegenMarkierung (markierungSpeicher.ts): dessen
 * Splitting-/Kombinieren-Regeln sind für das Live-Editing EINER neuen
 * Markierung gegen den Bestand gedacht, nicht für den Bulk-Merge zweier
 * kompletter Listen.
 *
 * `behalteBestehendeBeiKonflikt` (Standard true, siehe Checkbox im
 * DateiImportOverlay): bei einer erkannten Dopplung werden alle bisherigen
 * Einträge behalten und der importierte übersprungen; bei false wird
 * stattdessen jeder Konfliktpartner vollständig entfernt und der importierte
 * Eintrag genau einmal aufgenommen. Spätere Importeinträge werden gegen das
 * bisherige Zusammenführungsergebnis geprüft.
 * Liefert true bei einer Änderung; bei Dopplungen oder identischem Ergebnis false.
 * Schreibt die Datei nur, wenn sich tatsächlich etwas geändert hat. Der optionale
 * Empfänger erhält die Meldungen dieses Speicheraufrufs statt eines Banners.
 * zielGeschrieben bestätigt synchron die Zieldatei vor unmittelbar folgenden Fehlern.
 */
export async function zusammenfuehrenMarkierungen(
  gesetz: Gesetzesreferenz,
  importierte: MarkierungsEintrag[],
  behalteBestehendeBeiKonflikt = true,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  zielGeschrieben?: () => void,
): Promise<boolean> {
  if (importierte.length === 0) return false;
  return aendereEintraege(
    gesetz,
    (bisherige): EintragsAenderung<boolean> => {
      let ergebnis = [...bisherige];
      let veraendert = false;
      for (const neu of importierte) {
        let uebernehmen = neu;
        const hatTextbezug = neu.bezug.typ === 'bezugstext';
        const istKonflikt = (e: MarkierungsEintrag) =>
          hatTextbezug
            ? bereichUeberlappt(e, neu)
            : (neu.typ === 'verweismarkierung' || neu.typ === 'kommentar') &&
              istIdentischeAllgemeineMarkierung(e, neu);
        const konflikte = ergebnis.filter(istKonflikt);
        if (konflikte.length > 0) {
          if (behalteBestehendeBeiKonflikt) continue;
          const identisch = konflikte.find((alt) => eintraegeSindGleich(gesetz, [alt], [neu]));
          if (konflikte.length === 1 && identisch) continue;
          uebernehmen = identisch ?? neu;
          ergebnis = ergebnis.filter((e) => !istKonflikt(e));
        }
        ergebnis.push(uebernehmen);
        veraendert = true;
      }
      return veraendert && !eintraegeSindGleich(gesetz, ergebnis, bisherige)
        ? { art: 'geaendert', eintraege: ergebnis, ergebnis: true }
        : { art: 'unveraendert', ergebnis: false };
    },
    meldungEmpfangen,
    zielGeschrieben,
  );
}

/**
 * Liest den rohen Markierungen-XML-Text eines Gesetzes, oder null wenn
 * keine Datei gelesen werden konnte. Dieser tolerante Vertrag gilt nur
 * für den Datei-Import-Inhaltsvergleich (siehe
 * dateiImport.ts).
 */
export async function leseMarkierungenRohtext(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  return leseMarkierungsXML(gesetz, meldungEmpfangen);
}

/**
 * Ersetzt die Markierungen-Datei eines Gesetzes vollständig durch
 * importInhalt (Datei-Import „Ersetzen", siehe dateiImport.ts/
 * DateiImportOverlay.tsx) – im Gegensatz zu zusammenfuehrenMarkierungen wird
 * hier NICHT zusammengeführt, sondern die bestehende Datei 1:1 durch die
 * importierte ersetzt. Ausschließlich unlesbarer Eingang schreibt nichts und
 * liefert false; eine gültige leere Datei bleibt zulässig. Diagnose und
 * Speichermeldungen gehen an den optionalen Empfänger, sonst an den Banner.
 * zielGeschrieben bestätigt synchron die Zieldatei vor Quellabschluss/Ereignissen.
 */
export async function ersetzeMarkierungenDatei(
  gesetz: Gesetzesreferenz,
  importInhalt: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  zielGeschrieben?: () => void,
): Promise<boolean> {
  const gelesen = parseEintraege(importInhalt, gesetz);
  meldeImportBefunde(gelesen, meldungEmpfangen);
  if (gelesen.befunde.length > 0 && gelesen.eintraege.length === 0) return false;
  await ersetzeMarkierungsXML(
    gesetz,
    gelesen.befunde.length > 0 ? baueXML(gesetz, gelesen.eintraege) : importInhalt,
    meldungEmpfangen,
    zielGeschrieben,
  );
  return true;
}

function meldeImportBefunde(
  gelesen: ReturnType<typeof parseEintraege>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  if (gelesen.befunde.length === 0) return;
  meldePersistenzBefund(
    {
      typ: 'warnung',
      art: 'hinweis',
      anlass: 'import',
      aenderungsstand: 'keine',
      text: `Die Importdatei enthält ${gelesen.befunde.length} nicht lesbare Markierungseinträge (${gelesen.befunde
        .slice(0, 3)
        .map((b) => b.ort ?? 'ohne Ausgangsstelle')
        .join(', ')}). Nur lesbare Einträge werden übernommen; die Importdatei bleibt unverändert.`,
    },
    meldungEmpfangen,
  );
}

/** Diagnose vor Importvergleich; meldet nichts selbst und verändert keine Quelle. */
export function beurteileMarkierungsImport(xml: string, gesetz: Gesetzesreferenz) {
  const gelesen = parseEintraege(xml, gesetz);
  const gruende: Record<MarkierungsBefund['fall'], string> = {
    ausgangsstelleFehlt: 'Die Ausgangsstelle fehlt.',
    ausgangsstelleMehrfach: 'Die Ausgangsstelle ist mehrfach angegeben.',
    ausgangsstelleUngueltig: 'Die Kennung der Ausgangsstelle ist ungültig.',
    textbezugUngueltig: 'Der Textbezug fehlt oder sein Zeichenbereich ist ungültig.',
    textpfadUngueltig: 'Der Textpfad ist ungültig.',
    verweisinhaltFehlt: 'Der Verweisinhalt fehlt oder ist ungültig.',
    normgeberFehlt: 'Der Normgeber fehlt.',
    verweiszielUngueltig: 'Ein Verweisziel ist ungültig.',
    elementstandUngueltig: 'Der Elementstand fehlt oder ist ungültig.',
    kommentarTextFehlt: 'Der Kommentartext fehlt.',
    markierungsinhaltUngueltig:
      'Der Markierungsinhalt enthält widersprüchliche oder mehrfache Angaben.',
  };
  return {
    eintraege: gelesen.eintraege,
    ausgeschlossen: gelesen.befunde.length,
    meldungen: gelesen.befunde.map((b): AktionsMeldung => ({
      typ: 'warnung',
      art: 'hinweis',
      anlass: 'import',
      aenderungsstand: 'keine',
      text: `Ausgangsstelle ${b.ort ?? 'unbekannt'}: ${gruende[b.fall]}`,
      grund: 'markierungNichtLesbar',
    })),
  };
}

/** Nur ein fehlerfreier Bestand darf den Import als unverändert erledigen.
 * Beschädigte Bestände bleiben dem geschützten Lader mit Sicherung vorbehalten. */
export function istMarkierungsImportUnveraendert(
  gesetz: Gesetzesreferenz,
  bestehend: string,
  importierte: readonly MarkierungsEintrag[],
): boolean {
  try {
    const gelesen = parseEintraege(bestehend, gesetz);
    return (
      gelesen.befunde.length === 0 && eintraegeSindGleich(gesetz, gelesen.eintraege, importierte)
    );
  } catch {
    // Der geschützte Speicherweg verantwortet Meldung und Sicherung defekten Bestands.
    return false;
  }
}
