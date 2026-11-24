// markierungsAnzeige.test.ts
// Vollständige Referenz vom GesetzesXML bis zum anklickbaren Markierungsziel.
import { describe, expect, it } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import { getaggteVerweiseAlsTextauszeichnungen } from './getaggteVerweise';

describe('getaggteVerweiseAlsTextauszeichnungen', () => {
  it.each(['de-bund', 'de-bw', 'unbekannt'])(
    'erhält das ausgewählte Ziel mit Normgeber %s',
    (normgeber) => {
      const attribut = normgeber === undefined ? '' : ` normgeber="${normgeber}"`;
      const gesetz = parseGesetzesXML(
        `<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>Ausgang</kurztitel></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><text>Siehe <verweis gesetz="X"${attribut} norm="§ 2">§ 2</verweis>.</text></norm></inhalt></gesetz>`,
      )!;
      const norm = gesetz.elemente[0]!.data as NormDarstellung;
      const auszeichnung = getaggteVerweiseAlsTextauszeichnungen(norm)[0]!;
      expect(auszeichnung.typ).toBe('getaggterVerweis');
      if (auszeichnung.typ !== 'getaggterVerweis') throw new Error('Quellenverweis erwartet');
      const verweis = auszeichnung.verweis;
      expect(verweis.zielgesetz).toEqual({
        kurztitel: 'X',
        normgeber,
      });
      expect(verweis.zielBezeichnung).toBe('§ 2');
      expect(verweis.bezugstext).toBe('§ 2');
      expect(verweis.textstelle?.zeichenbereichStart).toBe(6);
      expect(verweis.textstelle?.zeichenbereichEnde).toBe(9);
    },
  );
});
