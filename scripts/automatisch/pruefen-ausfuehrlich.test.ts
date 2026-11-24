import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const modul = new URL('./pruefen.mjs', import.meta.url).href;
let ordner: string;
let protokoll: string;
beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'lexlata-ausfuehrlich-'));
  protokoll = join(ordner, 'lauf.log');
});
afterEach(() => rmSync(ordner, { recursive: true, force: true }));

function aufruf(pruefungen: { name: string; befehl: string; args: string[] }[]) {
  return `import { pruefungenAusfuehren } from ${JSON.stringify(modul)};
    process.exitCode = await pruefungenAusfuehren(${JSON.stringify(pruefungen)},
      ${JSON.stringify(protokoll)}, true);`;
}

describe('Ausführlicher Prüflauf', () => {
  it('zeigt Ausgabe vor Prüfungsende live, ohne ein Protokoll anzulegen', async () => {
    const freigabe = join(ordner, 'weiter');
    const code = aufruf([
      {
        name: 'Live',
        befehl: process.execPath,
        args: [
          '-e',
          `console.log('LIVE');
        setTimeout(() => process.exit(3), 2000).unref();
        const fs = require('node:fs');
        const timer = setInterval(() => {
          if (fs.existsSync(${JSON.stringify(freigabe)})) {
            clearInterval(timer); console.error('FERTIG');
          }
        }, 10);`,
        ],
      },
    ]);
    const kind = spawn(process.execPath, ['--input-type=module', '-e', code]);
    let ausgabe = '';
    let fehlerausgabe = '';
    const sicherung = setTimeout(() => kind.kill(), 5000);
    kind.stdout.on('data', (daten: Buffer) => {
      ausgabe += daten.toString();
      if (ausgabe.includes('LIVE') && !existsSync(freigabe)) {
        writeFileSync(freigabe, 'weiter');
      }
    });
    kind.stderr.on('data', (daten: Buffer) => {
      fehlerausgabe += daten.toString();
    });
    try {
      const status = await new Promise((resolve, reject) => {
        kind.on('error', reject);
        kind.on('close', resolve);
      });
      expect(status).toBe(0);
      expect(ausgabe).toContain('Prüfung: Live');
      expect(ausgabe).toContain('1 Prüfung erfolgreich.');
      expect(fehlerausgabe).toContain('FERTIG');
      expect(existsSync(protokoll)).toBe(false);
    } finally {
      clearTimeout(sicherung);
      kind.kill();
    }
  });

  it('zeigt Fehlerdiagnosen nur einmal und führt die folgenden Prüfungen aus', () => {
    const ergebnis = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        aufruf([
          {
            name: 'Rot',
            befehl: process.execPath,
            args: ['-e', 'console.error("DIAGNOSE"); process.exit(2)'],
          },
          { name: 'Danach', befehl: process.execPath, args: ['-e', 'console.log("WEITER")'] },
        ]),
      ],
      { encoding: 'utf8' },
    );
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.stderr.match(/DIAGNOSE/g)).toHaveLength(1);
    expect(ergebnis.stdout).toContain('WEITER');
    expect(ergebnis.stdout).toContain('1 von 2 Prüfungen fehlgeschlagen.');
    expect(ergebnis.stdout).not.toContain('Protokoll:');
    expect(existsSync(protokoll)).toBe(false);
  });

  it.each([false, true])('wertet --ausfuehrlich beim npm-Aufruf aus: %s', (ausfuehrlich) => {
    const skriptOrdner = join(ordner, 'scripts', 'automatisch');
    mkdirSync(skriptOrdner, { recursive: true });
    copyFileSync(new URL('./pruefen.mjs', import.meta.url), join(skriptOrdner, 'pruefen.mjs'));
    copyFileSync(
      new URL('./kurzpruefung.mjs', import.meta.url),
      join(skriptOrdner, 'kurzpruefung.mjs'),
    );
    writeFileSync(join(ordner, 'detail.cjs'), 'console.log("WERKZEUGDETAIL")');
    writeFileSync(
      join(ordner, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: {
          pruefen: 'node scripts/automatisch/pruefen.mjs',
          'pruefen:beispiel': 'node detail.cjs',
        },
      }),
    );
    const args = [process.env.npm_execpath!, 'run', 'pruefen'];
    if (ausfuehrlich) args.push('--', '--ausfuehrlich');
    const ergebnis = spawnSync(process.execPath, args, { cwd: ordner, encoding: 'utf8' });
    expect(ergebnis.stderr).toBe('');
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.stdout.includes('WERKZEUGDETAIL')).toBe(ausfuehrlich);
    expect(ergebnis.stdout).toContain('1 Prüfung erfolgreich.');
    const logPfad = join(ordner, '.reports/pruefen/letzter-lauf.log');
    expect(existsSync(logPfad)).toBe(!ausfuehrlich);
    if (!ausfuehrlich) expect(readFileSync(logPfad, 'utf8')).toContain('WERKZEUGDETAIL');
  });

  it('lässt ein vorhandenes Protokoll unverändert', () => {
    writeFileSync(protokoll, 'Vorheriger kompakter Lauf');
    const ergebnis = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        aufruf([{ name: 'Grün', befehl: process.execPath, args: ['-e', 'process.exit(0)'] }]),
      ],
      { encoding: 'utf8' },
    );
    expect(ergebnis.status).toBe(0);
    expect(readFileSync(protokoll, 'utf8')).toBe('Vorheriger kompakter Lauf');
  });

  it('meldet Startfehler auch im ausführlichen Modus', () => {
    const ergebnis = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        aufruf([{ name: 'Startfehler', befehl: join(ordner, 'fehlt'), args: [] }]),
      ],
      { encoding: 'utf8' },
    );
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.stderr).toContain('Startfehler:');
    expect(existsSync(protokoll)).toBe(false);
  });
});
