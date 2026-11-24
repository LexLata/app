// @vitest-environment jsdom
// Fassungsrückfall über gemeinsame Suchauswahl und Öffnen-Link bis Banner und gespeichertem InfoOverlay.
import { MELDUNGSGRUND_HINWEIS } from '@/lib/domain/app/aktionsMeldung';
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { readFileSync } from 'node:fs';
import { europaRessourceFixture } from '@/test/import/europaImportFixtures';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { sucheKandidatenAlleQuellen } from '@/lib/import/import.index';
import { useOeffnenAuswahl } from '@/hooks/useOeffnenAuswahl';
import { useOeffnenLinkNavigation } from '@/hooks/fenster/useOeffnenLinkNavigation';
import { parseSuchanfrage } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { ladeGesetzBestand } from '@/test/tabs/gesetzBestandAbschluss';

import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { GesetzInfoOverlay } from './GesetzInfoOverlay';
const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: http.fetch }));
const wurzeln: Root[] = [];
beforeEach(() => {
  aufbau.bereiteNativeAttrappeVor();
  alleBannerSchliessen();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  for (const resource of [
    'importindizes/eu.xml',
    'importindizes/de-bund.xml',
    'importindizes/de-bw.xml',
    'europa/europaKuratiert.json',
  ]) {
    aufbau.native.texte.set(`/ressourcen/resources/${resource}`, europaRessourceFixture(resource));
    if (resource.startsWith('importindizes/')) {
      aufbau.native.texte.set(aufbau.basis + resource, europaRessourceFixture(resource));
    }
  }
});
afterEach(async () => {
  await aufbau.raeumeTestFensterAuf(wurzeln);
  alleBannerSchliessen();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
for (const einstieg of ['Öffnen-Overlay', 'Öffnen-Link']) {
  for (const wahl of ['original', 'konsolidiert'] as const) {
    it(`${einstieg}: ${wahl} fällt einmal zurück, öffnet direkt und zeigt nach Neuladen die tatsächliche Fassung`, async () => {
      localStorage.setItem('lexlata.euFassung', wahl);
      const original = wahl === 'konsolidiert';
      const titel = original ? 'GRCh' : 'AEUV';
      const basis = original ? '12016P/TXT' : '12016E/TXT';
      const celex = original ? '02016P/TXT-20091201' : '02016E/TXT-20250315';
      const datum = original ? '2009-12-01' : '2025-03-15';
      const abrufe: string[] = [];
      http.fetch.mockImplementation(async (url: string) => {
        if (url.includes('/sparql?'))
          return Response.json({
            results: { bindings: [{ kons: { value: celex }, datum: { value: datum } }] },
          });
        const angefragt = decodeURIComponent(url.split('/celex/')[1]!);
        abrufe.push(angefragt);
        expect(getSnapshot().filter((b) => b.text.includes(' importiert.'))).toHaveLength(0);
        if (angefragt === (original ? celex : basis)) return new Response(null, { status: 406 });
        const datei = original ? '12016P%2FTXT' : '02016E%2FTXT-20250315';
        return new Response(
          new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${datei}.fmx4`)),
          { headers: { 'content-type': 'application/zip' } },
        );
      });
      const host = document.createElement('div');
      document.body.append(host);
      const root = createRoot(host);
      wurzeln.push(root);
      let auswahl!: ReturnType<typeof useOeffnenAuswahl>;
      let oeffnenLink!: ReturnType<typeof useOeffnenLinkNavigation>;
      const fehler = vi.fn();
      function Anbindung() {
        auswahl = useOeffnenAuswahl();
        oeffnenLink = useOeffnenLinkNavigation({
          importindexVorbereitungRef: { current: Promise.resolve() },
          zeigeSuchfehler: fehler,
        });
        return null;
      }
      await act(async () => root.render(<Anbindung />));
      const oeffnen = vi.fn();
      if (einstieg === 'Öffnen-Link') {
        const kandidaten = await sucheKandidatenAlleQuellen();
        expect(kandidaten.eu.map((e) => e.kurztitel)).toContain(titel);
        expect(
          await oeffnenLink(
            { type: 'oeffnen', suchtext: titel },

            async () => true,
            oeffnen,
          ),
        ).toBe(true);
      } else {
        const ergebnis = await auswahl(
          {
            art: 'index',
            quelle: 'eu',
            eintrag: { kurztitel: titel, langtitel: titel, abrufkennung: basis, normgeber: 'eu' },
          },
          parseSuchanfrage(titel),
        );
        expect(ergebnis.gesetz).toBeDefined();
        oeffnen(ergebnis);
      }
      expect(fehler).not.toHaveBeenCalled();
      expect(oeffnen).toHaveBeenCalledOnce();
      expect(abrufe).toEqual(original ? [celex, basis] : [basis, celex]);
      // Ein Banner nennt das importierte Gesetz mit der tatsächlichen Fassung als Hinweis.
      const namen = getSnapshot().flatMap(
        (b) => b.gliederung?.kategorien.flatMap((k) => k.gruppen.flatMap((g) => g.namen)) ?? [],
      );
      expect(namen.filter((n) => n.name === titel)).toEqual([
        {
          name: titel,
          hinweise: [
            MELDUNGSGRUND_HINWEIS[
              original ? 'euOriginalStattKonsolidiert' : 'euKonsolidiertStattOriginal'
            ],
          ],
        },
      ]);
      const [geladen] = (await ladeGesetzBestand()).liste;
      const fassung = original
        ? 'Originaltext'
        : 'Konsolidierte Fassung vom 15.03.2025 (keine Rechtswirkung)';
      expect(geladen!.fassung).toEqual({
        art: original ? 'original' : 'konsolidiert',
        stichtag: original ? undefined : '2025-03-15',
        erwaegungsgruendeErgaenzt: undefined,
      });
      expect(geladen!.datenquelle?.url).toContain(original ? basis : celex);
      expect(geladen?.fundstelle).toBe(
        original ? 'ABl. C 202 vom 7.6.2016, S. 389' : 'ABl. C 202 vom 7.6.2016, S. 47',
      );
      await act(async () =>
        root.render(<GesetzInfoOverlay gesetz={geladen!} onSchliessen={() => {}} />),
      );
      expect(host.textContent).toContain(fassung);
      // Das InfoOverlay erzeugt kein weiteres Ergebnisbanner.
      expect(getSnapshot().filter((b) => b.art === 'vorgangsergebnis')).toHaveLength(1);
    }, 30_000);
  }
}
