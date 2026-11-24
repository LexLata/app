import { normaleNorm, gliederungsartikel, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungskonflikteAktionen.verknuepfung.test.ts
// Gemeinsamer fachlicher Maßstab für Anzeige und frische Verknüpfungsaktionen.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { verweisziel, zielnormTestdaten } from '@/test/markierungen/verweiszielFabrik';
import { expect, it } from 'vitest';
import fc from 'fast-check';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  berechneZielKonflikte,
  identitaetsSchluessel,
  klassifiziereZielnorm,
  pruefeEigenenKonflikt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  aktuellerElementstand,
  berechneAktuelleVerknuepfungen,
  berechneElementstand,
  berechneZielelementstaende,
} from './markierungskonflikteAktionen';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const ref = { kurztitel: 'Test', normgeber: 'de-bund' };
const fremd = { ...ref, normgeber: 'de-bw' };
const g: GesetzDarstellung = gesetzMitNormen(['§ 1', '§ 2', '§ 90'], {
  ...ref,
  langtitel: 'Test',
  hatGliederungsartikel: false,
  kennung: ['1', '2', '90'],
  norm: { titel: 'Aktuell' },
});
const stand = { titel: 'Aktuell', textlaenge: 0 };
const ziel = (
  n: string,
  extra: Partial<Extract<Verweisziel, { typ: 'zielnorm' }>> = {},
): Verweisziel =>
  zielnormTestdaten({
    bezeichnung: `§ ${n}`,
    elementstand: { textlaenge: 9 },
    verweistextZeichenbereich: [0, 1],
    ...extra,
  });
