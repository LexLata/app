// @vitest-environment jsdom
// Titelkopie und Anwendung werden über den öffentlichen Einzelzugriff mit echtem Speicher geprüft.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { beforeEach, expect, it, vi } from 'vitest';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
const referenz = { kurztitel: 'A', normgeber: 'de-bund' };
const titelpfad = 'nichtamtliche-titel/A_de-bund-nichtamtliche-titel.xml';
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'pruefvorgang_registrieren') return 'titelquelle';
    if (name === 'pruefvorgang_wiederholung_uebernehmen') return false;
    if (name.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: true };
    return nativ?.(name, args);
  });
  initialisiereMarkierungen();
  alleBannerSchliessen();
  io.dateien.set(
    'gesetze/A_de-bund.xml',
    '<gesetz><infos><kurztitel>A</kurztitel><langtitel>Probe</langtitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Inhalt</absatz></text></norm></inhalt></gesetz>',
  );
  io.dateien.set(
    'resources/nichtamtliche-titel/de-bund/A.xml',
    '<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">A</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Ergänzung</titel></norm></inhalt></nichtamtlicheTitel>',
  );
});
it('kopiert bei gleichzeitigen Zugriffen einmal und liefert angewendete Titel', async () => {
  const bestand = erzeugeGeladeneGesetze();
  await bestand.bereit;
  const ergebnisse = await Promise.all([
    bestand.ladeGesetz(referenz),
    bestand.ladeGesetz(referenz),
  ]);
  expect(io.dateien.get(titelpfad)).toContain('Ergänzung');
  expect(
    io.invoke.mock.calls.filter(
      ([name, args]) => name === 'atomar_datei_schreiben' && args.relativerPfad === titelpfad,
    ),
  ).toHaveLength(1);
  for (const ergebnis of ergebnisse)
    expect(ergebnis).toMatchObject({
      status: 'geladen',
      gesetz: { elemente: [{ data: { titel: 'Ergänzung', titelIstNichtamtlich: true } }] },
    });
  bestand.beenden();
});
it('behält das Gesetz bei fehlgeschlagener Titelkopie und zeigt die bestehende Meldung', async () => {
  io.schreiben.mockRejectedValue(new Error('Voll'));
  const bestand = erzeugeGeladeneGesetze();
  await bestand.bereit;
  expect(await bestand.ladeGesetz(referenz)).toMatchObject({ status: 'geladen' });
  expect(bestand.holeGeladenes(referenz)).toBeDefined();
  expect(
    getSnapshot().some((b) => b.text.includes('Das Gesetz bleibt ohne diese Ergänzungen nutzbar.')),
  ).toBe(true);
  bestand.beenden();
});
it('registriert den echten Titel-Folgelauf bei beiden lokalen Ladeaufrufern', async () => {
  const bestand = erzeugeGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  const erster = Object.assign(vi.fn(), { folgelaufErfassen: vi.fn() });
  const zweiter = Object.assign(vi.fn(), { folgelaufErfassen: vi.fn() });
  try {
    await Promise.all([
      bestand.ladeGesetz(referenz, erster),
      bestand.ladeGesetz(referenz, zweiter),
    ]);
    expect(erster.folgelaufErfassen.mock.calls.length).toBeGreaterThan(0);
    expect(zweiter.folgelaufErfassen.mock.calls).toEqual(erster.folgelaufErfassen.mock.calls);
    await Promise.all(erster.folgelaufErfassen.mock.calls.flat());
    expect(getSnapshot()).toEqual([]);
  } finally {
    bestand.beenden();
  }
});
it('beendet die lokale Anzeige auch bei einem noch offenen Titel-Folgelauf nach erfülltem Laden', async () => {
  let freigeben = () => {};
  let begonnen = false;
  let schreibzahl = 0;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (
      name === 'atomar_datei_schreiben' &&
      args.relativerPfad === 'markierungskonflikte.xml' &&
      ++schreibzahl >= 2
    ) {
      begonnen = true;
      await warten;
      throw Error('Später Prüfabschluss');
    }
    return nativ?.(name, args);
  });
  const bestand = erzeugeGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  const empfangen = Object.assign(vi.fn(), { folgelaufErfassen: vi.fn() });
  try {
    expect(await bestand.ladeGesetz(referenz, empfangen)).toMatchObject({ status: 'geladen' });
    await vi.waitFor(() => expect(begonnen).toBe(true));
    expect(empfangen.folgelaufErfassen.mock.calls.length).toBeGreaterThan(0);
    const bisher = empfangen.mock.calls.length;
    bestand.beenden();
    freigeben();
    await Promise.allSettled(empfangen.folgelaufErfassen.mock.calls.flat());
    expect(empfangen).toHaveBeenCalledTimes(bisher);
    expect(getSnapshot()).toEqual([]);
  } finally {
    freigeben();
    bestand.beenden();
  }
});
