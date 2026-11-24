// Prüft den Zeitstempelvertrag am öffentlichen MarkierungsXML-Format.
import { describe, expect, it } from 'vitest';
import { baueXML, parseEintraege } from './markierungs-xml.index';
import { eintraegeSindGleich } from './markierungs-xml.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
const alt = '2026-11-05T10:00:00Z';
const neu = '2026-11-05T11:00:00Z';
const kommentar = {
  typ: 'kommentar',
  ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
  bezug: { typ: 'pauschal', elementstand: { textlaenge: 10 } },
  kommentarText: 'Text',
} satisfies MarkierungsEintrag;
describe('Zeitstempel im MarkierungsXML', () => {
  it('schreibt beide Zeitfelder als letzte Kinder und liest sie unverändert', () => {
    const eintrag = { ...kommentar, erstellt: alt, geaendert: neu };
    const xml = baueXML(gesetz, [eintrag]);
    expect(xml).toContain(
      `<erstellt>${alt}</erstellt>\n            <geaendert>${neu}</geaendert>\n        </kommentar>`,
    );
    expect(parseEintraege(xml).eintraege).toEqual([eintrag]);
  });
  it('ergänzt fehlende Zeiten nicht und verwirft ungültige Zeiten ohne Inhaltsverlust', () => {
    const xml = baueXML(gesetz, [kommentar]);
    expect(parseEintraege(xml).eintraege).toEqual([kommentar]);
    for (const zeit of [
      'kaputt',
      '2026-02-30T10:00:00Z',
      '2026-11-05T10:00:00.000Z',
      '2026-11-05T10:00:00+01:00',
    ]) {
      expect(
        parseEintraege(
          xml.replace(
            '</kommentar>',
            `<erstellt>${zeit}</erstellt><geaendert>${zeit}</geaendert></kommentar>`,
          ),
        ),
      ).toEqual({ eintraege: [kommentar], befunde: [] });
    }
  });
  it('vergleicht Inhalte unabhängig von beiden Zeitfeldern', () => {
    expect(
      eintraegeSindGleich(
        gesetz,
        [{ ...kommentar, erstellt: alt, geaendert: neu }],
        [{ ...kommentar, erstellt: neu }],
      ),
    ).toBe(true);
  });
});
