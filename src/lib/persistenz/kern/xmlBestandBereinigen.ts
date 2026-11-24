// Bereinigt einen XML-Bestand erst nach vollständiger Sicherung unter seiner Dateisperre.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import {
  appDatenExistiert,
  appDatenLesen,
  appDatenSchreiben,
} from '@/lib/persistenz/kern/dateizugriff/dateizugriff.index';
import { sichereBeiUngueltigemInhalt } from './appDatenLesenGeschuetzt';
import {
  mitDateiSperre,
  nachDateiSperrenFreigabe,
} from '@/lib/persistenz/kern/dateizugriff/dateizugriff.index';
import { meldePersistenzBefund } from './persistenzMeldung';

/** Unveränderter Text bedeutet gültig, null bedeutet keine sicher übernehmbaren Inhalte.
 * Die reine Bereinigung wird bei jeder inzwischen geänderten Fassung erneut angewandt. */
export async function bereinigeXmlBestand(
  pfad: string,
  inhalt: string,
  bereinigen: (xml: string) => string | null,
  geaendert: () => Promise<void>,
  token?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  /** Eigener Rohtext; das Detail (z. B. entfernte Einträge) bleibt auch in der gegliederten Anzeige sichtbar. */
  beschreibung?: () => { text: string; detail?: string },
): Promise<string | null> {
  const pruefen = (xml: string) => {
    try {
      return bereinigen(xml);
    } catch {
      return null;
    }
  };
  if (pruefen(inhalt) === inhalt) return inhalt;
  const datei = pfad.split('/').at(-1) ?? pfad;
  const ausfuehren = async (sperrtoken: string) => {
    let frisch: string;
    try {
      frisch = await appDatenLesen(pfad, undefined, meldungEmpfangen);
    } catch (fehler) {
      if (!(await appDatenExistiert(pfad))) return null;
      throw fehler;
    }
    let bereinigt: string | null = null;
    let sicherungspfad: string | undefined;
    try {
      const ergebnis = await sichereBeiUngueltigemInhalt(
        pfad,
        frisch,
        (xml) => {
          bereinigt = pruefen(xml);
          return bereinigt === xml;
        },
        { token: sperrtoken, leerenInhaltPruefen: true, bannerAnzeigen: false },
      );
      if (ergebnis.status === 'gueltig') return ergebnis.inhalt;
      if (ergebnis.status === 'fehlt') return null;
      if (ergebnis.status === 'leer') throw new Error('Ungeprüfter leerer Bestand.');
      sicherungspfad = ergebnis.sicherungspfad;
      if (ergebnis.status !== 'archiviert')
        throw new Error('Die Originaldatei konnte nicht entfernt werden.');
      nachDateiSperrenFreigabe(sperrtoken, geaendert);
      if (bereinigt !== null) await appDatenSchreiben(pfad, bereinigt, sperrtoken);
      // Sicherungspfade nur in der Konsole, nicht in Meldungen.
      console.info(`${pfad}: Sicherung des Originals ${sicherungspfad}`);
      meldeBereinigt(datei, sicherungspfad, beschreibung?.(), meldungEmpfangen);
      return bereinigt;
    } catch (fehler) {
      if (sicherungspfad) console.info(`${pfad}: Sicherung des Originals ${sicherungspfad}`);
      meldeNichtBereinigt(datei, sicherungspfad, meldungEmpfangen);
      throw fehler;
    }
  };
  return token === undefined
    ? mitDateiSperre(pfad, ausfuehren, meldungEmpfangen)
    : ausfuehren(token);
}

function meldeBereinigt(
  datei: string,
  sicherungspfad: string,
  eigene: { text: string; detail?: string } | undefined,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  meldePersistenzBefund(
    {
      typ: 'warnung',
      art: 'hinweis',
      anlass: 'sicherung',
      aenderungsstand: 'vollstaendig',
      grund: 'bereinigt',
      betroffen: datei,
      sicherung: sicherungspfad,
      ...(eigene?.detail ? { detail: eigene.detail } : {}),
      text:
        eigene?.text ??
        `Die Datei ‚${datei}' enthielt ungültige oder nicht mehr zuordenbare Angaben. Sie wurden entfernt; gültige Inhalte bleiben erhalten.`,
    },
    meldungEmpfangen,
  );
}

function meldeNichtBereinigt(
  datei: string,
  sicherungspfad: string | undefined,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  meldePersistenzBefund(
    {
      typ: 'fehler',
      art: 'fehler',
      anlass: 'sicherung',
      aenderungsstand: sicherungspfad ? 'teilweise' : 'keine',
      grund: 'nichtBereinigt',
      betroffen: datei,
      ...(sicherungspfad ? { sicherung: sicherungspfad } : {}),
      text: `Die Datei ‚${datei}' konnte nicht bereinigt werden.${sicherungspfad ? '' : ' Das Original bleibt erhalten.'}`,
    },
    meldungEmpfangen,
  );
}
