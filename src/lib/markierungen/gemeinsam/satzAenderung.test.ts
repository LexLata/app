// Satzänderungen lassen unveränderte Bezüge bestehen und erhalten echte Konflikte.
import { expect, it } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { pruefeMarkierungenEinesGesetzes } from './markierungskonfliktPruefung';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
const erster = 'Erster.';
const zwei = '<satz zahl="1">Erster.</satz><satz zahl="2">Zweiter.</satz>';
const faelle = [
  {
    art: 'Absatz',
    inhalt: (text: string) => `<absatz zahl="(1)">${text}</absatz>`,
    pfad: normtextPfad({ absatz: '(1)' }),
    feld: 'satz',
  },
  {
    art: 'Unterabsatz',
    inhalt: (text: string) =>
      `<absatz zahl="(1)"><unterabsatz zahl="[1]">${text}</unterabsatz></absatz>`,
    pfad: normtextPfad({ absatz: '(1)', unterabsatz: '[1]' }),
    feld: 'satz',
  },
  {
    art: 'Listeneintrag',
    inhalt: (text: string) => `<absatz zahl="(1)">Liste:<nummer zahl="1">${text}</nummer></absatz>`,
    pfad: normtextPfad({ absatz: '(1)', eintraege: [{ ebene: 'nummer', bezeichnung: '1' }] }),
    feld: 'satzInEintrag',
  },
] as const;
function gesetz(inhalt: string) {
  const g = parseGesetzesXML(
    `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text>${inhalt}</text></norm></inhalt></gesetz>`,
  );
  if (!g) throw new Error('Gesetz erwartet');
  return g;
}
function markierung(
  pfad: Extract<import('@/lib/domain/textpfad/textpfad.index').Textpfad, { typ: 'normtext' }>,
  bezugstext = erster,
) {
  return markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext',
      textstelle: {
        pfad,
        zeichenbereichStart: 0,
        zeichenbereichEnde: bezugstext.length,
      },
      bezugstext,
    },
  });
}
for (const fall of faelle) {
  it.each([false, true])(
    `erhält bei ${fall.art} die sichtbare Markierung nach Satzwechsel (gestrichen: %s)`,
    (gestrichen) => {
      const alt = gesetz(fall.inhalt(gestrichen ? zwei : erster));
      const neu = gesetz(fall.inhalt(gestrichen ? erster : zwei));
      const eintrag = markierung({ ...fall.pfad, [fall.feld]: gestrichen ? 1 : undefined });
      const pruefen = (g: typeof alt) =>
        pruefeMarkierungenEinesGesetzes(
          gesetzesreferenz({ kurztitel: 'G' }),
          g,
          [eintrag],
          [],
          new Set(),
        );
      expect(pruefen(alt).eintraege).toEqual([]);
      expect(pruefen(neu).eintraege).toEqual([]);
    },
  );
  it(`meldet bei ${fall.art} gestrichenen Satz 2 und vorangestellten neuen Satz als Konflikte`, () => {
    for (const [inhalt, pfad, text] of [
      [erster, { ...fall.pfad, [fall.feld]: 2 }, 'Zweiter.'],
      ['<satz zahl="1">Neuer.</satz><satz zahl="2">Erster.</satz>', fall.pfad, erster],
    ] as const) {
      const result = pruefeMarkierungenEinesGesetzes(
        gesetzesreferenz({ kurztitel: 'G' }),
        gesetz(fall.inhalt(inhalt)),
        [markierung(pfad, text)],
        [],
        new Set(),
      );
      expect(result.eintraege).toMatchObject([{ eigenerKonflikt: 'bezugstextFehltOderUnpassend' }]);
    }
  });
}
