import { afterEach, describe, expect, it, vi } from 'vitest';
import { erstelleTextMessung, MESS_CACHE_MAX_EINTRAEGE } from './textMessung';

afterEach(() => vi.unstubAllGlobals());

describe('lokale Textmessung', () => {
  it('misst jede Ansicht mit ihrer expliziten Familie ohne globale Gesetzestext-CSS', () => {
    const gemesseneFonts: string[] = [];
    const kontext = {
      font: '',
      measureText(text: string) {
        gemesseneFonts.push(this.font);
        return { width: text.length * (this.font.includes('Georgia') ? 12 : 6) };
      },
    };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => kontext }) });
    const georgia = erstelleTextMessung("'Georgia', serif");
    const times = erstelleTextMessung("'Times New Roman', Times, serif");
    expect(georgia.spaltenBreite('abc', 15)).toBe(41.25);
    expect(times.spaltenBreite('abc', 15)).toBe(23.25);
    expect(georgia.spaltenBreite('abc', 15)).toBe(41.25);
    expect(gemesseneFonts).toEqual([
      "15px 'Georgia', serif",
      "15px 'Times New Roman', Times, serif",
    ]);
    expect(georgia.zeilenFuerText('abc abc', 50, 15)).toBe(2);
    expect(times.zeilenFuerText('abc abc', 50, 15)).toBe(1);
  });
  it('behält den DOM-freien Fallback', () => {
    const messung = erstelleTextMessung('sans-serif');
    expect(messung.spaltenBreite('abc', 16)).toBeCloseTo(32);
    expect(messung.zeilenFuerText(undefined, 100, 16)).toBe(0);
    expect(messung.zeilenFuerText('x'.repeat(50), 100, 16)).toBe(3);
  });
  it.each(['spaltenBreite', 'zeilenFuerText'] as const)(
    '%s begrenzt nur ihren eigenen Cache',
    (art) => {
      const messungen = zaehlendesCanvas();
      const messung = erstelleTextMessung('sans-serif', 2);
      const andere = erstelleTextMessung('serif', 2);
      const messen = (text: string) =>
        art === 'spaltenBreite'
          ? messung.spaltenBreite(text, 16)
          : messung.zeilenFuerText(text, 400, 16);
      andere.spaltenBreite('t0', 16);
      const fremd = art === 'spaltenBreite' ? 'Fremd' : 'fremd';
      if (art === 'spaltenBreite') messung.zeilenFuerText(fremd, 400, 16);
      else messung.spaltenBreite(fremd, 16);
      for (const text of ['t0', 't1', 't2', 't3']) messen(text);
      const vorher = messungen.length;
      andere.spaltenBreite('t0', 16);
      if (art === 'spaltenBreite') messung.zeilenFuerText(fremd, 400, 16);
      else messung.spaltenBreite(fremd, 16);
      expect(messungen).toHaveLength(vorher);
    },
  );
});

it.each([true, false])(
  'meldet Füllstände und Fehlgriffe nur im Entwicklungsbetrieb: %s',
  (entwicklung) => {
    vi.stubEnv('DEV', entwicklung);
    vi.useFakeTimers();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const messung = erstelleTextMessung('sans-serif');
      messung.spaltenBreite('A', 16);
      messung.spaltenBreite('A', 16);
      messung.zeilenFuerText('B', 400, 16);
      messung.meldeMessstand('nach Aufbau');
      if (entwicklung) {
        expect(info).toHaveBeenLastCalledWith(
          expect.stringContaining(
            'Spalten 1/40000, 1 Fehlgriffe, 0 Verdrängungen; Zeilen 1/40000, 1 Fehlgriffe, 0 Verdrängungen',
          ),
        );
        expect(vi.getTimerCount()).toBe(1);
        vi.advanceTimersByTime(500);
        expect(info).toHaveBeenLastCalledWith(expect.stringContaining('nach Messruhe'));
      } else {
        expect(info).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      info.mockRestore();
    }
  },
);

it('liefert den Füllstand beider Messzwischenspeicher mit den gespeicherten Textzeichen', () => {
  const messung = erstelleTextMessung('sans-serif');
  messung.spaltenBreite('(1)', 16);
  messung.spaltenBreite('(1)', 16);
  messung.spaltenBreite('(12)', 16);
  messung.zeilenFuerText('Langer Normtext', 400, 16);
  const stand = messung.holeMessstand();
  expect(stand.grenze).toBe(MESS_CACHE_MAX_EINTRAEGE);
  expect(stand.spalten.eintraege).toBe(2);
  expect(stand.zeilen.eintraege).toBe(1);
  // Die Schlüssel enthalten mindestens den gemessenen Text.
  expect(stand.spalten.zeichen).toBeGreaterThanOrEqual('(1)(12)'.length);
  expect(stand.zeilen.zeichen).toBeGreaterThanOrEqual('Langer Normtext'.length);
});

