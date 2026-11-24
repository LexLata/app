// pre-commit.test.ts
// Führt den echten Hook mit Werkzeugattrappen aus, ohne Git-Index oder Commits zu verändern.
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const cruiser =
  'npx dependency-cruiser src scripts --config scripts/automatisch/dependency-cruiser.cjs --output-type err';
const zeilenlimit = 'node scripts/automatisch/zeilenlimit-pruefen.mjs --staged';
const modulzyklen = 'node scripts/automatisch/modulzyklen-pruefen.mjs';
const architekturtests =
  'npx vitest run scripts/automatisch/architektur-regeln.test.ts scripts/automatisch/modulgrenzen.test.ts';

// Nur der Ordner der Shell: so findet der Hook kein installiertes gitleaks.
const shellOrdner = dirname(
  spawnSync('sh', ['-c', 'command -v sh'], { encoding: 'utf8' }).stdout.trim(),
);

async function fuehreHookAus(
  dateien: (string | { datei: string; status: string })[],
  fehler = '',
  benachrichtigungsfehler = false,
  { persoenlich = true, gitleaks = true }: { persoenlich?: boolean; gitleaks?: boolean } = {},
) {
  const ordner = await mkdtemp(join(tmpdir(), 'lexlata-pre-commit-'));
  try {
    await mkdir(join(ordner, 'src-tauri'));
    const protokoll = join(ordner, 'aufrufe');
    await writeFile(protokoll, '');
    const gitProtokoll = join(ordner, 'git-aufrufe');
    await writeFile(gitProtokoll, '');
    let attrappen = `git() {
printf '%s\\n' "$*" >> "$HOOK_GIT_AUFRUFE"
if [ "$1" = config ]; then
  [ -n "$HOOK_PERSOENLICH" ] && printf '%s\\n' "$HOOK_PERSOENLICH"
  return 0
fi
filter=ACDMRTUXB
for argument in "$@"; do
  case "$argument" in --diff-filter=*) filter="\${argument#--diff-filter=}" ;; esac
done
for eintrag in $HOOK_DATEIEN; do
  status="\${eintrag%%:*}"
  datei="\${eintrag#*:}"
  case "$filter" in *"$status"*) ;; *) continue ;; esac
  muster_begonnen=nein
  for muster in "$@"; do
    if [ "$muster_begonnen" = ja ]; then
      case "$datei" in $muster) printf '%s\\n' "$datei"; break ;; esac
    elif [ "$muster" = -- ]; then
      muster_begonnen=ja
    fi
  done
done
}
`;
    const werkzeuge = ['npx', 'node', 'bash', 'cargo', ...(gitleaks ? ['gitleaks'] : [])];
    for (const werkzeug of werkzeuge) {
      attrappen += `${werkzeug}() {
printf '%s\\n' "${werkzeug} $*" >> "$HOOK_AUFRUFE"
if [ "${werkzeug} $*" = "$HOOK_FEHLER" ] || { [ "$HOOK_BENACHRICHTIGUNGSFEHLER" = ja ] && [ "${werkzeug} $*" = "node scripts/automatisch/commit-benachrichtigung.mjs abgebrochen" ]; }; then
  echo 'Gezielter Prüffehler'
  return 7
fi
return 0
}
`;
    }
    // Shell-Funktionen ersetzen die Werkzeuge auch auf noexec-Tempverzeichnissen.
    await writeFile(
      join(ordner, 'pre-commit'),
      attrappen + (await readFile(new URL('../../.husky/pre-commit', import.meta.url), 'utf8')),
    );
    const ergebnis = spawnSync('sh', ['-e', join(ordner, 'pre-commit')], {
      cwd: ordner,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOOK_DATEIEN: dateien
          .map((eintrag) =>
            typeof eintrag === 'string' ? `M:${eintrag}` : `${eintrag.status}:${eintrag.datei}`,
          )
          .join(' '),
        HOOK_GIT_AUFRUFE: gitProtokoll,
        HOOK_AUFRUFE: protokoll,
        HOOK_FEHLER: fehler,
        HOOK_BENACHRICHTIGUNGSFEHLER: benachrichtigungsfehler ? 'ja' : 'nein',
        HOOK_PERSOENLICH: persoenlich ? 'true' : '',
        // Ohne Attrappe darf auch kein installiertes gitleaks gefunden werden.
        ...(gitleaks ? {} : { PATH: shellOrdner }),
      },
    });
    return {
      status: ergebnis.status,
      gitAufrufe: (await readFile(gitProtokoll, 'utf8')).trim().split('\n'),
      ausgabe: ergebnis.stdout + ergebnis.stderr,
      aufrufe: (await readFile(protokoll, 'utf8')).trim().split('\n'),
    };
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}

