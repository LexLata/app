// Geometriegrenzen des eigenen Fensters einschließlich nativer Titelleiste.
import { assert, expect, it } from 'vitest';
import { istImEigenenFenster } from './useTabDragUndReihenfolge';
it('verbindet Webansicht und skaliertes Außenrechteck einschließlich aller Ränder', () => {
  const fenster = { label: 'main', x: 200, y: 100, breite: 400, hoehe: 600 };
  for (const [screenX, screenY] of [
    [100, 50],
    [300, 350],
    [100, 350],
    [300, 50],
  ]) {
    assert(screenX !== undefined && screenY !== undefined);
    expect(
      istImEigenenFenster({ clientX: -1, clientY: -1, screenX, screenY }, 800, 600, fenster, 2),
    ).toBe(true);
  }
  for (const [screenX, screenY] of [
    [99.9, 50],
    [300.1, 350],
    [100, 49.9],
    [100, 350.1],
  ]) {
    assert(screenX !== undefined && screenY !== undefined);
    expect(
      istImEigenenFenster({ clientX: -1, clientY: -1, screenX, screenY }, 800, 600, fenster, 2),
    ).toBe(false);
  }
  expect(
    istImEigenenFenster(
      { clientX: 0, clientY: 600, screenX: -500, screenY: -500 },
      800,
      600,
      undefined,
      2,
    ),
  ).toBe(true);
  expect(
    istImEigenenFenster(
      { clientX: 800, clientY: 0, screenX: -500, screenY: -500 },
      800,
      600,
      undefined,
      2,
    ),
  ).toBe(true);
  expect(
    istImEigenenFenster(
      { clientX: -1, clientY: -1, screenX: 100, screenY: 50 },
      800,
      600,
      undefined,
      2,
    ),
  ).toBe(false);
});
