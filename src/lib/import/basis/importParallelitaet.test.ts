// importParallelitaet.test.ts
// Charakterisierung der bisherigen Grenzen für HTTP und BW-Fenster.
import { expect, it, vi } from 'vitest';
import { berechneImportParallelitaet } from './importParallelitaet';
it.each([0, 1, 2, 3, 4, 8, 32])('behält Grenzen bei %s Kernen', (kerne) => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(kerne);
  expect(berechneImportParallelitaet('de-bw')).toBe(Math.max(2, Math.min(4, kerne || 4)));
  expect(berechneImportParallelitaet('de-bund')).toBe(10);
  expect(berechneImportParallelitaet()).toBe(10);
  vi.restoreAllMocks();
});
