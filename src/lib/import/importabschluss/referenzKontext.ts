// referenzKontext.ts
// Vorgangsgebundene Referenzgrundlage mit bestätigten eigenen Speicherungen und getrennten Diagnosen.
import type { GesetzesreferenzMitLangtitel } from '@/lib/import/basis/basis.index';
import type { Gesetzesreferenz, Normgeber } from '@/lib/domain/gesetzTypes';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import { ermittleGesetzRefs, leseInstallierteGesetzRefs } from './gesetzReferenzen';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';

export interface ReferenzKontext {
  meldeEinschraenkung(quelle: string, meldung: string): void;
  referenzenFuer(normgeber: Normgeber): Promise<GesetzesreferenzMitLangtitel[]>;
  merkeGespeichertesGesetz(gesetz: Gesetzesreferenz & { langtitel?: string }): void;
  mitMeldungsempfaenger<T>(
    arbeit: (kontext: ReferenzKontext) => Promise<T>,
    empfangen: AktionsMeldungEmpfaenger,
  ): Promise<T>;
}

/** Bündelt eindeutige Referenzdiagnosen und meldet sie auch bei Arbeitsfehlern.
 * Die Arbeit muss alle gestarteten Worker abwarten. Kein dauerhafter Zustand.
 */
export async function mitReferenzKontext<T>(
  arbeit: (kontext: ReferenzKontext) => Promise<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  referenzgrundlage:
    'appbestand-und-importindizes' | 'importindizes' = 'appbestand-und-importindizes',
): Promise<T> {
  let grundlage: Promise<GesetzesreferenzMitLangtitel[]> | undefined;
  const eigene = new Map<string, GesetzesreferenzMitLangtitel>();
  const leseInstallierte = async () => {
    // Entwicklerläufe verarbeiten ausschließlich Repositorydateien, auch bei fehlendem Appcache.
    grundlage ??=
      referenzgrundlage === 'importindizes' ? Promise.resolve([]) : leseInstallierteGesetzRefs();
    const referenzen = new Map((await grundlage).map((g) => [gesetzesreferenzSchluessel(g), g]));
    for (const [key, gesetz] of eigene) referenzen.set(key, gesetz);
    return [...referenzen.values()];
  };
  return imKontext(arbeit, meldungEmpfangen);

  async function imKontext<R>(
    arbeit: (kontext: ReferenzKontext) => Promise<R>,
    empfangen?: AktionsMeldungEmpfaenger,
  ): Promise<R> {
    const diagnosen = new Set<string>();
    const kontext: ReferenzKontext = {
      merkeGespeichertesGesetz(gesetz) {
        eigene.set(gesetzesreferenzSchluessel(gesetz), {
          kurztitel: gesetz.kurztitel,
          normgeber: gesetz.normgeber,
          langtitel: gesetz.langtitel ?? gesetz.kurztitel,
        });
      },
      mitMeldungsempfaenger: imKontext,
      meldeEinschraenkung(quelle, meldung) {
        diagnosen.add(`${quelle}: ${meldung}`);
      },
      async referenzenFuer(normgeber) {
        const ergebnis = await ermittleGesetzRefs(normgeber, leseInstallierte);
        for (const fehler of ergebnis.fehler) diagnosen.add(`${fehler.quelle}: ${fehler.meldung}`);
        return ergebnis.referenzen;
      },
    };
    try {
      return await arbeit(kontext);
    } finally {
      if (diagnosen.size > 0) {
        // Die Diagnose bestätigt weder einen abgeschlossenen Import noch eine Speicherung.
        meldePersistenzBefund(
          {
            typ: 'fehler',
            art: 'fehler',
            anlass: 'lesen',
            aenderungsstand: 'keine',
            grund: 'verweiserkennungEingeschraenkt',
            detail: [...diagnosen].join(' · '),
            text: `Die Erkennung von Gesetzesverweisen ist eingeschränkt. Für das Verweistagging stehen nur die verfügbaren Referenzen zur Verfügung; Gesetzeszuordnungen können unvollständig oder falsch sein. ${[...diagnosen].join(' · ')}`,
          },
          empfangen,
        );
      }
    }
  }
}
