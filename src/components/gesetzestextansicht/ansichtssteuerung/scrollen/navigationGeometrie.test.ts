// navigationGeometrie.test.ts
// Renderbereich mit Vorlauf in Pixeln an durchgerechneten Lagen.
import { parseHTML } from 'linkedom';
import { afterEach, expect, it, vi } from 'vitest';
import { renderbereichMitZiel, titelUnten } from './navigationGeometrie';

// Zwanzig Elemente à 50 px; Element i liegt bei [50·i, 50·i + 50).
const lagen = Array.from({ length: 20 }, (_, i) => ({ start: 50 * i, end: 50 * i + 50 }));
const bereich = (startIndex: number, endIndex: number) => ({
  startIndex,
  endIndex,
  overscan: 0,
  count: 20,
});

it('nimmt je Seite ganze Elemente bis etwa eine Sichthöhe hinzu', () => {
  // Sichtbereich [500, 600) = Elemente 10–11; Vorlauf je 100 px: oben bis 400, unten bis 700.
  const indices = renderbereichMitZiel(bereich(10, 11), null, {
    lagen,
    scrollOffset: 500,
    sichtHoehe: 100,
  });
  expect(indices).toEqual([8, 9, 10, 11, 12, 13]);
});

it('teilt keine Elemente und nimmt ein angeschnittenes ganz hinzu', () => {
  // Sichtbereich [520, 600), Vorlauf 80 px: oben bis 440 reicht in Element 8 [400, 450) hinein,
  // es kommt ganz hinzu; unten bis 680 beginnt Element 13 [650, 700) noch davor.
  const indices = renderbereichMitZiel(bereich(10, 11), null, {
    lagen,
    scrollOffset: 520,
    sichtHoehe: 80,
  });
  expect(indices).toEqual([8, 9, 10, 11, 12, 13]);
});

it('nimmt mindestens ein Element je Seite hinzu, ohne Geometrie oder bei Sichthöhe 0 genau eines', () => {
  const gross = Array.from({ length: 20 }, (_, i) => ({ start: 1000 * i, end: 1000 * i + 1000 }));
  expect(
    renderbereichMitZiel(bereich(5, 5), null, {
      lagen: gross,
      scrollOffset: 5000,
      sichtHoehe: 100,
    }),
  ).toEqual([4, 5, 6]);
  expect(renderbereichMitZiel(bereich(5, 6), null, null)).toEqual([4, 5, 6, 7]);
  expect(
    renderbereichMitZiel(bereich(5, 6), null, { lagen, scrollOffset: 250, sichtHoehe: 0 }),
  ).toEqual([4, 5, 6, 7]);
  // Am Rand der Liste kommt nichts hinzu.
  expect(
    renderbereichMitZiel(bereich(0, 1), null, { lagen, scrollOffset: 0, sichtHoehe: 100 }),
  ).toEqual([0, 1, 2, 3]);
});

// linkedom-DOM: Container mit Oberkante 100 im Fenster, scrollTop 300; der Bereich über der
// Titelzeile liefert das Rechteck ihres Textinhalts (Layout gibt es ohne Browser nicht).
function containerMitTitel(text: { top: number; bottom: number } | null) {
  const { window } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('document', window.document);
  const range = document.createRange();
  Object.assign(range, { selectNodeContents() {}, getBoundingClientRect: () => text });
  Object.assign(document, { createRange: () => range });
  const container = document.createElement('div');
  if (text)
    container.innerHTML = '<div data-index="3"><div class="gt-klapp-zeile">§ 3 Titel</div></div>';
  Object.defineProperties(container, {
    scrollTop: { value: 300 },
    clientTop: { value: 0 },
    getBoundingClientRect: { value: () => ({ top: 100 }) },
  });
  return container;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('misst die Unterkante des vollständigen Titeltexts in scrollTop-Koordinaten', () => {
  // Zweizeiliger Titeltext endet im Fenster bei 540 -> 300 - 100 + 540 = 740.
  expect(titelUnten(containerMitTitel({ top: 500, bottom: 540 }), 3)).toBe(740);
});

it('liefert ohne gerenderten Titel null', () => {
  expect(titelUnten(containerMitTitel(null), 3)).toBeNull();
});

it('rendert um ein Sprungziel denselben Vorlauf wie nach der Landung', () => {
  // Ziel 15 landet oben: Sicht [750, 850) = 15–16, Vorlauf oben bis 650 (13–14), unten bis 950.
  const indices = renderbereichMitZiel(bereich(0, 1), 15, {
    lagen,
    scrollOffset: 0,
    sichtHoehe: 100,
  });
  expect(indices).toEqual([0, 1, 2, 3, 13, 14, 15, 16, 17, 18]);
});
