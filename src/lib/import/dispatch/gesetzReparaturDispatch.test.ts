// Prüft Reparaturzustände, konkrete Reparaturdatei und Sperrfreigabe.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type {
  GesetzImportZielpruefung,
  GesetzReparaturZiel,
} from '@/lib/import/importVertrag.types';

const mocks = vi.hoisted(() => ({
  pruefen: vi.fn(),
  sichern: vi.fn(),
  'de-bund': vi.fn(),
  'de-bw': vi.fn(),
  sperren: vi.fn(),
  freigeben: vi.fn(),
  vorgang: vi.fn(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
  pruefeGesetzDatei: mocks.pruefen,
  sichereUngueltigeGesetzDatei: mocks.sichern,
}));
vi.mock('@/lib/import/bund/bund.index', () => ({ importiereVomInternet: mocks['de-bund'] }));
vi.mock('@/lib/import/bw/bw.index', () => ({ importiereGesetzVomInternetBW: mocks['de-bw'] }));
vi.mock('@/lib/import/dispatch/importVorgang', () => ({
  versucheGesetzSperreZuErhalten: mocks.sperren,
  gibGesetzSperreFrei: mocks.freigeben,
  mitManuellemImportVorgang: mocks.vorgang,
}));
import { repariereGesetze } from './gesetzReparaturDispatch';
const ziel: GesetzReparaturZiel = {
  dateiBasis: 'TestG_de-bund',
  kurztitel: 'TestG',
  quelle: 'de-bund',
};
const gesetz = { kurztitel: 'TestG', normgeber: 'de-bund' } as GesetzDarstellung;
const ungueltig = { status: 'ungueltig', dateiBasis: ziel.dateiBasis, inhalt: 'kaputt' };
const gueltig = { status: 'gueltig', dateiBasis: ziel.dateiBasis, inhalt: 'gesund', gesetz };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.vorgang.mockImplementation((arbeit: () => Promise<unknown>) => arbeit());
  mocks.sperren.mockResolvedValue(true);
  mocks.freigeben.mockResolvedValue(undefined);
  mocks.pruefen.mockResolvedValue(ungueltig);
  mocks['de-bund'].mockResolvedValue({ art: 'erfolg', gesetz });
  mocks.sichern.mockResolvedValue({ status: 'archiviert', sicherungspfad: 'Sicherung.xml' });
});
describe('repariereGesetze', () => {
  it('leere Ziele benötigen keinen Vorgang', async () => {
    expect(await repariereGesetze([])).toEqual([]);
    expect(mocks.vorgang).not.toHaveBeenCalled();
  });
  it('repariert ausschließlich die angeforderte Quelle und konkrete Datei', async () => {
    const bwZiel: GesetzReparaturZiel = { ...ziel, quelle: 'de-bw', dateiBasis: 'TestG_de-bw' };
    mocks['de-bw'].mockResolvedValue({
      art: 'erfolg',
      gesetz: { ...gesetz, normgeber: 'de-bw' },
    });
    expect(await repariereGesetze([ziel, bwZiel])).toMatchObject([
      { status: 'repariert', ziel },
      { status: 'repariert', ziel: bwZiel },
    ]);
    expect(mocks.pruefen.mock.calls).toEqual([['TestG_de-bund'], ['TestG_de-bw']]);
    expect(mocks['de-bund']).toHaveBeenCalledWith(
      'TestG',
      undefined,
      expect.objectContaining({ ziel }),
      expect.objectContaining({ referenzenFuer: expect.any(Function) }),
    );
    expect(mocks['de-bw']).toHaveBeenCalledWith(
      'TestG',
      undefined,
      expect.objectContaining({ ziel: bwZiel }),
      expect.objectContaining({ referenzenFuer: expect.any(Function) }),
    );
    expect(mocks.freigeben).toHaveBeenCalledTimes(2);
  });
  it.each([
    [gueltig, 'bereits_gueltig'],
    [{ status: 'fehlt', dateiBasis: 'TestG_de-bund' }, 'fehlt'],
    [{ status: 'leer', dateiBasis: 'TestG_de-bund' }, 'leer'],
    [{ status: 'unlesbar', dateiBasis: 'TestG_de-bund', fehler: 'Lesefehler' }, 'unlesbar'],
  ])('beendet eine veraltete Reparatur nach Vorprüfung (%j)', async (pruefung, status) => {
    mocks.pruefen.mockResolvedValue(pruefung);
    expect(await repariereGesetze([ziel])).toMatchObject([{ status, ziel }]);
    expect(mocks['de-bund']).not.toHaveBeenCalled();
    expect(mocks.sichern).not.toHaveBeenCalled();
    expect(mocks.freigeben).toHaveBeenCalledOnce();
  });
  it('beschäftigte Ziele bleiben liegen und erhalten keine Freigabe fremder Sperren', async () => {
    mocks.sperren.mockResolvedValue(false);
    expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'beschaeftigt' }]);
    expect(mocks.pruefen).not.toHaveBeenCalled();
    expect(mocks.sichern).not.toHaveBeenCalled();
    expect(mocks.freigeben).not.toHaveBeenCalled();
  });
  it.each(['keineVerbindung', 'beschaeftigt'] as const)(
    'erhält die Datei bei %s und lässt späteren Erfolg zu',
    async (grund) => {
      mocks['de-bund'].mockResolvedValueOnce({
        art: 'fehler',
        fehler: { grund, meldung: 'später versuchen' },
      });
      expect(await repariereGesetze([ziel])).toMatchObject([
        { status: grund === 'keineVerbindung' ? 'verbindungsfehler' : 'beschaeftigt' },
      ]);
      expect(mocks.sichern).not.toHaveBeenCalled();
      expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'repariert' }]);
    },
  );
  it('bricht unmittelbar vor Schreiben bei inzwischen gültigem Ziel ab', async () => {
    mocks.pruefen.mockResolvedValueOnce(ungueltig).mockResolvedValueOnce(gueltig);
    mocks['de-bund'].mockImplementation(
      async (_titel: string, _fortschritt: unknown, pruefung: GesetzImportZielpruefung) => {
        await pruefung.vorSchreiben();
        throw new Error('Schreiben hätte nicht erreicht werden dürfen');
      },
    );
    expect(await repariereGesetze([ziel])).toEqual([{ status: 'bereits_gueltig', ziel, gesetz }]);
    expect(mocks.sichern).not.toHaveBeenCalled();
  });
  it.each([
    [gueltig, 'bereits_gueltig'],
    [{ status: 'fehlt', dateiBasis: 'TestG_de-bund' }, 'fehlt'],
    [{ status: 'leer', dateiBasis: 'TestG_de-bund' }, 'leer'],
    [{ status: 'unlesbar', dateiBasis: 'TestG_de-bund', fehler: 'Lesefehler' }, 'unlesbar'],
  ])('prüft nach echten Importfehlern erneut (%j)', async (pruefung, status) => {
    mocks.pruefen.mockResolvedValueOnce(ungueltig).mockResolvedValueOnce(pruefung);
    mocks['de-bund'].mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'speichern', meldung: 'Nachbereitung fehlgeschlagen' },
    });
    expect(await repariereGesetze([ziel])).toMatchObject([{ status }]);
    expect(mocks.sichern).not.toHaveBeenCalled();
  });
  it.each(['archiviert', 'gesichert_aber_nicht_entfernt', 'fehlt', 'leer'] as const)(
    'übernimmt den tatsächlichen Sicherungszustand %s',
    async (status) => {
      mocks.pruefen
        .mockResolvedValueOnce(ungueltig)
        .mockResolvedValueOnce({ ...ungueltig, inhalt: 'jetzt kaputt' });
      mocks['de-bund'].mockResolvedValue({
        art: 'fehler',
        fehler: { grund: 'nichtImIndex', meldung: 'kein Eintrag' },
      });
      mocks.sichern.mockResolvedValue({ status, sicherungspfad: 'Sicherung.xml' });
      expect(await repariereGesetze([ziel])).toMatchObject([{ status }]);
      expect(mocks.sichern).toHaveBeenCalledWith('TestG_de-bund', 'jetzt kaputt', {
        reparaturGescheitert: true,
      });
      expect(mocks['de-bw']).not.toHaveBeenCalled();
    },
  );
  it('prüft nach inzwischen gültiger Sicherungsrückgabe erneut die konkrete Datei', async () => {
    mocks['de-bund'].mockRejectedValue(new Error('Parser wirft'));
    mocks.pruefen
      .mockResolvedValueOnce(ungueltig)
      .mockResolvedValueOnce(ungueltig)
      .mockResolvedValueOnce(gueltig);
    mocks.sichern.mockResolvedValue({ status: 'gueltig', inhalt: 'gesund' });
    expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'bereits_gueltig' }]);
  });
  it('meldet Sicherungsfehler getrennt und bearbeitet weitere Ziele', async () => {
    mocks['de-bund'].mockRejectedValueOnce(new Error('Parser wirft'));
    mocks.sichern.mockRejectedValueOnce(new Error('Sicherung verweigert'));
    expect(await repariereGesetze([ziel, ziel])).toMatchObject([
      { status: 'sicherung_fehlgeschlagen', fehler: 'Sicherung verweigert' },
      { status: 'repariert' },
    ]);
    expect(mocks.freigeben).toHaveBeenCalledTimes(2);
  });
  it.each([
    [gueltig, 'bereits_gueltig'],
    [{ status: 'fehlt', dateiBasis: 'TestG_de-bund' }, 'fehlt'],
    [{ status: 'unlesbar', dateiBasis: 'TestG_de-bund', fehler: 'jetzt unlesbar' }, 'unlesbar'],
  ])(
    'prüft nach fehlgeschlagener Sicherung den aktuellen Zustand (%j)',
    async (pruefung, status) => {
      mocks['de-bund'].mockRejectedValue(new Error('Parser wirft'));
      mocks.pruefen
        .mockResolvedValueOnce(ungueltig)
        .mockResolvedValueOnce(ungueltig)
        .mockResolvedValueOnce(pruefung);
      mocks.sichern.mockRejectedValue(new Error('Sicherung verweigert'));
      expect(await repariereGesetze([ziel])).toMatchObject([{ status }]);
      expect(mocks.freigeben).toHaveBeenCalledOnce();
    },
  );
  it.each([
    [gueltig, 'bereits_gueltig'],
    [{ status: 'fehlt', dateiBasis: 'TestG_de-bund' }, 'fehlt'],
    [{ status: 'unlesbar', dateiBasis: 'TestG_de-bund', fehler: 'jetzt unlesbar' }, 'unlesbar'],
  ])('prüft auch nach Verbindungsfehlern den aktuellen Zustand (%j)', async (pruefung, status) => {
    mocks.pruefen.mockResolvedValueOnce(ungueltig).mockResolvedValueOnce(pruefung);
    mocks['de-bund'].mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'keineVerbindung', meldung: 'offline' },
    });
    expect(await repariereGesetze([ziel])).toMatchObject([{ status }]);
    expect(mocks.sichern).not.toHaveBeenCalled();
    expect(mocks.freigeben).toHaveBeenCalledOnce();
  });
  it('erfindet bei unerwarteter Leseausnahme keinen fehlenden Zustand', async () => {
    mocks.pruefen.mockRejectedValue(new Error('unerwartet'));
    expect(await repariereGesetze([ziel])).toMatchObject([
      { status: 'fehler', fehler: { meldung: 'unerwartet' } },
    ]);
    expect(mocks.sichern).not.toHaveBeenCalled();
    expect(mocks.freigeben).toHaveBeenCalledOnce();
  });
});

