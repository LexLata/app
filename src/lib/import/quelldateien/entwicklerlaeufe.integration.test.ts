// @vitest-environment jsdom
// entwicklerlaeufe.integration.test.ts
// Zusammenspiel der vier Entwicklerbefehle mit echtem Code und externem Speicher-/Netzfake.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import type { PraefixlaufAuftrag } from '@/lib/plattform/praefixlaufAuftrag';
const extern = vi.hoisted(() => ({ invoke: vi.fn(), fetch: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: extern.invoke }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: extern.fetch }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: async () => [],
  async readTextFile(pfad: string) {
    if (pfad.endsWith('cache/suchverzeichnis.json'))
      return JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] });
    const bw = pfad.endsWith('de-bw.xml');
    if (pfad.endsWith('europaKuratiert.json')) return '[]';
    return importindexFixture(
      bw ? 'de-bw' : 'de-bund',
      ['A', 'B', 'C']
        .map(
          (k) =>
            `<gesetz><kurztitel>${k}</kurztitel><langtitel>Gesetz ${k}</langtitel><abrufkennung>${k.toLowerCase()}</abrufkennung></gesetz>`,
        )
        .join(''),
    );
  },
}));
import { startePraefixlauf } from '@/lib/import/praefixlaufStart';
const dateien = new Map<string, string>();
const listen = new Map<string, string>();
let normgeber: 'de-bund' | 'de-bw' = 'de-bund';
let abrufe = 0;
let fehlerBeimSchreiben = '';
let defekteQuelle = false;
const quelle = (praefix = '§') =>
  `<dokumente doknr="G"><norm doknr="G"><metadaten><jurabk>A</jurabk><langue>Gesetz</langue></metadaten></norm><norm doknr="N"><metadaten><enbez>${praefix} 1</enbez><titel>Titel</titel></metadaten><textdaten><text><Content><P>Text.</P></Content></text></textdaten></norm></dokumente>`;
const bwQuelle =
  '<!DOCTYPE html><html><head><title>Landesrecht BW - A | Landesnorm Baden-Württemberg | Gesamtausgabe | Gesetz (A) vom 1. Januar 2000 | gültig ab: 2000-01-01</title></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 1 Titel</h4><p>Text.</p></div></body></html>';
async function lauf(auftrag: PraefixlaufAuftrag) {
  if (auftrag.normgeber === 'eu') throw new Error('Bund/BW-Fake');
  normgeber = auftrag.normgeber;
  const arbeit = startePraefixlauf(auftrag);
  await vi.runAllTimersAsync();
  await arbeit;
}
function b(neu = false) {
  return lauf({ modus: 'gesetzesxml', normgeber, anzahl: 3, ...(neu ? { neu } : {}) });
}
function a() {
  return lauf({ modus: 'quelldateien', normgeber, anzahl: 3 });
}
function standard(gescheitert = false) {
  return lauf({ modus: 'praefix', normgeber, anzahl: 3, gescheitert });
}
function c() {
  return lauf({ modus: 'auswerten', normgeber });
}
const schreibungen = () =>
  extern.invoke.mock.calls.filter(
    ([b, args]) => b === 'praefixlauf_arbeitsdatei_schreiben' && args?.art === 'gesetzesxml',
  ).length;
