// scripts/automatisch/wegwerf-heimat.mjs
// Startet einen Befehl (Testlauf) mit einem Ersatz-Heimatordner in einem
// temporären Wegwerfverzeichnis, damit Tests niemals echte Nutzerdaten berühren.
//
// Aufruf: node scripts/automatisch/wegwerf-heimat.mjs <befehl> [argumente...]
//
// - Setzt HOME sowie XDG_DATA_HOME/XDG_CONFIG_HOME/XDG_CACHE_HOME/XDG_STATE_HOME
//   auf Unterordner des Wegwerfordners. Rust/Tauri und Node leiten daraus die
//   Nutzerordner ab (macOS ~/Library/Application Support, Linux ~/.local/share).
// - Werkzeug-Caches bleiben am bisherigen Ort: CARGO_HOME, RUSTUP_HOME,
//   npm-Cache und globale git-Konfiguration werden vor dem Umlenken auf die
//   bisherigen Werte fixiert (target/ liegt ohnehin im Projekt).
// - Reicht den Exitcode durch und löscht den Wegwerfordner danach.
//
// Bekannte Grenze: Unter Windows ermittelt das System die Nutzerordner
// (AppData) nicht über HOME; dort wirkt die Sperre nicht auf Systemordner.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Umgebung mit Wegwerf-Heimat; Werkzeug-Caches zeigen weiter auf die echten Orte. */
export function wegwerfUmgebung(heimat, env = process.env, echteHeimat = homedir()) {
  const neu = { ...env };
  neu.CARGO_HOME ??= join(echteHeimat, '.cargo');
  neu.RUSTUP_HOME ??= join(echteHeimat, '.rustup');
  neu.npm_config_cache ??= join(echteHeimat, '.npm');
  const gitKonfiguration = join(echteHeimat, '.gitconfig');
  if (!neu.GIT_CONFIG_GLOBAL && existsSync(gitKonfiguration)) {
    neu.GIT_CONFIG_GLOBAL = gitKonfiguration;
  }
  neu.HOME = heimat;
  for (const [name, ordner] of [
    ['XDG_DATA_HOME', '.local/share'],
    ['XDG_CONFIG_HOME', '.config'],
    ['XDG_CACHE_HOME', '.cache'],
    ['XDG_STATE_HOME', '.local/state'],
  ]) {
    neu[name] = join(heimat, ordner);
    mkdirSync(neu[name], { recursive: true });
  }
  return neu;
}

/** Führt den Befehl in der Wegwerf-Heimat aus und liefert dessen Exitcode. */
export function mitWegwerfHeimat(befehl, args) {
  const heimat = mkdtempSync(join(tmpdir(), 'lexlata-test-heimat-'));
  try {
    const ergebnis = spawnSync(befehl, args, {
      stdio: 'inherit',
      env: wegwerfUmgebung(heimat),
      // npm-Bin-Shims (vitest.cmd) brauchen unter Windows eine Shell.
      shell: process.platform === 'win32' && !isAbsolute(befehl),
    });
    if (ergebnis.error) {
      console.error(`Start fehlgeschlagen: ${befehl}: ${ergebnis.error.message}`);
      return 1;
    }
    return ergebnis.status ?? 1;
  } finally {
    rmSync(heimat, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [befehl, ...args] = process.argv.slice(2);
  if (!befehl) {
    console.error('Aufruf: node scripts/automatisch/wegwerf-heimat.mjs <befehl> [argumente...]');
    process.exit(2);
  }
  process.exit(mitWegwerfHeimat(befehl, args));
}
