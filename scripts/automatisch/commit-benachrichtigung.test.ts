// Prüft Systemmitteilung und Ton sowie den echten Hook ohne Commit oder Push.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { readFileSync } from 'node:fs';
import { benachrichtigeCommit } from './commit-benachrichtigung.mjs';

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawnSync: vi.fn(),
}));
vi.mock('node:os', () => ({ platform: vi.fn(() => 'darwin') }));

afterEach(() => {
  vi.resetAllMocks();
  vi.mocked(platform).mockReturnValue('darwin');
});

describe('Commit-Benachrichtigung', () => {
  it('zeigt unter macOS die Erfolgsmeldung und spielt Purr separat ab', () => {
    benachrichtigeCommit();
    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      'osascript',
      expect.arrayContaining(['Commit erfolgreich', 'LexLata']),
      expect.objectContaining({ stdio: 'ignore', timeout: 5000 }),
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'afplay',
      ['-v', '1', '/System/Library/Sounds/Purr.aiff'],
      expect.objectContaining({ stdio: 'ignore', timeout: 5000 }),
    );
  });

  it('meldet einen abgebrochenen Commit mit Basso', () => {
    benachrichtigeCommit('abgebrochen');
    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      'osascript',
      expect.arrayContaining(['Commit abgebrochen', 'LexLata']),
      expect.objectContaining({ stdio: 'ignore', timeout: 5000 }),
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      'afplay',
      ['-v', '1', '/System/Library/Sounds/Basso.aiff'],
      expect.objectContaining({ stdio: 'ignore', timeout: 5000 }),
    );
  });

  it.each(['linux', 'win32'] as const)('überspringt macOS-Werkzeuge unter %s', (system) => {
    vi.mocked(platform).mockReturnValue(system);
    benachrichtigeCommit();
    benachrichtigeCommit('abgebrochen');
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('versucht den Ton auch bei einem Bannerfehler und lässt Fehler nicht nach außen', () => {
    vi.mocked(spawnSync).mockImplementation(() => {
      throw new Error('Systemwerkzeug nicht verfügbar');
    });
    expect(() => benachrichtigeCommit()).not.toThrow();
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  async function fuehrePostCommitAus(einstellung: string) {
    const { spawnSync: echterAufruf } =
      await vi.importActual<typeof import('node:child_process')>('node:child_process');
    const hook = readFileSync(new URL('../../.husky/post-commit', import.meta.url), 'utf8');
    return echterAufruf(
      'sh',
      [
        '-e',
        '-c',
        `node() { echo "BENACHRICHTIGUNG $*"; return 7; }
git() {
  if [ "$1" = config ]; then [ -n "${einstellung}" ] && echo "${einstellung}"; return 0; fi
  echo "GIT $*"; return 1;
}
${hook}`,
      ],
      { encoding: 'utf8' },
    );
  }

  it('benachrichtigt persönlich vor dem Push und versucht ihn auch bei fehlgeschlagener Benachrichtigung', async () => {
    const ergebnis = await fuehrePostCommitAus('true');
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.stdout).toContain(
      'BENACHRICHTIGUNG scripts/automatisch/commit-benachrichtigung.mjs',
    );
    expect(ergebnis.stdout.indexOf('BENACHRICHTIGUNG')).toBeLessThan(
      ergebnis.stdout.indexOf('GIT push'),
    );
    expect(ergebnis.stdout).toContain('Push fehlgeschlagen');
  });

  it.each(['', 'false'])(
    'pusht und benachrichtigt ohne persönliche Hooks (Einstellung "%s") nicht',
    async (einstellung) => {
      const ergebnis = await fuehrePostCommitAus(einstellung);
      expect(ergebnis.status).toBe(0);
      expect(ergebnis.stdout).toBe('');
    },
  );
});
