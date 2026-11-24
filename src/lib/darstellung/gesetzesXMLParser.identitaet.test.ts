// gesetzesXMLParser.identitaet.test.ts
// Die XML-Wurzel enthält keine verbindliche Dateiidentität.
import { describe, expect, it } from 'vitest';
import { parseGesetzesXML } from './gesetzesXMLParser';

describe('Gesetzesidentität der XML-Wurzel', () => {
  it('ignoriert ein unbekanntes id-Attribut und trägt keine eigene Kennung', () => {
    const xml =
      '<gesetz version="1" id="FremdesGesetz"><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt/></gesetz>';
    const erstes = parseGesetzesXML(xml)!;
    const zweites = parseGesetzesXML(xml)!;
    expect(erstes.kurztitel).toBe('BGB');
    expect(erstes).not.toHaveProperty('id');
    expect(zweites).toEqual(erstes);
  });
});