const e: MarkierungsEintrag = markierungsEintrag({
  typ: 'verweismarkierung',
  ausgangsstelle: normAusgangsstelle('§ 1'),

  bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 9 } },
  verweisinhalt: {
    verweistext: 'Ziele',
    verweisziele: [
      ziel('1'),
      ziel('9'),
      ziel('2', { elementstand: stand }),
      ziel('90', { elementstand: undefined }),
      ziel('1', { gesetz: fremd }),
    ],
  },
});
it.each(['kommentar', 'verweismarkierung'] as const)(
  'ändert bei %s ausschließlich den bestehenden Ausgangsstand',
  (typ) => {
    const alt = markierungsEintrag({ ...e, typ, kommentarText: 'Kommentar' });
    const neu = berechneElementstand(alt, g);
    expect(neu).toEqual({ ...alt, bezug: { typ: 'pauschal' as const, elementstand: stand } });
    expect(neu.verweisinhalt).toBe(alt.verweisinhalt);
    expect(berechneElementstand(neu, g)).toBe(neu);
  },
);
it.each([
  { ausgangsstelle: normAusgangsstelle('§ 9') },
  { ausgangsstelle: normAusgangsstelle('Art. 1') },
  { ausgangsstelle: normAusgangsstelle('1') },
  {
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ absatz: '1' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 1,
      },
      bezugstext: 'Alt',
    },
  },
])('überspringt nicht aktualisierbare Ausgangsstellen: %j', (extra) => {
  const alt = markierungsEintrag({ ...e, ...extra });
  expect(berechneElementstand(alt, g)).toBe(alt);
});
it('zeigt in gemischten Gruppen nur fehlende und vorhandene abweichende Ziele; trennt Normgeber', () => {
  const umfang = new Map([[identitaetsSchluessel(e), { ausgang: true, zielgesetze: [ref] }]]);
  const {
    eintraege: [neu],
    zahlen,
  } = berechneAktuelleVerknuepfungen(
    ref,
    [e],
    umfang,
    new Map([[gesetzesreferenzSchluessel(ref), g]]),
  );
  expect(zahlen).toEqual({ elementstaende: 1, verweisziele: 1, markierungen: 1 });
  expect(neu!.verweisinhalt!.verweisziele.slice(1)).toEqual(e.verweisinhalt.verweisziele.slice(1));
  expect(pruefeEigenenKonflikt(neu!, g)).toBeUndefined();
  expect(berechneZielKonflikte(neu!, g, [g])).toMatchObject([
    { gesetz: ref, typ: 'zielNormFehlt' },
    { gesetz: fremd, typ: 'zielGesetzFehlt' },
  ]);
});
it('aktualisiert vorhandene Ziele trotz Ausgangstextkonflikt und bewahrt den Bezugstext', () => {
  const alt = markierungsEintrag({
    ...e,
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({ absatz: '1' }),
        zeichenbereichStart: 0,
        zeichenbereichEnde: 1,
      },
      bezugstext: 'Alt',
    },
  });
  const umfang = new Map([[identitaetsSchluessel(alt), { ausgang: true, zielgesetze: [ref] }]]);
  const {
    eintraege: [neu],
    zahlen,
  } = berechneAktuelleVerknuepfungen(
    ref,
    [alt],
    umfang,
    new Map([[gesetzesreferenzSchluessel(ref), g]]),
  );
  expect(zahlen).toEqual({ elementstaende: 0, verweisziele: 1, markierungen: 1 });
  expect(neu!.bezug.bezugstext).toBe('Alt');
  expect(neu!.bezug.elementstand).toBe(alt.bezug.elementstand);
  expect(pruefeEigenenKonflikt(neu!, g)).toBe('bezugstextFehltOderUnpassend');
});
it('für beliebige Zielmischungen stimmen Anzeige und Änderungszahlen überein; erneute Ausführung ändert nichts', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('geaendert', 'fehlend', 'passend', 'unverknuepft', 'ganzesGesetz'), {
        maxLength: 20,
      }),
      (arten) => {
        const ziele = arten.map((art): Verweisziel =>
          art === 'ganzesGesetz'
            ? verweisziel({ typ: 'ganzesGesetz', gesetz: ref, verweistextZeichenbereich: [0, 1] })
            : zielnormTestdaten({
                bezeichnung: '§ ' + (art === 'fehlend' ? '9' : '1'),

                elementstand:
                  art === 'passend'
                    ? stand
                    : art === 'unverknuepft'
                      ? undefined
                      : { textlaenge: 9 },
              }),
        );
        const alt = markierungsEintrag({
          ...e,
          bezug: { typ: 'pauschal' as const, elementstand: stand },
          verweisinhalt: { verweistext: 'Ziele', verweisziele: ziele },
        });
        const umfang = new Map([
          [identitaetsSchluessel(alt), { ausgang: true, zielgesetze: [ref] }],
        ]);
        const quellen = new Map([[gesetzesreferenzSchluessel(ref), g]]);
        const geaenderte = ziele.filter((z) => klassifiziereZielnorm(z, g) === 'unpassend');
        const neu = berechneAktuelleVerknuepfungen(ref, [alt], umfang, quellen);
        expect(neu.zahlen.verweisziele).toBe(geaenderte.length);
        expect(neu.zahlen.markierungen > 0).toBe(geaenderte.length > 0);
        expect(
          berechneAktuelleVerknuepfungen(ref, neu.eintraege, umfang, quellen).zahlen.markierungen,
        ).toBe(0);
        ziele.forEach((z, i) => {
          if (!geaenderte.includes(z))
            expect(neu.eintraege[0]!.verweisinhalt!.verweisziele[i]).toBe(z);
        });
      },
    ),
  );
});

it.each(['passt', 'unpassend', 'nichtEindeutig', 'fehlt'] as const)(
  'nutzt denselben Befund %s für den aktuellen Elementstand',
  (befund) => {
    const quelle =
      befund === 'nichtEindeutig' ? { ...g, elemente: [...g.elemente, g.elemente[0]!] } : g;
    const z = ziel(befund === 'fehlt' ? '999' : '1', {
      elementstand: befund === 'passt' ? stand : { textlaenge: 9 },
    });
    expect(klassifiziereZielnorm(z, quelle)).toBe(befund);
    expect(aktuellerElementstand(z, quelle)).toEqual(
      befund === 'unpassend' ? { elementstand: stand, bezeichnung: '§ 1' } : 'unveraendert',
    );
  },
);

