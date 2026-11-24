// @vitest-environment jsdom
// EinstellungenFenster.leistenTauschen.test.tsx
// Bedienung mit echten Einstellungen und Hauptfenster-Darstellung; nur native Grenzen ersetzt.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import EinstellungenFenster from './EinstellungenFenster';
import { useHauptfensterDarstellung } from '@/hooks/useHauptfensterDarstellung';

const dom = domTestWurzel();
let hauptfensterWert: boolean;
function HauptfensterProbe() {
  const { leistenTauschen } = useHauptfensterDarstellung();
  useEffect(() => {
    hauptfensterWert = leistenTauschen;
  });
  return null;
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
it('bietet Leisten tauschen zuletzt unter Seitenleisten an und überträgt die Änderung ins offene Hauptfenster', async () => {
  await act(async () =>
    dom.root.render(
      <>
        <EinstellungenFenster />
        <HauptfensterProbe />
      </>,
    ),
  );
  const label = [...dom.host.querySelectorAll('label')].find((element) =>
    element.textContent?.includes('Leisten tauschen: Favoriten links, Lesezeichen rechts'),
  );
  expect(label).toBeDefined();
  const checkbox = label?.querySelector('input');
  expect(checkbox?.checked).toBe(false);
  expect(hauptfensterWert).toBe(false);
  expect(label?.nextElementSibling?.textContent).toContain('Kopieren von Zitaten');
  await act(async () => checkbox?.click());
  expect(localStorage.getItem('lexlata.leistenTauschen')).toBe('true');
  // Der Browser liefert dieses Ereignis nur an die anderen offenen Fenster.
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'lexlata.leistenTauschen',
        newValue: localStorage.getItem('lexlata.leistenTauschen'),
      }),
    ),
  );
  expect(hauptfensterWert).toBe(true);
});
