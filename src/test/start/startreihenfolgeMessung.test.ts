// @vitest-environment jsdom
// Technischer 28/500-Vergleich mit synthetischem XML und nativen I/O-Attrappen; kein Desktopstart.
import { startaufgabenGrenze } from './startaufgabenNativeGrenze';
import { expect, it } from 'vitest';
import { leiteSuchverzeichniseintragAb } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { erzeugeSuchmessungBestand } from '@/test/import/suchmessungBestand';
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
it.runIf(process.env.LEXLATA_MESSUNG === 'phase15')(
  'misst Cache, Stempelvergleich und Einzelzugriff getrennt von der offenen Desktopabnahme',
  async () => {
    const messungen = [];
    for (const anzahl of [28, 500]) {
      const n = startaufgabenGrenze();
      const gesetze = erzeugeSuchmessungBestand({ gesetze: anzahl, bund: 0, bw: 0, eu: 0 }).gesetze;
      for (const g of gesetze) {
        const normen = g.elemente.flatMap((e) => (e.typ === 'norm' ? [e.data] : []));
        n.dateien.set(
          `gesetze/${g.kurztitel}_${g.normgeber}.xml`,
          `<gesetz><infos><kurztitel>${escape(g.kurztitel)}</kurztitel><normgeber>${g.normgeber}</normgeber></infos><inhalt>${normen.map((norm, i) => `<norm id="p${i + 1}"><bezeichnung>${escape(norm.bezeichnung)}</bezeichnung><titel>Messtitel</titel><text><absatz>Synthetischer Inhalt</absatz></text></norm>`).join('')}</inhalt></gesetz>`,
        );
      }
      // Vollständiger synthetischer Cache für die isolierte Einlesemessung;
      // kein Parser-/Erstabgleich-Benchmark und keine Desktopmessung.
      n.dateien.set(
        'cache/suchverzeichnis.json',
        JSON.stringify({
          version: 1,
          abgeglichen: true,
          eintraege: gesetze.map((g) =>
            leiteSuchverzeichniseintragAb(g, {
              groesse: String(n.dateien.get(`gesetze/${g.kurztitel}_${g.normgeber}.xml`)?.length),
              aenderungszeit: '1',
            }),
          ),
        }),
      );
      const a = await n.kontext('main');
      const cacheBytes = new TextEncoder().encode(
        n.dateien.get('cache/suchverzeichnis.json'),
      ).length;
      let start = performance.now();
      const stand = await a.persistenz.leseSuchverzeichnis();
      const cacheLesenMs = performance.now() - start;
      start = performance.now();
      expect((await a.persistenz.vergleicheSuchverzeichnisDateistempel()).aktuell).toBe(true);
      const stempelvergleichMs = performance.now() - start;
      const einzelladenMs = [];
      for (const fenster of [a, await n.kontext('zweites')]) {
        const bestand = fenster.laden.erzeugeGeladeneGesetze();
        start = performance.now();
        const referenz = gesetze[1];
        if (!referenz) throw new Error('Messreferenz fehlt');
        expect((await bestand.ladeGesetz(referenz)).status).toBe('geladen');
        einzelladenMs.push(performance.now() - start);
        bestand.beenden();
      }
      messungen.push({
        gesetze: anzahl,
        normen: stand.eintraege.reduce(
          (summe, e) => summe + (e.status === 'in-ordnung' ? e.normen.length : 0),
          0,
        ),
        cacheBytes,
        cacheLesenMs,
        stempelvergleichMs,
        einzelladenMs,
      });
    }
    const fs = await import('node:fs/promises');
    await fs.mkdir('.reports/messungen', { recursive: true });
    await fs.writeFile(
      '.reports/messungen/laden-bei-bedarf-phase15.json',
      JSON.stringify(
        {
          grenze:
            'Ein Lauf je Größe, synthetisches XML, JSdom, native I/O-Attrappen. Keine Erstabgleich- oder WebView-Long-Task-Messung. Kein Nachweis der Desktop-10%-Messlatte.',
          messungen,
        },
        null,
        2,
      ),
    );
  },
);