// Zählende Canvas-Attrappe: jedes Zeichen ist 0,5 · Schriftgröße breit (Leerzeichen eingeschlossen).
function zaehlendesCanvas() {
  const messungen: string[] = [];
  const kontext = {
    font: '',
    measureText(text: string) {
      messungen.push(`${this.font}|${text}`);
      return { width: text.length * 0.5 * Number.parseFloat(this.font) };
    },
  };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => kontext }) });
  return messungen;
}

describe('Zwischenspeicher der Zeilenschätzung', () => {
  it('misst gleichen Text bei gleicher Schrift und nach Rundung gleicher Breite nur einmal', () => {
    const messungen = zaehlendesCanvas();
    const messung = erstelleTextMessung('serif');
    // „aaa “ = 4 Zeichen · 5 px = 20 px je Wort; 4 Wörter auf 50 px: 2 Wörter je Zeile.
    expect(messung.zeilenFuerText('aaa aaa aaa aaa', 50, 10)).toBe(2);
    const nachErster = messungen.length;
    expect(messung.zeilenFuerText('aaa aaa aaa aaa', 50.6, 10)).toBe(2);
    expect(messung.zeilenFuerText('aaa aaa aaa aaa', 49.2, 10)).toBe(2);
    expect(messungen).toHaveLength(nachErster);
  });

  it.each([
    ['anderer Text', 'aaa aaa aaa', 50, 10, 2],
    ['andere Schriftgröße', 'aaa aaa aaa aaa', 50, 5, 1],
    ['andere gerundete Breite', 'aaa aaa aaa aaa', 40, 10, 2],
    ['schmalere gerundete Breite', 'aaa aaa aaa aaa', 30, 10, 4],
  ])('misst bei %s neu', (_fall, text, breite, schrift, zeilen) => {
    const messungen = zaehlendesCanvas();
    const messung = erstelleTextMessung('serif');
    messung.zeilenFuerText('aaa aaa aaa aaa', 50, 10);
    const vorher = messungen.length;
    expect(messung.zeilenFuerText(text, breite, schrift)).toBe(zeilen);
    expect(messungen.length).toBeGreaterThan(vorher);
  });

  it('misst Spaltenbreiten je Text und Schriftgröße nur einmal', () => {
    const messungen = zaehlendesCanvas();
    const messung = erstelleTextMessung('serif');
    // „(1)“ = 3 Zeichen · 8 px + Puffer 0,35 · 16 px.
    expect(messung.spaltenBreite('(1)', 16)).toBeCloseTo(29.6);
    expect(messung.spaltenBreite('(1)', 16)).toBeCloseTo(29.6);
    expect(messung.spaltenBreite('(1)', 10)).toBeCloseTo(18.5);
    expect(messung.spaltenBreite('(12)', 16)).toBeCloseTo(37.6);
    expect(messungen).toHaveLength(3);
  });
});

describe('Verdrängung bei voller Grenze', () => {
  it.each(['spaltenBreite', 'zeilenFuerText'] as const)(
    '%s verdrängt die ältesten Einträge und behält die übrigen',
    (art) => {
      const messungen = zaehlendesCanvas();
      const messung = erstelleTextMessung('serif', 3);
      const messen = (text: string) =>
        art === 'spaltenBreite'
          ? messung.spaltenBreite(text, 10)
          : messung.zeilenFuerText(text, 400, 10);
      const anzahl = () => messung.holeMessstand()[art === 'spaltenBreite' ? 'spalten' : 'zeilen'];
      for (const text of ['a', 'b', 'c', 'd']) messen(text);
      expect(anzahl().eintraege).toBe(3);
      expect(messung.holeMessstand().grenze).toBe(3);
      const vorher = messungen.length;
      // Die drei zuletzt eingefügten Einträge bleiben erhalten.
      for (const text of ['b', 'c', 'd']) messen(text);
      expect(messungen).toHaveLength(vorher);
      // Der älteste Eintrag wurde verdrängt.
      messen('a');
      expect(messungen).toHaveLength(vorher + 1);
      expect(anzahl().eintraege).toBe(3);
      // Jetzt ist „b“ der älteste und wurde verdrängt; „c“, „d“ bleiben.
      messen('c');
      messen('d');
      expect(messungen).toHaveLength(vorher + 1);
      messen('b');
      expect(messungen).toHaveLength(vorher + 2);
    },
  );
});

