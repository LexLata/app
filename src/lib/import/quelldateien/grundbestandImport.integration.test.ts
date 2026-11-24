// @vitest-environment jsdom
// grundbestandImport.integration.test.ts
// P2-A3: Das GesetzesXML des Quelldateienlaufs, wie es in `grundbestand/` landet, wird über den Datei-Import installiert.
import { io, vorbereiten } from '@/test/import/gemischterZipNativeAttrappe';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  initialisiereMarkierungen,
  pruefeAlleMarkierungen,
} from '@/lib/markierungen/markierungen.index';
import { zipSync, strToU8 } from 'fflate';
import { importindexFixture } from '@/test/import/europaImportFixtures';
const netz = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: netz.fetch }));
import { startePraefixlauf } from '@/lib/import/praefixlaufStart';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { ladeGesetzBestand } from '@/test/tabs/gesetzBestandAbschluss';

const quelle =
  '<dokumente doknr="G"><norm doknr="G"><metadaten><jurabk>G 10</jurabk><langue>Artikel 10-Gesetz</langue></metadaten></norm><norm doknr="N"><metadaten><enbez>§ 1</enbez><titel>Gegenstand</titel></metadaten><textdaten><text><Content><P>Beispieltext.</P></Content></text></textdaten></norm></dokumente>';
const index = importindexFixture(
  'de-bund',
  '<gesetz><kurztitel>G 10</kurztitel><langtitel>Artikel 10-Gesetz</langtitel><abrufkennung>g10</abrufkennung></gesetz>',
);
/** Arbeitsdateien und Ausgabeordner der Rust-Seite. */
const arbeitsdateien = new Map<string, string>();
afterEach(async () => {
  await pruefeAlleMarkierungen();
});
beforeEach(() => {
  vorbereiten();
  initialisiereMarkierungen();
  arbeitsdateien.clear();
  for (const pfad of ['resources/importindizes/de-bund.xml', 'importindizes/de-bund.xml'])
    io.dateien.set(pfad, index);
  const app = io.invoke.getMockImplementation();
  if (!app) throw new Error('Native Attrappe fehlt');
  io.invoke.mockImplementation(
    async (befehl: string, args: { art?: string; kurztitel?: string; inhalt?: string }) => {
      const key = `${args?.art}/${args?.kurztitel}`;
      if (befehl === 'praefixlauf_dateistand') {
        const titel = (art: string) =>
          [...arbeitsdateien.keys()]
            .filter((k) => k.startsWith(`${art}/`))
            .map((k) => k.slice(art.length + 1));
        return { quellen: titel('quelle'), gesetzesxml: titel('gesetzesxml') };
      }
      if (befehl === 'praefixlauf_arbeitsdatei_lesen') return arbeitsdateien.get(key) ?? null;
      if (befehl === 'praefixlauf_arbeitsdatei_loeschen') return void arbeitsdateien.delete(key);
      if (befehl === 'praefixlauf_arbeitsdatei_schreiben')
        return void arbeitsdateien.set(key, String(args.inhalt));
      if (befehl === 'praefixlauf_bericht_schreiben') return 'bericht.txt';
      if (befehl.startsWith('praefixlauf_')) return undefined;
      return app(befehl, args);
    },
  );
  netz.fetch.mockImplementation(async () => {
    const zip = zipSync({ 'g10.xml': strToU8(quelle) });
    return new Response(zip, { headers: { 'content-type': 'application/zip' } });
  });
});

it('P2-A3: die erzeugte Datei wird ohne Konflikt und Importfehler als Gesetz installiert', async () => {
  vi.useFakeTimers();
  const lauf = startePraefixlauf({
    modus: 'quelldateien',
    normgeber: 'de-bund',
    anzahl: 1,
    kurztitel: ['G 10'],
  });
  await vi.runAllTimersAsync();
  await lauf;
  vi.useRealTimers();
  expect(io.invoke).toHaveBeenCalledWith('praefixlauf_beenden', { code: 0 });
  // Das Startskript kopiert diese Arbeitsdatei unverändert als `G 10_de-bund.xml`.
  const xml = arbeitsdateien.get('gesetzesxml/G 10');
  if (!xml) throw new Error(`GesetzesXML fehlt: ${[...arbeitsdateien.keys()].join(', ')}`);

  io.dateien.set('/import/G 10_de-bund.xml', xml);
  const ergebnis = await importierePfade(['/import/G 10_de-bund.xml']);
  expect(ergebnis.fehler).toEqual([]);
  expect(ergebnis.konflikte).toEqual([]);
  expect(ergebnis.berichtEintraege).toEqual([
    expect.objectContaining({ kategorie: 'gesetz', aktion: 'neu', meldungen: [] }),
  ]);
  expect(io.dateien.get('gesetze/G 10_de-bund.xml')).toContain('Beispieltext.');
  expect((await ladeGesetzBestand()).liste).toEqual(
    expect.arrayContaining([expect.objectContaining({ kurztitel: 'G 10', normgeber: 'de-bund' })]),
  );
});
