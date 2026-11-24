// Integriert die Befundbereinigung mit Inhaltsvergleich, echter Sicherungsschleife und FIFO-Sperren.
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';

import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { beforeEach, expect, it, vi } from 'vitest';
import { erzeugeSperreAttrappe } from '@/test/plattform/dateiSperreAttrappe';
import { baueXML, parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  BeschaedigteMarkierungsdateiFehler,
  ladeEintraege,
  ladeEintraegeFuerPruefung,
  ladeEintraegeUnterSperre,
} from './markierungSpeicher.lesen';
import {
  beurteileMarkierungsImport,
  ersetzeMarkierungenDatei,
  zusammenfuehrenMarkierungen,
} from '@/lib/markierungen/dateiimport/dateiimport.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  archiv: vi.fn(),
  schreiben: vi.fn(),
  meldung: vi.fn(),
  sperren: vi.fn(),
  konsole: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (
    befehl: string,
    args: { relativerPfad: string; inhalt: string; token?: string; vorgang?: string },
  ) =>
    befehl === 'atomar_datei_schreiben'
      ? io.schreiben(args.relativerPfad, args.inhalt, args.token, args.vorgang)
      : io.archiv(befehl, args),
}));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: (...args: unknown[]) => io.meldung(...args),
  meldeDateibefund: (...args: unknown[]) => io.meldung(...args),
}));
vi.mock('@/lib/markierungen/eintrag/markierungSpeicher.ereignisse', () => ({
  meldeMarkierungenBulkGeaendert: vi.fn(async () => []),
  meldeMarkierungGeaendert: vi.fn(async () => []),
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (absolut: string) => {
    const inhalt = io.dateien.get(absolut.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error(`Fehlt: ${absolut}`);
    return inhalt;
  },
  exists: async (absolut: string) => io.dateien.has(absolut.replace('/daten/LexLata/', '')),
  mkdir: async () => {},
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  ermittleGesetzDateipfad: async () => 'markierungen/BGB_de-bund-markierungen.xml',
  mitGesetzDateiSperre: (
    _gesetz: unknown,
    _ordner: string,
    _suffix: string,
    aktion: (token: string) => Promise<unknown>,
  ) => io.sperren('quelle', aktion),
  merkePruefpflichtigeAenderungVor: async () => 'vorgang',
  schliessePruefpflichtigeQuelleAb: async () => true,
  sicherstelleOrdner: async () => {},
}));
const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
const pfad = 'markierungen/BGB_de-bund-markierungen.xml';
const sicherung = pfad + '.bak';
/** Meldung als Text ohne das nie angezeigte Sicherungsfeld (dient nur der Schaltfläche). */
const ohneSicherungsfeld = (wert: unknown) =>
  JSON.stringify(wert, (k, v: unknown) => (k === 'sicherung' ? undefined : v));
const gut: import('./markierungSpeicher').MarkierungsEintrag[] = [
  markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar' as const,
    ausgangsstelle: normAusgangsstelle('§ 1'),
    kommentarText: 'A',
  }),
  markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar' as const,
    ausgangsstelle: normAusgangsstelle('§ 2'),
    kommentarText: 'B',
  }),
];
const defekt = (eintraege = gut) =>
  baueXML(gesetz, eintraege).replace(
    '</inhalt>',
    '<kommentar><elementstand><textlaenge>0</textlaenge></elementstand><kommentartext>privat</kommentartext></kommentar></inhalt>',
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(io.konsole);
  io.dateien.clear();
  io.sperren.mockImplementation(erzeugeSperreAttrappe());
  io.schreiben.mockImplementation(async (ziel: string, inhalt: string) => {
    io.dateien.set(ziel, inhalt);
  });
  io.archiv.mockImplementation(
    async (befehl: string, args: { relativerPfad: string; erwarteterInhalt: string }) => {
      expect(befehl).toBe('archiviere_beschaedigte_datei');
      if (io.dateien.get(args.relativerPfad) !== args.erwarteterInhalt)
        return { status: 'veraendert', sicherungspfad: null };
      io.dateien.set(sicherung, args.erwarteterInhalt);
      io.dateien.delete(args.relativerPfad);
      return { status: 'archiviert', sicherungspfad: sicherung };
    },
  );
});

