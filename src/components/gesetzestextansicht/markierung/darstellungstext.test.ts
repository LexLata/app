import {
  textauszeichnung,
  getaggterVerweis,
  type AuszeichnungsAngaben,
} from '@/test/gesetz/textauszeichnungFabrik';
// darstellungstext.test.ts
// Schutz des vollständigen Texts und geprüfte UTF-16-Teilung ohne Änderung der Fachdaten.
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { describe, expect, expectTypeOf, it } from 'vitest';
import fc from 'fast-check';
import type { VerweisInhalt } from '@/lib/markierungen/markierungen.index';
import type { TextSegment } from '@/lib/darstellung/darstellung.index';
import {
  geschuetzterBlatttext,
  geschuetzterZitattext,
  teileDarstellungstext,
  segmentiereDarstellungstext as segmentiereAuszeichnungen,
  teileDarstellungssegment,
  type GeschuetzterDarstellungstext,
  type GeschuetztesDarstellungssegment,
} from './darstellungstext';

const ziel: VerweisInhalt = {
  verweistext: 'Art. 1 GG',
  verweisziele: [
    verweisziel({
      typ: 'zielnormOhneElementstand',
      bezeichnung: 'Art. 1',
      verweistextZeichenbereich: [0, 9],
    }),
  ],
};

describe('Geschützter Darstellungsvertrag', () => {
  it('schützt die vollständige Quelle mit den jeweils passenden Regeln', () => {
    const original = '😀 § 5 I 2 Abs.  1\tText\nEnde';
    const blatt = geschuetzterBlatttext(original);
    const zitat = geschuetzterZitattext(original);
    expect(blatt.text).toBe('😀 §\u00a05 I 2 Abs.\u00a0\u00a01\tText\nEnde');
    expect(zitat.text).toBe('😀 §\u00a05 I\u00a02 Abs.\u00a0\u00a01\tText\nEnde');
    expect(blatt.text.length).toBe(original.length);
    expect(zitat.text.length).toBe(original.length);
    expect(original).toBe('😀 § 5 I 2 Abs.  1\tText\nEnde');
    expect(Object.isFrozen(blatt)).toBe(true);
    expect(Reflect.set(blatt, 'text', original)).toBe(false);
    expect(blatt.text).toContain('§\u00a05');
  });

  it('erhält die Kennzeichnung auch bei Teilung innerhalb einer Schutzgruppe', () => {
    const voll = geschuetzterBlatttext('😀 § 5');
    expect(teileDarstellungstext(voll, 4, 6).text).toBe('\u00a05');
    expect(teileDarstellungstext(voll, 0, 2).text).toBe('😀');
    expect(teileDarstellungstext(voll, 2, 2).text).toBe('');
    expectTypeOf(teileDarstellungstext(voll, 0, 1)).toEqualTypeOf<GeschuetzterDarstellungstext>();
    expectTypeOf<string>().not.toMatchTypeOf<GeschuetzterDarstellungstext>();
    expectTypeOf<{ text: string }>().not.toMatchTypeOf<GeschuetzterDarstellungstext>();
    const ausgetauscht = { ...voll, text: '§ 5' };
    expectTypeOf(ausgetauscht).not.toMatchTypeOf<GeschuetzterDarstellungstext>();
    expect(ausgetauscht.text).toBe('§ 5');
    expect(voll.text).toBe('😀 §\u00a05');
    expectTypeOf(teileDarstellungstext).parameter(0).toEqualTypeOf<GeschuetzterDarstellungstext>();
    expectTypeOf<TextSegment>().not.toMatchTypeOf<GeschuetztesDarstellungssegment>();
    expectTypeOf(segmentiereDarstellungstext)
      .parameter(0)
      .toEqualTypeOf<GeschuetzterDarstellungstext>();
    expectTypeOf(teileDarstellungssegment)
      .parameter(0)
      .toEqualTypeOf<GeschuetztesDarstellungssegment>();
  });

  it.each([
    [-1, 2],
    [0, 7],
    [3, 2],
    [0.5, 2],
    [0, NaN],
    [0, Infinity],
  ])('verwirft ungültige Bereiche %s bis %s statt still zu korrigieren', (von, bis) => {
    expect(() => teileDarstellungstext(geschuetzterBlatttext('😀 § 5'), von, bis)).toThrow(
      RangeError,
    );
  });

  it('bildet die UTF-16-Teilung für beliebige Texte unverändert ab', () => {
    fc.assert(
      fc.property(fc.string(), fc.nat(), fc.nat(), (original, a, b) => {
        const voll = geschuetzterBlatttext(original);
        const von = Math.min(a, b) % (original.length + 1);
        const bis = Math.max(von, Math.max(a, b) % (original.length + 1));
        const teil = teileDarstellungstext(voll, von, bis);
        expect(teil.text).toBe(voll.text.slice(von, bis));
        expect(teil.text.length).toBe(bis - von);
      }),
    );
  });

  it('segmentiert nach vollständigem Schutz und behält originale Verweisobjekte', () => {
    const original = '😀 § 5 Ende';
    const bereiche = [
      {
        zeichenbereichStart: 3,
        zeichenbereichEnde: 4,
        typ: 'verweismarkierung' as const,
        verweisinhalt: ziel,
      },
    ];
    const segmente = segmentiereDarstellungstext(geschuetzterBlatttext(original), bereiche);
    expect(segmente.map((s) => s.text.text)).toEqual(['😀 ', '§', '\u00a05 Ende']);
    expect(segmente[1]?.verweisinhalt).toBe(ziel);
    expect(bereiche[0]?.zeichenbereichEnde).toBe(4);
    expect(ziel.verweistext).toBe('Art. 1 GG');
    expectTypeOf(segmente[0]!.text).toEqualTypeOf<GeschuetzterDarstellungstext>();
  });

  it('erhält getaggte Klickziele unter einer ungeteilten Hervorhebung und beim Clipping', () => {
    const getaggt = getaggterVerweis({
      zielBezeichnung: 'Art. 1',
      textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 3, zeichenbereichEnde: 6 },
    });
    const segmente = segmentiereDarstellungstext(geschuetzterBlatttext('😀 § 5 Ende'), [
      { zeichenbereichStart: 0, zeichenbereichEnde: 11, typ: 'hervorhebung' },
      {
        zeichenbereichStart: 3,
        zeichenbereichEnde: 6,
        typ: 'getaggterVerweis',
        verweis: getaggt,
      },
    ]);
    const segment = segmente[0]!;
    expect(segment.getaggteVerweisTeile?.map((t) => t.text.text)).toEqual([
      '😀 ',
      '§\u00a05',
      ' Ende',
    ]);
    const teil = teileDarstellungssegment(segment, 4, 8);
    expect(teil.text.text).toBe('\u00a05 E');
    expect(teil.getaggteVerweisTeile?.map((t) => t.text.text)).toEqual(['\u00a05', ' E']);
    expect(teil.getaggteVerweisTeile?.[0]?.verweis).toBe(getaggt);
    expect(teil.typ).toBe('hervorhebung');
    expect(segment.text.text).toBe('😀 §\u00a05 Ende');
    expect(() => teileDarstellungssegment(segment, -1, 3)).toThrow(RangeError);
  });
});

function segmentiereDarstellungstext(
  text: Parameters<typeof segmentiereAuszeichnungen>[0],
  bereiche: (AuszeichnungsAngaben & { markierungIndex?: number })[],
) {
  return segmentiereAuszeichnungen(
    text,
    bereiche.map(textauszeichnung),
    bereiche.some((b) => b.markierungIndex !== undefined),
  );
}
