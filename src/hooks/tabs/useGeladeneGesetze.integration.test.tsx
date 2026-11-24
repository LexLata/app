// @vitest-environment jsdom
// React-Lebensdauer des Bestands einschließlich StrictMode; nur native Grenzen sind ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, StrictMode } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useGeladeneGesetze } from './useGeladeneGesetze';
const dom = domTestWurzel();
it('hält unter StrictMode nur die Listener des aktiven Bestands und meldet sie beim Unmount ab', async () => {
  nativeAttrappeZuruecksetzen();
  let bereit: Promise<void> | undefined;
  function Probe() {
    const bestand = useGeladeneGesetze();
    bereit = bestand?.bereit;
    return <span>{bestand ? 'bereit' : 'vorbereiten'}</span>;
  }
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    ),
  );
  await act(async () => {
    await bereit;
  });
  expect(dom.host.textContent).toBe('bereit');
  await vi.waitFor(() => expect(io.listener.get('gesetze-geaendert')?.size).toBe(1));
  const loeschListener = io.listener.get('gesetze-geloescht')?.size ?? 0;
  expect(loeschListener).toBeGreaterThanOrEqual(1);
  await act(async () => dom.root.render(null));
  expect(io.listener.get('gesetze-geaendert')?.size).toBe(0);
  expect(io.listener.get('gesetze-geloescht')?.size).toBe(loeschListener - 1);
});