describe('Commit-Prüfung der Architekturregeln', () => {
  it.each([
    'scripts/automatisch/dependency-cruiser.cjs',
    'scripts/automatisch/modulgrenzen.cjs',
    'eslint.config.js',
  ])('prüft bei alleiniger Änderung von %s Graph und Architekturtests', async (datei) => {
    const ergebnis = await fuehreHookAus([datei]);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe).toContain(cruiser);
    expect(ergebnis.aufrufe).toContain(architekturtests);
    expect(ergebnis.aufrufe).not.toContain('npx knip');
  });
  it.each([
    'scripts/automatisch/dependency-cruiser.cjs',
    'scripts/automatisch/modulgrenzen.cjs',
    'eslint.config.js',
  ])('prüft auch bei Löschung von %s Graph und Architekturtests', async (datei) => {
    const ergebnis = await fuehreHookAus([{ datei, status: 'D' }]);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe).toContain(cruiser);
    expect(ergebnis.aufrufe).toContain(architekturtests);
    expect(ergebnis.gitAufrufe).toContain(
      'diff --cached --name-only --diff-filter=ACMRD -- scripts/automatisch/dependency-cruiser.cjs scripts/automatisch/modulgrenzen.cjs eslint.config.js',
    );
  });
  it('unterscheidet gelöschte TypeScript-Dateien von geänderten Regeln', async () => {
    const ergebnis = await fuehreHookAus([
      { datei: 'src/beispiel.ts', status: 'D' },
      'scripts/automatisch/dependency-cruiser.cjs',
    ]);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe).toContain(cruiser);
    expect(ergebnis.aufrufe).toContain(architekturtests);
    expect(ergebnis.aufrufe).not.toContain('npx knip');
    expect(ergebnis.aufrufe).not.toContain('node scripts/automatisch/jscpd-pruefen.mjs');
    // Gelöschte oder umbenannte Dateien können Einträge der Ausnahmeliste veralten lassen.
    expect(ergebnis.aufrufe).toContain(zeilenlimit);
  });
  it('prüft bei gemeinsam geänderten Regeln und TypeScript den Graphen nur einmal', async () => {
    const ergebnis = await fuehreHookAus([
      'scripts/automatisch/dependency-cruiser.cjs',
      'scripts/automatisch/modulgrenzen.cjs',
      'src/beispiel.ts',
    ]);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe.filter((aufruf) => aufruf === cruiser)).toHaveLength(1);
    expect(ergebnis.aufrufe.filter((aufruf) => aufruf === architekturtests)).toHaveLength(1);
    expect(ergebnis.aufrufe).toContain('npx knip');
    expect(ergebnis.aufrufe).toContain('node scripts/automatisch/jscpd-pruefen.mjs');
    expect(ergebnis.aufrufe).toContain(zeilenlimit);
  });
  it('behält die Graphprüfung bei alleiniger TypeScript-Änderung bei', async () => {
    const ergebnis = await fuehreHookAus(['src/beispiel.tsx']);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe).toContain(cruiser);
    expect(ergebnis.aufrufe).not.toContain(architekturtests);
  });
  it.each(['scripts/werkzeuge/werkzeug.mjs', 'scripts/automatisch/probe.test.ts'])(
    'prüft bei geändertem Skript %s den Graphen',
    async (datei) => {
      const ergebnis = await fuehreHookAus([datei]);
      expect(ergebnis.status).toBe(0);
      expect(ergebnis.aufrufe).toContain(cruiser);
    },
  );
  it('startet bei reiner Dokumentationsänderung keine Architekturprüfungen', async () => {
    const ergebnis = await fuehreHookAus(['docs/beispiel.md']);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe).not.toContain(cruiser);
    expect(ergebnis.aufrufe).not.toContain(architekturtests);
  });
  it.each([
    [cruiser, 'dependency-cruiser'],
    [architekturtests, 'architektur-regeln'],
  ])('bricht bei Fehler in %s mit verständlichem Marker ab', async (befehl, marker) => {
    const ergebnis = await fuehreHookAus(['scripts/automatisch/dependency-cruiser.cjs'], befehl);
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('Gezielter Prüffehler');
    expect(ergebnis.ausgabe).toContain(`Commit abgebrochen: ${marker}`);
    if (befehl === cruiser) expect(ergebnis.aufrufe).not.toContain(architekturtests);
  });
});

