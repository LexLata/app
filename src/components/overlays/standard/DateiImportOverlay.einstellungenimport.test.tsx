// @vitest-environment jsdom
// Einstellungen vom echten XML-/ZIP-Eingang über localStorage bis Backup und Overlay; nur native Grenzen ersetzt.
import {
  io,
  fehlerEntfernen,
  fehlerSetzen,
  richteEinstellungenImportProbeEin,
} from '@/test/einstellungen/einstellungenImportNativeAttrappe';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { DateiImportOverlay } from '@/components/overlays/standard/DateiImportOverlay';
import {
  waehleImportDateien,
  loeseImportKonflikt,
  type DateiImportErgebnis,
} from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import {
  meldeEinstellungenGeaendert,
  registriereEinstellungenBackupMeldung,
} from '@/lib/einstellungen/einstellungen.index';

const PFAD = 'einstellungen/einstellungen-backup.xml';
const FARBE = 'lexlata.farbschema';
const SCHRIFT = 'lexlata.schriftgroesse';
const AKZENT = 'lexlata.appAkzentfarbe';
function xml(farbe = 'hell', extra = '') {
  return `<einstellungen version="1"><verarbeitungszeit>2026-10-24T00:00:00Z</verarbeitungszeit><farbschema>${farbe}</farbschema>${extra}</einstellungen>`;
}
function angehalten() {
  let weiter!: () => void;
  const promise = new Promise<void>((resolve) => {
    weiter = resolve;
  });
  return { promise, weiter };
}
let root: Root;
let container: HTMLDivElement;
let abmelden: (() => void) | undefined;
beforeEach(async () => {
  await richteEinstellungenImportProbeEin();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  abmelden?.();
  abmelden = undefined;
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function anzeigen(ergebnis: DateiImportErgebnis, schliessen = vi.fn()) {
  await act(async () =>
    root.render(
      <DateiImportOverlay
        zustand={{ art: 'fertig', ergebnis: ergebnis }}
        onSchliessen={schliessen}
        onNeuLaden={async () => {}}
      />,
    ),
  );
}
function button(text: string) {
  const gefunden = [...container.querySelectorAll('button')].find(
    (b) =>
      b.textContent === text ||
      (text === 'Schließen' && b.textContent === '' && !!b.querySelector('svg')),
  );
  if (!gefunden) throw new Error(`Button fehlt: ${text}`);
  return gefunden;
}
async function importieren(pfade = ['/import/Einstellungen.xml']) {
  const lauf = importierePfade(pfade);
  await vi.advanceTimersByTimeAsync(1000);
  return lauf;
}
it.each(['XML', 'ZIP'])(
  'echter %s-Erstimport zeigt gesunde Werte und fehlgeschlagenes Setzen mit Herkunft',
  async (format) => {
    const inhalt = xml('hell', '<schriftgroesse>18</schriftgroesse>');
    io.dateien.set('/import/Einstellungen.xml', inhalt);
    io.archive.set(
      '/import/Sicherung.zip',
      zipSync({ 'Optionen/Einstellungen.xml': strToU8(inhalt) }),
    );
    fehlerSetzen.add(SCHRIFT);
    const ergebnis = await importieren(format === 'ZIP' ? ['/import/Sicherung.zip'] : undefined);
    expect(localStorage.getItem(FARBE)).toBe('hell');
    expect(localStorage.getItem(SCHRIFT)).toBeNull();
    expect(io.dateien.get(PFAD)).toContain('<farbschema>hell</farbschema>');
    expect(io.dateien.get(PFAD)).not.toContain('<schriftgroesse>');
    await anzeigen(ergebnis);
    expect(container.textContent).toContain('unvollständig übernommen');
    expect(container.textContent).toContain('schriftgroesse');
    // Erfolge nennen den Namen, nicht die Herkunftsdatei.
    expect(container.textContent).not.toContain('Einstellungen.xml');
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it.each(['Ersetzen', 'Alle ersetzen'])(
  'Overlay/%s meldet echte Entfernen-/Setzenfehler und den tatsächlichen Backupbestand',
  async (aktion) => {
    localStorage.setItem(AKZENT, 'alt');
    fehlerEntfernen.add(AKZENT);
    fehlerSetzen.add(SCHRIFT);
    io.dateien.set('/import/Einstellungen.xml', xml('hell', '<schriftgroesse>18</schriftgroesse>'));
    const ergebnis = await importierePfade(['/import/Einstellungen.xml']);
    expect(ergebnis.konflikte).toHaveLength(1);
    await anzeigen(ergebnis);
    await act(async () => {
      button(aktion).click();
    });
    expect(button('Schließen').disabled).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(container.textContent).toContain('unvollständig übernommen');
    expect(container.textContent).toContain('appAkzentfarbe');
    expect(container.textContent).toContain('schriftgroesse');
    expect(container.textContent).not.toContain('Importkonflikte');
    expect(io.dateien.get(PFAD)).toContain('<appAkzentfarbe>alt</appAkzentfarbe>');
    expect(io.dateien.get(PFAD)).toContain('<farbschema>hell</farbschema>');
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('Nullübernahme bleibt als erfolglose offene Konfliktentscheidung mit Quelle bedienbar', async () => {
  localStorage.setItem(FARBE, 'dunkel');
  fehlerEntfernen.add(FARBE);
  fehlerSetzen.add(FARBE);
  io.dateien.set('/import/Einstellungen.xml', xml());
  await anzeigen(await importierePfade(['/import/Einstellungen.xml']));
  await act(async () => button('Ersetzen').click());
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.textContent).toContain('nicht übernommen');
  expect(container.textContent).toContain('Importkonflikte');
  expect(button('Ersetzen').disabled).toBe(false);
  expect(container.textContent).toContain('Einstellungen.xml');
  expect(localStorage.getItem(FARBE)).toBe('dunkel');
});
it.each(['datei_sperre_erwerben', 'atomar_datei_schreiben'])(
  'echter nativer %s-Fehler bleibt ein zugeordnetes Backupfolgeproblem',
  async (befehl) => {
    const gesund = io.invoke.getMockImplementation();
    if (!gesund) throw new Error('Native Testimplementation fehlt');
    io.invoke.mockImplementation(async (name, args) => {
      if (name === befehl) throw new Error('Backup verweigert');
      return gesund(name, args);
    });
    io.dateien.set('/import/Einstellungen.xml', xml());
    const ergebnis = await importieren();
    await anzeigen(ergebnis);
    expect(ergebnis.berichtEintraege[0]?.aktion).toBe('neu');
    expect(localStorage.getItem(FARBE)).toBe('hell');
    expect(container.textContent).toContain('Backup konnte nicht geschrieben werden');
    expect(container.textContent).toContain('Einstellungen');
    expect(container.textContent).not.toContain('nicht übernommen');
    expect(io.dateien.has(PFAD)).toBe(false);
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('gemeinsamer Backupfehler erreicht beide Importbesitzer genau einmal', async () => {
  const konflikte = ['A', 'B'].map((name) => ({
    art: 'einstellungen' as const,
    anzeigename: 'Einstellungen',
    quelle: `${name}.xml`,
    importInhalt: xml(name),
  }));
  const gesund = io.invoke.getMockImplementation();
  if (!gesund) throw new Error('Native Testimplementation fehlt');
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'atomar_datei_schreiben') throw new Error('Platte voll');
    return gesund(name, args);
  });
  const laeufe = konflikte.map((konflikt) => loeseImportKonflikt(konflikt, 'ersetzen'));
  await vi.advanceTimersByTimeAsync(1000);
  const berichte = await Promise.all(laeufe);
  expect(berichte.map((b) => b.quelle)).toEqual(['A.xml', 'B.xml']);
  expect(berichte.every((b) => b.meldungen?.length === 1)).toBe(true);
  await anzeigen({ berichtEintraege: berichte, konflikte: [], fehler: [] });
  // Gleicher Name mit gleichem Befund erscheint im Bericht einmal.
  expect(container.textContent?.match(/Backup konnte nicht geschrieben werden/g)).toHaveLength(1);
  expect(io.banner).not.toHaveBeenCalled();
});
it.each([false, true])(
  '30 Sekunden und später Backupfehler bei geschlossener Übersicht=%s',
  async (schliessen) => {
    const halt = angehalten();
    const gesund = io.invoke.getMockImplementation();
    if (!gesund) throw new Error('Native Testimplementation fehlt');
    io.invoke.mockImplementation(async (name, args) => {
      if (name === 'atomar_datei_schreiben') {
        await halt.promise;
        throw new Error('Später Backupfehler');
      }
      return gesund(name, args);
    });
    io.dateien.set('/import/Einstellungen.xml', xml());
    const lauf = importierePfade(['/import/Einstellungen.xml']);
    await vi.advanceTimersByTimeAsync(30_000);
    const ergebnis = await lauf;
    const geschlossen = vi.fn();
    await anzeigen(ergebnis, geschlossen);
    expect(container.textContent).toContain('nach 30 Sekunden nicht bestätigt');
    expect(container.textContent).toContain('Einstellungen');
    expect(ergebnis.berichtEintraege[0]?.aktion).toBe('neu');
    if (schliessen) {
      await act(async () => button('Schließen').click());
      expect(geschlossen).toHaveBeenCalledOnce();
      await act(async () => root.render(null));
    }
    await act(async () => {
      halt.weiter();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(ergebnis.berichtEintraege[0]?.meldungen).toEqual([
      expect.objectContaining({ anlass: 'sicherung' }),
    ]);
    if (!schliessen) {
      expect(container.textContent).toContain('Backup konnte nicht geschrieben werden');
      expect(container.textContent).not.toContain('nach 30 Sekunden');
    }
    expect(io.banner).not.toHaveBeenCalled();
  },
);
it('normaler UI-Backupfehler meldet weiterhin an das Einstellungenfenster', async () => {
  const empfangen = vi.fn();
  abmelden = registriereEinstellungenBackupMeldung(empfangen);
  io.invoke.mockRejectedValue(new Error('Sperre verweigert'));
  localStorage.setItem(FARBE, 'hell');
  meldeEinstellungenGeaendert(FARBE);
  await vi.advanceTimersByTimeAsync(1000);
  expect(empfangen).toHaveBeenCalledWith(expect.stringContaining('Backup'));
  expect(io.banner).not.toHaveBeenCalled();
});
it('Dateidialog-Abbruch erzeugt keinen Import oder Fehler', async () => {
  io.dialog.mockResolvedValue(null);
  expect(await waehleImportDateien()).toBeNull();
  expect(io.banner).not.toHaveBeenCalled();
});

it('Erstimport ohne übernommenen Wert meldet keine Übernahme statt Erfolg', async () => {
  fehlerSetzen.add(FARBE);
  io.dateien.set('/import/Einstellungen.xml', xml());
  const ergebnis = await importieren();
  await anzeigen(ergebnis);
  expect(ergebnis.berichtEintraege[0]?.aktion).toBe('nichtUebernommen');
  expect(container.textContent).toContain('nicht übernommen');
  expect(container.textContent).toContain('Einstellungen');
  expect(io.dateien.has(PFAD)).toBe(false);
  expect(io.banner).not.toHaveBeenCalled();
});
