// grundbestandAblauf.ts
// Grundbestand: bestehende Quelldateienläufe nacheinander starten, dann den Ausgabeordner befüllen.
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import type { bereiteGrundbestandVor } from './praefixstrukturenArgumente';

type Vorbereitung = ReturnType<typeof bereiteGrundbestandVor>;
type Start = Vorbereitung['laeufe'][number]['start'];

/**
 * Startet je Normgeber einen Lauf (`starte` liefert dessen Exitcode) und kopiert danach das
 * erzeugte GesetzesXML nach `arbeitsdaten/grundbestand/`. Gesetze, die der Bericht des Laufs
 * unter „Fehlgeschlagen“ nennt, werden nicht kopiert, auch wenn eine ältere Datei vorliegt.
 * Ein Lauf mit Fehlercode, ein fehlender Bericht oder ein Dateifehler beendet den Ablauf mit Fehlercode.
 */
export async function fuehreGrundbestandAus(
  vorbereitung: Vorbereitung,
  starte: (start: Start) => Promise<number>,
  ausgabe: (zeile: string) => void,
): Promise<number> {
  const gescheitert = new Map<string, Set<string>>();
  const berichte = join(vorbereitung.arbeitsdaten, 'berichte');
  for (const { normgeber, kurztitel, start } of vorbereitung.laeufe) {
    ausgabe(`Grundbestand: Lauf quelldateien für ${normgeber}`);
    const vorher = new Set(berichtsdateien(berichte, normgeber));
    const code = await starte(start);
    if (code !== 0) {
      ausgabe(`Grundbestand abgebrochen: Lauf für ${normgeber} endete mit Code ${code}.`);
      return code || 1;
    }
    const neue = berichtsdateien(berichte, normgeber).filter((d) => !vorher.has(d));
    if (!neue.length) {
      ausgabe(`Grundbestand abgebrochen: Lauf für ${normgeber} hat keinen Bericht geschrieben.`);
      return 1;
    }
    const zeilen = neue.flatMap((d) =>
      fehlgeschlageneZeilen(readFileSync(join(berichte, d), 'utf8')),
    );
    gescheitert.set(normgeber, new Set(kurztitel.filter((t) => wirdGenannt(t, zeilen))));
  }
  try {
    for (const zeile of fuelleGrundbestandsordner(vorbereitung, gescheitert)) ausgabe(zeile);
    return 0;
  } catch (fehler) {
    ausgabe(`Grundbestand abgebrochen: ${fehler instanceof Error ? fehler.message : fehler}`);
    return 1;
  }
}

/** Leert den Ausgabeordner, ohne Verknüpfungen zu folgen, und kopiert je Kurztitel die Datei. */
function fuelleGrundbestandsordner(
  { laeufe, arbeitsdaten }: Vorbereitung,
  gescheitert: Map<string, Set<string>>,
): string[] {
  const ziel = join(arbeitsdaten, 'grundbestand');
  leereOrdner(ziel);
  const bericht = ['Grundbestand: Ausgabeordner ' + ziel];
  let sonderfaelle = 0;
  for (const { normgeber, kurztitel } of laeufe) {
    const quelle = join(arbeitsdaten, 'gesetzesxml', normgeber);
    const dateien = vorhandeneDateien(quelle);
    const fehlend: string[] = [];
    const nichtAbgerufen: string[] = [];
    let kopiert = 0;
    for (const titel of kurztitel) {
      if (gescheitert.get(normgeber)?.has(titel)) {
        nichtAbgerufen.push(titel);
        continue;
      }
      const datei = dateien.get(kurztitelVergleichsform(titel));
      if (!datei) {
        fehlend.push(titel);
        continue;
      }
      copyFileSync(join(quelle, datei), join(ziel, `${datei.slice(0, -4)}_${normgeber}.xml`));
      kopiert++;
    }
    bericht.push(
      `${normgeber}: ${kopiert} kopiert, ${nichtAbgerufen.length} gescheitert, ${fehlend.length} ohne Datei`,
    );
    for (const titel of nichtAbgerufen) bericht.push(`  gescheitert: ${titel} (${normgeber})`);
    for (const titel of fehlend) bericht.push(`  ohne Datei: ${titel} (${normgeber})`);
    sonderfaelle += nichtAbgerufen.length + fehlend.length;
  }
  if (sonderfaelle)
    bericht.push(
      'Hinweis: Ursache im Bericht des Laufs unter arbeitsdaten/berichte/ prüfen. Erneut abrufen mit ' +
        '`npm run quelldateien -- NORMGEBER --kurztitel … --neu`; liegt die Quelldatei vor und ' +
        'scheiterte nur die Verarbeitung, genügt `npm run gesetzesxml -- NORMGEBER --kurztitel …`. ' +
        'Danach `npm run grundbestand` erneut ausführen.',
    );
  return bericht;
}

function leereOrdner(ordner: string) {
  const art = lstatSync(ordner, { throwIfNoEntry: false });
  if (art && !art.isDirectory()) throw new Error(`Ausgabeordner ist kein echter Ordner: ${ordner}`);
  // rmSync entfernt eine Verknüpfung selbst, nicht ihr Ziel.
  if (art) for (const name of readdirSync(ordner)) rmSync(join(ordner, name), { recursive: true });
  mkdirSync(ordner, { recursive: true });
}

/** Berichte, die der Lauf `quelldateien` für den Normgeber unter `berichte/` ablegt. */
function berichtsdateien(ordner: string, normgeber: string): string[] {
  if (!lstatSync(ordner, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(ordner).filter((n) => n.startsWith(`fehler-quelldateien-${normgeber}-`));
}

/** Zeilen `Kurztitel: Meldung` des Abschnitts „Fehlgeschlagen“ (bis zur nächsten Leerzeile). */
function fehlgeschlageneZeilen(text: string): string[] {
  const zeilen = text.split(/\r?\n/);
  const beginn = zeilen.indexOf('Fehlgeschlagen');
  if (beginn < 0) return [];
  const ende = zeilen.indexOf('', beginn);
  return zeilen.slice(beginn + 1, ende < 0 ? undefined : ende);
}

function wirdGenannt(titel: string, zeilen: string[]): boolean {
  const gesucht = kurztitelVergleichsform(titel);
  return zeilen.some((zeile) =>
    [...zeile.matchAll(/: /g)].some(
      ({ index }) => kurztitelVergleichsform(zeile.slice(0, index)) === gesucht,
    ),
  );
}

/** Dateinamen des Entwicklerlaufs, Schlüssel ist die Vergleichsform des dekodierten Kurztitels. */
function vorhandeneDateien(ordner: string): Map<string, string> {
  const dateien = new Map<string, string>();
  if (!lstatSync(ordner, { throwIfNoEntry: false })?.isDirectory()) return dateien;
  for (const eintrag of readdirSync(ordner, { withFileTypes: true }))
    if (eintrag.isFile() && eintrag.name.endsWith('.xml'))
      dateien.set(kurztitelVergleichsform(dekodiere(eintrag.name.slice(0, -4))), eintrag.name);
  return dateien;
}

/** Umkehrung der Prozentkodierung, mit der der Entwicklerlauf Sonderzeichen ablegt. */
function dekodiere(name: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < name.length;) {
    const hex = name[i] === '%' ? name.slice(i + 1, i + 3) : '';
    if (/^[0-9a-f]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 3;
    } else {
      const zeichen = String.fromCodePoint(name.codePointAt(i) ?? 0);
      bytes.push(...Buffer.from(zeichen));
      i += zeichen.length;
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
