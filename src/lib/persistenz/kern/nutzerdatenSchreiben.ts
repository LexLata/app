// Bewahrt abweichende XML-Schemaversionen vor Änderungen unter der Dateisperre.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import {
  appDatenExistiert,
  appDatenLesenOhneHinweis,
  appDatenSchreiben,
} from '@/lib/persistenz/kern/dateizugriff/dateizugriff.index';
import { abweichendeSchemaversion, mitEigenerSchemaversion } from './schemaversionHinweis';
import { meldePersistenzBefund } from './persistenzMeldung';

function dateiname(relativerPfad: string): string {
  return relativerPfad.split('/').at(-1) ?? relativerPfad;
}

/** Sichert eine abweichende Schemaversion vor Überschreiben oder automatischem
 * Leerlöschen. Der Aufrufer hält die Dateisperre bis zum Abschluss der Änderung.
 * Liefert den Sicherungspfad, ohne nötige Sicherung undefined.
 * Ein Fehler verhindert die Änderung und wird nach einer Nutzermeldung geworfen. */
export async function sichereNutzerdatenVorAenderung(
  relativerPfad: string,
  token?: string,
  vorgang?: string,
): Promise<string | undefined> {
  let sicherungspfad: string | undefined;
  try {
    if (await appDatenExistiert(relativerPfad)) {
      const bisher = await appDatenLesenOhneHinweis(relativerPfad);
      if (abweichendeSchemaversion(bisher) !== null) {
        sicherungspfad = await rufeBefehl('sichere_abweichende_version', {
          relativerPfad,
          ...(token === undefined ? {} : { token }),
          ...(vorgang === undefined ? {} : { vorgang }),
        });
      }
    }
  } catch (fehler) {
    meldePersistenzBefund({
      anlass: 'sicherung',
      art: 'fehler',
      aenderungsstand: 'keine',
      typ: 'fehler',
      grund: 'sicherungFehlgeschlagen',
      betroffen: dateiname(relativerPfad),
      text: `Die Datei ‚${dateiname(relativerPfad)}' konnte vor der Änderung nicht gesichert werden. Änderungen daran werden nicht gespeichert.`,
    });
    throw fehler;
  }
  if (sicherungspfad !== undefined) {
    // Sicherungspfade nur in der Konsole, nicht in Meldungen.
    console.info(`${relativerPfad}: Sicherung ${sicherungspfad}`);
    meldePersistenzBefund({
      anlass: 'sicherung',
      art: 'hinweis',
      aenderungsstand: 'teilweise',
      typ: 'warnung',
      grund: 'wegenSchemaversionGesichert',
      betroffen: dateiname(relativerPfad),
      sicherung: sicherungspfad,
      text: `Die Datei ‚${dateiname(relativerPfad)}' wurde wegen abweichender Schemaversion, möglicherweise aus einer neueren App-Version, vollständig gesichert.`,
    });
  }
  return sicherungspfad;
}

/** Aufrufer hält dieselbe Dateisperre für Lesen, Sicherung und atomaren Schreibvorgang. */
export async function nutzerdatenSchreiben(
  relativerPfad: string,
  inhalt: string,
  token?: string,
  vorgang?: string,
): Promise<void> {
  const sicherungspfad = await sichereNutzerdatenVorAenderung(relativerPfad, token, vorgang);
  try {
    await appDatenSchreiben(relativerPfad, mitEigenerSchemaversion(inhalt), token, vorgang);
  } catch (fehler) {
    if (sicherungspfad !== undefined)
      meldePersistenzBefund({
        anlass: 'sicherung',
        art: 'fehler',
        aenderungsstand: 'teilweise',
        typ: 'fehler',
        grund: 'nichtSpeicherbar',
        betroffen: dateiname(relativerPfad),
        sicherung: sicherungspfad,
        text: `Die Datei ‚${dateiname(relativerPfad)}' konnte nicht gespeichert werden.`,
      });
    throw fehler;
  }
}
