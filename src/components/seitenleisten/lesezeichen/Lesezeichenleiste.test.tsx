import { schreibeSpeicherbareNorm } from '@/lib/domain/aktives-element/aktives-element.index';
// @vitest-environment jsdom
// Lesezeichenleiste.test.tsx
// Die Lesezeichenleiste zeigt Kurzformen und navigiert mit voller Bezeichnung.
import { act } from 'react';
import { assert, expect, it, vi } from 'vitest';
import { seitenleistenTestAufbau } from '@/test/hauptfenster/seitenleistenTestAufbau';
import { Lesezeichenleiste } from './Lesezeichenleiste';
const h = seitenleistenTestAufbau();
it('zeigt die Kurzform mit vollem Tooltip und reicht beim Klick die volle Bezeichnung weiter', async () => {
  const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  const klick = vi.fn();
  await act(async () =>
    h.root.render(
      <Lesezeichenleiste
        eintraege={[{ gesetz, bezeichnung: '§ 433' }]}
        onKlick={klick}
        seite="links"
        schnellaktionenAnzahl={0}
        schnellaktionen={null}
        seitenleistenTastenkuerzel={true}
      />,
    ),
  );
  const button = h.host.querySelector('button');
  assert(button);
  expect(button.title).toContain('§\u00a0433');
  expect(button.textContent).toContain('433');
  expect(button.textContent).not.toContain('§');
  await act(async () => button.click());
  expect(klick).toHaveBeenCalledExactlyOnceWith('§ 433', gesetz);
});
it('zeigt mehrzeilige Köpfe ohne zusätzliche Abstände oder verschobene Tastenkürzel', async () => {
  const warnung = vi.spyOn(console, 'error');
  await act(async () =>
    h.root.render(
      <Lesezeichenleiste
        eintraege={['BGB', 'CIC/1983 IV aF'].map((kurztitel) => ({
          gesetz: { kurztitel, normgeber: 'DE' },
          bezeichnung: '§ 1',
        }))}
        onKlick={vi.fn()}
        seite="links"
        schnellaktionenAnzahl={0}
        schnellaktionen={null}
        seitenleistenTastenkuerzel={true}
      />,
    ),
  );
  const kopf = (text: string) =>
    Array.from(h.host.querySelectorAll<HTMLElement>('div')).find((e) => e.textContent === text);
  expect(kopf('BGB')?.style.marginTop).toBe('0px');
  expect(kopf('CIC/1983')?.style.marginTop).toBe('6px');
  expect(kopf('IV aF')?.style.marginTop).toBe('-2px');
  const buttons = h.host.querySelectorAll('button');
  const erster = buttons[0];
  const zweiter = buttons[1];
  assert(erster);
  assert(zweiter);
  expect(erster.textContent).toBe('11');
  expect(zweiter.textContent).toBe('21');
  expect(kopf('IV aF')?.nextElementSibling).toBe(buttons[1]);
  expect(warnung).not.toHaveBeenCalled();
  warnung.mockRestore();
});

it('unterscheidet aktive Lesezeichen nach vollständiger Bezeichnung und Normgeber bei gleichem Kurztitel', async () => {
  const bund = { kurztitel: 'TestG', normgeber: 'de-bund' };
  const land = { kurztitel: 'TestG', normgeber: 'de-bw' };
  const eintraege = [
    { gesetz: bund, bezeichnung: 'Art. 1 § 2' },
    { gesetz: bund, bezeichnung: 'Art. 3 § 2' },
    { gesetz: land, bezeichnung: 'Art. 1 § 2' },
  ];
  for (const index of [0, 1, 2]) {
    const eintrag = eintraege[index];
    assert(eintrag);
    await act(async () => schreibeSpeicherbareNorm({ ...eintrag, istFavorit: false }));
    await act(async () =>
      h.root.render(
        <Lesezeichenleiste
          eintraege={eintraege}
          onKlick={vi.fn()}
          seite="links"
          schnellaktionenAnzahl={0}
          schnellaktionen={null}
          seitenleistenTastenkuerzel={false}
        />,
      ),
    );
    expect(
      [...h.host.querySelectorAll('button')].map((b) => {
        const zahl = b.lastElementChild;
        assert(zahl instanceof HTMLElement);
        return zahl.style.color;
      }),
    ).toEqual(eintraege.map((_, i) => (i === index ? 'var(--akzent)' : 'var(--text-primaer)')));
  }
});
