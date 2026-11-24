// @vitest-environment jsdom
// Echte Timerbesitzer, UI-Abgrenzung und Reset im Einstellungenimport; nur native APIs ersetzt.
import {
  io,
  richteEinstellungenImportProbeEin,
} from '@/test/einstellungen/einstellungenImportNativeAttrappe';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  wendeEinstellungenXMLAn,
  setzeEinstellungenZurueck,
  meldeEinstellungenGeaendert,
  stelleEinstellungenAusBackupWiederHer,
} from '@/lib/einstellungen/einstellungen.index';
import { erzeugeImportAbschluss } from './dateiImport.einfach';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
const PFAD = 'einstellungen/einstellungen-backup.xml';
const FARBE = 'lexlata.farbschema';
const SCHRIFT = 'lexlata.schriftgroesse';
function xml(farbe = 'hell') {
  return `<einstellungen version="1"><verarbeitungszeit>2026-10-24T00:00:00Z</verarbeitungszeit><farbschema>${farbe}</farbschema></einstellungen>`;
}
function angehalten() {
  let weiter!: () => void;
  const promise = new Promise<void>((resolve) => {
    weiter = resolve;
  });
  return { promise, weiter };
}
beforeEach(richteEinstellungenImportProbeEin);
afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('zwei Importbesitzer und UI-Änderung teilen den Timer; ein späterer UI-Auftrag übernimmt keine Importempfänger', async () => {
  const meldungenA: AktionsMeldung[] = [],
    meldungenB: AktionsMeldung[] = [];
  const a = erzeugeImportAbschluss(meldungenA),
    b = erzeugeImportAbschluss(meldungenB);
  wendeEinstellungenXMLAn(xml(), a.meldungEmpfangen);
  await vi.advanceTimersByTimeAsync(600);
  wendeEinstellungenXMLAn(xml('dunkel'), b.meldungEmpfangen);
  localStorage.setItem(SCHRIFT, '20');
  meldeEinstellungenGeaendert(SCHRIFT);
  expect(a.hatOffeneFolgelaeufe()).toBe(true);
  expect(b.hatOffeneFolgelaeufe()).toBe(true);
  await vi.advanceTimersByTimeAsync(999);
  expect(io.dateien.has(PFAD)).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await Promise.all([a.warte(), b.warte()]);
  expect(a.hatOffeneFolgelaeufe()).toBe(false);
  expect(b.hatOffeneFolgelaeufe()).toBe(false);
  expect(io.dateien.get(PFAD)).toContain('<schriftgroesse>20</schriftgroesse>');
  expect(io.invoke.mock.calls.filter(([name]) => name === 'atomar_datei_schreiben')).toHaveLength(
    1,
  );
  io.invoke.mockRejectedValue(new Error('Spätere UI-Änderung'));
  localStorage.setItem(SCHRIFT, '22');
  meldeEinstellungenGeaendert(SCHRIFT);
  await vi.advanceTimersByTimeAsync(1000);
  expect(meldungenA).toEqual([]);
  expect(meldungenB).toEqual([]);
  expect(io.banner).toHaveBeenCalledTimes(1);
});

it('Reset schließt vorgesehene Importbackups ohne Schreibwiederholung ab und Wiederherstellung bleibt möglich', async () => {
  const meldungen: AktionsMeldung[] = [],
    abschluss = erzeugeImportAbschluss(meldungen);
  wendeEinstellungenXMLAn(xml(), abschluss.meldungEmpfangen);
  expect(await setzeEinstellungenZurueck()).toEqual({ erfolgreich: true });
  await abschluss.warte();
  expect(abschluss.hatOffeneFolgelaeufe()).toBe(false);
  expect(meldungen).toEqual([expect.objectContaining({ anlass: 'sicherung' })]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(io.dateien.has(PFAD)).toBe(false);
  expect(localStorage.getItem(FARBE)).toBeNull();
  io.dateien.set(PFAD, xml('dunkel'));
  expect(await stelleEinstellungenAusBackupWiederHer()).toBe('wiederhergestellt');
  expect(localStorage.getItem(FARBE)).toBe('dunkel');
});

it('nach Timerbeginn geplante UI-Änderung bekommt ihren eigenen Backupfehler', async () => {
  const halt = angehalten(),
    meldungen: AktionsMeldung[] = [];
  const abschluss = erzeugeImportAbschluss(meldungen);
  const gesund = io.invoke.getMockImplementation();
  if (!gesund) throw new Error('Native Testimplementation fehlt');
  let schreibzahl = 0;
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'atomar_datei_schreiben') {
      schreibzahl++;
      if (schreibzahl === 1) await halt.promise;
      else throw new Error('Reiner UI-Backupfehler');
    }
    return gesund(name, args);
  });
  wendeEinstellungenXMLAn(xml(), abschluss.meldungEmpfangen);
  await vi.advanceTimersByTimeAsync(1000);
  expect(abschluss.hatOffeneFolgelaeufe()).toBe(true);
  localStorage.setItem(SCHRIFT, '24');
  meldeEinstellungenGeaendert(SCHRIFT);
  halt.weiter();
  await vi.advanceTimersByTimeAsync(0);
  await abschluss.warte();
  await vi.advanceTimersByTimeAsync(1000);
  expect(meldungen).toEqual([]);
  expect(io.banner).toHaveBeenCalledOnce();
  expect(schreibzahl).toBe(2);
});
