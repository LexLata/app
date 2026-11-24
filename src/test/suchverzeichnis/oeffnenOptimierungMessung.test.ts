import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenOptimierungMessung.test.ts
// Isolierter, wiederholbarer Vergleich warmer Suchen ohne Zeitgrenzwerte.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { expect, it } from 'vitest';
import { berechneTreffer } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { erzeugeSuchmessungBestand } from '@/test/import/suchmessungBestand';

it.skipIf(!process.env.LEXLATA_OPTIMIERUNG)(
  'misst dieselben warmen Suchanfragen wiederholt',
  async () => {
    const bestand = erzeugeSuchmessungBestand();
    const eintraege = alsSuchverzeichniseintraege(bestand.gesetze);
    const eingaben = [
      '1',
      '1 g',
      '§ 1',
      '2',
      '23',
      '2301',
      '§ 433',
      '229 3',
      'e25',
      'g',
      'bgb',
      'datenschutz',
      '2301 pkhb',
    ];
    const faelle: { eingabe: string; aktiv: string | null }[] = eingaben.map((eingabe) => ({
      eingabe,
      aktiv: null,
    }));
    faelle.push({ eingabe: '1', aktiv: 'BGB' }, { eingabe: '23', aktiv: 'BGB' });
    const messungen = faelle.map(({ eingabe, aktiv }) => {
      const gesetz = bestand.gesetze.find((g) => g.kurztitel === aktiv) ?? null;
      const suche = () => berechneTreffer(eingabe, eintraege, gesetz, bestand.importindex);
      for (let i = 0; i < 30; i++) suche();
      const ergebnis = JSON.stringify(suche());
      const werte = Array.from({ length: 150 }, () => {
        const start = performance.now();
        const treffer = suche();
        const ms = performance.now() - start;
        expect(treffer.length).toBeLessThanOrEqual(30);
        return ms;
      });
      const sortiert = [...werte].sort((a, b) => a - b);
      return {
        eingabe,
        aktiv,
        medianMs: sortiert[75],
        p95Ms: sortiert[142],
        werte,
        ergebnisHash: createHash('sha256').update(ergebnis).digest('hex'),
      };
    });
    await mkdir('.reports/suchoptimierung', { recursive: true });
    await writeFile(
      `.reports/suchoptimierung/${process.env.LEXLATA_OPTIMIERUNG}.json`,
      JSON.stringify(
        {
          node: process.version,
          cpu: cpus()[0]?.model,
          aufwaermen: 30,
          wiederholungen: 150,
          groessen: { gesetze: 300, bund: 7000, bw: 1200, eu: 1500 },
          hinweis:
            'Isolierter Vitest-Prozess, vorhandene objektgebundene Suchcaches warm; keine Anzeigezeitpunkte, kein aktives Element, EU-Durchführungsakte aus. Synthetischer Bestand, keine WebView-Latenz.',
          messungen,
        },
        null,
        2,
      ),
    );
  },
  120000,
);
