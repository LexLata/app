// @vitest-environment jsdom
// SeitenleistenAktionen.test.tsx
// Anzeigegrenzen der Leisten schützen Rohtext und erhalten ihre Bedienziele.
import { Schnellaktionen } from './Schnellaktionen';
import { act, type ComponentProps } from 'react';
import { assert, expect, it, vi } from 'vitest';
import { seitenleistenTestAufbau } from '@/test/hauptfenster/seitenleistenTestAufbau';
import { SeitenleistenIconButton, ZuklappenIcon } from './SeitenleistenAktionen';
import { Lesezeichenleiste } from './lesezeichen/Lesezeichenleiste';

const h = seitenleistenTestAufbau();
const roh = 'Art. 1 Abs. 1';
const geschuetzt = 'Art.\u00a01 Abs.\u00a01';
it('schützt den Icon-Tooltip und erhält Icon, Klick und technische Attribute', async () => {
  const klick = vi.fn();
  await act(async () =>
    h.root.render(
      <SeitenleistenIconButton
        icon={<svg data-testid="icon" />}
        titel={roh}
        onClick={klick}
        einfuehrungsZiel={roh}
      />,
    ),
  );
  const button = h.host.querySelector('button')!;
  expect(button.title).toBe(geschuetzt);
  expect(button.dataset.einfuehrungZiel).toBe(roh);
  expect(button.querySelector('svg')).not.toBeNull();
  await act(async () => button.click());
  expect(klick).toHaveBeenCalledOnce();
});

it('schützt Lesezeichenkopf und Bezeichnung und gibt die Originalreferenz weiter', async () => {
  const klick = vi.fn();
  const gesetz = { kurztitel: roh, normgeber: 'de-bund' };
  const eintraege = Array.from({ length: 21 }, (_, i) => ({
    bezeichnung: i === 20 ? roh : String(i),
    gesetz,
  }));
  await act(async () =>
    h.root.render(
      <Lesezeichenleiste
        eintraege={eintraege}
        onKlick={klick}
        seitenleistenTastenkuerzel={true}
        seite="links"
        schnellaktionenAnzahl={0}
        schnellaktionen={
          <Schnellaktionen
            gesetzOffen={true}
            favoritenleisteSichtbar={false}
            onFavoritKlick={vi.fn()}
            lesezeichen={[]}
            onLesezeichenKlick={vi.fn()}
            kannZuklappen={true}
            onZuklappenKlick={vi.fn()}
            kannAufklappen={true}
            onAufklappenKlick={vi.fn()}
            onSucheKlick={vi.fn()}
          />
        }
      />,
    ),
  );
  const button = h.host.querySelectorAll('button')[20]!;
  expect(button.title).toBe(`${geschuetzt} ${geschuetzt}`);
  expect(button.lastElementChild?.textContent).toBe('1');
  expect(
    Array.from(h.host.querySelectorAll('div[style*="font-weight: 700"]')).map(
      (kopf) => kopf.textContent,
    ),
  ).toEqual(['Art.\u00a01', 'Abs.\u00a01']);
  await act(async () => button.click());
  expect(klick).toHaveBeenCalledWith(roh, gesetz);
  expect(klick.mock.calls[0]![1]).toBe(gesetz);
});

it('gruppiert Lesezeichen ohne Umsortieren und zählt Tastenkürzel über Gesetzesgrenzen hinweg', async () => {
  const erstes = { kurztitel: 'BGB', normgeber: 'de-bund' as const };
  const zweites = { kurztitel: 'ZPO', normgeber: 'de-bund' as const };
  const eintraege = Array.from({ length: 21 }, (_, i) => ({
    gesetz: i < 10 ? erstes : zweites,
    bezeichnung: String(21 - i),
  }));
  const klick = vi.fn();
  const props: ComponentProps<typeof Lesezeichenleiste> = {
    eintraege,
    onKlick: klick,
    seite: 'links',
    schnellaktionen: null,
    schnellaktionenAnzahl: 0,
    seitenleistenTastenkuerzel: true,
  };
  await act(async () => h.root.render(<Lesezeichenleiste {...props} />));
  expect(
    Array.from(
      h.host.querySelectorAll('div[style*="font-weight: 700"]'),
      (kopf) => kopf.textContent,
    ),
  ).toEqual(['BGB', 'ZPO']);
  const buttons = Array.from(h.host.querySelectorAll('button'));
  expect(buttons.map((button) => button.lastElementChild!.textContent)).toEqual(
    eintraege.map((eintrag) => eintrag.bezeichnung),
  );
  expect([0, 9, 10, 19].map((index) => buttons[index]!.firstElementChild!.textContent)).toEqual([
    '1',
    '0',
    '1',
    '0',
  ]);
  expect((buttons[10]!.firstElementChild as HTMLElement).style.fontStyle).toBe('italic');
  expect((buttons[20]!.firstElementChild as HTMLElement).style.visibility).toBe('hidden');
  await act(async () => buttons[10]!.click());
  expect(klick).toHaveBeenCalledWith('11', zweites);
  await act(async () =>
    h.root.render(<Lesezeichenleiste {...props} seitenleistenTastenkuerzel={false} />),
  );
  expect(h.host.querySelector('button')!.children).toHaveLength(1);
});

it('behält Größe und Form des Zuklappen-Symbols ohne Größenangabe bei', async () => {
  await act(async () => h.root.render(<ZuklappenIcon />));
  const symbol = h.host.querySelector('svg');
  assert(symbol);
  expect(symbol.getAttribute('width')).toBe('16');
  expect(symbol.getAttribute('height')).toBe('16');
  expect(Array.from(symbol.querySelectorAll('path'), (pfad) => pfad.getAttribute('d'))).toEqual([
    'M4 2.5l4 3 4-3',
    'M4 13.5l4-3 4 3',
  ]);
});
