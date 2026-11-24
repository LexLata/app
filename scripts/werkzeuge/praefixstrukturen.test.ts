// praefixstrukturen.test.ts
// CLI-Vertrag mit echtem npm und temporärem Tauri-Script ohne Appstart.
import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bereiteGrundbestandVor, bereitePraefixlaufStartVor } from './praefixstrukturenArgumente';

it.each(['de-bund', 'de-bw'])('bereitet %s mit getrennten absoluten Zielen vor', (normgeber) => {
  const repository = resolve('repository-test');
  const start = bereitePraefixlaufStartVor([normgeber, '10'], repository);
  expect(start.argumente).toEqual(['tauri', '--', 'dev', '--no-watch']);
  expect(start.umgebung).toEqual({
    LEXLATA_PRAEFIXLAUF: normgeber,
    LEXLATA_PRAEFIXLAUF_MODUS: 'praefix',
    LEXLATA_PRAEFIXLAUF_NEU: undefined,
    LEXLATA_PRAEFIXLAUF_DEBUG: undefined,
    LEXLATA_PRAEFIXLAUF_ANZAHL: '10',
    LEXLATA_PRAEFIXLAUF_GESCHEITERT: undefined,
    LEXLATA_PRAEFIXLAUF_KURZTITEL: undefined,
    LEXLATA_PRAEFIXLAUF_DATEI: join(
      repository,
      'src-tauri/resources/praefixstrukturen',
      `${normgeber}.xml`,
    ),
    LEXLATA_PRAEFIXLAUF_ARBEITSDATEN: join(repository, 'arbeitsdaten'),
  });
});
it('leitet die gezielte Auswahl mit ihrer Anzahl weiter', () => {
  const { umgebung } = bereitePraefixlaufStartVor(
    ['de-bund', '--kurztitel', 'GG,EGBGB,StGB'],
    '/repo',
  );
  expect(umgebung.LEXLATA_PRAEFIXLAUF_ANZAHL).toBe('3');
  expect(umgebung.LEXLATA_PRAEFIXLAUF_KURZTITEL).toBe('GG,EGBGB,StGB');
});
it.each([
  [],
  ['eu', '10'],
  ['de-bund'],
  ['de-bund', '0'],
  ['de-bund', '-1'],
  ['de-bund', '1.5'],
  ['de-bund', '1e2'],
  ['de-bw', '10', 'extra'],
  ['de-bund', '--kurztitel', ''],
  ['de-bund', '--kurztitel', 'GG,'],
])('weist ungültige Argumente %j zurück', (...argumente) => {
  expect(() => bereitePraefixlaufStartVor(argumente, '/repo')).toThrow();
});

