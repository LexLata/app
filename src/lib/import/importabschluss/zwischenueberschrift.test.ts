// zwischenueberschrift.test.ts
// Prüft Zwischenüberschriften und Vorgänger-Hinweise durch die XML-Pipeline.
import { describe, expect, it } from 'vitest';
import {
  taggeVerweise,
  baueText,
  baueGesetzesXML,
  type ImpAbsatz,
} from '@/lib/import/basis/basis.index';
import { pruefeZusatzangabe } from '@/lib/domain/norm/norm.index';
import { tokenisiereGesetzesXML } from './gesetzesXMLNachbereiten';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';

const text = (nummer?: string): ImpAbsatz => ({
  nummer,
  elemente: [{ type: 'texte', saetze: ['Inhalt.'] }],
});
const titel = (): ImpAbsatz => ({
  zwischenueberschrift: true,
  elemente: [{ type: 'texte', saetze: ['Erste Lesung. Zweite Lesung.'] }],
});

describe('Zwischenüberschrift und Vorgänger-Hinweis', () => {
  it.each([
    [titel()],
    [titel(), text('(1)')],
    [text('(1)'), text('(2)'), titel(), text('(3)')],
    [text('(1)'), titel()],
    [titel(), titel()],
    [titel(), text()],
  ])('erhält getrennte Überschriften an jeder Position: %j', (...absaetze) => {
    const xml = new DOMParser().parseFromString(baueText(absaetze, '').join('\n'), 'text/xml');
    expect(xml.querySelectorAll('absatz')).toHaveLength(absaetze.length);
    expect(xml.querySelectorAll('[typ="zwischenueberschrift"]')).toHaveLength(
      absaetze.filter((a) => a.zwischenueberschrift).length,
    );
    for (const el of xml.querySelectorAll('[typ="zwischenueberschrift"]')) {
      expect(el.textContent).toBe('Erste Lesung. Zweite Lesung.');
      expect(el.hasAttribute('zahl')).toBe(false);
      expect(el.children).toHaveLength(0);
    }
  });

  it.each([undefined, 'ex-Artikel 6 EGV & "Alt"'])(
    'erhält Vorgänger %s und Überschrift beim Nachbereiten und Parsen',
    (vorgaenger) => {
      const xml = baueGesetzesXML({ kurztitel: 'G', langtitel: 'Gesetz', normgeber: 'eu' }, [
        {
          type: 'paragraph',
          bez: '',
          normBezeichnung: 'Art. 1',
          ebene: 1,
          gliederungskennzahl: '',
          vorgaenger,
          absaetze: [text('(1)'), titel(), text('(2)')],
        },
      ]);
      const nachher = taggeVerweise(
        tokenisiereGesetzesXML(xml),
        { kurztitel: 'G', normgeber: 'eu' },
        [],
      );
      const doc = new DOMParser().parseFromString(nachher, 'text/xml');
      expect(doc.querySelector('norm')?.getAttribute('vorgaenger') ?? undefined).toBe(vorgaenger);
      expect(doc.querySelector('[typ="zwischenueberschrift"] satz')).toBeNull();
      const norm = parseGesetzesXML(nachher)!.elemente[0]!;
      if (norm.typ !== 'norm') throw new Error('Norm erwartet');
      expect(norm.data.vorgaenger).toBe(vorgaenger);
      expect(pruefeZusatzangabe(norm.data, 'absatz', '2')).toBe(true);
      expect(norm.data.absaetze[1]).toMatchObject({ zwischenueberschrift: true });
      expect(norm.data.absaetze[1]!.bezeichnung).toBeUndefined();
      expect(norm.data.absaetze[1]!.saetze).toHaveLength(1);
    },
  );
});