it('meldet ein gültiges namensgleiches Gesetz eines anderen Normgebers nicht als repariertes Ziel', async () => {
  mocks.pruefen.mockResolvedValue({ ...gueltig, gesetz: { ...gesetz, normgeber: 'de-bw' } });
  expect(await repariereGesetze([ziel])).toMatchObject([
    { status: 'fehler', fehler: { grund: 'format' } },
  ]);
  expect(mocks['de-bund']).not.toHaveBeenCalled();
  expect(mocks.sichern).not.toHaveBeenCalled();
});
it('prüft auch das importierte Reparaturergebnis gegen die vollständige Zielreferenz', async () => {
  mocks['de-bund'].mockResolvedValue({ art: 'erfolg', gesetz: { ...gesetz, normgeber: 'de-bw' } });
  expect(await repariereGesetze([ziel])).toMatchObject([
    { status: 'fehler', fehler: { grund: 'format' } },
  ]);
  expect(mocks.sichern).not.toHaveBeenCalled();
});
it('akzeptiert die abweichende Schreibweise derselben Reparaturreferenz', async () => {
  mocks.pruefen.mockResolvedValue({
    ...gueltig,
    gesetz: { ...gesetz, kurztitel: 'testg', normgeber: 'de-bund' },
  });
  expect(await repariereGesetze([ziel])).toMatchObject([{ status: 'bereits_gueltig' }]);
});
