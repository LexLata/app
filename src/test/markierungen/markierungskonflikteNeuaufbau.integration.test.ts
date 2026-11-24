// @vitest-environment jsdom
// Abgeleiteten Altbestand über echte Prüfung und Internetimport neu aufbauen.
import { io, vorbereiten } from '@/test/import/gemischterZipNativeAttrappe';
import { zipSync, strToU8 } from 'fflate';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  initialisiereMarkierungen,
  bereiteMarkierungsStartPruefungVor,
  pruefeMarkierungenBeimStart,
} from '@/lib/markierungen/markierungen.index';
import { importiereGesetze } from '@/lib/import/import.index';
const netz = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: netz.fetch }));
const datei = 'markierungskonflikte.xml';
const alt =
  '<markierungskonflikte pruefstatus="aktuell"><gesetz kurztitel="BGB" normgeber="Bund"><konflikt typ="gesetz-fehlt"/></gesetz></markierungskonflikte>'; // normgeber-negativ: alter abgeleiteter Prüfstand muss neu aufgebaut werden.
beforeEach(() => {
  vorbereiten();
  initialisiereMarkierungen();
  io.dateien.set(datei, alt);
});
it('sichert alte Normgeberbefunde und baut den Prüfstand automatisch neu auf', async () => {
  await bereiteMarkierungsStartPruefungVor();
  await expect(pruefeMarkierungenBeimStart()).resolves.toBeUndefined();
  expect(io.dateien.get(datei + '.sicherung')).toBe(alt);
  const neu = new DOMParser().parseFromString(io.dateien.get(datei) ?? '', 'application/xml');
  expect(neu.documentElement.getAttribute('pruefstatus')).toBe('aktuell');
  expect(neu.querySelectorAll('gesetz')).toHaveLength(0);
  expect(io.vollbedarf).toBe(false);
});
it('importiert BGB aus dem Internet trotz alter Konfliktdatei und schließt die Prüfung ab', async () => {
  io.dateien.set(
    'importindizes/de-bund.xml',
    '<importindex version="1"><infos><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung>bgb</abrufkennung></gesetz></inhalt></importindex>',
  );
  const quelle =
    '<dokumente doknr="gesetz"><norm doknr="gesetz"><metadaten><jurabk>BGB</jurabk><langue>Bürgerliches Gesetzbuch</langue></metadaten></norm><norm doknr="norm"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Ein erster Satz.</P></Content></text></textdaten></norm></dokumente>';
  netz.fetch.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => zipSync({ 'bgb.xml': strToU8(quelle) }).buffer,
  });
  const ergebnis = await importiereGesetze(['BGB'], 'de-bund');
  expect(ergebnis.fehlgeschlagene).toEqual([]);
  expect(ergebnis.erfolgreiche).toEqual([
    expect.objectContaining({ kurztitel: 'BGB', normgeber: 'de-bund' }),
  ]);
  expect(io.dateien.get('gesetze/BGB_de-bund.xml')).toContain('<normgeber>de-bund</normgeber>');
  expect(io.dateien.get(datei + '.sicherung')).toBe(alt);
  await vi.waitFor(() => expect(io.dateien.get(datei)).toContain('pruefstatus="aktuell"'));
  expect(io.quellen.size).toBe(0);
  expect(io.pruefungen.size).toBe(0);
  expect(io.vollbedarf).toBe(false);
});
