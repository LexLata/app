// gesetzImportDispatch.parallel.test.ts
// Callback-Fehler bei parallelen Workern mit echtem Bundesimport; ersetzt sind
// nur Netz, Dateisystem und die native Brücke. Eigene Datei, weil Vitest 4.1.11
// gleichzeitige dynamische Importe eines ersetzten Bundesinterfaces nicht
// zuverlässig auf die Attrappe lenkt (siehe gesetzImportDispatch.test.ts).
import { io } from '@/test/suchverzeichnis/suchverzeichnisNativeAttrappe';
import { zipSync, strToU8 } from 'fflate';
import { beforeEach, expect, it, vi } from 'vitest';
import { importiereGesetze } from './gesetzImportDispatch';

const netz = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: netz.fetch }));

function bundXML(kurztitel: string): string {
  return `<dokumente doknr="${kurztitel}"><norm doknr="${kurztitel}"><metadaten><jurabk>${kurztitel}</jurabk><langue>Gesetz ${kurztitel}</langue><ausfertigung-datum>2000-01-01</ausfertigung-datum></metadaten></norm><norm doknr="${kurztitel}-1"><metadaten><enbez>§ 1</enbez></metadaten><textdaten><text><Content><P>Satz.</P></Content></text></textdaten></norm></dokumente>`;
}
function antwort(kurztitel: string) {
  return {
    ok: true,
    arrayBuffer: async () => zipSync({ 'gesetz.xml': strToU8(bundXML(kurztitel)) }).buffer,
  };
}
const freigaben: string[] = [];

beforeEach(() => {
  freigaben.length = 0;
  io.dateien.set(
    'importindizes/de-bund.xml',
    '<importindex version="1"><infos><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="gesetze-im-internet.de"/></infos><inhalt><gesetz><kurztitel>A</kurztitel><langtitel>Gesetz A</langtitel><abrufkennung>a</abrufkennung></gesetz><gesetz><kurztitel>B</kurztitel><langtitel>Gesetz B</langtitel><abrufkennung>b</abrufkennung></gesetz></inhalt></importindex>',
  );
  const original = io.invoke.getMockImplementation();
  if (!original) throw new Error('Native Attrappe ohne invoke-Implementierung');
  io.invoke.mockImplementation(async (name: string, args: { kurztitel?: string }) => {
    if (name === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
    if (name === 'gesetz_import_sperre_freigeben') freigaben.push(String(args.kurztitel));
    if (name === 'import_aktualisierung_starten') return 'vorgang';
    return original(name, args);
  });
});

it('wirft einen Callback-Fehler erst nach Abschluss aller gestarteten Worker', async () => {
  let zweitenWorkerFortsetzen!: () => void;
  const zweiterWorkerWartet = new Promise<void>((resolve) => {
    zweitenWorkerFortsetzen = resolve;
  });
  netz.fetch.mockImplementation(async (url: string) => {
    if (url.includes('/b/')) {
      await zweiterWorkerWartet;
      return antwort('B');
    }
    return antwort('A');
  });
  const fortschritt = vi.fn((kurztitel: string, status: string) => {
    if (kurztitel === 'A' && status === 'ok') throw new Error('Callback kaputt');
  });

  const lauf = importiereGesetze(['A', 'B'], 'de-bund', fortschritt);
  let beendet = false;
  void lauf
    .finally(() => {
      beendet = true;
    })
    .catch(() => {});

  await vi.waitFor(() => expect(netz.fetch).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(freigaben).toEqual(['["de-bund","a"]']));
  expect(beendet).toBe(false);

  zweitenWorkerFortsetzen();
  await expect(lauf).rejects.toThrow('Callback kaputt');
  expect(freigaben).toEqual(['["de-bund","a"]', '["de-bund","b"]']);
  expect(netz.fetch).toHaveBeenCalledTimes(2);
  expect(io.dateien.has('gesetze/A_de-bund.xml')).toBe(true);
  expect(io.dateien.has('gesetze/B_de-bund.xml')).toBe(true);
});
