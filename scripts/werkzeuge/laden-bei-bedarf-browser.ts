import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
// Manuell geladenes Entwicklungswerkzeug; schreibt nur seine eigene Messdatei.
import {
  appDatenLesen,
  appDatenOrdnerLesen,
  appDatenSchreiben,
  mitDateiSperre,
} from '@/lib/persistenz/kern/kern.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { leiteSuchverzeichniseintragAb } from '@/lib/domain/app/oeffnen/oeffnen.index';

interface Messdatei {
  name: string;
  bytes: number;
  sha256: string;
}
interface Messmanifest {
  version: number;
  bestaende: { anzahl: number; dateien: Messdatei[] }[];
}

async function zeit<T>(aktion: () => Promise<T> | T) {
  const start = performance.now();
  const wert = await aktion();
  return { wert, ms: performance.now() - start };
}

/** Aufruf ausschließlich nach dem Start im getrennten Messkonto, siehe Messanleitung. */
export async function messeSuchverzeichnis(anzahl: 28 | 500) {
  if (!import.meta.env.DEV) throw new Error('Nur im Entwicklungsbuild verfügbar.');
  const manifest: Messmanifest = JSON.parse(await appDatenLesen('messbestand.json'));
  const bestand = manifest.version === 1 && manifest.bestaende.find((b) => b.anzahl === anzahl);
  if (!bestand || bestand.dateien.length !== anzahl)
    throw new Error('Messmanifest fehlt oder ist ungültig.');
  const namen = (await appDatenOrdnerLesen('gesetze'))
    .filter((e) => !e.isDirectory && e.name?.endsWith('.xml'))
    .map((e) => e.name)
    .sort();
  if (JSON.stringify(namen) !== JSON.stringify(bestand.dateien.map((d) => d.name).sort()))
    throw new Error('Gesetzesordner passt nicht zum Messbestand; keine Messdatei geschrieben.');
  const gesetze = [];
  for (const datei of bestand.dateien) {
    if (!/^MessG\d{4}_[a-z][a-z0-9-]*\.xml$/.test(datei.name))
      throw new Error('Ungültiger Messdateiname.');
    const xml = await appDatenLesen(`gesetze/${datei.name}`);
    const bytes = new TextEncoder().encode(xml);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hash !== datei.sha256 || bytes.length !== datei.bytes)
      throw new Error(`Messdatei verändert: ${datei.name}`);
    const gesetz = parseGesetzesXML(xml);
    if (!gesetz) throw new Error(`Keine lesbare Gesetzesdatei: ${datei.name}`);
    gesetze.push({ name: datei.name, gesetz });
  }
  const dateien = await rufeBefehl('gesetz_dateistempel_lesen');
  const eintraege = gesetze.map(({ name, gesetz }) => {
    const datei = dateien.find((d) => d.name === name);
    if (!datei) throw new Error(`Dateistempel fehlt: ${name}`);
    return leiteSuchverzeichniseintragAb(gesetz, datei.dateistempel);
  });
  const pfad = 'messung-suchverzeichnis.json';
  const serialisieren = await zeit(() =>
    JSON.stringify({ version: 1, abgeglichen: false, eintraege }),
  );
  const schreiben = await zeit(() => appDatenSchreiben(pfad, serialisieren.wert));
  const lesen = await zeit(() => appDatenLesen(pfad));
  const einlesen = await zeit(() => JSON.parse(lesen.wert));
  const lesenAendernSchreiben = await zeit(() =>
    mitDateiSperre(pfad, async (token) => {
      const daten = JSON.parse(await appDatenLesen(pfad));
      // Repräsentativer Ersatz eines Eintrags in der isolierten Messdatei.
      daten.eintraege[0] = eintraege[0];
      await appDatenSchreiben(pfad, JSON.stringify(daten), token);
    }),
  );
  const ergebnis = {
    anzahl,
    bytes: new TextEncoder().encode(serialisieren.wert).length,
    serialisierenMs: serialisieren.ms,
    schreibenMs: schreiben.ms,
    lesenMs: lesen.ms,
    einlesenMs: einlesen.ms,
    lesenAendernSchreibenMs: lesenAendernSchreiben.ms,
    hinweis:
      'Suchverzeichniseinträge mit sämtlichen Suchnorm-Feldern und echten Dateistempeln aus dem nativen Sammelbefehl. Isolierte Messdatei, keine Messung der Produktionspflege oder des Dateistatusaufrufs. Lesen aus warmem Dateisystemcache.',
  };
  console.info('[messung-suchverzeichnis]', JSON.stringify(ergebnis));
  return ergebnis;
}
