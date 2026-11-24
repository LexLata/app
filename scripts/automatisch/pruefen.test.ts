import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pruefungenAusfuehren as ausfuehren, pruefskripteAuswaehlen } from './pruefen.mjs';

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawnSync: vi.fn(original.spawnSync) };
});

vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>();
  return { ...original, existsSync: vi.fn(original.existsSync) };
});

let protokollOrdner: string;
let protokollPfad: string;
beforeEach(() => {
  protokollOrdner = mkdtempSync(join(tmpdir(), 'lexlata-pruefen-'));
  protokollPfad = join(protokollOrdner, 'letzter-lauf.log');
});
function pruefungenAusfuehren(pruefungen: Parameters<typeof ausfuehren>[0]) {
  return ausfuehren(pruefungen, protokollPfad);
}

afterEach(() => {
  rmSync(protokollOrdner, { recursive: true, force: true });
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('Prüflauf', () => {
  it('führt im Gesamtlauf vollständig Lint aus und lässt den Hook-Lint aus', () => {
    expect(
      pruefskripteAuswaehlen({
        dev: 'vite',
        'pruefen:typen': 'tsc --noEmit',
        'pruefen:lint': 'node scripts/automatisch/lint-geaendert.mjs',
        'pruefen:lint-voll': 'eslint . --max-warnings 0',
        'pruefen:tests': 'vitest run',
      }),
    ).toEqual(['pruefen:typen', 'pruefen:lint-voll', 'pruefen:tests']);
  });

  it('nimmt vollpruefen-Skripte nur in die Vollprüfung auf, pruefen-Skripte in beide', () => {
    const scripts = {
      'pruefen:typen': 'tsc --noEmit',
      'vollpruefen:interface-namen': 'node scripts/automatisch/interface-namen-pruefen.mjs',
      'pruefen:tests': 'vitest run',
    };
    expect(pruefskripteAuswaehlen(scripts)).toEqual(['pruefen:typen', 'pruefen:tests']);
    expect(pruefskripteAuswaehlen(scripts, { voll: true })).toEqual([
      'pruefen:typen',
      'vollpruefen:interface-namen',
      'pruefen:tests',
    ]);
  });

  it('führt nach einer fehlgeschlagenen Prüfung die nächste aus und bleibt erfolglos', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const status = await pruefungenAusfuehren([
      { name: 'Fehler', befehl: process.execPath, args: ['-e', 'process.exit(2)'] },
      { name: 'Danach', befehl: process.execPath, args: ['-e', 'process.exit(0)'] },
    ]);
    expect(status).toBe(1);
    expect(log).toHaveBeenCalledWith('1 von 2 Prüfungen fehlgeschlagen.');
    expect(log).toHaveBeenCalledWith(`Vollständiges Protokoll: ${protokollPfad}`);
    expect(readFileSync(protokollPfad, 'utf8')).toContain('Prüfung: Danach');
  });

  it('setzt den Lauf auch nach einem Startfehler fort und meldet diesen', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await pruefungenAusfuehren([
        { name: 'Startfehler', befehl: './nicht-vorhandenes-pruefprogramm', args: [] },
        { name: 'Danach', befehl: process.execPath, args: ['-e', 'process.exit(0)'] },
      ]),
    ).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Startfehler:'));
    expect(log).toHaveBeenCalledWith('1 von 2 Prüfungen fehlgeschlagen.');
  });

  it('meldet Erfolg, wenn alle Prüfungen erfolgreich waren', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(
      await pruefungenAusfuehren([
        { name: 'Erfolg', befehl: process.execPath, args: ['-e', 'process.exit(0)'] },
      ]),
    ).toBe(0);
    expect(log.mock.calls).toEqual([['1 Prüfung erfolgreich.']]);
  });
  it('protokolliert beide Ausgabekanäle, ersetzt alte Inhalte und zeigt nur Fehlerdiagnosen', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    writeFileSync(protokollPfad, 'Alter Lauf');
    expect(
      await pruefungenAusfuehren([
        { name: 'Grün', befehl: process.execPath, args: ['-e', 'console.log("Erfolgsdetail")'] },
        {
          name: 'Rot',
          befehl: process.execPath,
          args: [
            '-e',
            'console.log("Diagnose stdout"); console.error("Diagnose stderr"); process.exit(1)',
          ],
        },
      ]),
    ).toBe(1);
    const protokoll = readFileSync(protokollPfad, 'utf8');
    expect(protokoll).not.toContain('Alter Lauf');
    expect(protokoll).toContain('Erfolgsdetail');
    expect(protokoll).toContain('Diagnose stdout');
    expect(protokoll).toContain('Diagnose stderr');
    expect(protokoll).toContain('1 von 2 Prüfungen fehlgeschlagen.');
    expect(error.mock.calls.flat().join('\n')).toContain('Prüfung: Rot');
    expect(error.mock.calls.flat().join('\n')).toContain('Diagnose stdout');
    expect(error.mock.calls.flat().join('\n')).toContain('Diagnose stderr');
    expect(error.mock.calls.flat().join('\n')).not.toContain('Erfolgsdetail');
    expect(log.mock.calls.flat().join('\n')).not.toContain('Erfolgsdetail');
  });

  it('meldet einen Signalabbruch und setzt die übrigen Prüfungen fort', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(spawnSync).mockReturnValueOnce({
      pid: 1,
      output: [],
      stdout: null,
      stderr: null,
      status: null,
      signal: 'SIGTERM',
    });
    expect(
      await pruefungenAusfuehren([
        { name: 'Abbruch', befehl: process.execPath, args: [] },
        { name: 'Danach', befehl: process.execPath, args: ['-e', 'process.exit(0)'] },
      ]),
    ).toBe(1);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Abgebrochen durch Signal: SIGTERM'),
    );
    expect(log).toHaveBeenCalledWith('1 von 2 Prüfungen fehlgeschlagen.');
  });

  it('hinterlässt bei unerwartetem Abbruch kein abschließendes Gesamtergebnis', async () => {
    vi.mocked(spawnSync).mockImplementationOnce(() => {
      throw new Error('Unterbrochen');
    });
    await expect(
      pruefungenAusfuehren([{ name: 'Abbruch', befehl: process.execPath, args: [] }]),
    ).rejects.toThrow('Unterbrochen');
    const protokoll = readFileSync(protokollPfad, 'utf8');
    expect(protokoll).toContain('Prüflauf läuft:');
    expect(protokoll).toContain('Prüfung: Abbruch');
    expect(protokoll).not.toContain('Prüfergebnis:');
  });

  it('vererbt im ausführlichen Modus die Terminalkanäle direkt', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(spawnSync).mockReturnValueOnce({
      pid: 1,
      output: [],
      stdout: null,
      stderr: null,
      status: 0,
      signal: null,
    });
    await ausfuehren(
      [{ name: 'Terminal', befehl: process.execPath, args: [] }],
      protokollPfad,
      true,
    );
    expect(spawnSync).toHaveBeenCalledWith(
      process.execPath,
      [],
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('nennt Wiederholungsbefehle bei Fehlern und erklärt das Protokoll im Kopf', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await pruefungenAusfuehren([
      { name: 'pruefen:typen', befehl: process.execPath, args: ['-e', 'process.exit(1)'] },
    ]);
    expect(log).toHaveBeenCalledWith('Erneut ausführen: npm run pruefen:typen');
    const protokoll = readFileSync(protokollPfad, 'utf8');
    expect(protokoll).toContain('Aufruf: npm run pruefen');
    expect(protokoll).toContain('Bei fehlender Abschlusszeile ist der Lauf unvollständig.');
    expect(protokoll).toContain('Gezielt den Abschnitt der fehlgeschlagenen Prüfung lesen');
    expect(protokoll).toContain('Erneut ausführen: npm run pruefen:typen');
  });

  it('verarbeitet auch große Ausgaben ohne Pufferlimit', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(
      await pruefungenAusfuehren([
        {
          name: 'Groß',
          befehl: process.execPath,
          args: ['-e', 'require("node:fs").writeSync(1, "x".repeat(2 * 1024 * 1024))'],
        },
      ]),
    ).toBe(0);
    expect(readFileSync(protokollPfad).length).toBeGreaterThan(2 * 1024 * 1024);
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe('Rust-Umgebung', () => {
  const pfadSchluessel =
    Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
  async function pruefumgebung(name = 'pruefen:rust') {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.mocked(spawnSync).mockImplementationOnce(() => ({
      pid: 1,
      output: [],
      stdout: null,
      stderr: null,
      status: 0,
      signal: null,
    }));
    await pruefungenAusfuehren([{ name, befehl: process.execPath, args: [] }]);
    return vi.mocked(spawnSync).mock.lastCall![2]!.env!;
  }

  function containerInstallation() {
    vi.stubEnv('CARGO_HOME', undefined);
    vi.stubEnv('RUSTUP_HOME', undefined);
    vi.mocked(existsSync).mockImplementation((pfad) =>
      ['/usr/local/cargo/bin/cargo', '/usr/local/rustup/settings.toml'].includes(String(pfad)),
    );
  }

  it.skipIf(process.platform !== 'linux').each(['pruefen:rust', 'pruefen:rust-clippy'])(
    '%s findet die Container-Toolchain und Caches ohne Shell-Profil',
    async (name) => {
      containerInstallation();
      vi.stubEnv(pfadSchluessel, '/usr/bin');
      const env = await pruefumgebung(name);
      expect(env[pfadSchluessel]).toBe(`/usr/local/cargo/bin${delimiter}/usr/bin`);
      expect(env.CARGO_HOME).toBe('/usr/local/cargo');
      expect(env.RUSTUP_HOME).toBe('/usr/local/rustup');
    },
  );

  it.skipIf(process.platform !== 'linux')(
    'ergänzt die Container-Homes auch wenn cargo bereits im Suchpfad liegt',
    async () => {
      containerInstallation();
      vi.stubEnv(pfadSchluessel, '/usr/local/cargo/bin');
      const env = await pruefumgebung();
      expect(env[pfadSchluessel]).toBe('/usr/local/cargo/bin');
      expect(env.CARGO_HOME).toBe('/usr/local/cargo');
      expect(env.RUSTUP_HOME).toBe('/usr/local/rustup');
    },
  );

  it('erhält ausdrücklich gesetzte Homes', async () => {
    containerInstallation();
    vi.stubEnv(pfadSchluessel, '/usr/local/cargo/bin');
    vi.stubEnv('CARGO_HOME', '/eigener/cargo');
    vi.stubEnv('RUSTUP_HOME', '/eigener/rustup');
    const env = await pruefumgebung();
    expect(env.CARGO_HOME).toBe('/eigener/cargo');
    expect(env.RUSTUP_HOME).toBe('/eigener/rustup');
  });

  it('weist einer Installation im Benutzerverzeichnis keine Container-Homes zu', async () => {
    containerInstallation();
    vi.stubEnv(pfadSchluessel, '/usr/bin');
    const cargo = join(
      homedir(),
      '.cargo',
      'bin',
      process.platform === 'win32' ? 'cargo.exe' : 'cargo',
    );
    vi.mocked(existsSync).mockImplementation((pfad) => String(pfad) === cargo);
    const env = await pruefumgebung();
    expect(env[pfadSchluessel]).toBe(`${join(homedir(), '.cargo', 'bin')}${delimiter}/usr/bin`);
    expect(env.CARGO_HOME).toBeUndefined();
    expect(env.RUSTUP_HOME).toBeUndefined();
  });

  it('lässt die Umgebung anderer Prüfungen unverändert', async () => {
    containerInstallation();
    vi.stubEnv(pfadSchluessel, '/usr/bin');
    expect(await pruefumgebung('pruefen:typen')).toBe(process.env);
  });
});
