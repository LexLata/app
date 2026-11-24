// Verhalten der Konflikttexte gemäß der verbindlichen Darstellungsvorgabe.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { zeilenVonEintrag } from './MarkierungskonfliktFenster.helpers';
import { kuerzeVorschautext } from './konfliktTexte';
import type { AnzeigeKonfliktEintrag } from '@/lib/markierungen/markierungen.index';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

const basis: AnzeigeKonfliktEintrag = {
  schluessel: 'a',
  ausgangsstelle: normAusgangsstelle('§ 1'),
  bezeichnungAnzeige: '§ 1',
  markierungstyp: 'unterstreichung',
  bezugstext: 'Vertrag',
  zielKonflikte: [],
};
const zeile = (a: Partial<AnzeigeKonfliktEintrag>) => zeilenVonEintrag({ ...basis, ...a })[0]!;

const typen = [
  ['unterstreichung', 'Unterstrichener Text', 'die Unterstreichung'],
  ['hervorhebung', 'Hervorgehobener Text', 'die Hervorhebung'],
  ['kommentar', 'Kommentierter Text', 'der Kommentar'],
  ['verweismarkierung', 'Bezugstext des Verweises', 'der Verweis'],
] as const;
const bereiche = [
  [undefined, undefined, 'Der Normtext', 'den'],
  ['amtlicherTitel', undefined, 'Der Normtitel', 'den'],
  ['nichtamtlicherTitel', undefined, 'Der nichtamtliche Titel', 'den'],
  ['bezeichnung', undefined, 'Die Normbezeichnung', 'die'],
  ['amtlicherTitel', true, 'Der Überschriftentitel', 'den'],
  ['bezeichnung', true, 'Die Überschriftenbezeichnung', 'die'],
] as const;
for (const [markierungstyp, vorschau, markierung] of typen) {
  for (const [bereich, ueberschrift, name, pronomen] of bereiche) {
    it(`${markierungstyp}: ${name}`, () => {
      const z = zeile({
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        markierungstyp,
        bereich,
        ausgangsstelle: ueberschrift
          ? ueberschriftAusgangsstelle('010')
          : normAusgangsstelle('§ 1'),
        bezeichnungAnzeige: ueberschrift ? 'Allgemeine Vorschriften' : '§ 1',
        textpfad: normtextPfad({ absatz: '(1)', satz: 1 }),
      });
      expect(z.vorschau).toBe(
        `${ueberschrift ? 'Allgemeine Vorschriften' : '§ 1'}: ${vorschau} „Vertrag“ verändert`,
      );
      expect(z.vorschauPunkt).toBe(
        `${markierungstyp === 'verweismarkierung' ? 'Bezugstext' : vorschau} „Vertrag“ verändert`,
      );
      expect(z.erlaeuterung).toBe(
        `${name}, auf ${pronomen} sich ${markierung} bezieht, fehlt oder hat sich verändert. Die Markierung bezieht sich auf „Vertrag“${!bereich && !ueberschrift ? ' in Abs. 1 S. 1' : ''}.`,
      );
    });
  }
}
for (const ueberschrift of [undefined, true] as const) {
  const ausgang = 'Ausgangsstelle';
  for (const markierungstyp of ['kommentar', 'verweismarkierung'] as const) {
    const typ = markierungstyp === 'kommentar' ? 'Kommentar' : 'Verweis';
    for (const fehlt of [true, false])
      it(`${ausgang} ${typ} ${fehlt}`, () => {
        const z = zeile({
          markierungstyp,
          ausgangsstelle: ueberschrift
            ? ueberschriftAusgangsstelle('010')
            : normAusgangsstelle('§ 1'),
          eigenerKonflikt: fehlt ? 'pauschalerBezugFehlt' : 'pauschalerBezugUnpassend',
        });
        expect(z.vorschau).toBe(`§ 1: ${typ}, ${ausgang} ${fehlt ? 'fehlt' : 'verändert'}`);
        expect(z.vorschauPunkt).toBe(`${typ}, ${ausgang} ${fehlt ? 'fehlt' : 'verändert'}`);
        expect(z.erlaeuterung).toBe(
          `Die ${ausgang}, an der der ${typ} steht, ${fehlt ? 'fehlt' : 'hat sich verändert'}.`,
        );
      });
  }
  it(`${ausgang} nicht eindeutig`, () => {
    const z = zeile({
      ausgangsstelle: ueberschrift ? ueberschriftAusgangsstelle('010') : normAusgangsstelle('§ 1'),
      eigenerKonflikt: 'pauschalerBezugFehlt',
      ausgangsTrefferzahl: 4,
    });
    expect(z.vorschau).toBe(`§ 1: Unterstreichung, ${ausgang} nicht eindeutig`);
    expect(z.erlaeuterung).toBe(
      ueberschrift
        ? 'Zur Ausgangsstelle passen mehrere Überschriften im Gesetz.'
        : 'Zur Ausgangsstelle § 1 passen mehrere Normen im Gesetz.',
    );
  });
  for (const [typ, befund, konflikt, ende] of [
    ['zielNormUnpassend', 'unpassend', 'verändert', 'hat sich verändert'],
    ['zielNormFehlt', 'fehlt', 'fehlt', 'fehlt'],
    ['zielNormFehlt', 'nichtEindeutig', 'nicht eindeutig', ''],
  ] as const)
    for (const [n, ziel, zieltyp, anfang, jeweils, koennen] of [
      [1, 'Art. 1 GG', 'Zielnorm', 'Zur Zielnorm', '', 'kann'],
      [2, 'Art. 1, 2 GG', 'Zielnormen', 'Zu den Zielnormen', 'jeweils ', 'können'],
    ] as const)
      it(`${typ} ${befund} ${n} ${ausgang}`, () => {
        const z = zeile({
          ausgangsstelle: ueberschrift
            ? ueberschriftAusgangsstelle('010')
            : normAusgangsstelle('§ 1'),
          verweistext: 'Art. 1, 2 GG',
          zielKonflikte: [
            {
              typ,
              gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
              bezeichnungenAnzeige: Array.from({ length: n }, (_, i) => ({
                bezeichnung: 'Art. ' + String(i + 1),

                befund,
              })),
            },
          ],
        });
        const beschreibung = `${zieltyp} ${konflikt === 'fehlt' && n === 2 ? 'fehlen' : konflikt}`;
        expect(z.vorschau).toBe(`§ 1: Verweis auf ${ziel}: ${beschreibung}`);
        expect(z.vorschauPunkt).toBe(`${ziel}: ${beschreibung}`);
        expect(z.erlaeuterung).toBe(
          befund === 'nichtEindeutig'
            ? `${anfang} ${ziel}, auf die sich der Verweis „Art. 1, 2 GG“ bezieht, passen ${jeweils}mehrere Normen. Sie ${koennen} deshalb nicht neu verknüpft werden.`
            : `Die Zielnorm${n === 2 ? 'en' : ''} ${ziel}, auf die sich der Verweis „Art. 1, 2 GG“ bezieht, ${n === 2 ? (befund === 'fehlt' ? 'fehlen' : 'haben sich verändert') : ende}.`,
        );
      });
}
it('Zielgesetz und Rückfall', () => {
  const z = zeile({
    verweistext: 'Art. 1 GG',
    zielKonflikte: [
      {
        typ: 'zielGesetzFehlt',
        gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
        bezeichnungenAnzeige: [],
      },
    ],
  });
  expect(z.vorschau).toBe('§ 1: Verweis auf GG: Gesetz nicht auf dem Gerät');
  expect(z.vorschauPunkt).toBe('GG: Gesetz nicht auf dem Gerät');
  expect(z.erlaeuterung).toBe(
    'Der Verweis „Art. 1 GG“ bezieht sich auf ein Gesetz, das nicht auf dem Gerät ist.',
  );
  for (const typ of ['zielNormFehlt', 'zielNormUnpassend'] as const) {
    const r = zeile({
      bezugstext: undefined,
      zielKonflikte: [
        { typ, gesetz: gesetzesreferenz({ kurztitel: 'GG' }), bezeichnungenAnzeige: [] },
      ],
    });
    expect(r.erlaeuterung).toBe(
      `Die Zielnorm, auf die sich der Verweis bezieht, ${typ === 'zielNormFehlt' ? 'fehlt' : 'hat sich verändert'}.`,
    );
  }
  expect(
    zeile({ bezugstext: undefined, eigenerKonflikt: 'bezugstextFehltOderUnpassend' }).erlaeuterung,
  ).toBe('Der Normtext, auf den sich die Unterstreichung bezieht, fehlt oder hat sich verändert.');
});
it.each([
  ['normWeggefallen', 'die Norm weggefallen ist'],
  ['normHatAmtlichenTitel', 'die Norm jetzt einen amtlichen Titel hat'],
  ['normNichtImGesetz', 'die Norm nicht mehr im Gesetz vorhanden ist'],
] as const)('nichtamtlicher Titel: %s', (nichtamtlicherTitelGrund, grund) => {
  expect(
    zeile({
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      bereich: 'nichtamtlicherTitel',
      nichtamtlicherTitelGrund,
    }).erlaeuterung,
  ).toBe(
    `Der nichtamtliche Titel, auf den sich die Unterstreichung bezieht, wird nicht mehr angezeigt, weil ${grund}. Die Markierung bezieht sich auf „Vertrag“.`,
  );
});
it('kürzt Vorschau, aber nie Erläuterung', () => {
  const bezugstext = 'Eine sehr lange Beschreibung mit vielen weiteren Wörtern';
  const z = zeile({ bezugstext, eigenerKonflikt: 'bezugstextFehltOderUnpassend' });
  expect(z.vorschau).toContain('„Eine sehr lange Beschreibung…“');
  expect(z.erlaeuterung).toContain(bezugstext);
});
it('Kürzung erhält kurze Texte und wahrt Wortgrenzen', () => {
  fc.assert(
    fc.property(fc.string(), (s) => {
      const k = kuerzeVorschautext(s);
      if (s.length <= 30) expect(k).toBe(s);
      else {
        expect(k.endsWith('…')).toBe(true);
        const anfang = k.slice(0, -1);
        expect(anfang.length).toBeLessThanOrEqual(30);
        expect(s.startsWith(anfang)).toBe(true);
        if (anfang.length < 30) expect(/\s/.test(s[anfang.length]!)).toBe(true);
      }
    }),
  );
});

