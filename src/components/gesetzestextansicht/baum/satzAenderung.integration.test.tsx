// @vitest-environment jsdom
// Satz-Wrapper dürfen unveränderte Markierungen weder verwaisen lassen noch verbergen.
import { useContext } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { MarkierungCtx } from '@/components/gesetzestextansicht/markierung/markierung.index';
import {
  TextDarstellungsRahmen,
  useTextDarstellungsModell,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { NormBlock } from './normBlock';

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null));
afterEach(() => vi.restoreAllMocks());

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
      const neu = gesetz(fall.inhalt(gestrichen ? erster : zwei));
      const eintrag = markierung({ ...fall.pfad, [fall.feld]: gestrichen ? 1 : undefined });
      const norm = neu.elemente[0];
      if (norm?.typ !== 'norm') throw new Error('Norm erwartet');
      const normDaten = norm.data;
      function Ansicht() {
        const modell = useTextDarstellungsModell({});
        const basis = useContext(MarkierungCtx);
        return (
          <TextDarstellungsRahmen modell={modell}>
            <MarkierungCtx.Provider
              value={{ ...basis, markierungenNachXmlId: new Map([['n1', [eintrag]]]) }}
            >
              <NormBlock norm={normDaten} schrift={16} satzNeuZeile />
            </MarkierungCtx.Provider>
          </TextDarstellungsRahmen>
        );
      }
      const doc = new DOMParser().parseFromString(renderToStaticMarkup(<Ansicht />), 'text/html');
      const unterstrichen = [...doc.querySelectorAll<HTMLElement>('span')].filter(
        (el) => el.style.textDecoration === 'underline',
      );
      expect(unterstrichen.map((el) => el.textContent).join('')).toBe(erster);
    },
  );
}
