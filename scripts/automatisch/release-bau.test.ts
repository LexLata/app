// release-bau.test.ts
// Sicherheitsregeln des öffentlichen Release-Bau-Workflows.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/release-bau.yml', 'utf8');

/** Liefert die verletzten Sicherheitsregeln eines Workflow-Texts. */
function regelverstoesse(text: string): string[] {
  const zeilen = text.split('\n').filter((zeile) => !/^\s*#/.test(zeile));
  const ohneKommentare = zeilen.map((zeile) => zeile.replace(/\s+#.*$/, '')).join('\n');
  const verstoesse: string[] = [];

  const onBlock = ohneKommentare.match(/^on:\s*\n((?: {2,}.*\n?)*)/m);
  const ausloeser = onBlock?.[1].match(/^ {2}([\w-]+):/gm)?.map((z) => z.trim().slice(0, -1));
  if (!onBlock || ausloeser?.join(',') !== 'workflow_dispatch') {
    verstoesse.push('nur workflow_dispatch');
  }

  const rechte = [...ohneKommentare.matchAll(/^( *)permissions:(.*)\n((?:\1 {2}.*\n?)*)/gm)];
  const nurLesen =
    rechte.length === 1 &&
    rechte[0][1] === '' &&
    rechte[0][2].trim() === '' &&
    rechte[0][3].trim() === 'contents: read';
  if (!nurLesen) verstoesse.push('nur Leserechte');

  if (/secrets\./.test(ohneKommentare)) verstoesse.push('keine Secrets');
  if (/\bcache\b|rust-cache/i.test(ohneKommentare)) verstoesse.push('kein Cache');

  const uses = [...ohneKommentare.matchAll(/uses:\s*(\S+)/g)].map((treffer) => treffer[1]);
  if (uses.some((ziel) => !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(ziel))) {
    verstoesse.push('uses per SHA');
  }

  const checkouts = [
    ...ohneKommentare.matchAll(/uses: *actions\/checkout@\S+\n((?:(?! *- ) +\S.*\n?)*)/g),
  ];
  if (
    checkouts.length === 0 ||
    checkouts.some((treffer) => !/persist-credentials:\s*false\b/.test(treffer[1]))
  ) {
    verstoesse.push('persist-credentials: false');
  }
  return verstoesse;
}

describe('Release-Bau-Workflow', () => {
  it('hält alle Sicherheitsregeln ein', () => {
    expect(regelverstoesse(workflow)).toEqual([]);
  });

  const sha = /@[0-9a-f]{40}/;
  it.each([
    ['nur workflow_dispatch', (t: string) => t.replace('on:\n', 'on:\n  push:\n')],
    [
      'nur workflow_dispatch',
      (t: string) => t.replace('  workflow_dispatch:\n', '  pull_request_target:\n'),
    ],
    ['nur Leserechte', (t: string) => t.replace('contents: read', 'contents: write')],
    [
      'nur Leserechte',
      (t: string) => t.replace('contents: read', 'contents: read\n  actions: write'),
    ],
    [
      'nur Leserechte',
      (t: string) => t.replace('permissions:\n  contents: read', 'permissions: write-all'),
    ],
    [
      'nur Leserechte',
      (t: string) =>
        t.replace(
          '    runs-on: windows-latest',
          '    permissions:\n      contents: write\n    runs-on: windows-latest',
        ),
    ],
    ['keine Secrets', (t: string) => t.replace('run: npm ci', 'run: echo ${{ secrets.TOKEN }}')],
    [
      'kein Cache',
      (t: string) => t.replace(/(node-version-file: 'package.json')/, '$1\n          cache: npm'),
    ],
    [
      'kein Cache',
      (t: string) =>
        t.replace(
          '      - name: Abhängigkeiten installieren',
          '      - uses: Swatinem/rust-cache@6323deb102c322ba6fcbdcafc7e3dddab59af2b6\n      - name: Abhängigkeiten installieren',
        ),
    ],
    ['uses per SHA', (t: string) => t.replace(sha, '@v7')],
    ['uses per SHA', (t: string) => t.replace(sha, '@main')],
    [
      'persist-credentials: false',
      (t: string) => t.replace('persist-credentials: false', 'persist-credentials: true'),
    ],
    [
      'persist-credentials: false',
      (t: string) => t.replace(/\n {8}with:\n {10}persist-credentials: false/, ''),
    ],
  ])('erkennt den Verstoß gegen „%s“', (regel, abwandeln) => {
    const abgewandelt = abwandeln(workflow);
    expect(abgewandelt).not.toBe(workflow);
    expect(regelverstoesse(abgewandelt)).toContain(regel);
  });
});

it('verlangt in der App-Konfiguration eine signierte Update-Version', () => {
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  expect(config.plugins.updater.requireSignedVersion).toBe(true);
});
