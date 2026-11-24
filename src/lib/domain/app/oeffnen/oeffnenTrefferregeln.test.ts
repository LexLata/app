import {
  alsSuchverzeichniseintrag,
  alsSuchverzeichniseintraege,
  suchtrefferKopfangaben,
} from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenTrefferregeln.test.ts
// Vereinbarte Trefferregeln über die öffentlichen Suchschnittstellen.
import { expect, it } from 'vitest';
import { gesetzMitNormen, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import {
  berechneTreffer,
  indexNormAnzeige,
  loeseNormzielAuf,
  parseSuchanfrage,
} from './oeffnen.index';

function gesetz(bezeichnungen: string[], kurztitel = 'TestG'): GesetzDarstellung {
  return gesetzMitNormen(bezeichnungen, { kurztitel, langtitel: kurztitel });
}
function ziel(eingabe: string, g: GesetzDarstellung) {
  return (
    loeseNormzielAuf(parseSuchanfrage(eingabe), alsSuchverzeichniseintrag(g))?.bezeichnung ?? null
  );
}
it('schließt Gesetze ohne Normpräfix bei reiner Zahl auch aktiv und im Fallback aus', () => {
  const pkhb = gesetz(['Anlage 1'], 'PKHB 2012');
  const anderes = gesetz(['§ 1']);
  for (const aktiv of [null, pkhb, anderes])
    expect(
      berechneTreffer('2301', alsSuchverzeichniseintraege([pkhb, anderes]), aktiv, null),
    ).toEqual([]);
  for (const eingabe of ['2301 PKHB 2012', '1 pkhb']) {
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([pkhb]), null, null)).toEqual([
      { art: 'installiert', ...suchtrefferKopfangaben(pkhb) },
    ]);
    expect(ziel(eingabe, pkhb)).toBeNull();
  }
});
it.each([
  ['23', ['§ 123', '§ 230', '§ 23a'], null],
  ['23', ['§ 123', '§ 23'], '§ 23'],
  ['23a', ['§ 23', '§ 23ab', '§ 23a'], '§ 23a'],
  ['23A.', ['§ 23a'], '§ 23a'],
  ['23', ['Art. 23'], 'Art. 23'],
  ['23', ['§§ 20 bis 25'], '§§ 20 bis 25'],
])('löst %s anhand vollständiger Normzahlen auf', (eingabe, bezeichnungen, erwartet) => {
  expect(ziel(eingabe, gesetz(bezeichnungen))).toBe(erwartet);
});
it.each([
  ['§§ 3 bis 6', ['3', '4', '5', '6'], ['2', '7']],
  ['§§ 3 und 4', ['3', '4'], ['2', '5']],
  ['§§ 3, 5', ['3', '5'], ['4']],
])('berücksichtigt alle und nur die Normzahlen von %s', (bezeichnung, passend, unpassend) => {
  const g = gesetz([bezeichnung]);
  for (const eingabe of passend) expect(ziel(eingabe, g)).toBe(bezeichnung);
  for (const eingabe of unpassend) expect(ziel(eingabe, g)).toBeNull();
});
it('verwendet nur die erste Zahl von Anhang und Anlage und bevorzugt Normpräfixe', () => {
  const g = gesetz(['§§ 1 bis 4', 'Anhang 5', 'Anlage 3 (zu § 5)', 'Muster 7', 'Anhang I']);
  expect(ziel('5', g)).toBe('Anhang 5');
  expect(berechneTreffer('5', alsSuchverzeichniseintraege([g]), null, null)).toHaveLength(1);
  expect(ziel('5', gesetz(['Anhang 5', '§ 5']))).toBe('§ 5');
  const anlage = gesetz(['§ 10', 'Anlage 3 (zu § 5)']);
  expect(ziel('3', anlage)).toBe('Anlage 3 (zu § 5)');
  expect(ziel('5', anlage)).toBeNull();
  expect(ziel('7', gesetz(['§ 10', 'Muster 7', 'Anhang I']))).toBe('Muster 7');
  expect(ziel('1', gesetz(['§ 10', 'Muster 7', 'Anhang I']))).toBeNull();
});
it('behält bei doppelten Normzahlen das erste Vorkommen', () => {
  expect(
    loeseNormzielAuf(parseSuchanfrage('1'), alsSuchverzeichniseintrag(gesetz(['§ 1', '§ 1'])))
      ?.xmlId,
  ).toBe('0');
});
it.each([40, 10, 2])(
  'begrenzt %i installierte Treffer zusammen mit Angeboten erst am Listenende',
  (anzahl) => {
    const gesetze = Array.from({ length: anzahl }, (_, i) => gesetz([], `Gesetz ${i}`));
    const angebote = Array.from({ length: 100 }, (_, i) => ({
      kurztitel: `GAngebot ${i}`,
      langtitel: 'Gesetz',
      abrufkennung: `${i}`,
    }));
    const index = { 'de-bund': angebote, 'de-bw': [], eu: [] };
    const treffer = berechneTreffer('g', alsSuchverzeichniseintraege(gesetze), null, index);
    expect(treffer).toHaveLength(30);
    expect(treffer.filter((t) => t.art === 'installiert')).toHaveLength(Math.min(anzahl, 30));
    expect(berechneTreffer('', alsSuchverzeichniseintraege(gesetze), null, index)).toHaveLength(
      Math.min(anzahl, 30),
    );
    const exakt = { kurztitel: 'G', langtitel: 'Exakt', abrufkennung: 'exakt' };
    expect(
      berechneTreffer('g', alsSuchverzeichniseintraege(gesetze), null, {
        ...index,
        'de-bund': [...angebote, exakt],
      })[0],
    ).toEqual({ art: 'index', quelle: 'de-bund', eintrag: exakt });
    expect(
      berechneTreffer('g', alsSuchverzeichniseintraege(gesetze.slice(0, 2)), null, {
        ...index,
        'de-bund': angebote.slice(0, 2),
      }),
    ).toHaveLength(4);
  },
);

