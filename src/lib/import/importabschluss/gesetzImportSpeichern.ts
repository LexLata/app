// Gemeinsamer Schreibabschluss: Titel-Folgefehler bewahrt den bestätigten Gesetzeserfolg.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { ImportFehler } from '@/lib/import/importVertrag.types';
import { speichereGesetz, GesetzSpeicherFolgefehler } from '@/lib/persistenz/gesetz/gesetz.index';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';

export async function speichereImportGesetz(
  gesetz: GesetzDarstellung,
  xml: string,
  inhaltGeaendert?: boolean,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportFehler | null> {
  const uebernehmeReferenz = (referenz: Gesetzesreferenz) => {
    gesetz.kurztitel = referenz.kurztitel;
    gesetz.normgeber = referenz.normgeber;
  };
  try {
    const referenz = meldungEmpfangen
      ? await speichereGesetz(gesetz, xml, { inhaltGeaendert, meldungEmpfangen })
      : inhaltGeaendert === undefined
        ? await speichereGesetz(gesetz, xml)
        : await speichereGesetz(gesetz, xml, { inhaltGeaendert });
    uebernehmeReferenz(referenz);
    return null;
  } catch (ursache) {
    if (ursache instanceof GesetzSpeicherFolgefehler) {
      uebernehmeReferenz(ursache.gespeicherteReferenz);
      // Ausdrückliche Empfänger erhalten den Titelbefund schon am Speicherort.
      // Bisherige Hauptfensteraufrufer brauchen den klaren Hinweis zum Gesetzeserfolg.
      if (!meldungEmpfangen) {
        meldePersistenzBefund({
          typ: 'fehler',
          art: 'hinweis',
          anlass: 'synchronisation',
          aenderungsstand: 'teilweise',
          grund: 'titelNichtErgaenzt',
          betroffen: ursache.gespeicherteReferenz.kurztitel,
          detail: ursache.message,
          text: `${ursache.inhaltGeaendert ? 'Das Gesetz wurde gespeichert.' : 'Der Prüfzeitpunkt des Gesetzes wurde aktualisiert.'} Die nichtamtlichen Titel konnten jedoch nicht ergänzt werden: ${ursache.message}`,
        });
      }
      return null;
    }
    const detail = ursache instanceof Error ? ursache.toString() : String(ursache);
    return { grund: 'speichern', meldung: `Gesetz konnte nicht gespeichert werden: ${detail}` };
  }
}
