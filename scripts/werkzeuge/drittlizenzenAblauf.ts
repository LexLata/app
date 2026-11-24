// drittlizenzenAblauf.ts
// Sammelt Drittkomponenten (npm-Produktionsabhängigkeiten, Rust-Crates aus cargo-about,
// sonstige eingebettete Inhalte) und erzeugt daraus die Klartextdatei THIRD-PARTY-LICENSES
// mit deterministischer Sortierung sowie einen Lizenzbefund. Prüft außerdem, ob die
// erzeugte Datei noch zum installierten Stand passt (pruefen:drittlizenzen).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Name des App-Crates; es ist keine Drittkomponente. */
export const EIGENES_CRATE = 'lexlata';

export type Herkunft = 'Rust' | 'npm' | 'Sonstige';

export interface Komponente {
  herkunft: Herkunft;
  name: string;
  version: string;
  /** SPDX-Ausdruck laut Paketangabe (z. B. "MIT OR Apache-2.0"). */
  lizenz: string;
  /** Copyright-Hinweise und Lizenztexte; leer, wenn im Paket kein Lizenztext gefunden wurde. */
  lizenztexte: string[];
  /** Urheberangabe laut Paketmetadaten, falls der Lizenztext keinen eigenen Vermerk enthält. */
  autoren?: string;
  /** Hinweis, wenn kein eigener Lizenztext im Paket lag und ein Ersatz verwendet wurde. */
  hinweis?: string;
}

const LIZENZDATEI = /^(licen[cs]e|copying|notice)([-._].*)?$/i;

function lizenzdateienLesen(ordner: string): string[] {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner)
    .filter((datei) => LIZENZDATEI.test(datei))
    .sort()
    .map((datei) => readFileSync(join(ordner, datei), 'utf8').trim());
}

function autorAusPaket(autor: unknown): string {
  if (typeof autor === 'string') return autor;
  if (autor && typeof autor === 'object' && 'name' in autor) return String(autor.name);
  return '';
}

function lizenzAusPaket(paket: { license?: unknown; licenses?: unknown }): string {
  if (typeof paket.license === 'string') return paket.license;
  if (paket.license && typeof paket.license === 'object' && 'type' in paket.license)
    return String(paket.license.type);
  if (Array.isArray(paket.licenses))
    return paket.licenses.map((l: { type?: string }) => l.type ?? '?').join(' OR ');
  return '';
}