it.each([
  ['praefixstrukturen', 'de-bund', '10'],
  ['praefixstrukturen', 'de-bw', '10'],
  ['quelldateien', 'de-bund', '10'],
  ['gesetzesxml', 'de-bund', '10'],
  ['quelldateien', 'eu', 'alle'],
  ['gesetzesxml', 'eu', 'alle'],
])(
  'reicht für %s %s %s über echtes npm Auftrag und App-Exit-Code weiter',
  (skript, normgeber, anzahl) => {
    const ordner = mkdtempSync(join(tmpdir(), 'lexlata-cli-'));
    const npm = join(ordner, 'npm.cjs');
    const echtesNpm = process.env.npm_execpath;
    expect(echtesNpm).toBeTruthy();
    try {
      writeFileSync(
        join(ordner, 'package.json'),
        JSON.stringify({ scripts: { tauri: 'node tauri.cjs' } }),
      );
      // Der Einstieg behält sein Repository-Ziel. Nur npm wird auf das temporäre
      // Paket gelenkt; dessen echte Argumentverarbeitung bleibt Teil des Tests.
      writeFileSync(
        npm,
        `const { spawnSync } = require('node:child_process'); const kind = spawnSync(process.execPath, [${JSON.stringify(echtesNpm)}, '--prefix', __dirname, ...process.argv.slice(2)], { stdio: 'inherit' }); process.exit(kind.status ?? 1);`,
      );
      writeFileSync(
        join(ordner, 'tauri.cjs'),
        `console.log(JSON.stringify({ argumente: process.argv.slice(2), umgebung: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('LEXLATA_PRAEFIXLAUF'))) })); process.exit(7);`,
      );
      const lauf = spawnSync(
        process.execPath,
        ['scripts/werkzeuge/praefixstrukturen.mjs', normgeber, anzahl],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            npm_execpath: npm,
            npm_lifecycle_event: skript,
            LEXLATA_PRAEFIXLAUF_KURZTITEL: 'ALT',
            LEXLATA_PRAEFIXLAUF_DATEI: 'ALT',
          },
        },
      );
      expect(lauf.status).toBe(7);
      const ausgabe = JSON.parse(lauf.stdout.trim().split('\n').at(-1)!);
      expect(ausgabe.argumente).toEqual(['dev', '--no-watch']);
      expect(ausgabe.umgebung.LEXLATA_PRAEFIXLAUF).toBe(normgeber);
      expect(ausgabe.umgebung.LEXLATA_PRAEFIXLAUF_ANZAHL).toBe(
        anzahl === 'alle' ? String(Number.MAX_SAFE_INTEGER) : anzahl,
      );
      expect(ausgabe.umgebung.LEXLATA_PRAEFIXLAUF_KURZTITEL).toBeUndefined();
      expect(ausgabe.umgebung.LEXLATA_PRAEFIXLAUF_MODUS).toBe(
        skript === 'praefixstrukturen' ? 'praefix' : skript,
      );
      if (skript !== 'praefixstrukturen')
        expect(ausgabe.umgebung.LEXLATA_PRAEFIXLAUF_DATEI).toBeUndefined();
      else
        expect(ausgabe.umgebung.LEXLATA_PRAEFIXLAUF_DATEI).toBe(
          resolve('src-tauri/resources/praefixstrukturen', `${normgeber}.xml`),
        );
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  },
);

it('begrenzt die Wiederholung gespeicherter Fehlschläge mit eigener Auswahl', () => {
  const { umgebung } = bereitePraefixlaufStartVor(['de-bw', 'gescheitert', '10'], '/repo');
  expect(umgebung.LEXLATA_PRAEFIXLAUF_GESCHEITERT).toBe('1');
  expect(umgebung.LEXLATA_PRAEFIXLAUF_ANZAHL).toBe('10');
  expect(() => bereitePraefixlaufStartVor(['de-bw', 'gescheitert', '0'], '/repo')).toThrow();
});

it.each(['quelldateien', 'gesetzesxml'] as const)('bereitet %s ohne Listenpfad vor', (modus) => {
  const { umgebung } = bereitePraefixlaufStartVor(['de-bund', 'alle'], '/repo', modus);
  expect(umgebung.LEXLATA_PRAEFIXLAUF_MODUS).toBe(modus);
  expect(umgebung.LEXLATA_PRAEFIXLAUF_ANZAHL).toBe(String(Number.MAX_SAFE_INTEGER));
  expect(umgebung.LEXLATA_PRAEFIXLAUF_DATEI).toBeUndefined();
  expect(() => bereitePraefixlaufStartVor(['eu', 'gescheitert', '1'], '/repo', modus)).toThrow();
});
it('bereitet die Offline-Auswertung ohne Anzahl vor', () => {
  const { umgebung } = bereitePraefixlaufStartVor(['de-bund'], '/repo', 'auswerten');
  expect(umgebung.LEXLATA_PRAEFIXLAUF_ANZAHL).toBeUndefined();
  expect(umgebung.LEXLATA_PRAEFIXLAUF_DATEI).toMatch(/de-bund.xml$/);
  expect(() => bereitePraefixlaufStartVor(['de-bund', '10'], '/repo', 'auswerten')).toThrow();
});
it.each(['gesetzesxml', 'quelldateien'] as const)('erlaubt --neu für %s', (modus) => {
  expect(
    bereitePraefixlaufStartVor(['de-bw', '2', '--neu'], '/repo', modus).umgebung
      .LEXLATA_PRAEFIXLAUF_NEU,
  ).toBe('1');
  expect(() => bereitePraefixlaufStartVor(['de-bw', '2', '--neu'], '/repo')).toThrow();
});