const bericht = () =>
  extern.invoke.mock.calls.filter(([b]) => b === 'praefixlauf_bericht_schreiben').at(-1)?.[1]
    .inhalt;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  dateien.clear();
  listen.clear();
  normgeber = 'de-bund';
  abrufe = 0;
  fehlerBeimSchreiben = '';
  defekteQuelle = false;
  extern.invoke.mockImplementation(
    async (
      befehl: string,
      args?: { art?: string; kurztitel?: string; inhalt?: string; xml?: string },
    ) => {
      const key = `${normgeber}/${args?.art}/${args?.kurztitel}`;
      if (befehl === 'praefixlauf_dateistand') {
        const titel = (art: string) =>
          [...dateien.keys()]
            .filter((k) => k.startsWith(`${normgeber}/${art}/`))
            .map((k) => k.split('/')[2]);
        return {
          quellen: titel('quelle'),
          gesetzesxml: titel('gesetzesxml'),
          original: [],
          konsolidiert: [],
        };
      }
      if (befehl === 'praefixlauf_datei_lesen') return listen.get(normgeber) ?? null;
      if (befehl === 'praefixlauf_datei_schreiben' && args?.xml) {
        listen.set(normgeber, args.xml);
        return;
      }
      if (befehl === 'praefixlauf_arbeitsdatei_lesen') return dateien.get(key) ?? null;
      if (befehl === 'praefixlauf_arbeitsdatei_loeschen') {
        dateien.delete(key);
        return;
      }
      if (befehl === 'praefixlauf_arbeitsdatei_schreiben' && args?.inhalt !== undefined) {
        if (args.art === fehlerBeimSchreiben) throw new Error('Simulierter Schreibabbruch');
        dateien.set(key, args.inhalt);
        return;
      }
      if (befehl === 'lade_gesetz_html_bw') {
        abrufe++;
        return bwQuelle;
      }
      if (befehl === 'praefixlauf_bericht_schreiben') return 'bericht.txt';
      if (befehl === 'app_daten_basis_pfad') return '/daten';
    },
  );
  extern.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith('.zip')) abrufe++;
    const zip = zipSync({ 'gesetz.xml': strToU8(defekteQuelle ? '<dokumente/>' : quelle()) });
    return new Response(zip, { headers: { 'content-type': 'application/zip' } });
  });
});
afterEach(() => vi.useRealTimers());
it('verbindet a), b), Standardlauf und c) für drei Gesetze ohne weitere Abrufe', async () => {
  await a();
  expect(abrufe).toBe(3);
  expect(schreibungen()).toBe(3);
  await b();
  expect(schreibungen()).toBe(3);
  await standard();
  expect(abrufe).toBe(3);
  expect(schreibungen()).toBe(6);
  const liste = listen.get('de-bund');
  expect(liste).toContain('<gesetz>A</gesetz>');
  await c();
  expect(abrufe).toBe(3);
  expect(listen.get('de-bund')).toBe(liste);
});
it('lädt nur die gelöschte Quelle neu und erzeugt fehlendes XML sowie geänderte Befunde offline', async () => {
  await a();
  dateien.delete('de-bund/quelle/B');
  await standard();
  expect(abrufe).toBe(4);
  dateien.delete('de-bund/gesetzesxml/C');
  await b();
  expect(dateien.has('de-bund/gesetzesxml/C')).toBe(true);
  expect(abrufe).toBe(4);
  // Ein früherer Importer hinterließ einen abweichenden Befund; die gespeicherte Quelle bleibt gleich.
  const bisher = dateien.get('de-bund/gesetzesxml/A');
  if (!bisher) throw new Error('GesetzesXML fehlt');
  dateien.set(
    'de-bund/gesetzesxml/A',
    bisher.replace('<bezeichnung>§ 1</bezeichnung>', '<bezeichnung>Art. 1</bezeichnung>'),
  );
  await c();
  expect(listen.get('de-bund')).toContain('praefixstruktur="artikel"');
  await b(true);
  await c();
  expect(listen.get('de-bund')).not.toContain('praefixstruktur="artikel"');
  expect(listen.get('de-bund')).toContain('<gesetz>A</gesetz>');
  expect(abrufe).toBe(4);
});
it('behält nach Gesetzfehler die Quelle und erzeugt nach Behebung das fehlende XML ohne Netz', async () => {
  await a();
  defekteQuelle = true;
  await lauf({
    modus: 'quelldateien',
    normgeber: 'de-bund',
    anzahl: 1,
    kurztitel: ['A'],
    neu: true,
  });
  expect(dateien.has('de-bund/gesetzesxml/A')).toBe(false);
  expect(dateien.get('de-bund/quelle/A')).toBe('<dokumente/>');
  expect(bericht()).toContain('GesetzesXML gelöscht');
  expect(bericht()).toContain('Quelldatei bleibt gespeichert');
  const vorher = abrufe;
  dateien.set('de-bund/quelle/A', quelle());
  await b();
  expect(dateien.has('de-bund/gesetzesxml/A')).toBe(true);
  expect(abrufe).toBe(vorher);
});
it('lädt gescheiterte Gesetze neu und bearbeitet vorhandene Quellen ohne Netzprüfung oder Wartezeit', async () => {
  defekteQuelle = true;
  await standard();
  expect(abrufe).toBe(3);
  expect(listen.get('de-bund')).toContain('gescheitert');
  defekteQuelle = false;
  await standard(true);
  expect(abrufe).toBe(6);
  listen.delete('de-bund');
  extern.fetch.mockClear();
  extern.invoke.mockClear();
  const vorher = Date.now();
  await standard();
  expect(Date.now()).toBe(vorher);
  expect(extern.fetch).not.toHaveBeenCalled();
});
it.each(['de-bund', 'de-bw'] as const)(
  'nimmt %s nach Quellschreibung und vor XML-Schreibung offline wieder auf',
  async (n) => {
    normgeber = n;
    fehlerBeimSchreiben = 'gesetzesxml';
    await a();
    expect(dateien.has(`${n}/quelle/A`)).toBe(true);
    expect(dateien.has(`${n}/gesetzesxml/A`)).toBe(false);
    const vorher = abrufe;
    fehlerBeimSchreiben = '';
    await b();
    expect(dateien.has(`${n}/gesetzesxml/A`)).toBe(true);
    expect(abrufe).toBe(vorher);
  },
);
it.each(['de-bund', 'de-bw'] as const)(
  'erhält bei a), b) und c) die Listen des jeweils anderen Normgebers (%s)',
  async (n) => {
    normgeber = n;
    await standard();
    const eigene = listen.get(n);
    if (!eigene) throw new Error('Liste fehlt');
    const anderer = n === 'de-bund' ? 'de-bw' : 'de-bund';
    listen.set(anderer, 'Unveränderte andere Liste');
    await lauf({ modus: 'quelldateien', normgeber: n, anzahl: 1, kurztitel: ['A'] });
    await b(true);
    expect(listen.get(n)).toBe(eigene);
    await c();
    expect(listen.get(anderer)).toBe('Unveränderte andere Liste');
  },
);

