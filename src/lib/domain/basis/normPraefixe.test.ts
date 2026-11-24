// Prüft die gemeinsame Schreibweisenquelle ohne Erweiterung einzelner Verbraucher.
import { describe, expect, it } from 'vitest';
import { familieVonText, kanonischesPraefix, normPraefixQuelle } from './normPraefixe';

describe('Normpräfixe', () => {
  it.each([
    [
      'canon',
      ['can.', 'canon', 'c.', 'Kan.', 'Kanon', 'cann.', 'canons', 'canones', 'cc.', 'Kanones'],
      'Can.',
    ],
    ['paragraph', ['§', '§§'], '§'],
    ['artikel', ['Art.', 'Art', 'Artikel', 'Artt', 'Artikels', 'Artikeln'], 'Art.'],
  ] as const)('ordnet alle Schreibweisen der Familie %s zu', (familie, texte, kanonisch) => {
    for (const text of texte) {
      expect(familieVonText(`  ${text.toUpperCase()}\t`)).toBe(familie);
      expect(kanonischesPraefix(familie)).toBe(kanonisch);
    }
  });
  it.each(['can', 'c', 'cc', '', 'Anlage', 'can. 8', 'Art .'])('weist %j zurück', (text) => {
    expect(familieVonText(text)).toBeUndefined();
  });
  it('erhält die Erkennungsgrenzen der Verbraucher', () => {
    const aufloesung = new RegExp(`^${normPraefixQuelle('aufloesung')}$`, 'i');
    expect(aufloesung.test('Can.')).toBe(true);
    const plural = new RegExp(`^${normPraefixQuelle('zitat', 'canon', true)}$`, 'i');
    expect(plural.test('cann.')).toBe(true);
    expect(plural.test('canon')).toBe(false);
    expect(aufloesung.test('§§')).toBe(false);
    expect(aufloesung.test('Artikeln')).toBe(false);
    const tagger = new RegExp(`^${normPraefixQuelle('tagger', 'artikel')}$`, 'i');
    expect(tagger.test('Artikeln')).toBe(true);
    expect(tagger.test('Art.')).toBe(false);
    expect(tagger.test('Art')).toBe(false);
    expect(new RegExp(`^${normPraefixQuelle('abstand')}$`, 'i').test('§§')).toBe(true);
  });
});
