// @vitest-environment jsdom
// Der abgeleitete Importindex fällt nicht unter die Versionssicherung der Nutzerdaten.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { beforeEach, expect, it } from 'vitest';
import { speichereImportindexAktualisierung } from './importindexErstellung.persistenz';
beforeEach(() => aufbau.bereiteNativeAttrappeVor());
it('überschreibt einen vorhandenen Importindex mit abweichender Version ohne Sicherung', async () => {
  const pfad = aufbau.basis + 'importindizes/de-bund.xml';
  aufbau.native.texte.set(pfad, '<importindex version="2"><zukunft/></importindex>');
  const neu =
    '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-11-05T00:00:00Z</verarbeitungszeit></infos><inhalt/></importindex>';
  await speichereImportindexAktualisierung('de-bund', neu);
  expect(aufbau.native.texte.get(pfad)).toContain('<importindex version="1">');
  expect(aufbau.native.texte.get(pfad)).not.toContain('zukunft');
  expect([...aufbau.native.texte.keys()].some((datei) => datei.endsWith('.bak'))).toBe(false);
});
