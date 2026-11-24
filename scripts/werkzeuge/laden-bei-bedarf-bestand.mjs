// Erzeugt getrennte Messbestände; vorhandene Zielordner werden niemals überschrieben.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { DOMParser } from 'linkedom';

const sha256 = (inhalt) => createHash('sha256').update(inhalt).digest('hex');

export async function erzeugeMessbestand(quelle, ausgabe) {
  const namen = (await readdir(quelle)).filter((name) => name.endsWith('.xml')).sort();
  if (!namen.length) throw new Error('Im Quellordner liegen keine GesetzesXML-Dateien.');
  const vorlagen = [];
  for (const name of namen) {
    const xml = await readFile(join(quelle, name), 'utf8');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const infos = doc.querySelector('gesetz > infos');
    const normgeber = infos?.querySelector('normgeber')?.textContent;
    if (!infos?.querySelector('kurztitel') || !/^[a-z][a-z0-9-]*$/.test(normgeber ?? ''))
      throw new Error(`Keine geeignete Gesetzesvorlage: ${name}`);
    vorlagen.push({ name, xml, normgeber });
  }
  // Absichtlich ohne recursive: auch ein leerer vorhandener Ordner ist geschützt.
  await mkdir(ausgabe);
  const manifest = {
    version: 1,
    hinweis:
      'Vervielfältigte Gesetze, nur Kurztitel geändert. Verweise können auf Originale zeigen.',
    quellen: vorlagen.map(({ name, xml }) => ({ name, sha256: sha256(xml) })),
    bestaende: [],
  };
  for (const anzahl of [28, 500]) {
    const ordner = join(ausgabe, String(anzahl), 'gesetze');
    await mkdir(ordner, { recursive: true });
    const dateien = [];
    for (let i = 0; i < anzahl; i++) {
      const vorlage = vorlagen[i % vorlagen.length];
      const doc = new DOMParser().parseFromString(vorlage.xml, 'text/xml');
      const kurztitel = `MessG${String(i + 1).padStart(4, '0')}`;
      doc.querySelector('gesetz > infos > kurztitel').textContent = kurztitel;
      const xml = doc.toString();
      const name = `${kurztitel}_${vorlage.normgeber}.xml`;
      await writeFile(join(ordner, name), xml, { flag: 'wx' });
      dateien.push({
        name,
        vorlage: vorlage.name,
        bytes: Buffer.byteLength(xml),
        sha256: sha256(xml),
      });
    }
    manifest.bestaende.push({ anzahl, dateien });
  }
  await writeFile(join(ausgabe, 'manifest.json'), JSON.stringify(manifest, null, 2), {
    flag: 'wx',
  });
  for (const anzahl of [28, 500])
    await writeFile(
      join(ausgabe, String(anzahl), 'messbestand.json'),
      JSON.stringify(manifest, null, 2),
      { flag: 'wx' },
    );
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [quelle, ausgabe] = process.argv.slice(2);
  if (!quelle || !ausgabe) {
    console.error(
      'Aufruf: node scripts/werkzeuge/laden-bei-bedarf-bestand.mjs QUELLORDNER NEUER_ZIELORDNER',
    );
    process.exitCode = 1;
  } else {
    await erzeugeMessbestand(resolve(quelle), resolve(ausgabe));
    console.info(`Messbestände 28 und 500 samt manifest.json erzeugt: ${resolve(ausgabe)}`);
  }
}
