import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alleBannerSchliessen,
  bannerSchliessen,
  getSnapshot,
  type Banner,
} from '@/lib/banner/banner.index';
import type { GesetzLadeBefund } from '@/lib/persistenz/gesetz/gesetz.index';

const mocks = vi.hoisted(() => ({ repariere: vi.fn(), warte: vi.fn() }));
vi.mock('@/lib/import/import.index', () => ({ repariereGesetze: mocks.repariere }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  warteAufSpeicherBatchAbschluss: mocks.warte,
}));
import { meldeGesetzLadeBefunde } from './gesetzLadeMeldungen';

const ziel = { dateiBasis: 'BGB', kurztitel: 'BGB', quelle: 'de-bund' as const };
const zielBW = { dateiBasis: 'BGB_de-bw', kurztitel: 'BGB', quelle: 'de-bw' as const };
const befunde: GesetzLadeBefund[] = [
  { status: 'reparierbar', ...ziel },
  { status: 'reparierbar', ...zielBW },
];
const netzfehler = { grund: 'keineVerbindung', meldung: 'Kein Netz' };

/** Gruppen (Grund bzw. Aktion) eines Banners mit ihren Namen. */
function gruppen(banner: Banner | undefined): Record<string, string[]> {
  return Object.fromEntries(
    (banner?.gliederung?.kategorien ?? []).flatMap((k) =>
      k.gruppen.map((g) => [g.schluessel, g.namen.map((n) => n.name)]),
    ),
  );
}

/** Sichtbares Banner an Position `nr`; fehlt es, scheitert der Test verständlich. */
function sichtbar(nr = 0): Banner {
  const banner = getSnapshot()[nr];
  if (!banner) throw new Error(`Banner ${nr} fehlt.`);
  return banner;
}

/** Klickt die Bannerschaltfläche des ersten Banners. */
async function klicke(): Promise<void> {
  const aktion = sichtbar().aktion;
  if (!aktion) throw new Error('Bannerschaltfläche fehlt.');
  await aktion.onClick();
}

function reparierbar(n: number): GesetzLadeBefund[] {
  return Array.from({ length: n }, (_, i) => ({
    status: 'reparierbar' as const,
    dateiBasis: `G${i}`,
    kurztitel: `G${i}`,
    quelle: 'de-bund' as const,
  }));
}

beforeEach(() => {
  alleBannerSchliessen();
  vi.resetAllMocks();
  mocks.warte.mockResolvedValue(undefined);
});

