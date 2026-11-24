// verweismarkierungAktionen.import.test.ts
// Verweismarkierungimport mit echter Referenzauflösung bis zum EU-Ressourcenlink.
import { beforeEach, expect, it, vi } from 'vitest';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { versucheFehlendeGesetzeImportieren } from './verweismarkierungAktionen';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const mocks = vi.hoisted(() => ({
  gesetze: vi.fn(),
  // Inhalt der mitgelieferten Europa-Datei je Lesevorgang (Verzeichnis, Import).
  bundle: vi.fn(),
  geschrieben: new Array<string>(),
}));
const BUNDLE_DATEI = 'DSGVO_vollstaendiger-Ressourcenlink.xml';
// Mitgeliefertes Europa-Bundle: ein Gesetz, keine kuratierte CELEX-Liste.
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: async (pfad: string) =>
    pfad === 'resources/europa' ? [{ name: BUNDLE_DATEI, isFile: true }] : [],
  readTextFile: async (pfad: string) => {
    if (pfad === `resources/europa/${BUNDLE_DATEI}`) return mocks.bundle(pfad);
    if (pfad === 'resources/europa/europaKuratiert.json') return '[]';
    throw new Error('fehlt');
  },
  exists: async () => false,
  mkdir: async () => {},
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string) => {
    if (befehl === 'gesetz_import_sperre_versuchen_zu_erhalten') return true;
    if (befehl === 'import_aktualisierung_starten') return 'vorgang';
    if (befehl === 'gesetz_dateistempel_lesen') return [];
    if (befehl.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    return undefined;
  },
  isTauri: () => false,
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => {},
  emitTo: async () => {},
  listen: async () => () => {},
}));
// Gespeicherte Gesetzesdateien werden über den Bestand (ladeAlleGesetze) sichtbar.
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sicherstelleOrdner: async () => {},
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('token'),
  mitDateiSperren: async (
    pfade: string[],
    aktion: (tokens: Map<string, string>) => Promise<unknown>,
  ) => aktion(new Map(pfade.map((pfad) => [pfad, 'token']))),
  appDatenExistiert: async () => false,
  appDatenOrdnerLesen: async () => [],
  appDatenLesenOderNull: async () => null,
  appDatenSchreiben: async (pfad: string) => {
    mocks.geschrieben.push(pfad);
    if (pfad.startsWith('gesetze/')) mocks.gesetze.mockResolvedValue([gespeichertesGesetz(pfad)]);
  },
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: async () => 'vorgang',
  schliessePruefpflichtigeQuelleAb: async () => true,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ladeAlleGesetze: mocks.gesetze,
  leseGesetz: async (referenz: GesetzDarstellung, empfangen?: AktionsMeldungEmpfaenger) => {
    const liste: GesetzDarstellung[] = await mocks.gesetze(undefined, empfangen);
    const gesetz = liste.find(
      (g) =>
        g.kurztitel.toLowerCase() === referenz.kurztitel.toLowerCase() &&
        g.normgeber === referenz.normgeber,
    );
    return gesetz ? { status: 'geladen', gesetz, befunde: [] } : { status: 'fehlt', befunde: [] };
  },
}));

const euGesetz: GesetzDarstellung = {
  kurztitel: 'DSGVO',
  normgeber: 'eu',
  langtitel: 'Datenschutz-Grundverordnung',
  hatGliederungsartikel: false,
  elemente: [],
};
function bundleXML(normgeber: string): string {
  return `<gesetz version="1"><infos><kurztitel>DSGVO</kurztitel><langtitel>${euGesetz.langtitel}</langtitel><normgeber>${normgeber}</normgeber><verarbeitungszeit>2025-01-02T03:04:05Z</verarbeitungszeit></infos><inhalt><norm id="a1"><bezeichnung>Artikel 1</bezeichnung><text><absatz>Inhalt</absatz></text></norm></inhalt></gesetz>`;
}
function gespeichertesGesetz(pfad: string): GesetzDarstellung {
  return { ...euGesetz, normgeber: pfad.slice('gesetze/DSGVO_'.length, -'.xml'.length) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.geschrieben = [];
  mocks.gesetze.mockResolvedValue([]);
  mocks.bundle.mockReturnValue(bundleXML('eu'));
});

it('reicht vom Verweisimport den vollständigen EU-Verzeichniseintrag bis zum Importdispatch', async () => {
  const ergebnis = await versucheFehlendeGesetzeImportieren(
    [{ kurztitel: 'dsgvo', normgeber: 'eu' }],
    markierungsEinzelzugriffFuerTest,
  );
  expect(ergebnis.mindestensEinErfolg).toBe(true);
  expect(ergebnis.neuFehlgeschlagen).toEqual([]);
  // Drei Bestandslesungen des Verweisimports, eine Versionsprüfung des echten Bundleimports.
  expect(mocks.gesetze).toHaveBeenCalledTimes(4);
  // Nur der vollständige Eintrag führt über den Ressourcenlink zur Bundledatei:
  // einmal für das Verzeichnis, einmal für den Import.
  expect(mocks.bundle.mock.calls).toEqual([
    [`resources/europa/${BUNDLE_DATEI}`],
    [`resources/europa/${BUNDLE_DATEI}`],
  ]);
  expect(mocks.geschrieben.filter((p) => p.startsWith('gesetze/'))).toEqual([
    'gesetze/DSGVO_eu.xml',
  ]);
});

it('behält beim namensgleichen falschen Importergebnis das gewählte Ziel und meldet keinen Erfolg', async () => {
  // Die Bundledatei ändert sich zwischen Verzeichnis und Import auf einen anderen Normgeber.
  mocks.bundle.mockReturnValueOnce(bundleXML('eu')).mockReturnValueOnce(bundleXML('de-bund'));
  const ziel = { kurztitel: 'DSGVO', normgeber: 'eu' };
  const ergebnis = await versucheFehlendeGesetzeImportieren(
    [ziel],
    markierungsEinzelzugriffFuerTest,
  );
  expect(ergebnis.mindestensEinErfolg).toBe(false);
  expect(ergebnis.neuFehlgeschlagen).toEqual([
    { gesetz: ziel, fehler: 'Das angeforderte Gesetz konnte nicht importiert werden.' },
  ]);
});

it('liefert rohe Bestands- und Einzelbefunde auch ohne einen weiterleitenden Meldungsempfänger', async () => {
  const befund: AktionsMeldung = {
    text: 'Quelldatei wurde gesichert.',
    typ: 'warnung',
    art: 'hinweis',
    anlass: 'sicherung',
    aenderungsstand: 'teilweise',
  };
  mocks.gesetze.mockImplementation(async (_befunde, empfangen?: AktionsMeldungEmpfaenger) => {
    empfangen?.(befund);
    return [];
  });
  const ergebnis = await versucheFehlendeGesetzeImportieren(
    [{ kurztitel: 'DSGVO', normgeber: 'eu' }],
    markierungsEinzelzugriffFuerTest,
  );
  expect(ergebnis.bestandsMeldungen).toContain(befund);
  expect(ergebnis.abschluesse).toHaveLength(1);
  expect(ergebnis.abschluesse[0]!.meldungen).toContain(befund);
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: mocks.gesetze,
}));