it.each([
  ['de-bund', '10'],
  ['de-bund', 'alle'],
  ['de-bw', '10'],
  ['de-bw', 'alle'],
  ['de-bw', '--kurztitel', 'LBO,LVwVfG'],
  ['de-bund', '--kurztitel', 'GG,EGBGB'],
  ['eu', '10'],
  ['eu', 'alle'],
  ['eu', '--kurztitel', 'DSGVO'],
])('bereitet Quelldateien %j ohne PräfixstrukturXML vor', (...args) => {
  const { umgebung } = bereitePraefixlaufStartVor(args, '/repo', 'quelldateien');
  expect(umgebung.LEXLATA_PRAEFIXLAUF_MODUS).toBe('quelldateien');
  expect(umgebung.LEXLATA_PRAEFIXLAUF_DATEI).toBeUndefined();
});
it.each([
  ['de-bund', '0'],
  ['de-bund', '--kurztitel', ''],
])('weist Quelldateien %j mit Hinweis zurück', (...args) => {
  expect(() => bereitePraefixlaufStartVor(args, '/repo', 'quelldateien')).toThrow();
});

it.each([
  ['de-bund', 'alle'],
  ['eu', 'alle'],
  ['eu', '10', '--neu'],
  ['eu', '--kurztitel', 'DSGVO'],
  ['de-bw', '10', '--neu'],
  ['de-bund', '--kurztitel', 'GG'],
])('bereitet GesetzesXML %j offline vor', (...args) => {
  const { umgebung } = bereitePraefixlaufStartVor(args, '/repo', 'gesetzesxml');
  expect(umgebung.LEXLATA_PRAEFIXLAUF_MODUS).toBe('gesetzesxml');
  expect(umgebung.LEXLATA_PRAEFIXLAUF_DATEI).toBeUndefined();
});
it('weist --neu bei anderen Befehlen zurück', () => {
  for (const modus of ['praefix', 'auswerten'] as const)
    expect(() => bereitePraefixlaufStartVor(['de-bund', '10', '--neu'], '/repo', modus)).toThrow();
});

it.each([
  ['de-bund', '--offline'],
  ['de-bw', '--offline', '--kurztitel', 'A,B'],
])('bereitet Offline-Auswertung vor: %j', (...args) => {
  const start = bereitePraefixlaufStartVor(args, '/repo');
  expect(start.umgebung.LEXLATA_PRAEFIXLAUF_MODUS).toBe('auswerten');
  expect(start.umgebung.LEXLATA_PRAEFIXLAUF_ANZAHL).toBeUndefined();
  expect(start.umgebung.LEXLATA_PRAEFIXLAUF_KURZTITEL).toBe(args[3]);
});
it.each([
  ['eu', '--offline'],
  ['de-bund', '10', '--offline'],
  ['de-bw', '--offline', '--offline'],
])('verweigert ungültige Offline-Auswahl: %j', (...args) => {
  expect(() => bereitePraefixlaufStartVor(args, '/repo')).toThrow();
});

it.each([
  ['--debug', 'de-bund', '2'],
  ['de-bund', '--debug', '2'],
  ['de-bund', '2', '--debug'],
])('aktiviert Debug unabhängig von der Position %j', (...args) => {
  expect(bereitePraefixlaufStartVor(args, '/repo').umgebung.LEXLATA_PRAEFIXLAUF_DEBUG).toBe('1');
});
it.each([
  ['de-bund', '2', '--debug', '--debug'],
  ['de-bund', '2', '--unbekannt'],
  ['de-bund', '--kurztitel', '--unbekannt'],
  ['de-bund', '--kurztitel', '--kurztitel'],
])('weist mehrfache oder unbekannte Optionen zurück %j', (...args) => {
  expect(() => bereitePraefixlaufStartVor(args, '/repo')).toThrow();
});

it('kombiniert Debug mit Offlineauswertung und allen drei Laufbefehlen', () => {
  for (const modus of ['praefix', 'quelldateien', 'gesetzesxml'] as const) {
    expect(
      bereitePraefixlaufStartVor(['de-bund', '--debug', '2'], '/repo', modus).umgebung
        .LEXLATA_PRAEFIXLAUF_DEBUG,
    ).toBe('1');
  }
  expect(
    bereitePraefixlaufStartVor(['--debug', 'de-bund', '--offline'], '/repo').umgebung,
  ).toMatchObject({
    LEXLATA_PRAEFIXLAUF_DEBUG: '1',
    LEXLATA_PRAEFIXLAUF_MODUS: 'auswerten',
  });
});

