// @vitest-environment jsdom
// Echte Abgleich-, Befund- und Importabschlusswege; nur native Dateioperationen sind ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
import {
  bereiteSuchverzeichnisVor,
  beiSuchverzeichnisVorbereitung,
  pruefeGesetzdateienNachImport,
} from '@/lib/gesetz-laden/gesetz-laden.index';
import { leseSuchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
const pfad = 'gesetze/Probe_de-bund.xml';
const defekt = '<gesetz><infos><kurztitel>Probe</kurztitel><normgeber>de-bund</normgeber></infos>';
function sperre() {
  let fertig = () => {};
  const warten = new Promise<void>((resolve) => {
    fertig = resolve;
  });
  return { warten, fertig };
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  initialisiereMarkierungen();
  alleBannerSchliessen();
  localStorage.clear();
});
it.each([
  // Erwartet wird die Dateibefund-Gruppe; der reparierbare Befund hat keine und erscheint als Satz.
  ['leer', { gruppe: 'dateiLeer' }],
  ['reparierbar', { text: 'bekannten Internet-Quelle' }],
  ['unlesbar', { gruppe: 'nichtLesbar' }],
  ['fehlt', { gruppe: 'dateiFehlt' }],
  // Die Gesetzdatei wird beim Lesen gesichert; der gleiche Befund des Abgleichs wird nicht erneut geführt.
  ['archiviert', { gruppe: 'imDatenordnerGesichert' }],
  ['gesichert_aber_nicht_entfernt', { gruppe: 'gesichertNichtEntfernt' }],
  ['sicherung_fehlgeschlagen', { gruppe: 'sicherungFehlgeschlagen' }],
  ['ordner_unlesbar', { gruppe: 'nichtLesbar' }],
] as const)(
  'meldet den Befund %s aus dem Abgleich und bietet nur erkennbare Reparaturziele an',
  async (status, erwartet: { gruppe?: string; text?: string }) => {
    const archivfall = [
      'archiviert',
      'gesichert_aber_nicht_entfernt',
      'sicherung_fehlgeschlagen',
    ].includes(status);
    io.dateien.set(pfad, status === 'leer' ? '' : archivfall ? '<kaputt/>' : defekt);
    const nativ = io.invoke.getMockImplementation();
    io.invoke.mockImplementation(async (name, args) => {
      if (name === 'gesetz_dateistempel_lesen' && status === 'ordner_unlesbar')
        throw new Error('Gesperrt');
      if (name === 'pruefvorgang_registrieren') return 'quelle';
      if (name === 'pruefvorgang_wiederholung_uebernehmen') return false;
      if (name.startsWith('pruefvorgang_'))
        return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: true };
      if (name === 'archiviere_beschaedigte_datei') {
        if (status === 'sicherung_fehlgeschlagen') throw new Error('Sicherung gesperrt');
        io.dateien.set(pfad + '.bak', args.erwarteterInhalt);
        if (status === 'archiviert') io.dateien.delete(pfad);
        return { status, sicherungspfad: pfad + '.bak' };
      }
      return nativ?.(name, args);
    });
    if (status === 'unlesbar' || status === 'fehlt')
      io.vorLesen = (datei) => {
        if (datei.endsWith('/' + pfad)) {
          if (status === 'fehlt') io.dateien.delete(pfad);
          throw new Error('Lesen gesperrt');
        }
        return undefined;
      };
    await act(async () => bereiteSuchverzeichnisVor());
    const befunde = getSnapshot();
    if (erwartet.text)
      expect(befunde.map((banner) => banner.text).join(' ')).toContain(erwartet.text);
    if (erwartet.gruppe)
      expect(
        befunde.flatMap(
          (banner) =>
            banner.gliederung?.kategorien.flatMap((k) => k.gruppen.map((g) => g.schluessel)) ?? [],
        ),
      ).toContain(erwartet.gruppe);
    expect(JSON.stringify(befunde)).not.toContain('.bak');
    expect(befunde.flatMap((banner) => (banner.aktion ? [banner.aktion.label] : []))).toEqual(
      status === 'reparierbar' ? ['Alle aktualisieren'] : [],
    );
    if (status === 'archiviert' || status === 'gesichert_aber_nicht_entfernt')
      expect(io.dateien.get(pfad + '.bak')).toBe('<kaputt/>');
    if (status === 'ordner_unlesbar') expect(io.dateien.get(pfad)).toBe(defekt);
  },
);
it('liefert auch spät während des Abgleichabschlusses angeschlossenen Importen die Befunde ihres Gesetzes', async () => {
  io.dateien.set(pfad, defekt);
  const erreicht = sperre();
  const weiter = sperre();
  const senden = io.emitTo.getMockImplementation();
  io.emitTo.mockImplementation(async (...args: unknown[]) => {
    if (args[1] === 'gesetze-geaendert' && Array.isArray(args[2]) && args[2].length > 0) {
      erreicht.fertig();
      await weiter.warten;
    }
    return senden?.(...args);
  });
  const hintergrund = bereiteSuchverzeichnisVor();
  await erreicht.warten;
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(true);
  const empfangen = [vi.fn(), vi.fn()];
  const importe = empfangen.map((empfaenger) =>
    pruefeGesetzdateienNachImport([{ kurztitel: 'Probe', normgeber: 'de-bund' }], empfaenger),
  );
  const abgeschlossen = Promise.allSettled(importe);
  weiter.fertig();
  await hintergrund;
  for (const ergebnis of await abgeschlossen) expect(ergebnis.status).toBe('rejected');
  for (const empfaenger of empfangen)
    expect(empfaenger).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Probe_de-bund') }),
    );
});