const texttests =
  'npx vitest run scripts/automatisch/textanzeige-verbindlich.test.ts scripts/automatisch/textanzeige-ausnahmen.test.ts scripts/automatisch/audit-textanzeige.test.ts scripts/automatisch/architektur-regeln.test.ts scripts/automatisch/pre-commit.test.ts';
describe('Commit-Prüfung der Textanzeige', () => {
  it.each([
    'eslint-rules/textanzeige-verbindlich.cjs',
    'scripts/automatisch/textanzeige-ausnahmen.mjs',
    'eslint.config.js',
    'scripts/audit/audit-eslint.mjs',
    'scripts/audit/audit-eslint.sh',
  ])('prüft isolierte Änderung/Löschung von %s', async (datei) => {
    for (const status of ['M', 'D']) {
      const ergebnis = await fuehreHookAus([{ datei, status }]);
      expect(ergebnis.status).toBe(0);
      expect(ergebnis.aufrufe).toContain(texttests);
    }
  });
  it('kontrolliert bei geänderter Produktionsdatei auch Ausnahmen', async () => {
    expect((await fuehreHookAus(['src/Anzeige.tsx'])).aufrufe).toContain(
      'node scripts/automatisch/textanzeige-ausnahmen.mjs',
    );
  });
  it('meldet gescheiterte Regeltests verständlich', async () => {
    const ergebnis = await fuehreHookAus(['eslint-rules/textanzeige-verbindlich.cjs'], texttests);
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('Commit abgebrochen: textanzeige-regeln');
  });
});

const durchreichtest = 'npx vitest run scripts/automatisch/interface-durchreichen.test.ts';
const durchreichlint = 'npx eslint src/**/*.index.ts';
describe('Commit-Prüfung der Durchreich-Regel', () => {
  it.each(['M', 'D'])(
    'prüft bei Regeländerung (Status %s) Regeltest und alle Interface-Dateien',
    async (status) => {
      const ergebnis = await fuehreHookAus([
        { datei: 'eslint-rules/interface-durchreichen.cjs', status },
      ]);
      expect(ergebnis.status).toBe(0);
      expect(ergebnis.aufrufe).toContain(durchreichtest);
      expect(ergebnis.aufrufe).toContain(durchreichlint);
    },
  );
  it('startet ohne Regeländerung keine Durchreichprüfung', async () => {
    const ergebnis = await fuehreHookAus(['src/beispiel.ts', 'eslint-rules/andere.cjs']);
    expect(ergebnis.aufrufe).not.toContain(durchreichtest);
    expect(ergebnis.aufrufe).not.toContain(durchreichlint);
  });
  it.each([durchreichtest, durchreichlint])(
    'bricht bei Fehler in %s mit verständlichem Marker ab',
    async (befehl) => {
      const ergebnis = await fuehreHookAus(['eslint-rules/interface-durchreichen.cjs'], befehl);
      expect(ergebnis.status).toBe(1);
      expect(ergebnis.ausgabe).toContain('Commit abgebrochen: interface-durchreichen');
    },
  );
});

