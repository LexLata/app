// @vitest-environment jsdom
// Synthetischer Erstaufbau über denselben Fensterzugriff; keine Desktop-/Tauri-Latenzmessung.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { appendFile } from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { erzeugeSuchmessungBestand } from '@/test/import/suchmessungBestand';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { useVolltextSuchtext, type VolltextSuchstand } from './useVolltextSuchtext';
const dom = domTestWurzel();
it.runIf(process.env.LEXLATA_MESSUNG === 'voll').each([28, 500])(
  'misst den ersten Suchtextaufbau für %i Gesetze',
  async (anzahl) => {
    nativeAttrappeZuruecksetzen();
    const gesetze = erzeugeSuchmessungBestand({ gesetze: anzahl, bund: 0, bw: 0, eu: 0 }).gesetze;
    let normen = 0;
    for (const [i, g] of gesetze.entries()) {
      g.kurztitel = `M${i}`;
      g.normgeber = 'de-bund';
      const normliste = g.elemente.filter((e) => e.typ === 'norm');
      normen += normliste.length;
      io.dateien.set(
        `gesetze/M${i}_de-bund.xml`,
        `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>M${i}</kurztitel></infos><inhalt>${normliste.map((_, n) => `<norm id="n${n}"><bezeichnung>§ ${n + 1}</bezeichnung><titel>Messnorm</titel><text><absatz><satz>Reproduzierbarer Gesetzestext.</satz></absatz></text></norm>`).join('')}</inhalt></gesetz>`,
      );
    }
    const eintraege = alsSuchverzeichniseintraege(gesetze);
    const bestand = erzeugeGeladeneGesetze();
    let stand: VolltextSuchstand | undefined;
    function Fenster() {
      stand = useVolltextSuchtext(eintraege, false, bestand.ladeGesetz, true);
      return null;
    }
    const start = performance.now();
    try {
      await act(async () => dom.root.render(<Fenster />));
      await vi.waitFor(
        async () => {
          await act(async () => {});
          expect(stand?.vollstaendig).toBe(true);
        },
        { timeout: 30000 },
      );
      await appendFile(
        '.reports/pruefen/phase11-messwerte.jsonl',
        JSON.stringify({
          gesetze: anzahl,
          normen,
          erstaufbauMs: performance.now() - start,
          umgebung:
            'Linux/jsdom, native Dateigrenzen im Arbeitsspeicher, echter Parser/Titelpipeline und Suchtext-Hook einschließlich kooperativer Pausen',
        }) + '\n',
      );
    } finally {
      await act(async () => dom.root.render(null));
      bestand.beenden();
    }
  },
  40000,
);