it('meldet den fachlichen Abschluss eines fehlgeschlagenen und eines später erfolgreichen Abgleichs an wartende Verbraucher', async () => {
  const abgeschlossen = vi.fn();
  const abmelden = beiSuchverzeichnisVorbereitung(abgeschlossen);
  const nativ = io.invoke.getMockImplementation();
  let lesbar = false;
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen' && !lesbar) throw new Error('Ordner gesperrt');
    return nativ?.(name, args);
  });
  try {
    await bereiteSuchverzeichnisVor();
    expect(abgeschlossen).toHaveBeenLastCalledWith(expect.objectContaining({ abgeglichen: false }));
    lesbar = true;
    await bereiteSuchverzeichnisVor();
    expect(abgeschlossen).toHaveBeenLastCalledWith(
      expect.objectContaining({ abgeglichen: true, eintraege: [] }),
    );
  } finally {
    abmelden();
  }
});

const gueltig =
  '<gesetz><infos><kurztitel>Probe</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>';
function protokolliereGesetzLesen(): string[] {
  const gelesen: string[] = [];
  io.vorLesen = (datei) => {
    if (datei.includes('gesetze/')) gelesen.push(datei);
    return undefined;
  };
  return gelesen;
}

it('prüft nach dem Ersetzen nur den Eintrag des Gesetzes und meldet keine Befunde fremder Dateien', async () => {
  io.dateien.set(pfad, gueltig);
  io.dateien.set('gesetze/Fremd_de-bund.xml', defekt.replaceAll('Probe', 'Fremd'));
  await act(async () => bereiteSuchverzeichnisVor());
  const gelesen = protokolliereGesetzLesen();
  const empfaenger = vi.fn();
  await expect(
    pruefeGesetzdateienNachImport([{ kurztitel: 'Probe', normgeber: 'de-bund' }], empfaenger),
  ).resolves.toBeUndefined();
  expect(empfaenger).not.toHaveBeenCalled();
  expect(gelesen).toEqual([]);
});

it('liest beim Start eine unverändert beschädigte Datei gezielt neu und meldet sie, ohne Vollabgleich', async () => {
  io.dateien.set(pfad, gueltig);
  io.dateien.set('gesetze/Fremd_de-bund.xml', defekt.replaceAll('Probe', 'Fremd'));
  await act(async () => bereiteSuchverzeichnisVor());
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(true);
  alleBannerSchliessen();
  const gelesen = protokolliereGesetzLesen();
  // Neuer Start (frisches Fenster): gleicher Dateibestand, gleiche Stempel.
  vi.resetModules();
  const fenster = await import('@/lib/gesetz-laden/gesetz-laden.index');
  const banner = await import('@/lib/banner/banner.index');
  // Durchlaufene Dateien je Abgleich: ein Vollabgleich durchliefe beide.
  const gesamt: number[] = [];
  const abmelden = fenster.beiSuchverzeichnisVorbereitung(() => {
    const stand = fenster.holeSuchverzeichnisFortschritt();
    if (stand) gesamt.push(stand.gesamt);
  });
  await act(async () => fenster.bereiteSuchverzeichnisVor());
  abmelden();
  expect(new Set(gesamt)).toEqual(new Set([1]));
  expect(gelesen.map((p) => p.split('/').pop())).toEqual(['Fremd_de-bund.xml']);
  expect(JSON.stringify(banner.getSnapshot())).toContain('Fremd');
  expect((await leseSuchverzeichnis()).abgeglichen).toBe(true);
  // Im selben Fenster kein erneutes Lesen.
  await act(async () => fenster.bereiteSuchverzeichnisVor());
  expect(gelesen).toHaveLength(1);
});
