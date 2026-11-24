// titelvergleichAblauf.ts
// Titelvergleich: zwei nichtamtlicheTitelXML eines Gesetzes in eine Vergleichsdatei (md) überführen
// und die bearbeitete Vergleichsdatei wieder in eine nichtamtlicheTitelXML zurückwandeln.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { SaxesParser } from 'saxes';

type Norm = { bezeichnung: string; titel: string };
type Gesetz = { kurztitel: string; normgeber: string; normen: Norm[] };

const TRENNER = '//';
const NORMGEBER_MUSTER = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KOPFZEILE = /^# (.+) \(([^()]+)\)$/;
const NORMZEILE = /^\[([^\]]+)\]\s*(.*)$/;

/** Liest eine nichtamtlicheTitelXML (Gesetz mit Normgeber, Normbezeichnungen, Titel). */
function liesTitelXml(pfad: string): Gesetz {
  const parser = new SaxesParser();
  const gesetz: Gesetz = { kurztitel: '', normgeber: '', normen: [] };
  let gesetzGefunden = false;
  let text = '';
  let norm: Norm = { bezeichnung: '', titel: '' };
  parser.on('opentag', (tag) => {
    text = '';
    if (tag.name === 'gesetz') {
      gesetzGefunden = true;
      gesetz.normgeber = String(tag.attributes.normgeber ?? '');
    }
    if (tag.name === 'norm') norm = { bezeichnung: '', titel: '' };
  });
  parser.on('text', (t) => (text += t));
  parser.on('closetag', (tag) => {
    const einzeltext = text.replace(/\s+/g, ' ').trim();
    if (tag.name === 'gesetz') gesetz.kurztitel = einzeltext;
    if (tag.name === 'bezeichnung') norm.bezeichnung = einzeltext;
    if (tag.name === 'titel') norm.titel = einzeltext;
    if (tag.name === 'norm') gesetz.normen.push(norm);
    text = '';
  });
  parser.write(readFileSync(pfad, 'utf8')).close();
  if (!gesetzGefunden || !gesetz.kurztitel || !gesetz.normgeber) {
    throw new Error(`${pfad}: kein <gesetz normgeber="…">Kurztitel</gesetz> unter <infos>.`);
  }
  return gesetz;
}

/** Ein Titel mit dem Trennzeichen wäre in der Vergleichsdatei nicht darstellbar. */
function pruefeOhneTrenner(norm: Norm, pfad: string): void {
  if (norm.titel.includes(TRENNER)) {
    throw new Error(`${pfad}: Der Titel von ${norm.bezeichnung} enthält „${TRENNER}“.`);
  }
}

/** Ordnet die Normen des ersten Pfads vor und fügt Normen nur des zweiten an ihrer Stelle ein. */
function vereinigeBezeichnungen(erste: Norm[], zweite: Norm[]): string[] {
  const reihenfolge = erste.map((n) => n.bezeichnung);
  let vorgaenger = -1;
  for (const { bezeichnung } of zweite) {
    const vorhanden = reihenfolge.indexOf(bezeichnung);
    if (vorhanden !== -1) vorgaenger = vorhanden;
    else {
      reihenfolge.splice(vorgaenger + 1, 0, bezeichnung);
      vorgaenger += 1;
    }
  }
  return reihenfolge;
}

function titelJeBezeichnung(gesetz: Gesetz, pfad: string): Map<string, string> {
  const karte = new Map<string, string>();
  for (const norm of gesetz.normen) {
    if (karte.has(norm.bezeichnung)) {
      throw new Error(`${pfad}: ${norm.bezeichnung} kommt mehrfach vor.`);
    }
    pruefeOhneTrenner(norm, pfad);
    karte.set(norm.bezeichnung, norm.titel);
  }
  return karte;
}

function schreibeNeu(pfad: string, inhalt: string): void {
  if (existsSync(pfad)) throw new Error(`${pfad} existiert bereits.`);
  writeFileSync(pfad, inhalt, { flag: 'wx' });
}

