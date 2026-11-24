// Prüft die sichtbaren Normbezeichnungen der Importangebote.
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { TrefferZeile } from './OeffnenTrefferZeile';
import { parseSuchanfrage } from '@/lib/domain/app/oeffnen/oeffnen.index';
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => ({ istMac: false }) }));
it.each([
  ['artikel', '1 GG', 'Art.'],
  ['paragraph', '10 5 StGB', '§'],
  ['gliederungsartikel', '229 3 EGBGB', 'Art.'],
] as const)('zeigt das Präfix des Angebots %s', (praefixstruktur, eingabe, praefix) => {
  const html = renderToStaticMarkup(
    <TrefferZeile
      idx={0}
      treffer={{
        art: 'index',
        quelle: 'de-bund',
        eintrag: { kurztitel: 'G', langtitel: '', abrufkennung: 'g', praefixstruktur },
      }}
      markiert={false}
      anfrage={parseSuchanfrage(eingabe)}
      onClick={() => {}}
      onMausBewegung={() => {}}
    />,
  );
  expect(html).toContain(praefix);
  if (praefixstruktur === 'paragraph') {
    expect(html).toContain('10');
    expect(html).not.toContain('Art.');
  }
});

it.each([
  ['2. PKHB 2012', 'paragraph', false],
  ['1 2. PKHB 2012', 'paragraph', true],
  ['1 2. PKHB 2012', 'ohne-praefix', false],
] as const)(
  'grenzt die Vorschau für %s mit %s am bekannten Titel ab',
  (eingabe, praefixstruktur, mitNorm) => {
    const html = renderToStaticMarkup(
      <TrefferZeile
        idx={0}
        treffer={{
          art: 'index',
          quelle: 'de-bund',
          eintrag: {
            kurztitel: '2. PKHB 2012',
            langtitel: '',
            abrufkennung: 'g',
            praefixstruktur,
          },
        }}
        markiert={false}
        anfrage={parseSuchanfrage(eingabe)}
        onClick={() => {}}
        onMausBewegung={() => {}}
      />,
    );
    expect(html.includes('§')).toBe(mitNorm);
    if (mitNorm) expect(html).not.toContain('Art.');
  },
);

it.each([
  ['32016R0679', 'eur-lex.europa.eu'],
  ['EMRK_europarat.xml', 'vorinstalliert'],
])('zeigt für das Europa-Angebot %s die Quelle %s', (link, quelle) => {
  const html = renderToStaticMarkup(
    <TrefferZeile
      idx={0}
      treffer={{
        art: 'index',
        quelle: 'eu',
        eintrag: { kurztitel: 'G', langtitel: '', abrufkennung: link },
      }}
      markiert={false}
      onClick={() => {}}
      onMausBewegung={() => {}}
    />,
  );
  expect(html).toContain(`↓ ${quelle}`);
  expect(html).toContain(`Wird bei Auswahl von ${quelle} importiert`);
});

it('zeigt die Alternative und grenzt ihre führende Zahl von der Normangabe ab', () => {
  const html = renderToStaticMarkup(
    <TrefferZeile
      idx={0}
      treffer={{
        art: 'index',
        quelle: 'eu',
        eintrag: {
          kurztitel: 'AI Act',
          langtitel: '',
          abrufkennung: '32024R1689',
          praefixstruktur: 'artikel',
        },
        gefundenUeber: '2. Digital Services Act',
      }}
      markiert={false}
      anfrage={parseSuchanfrage('6 2. Digital Services Act')}
      onClick={() => {}}
      onMausBewegung={() => {}}
    />,
  );
  const text = new DOMParser()
    .parseFromString(html, 'text/html')
    .documentElement.textContent?.replace(/\s+/g, ' ');
  expect(text).toContain('2. Digital Services Act');
  expect(text).toContain('Art. 6');
  expect(html).not.toContain('AI Act');
});
