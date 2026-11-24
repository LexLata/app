// Ein gemeinsamer echter Hilfsfensterbestand je Aktions-Test mit sauberem Lebensdauerende.
import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import { invoke } from '@tauri-apps/api/core';
import { readTextFile, exists, readDir, mkdir } from '@tauri-apps/plugin-fs';
import { beforeEach, afterEach } from 'vitest';
import { erzeugeGeladeneGesetze, type GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
export function markierungsFensterGesetzLader(): GesetzLader {
  let bestand: ReturnType<typeof erzeugeGeladeneGesetze>;
  beforeEach(() => {
    richteNativeEreignisgrenzeEin(async (befehl, args) => {
      const pfad = String(args?.path);
      if (befehl === 'plugin:path|resolve_directory') return args?.path ?? '/daten';
      if (befehl === 'plugin:path|join')
        return Array.isArray(args?.paths) ? args.paths.map(String).join('/') : '';
      if (befehl === 'plugin:fs|read_text_file')
        return new TextEncoder().encode(await readTextFile(pfad));
      if (befehl === 'plugin:fs|exists') return exists(pfad);
      if (befehl === 'plugin:fs|read_dir') return readDir(pfad);
      if (befehl === 'plugin:fs|mkdir') return mkdir(pfad);
      return invoke(befehl, args);
    });
    bestand = erzeugeGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  });
  afterEach(() => bestand.beenden());
  return (referenz, empfangen) => bestand.ladeGesetz(referenz, empfangen);
}