/** Erzeugt „<Kurztitel> vergleich.md“ neben der ersten XML; liefert deren Pfad. */
export function titelvergleichHin(pfadErste: string, pfadZweite: string): string {
  const erste = liesTitelXml(pfadErste);
  const zweite = liesTitelXml(pfadZweite);
  if (erste.kurztitel !== zweite.kurztitel || erste.normgeber !== zweite.normgeber) {
    throw new Error(
      `Verschiedene Gesetze: ${erste.kurztitel} (${erste.normgeber}) und ${zweite.kurztitel} (${zweite.normgeber}).`,
    );
  }
  const titelErste = titelJeBezeichnung(erste, pfadErste);
  const titelZweite = titelJeBezeichnung(zweite, pfadZweite);
  const zeilen = vereinigeBezeichnungen(erste.normen, zweite.normen).map((bezeichnung) => {
    const links = titelErste.get(bezeichnung) ?? '';
    const rechts = titelZweite.get(bezeichnung) ?? '';
    const titel = links === rechts ? links : `${links}${TRENNER}${rechts}`;
    return `[${bezeichnung}] ${titel}`.trimEnd();
  });
  const ausgabe = join(dirname(pfadErste), `${erste.kurztitel} vergleich.md`);
  schreibeNeu(ausgabe, `# ${erste.kurztitel} (${erste.normgeber})\n${zeilen.join('\n')}\n`);
  return ausgabe;
}

function maskiere(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Liest die Vergleichsdatei; bricht bei offenem „//“ oder unlesbaren Zeilen ab. */
function liesVergleichsdatei(pfad: string): Gesetz {
  const zeilen = readFileSync(pfad, 'utf8').split(/\r?\n/);
  const kopf = KOPFZEILE.exec(zeilen[0] ?? '');
  if (!kopf || !NORMGEBER_MUSTER.test(kopf[2])) {
    throw new Error(
      `${pfad}: Zeile 1 muss „# Kurztitel (normgeber)“ lauten, z. B. „# HGB (de-bund)“.`,
    );
  }
  const gesetz: Gesetz = { kurztitel: kopf[1], normgeber: kopf[2], normen: [] };
  const offen: number[] = [];
  const unlesbar: number[] = [];
  zeilen.slice(1).forEach((zeile, index) => {
    if (zeile.trim() === '') return;
    const nummer = index + 2;
    const treffer = NORMZEILE.exec(zeile);
    if (!treffer) unlesbar.push(nummer);
    else if (treffer[2].includes(TRENNER)) offen.push(nummer);
    else gesetz.normen.push({ bezeichnung: treffer[1].trim(), titel: treffer[2].trim() });
  });
  if (unlesbar.length > 0) {
    throw new Error(
      `${pfad}: Unlesbar, erwartet „[Bezeichnung] Titel“: Zeile ${unlesbar.join(', ')}.`,
    );
  }
  if (offen.length > 0) {
    throw new Error(
      `${pfad}: Noch nicht entschieden („${TRENNER}“ steht noch): Zeile ${offen.join(', ')}.`,
    );
  }
  return gesetz;
}

/** Erzeugt die nichtamtlicheTitelXML neben der Vergleichsdatei; liefert deren Pfad. */
export function titelvergleichZurueck(pfadVergleichsdatei: string, jetzt = new Date()): string {
  const gesetz = liesVergleichsdatei(pfadVergleichsdatei);
  const geaendert = `${jetzt.toISOString().slice(0, 19)}Z`;
  const normen = gesetz.normen.map(
    (n) =>
      `        <norm><bezeichnung>${maskiere(n.bezeichnung)}</bezeichnung><titel>${maskiere(n.titel)}</titel></norm>\n`,
  );
  const inhalt = `<?xml version="1.0" encoding="UTF-8"?>
<nichtamtlicheTitel version="1">
    <infos>
        <gesetz normgeber="${gesetz.normgeber}">${maskiere(gesetz.kurztitel)}</gesetz>
        <geaendert>${geaendert}</geaendert>
    </infos>
    <inhalt>
${normen.join('')}    </inhalt>
</nichtamtlicheTitel>
`;
  const name = basename(pfadVergleichsdatei);
  const ausgabe = join(
    dirname(pfadVergleichsdatei),
    `${name.endsWith('.md') ? name.slice(0, -3) : name}.xml`,
  );
  schreibeNeu(ausgabe, inhalt);
  return ausgabe;
}