describe('Gesetz-Sammelmeldungen', () => {
  it('gruppiert gemischte Befunde in höchstens zwei Banner und nennt die erreichten Zustände', () => {
    meldeGesetzLadeBefunde(
      [
        ...befunde,
        { status: 'archiviert', dateiBasis: 'eu', sicherungspfad: 'gesetze/EU.sicherung' },
        {
          status: 'gesichert_aber_nicht_entfernt',
          dateiBasis: 'XYZ',
          sicherungspfad: 'gesetze/XYZ.sicherung',
        },
        { status: 'unlesbar', dateiBasis: 'ABC', fehler: 'Zugriff verweigert' },
        { status: 'sicherung_fehlgeschlagen', dateiBasis: 'DEF', fehler: 'Voll' },
        { status: 'fehlt', dateiBasis: 'GHI' },
        { status: 'leer', dateiBasis: 'JKL' },
        { status: 'ordner_unlesbar', fehler: 'Ordner fehlt' },
      ],
      { current: 0 },
    );
    expect(getSnapshot()).toHaveLength(2);
    expect(getSnapshot()[0]).toMatchObject({
      art: 'nichtGeladeneGesetze',
      aktion: { label: 'Alle aktualisieren' },
    });
    expect(sichtbar().text).toContain('BGB (Bund)');
    expect(sichtbar().text).toContain('BGB (Landesrecht BW)');
    const dateibefunde = sichtbar(1);
    expect(dateibefunde.art).toBe('dateibefunde');
    expect(dateibefunde.gliederung?.form).toBe('gliederung');
    expect(gruppen(dateibefunde)).toEqual({
      imDatenordnerGesichert: ['eu.xml'],
      gesichertNichtEntfernt: ['XYZ.xml'],
      dateiFehlt: ['GHI.xml'],
      dateiLeer: ['JKL.xml'],
      nichtLesbar: ['ABC.xml', 'Gesetzordner'],
      sicherungFehlgeschlagen: ['DEF.xml'],
    });
    // Keine Pfade, einmal der Verweis auf die Sicherungen im Datenordner.
    expect(JSON.stringify(dateibefunde)).not.toContain('.sicherung');
    expect(dateibefunde.gliederung?.kategorien[0]?.saetze).toHaveLength(1);
  });

  it('meldet während einer laufenden Reparatur und für leere Befunde nichts', () => {
    meldeGesetzLadeBefunde(befunde, { current: 1 });
    meldeGesetzLadeBefunde([], { current: 0 });
    expect(getSnapshot()).toEqual([]);
  });

  it('hält Ladezustand und Ref bis nach dem Speichernachlauf und verhindert Doppelklicks', async () => {
    let beenden!: () => void;
    mocks.warte.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          beenden = resolve;
        }),
    );
    mocks.repariere.mockResolvedValue([
      { status: 'repariert', ziel, gesetz: {} },
      { status: 'bereits_gueltig', ziel: zielBW, gesetz: {} },
    ]);
    const ref = { current: 0 };
    meldeGesetzLadeBefunde(befunde, ref);
    const aktion = sichtbar().aktion!;
    const lauf = aktion.onClick();
    aktion.onClick();
    expect(ref.current).toBe(1);
    expect(sichtbar().laedt).toBe(true);
    await vi.waitFor(() => expect(mocks.warte).toHaveBeenCalledOnce());
    expect(mocks.repariere).toHaveBeenCalledOnce();
    expect(ref.current).toBe(1);
    expect(getSnapshot()).toHaveLength(1);
    beenden();
    await lauf;
    expect(ref.current).toBe(0);
    expect(getSnapshot()).toEqual([]);
  });

  it('behält endgültige Teilprobleme, während nur Verbindungsfehler erneut versucht werden', async () => {
    mocks.repariere
      .mockResolvedValueOnce([
        { status: 'gesichert_aber_nicht_entfernt', ziel, sicherungspfad: 'gesetze/BGB.sicherung' },
        { status: 'verbindungsfehler', ziel: zielBW, fehler: netzfehler },
      ])
      .mockResolvedValueOnce([{ status: 'repariert', ziel: zielBW, gesetz: {} }]);
    meldeGesetzLadeBefunde(befunde, { current: 0 });
    const id = sichtbar().id;
    await klicke();
    expect(gruppen(getSnapshot()[0])).toEqual({
      keineVerbindung: ['BGB (Landesrecht BW)'],
      gesichertNichtEntfernt: ['BGB (Bund)'],
    });
    expect(sichtbar().text).not.toContain('\n');
    expect(sichtbar().text).not.toContain('gesetze/BGB.sicherung');
    await klicke();
    expect(mocks.repariere.mock.calls[1]![0]).toEqual([zielBW]);
    expect(sichtbar().id).toBe(id);
    expect(sichtbar().text).toContain('gesichert, aber nicht entfernt');
    expect(sichtbar().aktion).toBeUndefined();
    expect(sichtbar().laedt).toBe(false);
  });

  it('erhält bei ungeklärtem Downloadfehler denselben Banner mit Wiederholungsangebot', async () => {
    mocks.repariere
      .mockResolvedValueOnce([
        { status: 'fehler', ziel, fehler: { grund: 'download', meldung: 'Download abgebrochen' } },
        { status: 'repariert', ziel: zielBW, gesetz: {} },
      ])
      .mockResolvedValueOnce([{ status: 'repariert', ziel, gesetz: {} }]);
    const ref = { current: 0 };
    meldeGesetzLadeBefunde(befunde, ref);
    const id = sichtbar().id;
    await klicke();
    expect(ref.current).toBe(0);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({ id, laedt: false });
    expect(sichtbar().text).toContain('Download abgebrochen');
    expect(sichtbar().text).not.toContain('Verbindungsfehler');
    expect(sichtbar().aktion?.label).toBe('Alle aktualisieren');
    await klicke();
    expect(mocks.repariere.mock.calls[1]![0]).toEqual([ziel]);
    expect(getSnapshot()).toEqual([]);
  });

  it('bietet ein beschäftigtes Ziel erneut an', async () => {
    mocks.repariere
      .mockResolvedValueOnce([
        {
          status: 'beschaeftigt',
          ziel,
          fehler: { grund: 'beschaeftigt', meldung: 'Anderer Import' },
        },
      ])
      .mockResolvedValueOnce([{ status: 'bereits_gueltig', ziel, gesetz: {} }]);
    meldeGesetzLadeBefunde([befunde[0]!], { current: 0 });
    await klicke();
    expect(sichtbar().text).toContain('anderweitig');
    expect(sichtbar().aktion).toBeDefined();
    await klicke();
    expect(getSnapshot()).toEqual([]);
  });

  it('beendet bei unerwarteter Ausnahme den Ladezustand ohne erfundenen Erfolg und erhält frühere Teilprobleme', async () => {
    mocks.repariere
      .mockResolvedValueOnce([
        { status: 'sicherung_fehlgeschlagen', ziel, fehler: 'Voll' },
        { status: 'verbindungsfehler', ziel: zielBW, fehler: netzfehler },
      ])
      .mockRejectedValueOnce(new Error('Unerwartet'));
    const ref = { current: 0 };
    meldeGesetzLadeBefunde(befunde, ref);
    await klicke();
    await klicke();
    expect(ref.current).toBe(0);
    expect(sichtbar().laedt).toBe(false);
    expect(gruppen(getSnapshot()[0])).toMatchObject({
      sicherungFehlgeschlagen: ['BGB (Bund)'],
      keineVerbindung: ['BGB (Landesrecht BW)'],
    });
    expect(sichtbar().text).toContain('Unerwartet');
    expect(sichtbar().text).not.toContain('erfolgreich');
    expect(sichtbar().aktion).toBeDefined();
  });

  it('setzt auch bei einem Fehler beim Warten Ref und Ladezustand zurück', async () => {
    mocks.repariere.mockResolvedValue([{ status: 'repariert', ziel, gesetz: {} }]);
    mocks.warte.mockRejectedValue(new Error('Nachlauf fehlgeschlagen'));
    const ref = { current: 0 };
    meldeGesetzLadeBefunde([befunde[0]!], ref);
    await klicke();
    expect(ref.current).toBe(0);
    expect(sichtbar().laedt).toBe(false);
    expect(sichtbar().text).toContain('Nachlauf fehlgeschlagen');
  });

  it('behandelt fehlende Einzelergebnisse als ungeklärt und lässt das Reparaturangebot bestehen', async () => {
    mocks.repariere.mockResolvedValue([{ status: 'repariert', ziel, gesetz: {} }]);
    meldeGesetzLadeBefunde(befunde, { current: 0 });
    await klicke();
    expect(sichtbar().text).toContain('kein eindeutiges Ergebnis');
    expect(sichtbar().aktion).toBeDefined();
    await klicke();
    expect(mocks.repariere.mock.calls[1]![0]).toEqual([zielBW]);
  });

  it('ordnet doppelte oder quellenfremde Ergebnisse keinem anderen Ziel als Erfolg zu', async () => {
    mocks.repariere.mockResolvedValue([
      { status: 'repariert', ziel, gesetz: {} },
      { status: 'repariert', ziel, gesetz: {} },
      { status: 'repariert', ziel: { ...zielBW, quelle: 'de-bund' }, gesetz: {} },
    ]);
    meldeGesetzLadeBefunde(befunde, { current: 0 });
    await klicke();
    expect(gruppen(getSnapshot()[0])).toEqual({
      aktualisierungFehlgeschlagen: ['BGB (Bund)', 'BGB (Landesrecht BW)'],
    });
    expect(sichtbar().aktion).toBeDefined();
    await klicke();
    expect(mocks.repariere.mock.calls[1]![0]).toEqual([ziel, zielBW]);
  });

  it.each([
    ['archiviert', 'imDatenordnerGesichert'],
    ['fehlt', 'dateiFehlt'],
    ['leer', 'dateiLeer'],
    ['unlesbar', 'nichtLesbar'],
    ['sicherung_fehlgeschlagen', 'sicherungFehlgeschlagen'],
    ['fehler', 'aktualisierungFehlgeschlagen'],
  ])('meldet das Reparaturergebnis %s unter dem Grund %s', async (status, grund) => {
    mocks.repariere.mockResolvedValue([
      {
        status,
        ziel,
        sicherungspfad: 'gesetze/sicherung',
        fehler: status === 'fehler' ? { grund: 'sonstiger', meldung: 'Problem' } : 'Problem',
      },
    ]);
    meldeGesetzLadeBefunde([befunde[0]!], { current: 0 });
    await klicke();
    expect(gruppen(getSnapshot()[0])).toEqual({ [grund]: ['BGB (Bund)'] });
    expect(sichtbar().text).not.toContain('gesetze/sicherung');
    expect(sichtbar().aktion).toBeUndefined();
  });

  it('führt 10 reparierbare Befunde in einem gegliederten Banner und erweitert es um weitere', () => {
    meldeGesetzLadeBefunde(reparierbar(10), { current: 0 });
    expect(getSnapshot()).toHaveLength(1);
    const banner = sichtbar();
    expect(banner).toMatchObject({
      art: 'nichtGeladeneGesetze',
      aktion: { label: 'Alle aktualisieren' },
    });
    expect(banner.gliederung?.form).toBe('gliederung');
    expect(banner.text).toContain('10');
    const [gruppe] = Object.values(gruppen(banner));
    expect(gruppe).toHaveLength(10);

    // Weitere (und bereits bekannte) Befunde erweitern dasselbe Banner.
    meldeGesetzLadeBefunde([...reparierbar(12), ...reparierbar(3)], { current: 0 });
    expect(getSnapshot()).toHaveLength(1);
    expect(sichtbar().id).toBe(banner.id);
    expect(Object.values(gruppen(getSnapshot()[0]))[0]).toHaveLength(12);
    expect(sichtbar().aktion?.label).toBe('Alle aktualisieren');
  });

  it('nennt bis zu drei Gesetze im Satz ohne Gliederung', () => {
    meldeGesetzLadeBefunde(reparierbar(3), { current: 0 });
    expect(sichtbar().gliederung).toBeUndefined();
    for (const name of ['G0', 'G1', 'G2']) expect(sichtbar().text).toContain(name);
  });

  it('beginnt nach dem Schließen ein neues Banner nur mit den neuen Befunden', () => {
    meldeGesetzLadeBefunde(reparierbar(2), { current: 0 });
    bannerSchliessen(sichtbar().id);
    meldeGesetzLadeBefunde([{ status: 'reparierbar', ...ziel }], { current: 0 });
    expect(getSnapshot()).toHaveLength(1);
    expect(sichtbar().text).toContain('BGB (Bund)');
    expect(sichtbar().text).not.toContain('G0');
  });

  it('gliedert gemischte Fehlschläge nach Grund und bietet nur Wiederholbares erneut an', async () => {
    const ziele = Array.from({ length: 4 }, (_, i) => ({
      dateiBasis: `G${i}`,
      kurztitel: `G${i}`,
      quelle: 'de-bund' as const,
    }));
    mocks.repariere.mockResolvedValueOnce([
      { status: 'verbindungsfehler', ziel: ziele[0], fehler: netzfehler },
      { status: 'verbindungsfehler', ziel: ziele[1], fehler: netzfehler },
      { status: 'beschaeftigt', ziel: ziele[2], fehler: { grund: 'beschaeftigt', meldung: 'x' } },
      {
        status: 'fehler',
        ziel: ziele[3],
        fehler: { grund: 'download', meldung: 'Download abgebrochen' },
      },
    ]);
    meldeGesetzLadeBefunde(reparierbar(4), { current: 0 });
    await klicke();
    const banner = sichtbar();
    expect(gruppen(banner)).toEqual({
      keineVerbindung: ['G0 (Bund)', 'G1 (Bund)'],
      beschaeftigt: ['G2 (Bund)'],
      downloadFehlgeschlagen: ['G3 (Bund)'],
    });
    expect(banner.gliederung?.form).toBe('gliederung');
    expect(banner.text).not.toContain('\n');
    expect(banner.aktion?.label).toBe('Alle aktualisieren');
    mocks.repariere.mockResolvedValueOnce(
      ziele.map((z) => ({
        status: 'fehler',
        ziel: z,
        fehler: { grund: 'sonstiger', meldung: 'p' },
      })),
    );
    await klicke();
    expect(gruppen(getSnapshot()[0])).toEqual({
      aktualisierungFehlgeschlagen: ['G0 (Bund)', 'G1 (Bund)', 'G2 (Bund)', 'G3 (Bund)'],
    });
    expect(sichtbar().aktion).toBeUndefined();
  });
});
