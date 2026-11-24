#!/usr/bin/env node
// Einzige Pflegestelle der App-Version ist package.json.
// --nachziehen (npm-Lifecycle `version`): überträgt sie nach src-tauri/Cargo.toml
// ([package] version) und in den App-Eintrag von src-tauri/Cargo.lock.
// Ohne Argument (pruefen:version): meldet Abweichungen zwischen package.json,
// package-lock.json (Wurzel), Cargo.toml, Cargo.lock und tauri.conf.json,
// das auf ../package.json verweisen muss.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const lesen = (wurzel, pfad) => readFileSync(join(wurzel, pfad), 'utf8');

/** Abschnitt `[package]` aus Cargo.toml mit Start- und Endindex. */
function paketabschnitt(cargoToml) {
  const start = cargoToml.search(/^\[package\][ \t]*\r?$/m);
  if (start === -1) throw new Error('src-tauri/Cargo.toml: Abschnitt [package] fehlt.');
  const rest = cargoToml.slice(start + 1);
  const naechster = rest.search(/^\[/m);
  const ende = naechster === -1 ? cargoToml.length : start + 1 + naechster;
  return { start, ende, text: cargoToml.slice(start, ende) };
}

const VERSION_ZEILE = /^(version[ \t]*=[ \t]*")([^"]*)(")/m;

function cargoPaket(cargoToml) {
  const { text } = paketabschnitt(cargoToml);
  const name = /^name[ \t]*=[ \t]*"([^"]*)"/m.exec(text)?.[1];
  const version = VERSION_ZEILE.exec(text)?.[2];
  if (!name) throw new Error('src-tauri/Cargo.toml: [package] name fehlt.');
  return { name, version };
}

function lockEintrag(name) {
  const n = name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  return new RegExp(`(\\[\\[package\\]\\]\\r?\\nname = "${n}"\\r?\\nversion = ")([^"]*)(")`, 'g');
}

/** Zieht die Version aus package.json in Cargo.toml und Cargo.lock nach. */
export function versionNachziehen(wurzel) {
  const version = JSON.parse(lesen(wurzel, 'package.json')).version;
  const tomlPfad = join(wurzel, 'src-tauri/Cargo.toml');
  const toml = readFileSync(tomlPfad, 'utf8');
  const abschnitt = paketabschnitt(toml);
  if (!VERSION_ZEILE.test(abschnitt.text)) {
    throw new Error('src-tauri/Cargo.toml: [package] version fehlt.');
  }
  const neuerAbschnitt = abschnitt.text.replace(VERSION_ZEILE, `$1${version}$3`);
  writeFileSync(
    tomlPfad,
    toml.slice(0, abschnitt.start) + neuerAbschnitt + toml.slice(abschnitt.ende),
  );

  const { name } = cargoPaket(toml);
  const lockPfad = join(wurzel, 'src-tauri/Cargo.lock');
  const lock = readFileSync(lockPfad, 'utf8');
  const treffer = lock.match(lockEintrag(name)) ?? [];
  if (treffer.length !== 1) {
    throw new Error(
      `src-tauri/Cargo.lock: genau ein Eintrag für "${name}" erwartet, gefunden: ${treffer.length}.`,
    );
  }
  writeFileSync(lockPfad, lock.replace(lockEintrag(name), `$1${version}$3`));
  return version;
}

/** Liefert Abweichungen als Meldungen; leer bedeutet stimmig. */
export function versionPruefen(wurzel) {
  const meldungen = [];
  const version = JSON.parse(lesen(wurzel, 'package.json')).version;
  const lockJson = JSON.parse(lesen(wurzel, 'package-lock.json'));
  const vergleichen = (ort, wert) => {
    if (wert !== version) {
      meldungen.push(`${ort}: Version ${wert ?? '(fehlt)'} statt ${version} aus package.json.`);
    }
  };
  vergleichen('package-lock.json (version)', lockJson.version);
  vergleichen('package-lock.json (packages[""].version)', lockJson.packages?.['']?.version);

  const { name, version: cargoVersion } = cargoPaket(lesen(wurzel, 'src-tauri/Cargo.toml'));
  vergleichen('src-tauri/Cargo.toml', cargoVersion);
  const lockTreffer = [...lesen(wurzel, 'src-tauri/Cargo.lock').matchAll(lockEintrag(name))];
  if (lockTreffer.length !== 1) {
    meldungen.push(
      `src-tauri/Cargo.lock: genau ein Eintrag für "${name}" erwartet, gefunden: ${lockTreffer.length}.`,
    );
  } else {
    vergleichen('src-tauri/Cargo.lock', lockTreffer[0][2]);
  }

  const tauriVersion = JSON.parse(lesen(wurzel, 'src-tauri/tauri.conf.json')).version;
  if (tauriVersion !== '../package.json') {
    meldungen.push(
      `src-tauri/tauri.conf.json: "version" muss "../package.json" sein, ist ${JSON.stringify(tauriVersion)}.`,
    );
  }
  return meldungen;
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (istHauptmodul) {
  const wurzel = fileURLToPath(new URL('../..', import.meta.url));
  try {
    if (process.argv.includes('--nachziehen')) {
      const version = versionNachziehen(wurzel);
      console.log(`Version ${version} in Cargo.toml und Cargo.lock übernommen.`);
    } else {
      const meldungen = versionPruefen(wurzel);
      for (const meldung of meldungen) console.error(meldung);
      if (meldungen.length) {
        console.error(
          'Abhilfe: npm run versionsnummer -- <x.y.z> (nicht npm version direkt) bzw. npm run version (zieht package.json nach).',
        );
        process.exitCode = 1;
      } else {
        console.log('Versionsangaben stimmen überein.');
      }
    }
  } catch (fehler) {
    console.error(fehler.message);
    process.exitCode = 1;
  }
}
