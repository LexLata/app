// europaVerzeichnis.ts
// Bundle-Verzeichnis unabhängig von EU-Formatkonvertierung lesen; Teilfehler bewahren.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { ressourcenPfad as resolveResource } from '@/lib/plattform/dateipfade';
import { leseKuratierteListe } from './europaKuratiert';
import { liesPflichtNormgeber } from '@/lib/domain/gesetzesreferenz';
import { SaxesParser } from 'saxes';
import type { ImportindexSucheEintrag } from './importindexVertrag.types';
import type { VerzeichnisErgebnis } from './importindexVertrag.types';

const EUROPA_ORDNER = 'resources/europa';

function leseTitel(xml: string): { kurztitel: string; langtitel: string; normgeber: string } {
  const parser = new SaxesParser();
  const pfad: string[] = [];
  let kurztitel = '';
  let langtitel = '';
  let root = '';
  let normgeber = '';
  parser.on('error', (fehler) => {
    throw fehler;
  });
  parser.on('opentag', (tag) => {
    if (pfad.length === 0) root = tag.name;
    pfad.push(tag.name);
  });
  const text = (inhalt: string) => {
    if (pfad.join('/') === 'gesetz/infos/normgeber') normgeber += inhalt;
    if (pfad.join('/') === 'gesetz/infos/kurztitel') kurztitel += inhalt;
    if (pfad.join('/') === 'gesetz/infos/langtitel') langtitel += inhalt;
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => {
    pfad.pop();
  });
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: leseTitel liest Ressourcen-XML mit SaxesParser ohne DOM-Ausgabe; europaVerzeichnis.test.ts prüft Titel und Diagnosen.
  parser.write(xml).close();
  if (root !== 'gesetz' || !kurztitel.trim())
    throw new Error('Kein Gesetz mit lesbarem Kurztitel.');
  return {
    kurztitel: kurztitel.trim(),
    langtitel: langtitel.trim(),
    normgeber: liesPflichtNormgeber(normgeber || undefined),
  };
}

/** Bundle scannt ausschließlich XML-Dateien; Ordner- und Dateifehler sind Diagnosen. */
async function leseBundleVerzeichnis(): Promise<VerzeichnisErgebnis> {
  const ergebnis: VerzeichnisErgebnis = { eintraege: [], fehler: [] };
  let eintraege: Awaited<ReturnType<typeof readDir>>;
  try {
    eintraege = await readDir(await resolveResource(EUROPA_ORDNER));
  } catch (e) {
    ergebnis.fehler.push({
      quelle: NORMGEBER_EU,
      meldung: `Europa-Verzeichnis nicht lesbar: ${String(e)}`,
    });
    return ergebnis;
  }
  for (const eintrag of eintraege) {
    if (!eintrag.isFile || !eintrag.name.toLowerCase().endsWith('.xml')) continue;
    try {
      const xml = await readTextFile(await resolveResource(`${EUROPA_ORDNER}/${eintrag.name}`));
      ergebnis.eintraege.push({ ...leseTitel(xml), abrufkennung: eintrag.name });
    } catch (e) {
      ergebnis.fehler.push({
        quelle: NORMGEBER_EU,
        meldung: `Europa-Datei ${eintrag.name} nicht verwendbar: ${String(e)}`,
      });
    }
  }
  return ergebnis;
}

/** Kuratierte CELEX-Angebote und die gebündelte EMRK gemeinsam lesen. */
export async function leseEuropaVerzeichnisMitDiagnosen(): Promise<VerzeichnisErgebnis> {
  const [bundle, kuratiert] = await Promise.all([leseBundleVerzeichnis(), leseKuratierteListe()]);
  return fuehreEuropaAngeboteZusammen(bundle, kuratiert);
}

/** Bestehender Suchvertrag: verfügbare Einträge, auch bei Teilfehlern. */
export async function leseEuropaVerzeichnis(): Promise<ImportindexSucheEintrag[]> {
  return (await leseEuropaVerzeichnisMitDiagnosen()).eintraege;
}

/** Kuratierte Angebote und Bundle-Einträge samt Diagnosen zusammenführen. */
export function fuehreEuropaAngeboteZusammen(
  bundle: VerzeichnisErgebnis,
  kuratiert: VerzeichnisErgebnis,
): VerzeichnisErgebnis {
  return {
    eintraege: [...kuratiert.eintraege, ...bundle.eintraege],
    fehler: [...bundle.fehler, ...kuratiert.fehler],
  };
}
