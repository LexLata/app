// markierungskonfliktPruefung.unicode.test.ts
// Ende-zu-Ende über Darstellungsparser und Konfliktprüfung: Eine zerlegte Unicode-Schreibweise
// derselben Quelle erzeugt keinen Markierungskonflikt.
import { describe, expect, it } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { kommentar, unterstreichung } from '@/test/markierungen/markierungsFabriken';
import { pruefeEigenenKonflikt } from './markierungskonfliktPruefung';

// „ä“ zerlegt: a + U+0308, zusammengesetzt: U+00E4.
const zerlegt = (s: string) => s.replaceAll('\u00e4', 'a\u0308');

const gesetzesXML =
  '<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><titel>Wählbarkeit</titel><text><absatz zahl="(1)"><satz zahl="1">Die Erklärung ist wählbar.</satz></absatz></text></norm></inhalt></gesetz>';

function gelesen(xml: string) {
  const gesetz = parseGesetzesXML(xml);
  if (!gesetz) throw new Error('Gesetz nicht lesbar');
  return gesetz;
}

describe('Markierungskonflikt bei zerlegter Unicode-Schreibweise', () => {
  // „Die Erklärung ist wählbar.“: „wählbar“ liegt in NFC bei 18 bis 25 (UTF-16-Einheiten).
  const markierungAufNfc = unterstreichung({
    textstelle: {
      pfad: normtextPfad({ absatz: '(1)', satz: 1 }),
      zeichenbereichStart: 18,
      zeichenbereichEnde: 25,
    },
    bezugstext: 'wählbar',
  });
  // Elementstand der NFC-Norm: Textlänge 26, amtlicher Titel „Wählbarkeit“.
  const pauschalAufNfc = kommentar({ elementstand: { titel: 'Wählbarkeit', textlaenge: 26 } });

  it('meldet für die Markierung auf NFC-Text keinen Konflikt, wenn das Gesetz zerlegt eintrifft', () => {
    expect(zerlegt(gesetzesXML)).not.toBe(gesetzesXML);
    expect(pruefeEigenenKonflikt(markierungAufNfc, gelesen(gesetzesXML))).toBeUndefined();
    expect(pruefeEigenenKonflikt(markierungAufNfc, gelesen(zerlegt(gesetzesXML)))).toBeUndefined();
  });

  it('meldet für die pauschale Markierung keinen Konflikt, wenn das Gesetz zerlegt eintrifft', () => {
    expect(pruefeEigenenKonflikt(pauschalAufNfc, gelesen(gesetzesXML))).toBeUndefined();
    expect(pruefeEigenenKonflikt(pauschalAufNfc, gelesen(zerlegt(gesetzesXML)))).toBeUndefined();
  });
});
