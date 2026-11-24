import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Findet Rust samt Container-Toolchain auch ohne geladenes Shell-Profil. */
function umgebungFuerPruefung(name) {
  if (name !== 'pruefen:rust' && name !== 'pruefen:rust-clippy') return process.env;

  const cargoName = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
  const pfadSchluessel =
    Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  const suchpfad = process.env[pfadSchluessel] ?? '';
  const vorhandenerRustOrdner = suchpfad
    .split(delimiter)
    .find((ordner) => ordner && existsSync(join(ordner, cargoName)));
  const rustOrdner =
    vorhandenerRustOrdner ??
    [process.env.CARGO_HOME, join(homedir(), '.cargo'), '/usr/local/cargo']
      .filter(Boolean)
      .map((ordner) => join(ordner, 'bin'))
      .find((ordner) => existsSync(join(ordner, cargoName)));

  if (!rustOrdner) return process.env;

  const env = { ...process.env };
  if (!vorhandenerRustOrdner) {
    env[pfadSchluessel] = `${rustOrdner}${delimiter}${suchpfad}`;
  }

  // Das Rust-Image installiert unter /usr/local. Ohne dessen Umgebungsvariablen
  // sucht rustup im kurzlebigen Benutzerverzeichnis nach einer neuen Toolchain.
  // Explizite Homes und andere Installationen bleiben maßgeblich.
  if (
    process.platform === 'linux' &&
    join(rustOrdner, cargoName) === '/usr/local/cargo/bin/cargo' &&
    existsSync('/usr/local/rustup/settings.toml')
  ) {
    env.CARGO_HOME ??= '/usr/local/cargo';
    env.RUSTUP_HOME ??= '/usr/local/rustup';
  }

  return env;
}

/** Führt alle Prüfungen aus; auch Startfehler machen den Gesamtlauf erfolglos. */
export async function pruefungenAusfuehren(
  pruefungen,
  protokollPfad = '.reports/pruefen/letzter-lauf.log',
  ausfuehrlich = false,
  { aufruf = 'pruefen', umfang = '' } = {},
) {
  let protokoll;
  if (!ausfuehrlich) {
    mkdirSync(dirname(protokollPfad), { recursive: true });
    protokoll = openSync(protokollPfad, 'w');
  }
  const protokollieren = (text) => {
    if (protokoll !== undefined) writeSync(protokoll, text);
  };
  let fehleranzahl = 0;
  try {
    protokollieren(
      `Prüflauf läuft: ${new Date().toISOString()}\n` +
        `Aufruf: npm run ${aufruf}\n${umfang}\n` +
        'Bei fehlender Abschlusszeile ist der Lauf unvollständig.\n' +
        'Gezielt den Abschnitt der fehlgeschlagenen Prüfung lesen; ' +
        'der Wiederholungsbefehl steht dort.\n',
    );
    for (const { name, befehl, args } of pruefungen) {
      const anfang = protokoll === undefined ? 0 : fstatSync(protokoll).size;
      protokollieren(`\nPrüfung: ${name}\n`);
      if (ausfuehrlich) console.log(`\nPrüfung: ${name}`);
      const env = umgebungFuerPruefung(name);
      // Direkter Terminalzugriff erhält Statusanzeigen und Farben der Werkzeuge.
      // Der kompakte Lauf schreibt ohne Puffergrenze direkt in die Datei.
      const { status, error, signal } = spawnSync(befehl, args, {
        stdio: ausfuehrlich ? 'inherit' : ['ignore', protokoll, protokoll],
        env,
      });
      const diagnose = error
        ? `Startfehler: ${error.message}`
        : signal
          ? `Abgebrochen durch Signal: ${signal}`
          : '';
      if (diagnose) {
        protokollieren(`\n${diagnose}\n`);
        if (ausfuehrlich) console.error(diagnose);
      }
      const erfolgreich = status === 0 && !error && !signal;
      protokollieren(`\nErgebnis: ${erfolgreich ? 'OK' : 'FEHLER'} (Status: ${status})\n`);
      if (!erfolgreich) {
        fehleranzahl++;
        if (!ausfuehrlich) {
          console.error(readFileSync(protokollPfad).subarray(anfang).toString('utf8').trim());
        }
        const wiederholung = `Erneut ausführen: npm run ${name}${args.includes('--') ? ' -- ' + args.slice(args.indexOf('--') + 1).join(' ') : ''}`;
        console.log(wiederholung);
        protokollieren(`${wiederholung}\n`);
      }
    }
    const ergebnis = fehleranzahl
      ? `${fehleranzahl} von ${pruefungen.length} Prüfungen fehlgeschlagen.`
      : pruefungen.length === 1
        ? '1 Prüfung erfolgreich.'
        : `Alle ${pruefungen.length} Prüfungen erfolgreich.`;
    protokollieren(`\nPrüfergebnis: ${ergebnis}\n`);
    console.log(ergebnis);
    if (fehleranzahl && !ausfuehrlich) console.log(`Vollständiges Protokoll: ${protokollPfad}`);
    return fehleranzahl ? 1 : 0;
  } finally {
    if (protokoll !== undefined) closeSync(protokoll);
  }
}

