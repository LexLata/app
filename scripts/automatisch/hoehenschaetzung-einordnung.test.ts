// hoehenschaetzung-einordnung.test.ts
// Pflichtprüfung: Jedes Element und Attribut des Gesetzes-XML-Formats ist für die
// Höhenschätzung der Gesetzestextansicht bewusst eingeordnet.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pruefeHoehenschaetzungEinordnung } from './hoehenschaetzung-einordnung';

const schema = `<grammar xmlns="http://relaxng.org/ns/structure/1.0">
  <start><element name="gesetz"><attribute name="version"/><ref name="satz"/>
    <zeroOrMore><element><anyName/><attribute><anyName/></attribute></element></zeroOrMore>
  </element></start>
  <define name="satz"><element name="satz">
    <optional><attribute name="zahl"/></optional>
    <element name="zeilenumbruch"><empty/></element>
  </element></define>
</grammar>`;

const geschaetzt = { einordnung: 'wird geschätzt', wo: 'virtualizer.ts' } as const;
const vollstaendig = {
  gesetz: { einordnung: 'ohne Höhenwirkung', begruendung: 'Wurzel' },
  'gesetz@version': { einordnung: 'ohne Höhenwirkung', begruendung: 'Schemaversion' },
  satz: geschaetzt,
  'satz@zahl': geschaetzt,
  zeilenumbruch: geschaetzt,
} as const;

describe('Einordnung XML-Elemente ↔ Höhenschätzung', () => {
  it('meldet keine Befunde, wenn jedes benannte Element und Attribut eingeordnet ist', () => {
    expect(pruefeHoehenschaetzungEinordnung(schema, vollstaendig)).toEqual([]);
  });

  it('meldet ein im Schema neues, nicht eingeordnetes Element mit Handlungshinweis', () => {
    const { zeilenumbruch: _entfernt, ...ohne } = vollstaendig;
    const befunde = pruefeHoehenschaetzungEinordnung(schema, ohne);
    expect(befunde).toHaveLength(1);
    expect(befunde[0]).toContain('„zeilenumbruch“');
    expect(befunde[0]).toContain('nicht eingeordnet');
  });

  it('meldet ein nicht eingeordnetes Attribut mit seinem Element', () => {
    const { 'satz@zahl': _entfernt, ...ohne } = vollstaendig;
    expect(pruefeHoehenschaetzungEinordnung(schema, ohne)).toEqual([
      expect.stringContaining('„satz@zahl“'),
    ]);
  });

  it('meldet einen Eintrag, den es im Schema nicht mehr gibt', () => {
    const befunde = pruefeHoehenschaetzungEinordnung(schema, {
      ...vollstaendig,
      fussnoten: { einordnung: 'ohne Höhenwirkung', begruendung: 'nicht angezeigt' },
    });
    expect(befunde).toEqual([expect.stringContaining('„fussnoten“')]);
    expect(befunde[0]).toContain('nicht mehr im Schema');
  });

  it('meldet Einträge ohne Verweis oder Begründung', () => {
    const befunde = pruefeHoehenschaetzungEinordnung(schema, {
      ...vollstaendig,
      satz: { einordnung: 'wird geschätzt', wo: ' ' },
      gesetz: { einordnung: 'ohne Höhenwirkung', begruendung: '' },
    });
    expect(befunde).toHaveLength(2);
  });

  it('das Gesetzes-XML-Format ist vollständig eingeordnet', () => {
    const lies = (pfad: string) => readFileSync(new URL(pfad, import.meta.url), 'utf8');
    const befunde = pruefeHoehenschaetzungEinordnung(
      lies('../../docs/schema/gesetz.rng'),
      JSON.parse(
        lies(
          '../../src/components/gesetzestextansicht/ansichtssteuerung/scrollen/hoehenschaetzungEinordnung.json',
        ),
      ).eintraege,
    );
    expect(befunde, befunde.join('\n')).toEqual([]);
  });
});
