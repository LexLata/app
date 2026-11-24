// importindexErstellungBW.parsing.test.ts
// Das Permalink-Kürzel passt zu dem Link, den der BW-Import daraus bildet (perma?j={kuerzel}_BW).
import { expect, it } from 'vitest';
import { leseGuterPermalink } from './importindexErstellungBW.parsing';

function seite(link: string) {
  return `<html><body><span id="permaElgf_1"><span class="break-uri">${link}</span></span></body></html>`;
}

it('liefert das Kürzel ohne den Zusatz _BW, den der Import wieder anhängt', () => {
  const link = 'https://www.landesrecht-bw.de/perma?j=ViehFlGDV_BW'; // normgeber-link: Permalinkform von landesrecht-bw.de.
  expect(leseGuterPermalink(seite(link))).toBe('ViehFlGDV');
});

it('liefert null ohne Permalink der gültigen Fassung', () => {
  expect(leseGuterPermalink('<html><body></body></html>')).toBeNull();
});