it.each(['eindeutig', 'umbenannt', 'mehrdeutig', 'doppelte XML-ID'])(
  'aktualisiert Präambelstand nur bei eindeutiger gemeinsamer Auflösung: %s',
  (fall) => {
    const alt = markierungsEintrag({
      typ: 'kommentar',
      ausgangsstelle: { typ: 'norm', bezeichnung: 'Präambel' },
      bezug: { typ: 'pauschal', elementstand: { textlaenge: 999 } },
    });
    const normen = [
      normaleNorm({ xmlId: 'p', bezeichnung: fall === 'umbenannt' ? 'Präambel neu' : 'Präambel' }),
    ];
    if (fall === 'mehrdeutig' || fall === 'doppelte XML-ID')
      normen.push(
        normaleNorm({
          xmlId: fall === 'doppelte XML-ID' ? 'p' : 'q',
          bezeichnung: fall === 'mehrdeutig' ? 'Präambel' : '§ 1',
        }),
      );
    const gesetz = { ...g, elemente: normen.map((data) => ({ typ: 'norm' as const, data })) };
    const neu = berechneElementstand(alt, gesetz);
    if (fall === 'eindeutig') {
      expect(neu).not.toBe(alt);
      expect(pruefeEigenenKonflikt(neu, gesetz)).toBeUndefined();
    } else expect(neu).toBe(alt);
  },
);

it.each([false, true])(
  'übernimmt volle Zielbezeichnungen beim Aktualisieren (Gliederungsartikel=%s)',
  (verschachtelt) => {
    const gesetz: GesetzDarstellung = {
      ...g,
      hatGliederungsartikel: verschachtelt,
      elemente: [
        ...(verschachtelt
          ? [
              {
                typ: 'norm' as const,
                data: gliederungsartikel({
                  id: 'a229',
                  xmlId: 'a229',
                  bezeichnung: 'Art. 229',
                  gliederungsEbene: 0,
                }),
              },
            ]
          : []),
        {
          typ: 'norm',
          data: normaleNorm({
            id: 'ziel',
            xmlId: 'ziel',
            bezeichnung: verschachtelt ? '§ 3' : '§ 433',
            titel: 'Aktuell',
            absaetze: [],
          }),
        },
      ],
    };
    const bezeichnung = verschachtelt ? 'Art. 229 § 3' : '§ 433';
    const gespeichert = verschachtelt ? 'Artikel229§3' : '§433';
    const alt = markierungsEintrag({
      ...e,
      verweisinhalt: {
        verweistext: bezeichnung,
        verweisziele: [
          zielnormTestdaten({
            bezeichnung: gespeichert,
            elementstand: { titel: 'Alt', textlaenge: 9 },
          }),
        ],
      },
    });
    const einzel = berechneZielelementstaende(ref, alt, ref, (ziel) =>
      aktuellerElementstand(ziel, gesetz),
    );
    const umfang = new Map([[identitaetsSchluessel(alt), { ausgang: false, zielgesetze: [ref] }]]);
    const sammel = berechneAktuelleVerknuepfungen(
      ref,
      [alt],
      umfang,
      new Map([[gesetzesreferenzSchluessel(ref), gesetz]]),
    );
    for (const neu of [einzel, sammel.eintraege[0]]) {
      expect(neu?.verweisinhalt?.verweisziele).toEqual([
        {
          typ: 'zielnorm',
          bezeichnung,
          verweistextZeichenbereich: [0, 1],
          elementstand: { titel: 'Aktuell', textlaenge: 0 },
        },
      ]);
    }
    expect(sammel.zahlen.verweisziele).toBe(1);
  },
);
