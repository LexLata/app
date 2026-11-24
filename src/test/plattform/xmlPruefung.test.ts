// Gegenbeispiele sichern, dass der Testvalidator kein kaputtes XML repariert.
import { describe, expect, it } from 'vitest';
import { pruefeXmlWohlgeformtheit } from './xmlPruefung';

describe('strikte XML-Wohlgeformtheit', () => {
  it.each(['<a><b></a>', '<a wert="kaputt></a>', '<a>A & B</a>'])('weist %s zurück', (xml) => {
    expect(() => pruefeXmlWohlgeformtheit(xml)).toThrow();
  });
  it('akzeptiert XML-Entities und xml:space', () => {
    expect(() =>
      pruefeXmlWohlgeformtheit('<a xml:space="preserve">Ä &amp; &apos;</a>'),
    ).not.toThrow();
  });
  it.each(['<normlänge/>', '<norm länge="1"/>'])(
    'weist Nicht-ASCII-Namen in %s zurück, ohne Inhalte zu beschränken',
    (xml) => {
      expect(() => pruefeXmlWohlgeformtheit(xml)).toThrow(/ASCII/);
    },
  );
});