/** Produktionsabhängigkeiten (transitiv, ohne devDependencies) laut package-lock.json. */
export function npmKomponenten(wurzel: string): Komponente[] {
  const sperrdatei = JSON.parse(readFileSync(join(wurzel, 'package-lock.json'), 'utf8')) as {
    packages: Record<string, { dev?: boolean; version?: string; license?: string }>;
  };
  return Object.entries(sperrdatei.packages)
    .filter(([pfad, eintrag]) => pfad !== '' && !eintrag.dev)
    .map(([pfad, eintrag]) => {
      const ordner = join(wurzel, pfad);
      const paketDatei = join(ordner, 'package.json');
      const paket = existsSync(paketDatei)
        ? (JSON.parse(readFileSync(paketDatei, 'utf8')) as Record<string, unknown>)
        : {};
      const name =
        typeof paket.name === 'string' ? paket.name : pfad.replace(/^.*node_modules\//, '');
      const lizenztexte = lizenzdateienLesen(ordner);
      return {
        herkunft: 'npm' as const,
        name,
        version: String(paket.version ?? eintrag.version ?? ''),
        lizenz: lizenzAusPaket(paket) || eintrag.license || '',
        lizenztexte,
        ...(lizenztexte.length === 0 && autorAusPaket(paket.author)
          ? { autoren: autorAusPaket(paket.author) }
          : {}),
      };
    });
}

interface CargoAboutJson {
  licenses: {
    id: string;
    text: string;
    source_path?: string | null;
    used_by: { crate: { name: string; version: string; authors?: string[] } }[];
  }[];
  crates: { package: { name: string; version: string }; license: string }[];
}

/** Rust-Crates aus der JSON-Ausgabe von cargo-about; das eigene App-Crate entfällt. */
export function rustKomponenten(json: CargoAboutJson, eigenesCrate: string): Komponente[] {
  const texte = new Map<string, { texte: string[]; ersatz: boolean; autoren: string }>();
  for (const lizenz of json.licenses) {
    for (const { crate } of lizenz.used_by) {
      const schluessel = `${crate.name}@${crate.version}`;
      const eintrag = texte.get(schluessel) ?? {
        texte: [],
        ersatz: false,
        autoren: (crate.authors ?? []).join(', '),
      };
      if (!lizenz.source_path) eintrag.ersatz = true;
      eintrag.texte.push(lizenz.text.trim());
      texte.set(schluessel, eintrag);
    }
  }
  return json.crates
    .filter((c) => c.package.name !== eigenesCrate)
    .map((c) => {
      const eintrag = texte.get(`${c.package.name}@${c.package.version}`);
      return {
        herkunft: 'Rust' as const,
        name: c.package.name,
        version: c.package.version,
        lizenz: c.license,
        lizenztexte: eintrag?.texte ?? [],
        ...(eintrag?.ersatz
          ? {
              hinweis: 'Kein Lizenztext im Crate gefunden; SPDX-Standardtext verwendet.',
              ...(eintrag.autoren ? { autoren: eintrag.autoren } : {}),
            }
          : {}),
      };
    });
}

function vergleiche(a: Komponente, b: Komponente): number {
  const reihenfolge: Herkunft[] = ['Rust', 'npm', 'Sonstige'];
  return (
    reihenfolge.indexOf(a.herkunft) - reihenfolge.indexOf(b.herkunft) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
    (a.version < b.version ? -1 : a.version > b.version ? 1 : 0)
  );
}

/** Einzelne SPDX-IDs eines Ausdrucks (ohne Operatoren und Klammern). */
export function lizenzIds(ausdruck: string): string[] {
  return ausdruck
    .replace(/[()]/g, ' ')
    .split(/\s+(?:OR|AND|\/)\s+|\s*\/\s*/)
    .map((teil) => teil.trim())
    .filter(Boolean);
}

const UNBEDENKLICH = new Set([
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'Apache-2.0 WITH LLVM-exception',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Zlib',
  'Unicode-3.0',
  'Unicode-DFS-2016',
  'MPL-2.0',
  'BSL-1.0',
  'CC0-1.0',
  'Unlicense',
  '0BSD',
  'CDLA-Permissive-2.0',
  'OFL-1.1',
]);

export interface Lizenzbefund {
  /** Anzahl Komponenten je vorkommender Lizenz-ID, alphabetisch. */
  ids: [string, number][];
  /** Auffällige Komponenten mit Grund. */
  auffaellig: string[];
}

export function lizenzbefund(komponenten: Komponente[]): Lizenzbefund {
  const zaehler = new Map<string, number>();
  const auffaellig: string[] = [];
  for (const k of [...komponenten].sort(vergleiche)) {
    const ids = lizenzIds(k.lizenz);
    for (const id of new Set(ids)) zaehler.set(id, (zaehler.get(id) ?? 0) + 1);
    const bezeichnung = `${k.herkunft} ${k.name} ${k.version}`;
    if (ids.length === 0) auffaellig.push(`${bezeichnung}: keine Lizenzangabe`);
    // Bei OR genügt eine unbedenkliche Alternative; sonst müssen alle unbedenklich sein.
    const oder = /\sOR\s|\//.test(k.lizenz) && !/\sAND\s/.test(k.lizenz);
    const ok = oder
      ? ids.some((id) => UNBEDENKLICH.has(id))
      : ids.every((id) => UNBEDENKLICH.has(id));
    if (ids.length > 0 && !ok) auffaellig.push(`${bezeichnung}: Lizenz prüfen (${k.lizenz})`);
    if (k.lizenztexte.length === 0) auffaellig.push(`${bezeichnung}: kein Lizenztext gefunden`);
    if (k.hinweis) auffaellig.push(`${bezeichnung}: ${k.hinweis}`);
  }
  const ids = [...zaehler.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { ids, auffaellig };
}

const TRENNER = '='.repeat(78);
const FINGERABDRUCK_KOPF = 'Fingerabdruck src-tauri/Cargo.lock (SHA-256, ohne App-Version): ';

/** Erster Teil einer Komponentenzeile in Teil 1 (Name, Version, Lizenz). */
function komponentenangabe(k: Komponente): string {
  return `${k.name} ${k.version} | ${k.lizenz || 'keine Angabe'}`;
}

/**
 * Fingerabdruck des Rust-Abhängigkeitsstands: SHA-256 von Cargo.lock mit einheitlichen
 * Zeilenenden und ohne die Version des eigenen Crates (die bei jedem Release springt).
 */
export function cargoLockFingerabdruck(cargoLock: string, eigenesCrate: string): string {
  const name = eigenesCrate.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const eintrag = new RegExp(`^(\\[\\[package\\]\\]\nname = "${name}"\nversion = ")[^"]*(")`, 'm');
  const einheitlich = cargoLock.replace(/\r\n/g, '\n');
  if (!eintrag.test(einheitlich))
    throw new Error(`Cargo.lock: Eintrag des eigenen Crates "${eigenesCrate}" fehlt.`);
  return createHash('sha256').update(einheitlich.replace(eintrag, '$1$2')).digest('hex');
}

/** Klartext der Datei THIRD-PARTY-LICENSES; gleiche Lizenztexte werden zusammengefasst. */
export function drittlizenzenText(komponenten: Komponente[], rustFingerabdruck: string): string {
  const sortiert = [...komponenten].sort(vergleiche);
  const textNummern = new Map<string, number>();
  for (const k of sortiert)
    for (const text of k.lizenztexte)
      if (!textNummern.has(text)) textNummern.set(text, textNummern.size + 1);

  const zeilen = [
    'THIRD-PARTY-LICENSES – LexLata',
    '',
    'LexLata steht unter der GNU Affero General Public License v3.0 or later',
    '(AGPL-3.0-or-later). Die App enthält die nachstehenden Komponenten Dritter.',
    'Für sie gelten die jeweils angegebenen Lizenzen; Copyright-Vermerke und',
    'Lizenztexte folgen im zweiten Teil. Gleiche Texte sind zusammengefasst und',
    'über ihre Nummer [Tn] zugeordnet. Enthält ein Paket keinen eigenen Lizenztext,',
    'ist der Standardtext der Lizenz zugeordnet und die Urheberangabe laut',
    'Paketmetadaten genannt.',
    '',
    'Diese Datei wird mit "npm run drittlizenzen" erzeugt und nicht von Hand bearbeitet.',
    FINGERABDRUCK_KOPF + rustFingerabdruck,
    '',
    TRENNER,
    'Teil 1: Komponenten (Herkunft, Name, Version, Lizenz, Text)',
    TRENNER,
  ];
  let herkunft: Herkunft | undefined;
  for (const k of sortiert) {
    if (k.herkunft !== herkunft) {
      herkunft = k.herkunft;
      zeilen.push('', `${herkunft}:`, '');
    }
    const nummern = k.lizenztexte.map((text) => `[T${textNummern.get(text)}]`).join(' ');
    zeilen.push(`${komponentenangabe(k)} | ${nummern || 'kein Lizenztext im Paket'}`);
    if (k.autoren) zeilen.push(`    Urheber laut Paketangabe: ${k.autoren}`);
  }
  zeilen.push('', TRENNER, 'Teil 2: Copyright-Vermerke und Lizenztexte', TRENNER);
  for (const [text, nummer] of textNummern) {
    zeilen.push('', `[T${nummer}]`, '-'.repeat(78), '', text);
  }
  return zeilen.join('\n') + '\n';
}

/** SPDX-Standardtexte aus cargo-about (Einträge ohne eigene Lizenzdatei), je Lizenz-ID. */
export function standardtexte(json: CargoAboutJson): Map<string, string> {
  const texte = new Map<string, string>();
  for (const lizenz of json.licenses)
    if (!lizenz.source_path && !texte.has(lizenz.id)) texte.set(lizenz.id, lizenz.text.trim());
  return texte;
}

/**
 * Ordnet Paketen ohne eigenen Lizenztext den Standardtext ihrer Lizenz zu (wie bei Rust).
 * Bei OR genügt eine Alternative, sonst braucht jede ID einen Text; fehlt er, Abbruch.
 */
export function standardtexteErgaenzen(
  komponenten: Komponente[],
  texte: Map<string, string>,
): Komponente[] {
  return komponenten.map((k) => {
    if (k.lizenztexte.length > 0) return k;
    const ids = lizenzIds(k.lizenz);
    const oder = /\sOR\s|\//.test(k.lizenz) && !/\sAND\s/.test(k.lizenz);
    const gewaehlt = oder ? ids.filter((id) => texte.has(id)).slice(0, 1) : ids;
    if (gewaehlt.length === 0 || gewaehlt.some((id) => !texte.has(id)))
      throw new Error(
        `${k.herkunft} ${k.name} ${k.version}: kein Lizenztext im Paket und kein Standardtext für "${k.lizenz || 'keine Angabe'}" in der Sammlung.`,
      );
    return {
      ...k,
      lizenztexte: gewaehlt.map((id) => texte.get(id) as string),
      hinweis: 'Kein Lizenztext im Paket gefunden; SPDX-Standardtext verwendet.',
    };
  });
}

/** npm-Angaben (Name, Version, Lizenz) aus Teil 1 einer erzeugten Datei THIRD-PARTY-LICENSES. */
function npmAngabenAusDatei(text: string): string[] {
  const zeilen = text.split(/\r?\n/);
  const start = zeilen.indexOf('npm:');
  if (start === -1) return [];
  const angaben: string[] = [];
  for (const zeile of zeilen.slice(start + 1)) {
    if (zeile === 'Sonstige:' || zeile === TRENNER) break;
    if (zeile === '' || /^\s/.test(zeile)) continue;
    angaben.push(zeile.split(' | ').slice(0, 2).join(' | '));
  }
  return angaben;
}

function ohne(liste: string[], abzug: string[]): string[] {
  const rest = [...abzug];
  return liste.filter((eintrag) => {
    const i = rest.indexOf(eintrag);
    if (i === -1) return true;
    rest.splice(i, 1);
    return false;
  });
}

/**
 * Abweichungen der Datei THIRD-PARTY-LICENSES vom installierten Stand: npm-Laufzeitpakete
 * (Name, Version, Lizenz) exakt, Rust über den Fingerabdruck von src-tauri/Cargo.lock.
 * Leer, wenn die Datei aktuell ist. Braucht kein cargo-about.
 */
export function drittlizenzenAbweichungen(wurzel: string, eigenesCrate: string): string[] {
  const datei = join(wurzel, 'THIRD-PARTY-LICENSES');
  if (!existsSync(datei)) return ['THIRD-PARTY-LICENSES fehlt.'];
  const text = readFileSync(datei, 'utf8');
  const abweichungen: string[] = [];

  const vermerkt = text
    .split(/\r?\n/)
    .find((zeile) => zeile.startsWith(FINGERABDRUCK_KOPF))
    ?.slice(FINGERABDRUCK_KOPF.length);
  const aktuell = cargoLockFingerabdruck(
    readFileSync(join(wurzel, 'src-tauri/Cargo.lock'), 'utf8'),
    eigenesCrate,
  );
  if (vermerkt === undefined) abweichungen.push('Rust: Fingerabdruck von Cargo.lock fehlt.');
  else if (vermerkt !== aktuell)
    abweichungen.push('Rust: src-tauri/Cargo.lock hat sich seit der Erzeugung geändert.');

  const inDatei = npmAngabenAusDatei(text);
  const installiert = npmKomponenten(wurzel).map(komponentenangabe);
  for (const angabe of ohne(installiert, inDatei))
    abweichungen.push(`npm: ${angabe} ist installiert, fehlt aber in der Datei.`);
  for (const angabe of ohne(inDatei, installiert))
    abweichungen.push(`npm: ${angabe} steht in der Datei, ist aber nicht installiert.`);
  return abweichungen;
}

const LUCIDE_VERSION = /@license lucide-static v(\d+\.\d+\.\d+)/;

/** Lucide-Version laut Lizenzkopf der Quell-SVGs; Dateien ohne Kopf zählen nicht mit. */
export function lucideVersion(ordner: string): string {
  const versionen = new Set(
    readdirSync(ordner)
      .filter((datei) => datei.endsWith('.svg'))
      .map((datei) => LUCIDE_VERSION.exec(readFileSync(join(ordner, datei), 'utf8'))?.[1])
      .filter((version) => version !== undefined),
  );
  if (versionen.size !== 1)
    throw new Error(
      `${ordner}: genau eine Lucide-Version erwartet, gefunden: ${[...versionen].sort().join(', ') || 'keine'}.`,
    );
  return [...versionen][0];
}
