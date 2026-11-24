// Prüft echte, deterministische Messdateien und den Schutz vorhandener Ordner.
import { it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { erzeugeMessbestand } from './laden-bei-bedarf-bestand.mjs';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';

it('vervielfältigt vorhandene Gesetze reproduzierbar in 28 und 500 lesbare Dateien', async () => {
  const basis = await mkdtemp(join(tmpdir(), 'lexlata-bestand-'));
  try {
    const quelle = join(basis, 'quelle');
    await mkdir(quelle);
    await writeFile(
      join(quelle, 'vorlage.xml'),
      await readFile('docs/doku/testdaten/mkn-gesetz.xml'),
    );
    const ziel = join(basis, 'messung');
    const manifest = await erzeugeMessbestand(quelle, ziel);
    expect(manifest.bestaende.map((b) => b.dateien.length)).toEqual([28, 500]);
    const klein = await readFile(join(ziel, '28/gesetze/MessG0001_de-bund.xml'), 'utf8');
    const gross = await readFile(join(ziel, '500/gesetze/MessG0001_de-bund.xml'), 'utf8');
    expect(klein).toBe(gross);
    const gesetz = parseGesetzesXML(klein);
    expect(gesetz.kurztitel).toBe('MessG0001');
    expect(gesetz.elemente.filter((e) => e.typ === 'norm')).toHaveLength(10);
    await expect(erzeugeMessbestand(quelle, ziel)).rejects.toThrow();
    expect(await readFile(join(ziel, '28/gesetze/MessG0001_de-bund.xml'), 'utf8')).toBe(klein);
  } finally {
    await rm(basis, { recursive: true, force: true });
  }
});
