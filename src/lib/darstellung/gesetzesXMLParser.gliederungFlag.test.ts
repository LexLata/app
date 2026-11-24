// gesetzesXMLParser.gliederungFlag.test.ts
// Zusätzliche Metadaten dürfen keine Gliederungsartikel vortäuschen.
import { describe, expect, it, vi } from 'vitest';
import { parseGesetzesXML } from './gesetzesXMLParser';

describe('Gliederungsartikel aus dargestellten Normen', () => {
  it('ignoriert Normattrappen in unbekannten Rumpfmetadaten', () => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const gesetz = parseGesetzesXML(
        '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>X</kurztitel></infos><inhalt><neu><norm gliederungskennzahl="001"><bezeichnung>Art. 1</bezeichnung></norm></neu><norm id="1"><bezeichnung>§ 1</bezeichnung><text>Rechtstext.</text></norm></inhalt></gesetz>',
      )!;
      expect(gesetz.elemente).toHaveLength(1);
      expect(gesetz.hatGliederungsartikel).toBe(false);
      expect(warnung).toHaveBeenCalled();
    } finally {
      warnung.mockRestore();
    }
  });
});