it('nennt beim fehlenden Zielgesetz keine noch nicht beurteilbaren Zielnormen', () => {
  const z = zeile({
    verweistext: 'Art. 10 GG',
    zielKonflikte: [
      {
        typ: 'zielGesetzFehlt',
        gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
        bezeichnungenAnzeige: [{ bezeichnung: 'Art. 10' }],
      },
    ],
  });
  expect(z.vorschau).toBe('§ 1: Verweis auf GG: Gesetz nicht auf dem Gerät');
  expect(z.vorschauPunkt).toBe('GG: Gesetz nicht auf dem Gerät');
});

it('kürzt nur dann mitten im Wort, wenn schon das erste Wort länger als 30 Zeichen ist', () => {
  fc.assert(
    fc.property(
      fc.array(fc.stringMatching(/^[a-z]{1,45}$/), { minLength: 1, maxLength: 10 }),
      (woerter) => {
        const text = woerter.join(' ');
        const gekuerzt = kuerzeVorschautext(text);
        if (text.length <= 30) {
          expect(gekuerzt).toBe(text);
          return;
        }
        const anfang = gekuerzt.slice(0, -1);
        expect(gekuerzt.endsWith('…')).toBe(true);
        expect(anfang.length).toBeLessThanOrEqual(30);
        expect(text.startsWith(anfang)).toBe(true);
        if (text[anfang.length] !== ' ') {
          expect(woerter[0]!.length).toBeGreaterThan(30);
          expect(anfang.length).toBe(30);
        } else {
          const naechstesWort = woerter[anfang.split(' ').length]!;
          expect(anfang.length + 1 + naechstesWort.length).toBeGreaterThan(30);
        }
      },
    ),
  );
});

it('kürzt den Anzeigenamen einer Überschrift in der Vorschau', () => {
  const z = zeile({
    ausgangsstelle: ueberschriftAusgangsstelle('010'),
    bezeichnungAnzeige: 'Eine sehr lange Überschrift mit weiteren Wörtern',
    eigenerKonflikt: 'bezugstextFehltOderUnpassend',
  });
  expect(z.vorschau).toBe('Eine sehr lange Überschrift…: Unterstrichener Text „Vertrag“ verändert');
});

it.each(['433', 'E25'])(
  'zeigt das gespeicherte Ziel %s ohne zusätzliche Trennzeichen',
  (bezeichnung) => {
    const z = zeile({
      zielKonflikte: [
        {
          typ: 'zielNormFehlt',
          gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
          bezeichnungenAnzeige: [{ bezeichnung, befund: 'fehlt' }],
        },
      ],
    });
    expect(z.vorschauPunkt).toBe(`${bezeichnung} GG: Zielnorm fehlt`);
  },
);