it.each([
  'bund',
  'bw',
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'europarat',
])('lehnt die nicht unterstützte Entwicklerquelle %s mit den neuen Codes ab', (normgeber) => {
  expect(() => bereitePraefixlaufStartVor([normgeber, '10'], '/repo')).toThrow(
    /de-bund.*de-bw.*eu/,
  );
});

it.each(['praefix', 'auswerten'] as const)('lehnt eu vor Tauri im Modus %s ab', (modus) => {
  const args = modus === 'auswerten' ? ['eu'] : ['eu', '10'];
  expect(() => bereitePraefixlaufStartVor(args, '/repo', modus)).toThrow(/de-bund.*de-bw/);
});

it.each([
  'bund',
  'bw',
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  'europarat',
])('stoppt %s im npm-Einstieg vor dem Tauri-Aufruf', (normgeber) => {
  const lauf = spawnSync(
    process.execPath,
    ['scripts/werkzeuge/praefixstrukturen.mjs', normgeber, '10'],
    { encoding: 'utf8', env: { ...process.env, npm_execpath: '/darf-nicht-starten.cjs' } },
  );
  expect(lauf.status).toBe(1);
  expect(lauf.stderr).toMatch(/de-bund.*de-bw.*eu/);
  expect(lauf.stdout).toBe('');
});

// Grundbestand: Liste und Bestand liegen in einem temporären Repository (Dateisystem als Grenze).
const grundbestandsliste = (inhalt: string) =>
  `<grundbestand version="1"><infos><geaendert>2026-11-18T12:00:00Z</geaendert></infos><inhalt>${inhalt}</inhalt></grundbestand>`;
const testindex = (normgeber: string, ...kurztitel: string[]) =>
  `<importindex version="1"><infos><verarbeitungszeit>2026-11-19T00:00:00Z</verarbeitungszeit><normgeber>${normgeber}</normgeber><datenquelle name="Test"/></infos><inhalt>${kurztitel
    .map(
      (titel, i) =>
        `<gesetz><langtitel>Gesetz ${i}</langtitel><kurztitel>${titel}</kurztitel><abrufkennung>k${i}</abrufkennung></gesetz>`,
    )
    .join('')}</inhalt></importindex>`;