it.each(['normal', 'gesperrt'] as const)(
  'bereinigt %s einmal und erhält das genaue Original',
  async (weg) => {
    const original = defekt();
    io.dateien.set(pfad, original);
    const laden = () =>
      weg === 'normal'
        ? ladeEintraege(gesetz)
        : ladeEintraegeUnterSperre(gesetz, 'token', 'vorgang');
    expect(await laden()).toMatchObject(gut);
    expect(io.dateien.get(sicherung)).toBe(original);
    expect(parseEintraege(io.dateien.get(pfad) ?? '', gesetz)).toMatchObject({
      eintraege: gut,
      befunde: [],
    });
    expect(io.meldung).toHaveBeenCalledTimes(1);
    expect(io.meldung).toHaveBeenCalledWith(
      expect.objectContaining({ grund: 'bereinigt', betroffen: pfad.split('/').at(-1) }),
    );
    expect(io.meldung).toHaveBeenCalledWith(expect.objectContaining({ sicherung }));
    expect(ohneSicherungsfeld(io.meldung.mock.calls[0])).not.toContain(sicherung);
    expect(io.konsole).toHaveBeenCalledWith(expect.stringContaining(sicherung));
    expect(await laden()).toMatchObject(gut);
    expect(io.archiv).toHaveBeenCalledTimes(1);
    expect(io.meldung).toHaveBeenCalledTimes(1);
  },
);

it('bereinigt zwei gleichzeitige Ladevorgänge mit genau einer Sicherung und Meldung', async () => {
  io.dateien.set(pfad, defekt());
  const geladen = await Promise.all([ladeEintraege(gesetz), ladeEintraege(gesetz)]);
  expect(geladen).toMatchObject([gut, gut]);
  expect(io.archiv).toHaveBeenCalledTimes(1);
  expect(io.meldung).toHaveBeenCalledTimes(1);
});

it('schreibt gültige Dateien sperrefrei und meldungsfrei lesend fort', async () => {
  io.dateien.set(pfad, baueXML(gesetz, gut));
  expect(await ladeEintraege(gesetz)).toMatchObject(gut);
  expect(io.sperren).not.toHaveBeenCalled();
  expect(io.schreiben).not.toHaveBeenCalled();
  expect(io.meldung).not.toHaveBeenCalled();
});

it('nutzt eine vor der Sperre anderweitig bereinigte Fassung ohne Sicherung', async () => {
  io.dateien.set(pfad, defekt());
  io.sperren.mockImplementationOnce(async (_pfad, aktion) => {
    io.dateien.set(pfad, baueXML(gesetz, gut));
    return aktion('token');
  });
  expect(await ladeEintraege(gesetz)).toMatchObject(gut);
  expect(io.archiv).not.toHaveBeenCalled();
  expect(io.meldung).not.toHaveBeenCalled();
});

it('verwendet nach externer Änderung ausschließlich die tatsächlich gesicherte Fassung', async () => {
  io.dateien.set(pfad, defekt());
  const neu = [
    markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar' as const,
      ausgangsstelle: normAusgangsstelle('§ 3'),
      kommentarText: 'Neu',
    }),
  ];
  const neuerInhalt = defekt(neu);
  io.archiv.mockImplementationOnce(async () => {
    io.dateien.set(pfad, neuerInhalt);
    return { status: 'veraendert', sicherungspfad: null };
  });
  expect(await ladeEintraege(gesetz)).toMatchObject(neu);
  expect(io.dateien.get(sicherung)).toBe(neuerInhalt);
  expect(parseEintraege(io.dateien.get(pfad) ?? '').eintraege).toMatchObject(neu);
  expect(io.archiv).toHaveBeenCalledTimes(2);
});

it('bricht nach drei externen Änderungen ohne veraltetes Rückschreiben ab', async () => {
  io.dateien.set(pfad, defekt());
  io.archiv.mockImplementation(async () => {
    io.dateien.set(
      pfad,
      defekt([
        markierungsEintrag({
          ...gut[0],
          typ: 'kommentar',
          ausgangsstelle: normAusgangsstelle(
            ['§', String(io.archiv.mock.calls.length)].filter(Boolean).join(' '),
          ),
          kommentarText: 'Neu',
        }),
      ]),
    );
    return { status: 'veraendert', sicherungspfad: null };
  });
  await expect(ladeEintraege(gesetz)).rejects.toThrow('dreimal');
  expect(io.archiv).toHaveBeenCalledTimes(3);
  expect(io.schreiben).not.toHaveBeenCalled();
  expect(io.dateien.has(sicherung)).toBe(false);
  expect(io.meldung).toHaveBeenCalledTimes(1);
  expect(io.meldung).toHaveBeenCalledWith(expect.objectContaining({ typ: 'fehler' }));
});

