// @vitest-environment jsdom
// Favoritenleiste.test.tsx
// Favoritenanzeigen schützen Text, ohne das Navigationsziel zu verändern.
import { FavoritSchnellaktion } from '@/components/seitenleisten/Schnellaktionen';
import { act } from 'react';
import { assert, expect, it, vi } from 'vitest';
import { seitenleistenTestAufbau } from '@/test/hauptfenster/seitenleistenTestAufbau';
import { Favoritenleiste } from './Favoritenleiste';
const h = seitenleistenTestAufbau();
const roh = 'Art. 1 Abs. 1';
const geschuetzt = 'Art.\u00a01 Abs.\u00a01';
it('schützt Favoritenbezeichnung und Tooltip ohne Änderung der XML-ID', async () => {
  const klick = vi.fn();
  const eintraege = Array.from({ length: 79 }, (_, i) => ({
    bezeichnung: i === 78 ? roh : String(i),
    xmlId: `${roh}-${i}`,
  }));
  await act(async () =>
    h.root.render(
      <Favoritenleiste
        gesetz={{ normgeber: 'DE', kurztitel: 'BGB' }}
        eintraege={eintraege}
        onKlick={klick}
        seite="rechts"
        schnellaktionenAnzahl={0}
        schnellaktionen={<FavoritSchnellaktion onFavoritKlick={vi.fn()} />}
      />,
    ),
  );
  const button = h.host.querySelectorAll('button')[78]!;
  expect(button.title).toBe(geschuetzt);
  expect(button.lastElementChild?.textContent).toBe('1');

  await act(async () => button.click());
  expect(klick).toHaveBeenCalledWith(`${roh}-78`);
  expect(eintraege[78]!.bezeichnung).toBe(roh);
});

it('zeigt volle Bezeichnungen kurz und vergibt bei gleicher Norm unterschiedliche Schlüssel', async () => {
  const warnung = vi.spyOn(console, 'error');
  await act(async () =>
    h.root.render(
      <Favoritenleiste
        gesetz={{ normgeber: 'DE', kurztitel: 'BGB' }}
        eintraege={[
          { bezeichnung: '§ 433', xmlId: 'p433' },
          { bezeichnung: '§433', xmlId: 'p433' },
          { bezeichnung: 'Art. 229 § 3', xmlId: 'p3' },
        ]}
        onKlick={() => {}}
        seite="rechts"
        schnellaktionenAnzahl={0}
        schnellaktionen={null}
      />,
    ),
  );
  const buttons = h.host.querySelectorAll('button');
  assert(buttons[0]);
  assert(buttons[2]);
  expect(buttons[0].title).toContain('§\u00a0433');
  expect(buttons[0].textContent).toContain('433');
  expect(buttons[0].textContent).not.toContain('§');
  expect(buttons[2].textContent).toContain('229 3');
  expect(warnung).not.toHaveBeenCalled();
});