function treffer(
  eingabe: string,
  gesetze: GesetzDarstellung[],
  aktiv: GesetzDarstellung | null = null,
) {
  return berechneTreffer(eingabe, alsSuchverzeichniseintraege(gesetze), aktiv, null).map((t) =>
    t.art === 'installiert' ? `${t.gesetzesreferenz.kurztitel}: ${t.norm?.bezeichnung}` : 'Import',
  );
}
it('durchsucht übrige Gesetze streng und gemeinte Gesetze mit Nachsicht', () => {
  const lbo = gesetz(['Anlage 1', '§ 1', 'Anhang 1'], 'LBO');
  const g2 = gesetz(['§ 7', 'Anlage 1', 'Anhang 1'], 'G2');
  const g3 = gesetz(['Art. 1', 'Anlage 1'], 'G3');
  const g4 = gesetz(['§ 9'], 'G4');
  const cic = gesetz(['Can. 1'], 'CIC');
  const alle = [lbo, g2, g3, cic, g4];
  expect(treffer('1', alle, g4)).toEqual(['LBO: § 1', 'G2: Anlage 1', 'G3: Art. 1', 'CIC: Can. 1']);
  for (const aktiv of [g4, null]) expect(treffer('§ 1', alle, aktiv)).toEqual(['LBO: § 1']);
  expect(treffer('Art. 1', alle, g4)).toEqual(['G3: Art. 1']);
  for (const [eingabe, aktiv, erwartet] of [
    ['§ 1', g3, 'G3: Art. 1'],
    ['Art. 1', lbo, 'LBO: § 1'],
    ['§ 1 G3', null, 'G3: Art. 1'],
    ['§ 1 CIC', null, 'CIC: Can. 1'],
    ['§ 1', cic, 'CIC: Can. 1'],
    ['1', g2, 'G2: Anlage 1'],
  ] as const)
    expect(treffer(eingabe, alle, aktiv)).toEqual([
      erwartet,
      ...(eingabe === '1' ? ['G2: Anhang 1'] : []),
    ]);
});
it.each([
  ['§ 1', '§ 1', true],
  ['§ 4', '§§ 3 bis 6', true],
  ['Art. 1', 'Art. 1', true],
  ['§ 1', 'Art. 1', false],
  ['Art. 1', '§ 1', false],
  ['§ 1', 'Can. 1', false],
  ['§ 1', 'Regel 1', false],
  ['§ 1', 'Nr. 1', false],
  ['§ 1', 'Anlage 1', false],
])('prüft die Familie von %s gegen %s nur bei übrigen Gesetzen', (eingabe, norm, passend) => {
  const g = gesetz([norm, '§ 99'], 'BGB');
  g.langtitel = 'Bürgerliches Gesetzbuch';
  expect(treffer(`${eingabe} bürgerliches`, [g])).toEqual(passend ? [`BGB: ${norm}`] : []);
  expect(treffer(`${eingabe} BGB`, [g])).toEqual(norm === 'Anlage 1' ? [] : [`BGB: ${norm}`]);
  // Das Einzelziel nach einem Import behält die Präfix-Nachsicht.
  expect(ziel(eingabe, g)).toBe(norm === 'Anlage 1' ? null : norm);
});
it('beschränkt übrige Gliederungsartikel-Gesetze auf Artikel und erhält Zwei-Zahlen-Eingaben', () => {
  const eg = gesetz(['Art. 3', 'Art. 4', 'Art. 229', '§ 3', 'Art. 246a', '§ 3', '§ 4'], 'EG');
  eg.hatGliederungsartikel = true;
  for (const [i, element] of eg.elemente.entries()) {
    if (element.typ !== 'norm') continue;
    const xmlId = ['3', '4', '229', '229-3', '246a', '246a-3', '246a-4'][i];
    if (!xmlId) throw new Error('XML-ID der Testnorm fehlt');
    element.data.xmlId = xmlId;
    if (element.data.bezeichnung.startsWith('Art.')) element.data.art = 'gliederungsartikel';
  }
  const g4 = gesetz(['§ 9'], 'G4');
  expect(treffer('§ 3', [eg, g4], g4)).toEqual([]);
  for (const eingabe of ['Art. 3', '3', '§ 3 EG'])
    expect(treffer(eingabe, [eg, g4], g4)).toEqual(['EG: Art. 3']);
  expect(treffer('§ 3', [eg, g4], eg)).toEqual(['EG: Art. 3']);
  expect(treffer('229 3', [eg, g4], g4)).toEqual(['EG: § 3']);
  expect(berechneTreffer('229 3', alsSuchverzeichniseintraege([eg]), null, null)[0]).toMatchObject({
    norm: { xmlId: '229-3', artikelNummer: '229' },
  });
  expect(
    treffer('7', [
      {
        ...eg,
        elemente: [
          ...eg.elemente,
          { typ: 'norm', data: normaleNorm({ xmlId: '246a-7', bezeichnung: '§ 7' }) },
        ],
      },
    ]),
  ).toEqual([]);
});