/**
 * Wählt die vorgesehenen npm-Prüfungen in Paket-Reihenfolge. `vollpruefen:*`
 * läuft nur in der Vollprüfung (langsame Prüfungen), `pruefen:*` in beiden.
 */
export function pruefskripteAuswaehlen(scripts, { voll = false } = {}) {
  // Der Hook-Lint wäre neben pruefen:lint-voll doppelt.
  return Object.keys(scripts).filter(
    (name) =>
      (name.startsWith('pruefen:') && name !== 'pruefen:lint') ||
      (voll && name.startsWith('vollpruefen:')),
  );
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (istHauptmodul) {
  // npm über Node starten: funktioniert auch unter Windows ohne .cmd-Shell-Aufruf.
  const npmPfad = process.env.npm_execpath;
  const vollstaendig = process.argv.slice(2).includes('--voll');
  const aufruf = vollstaendig ? 'vollpruefen' : 'pruefen';
  const protokollPfad = `.reports/${aufruf}/letzter-lauf.log`;
  const ausfuehrlich = process.argv.slice(2).includes('--ausfuehrlich');
  if (!npmPfad) {
    console.error('Bitte über npm run pruefen oder npm run vollpruefen starten.');
    process.exitCode = 1;
  } else {
    process.chdir(fileURLToPath(new URL('../..', import.meta.url)));
    const { scripts } = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    const { kurzpruefungPlanen } = await import('./kurzpruefung.mjs');
    const plan = vollstaendig ? undefined : kurzpruefungPlanen();
    const umfang = plan
      ? `Kurzprüfung gegen HEAD (staged, unstaged, ungetrackt): ${plan.dateien.length} geänderte Dateien.\n` +
        `${plan.grund}\nTests: ${plan.tests}; Lint: ${plan.lint === 'alle' || plan.lint.length >= 100 ? 'alle' : plan.lint.length + ' Dateien'}; Rust: ${plan.rust ? 'vollständig' : 'ausgelassen'}.\n` +
        'Typprüfung und übrige Projektprüfungen: vollständig.\n' +
        (plan.tests === 'betroffen'
          ? `Testauswahl: ${plan.testDateien.join(', ')}\nKeine zugeordneten Tests oder Analysefehler lassen den Lauf scheitern.`
          : '')
      : 'Vollprüfung: alle Prüfklassen und Dateien.';
    console.log(umfang);
    const pruefungen = pruefskripteAuswaehlen(scripts, { voll: vollstaendig }).flatMap((name) => {
      if (plan) {
        if (name === 'pruefen:tests' && plan.tests === 'keine') return [];
        if ((name === 'pruefen:rust' || name === 'pruefen:rust-clippy') && !plan.rust) return [];
        if (name === 'pruefen:tests' && plan.tests === 'betroffen') {
          return [
            {
              name,
              befehl: process.execPath,
              args: [
                'scripts/automatisch/wegwerf-heimat.mjs',
                process.execPath,
                'node_modules/vitest/vitest.mjs',
                'related',
                '--run',
                ...plan.testDateien,
              ],
            },
          ];
        }
        if (name === 'pruefen:lint-voll' && plan.lint !== 'alle' && plan.lint.length < 100) {
          return plan.lint.length
            ? [
                {
                  name,
                  befehl: process.execPath,
                  args: [
                    'node_modules/eslint/bin/eslint.js',
                    '--max-warnings',
                    '0',
                    '--no-warn-ignored',
                    ...plan.lint,
                  ],
                },
              ]
            : [];
        }
      }
      return [
        {
          name,
          befehl: process.execPath,
          args: [npmPfad, 'run', name],
        },
      ];
    });
    if (pruefungen.length === 0) {
      console.error('Keine Prüfungen in package.json gefunden.');
      process.exitCode = 1;
    } else {
      try {
        process.exitCode = await pruefungenAusfuehren(pruefungen, protokollPfad, ausfuehrlich, {
          aufruf,
          umfang,
        });
      } catch (error) {
        console.error(`Prüflauf nicht abgeschlossen: ${error.message}`);
        if (!ausfuehrlich) {
          console.error(`Protokoll (sofern angelegt): ${protokollPfad}`);
        }
        process.exitCode = 1;
      }
    }
  }
}