it('liefert für alle Läufe kompakte Ergebnisse und nachvollziehbare Statusphasen an das Terminal', async () => {
  await a();
  for (const ausfuehren of [() => b(true), () => standard(), () => c()]) {
    extern.invoke.mockClear();
    await ausfuehren();
    const meldungen = extern.invoke.mock.calls
      .filter(([befehl]) => befehl === 'praefixlauf_ausgabe')
      .map(([, args]) => args);
    expect(meldungen[0]).toEqual({ art: 'status', zeile: 'Vorbereitung …' });
    expect(meldungen).toContainEqual({
      art: 'status',
      zeile: 'Abgeschlossen: 3 · erfolgreich: 3 · fehlgeschlagen: 0 · aktiv: 0',
    });
    expect(meldungen).toContainEqual({ art: 'status', zeile: 'Bericht schreiben …' });
    expect(meldungen.at(-1)).toEqual({ art: 'status', zeile: 'Beendet.' });
    expect(meldungen.filter((m) => m.art === 'ergebnis' && /^[ABC]:/.test(m.zeile))).toHaveLength(
      3,
    );
    expect(
      meldungen.filter((m) => m.art === 'ergebnis').some((m) => m.zeile.includes('Beginn')),
    ).toBe(false);
  }
});
it('hält Gesetzfehler als Ergebnis sichtbar und zählt sie als abgearbeitet', async () => {
  defekteQuelle = true;
  await a();
  const meldungen = extern.invoke.mock.calls
    .filter(([befehl]) => befehl === 'praefixlauf_ausgabe')
    .map(([, args]) => args);
  expect(meldungen).toContainEqual({
    art: 'status',
    zeile: 'Abgeschlossen: 3 · erfolgreich: 0 · fehlgeschlagen: 3 · aktiv: 0',
  });
  expect(meldungen.filter((m) => m.art === 'ergebnis' && /^[ABC]:/.test(m.zeile))).toHaveLength(3);
  expect(
    meldungen.some(
      (m) => m.art === 'ergebnis' && m.zeile.includes('Quelldatei bleibt gespeichert'),
    ),
  ).toBe(true);
});
