// Einstellungen-Backup: Timer, Dateisperre und konkurrierende Fenster mit gemeinsamem Bestand.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FARBSCHEMA_KEY,
  SCHRIFT_KEY,
  LETZTER_EXPORT_ORDNER_KEY,
} from '@/lib/einstellungen/speicherschluessel';

const io = vi.hoisted(() => ({
  schreiben: vi.fn(),
  loeschen: vi.fn(),
  melden: vi.fn(),
  sperre: vi.fn(),
  lesen: vi.fn(),
  existiert: vi.fn(),
  sichern: vi.fn(),
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  EINSTELLUNGEN_ORDNER: 'einstellungen',
  appDatenSchreiben: io.schreiben,
  appDatenLoeschen: io.loeschen,
  meldePersistenzBefund: io.melden,
  mitDateiSperre: io.sperre,
  appDatenLesen: io.lesen,
  appDatenExistiert: io.existiert,
  sichereBeiUngueltigemInhalt: io.sichern,
}));
const PFAD = 'einstellungen/einstellungen-backup.xml';
let datei: string | null;
let warteschlange: Promise<unknown>;
let ablauf: string[];
function angehalten() {
  let weiter!: () => void;
  const promise = new Promise<void>((resolve) => {
    weiter = resolve;
  });
  return { promise, weiter };
}
async function fenster() {
  vi.resetModules();
  return {
    backup: await import('./einstellungenBackup'),
    speicher: await import('./einstellungenSpeicher'),
  };
}
async function ausloesen(backup: Awaited<ReturnType<typeof fenster>>['backup']) {
  backup.meldeEinstellungenGeaendert(FARBSCHEMA_KEY);
  await vi.advanceTimersByTimeAsync(1000);
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  const werte = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => werte.get(key) ?? null,
    setItem: (key: string, wert: string) => werte.set(key, wert),
    removeItem: (key: string) => {
      ablauf.push('zuruecksetzen');
      werte.delete(key);
    },
  });
  datei = null;
  io.existiert.mockImplementation(async () => datei !== null);
  io.lesen.mockImplementation(async () => datei);
  io.sichern.mockImplementation(
    async (_pfad: string, xml: string | null, gueltig: (xml: string) => boolean) => {
      if (xml === null) return { status: 'fehlt' };
      if (gueltig(xml)) return { status: 'gueltig', inhalt: xml };
      datei = null;
      return { status: 'archiviert', sicherungspfad: 'archiv.xml' };
    },
  );
  warteschlange = Promise.resolve();
  ablauf = [];
  io.sperre.mockImplementation((pfad: string, aktion: (token: string) => Promise<unknown>) => {
    expect(pfad).toBe(PFAD);
    const lauf = warteschlange.then(async () => {
      ablauf.push('erwerben');
      try {
        return await aktion('token');
      } finally {
        ablauf.push('freigeben');
      }
    });
    warteschlange = lauf.catch(() => {});
    return lauf;
  });
  io.schreiben.mockImplementation(async (pfad: string, xml: string, token: string) => {
    expect([pfad, token]).toEqual([PFAD, 'token']);
    ablauf.push('schreiben');
    datei = xml;
  });
  io.loeschen.mockImplementation(async (pfad: string, token: string) => {
    expect([pfad, token]).toEqual([PFAD, 'token']);
    ablauf.push('loeschen');
    datei = null;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('fasst schnelle exportierbare Änderungen zu einem aktuellen XML zusammen', async () => {
  const { backup } = await fenster();
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  backup.meldeEinstellungenGeaendert(FARBSCHEMA_KEY);
  await vi.advanceTimersByTimeAsync(600);
  localStorage.setItem(SCHRIFT_KEY, '16');
  backup.meldeEinstellungenGeaendert(SCHRIFT_KEY);
  await vi.advanceTimersByTimeAsync(999);
  expect(io.schreiben).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(io.schreiben).toHaveBeenCalledTimes(1);
  expect(datei).toContain('<schriftgroesse>16</schriftgroesse>');
});
it.each([
  LETZTER_EXPORT_ORDNER_KEY,
  'lexlata.fenster',
  'lexlata.geschlosseneTabs',
  'lexlata.aktivierung',
  'lexlata.mobile.test',
])('ignoriert den nicht exportierbaren Schlüssel %s', async (key) => {
  const { backup } = await fenster();
  localStorage.setItem(key, 'wert');
  backup.meldeEinstellungenGeaendert(key);
  await vi.advanceTimersByTimeAsync(1000);
  expect(io.sperre).not.toHaveBeenCalled();
});
it('schreibt und löscht bei leerem Bestand nichts', async () => {
  const { backup } = await fenster();
  datei = 'letztes Backup';
  await ausloesen(backup);
  expect(io.schreiben).not.toHaveBeenCalled();
  expect(io.loeschen).not.toHaveBeenCalled();
  expect(datei).toBe('letztes Backup');
});
it('behält bei Schreibfehlern die Einstellung und meldet erst nach einem Erfolg erneut', async () => {
  const { backup } = await fenster();
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  io.schreiben.mockRejectedValue(new Error('Platte voll'));
  await ausloesen(backup);
  await ausloesen(backup);
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('dunkel');
  expect(io.melden).toHaveBeenCalledTimes(1);
  io.schreiben.mockResolvedValueOnce(undefined);
  await ausloesen(backup);
  await ausloesen(backup);
  expect(io.melden).toHaveBeenCalledTimes(2);
});
it('führt Importänderungen dem Backup zu', async () => {
  const { speicher } = await fenster();
  speicher.wendeEinstellungenXMLAn('<einstellungen><farbschema>hell</farbschema></einstellungen>');
  await vi.advanceTimersByTimeAsync(1000);
  expect(io.schreiben).toHaveBeenCalledTimes(1);
  expect(datei).toContain('<farbschema>hell</farbschema>');
});
it('löscht ein fehlendes Backup ohne Fehler und setzt unter derselben Sperre zurück', async () => {
  const { speicher } = await fenster();
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  await expect(speicher.setzeEinstellungenZurueck()).resolves.toEqual({ erfolgreich: true });
  expect(ablauf[0]).toBe('erwerben');
  expect(ablauf[1]).toBe('loeschen');
  expect(ablauf.slice(2, -1).every((schritt) => schritt === 'zuruecksetzen')).toBe(true);
  expect(ablauf.at(-1)).toBe('freigeben');
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBeNull();
});
it.each(['sperre', 'loeschen'] as const)('bricht bei %s-Fehler unverändert ab', async (weg) => {
  const { speicher } = await fenster();
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  datei = 'alt';
  io[weg].mockRejectedValueOnce(new Error('gesperrt'));
  await expect(speicher.setzeEinstellungenZurueck()).resolves.toEqual({ erfolgreich: false });
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('dunkel');
  expect(datei).toBe('alt');
});
it('verwirft den wartenden Timer desselben Fensters', async () => {
  const { backup, speicher } = await fenster();
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  backup.meldeEinstellungenGeaendert(FARBSCHEMA_KEY);
  await speicher.setzeEinstellungenZurueck();
  await vi.advanceTimersByTimeAsync(1000);
  expect(io.sperre).toHaveBeenCalledTimes(1);
  expect(io.schreiben).not.toHaveBeenCalled();
});
describe.each([false, true])('Konkurrenz mit getrennten Fensterkontexten: %s', (getrennt) => {
  it.each(['schreiben-zuerst', 'zuruecksetzen-zuerst'] as const)(
    '%s liest erst unter der Sperre und hinterlässt keinen Altbestand',
    async (reihenfolge) => {
      const erstes = await fenster();
      const zweites = getrennt ? await fenster() : erstes;
      localStorage.setItem(FARBSCHEMA_KEY, 'alt');
      const halt = angehalten();
      let reset: Promise<unknown>;
      if (reihenfolge === 'schreiben-zuerst') {
        io.schreiben.mockImplementationOnce(async (_pfad: string, xml: string) => {
          await halt.promise;
          datei = xml;
          ablauf.push('schreiben');
        });
        await ausloesen(erstes.backup);
        expect(io.schreiben).toHaveBeenCalledTimes(1);
        reset = zweites.speicher.setzeEinstellungenZurueck();
        await Promise.resolve();
        expect(io.loeschen).not.toHaveBeenCalled();
      } else {
        io.loeschen.mockImplementationOnce(async () => {
          await halt.promise;
          datei = null;
          ablauf.push('loeschen');
        });
        reset = zweites.speicher.setzeEinstellungenZurueck();
        await Promise.resolve();
        await ausloesen(erstes.backup);
        expect(io.schreiben).not.toHaveBeenCalled();
      }
      halt.weiter();
      await reset;
      await warteschlange;
      expect(datei).toBeNull();
      expect(localStorage.getItem(FARBSCHEMA_KEY)).toBeNull();
      expect(ablauf.indexOf('schreiben') < ablauf.indexOf('loeschen')).toBe(true);
      localStorage.setItem(SCHRIFT_KEY, '18');
      await ausloesen(erstes.backup);
      expect(datei).toContain('<schriftgroesse>18</schriftgroesse>');
      expect(datei).not.toContain('<farbschema>');
    },
  );
});

it('erhält über die öffentliche Modulschnittstelle die Sperre bis nach der synchronen Löschaktion', async () => {
  const { loescheEinstellungenBackup } = await import('./einstellungenBackup');
  await loescheEinstellungenBackup(() => {
    expect(ablauf).toEqual(['erwerben', 'loeschen']);
    ablauf.push('aktion');
  });
  expect(ablauf).toEqual(['erwerben', 'loeschen', 'aktion', 'freigeben']);
});

const XML =
  '<einstellungen version="1"><verarbeitungszeit>2026-10-16T12:00:00Z</verarbeitungszeit><farbschema>dunkel</farbschema></einstellungen>';
it('stellt ein geschriebenes Backup ohne erneutes Schreiben wieder her und nach Reset nicht mehr', async () => {
  const { backup, speicher } = await fenster();
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  localStorage.setItem(SCHRIFT_KEY, '18');
  localStorage.setItem('lexlata.leistenTauschen', 'true');
  await ausloesen(backup);
  localStorage.removeItem(FARBSCHEMA_KEY);
  localStorage.removeItem(SCHRIFT_KEY);
  localStorage.removeItem('lexlata.leistenTauschen');
  expect(await backup.stelleEinstellungenAusBackupWiederHer()).toBe('wiederhergestellt');
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('dunkel');
  expect(localStorage.getItem(SCHRIFT_KEY)).toBe('18');
  expect(localStorage.getItem('lexlata.leistenTauschen')).toBe('true');
  await vi.advanceTimersByTimeAsync(2000);
  expect(io.schreiben).toHaveBeenCalledTimes(1);
  await speicher.setzeEinstellungenZurueck();
  expect(localStorage.getItem('lexlata.leistenTauschen')).toBeNull();
  const neu = await fenster();
  expect(await neu.backup.stelleEinstellungenAusBackupWiederHer()).toBe('nichts-zu-tun');
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBeNull();
});
it('behält vorhandene Einstellungen ohne Dateizugriff', async () => {
  const { backup } = await fenster();
  localStorage.setItem(FARBSCHEMA_KEY, 'hell');
  datei = XML;
  expect(await backup.stelleEinstellungenAusBackupWiederHer()).toBe('nichts-zu-tun');
  expect(io.lesen).not.toHaveBeenCalled();
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe('hell');
});
it.each(['<defekt>', XML.replace('version="1"', 'version="2"')])(
  'archiviert ungültiges Backup und übernimmt nichts (%s)',
  async (xml) => {
    const { backup } = await fenster();
    datei = xml;
    expect(await backup.stelleEinstellungenAusBackupWiederHer()).toBe('nichts-zu-tun');
    expect(datei).toBeNull();
    expect(io.sichern).toHaveBeenCalled();
    expect(localStorage.getItem(FARBSCHEMA_KEY)).toBeNull();
  },
);
it('liefert bei Lesefehlern einen Fehler statt den Start abzubrechen', async () => {
  const { backup } = await fenster();
  datei = XML;
  io.lesen.mockRejectedValueOnce(new Error('Lesefehler'));
  expect(await backup.stelleEinstellungenAusBackupWiederHer()).toBe('fehler');
});

it.each(
  (await import('@/test/einstellungen/einstellungenBackupFaelle')).BACKUP_SCHEMA_FAELLE.filter(
    ([, , gueltig]) => !gueltig,
  ),
)('übernimmt den ungültigen Schemafall %s nicht', async (_name, xml) => {
  const { backup } = await fenster();
  datei = xml;
  expect(await backup.stelleEinstellungenAusBackupWiederHer()).toBe('nichts-zu-tun');
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBeNull();
  expect(io.schreiben).not.toHaveBeenCalled();
});
it('übernimmt namensräumliche Erweiterungen nicht als bekannte Einstellungen', async () => {
  const { backup } = await fenster();
  datei = XML.replace(
    '<farbschema>dunkel</farbschema>',
    '<farbschema xmlns="urn:erweiterung">roh</farbschema>',
  );
  expect(await backup.stelleEinstellungenAusBackupWiederHer()).toBe('wiederhergestellt');
  expect(localStorage.getItem(FARBSCHEMA_KEY)).toBeNull();
});

it('meldet Fehler gedrosselt und Erfolg lokal; Abmelden erhält den bisherigen Standardweg', async () => {
  const { backup } = await fenster();
  const melden = vi.fn();
  const abmelden = backup.registriereEinstellungenBackupMeldung(melden);
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  io.schreiben.mockRejectedValue(new Error('voll'));
  await ausloesen(backup);
  await ausloesen(backup);
  expect(melden).toHaveBeenCalledTimes(1);
  expect(melden).toHaveBeenLastCalledWith(
    expect.stringContaining('Backup konnte nicht geschrieben werden'),
  );
  expect(io.melden).not.toHaveBeenCalled();
  io.schreiben.mockResolvedValueOnce(undefined);
  await ausloesen(backup);
  expect(melden).toHaveBeenLastCalledWith(undefined);
  abmelden();
  await ausloesen(backup);
  expect(io.melden).toHaveBeenCalledTimes(1);
});
it('beeinflusst mit fehlerhaften Anzeigehandlern weder Schreibversuche noch die Fehlerdrosselung', async () => {
  const { backup } = await fenster();
  const handler = vi.fn(() => {
    throw new Error('Anzeige fehlgeschlagen');
  });
  const abmelden = backup.registriereEinstellungenBackupMeldung(handler);
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  try {
    await ausloesen(backup);
    expect(io.melden).not.toHaveBeenCalled();
    io.schreiben.mockRejectedValue(new Error('voll'));
    await ausloesen(backup);
    await ausloesen(backup);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(expect.any(String));
    expect(io.schreiben).toHaveBeenCalledTimes(3);
  } finally {
    abmelden();
  }
});
