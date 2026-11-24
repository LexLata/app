// Charakterisiert die Scrollanimation und ihre Anpassung an externe Scrollkorrekturen.
import { afterEach, expect, it, vi } from 'vitest';
import { animiereScrollTo } from './useGesetzSprung.animation';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('führt eine kurze Animation mit Ease-out aus und berücksichtigt externe Korrekturen', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  const start = 0;
  vi.spyOn(performance, 'now').mockReturnValue(start);
  const container = { scrollTop: 100 } as HTMLDivElement;
  const laufend = { current: null as number | null };
  const fertig = vi.fn();
  animiereScrollTo(container, 300, laufend, fertig);
  frames.shift()!(start + 90);
  expect(container.scrollTop).toBe(250);
  expect(fertig).not.toHaveBeenCalled();
  container.scrollTop += 30;
  frames.shift()!(start + 180);
  expect(container.scrollTop).toBe(330);
  expect(laufend.current).toBeNull();
  expect(fertig).toHaveBeenCalledOnce();
});

it('schließt eine Distanz unter einem Pixel ohne Frame ab', () => {
  const frame = vi.fn();
  vi.stubGlobal('requestAnimationFrame', frame);
  const fertig = vi.fn();
  animiereScrollTo({ scrollTop: 100 } as HTMLDivElement, 100.5, { current: null }, fertig);
  expect(frame).not.toHaveBeenCalled();
  expect(fertig).toHaveBeenCalledOnce();
});