describe('Commit-Prüfung der Zeilengrenze', () => {
  it.each(['src/beispiel.ts', 'src/Beispiel.tsx', 'src-tauri/src/beispiel.rs'])(
    'prüft bei geändertem %s',
    async (datei) => {
      const ergebnis = await fuehreHookAus([datei]);
      expect(ergebnis.status).toBe(0);
      expect(ergebnis.aufrufe).toContain(zeilenlimit);
    },
  );
  it.each([
    'scripts/automatisch/zeilenlimit-ausnahmen.json',
    'scripts/automatisch/zeilenlimit-pruefen.mjs',
  ])('prüft bei alleiniger Änderung von %s', async (datei) => {
    const ergebnis = await fuehreHookAus([datei]);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe).toContain(zeilenlimit);
  });
  it('startet bei reiner Dokumentationsänderung keine Zeilenprüfung', async () => {
    const ergebnis = await fuehreHookAus(['docs/beispiel.md']);
    expect(ergebnis.aufrufe).not.toContain(zeilenlimit);
  });
  it('blockiert den Commit bei einem Verstoß mit verständlichem Marker', async () => {
    const ergebnis = await fuehreHookAus(['src/beispiel.ts'], zeilenlimit);
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('Gezielter Prüffehler');
    expect(ergebnis.ausgabe).toContain('Commit abgebrochen: zeilenlimit');
  });
});

describe('Commit-Prüfung der Modulkreise', () => {
  it.each(['src/beispiel.ts', 'src/Beispiel.tsx'])('prüft bei geändertem %s', async (datei) => {
    const ergebnis = await fuehreHookAus([datei]);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe).toContain(modulzyklen);
  });
  it.each([
    'scripts/automatisch/dependency-cruiser.cjs',
    'scripts/automatisch/modulgrenzen.cjs',
    'eslint.config.js',
  ])('prüft bei alleiniger Änderung von %s', async (datei) => {
    expect((await fuehreHookAus([datei])).aufrufe).toContain(modulzyklen);
  });
  it('startet bei reiner Dokumentationsänderung keine Kreisprüfung', async () => {
    expect((await fuehreHookAus(['docs/beispiel.md'])).aufrufe).not.toContain(modulzyklen);
  });
  it('blockiert den Commit bei einem Kreis mit dem Prüfnamen als Marker', async () => {
    const ergebnis = await fuehreHookAus(['src/beispiel.ts'], modulzyklen);
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('Gezielter Prüffehler');
    expect(ergebnis.ausgabe).toContain('Commit abgebrochen: modulzyklen');
  });
});

const unterdrueckungen = 'node scripts/automatisch/unterdrueckungen-begruendet.mjs';
describe('Commit-Prüfung begründeter Unterdrückungen', () => {
  it.each(['src/a.ts', 'src/a.tsx', 'scripts/a.mjs', 'eslint-rules/a.cjs', 'eslint.config.js'])(
    'prüft bei Änderung von %s',
    async (datei) => {
      expect((await fuehreHookAus([datei])).aufrufe).toContain(unterdrueckungen);
    },
  );
  it('überspringt reine Dokumentationsänderungen', async () => {
    expect((await fuehreHookAus(['docs/a.md'])).aufrufe).not.toContain(unterdrueckungen);
  });
  it('blockiert Verstöße mit verständlichem Marker', async () => {
    const ergebnis = await fuehreHookAus(['scripts/a.mjs'], unterdrueckungen);
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('Commit abgebrochen: unterdrueckungen');
  });
});

