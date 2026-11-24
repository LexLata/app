// Sichert vollständiges Lesen der macOS-Menüquellen und den ID-Abgleich.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { leseMenuQuellen, sammleRustMenuIds } from '@/../scripts/werkzeuge/menuQuellenLesen';

const verzeichnisse: string[] = [];
afterEach(() => {
  for (const verzeichnis of verzeichnisse.splice(0)) {
    rmSync(verzeichnis, { recursive: true });
  }
});

function beispiel() {
  const verzeichnis = mkdtempSync(join(tmpdir(), 'lexlata-menu-'));
  verzeichnisse.push(verzeichnis);
  mkdirSync(join(verzeichnis, 'menu'));
  writeFileSync(join(verzeichnis, 'menu.rs'), 'mod ablage;\nmod hilfe;');
  writeFileSync(join(verzeichnis, 'menu', 'ablage.rs'), 'with_id(handle, "neuer-tab", true);');
  return verzeichnis;
}

it('liest die Hauptdatei und alle Menübegleitdateien, keine fremden Rust-Dateien', () => {
  const verzeichnis = beispiel();
  writeFileSync(join(verzeichnis, 'menu', 'hilfe.rs'), 'with_id(handle, "hilfe", true);');
  writeFileSync(join(verzeichnis, 'fenster.rs'), 'with_id(handle, "fremd", true);');
  mkdirSync(join(verzeichnis, 'fenster'));
  writeFileSync(join(verzeichnis, 'fenster', 'menu_sync.rs'), 'with_id(handle, "fremd", true);');
  expect([...sammleRustMenuIds(leseMenuQuellen(verzeichnis))].sort()).toEqual([
    'hilfe',
    'neuer-tab',
  ]);
});

it('meldet eine fehlende eingebundene Menüdatei statt still unvollständig zu lesen', () => {
  const verzeichnis = beispiel();
  writeFileSync(join(verzeichnis, 'menu', 'hilfe.rs'), 'with_id(handle, "hilfe", true);');
  rmSync(join(verzeichnis, 'menu', 'ablage.rs'));
  expect(() => leseMenuQuellen(verzeichnis)).toThrow('menu/ablage.rs');
});

it('lässt den ID-Abgleich scheitern, wenn eine ID künstlich entfernt wurde', () => {
  const verzeichnis = beispiel();
  writeFileSync(join(verzeichnis, 'menu', 'hilfe.rs'), '');
  expect(sammleRustMenuIds(leseMenuQuellen(verzeichnis)).has('neuer-tab')).toBe(true);
  writeFileSync(join(verzeichnis, 'menu', 'ablage.rs'), '// ID entfernt');
  expect(sammleRustMenuIds(leseMenuQuellen(verzeichnis)).has('neuer-tab')).toBe(false);
});