function mitTestrepository(pruefe: (repository: string) => void) {
  const repository = mkdtempSync(join(tmpdir(), 'lexlata-grundbestand-'));
  try {
    const ressourcen = join(repository, 'src-tauri/resources');
    mkdirSync(join(ressourcen, 'importindizes'), { recursive: true });
    mkdirSync(join(ressourcen, 'europa'), { recursive: true });
    writeFileSync(
      join(ressourcen, 'importindizes/de-bund.xml'),
      testindex('de-bund', 'GG', 'G 10'),
    );
    writeFileSync(
      join(ressourcen, 'importindizes/de-bw.xml'),
      testindex('de-bw', 'LBO', 'VwRefG', 'vwrefg'),
    );
    writeFileSync(
      join(ressourcen, 'europa/europaKuratiert.json'),
      JSON.stringify([{ celex: '32016R0679', kurztitel: 'DSGVO', langtitel: 'Verordnung' }]),
    );
    pruefe(repository);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

it('P2-A1: bereitet den Grundbestand mit Kurztiteln in Schreibweise des Bestands vor', () => {
  mitTestrepository((repository) => {
    mkdirSync(join(repository, 'listen'));
    writeFileSync(
      join(repository, 'listen/liste.xml'),
      grundbestandsliste(
        '<bund><gesetz>gg</gesetz><gesetz>G 10</gesetz></bund><bw><gesetz>lbo</gesetz></bw><eu><gesetz>DSGVO</gesetz></eu>',
      ),
    );
    const vorbereitung = bereiteGrundbestandVor(
      ['liste.xml', '--neu', '--debug'],
      repository,
      join(repository, 'listen'),
    );
    expect(vorbereitung.arbeitsdaten).toBe(join(repository, 'arbeitsdaten'));
    expect(
      vorbereitung.laeufe.map(({ normgeber, kurztitel, start }) => ({
        normgeber,
        kurztitel,
        argumente: start.argumente,
        umgebung: start.umgebung,
      })),
    ).toEqual(
      (
        [
          ['de-bund', ['GG', 'G 10']],
          ['de-bw', ['LBO']],
          ['eu', ['DSGVO']],
        ] as const
      ).map(([normgeber, kurztitel]) => ({
        normgeber,
        kurztitel,
        argumente: ['tauri', '--', 'dev', '--no-watch'],
        umgebung: {
          LEXLATA_PRAEFIXLAUF: normgeber,
          LEXLATA_PRAEFIXLAUF_MODUS: 'quelldateien',
          LEXLATA_PRAEFIXLAUF_ANZAHL: String(kurztitel.length),
          LEXLATA_PRAEFIXLAUF_KURZTITEL: kurztitel.join(','),
          LEXLATA_PRAEFIXLAUF_NEU: '1',
          LEXLATA_PRAEFIXLAUF_DEBUG: '1',
          LEXLATA_PRAEFIXLAUF_ARBEITSDATEN: join(repository, 'arbeitsdaten'),
        },
      })),
    );
  });
});

it('P2-A1: lässt Normgeber ohne Einträge aus', () => {
  mitTestrepository((repository) => {
    const datei = join(repository, 'liste.xml');
    writeFileSync(datei, grundbestandsliste('<bw><gesetz>LBO</gesetz></bw>'));
    const { laeufe } = bereiteGrundbestandVor([datei], repository, '/');
    expect(laeufe.map((l) => l.normgeber)).toEqual(['de-bw']);
    expect(laeufe[0]?.start.umgebung.LEXLATA_PRAEFIXLAUF_NEU).toBeUndefined();
  });
});

it.each([
  ['fehlender Datei', null, /nicht lesbar/],
  ['ungültiger Datei', '<gesetzesliste/>', /ungültig/],
  [
    'unbekanntem Kurztitel',
    grundbestandsliste('<bund><gesetz>Unbekannt</gesetz></bund>'),
    /nicht im Bestand \(de-bund\): Unbekannt/,
  ],
  [
    'mehrdeutigem Kurztitel',
    grundbestandsliste('<bw><gesetz>VwRefG</gesetz></bw>'),
    /mehrdeutig \(de-bw\): VwRefG/,
  ],
])('P2-A1: weist die Grundbestandsliste bei %s vor dem Appstart ab', (_fall, inhalt, meldung) => {
  mitTestrepository((repository) => {
    const datei = join(repository, 'liste.xml');
    if (inhalt !== null) writeFileSync(datei, inhalt);
    expect(() => bereiteGrundbestandVor([datei], repository, '/')).toThrow(meldung);
  });
});

it.each([[[]], [['a.xml', 'b.xml']], [['a.xml', '--neu', '--neu']], [['a.xml', '--kurztitel']]])(
  'P2-A1: weist den Grundbestandsaufruf %j ab',
  (argumente) => {
    expect(() => bereiteGrundbestandVor(argumente, '/repo', '/')).toThrow(/Aufruf/);
  },
);

it('P2-A1: stoppt eine unbekannte Angabe im npm-Einstieg vor dem Tauri-Aufruf (jsdom statt vitest)', () => {
  const ordner = mkdtempSync(join(tmpdir(), 'lexlata-grundbestand-cli-'));
  try {
    writeFileSync(
      join(ordner, 'liste.xml'),
      grundbestandsliste('<bund><gesetz>KeinGesetzXYZ</gesetz></bund>'),
    );
    const lauf = spawnSync(
      process.execPath,
      ['scripts/werkzeuge/praefixstrukturen.mjs', 'liste.xml'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          npm_execpath: '/darf-nicht-starten.cjs',
          npm_lifecycle_event: 'grundbestand',
          INIT_CWD: ordner,
        },
      },
    );
    expect(lauf.stderr).toMatch(/nicht im Bestand \(de-bund\): KeinGesetzXYZ/);
    expect(lauf.status).toBe(1);
    expect(lauf.stdout).toBe('');
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
});