describe('Benachrichtigung über abgebrochene Commits', () => {
  const benachrichtigung = 'node scripts/automatisch/commit-benachrichtigung.mjs abgebrochen';
  it.each([
    'gitleaks protect --staged --verbose',
    'npx lint-staged',
    'node scripts/automatisch/pfad-kleinschreibung.mjs --staged',
    'node scripts/automatisch/kopfkommentare.mjs --staged',
    'node scripts/automatisch/doppelte-dateinamen.mjs --staged',
    zeilenlimit,
    unterdrueckungen,
    'npx lockfile-lint --path package-lock.json --type npm --validate-https --allowed-hosts npm --validate-integrity',
    cruiser,
    modulzyklen,
    architekturtests,
    texttests,
    'node scripts/automatisch/textanzeige-ausnahmen.mjs',
    'node scripts/automatisch/jscpd-pruefen.mjs',
    'npx knip',
    'bash scripts/automatisch/rust-appdata-guard.sh',
    'node ../scripts/automatisch/wegwerf-heimat.mjs cargo test',
    'cargo clippy --all-targets -- -D warnings',
  ])('meldet den Abbruch bei %s genau einmal', async (fehler) => {
    const ergebnis = await fuehreHookAus(
      ['src/a.ts', 'src-tauri/src/a.rs', 'package.json', 'eslint.config.js'],
      fehler,
    );
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.aufrufe.filter((aufruf) => aufruf === benachrichtigung)).toHaveLength(1);
  });
  it('erhält den Abbruchstatus auch bei fehlgeschlagener Benachrichtigung', async () => {
    const ergebnis = await fuehreHookAus([], 'gitleaks protect --staged --verbose', true);
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.aufrufe).toEqual(['gitleaks protect --staged --verbose', benachrichtigung]);
  });
  it('meldet nach erfolgreicher Vorprüfung keinen Abbruch', async () => {
    const ergebnis = await fuehreHookAus(['src/a.ts']);
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.aufrufe).not.toContain(benachrichtigung);
  });
});

describe('Persönliche Hooks (lexlata.persoenlicheHooks)', () => {
  const benachrichtigung = 'node scripts/automatisch/commit-benachrichtigung.mjs abgebrochen';
  const gitleaksAufruf = 'gitleaks protect --staged --verbose';
  it('bricht persönlich ohne gitleaks mit Marker und Mitteilung ab', async () => {
    const ergebnis = await fuehreHookAus(['src/a.ts'], '', false, { gitleaks: false });
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('❌ Commit abgebrochen: gitleaks');
    expect(ergebnis.aufrufe).toEqual([benachrichtigung]);
  });
  it('warnt für Beitragende ohne gitleaks deutlich und prüft weiter', async () => {
    const ergebnis = await fuehreHookAus(['src/a.ts'], '', false, {
      gitleaks: false,
      persoenlich: false,
    });
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.ausgabe).toContain('gitleaks ist nicht installiert');
    expect(ergebnis.aufrufe).toContain('npx lint-staged');
    expect(ergebnis.aufrufe).toContain('npx knip');
  });
  it('lässt gitleaks für Beitragende laufen, wenn es installiert ist, und bricht bei Fund ab', async () => {
    const ergebnis = await fuehreHookAus(['src/a.ts'], gitleaksAufruf, false, {
      persoenlich: false,
    });
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.aufrufe).toEqual([gitleaksAufruf]);
  });
  it('sendet für Beitragende bei Abbruch keine Mitteilung', async () => {
    const ergebnis = await fuehreHookAus(['src/a.ts'], 'npx knip', false, { persoenlich: false });
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.ausgabe).toContain('❌ Commit abgebrochen: knip');
    expect(ergebnis.aufrufe).not.toContain(benachrichtigung);
  });
  it('liest die Einstellung als Boolean aus der lokalen Git-Konfiguration', async () => {
    const ergebnis = await fuehreHookAus([]);
    expect(ergebnis.gitAufrufe).toContain('config --bool --get lexlata.persoenlicheHooks');
  });
});