it('lässt Importangebote samt Präfix-Nachsicht bei Vorschau und Auflösung unverändert', () => {
  const eintrag = {
    kurztitel: 'GG',
    langtitel: 'Grundgesetz',
    abrufkennung: 'gg',
    praefixstruktur: 'artikel' as const,
  };
  const index = { 'de-bund': [eintrag], 'de-bw': [], eu: [] };
  expect(berechneTreffer('§ 1 GG', alsSuchverzeichniseintraege([]), null, index)).toEqual([
    { art: 'index', quelle: 'de-bund', eintrag },
  ]);
  expect(indexNormAnzeige(parseSuchanfrage('§ 1 GG'), 'artikel')).toEqual({
    normLabel: 'Art. 1',
    artikelNummer: null,
  });
  expect(ziel('§ 1 GG', gesetz(['Art. 1'], 'GG'))).toBe('Art. 1');
});
it('wählt unter gleich nummerierten Hauptnormen die erste mit passender Familie', () => {
  const g = gesetz(['Art. 1', '§ 1', '§ 1'], 'MIX');
  expect(berechneTreffer('§ 1', alsSuchverzeichniseintraege([g]), null, null)[0]).toMatchObject({
    norm: { xmlId: '1', bezeichnung: '§ 1' },
  });
});

it.each(['NFC', 'NFD'] as const)(
  'findet Unicode-Kurztitel und grenzt Zahlbeginn ab (%s)',
  (form) => {
    for (const gespeichert of ['NFC', 'NFD'] as const) {
      const g = gesetz(['§ 3'], '2. HRÄG'.normalize(gespeichert));
      for (const [eingabe, erwartet] of [
        ['2. HRÄG', null],
        ['§ 3 2. HRÄG', '§ 3'],
      ] as const) {
        const text = eingabe.normalize(form);
        const treffer = berechneTreffer(text, alsSuchverzeichniseintraege([g]), null, null);
        expect(treffer).toHaveLength(1);
        expect(treffer[0]?.art).toBe('installiert');
        expect(ziel(text, g)).toBe(erwartet);
      }
      const a = gesetz(['§ 3'], 'AÜG'.normalize(gespeichert));
      expect(
        berechneTreffer('AÜG'.normalize(form), alsSuchverzeichniseintraege([a]), null, null),
      ).toHaveLength(1);
    }
  },
);

it.each(['NFC', 'NFD'] as const)('findet Unicode-Kurztitel im Importindex (%s)', (form) => {
  for (const gespeichert of ['NFC', 'NFD'] as const) {
    const eintrag = {
      kurztitel: '2. HRÄG'.normalize(gespeichert),
      langtitel: 'Gesetz',
      abrufkennung: 'test',
    };
    const index = { 'de-bund': [eintrag], 'de-bw': [], eu: [] };
    for (const text of ['2. HRÄG', '§ 3 2. HRÄG']) {
      expect(berechneTreffer(text.normalize(form), [], null, index)).toEqual([
        { art: 'index', quelle: 'de-bund', eintrag },
      ]);
      expect(
        indexNormAnzeige(parseSuchanfrage(text.normalize(form)), 'paragraph', eintrag.kurztitel)
          .normLabel,
      ).toBe(text.startsWith('§') ? '§ 3' : undefined);
    }
  }
});

it.each(['NFC', 'NFD'] as const)(
  'findet zerlegte Langtitel bei installierten Gesetzen und Importangeboten und erhält das Original (%s)',
  (form) => {
    const langtitel = 'Ärztegesetz'.normalize('NFD');
    const g = { ...gesetz(['§ 3']), langtitel };
    const text = 'Ärztegesetz'.normalize(form);
    const installiert = berechneTreffer(text, alsSuchverzeichniseintraege([g]), null, null);
    expect.soft(installiert).toEqual([{ art: 'installiert', ...suchtrefferKopfangaben(g) }]);
    const eintrag = { kurztitel: 'TestG', langtitel, abrufkennung: 'test' };
    expect(berechneTreffer(text, [], null, { 'de-bund': [eintrag], 'de-bw': [], eu: [] })).toEqual([
      { art: 'index', quelle: 'de-bund', eintrag },
    ]);
    expect(eintrag.langtitel).toBe(langtitel);
  },
);
