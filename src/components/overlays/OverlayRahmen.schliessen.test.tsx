// @vitest-environment jsdom
// OverlayRahmen.schliessen.test.tsx
// Gemeinsames Schließverhalten aller Overlays: Escape und Hintergrundklick schließen,
// Klicks in den Inhalt nicht; Sperre und geschlossener Rahmen schließen nie.
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { OverlayRahmen } from './OverlayRahmen';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setFocus: async () => {} }),
}));

const dom = domTestWurzel();

async function zeige(onSchliessen: () => void, kannSchliessen?: boolean) {
  await act(async () =>
    dom.root.render(
      <OverlayRahmen onSchliessen={onSchliessen} breite={500} kannSchliessen={kannSchliessen}>
        <p>Inhalt</p>
      </OverlayRahmen>,
    ),
  );
}
const escape = () =>
  act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
const klick = (element: Element | null) =>
  act(async () => {
    if (!(element instanceof HTMLElement)) throw new Error('Element fehlt');
    element.click();
  });

it('schließt über Escape und Hintergrund, aber nicht durch Klick in den Inhalt', async () => {
  const schliessen = vi.fn();
  await zeige(schliessen);
  await klick(dom.host.querySelector('p'));
  expect(schliessen).not.toHaveBeenCalled();
  await escape();
  expect(schliessen).toHaveBeenCalledTimes(1);
  await klick(dom.host.querySelector('[data-overlay-aktiv]'));
  expect(schliessen).toHaveBeenCalledTimes(2);
});

it('schließt bei Sperre weder über Escape noch über den Hintergrund', async () => {
  const schliessen = vi.fn();
  await zeige(schliessen, false);
  await escape();
  await klick(dom.host.querySelector('[data-overlay-aktiv]'));
  expect(schliessen).not.toHaveBeenCalled();
});

it('reagiert nach dem Schließen nicht mehr auf Escape', async () => {
  const schliessen = vi.fn();
  await zeige(schliessen);
  await act(async () => dom.root.render(<></>));
  await escape();
  expect(schliessen).not.toHaveBeenCalled();
});