describe('Zeilenschätzung mit Schriftstil, Vorlauf und Silbentrennung', () => {
  // Messattrappe: jedes Zeichen (auch Leerzeichen und Trennstrich) ist 10 px breit.
  function zehnProZeichen() {
    const fonts: string[] = [];
    const kontext = {
      font: '',
      measureText(text: string) {
        fonts.push(this.font);
        return { width: text.length * 10 };
      },
    };
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => kontext }) });
    return fonts;
  }

  it('misst Titel im übergebenen Schriftstil', () => {
    const fonts = zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    messung.zeilenFuerText('abc', 100, 15, { stil: 'bold' });
    expect(messung.textBreite('§ 1', 15, 'bold')).toBe(30);
    expect(fonts).toEqual(['bold 15px serif', 'bold 15px serif']);
  });

  it('rechnet die nicht umbrechende Bezeichnung vor dem ersten Wort mit', () => {
    zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    // "abcd " 50 + "efgh " 50 = 100 passt; mit 20 px Vorlauf 120 > 100.
    expect(messung.zeilenFuerText('abcd efgh', 100, 15)).toBe(1);
    expect(messung.zeilenFuerText('abcd efgh', 100, 15, { vorlaufBreite: 20 })).toBe(2);
  });

  it('trennt ein nicht passendes Wort an der längsten passenden Silbengrenze', () => {
    zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    const text = 'Haus Verwaltungsgericht Haus';
    // Ohne Trennung: "Haus " 50 | "Verwaltungsgericht " 190 | "Haus" → 3 Zeilen.
    expect(messung.zeilenFuerText(text, 200, 15)).toBe(3);
    // Mit Trennung: "Haus " 50 + "Verwaltungsge-" 140 = 190 ≤ 200; "richt Haus" → 2 Zeilen.
    expect(messung.zeilenFuerText(text, 200, 15, { silbentrennung: 'de' })).toBe(2);
  });

  it('hält sch zusammen und trennt nicht zwischen zwei Vokalen', () => {
    zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    // "Wäsche" trennt nur Wä|sche: "abc Wä-" 70 passt, "sche xyzw" 90 > 80 → 3 Zeilen.
    // Eine Trennung Wäs|che ergäbe "abc Wäs-" 80 und "che xyzw" 80 → 2 Zeilen.
    expect(messung.zeilenFuerText('abc Wäsche xyzw', 80, 15, { silbentrennung: 'de' })).toBe(3);
    // "Ideal": I|deal unterschreitet zwei Zeichen vor der Trennstelle, zwischen e und a steht
    // kein Konsonant → keine Trennstelle, wie ohne Trennung 3 Zeilen ("ab Ide-" | "al xy" ergäbe 2).
    expect(messung.zeilenFuerText('ab Ideal xy', 70, 15, { silbentrennung: 'de' })).toBe(3);
  });

  it('beginnt mit harten Umbrüchen an jedem Zeilenumbruch eine neue Zeile', () => {
    zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    const H = { harteUmbrueche: true };
    // Je Teil eigene Zeilen: "abc" | "def" → 2; der lange Teil "aaaa bbbb" bricht bei 50 px um.
    expect(messung.zeilenFuerText('abc\ndef', 100, 15, H)).toBe(2);
    expect(messung.zeilenFuerText('aaaa bbbb\ncc', 50, 15, H)).toBe(3);
    // Zwei Umbrüche hintereinander ergeben eine Leerzeile.
    expect(messung.zeilenFuerText('abc\n\ndef', 100, 15, H)).toBe(3);
    // Ein abschließender Umbruch erzeugt keine sichtbare Zeile.
    expect(messung.zeilenFuerText('abc\n', 100, 15, H)).toBe(1);
    // Der Vorlauf steht nur vor dem ersten Teil: 60 + "abcd" 40 = 100; "efghij" 60.
    expect(messung.zeilenFuerText('abcd\nefghij', 100, 15, { ...H, vorlaufBreite: 60 })).toBe(2);
  });

  it('behandelt Zeilenumbrüche und Leerraumfolgen ohne harte Umbrüche wie ein Leerzeichen', () => {
    zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    // Wie white-space: normal: "abc def" 70 passt in 100 px → 1 Zeile (hart wären es 2).
    expect(messung.zeilenFuerText('abc\ndef', 100, 15)).toBe(1);
    expect(messung.zeilenFuerText('abc \n\t def', 100, 15)).toBe(1);
    // Kein Umbruch am Textende: "abc" → 1 Zeile; "aaaa bbbb" bricht bei 50 px um → 2 Zeilen.
    expect(messung.zeilenFuerText('abc\n', 100, 15)).toBe(1);
    expect(messung.zeilenFuerText('aaaa\nbbbb', 50, 15)).toBe(2);
  });

  it.each(['\u00a0', '\u202f'])(
    'hält durch geschützte Leerzeichen verbundene Wörter zusammen: %j',
    (schutz) => {
      zehnProZeichen();
      const messung = erstelleTextMessung('serif');
      // Getrennt: "xxxx ab" 70 | "cd yy" 50 → 2 Zeilen. Als Gruppe: "xxxx" | "ab cd" 50 + 10 + "yy"
      // 20 = 80 > 70 → "yy" in die dritte Zeile.
      expect(messung.zeilenFuerText('xxxx ab cd yy', 70, 15)).toBe(2);
      expect(messung.zeilenFuerText(`xxxx ab${schutz}cd yy`, 70, 15)).toBe(3);
    },
  );

  it.each(['\u00a0', '\u202f'])(
    'trennt geschützte Wortgruppen auch bei Silbentrennung nicht: %j',
    (schutz) => {
      zehnProZeichen();
      const messung = erstelleTextMessung('serif');
      // „xxx“ | „Absatz 1“ (80 px) | „yy“; die geschützte Gruppe darf nicht als
      // „xxx Ab-“ | „satz 1 yy“ auf zwei Zeilen verteilt werden.
      expect(
        messung.zeilenFuerText(`xxx Absatz${schutz}1 yy`, 100, 15, { silbentrennung: 'de' }),
      ).toBe(3);
    },
  );

  it('misst das Leerzeichen am Zeilenende nicht mit', () => {
    zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    // "abcd " 50 + "efgh" 40 = 90 passt in 90 px; das hängende Leerzeichen zählt nicht.
    expect(messung.zeilenFuerText('abcd efgh', 90, 15)).toBe(1);
    expect(messung.zeilenFuerText('abcd efgh', 88, 15)).toBe(2);
    // Mit Vorlauf: 10 + "abcd " 50 + "efgh" 40 = 100 passt; im Titelstil gleich.
    expect(messung.zeilenFuerText('abcd efgh', 100, 15, { vorlaufBreite: 10, stil: 'bold' })).toBe(
      1,
    );
  });

  it('trennt Französisch und Spanisch nach eigenen Regeln, untrennbare Gruppen bleiben zusammen', () => {
    zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    // Französisch pa|trie (tr untrennbar): "ab pa-" 60 | "trie x" 60 → 2 Zeilen. Die deutsche
    // Regel trennte pat|rie: "ab pat-" 70 passt nicht → "ab" | "patrie" | "x" → 3 Zeilen.
    expect(messung.zeilenFuerText('ab patrie x', 60, 15, { silbentrennung: 'fr' })).toBe(2);
    expect(messung.zeilenFuerText('ab patrie x', 60, 15, { silbentrennung: 'de' })).toBe(3);
    // Spanisch pe|rro (rr untrennbar): "ab pe-" 60 | "rro x" 50 → 2 Zeilen; deutsch per|ro → 3.
    expect(messung.zeilenFuerText('ab perro x', 60, 15, { silbentrennung: 'es' })).toBe(2);
    expect(messung.zeilenFuerText('ab perro x', 60, 15, { silbentrennung: 'de' })).toBe(3);
    // Akzentvokale zählen als Vokale: vé|ri|té → "ab vé-" 60 | "rité x" 60 → 2 Zeilen.
    expect(messung.zeilenFuerText('ab vérité x', 60, 15, { silbentrennung: 'fr' })).toBe(2);
  });

  it('trennt nach einem vorhandenen Bindestrich ohne zusätzlichen Strich', () => {
    zehnProZeichen();
    const messung = erstelleTextMessung('serif');
    // Ohne Trennung: "ab " | "EU-Rat " 70 | "x" → 3 Zeilen.
    // Mit Trennung: "ab EU-" 60 ≤ 60, "Rat x" 60 → 2 Zeilen.
    expect(messung.zeilenFuerText('ab EU-Rat x', 60, 15)).toBe(3);
    expect(messung.zeilenFuerText('ab EU-Rat x', 60, 15, { silbentrennung: 'de' })).toBe(2);
  });
});
