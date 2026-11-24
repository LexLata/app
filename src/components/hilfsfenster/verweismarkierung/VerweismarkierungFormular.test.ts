// VerweismarkierungFormular.test.ts
// Gesetzesfehler ohne bestimmte Referenz erlauben keine Speicherung eines geratenen Ziels.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import VerweismarkierungFormular from './VerweismarkierungFormular';
import type { ZitatFehler } from '@/lib/markierungen/markierungen.index';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

function formular(fehler: ZitatFehler[]): string {
  return renderToStaticMarkup(
    createElement(VerweismarkierungFormular, {
      kontext: {
        openerLabel: 'test',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        ausgangsstelle: normAusgangsstelle('§ 1'),
      },
      zitatText: '§ 1 SGB IV',
      textbezug: false,
      laeuft: false,
      schliessvorgangAktiv: false,
      gespeichert: false,
      uebertragungOffen: false,
      fehler,
      importFehlgeschlagen: false,
      aktualisierungsHinweis: null,
      zitatTextRef: createRef<HTMLTextAreaElement>(),
      inhaltRef: createRef<HTMLDivElement>(),
      onWiederholen: vi.fn(),
      onTrotzdemSchliessen: vi.fn(),
      onZitatTextChange: vi.fn(),
      onTextbezugChange: vi.fn(),
      onAbbrechen: vi.fn(),
      onTrotzdemSpeichern: vi.fn(),
      onImportVersuchen: vi.fn(),
      onFertig: vi.fn(),
      onEnter: vi.fn(),
    }),
  );
}

describe('Gesetzesfehler im Verweisformular', () => {
  it.each(['fehlend', 'mehrdeutig'] as const)(
    'bietet bei %s ohne Zielreferenz weder Import noch Trotzdem speichern an',
    (grund) => {
      const html = formular([{ art: 'gesetz', grund, text: 'Keine bestimmte Referenz.' }]);
      expect(html).not.toContain('Trotzdem speichern');
      expect(html).not.toContain('Gesetz importieren');
      expect(html).toContain('Keine bestimmte Referenz.');
    },
  );
  it('bietet für ein bestimmtes noch fehlendes Ziel weiterhin Import und Trotzdem speichern an', () => {
    const html = formular([
      {
        art: 'gesetz',
        gesetz: { kurztitel: 'SGB IV', normgeber: 'de-bund' },
        text: 'Gesetz ist nicht auf dem Gerät.',
      },
    ]);
    expect(html).toContain('Trotzdem speichern');
    expect(html).toContain('Gesetz importieren');
  });
  it('sperrt Trotzdem speichern auch bei einer Mischung aus mehrdeutigem Gesetz und fehlender Norm', () => {
    expect(
      formular([
        { art: 'gesetz', grund: 'mehrdeutig', text: 'Mehrdeutiges Gesetz.' },
        { art: 'norm', gesetz: { kurztitel: 'GG', normgeber: 'de-bund' }, text: 'Norm fehlt.' },
      ]),
    ).not.toContain('Trotzdem speichern');
  });
});
