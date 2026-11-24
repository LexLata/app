// @vitest-environment jsdom
// GesetzInfoOverlay.test.tsx
// Normgeber erscheinen lesbar zwischen Kurztitel und den bestehenden Metadaten.
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { GesetzInfoOverlay } from './GesetzInfoOverlay';

let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('main');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it.each([
  ['de-bw', 'Baden-Württemberg'],
  ['at-bund', 'at-bund'],
])('zeigt nach Öffnen die Normgeberzeile für %s unter dem Kurztitel', async (normgeber, name) => {
  const gesetz = gesetzDarstellung({
    normgeber,
    kurztitel: 'TestG',
    langtitel: 'Testgesetz',
    fundstelle: 'Testfundstelle',
    ausfertigung: '2026-10-26',
    neugefasst: 'Neue Fassung vom Testdatum',
    aenderungsvermerk: 'Änderungsvermerk',
    datenquelle: { name: 'Testquelle', url: 'https://test/' },
    hatGliederungsartikel: true,
    elemente: [],
  });
  function Bedienung() {
    const [offen, setOffen] = useState(false);
    return (
      <>
        <button onClick={() => setOffen(true)}>Gesetzesinformationen öffnen</button>
        {offen && <GesetzInfoOverlay gesetz={gesetz} onSchliessen={() => setOffen(false)} />}
      </>
    );
  }
  await act(async () => root.render(<Bedienung />));
  const oeffnen = document.querySelector('button');
  if (!oeffnen) throw new Error('Schaltfläche zum Öffnen fehlt');
  await act(async () => oeffnen.click());
  const labels = [
    'Langtitel',
    'Kurztitel',
    'Normgeber',
    'Fundstelle',
    'Ausgefertigt',
    'Neufassung',
    'Letzte Änderung',
    'Normen',
    'Zeichen',
    'Datenquelle',
    'Importiert am',
  ];
  const zeilen = [...document.querySelectorAll('span')].filter((el) =>
    labels.includes(el.textContent ?? ''),
  );
  expect(zeilen.map((el) => el.textContent)).toEqual(labels);
  expect(document.body.textContent).toContain('DatenquelleTestquelle');
  expect(document.body.textContent).not.toContain('https://test/');
  expect(zeilen[2]?.parentElement?.textContent).toBe(`Normgeber${name}`);
  await act(async () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(document.body.textContent).not.toContain('Normgeber');
});

it('zeigt ohne Datenquellennamen die Adresse als Wert', async () => {
  await act(async () =>
    root.render(
      <GesetzInfoOverlay
        gesetz={gesetzDarstellung({ datenquelle: { url: 'https://quelle.test/' } })}
        onSchliessen={() => {}}
      />,
    ),
  );
  expect(document.body.textContent).toContain('Datenquellehttps://quelle.test/');
  expect([...document.querySelectorAll('span')].some((el) => el.textContent === 'Quelle')).toBe(
    false,
  );
});

it('zeigt bei einer Datenquelle ohne Name und Adresse keine leere Zeile', async () => {
  await act(async () =>
    root.render(
      <GesetzInfoOverlay gesetz={gesetzDarstellung({ datenquelle: {} })} onSchliessen={() => {}} />,
    ),
  );
  expect(document.body.textContent).not.toContain('Datenquelle');
});

it('zeigt EU-Fassung mit dem bisherigen Wortlaut getrennt vom amtlichen Änderungsvermerk', async () => {
  await act(async () =>
    root.render(
      <GesetzInfoOverlay
        gesetz={gesetzDarstellung({
          normgeber: 'eu',
          fassung: { art: 'konsolidiert', stichtag: '2016-05-04', erwaegungsgruendeErgaenzt: true },
          aenderungsvermerk: 'Amtliche Änderung',
        })}
        onSchliessen={() => {}}
      />,
    ),
  );
  expect(document.body.textContent).toContain('Fassung');
  expect(document.body.textContent).toContain(
    'Konsolidierte Fassung vom 04.05.2016 (keine Rechtswirkung); Erwägungsgründe aus dem Originaltext',
  );
  expect(document.body.textContent).toContain('Letzte Änderung');
  expect(document.body.textContent).toContain('Amtliche Änderung');
});
