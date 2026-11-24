// VolltextSucheOverlay.helpers.test.ts
// Prüft Suchindex, Suchtreffer und Kontext einschließlich Zwischenüberschriften.
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { describe, it, expect } from 'vitest';
import {
  baueSuchIndexFuerGesetz,
  tokenisiere,
  normMatchtTokens,
  extrahiereKontext,
} from './VolltextSucheOverlay.helpers';
import type {
  GesetzDarstellung,
  DarstellungsElement,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';

function ueberschrift(bezeichnung: string, titel?: string): DarstellungsElement {
  return {
    typ: 'ueberschrift',
    data: {
      id: bezeichnung,
      xmlId: bezeichnung,
      bezeichnung,
      titel,
      ebene: 1,
      gliederungskennzahl: '000000',
    } as UeberschriftDarstellung,
  };
}

function norm(bezeichnung: string, titel?: string): DarstellungsElement {
  return {
    typ: 'norm',
    data: normaleNorm({
      id: bezeichnung,
      xmlId: bezeichnung,
      bezeichnung,
      titel,
      absaetze: [],
    }) as NormDarstellung,
  };
}

function gesetz(kurztitel: string, elemente: DarstellungsElement[]): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente,
  });
}

describe('tokenisiere', () => {
  it('trimmt, kleinschreibt und splittet auf Leerraum, filtert leere Tokens', () => {
    expect(tokenisiere('  Kündigung  Frist ')).toEqual(['kündigung', 'frist']);
  });

  it('leerer/nur-Leerraum-Query ergibt leeres Array', () => {
    expect(tokenisiere('   ')).toEqual([]);
  });
});

describe('normMatchtTokens', () => {
  it('true, wenn alle Tokens irgendwo vorkommen (case-insensitiv)', () => {
    expect(
      normMatchtTokens('Die KÜNDIGUNG bedarf der Schriftform', ['kündigung', 'schriftform']),
    ).toBe(true);
  });

  it('false, wenn auch nur ein Token fehlt', () => {
    expect(normMatchtTokens('Die Kündigung bedarf der Schriftform', ['kündigung', 'frist'])).toBe(
      false,
    );
  });
});

describe('baueSuchIndexFuerGesetz', () => {
  it('durchsucht den unveränderten Volltext ohne zusätzliche Textkopie', () => {
    const g = gesetz('BGB', [ueberschrift('Erster Teil'), norm('§ 1', 'KÜNDIGUNG')]);
    const eintrag = baueSuchIndexFuerGesetz(g)[0]!;
    expect(eintrag.volltext).toContain('KÜNDIGUNG');
    expect(eintrag).not.toHaveProperty('volltextKlein');
    expect(normMatchtTokens(eintrag.volltext, ['kündigung'])).toBe(true);
  });

  it('hängt eine vorangehende Überschrift an die nächste Norm an', () => {
    const g = gesetz('BGB', [ueberschrift('Erster Teil'), norm('§ 1', 'Beginn')]);
    const index = baueSuchIndexFuerGesetz(g);
    expect(index).toHaveLength(1);
    expect(index[0]!.volltext).toContain('Erster Teil');
    expect(index[0]!.volltext).toContain('Beginn');
  });

  it('setzt die mitgeschleppten Überschriften nach der ersten Norm zurück (nicht an die übernächste Norm anhängen)', () => {
    const g = gesetz('BGB', [ueberschrift('Erster Teil'), norm('§ 1'), norm('§ 2')]);
    const index = baueSuchIndexFuerGesetz(g);
    expect(index[0]!.volltext).toContain('Erster Teil');
    expect(index[1]!.volltext).not.toContain('Erster Teil');
  });

  it('Überschrift ohne Titel: nur die Bezeichnung wird mitgeschleppt', () => {
    const g = gesetz('BGB', [ueberschrift('Erster Teil'), norm('§ 1')]);
    const index = baueSuchIndexFuerGesetz(g);
    expect(index[0]!.volltext).toContain('Erster Teil');
  });
});

