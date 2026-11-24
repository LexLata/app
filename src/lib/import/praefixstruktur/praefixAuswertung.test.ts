// praefixAuswertung.test.ts
// Offline-Neubewertung über die öffentliche Modulgrenze und echte XML-Verarbeitung.
import { expect, it, vi } from 'vitest';
import { fuehrePraefixAuswertungAus } from './praefixstruktur.index';
import type { PraefixAuswertungUmgebung } from './praefixAuswertung';

const gesetz = (kurztitel: string, bezeichnung = 'Art. 1') =>
  `<gesetz><infos><kurztitel>${kurztitel}</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="n"><bezeichnung>${bezeichnung}</bezeichnung></norm></inhalt></gesetz>`;
const liste = `<?xml version="1.0" encoding="UTF-8"?>\n<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-25T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber></infos><inhalt><gesetz>A</gesetz><gesetz praefixstruktur="artikel">B</gesetz><gesetz ermittlungsstatus="leer">C</gesetz><gesetz ermittlungsstatus="gescheitert" fehlerart="gesetz-laden">D</gesetz><gesetz ermittlungsstatus="leer">OhneDatei</gesetz></inhalt></praefixstrukturen>`;
function fake(titel = ['A', 'B', 'C', 'D', 'E']) {
  let xml = liste;
  const umgebung: PraefixAuswertungUmgebung = {
    leseListe: vi.fn(async () => xml),
    schreibeListe: vi.fn(async (neu) => {
      xml = neu;
    }),
    leseDateistand: vi.fn(async () => ({ gesetzesxml: titel })),
    ladeKandidaten: vi.fn(async () =>
      titel.map((kurztitel) => ({ kurztitel, langtitel: '', abrufkennung: '' })),
    ),
    leseGesetzesXML: vi.fn(async (kurztitel) => gesetz(kurztitel)),
    ausgabe: vi.fn(),
  };
  return { umgebung, xml: () => xml };
}
const auftrag = { modus: 'auswerten', normgeber: 'de-bund' } as const;
it('ersetzt geänderte, unveränderte, leere und gescheiterte Befunde und ergänzt neue', async () => {
  const f = fake();
  const bericht = await fuehrePraefixAuswertungAus(auftrag, f.umgebung);
  expect(bericht.gespeichert).toBe(5);
  expect(bericht.zusatzzeilen).toContain('artikel: 5');
  for (const k of ['A', 'B', 'C', 'D', 'E'])
    expect(f.xml()).toContain(`<gesetz praefixstruktur="artikel">${k}</gesetz>`);
  expect(f.xml()).toContain('<gesetz ermittlungsstatus="leer">OhneDatei</gesetz>');
  expect(f.umgebung.schreibeListe).toHaveBeenCalledTimes(1);
});
it('meldet ungültigen Inhalt, fehlenden Indexeintrag und mehrdeutige Kurztitel ohne Listenänderung', async () => {
  const f = fake(['A', 'B', 'Fremd', 'Doppelt']);
  vi.mocked(f.umgebung.ladeKandidaten).mockResolvedValue(
    ['A', 'B', 'Doppelt', 'doppelt'].map((kurztitel) => ({
      kurztitel,
      langtitel: '',
      abrufkennung: '',
    })),
  );
  vi.mocked(f.umgebung.leseGesetzesXML).mockImplementation(async (k) =>
    k === 'A' ? '<kaputt' : '<gesetz><infos><kurztitel>B</kurztitel></infos></gesetz>',
  );
  const bericht = await fuehrePraefixAuswertungAus(auftrag, f.umgebung);
  expect(bericht.fehlgeschlagen.map((e) => e.kurztitel)).toEqual(['A', 'B', 'Fremd', 'Doppelt']);
  expect(f.xml()).toBe(liste);
  expect(f.umgebung.schreibeListe).not.toHaveBeenCalled();
});
it('beschränkt die Auswahl ohne Beachtung der Großschreibung', async () => {
  const f = fake();
  await fuehrePraefixAuswertungAus({ ...auftrag, kurztitel: ['b'] }, f.umgebung);
  expect(f.umgebung.leseGesetzesXML).toHaveBeenCalledExactlyOnceWith('B');
});
it('bricht bei Dateilesefehlern ab und übergibt den bisherigen Bericht', async () => {
  const f = fake();
  const status: string[] = [];
  f.umgebung.melde = (meldung) => {
    if (meldung.art === 'status') status.push(meldung.text);
  };
  vi.mocked(f.umgebung.leseGesetzesXML).mockRejectedValue(new Error('Zugriff verweigert'));
  const melden = vi.fn();
  await expect(fuehrePraefixAuswertungAus(auftrag, f.umgebung, melden)).rejects.toThrow(
    'Zugriff verweigert',
  );
  expect(melden).toHaveBeenCalledWith(expect.objectContaining({ gespeichert: 0 }));
  expect(f.xml()).toBe(liste);
  expect(status.at(-1)).toBe('Abgeschlossen: 1 · erfolgreich: 0 · fehlgeschlagen: 1 · aktiv: 0');
});
it('behält bestätigte Pakete bei späterem Schreibfehler und zählt nur Bestätigtes', async () => {
  const f = fake(Array.from({ length: 201 }, (_, i) => `G${i}`));
  const status: string[] = [];
  f.umgebung.melde = (meldung) => {
    if (meldung.art === 'status') status.push(meldung.text);
  };
  // Erstes Paket tatsächlich speichern, zweites scheitern lassen.
  const schreiben = f.umgebung.schreibeListe;
  const original = vi.mocked(schreiben).getMockImplementation();
  if (!original) throw new Error('Fake-Schreiber fehlt');
  vi.mocked(schreiben)
    .mockReset()
    .mockImplementationOnce(original)
    .mockRejectedValueOnce(new Error('Schreibfehler'));
  const melden = vi.fn();
  await expect(fuehrePraefixAuswertungAus(auftrag, f.umgebung, melden)).rejects.toThrow(
    'Schreibfehler',
  );
  expect(f.xml()).toContain('>G199</gesetz>');
  expect(f.xml()).not.toContain('>G200</gesetz>');
  expect(melden).toHaveBeenCalledWith(expect.objectContaining({ gespeichert: 200 }));
  expect(status.at(-1)).toBe(
    'Abgeschlossen: 201 · erfolgreich: 200 · fehlgeschlagen: 1 · aktiv: 0',
  );
});
