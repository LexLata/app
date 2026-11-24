// @vitest-environment jsdom
// Die abgeleitete Konfliktdatei fällt nicht unter die Versionssicherung der Nutzerdaten.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { beforeEach, expect, it } from 'vitest';
import { schreibeGesetzKonflikte } from './konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
beforeEach(() => aufbau.bereiteNativeAttrappeVor());
it('überschreibt die vorhandene Konfliktdatei mit abweichender Version ohne Sicherung', async () => {
  const pfad = aufbau.basis + 'markierungskonflikte.xml';
  aufbau.native.texte.set(
    pfad,
    '<markierungskonflikte version="2"><zukunft/></markierungskonflikte>',
  );
  await schreibeGesetzKonflikte(new Map());
  expect(aufbau.native.texte.get(pfad)).toContain('version="1"');
  expect([...aufbau.native.texte.keys()].some((datei) => datei.endsWith('.bak'))).toBe(false);
});