describe('extrahiereKontext', () => {
  it('kein Treffer (leere Tokenliste): liefert den Textanfang ohne Hervorhebung', () => {
    const segmente = extrahiereKontext('Ein kurzer Text ohne jeden Treffer.', []);
    expect(segmente).toEqual([
      { text: 'Ein kurzer Text ohne jeden Treffer.', hervorgehoben: false },
    ]);
  });

  it('kein Treffer, Text länger als 2x Fenster: wird abgeschnitten mit Ellipse', () => {
    const langerText = 'a'.repeat(300);
    const segmente = extrahiereKontext(langerText, [], 90);
    expect(segmente).toHaveLength(1);
    expect(segmente[0]!.text.endsWith('…')).toBe(true);
    expect(segmente[0]!.text.length).toBe(180 + 1);
  });

  it('einfacher Treffer: Snippet um den Treffer zentriert, Token hervorgehoben', () => {
    const segmente = extrahiereKontext('Die Kündigung bedarf der Schriftform.', ['kündigung'], 5);
    // Snippet beginnt/endet innerhalb des Textes -> keine Ellipsen
    const hervorgehoben = segmente.filter((s) => s.hervorgehoben).map((s) => s.text);
    expect(hervorgehoben).toEqual(['Kündigung']);
  });

  it('Snippet wird vorne/hinten abgeschnitten: Ellipsen an beiden Enden', () => {
    const text = 'x'.repeat(200) + 'treffer' + 'y'.repeat(200);
    const segmente = extrahiereKontext(text, ['treffer'], 10);
    expect(segmente[0]!.text).toBe('…');
    expect(segmente[segmente.length - 1]!.text).toBe('…');
  });

  it('überlappende Token-Vorkommen werden zu EINEM Hervorhebungs-Segment zusammengeführt', () => {
    // "kündigung" und "digungsfrist" überlappen sich im Wort "Kündigungsfrist"
    const segmente = extrahiereKontext('Die Kündigungsfrist beträgt drei Monate.', [
      'kündigung',
      'digungsfrist',
    ]);
    const hervorgehoben = segmente.filter((s) => s.hervorgehoben);
    expect(hervorgehoben).toHaveLength(1);
    expect(hervorgehoben[0]!.text).toBe('Kündigungsfrist');
  });

  it('zwei getrennte Token-Vorkommen ergeben ZWEI Hervorhebungs-Segmente', () => {
    const segmente = extrahiereKontext('Kündigung und Frist stehen im Vertrag.', [
      'kündigung',
      'frist',
    ]);
    const hervorgehoben = segmente.filter((s) => s.hervorgehoben).map((s) => s.text);
    expect(hervorgehoben).toEqual(['Kündigung', 'Frist']);
  });
});

it('findet Zwischenüberschriften, ohne den Vorgänger-Hinweis zu durchsuchen', () => {
  const gesetz = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel></infos><inhalt><norm id="1" vorgaenger="ex-Artikel 6 EGV"><bezeichnung>Art. 1</bezeichnung><text><absatz typ="zwischenueberschrift">Erste Lesung</absatz><absatz zahl="(1)">Inhalt.</absatz></text></norm></inhalt></gesetz>',
  )!;
  const volltext = baueSuchIndexFuerGesetz(gesetz)[0]!.volltext;
  expect(volltext).toContain('Erste Lesung');
  expect(volltext).not.toContain('ex-Artikel');
});

it('findet einen nur im Zusatztext vorkommenden Begriff in der zugehörigen Norm', () => {
  const g = parseGesetzesXML(
    '<gesetz><infos><kurztitel>G</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="n"><bezeichnung>§ 1</bezeichnung><text><absatz>A</absatz><tabelle>Tabellenwort</tabelle><absatz>B</absatz></text></norm></inhalt></gesetz>',
  );
  if (!g) throw Error('Gesetz fehlt');
  const index = baueSuchIndexFuerGesetz(g);
  expect(
    index
      .filter((e) => normMatchtTokens(e.volltext, tokenisiere('Tabellenwort')))
      .map((e) => e.norm.xmlId),
  ).toEqual(['n']);
});

it('findet Überschrifttext samt Zusatztext nur über die nächste Norm', () => {
  const gesetz = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel></infos><inhalt><gliederung gliederungskennzahl="010"><text><absatz>Regelung</absatz><tabelle>Zusatz</tabelle><absatz><unterabsatz zahl="1">Unterabsatzwort</unterabsatz></absatz></text></gliederung><norm id="1"><bezeichnung>§ 1</bezeichnung></norm><norm id="2"><bezeichnung>§ 2</bezeichnung></norm><gliederung gliederungskennzahl="020"><text>Nichtauffindbar</text></gliederung></inhalt></gesetz>',
  );
  if (!gesetz) throw new Error('Gesetz erwartet');
  const index = baueSuchIndexFuerGesetz(gesetz);
  expect(index).toHaveLength(2);
  expect(index[0]?.volltext).toContain('Regelung Unterabsatzwort Zusatz');
  expect(index[1]?.volltext).not.toContain('Regelung');
  expect(index.some((e) => e.volltext.includes('Nichtauffindbar'))).toBe(false);
});