it.each([
  'Sicherung fehlgeschlagen',
  'gesichert_aber_nicht_entfernt',
  'Rückschreiben fehlgeschlagen',
] as const)('beendet %s ohne Ersatzbestand oder Erfolg', async (fehlerfall) => {
  const original = defekt();
  io.dateien.set(pfad, original);
  if (fehlerfall === 'Sicherung fehlgeschlagen')
    io.archiv.mockRejectedValueOnce(new Error(fehlerfall));
  if (fehlerfall === 'gesichert_aber_nicht_entfernt')
    io.archiv.mockImplementationOnce(async () => {
      io.dateien.set(sicherung, original);
      return { status: 'gesichert_aber_nicht_entfernt', sicherungspfad: sicherung };
    });
  if (fehlerfall === 'Rückschreiben fehlgeschlagen')
    io.schreiben.mockRejectedValueOnce(new Error(fehlerfall));
  const lauf = ladeEintraege(gesetz);
  await expect(lauf).rejects.toThrow(
    fehlerfall === 'gesichert_aber_nicht_entfernt' ? 'nicht entfernt' : fehlerfall,
  );
  // Sicherungspfade nur in der Konsole, auch nicht im geworfenen Fehler.
  await expect(lauf).rejects.not.toThrow(sicherung);
  expect(io.schreiben).toHaveBeenCalledTimes(fehlerfall === 'Rückschreiben fehlgeschlagen' ? 1 : 0);
  expect(io.meldung).toHaveBeenCalledTimes(1);
  expect(io.meldung).toHaveBeenCalledWith(expect.objectContaining({ typ: 'fehler' }));
  if (fehlerfall !== 'Sicherung fehlgeschlagen') {
    expect(io.dateien.get(sicherung)).toBe(original);
    expect(io.meldung).toHaveBeenCalledWith(
      expect.objectContaining({ betroffen: pfad.split('/').at(-1) }),
    );
    expect(io.meldung).toHaveBeenCalledWith(expect.objectContaining({ sicherung }));
    expect(ohneSicherungsfeld(io.meldung.mock.calls[0])).not.toContain(sicherung);
    expect(io.konsole).toHaveBeenCalledWith(expect.stringContaining(sicherung));
  }
});

it('lässt Befunde im Prüfweg schreibfrei und heilt danach über den normalen Sicherungsweg', async () => {
  const original = defekt();
  io.dateien.set(pfad, original);
  await expect(ladeEintraegeFuerPruefung(gesetz)).rejects.toBeInstanceOf(
    BeschaedigteMarkierungsdateiFehler,
  );
  expect(io.archiv).not.toHaveBeenCalled();
  expect(io.schreiben).not.toHaveBeenCalled();
  expect(io.meldung).not.toHaveBeenCalled();
  await ladeEintraege(gesetz);
  expect(await ladeEintraegeFuerPruefung(gesetz)).toMatchObject(gut);
  expect(io.dateien.get(sicherung)).toBe(original);
});

it.each(['importieren', 'ersetzen'] as const)(
  'meldet Befunde beim %s ohne Sicherung der Importquelle',
  async (weg) => {
    const original = defekt();
    // Importweg der App: Befunde gehen als Meldungen an den Importabschluss, nicht als Banner.
    let importMeldungen = 0;
    if (weg === 'importieren') {
      const gelesen = beurteileMarkierungsImport(original, gesetz);
      importMeldungen = gelesen.meldungen.length;
      await zusammenfuehrenMarkierungen(gesetz, gelesen.eintraege);
    } else await ersetzeMarkierungenDatei(gesetz, original);
    expect(parseEintraege(io.dateien.get(pfad) ?? '').eintraege).toMatchObject(gut);
    expect(io.archiv).not.toHaveBeenCalled();
    expect(io.dateien.has(sicherung)).toBe(false);
    if (weg === 'importieren') {
      expect(importMeldungen).toBe(1);
      expect(io.meldung).not.toHaveBeenCalled();
    } else expect(io.meldung).toHaveBeenCalledTimes(1);
  },
);

it.each([
  '<bezeichnung>§ 2</bezeichnung><bezeichnung>§ 3</bezeichnung><verweistextZeichenbereich start="0" ende="3"/>',
  '<bezeichnung></bezeichnung><verweistextZeichenbereich start="0" ende="3"/>',
  '<bezeichnung>§ 2</bezeichnung><verweistextZeichenbereich start="0" ende="3"/><verweistextZeichenbereich start="0" ende="99"/>',
])('sichert defekte Verweiszielangaben und erhält lesbare Nachbareinträge: %s', async (ziel) => {
  const original = baueXML(gesetz, gut).replace(
    '</inhalt>',
    `<verweismarkierung><bezeichnung>§ 3</bezeichnung><elementstand><textlaenge>0</textlaenge></elementstand><verweisinhalt><verweistext>§ 2</verweistext><verweisziel>${ziel}</verweisziel></verweisinhalt></verweismarkierung></inhalt>`,
  );
  io.dateien.set(pfad, original);
  await expect(ladeEintraegeFuerPruefung(gesetz)).rejects.toBeInstanceOf(
    BeschaedigteMarkierungsdateiFehler,
  );
  expect(io.archiv).not.toHaveBeenCalled();
  expect(await ladeEintraege(gesetz)).toEqual(gut);
  expect(io.dateien.get(sicherung)).toBe(original);
  expect(parseEintraege(io.dateien.get(pfad) ?? '', gesetz)).toEqual({
    eintraege: gut,
    befunde: [],
  });
  expect(io.meldung).toHaveBeenCalledTimes(1);
});
