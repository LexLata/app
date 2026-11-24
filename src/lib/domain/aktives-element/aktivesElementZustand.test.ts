// aktivesElementZustand.test.ts
// Prüft den öffentlichen, fensterlokalen Speichervertrag.
import { afterEach, expect, it, vi } from 'vitest';
import {
  liesSpeicherbareNorm,
  schreibeSpeicherbareNorm,
  abonniereSpeicherbareNorm,
} from './aktives-element.index';
afterEach(() => schreibeSpeicherbareNorm(null));
it('behält gleiche Snapshots und beendet Abonnements', () => {
  expect(liesSpeicherbareNorm()).toBeNull();
  const meldung = vi.fn(() => liesSpeicherbareNorm());
  const ende = abonniereSpeicherbareNorm(meldung);
  const wert = {
    gesetz: { normgeber: 'DE', kurztitel: 'BGB' },
    bezeichnung: '§ 4',
    istFavorit: false,
  };
  schreibeSpeicherbareNorm(wert);
  const snapshot = liesSpeicherbareNorm();
  expect(snapshot).toEqual(wert);
  expect(meldung).toHaveReturnedWith(snapshot);
  schreibeSpeicherbareNorm({ ...wert, gesetz: { ...wert.gesetz, kurztitel: 'bgb' } });
  expect(liesSpeicherbareNorm()).toBe(snapshot);
  expect(meldung).toHaveBeenCalledTimes(1);
  schreibeSpeicherbareNorm(null);
  expect(meldung).toHaveLastReturnedWith(null);
  ende();
  schreibeSpeicherbareNorm(wert);
  expect(meldung).toHaveBeenCalledTimes(2);
});
