// @vitest-environment jsdom
// Mount, StrictMode und Tabschutz laufen über echte Hooks und native Dateigrenzen.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, StrictMode, useLayoutEffect, useRef } from 'react';
import { beforeEach, expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useTabGesetzBestand } from './useTabGesetzBestand';
import type { Tab } from '@/lib/domain/appTypes';
const dom = domTestWurzel();
let zugang: ReturnType<typeof useTabGesetzBestand>;
const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
function Probe() {
  const aktuell = useTabGesetzBestand(useRef<Tab[]>([]));
  useLayoutEffect(() => {
    zugang = aktuell;
  });
  return null;
}
beforeEach(() => nativeAttrappeZuruecksetzen());
it('liest beim Mount kein Gesetz und nutzt unter StrictMode nur den lebenden Einzelzugriff', async () => {
  const gelesen: string[] = [];
  io.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt/></gesetz>',
  );
  io.vorLesen = (pfad) => {
    gelesen.push(pfad);
    return undefined;
  };
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    ),
  );
  expect(gelesen).toEqual([]);
  await act(async () => expect((await zugang.ladeGesetz(referenz)).status).toBe('geladen'));
  expect(zugang.holeGeladenes(referenz)?.kurztitel).toBe('BGB');
  const laden = zugang.ladeGesetz;
  await act(async () => dom.root.render(null));
  expect(await laden(referenz)).toEqual({ status: 'nicht-lesbar', befunde: [] });
});
