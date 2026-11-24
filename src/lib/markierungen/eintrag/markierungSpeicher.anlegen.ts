// Schützt Auflösung und Bezugsberechnung einer Neuanlage bis zum Schreiben.
import { GESETZE_ORDNER, NICHTAMTLICHE_TITEL_ORDNER } from '@/lib/persistenz/kern/kern.index';
import { MARKIERUNGEN_SUFFIX, NICHTAMTLICHE_TITEL_SUFFIX } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type {
  Gesetzesreferenz,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import { berechneElementstand } from '@/lib/domain/gesetzDarstellungAuswertung';
import { aktuellerTextAnPfad } from '@/lib/domain/textpfad/textpfad.index';
import {
  findeElementZuBezeichnung,
  type MarkierungsEintrag,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { ladeGesetzFuerVerknuepfung } from '@/lib/persistenz/gesetz/gesetz.index';
import { ermittleGesetzDateipfad, mitGesetzDateiSperren } from '@/lib/persistenz/kern/kern.index';
import {
  ermittleMarkierungsDateipfad,
  MARKIERUNGEN_ORDNER,
  mitMarkierungsQuelle,
} from './markierungSpeicher';

/** Einmal vormerken, dann alle benötigten Quellen bis zum fertigen Schreiben halten.
 * Abschluss und Ereignisse laufen erst nach Freigabe. Wiederherstellungen nutzen diesen Weg nicht. */
export async function mitGepruefterAusgangsstelle<T>(
  gesetz: Gesetzesreferenz,
  eintrag: MarkierungsEintrag,
  schreiben: (
    eintrag: MarkierungsEintrag,
    element: NormDarstellung | UeberschriftDarstellung,
    token: string,
    vorgang: string,
    geaendert: (schluessel?: string) => void,
  ) => Promise<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T | { erfolgreich: false; ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig' }> {
  const titelBenoetigt = eintrag.bezug.textstelle?.pfad.bereich === 'nichtamtlicherTitel';
  const titelOrdner = NICHTAMTLICHE_TITEL_ORDNER;
  const titelSuffix = NICHTAMTLICHE_TITEL_SUFFIX;
  let tokens: ReadonlyMap<string, string> = new Map();
  const quelle = async (ordner: string, suffix: string) => {
    const pfad = await ermittleGesetzDateipfad(gesetz, ordner, suffix);
    const token = tokens.get(pfad);
    if (!token) throw new Error('Eine benötigte Ausgangsquelle ist nicht gesperrt.');
    return { pfad, token };
  };
  return mitMarkierungsQuelle(
    gesetz,
    async (token, vorgang, geaendert) => {
      const aktuell = await ladeGesetzFuerVerknuepfung(
        gesetz,
        await quelle(GESETZE_ORDNER, '.xml'),
        titelBenoetigt ? await quelle(titelOrdner, titelSuffix) : undefined,
        meldungEmpfangen,
      );
      const element = aktuell
        ? findeElementZuBezeichnung(aktuell, eintrag.ausgangsstelle)
        : undefined;
      if (!element)
        return { erfolgreich: false, ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig' } as const;
      let frisch: MarkierungsEintrag;
      if (eintrag.typ === 'kommentar' || eintrag.typ === 'verweismarkierung') {
        if (eintrag.bezug.typ === 'pauschal') {
          return schreiben(
            { ...eintrag, bezug: { typ: 'pauschal', elementstand: berechneElementstand(element) } },
            element,
            token,
            vorgang,
            geaendert,
          );
        }
      }
      const bezug = eintrag.bezug;
      if (bezug.typ === 'pauschal') {
        throw new Error('Eine Unterstreichung oder Hervorhebung benötigt Bezugstext.');
      } else {
        const bezugstext = aktuellerTextAnPfad(element, bezug.textstelle);
        if (bezugstext === undefined)
          return { erfolgreich: false, ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig' } as const;
        frisch = { ...eintrag, bezug: { ...bezug, bezugstext } };
      }
      return schreiben(frisch, element, token, vorgang, geaendert);
    },
    (ausfuehren) =>
      mitGesetzDateiSperren(
        [
          { gesetz, ordner: GESETZE_ORDNER, suffix: '.xml' },
          { gesetz, ordner: MARKIERUNGEN_ORDNER, suffix: MARKIERUNGEN_SUFFIX },
          ...(titelBenoetigt ? [{ gesetz, ordner: titelOrdner, suffix: titelSuffix }] : []),
        ],
        async (gehalten) => {
          tokens = gehalten;
          const token = gehalten.get(await ermittleMarkierungsDateipfad(gesetz));
          if (!token) throw new Error('Die Markierungsdatei ist nicht gesperrt.');
          return ausfuehren(token);
        },
        meldungEmpfangen,
      ),
    false,
    meldungEmpfangen,
  );
}
