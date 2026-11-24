const auftragAbfragen = vi.fn().mockResolvedValue(null);
const praefixlaufStarten = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/plattform/praefixlaufAuftrag', () => ({ holePraefixlaufAuftrag: auftragAbfragen }));
vi.mock('@/lib/import/import.index', () => ({ startePraefixlauf: praefixlaufStarten }));
import { afterEach, expect, it, vi } from 'vitest';

const wiederherstellen = vi.fn().mockResolvedValue('nichts-zu-tun');
const backupBanner = vi.fn();
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  stelleEinstellungenAusBackupWiederHer: wiederherstellen,
}));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeEinstellungenBackupBannerEinmal: backupBanner,
  zeigeSchemaversionBannerEinmal,
}));
const render = vi.fn();
const initialisiereMarkierungen = vi.fn();
const bereiteMarkierungsStartPruefungVor = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  initialisiereMarkierungen,
  bereiteMarkierungsStartPruefungVor,
}));
const listen = vi.fn().mockResolvedValue(() => {});
const getCurrentWindow = vi.fn();
const holePlattform = vi.fn().mockResolvedValue(undefined);
const initialisiereFensterFarbschema = vi.fn().mockResolvedValue(() => {});
vi.mock('@/hooks/einstellungen/farbschemaAnwendung', () => ({ initialisiereFensterFarbschema }));
const istMobilePlattform = vi.fn().mockResolvedValue(false);
const zeigeSchemaversionBannerEinmal = vi.fn();

const createRoot = vi.fn(() => ({ render }));
vi.mock('react-dom/client', () => ({ default: { createRoot } }));
const ladeHilfsfensterWurzel = vi.fn().mockResolvedValue(null);
const AppWurzel = () => null;
const MobileWurzel = () => null;
const FensterStartFehler = () => null;
vi.mock('@/components/hilfsfenster/hilfsfenster.index', () => ({
  ladeHilfsfensterWurzel,
  FensterStartFehler,
}));
vi.mock('@/mobile/MobileApp', () => ({ default: MobileWurzel }));
vi.mock('@/App', () => ({ default: AppWurzel }));
vi.mock('@/index.css', () => ({}));
vi.mock('@/lib/plattform/tauriHelpers', () => ({ holePlattform, istMobilePlattform }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow }));
vi.mock('@tauri-apps/api/event', () => ({ listen, emitTo: vi.fn() }));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  SCHEMAVERSION_EREIGNIS: 'schemaversion-abweichend',
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

it.each(['main', 'fenster-1'])('meldet den Listener nur in main an (%s)', async (label) => {
  vi.stubGlobal('document', { getElementById: () => ({}) });
  getCurrentWindow.mockReturnValue({ label });
  await import('./main');
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  if (label === 'main') {
    expect(listen).toHaveBeenCalledWith('schemaversion-abweichend', zeigeSchemaversionBannerEinmal);
    expect(listen.mock.invocationCallOrder[0]!).toBeLessThan(render.mock.invocationCallOrder[0]!);
  } else expect(listen).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it.each(['main', 'verweismarkierung-1', 'kommentar-1', 'markierungskonflikte', 'einstellungen'])(
  'initialisiert Markierungen vor Plattformarbeit und Rendern in %s',
  async (label) => {
    vi.stubGlobal('document', { getElementById: () => ({}) });
    getCurrentWindow.mockReturnValue({ label });
    await import('./main');
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(initialisiereMarkierungen).toHaveBeenCalledTimes(1);
    expect(initialisiereFensterFarbschema).toHaveBeenCalledTimes(1);
    expect(initialisiereFensterFarbschema.mock.invocationCallOrder[0]!).toBeLessThan(
      render.mock.invocationCallOrder[0]!,
    );
    expect(initialisiereMarkierungen.mock.invocationCallOrder[0]!).toBeLessThan(
      holePlattform.mock.invocationCallOrder[0]!,
    );
    expect(initialisiereMarkierungen.mock.invocationCallOrder[0]!).toBeLessThan(
      render.mock.invocationCallOrder[0]!,
    );
    vi.unstubAllGlobals();
  },
);

it('wartet vor Plattformarbeit und Rendern auf die Startvorbereitung', async () => {
  vi.stubGlobal('document', { getElementById: () => ({}) });
  getCurrentWindow.mockReturnValue({ label: 'main' });
  let weiter!: () => void;
  bereiteMarkierungsStartPruefungVor.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        weiter = resolve;
      }),
  );
  await import('./main');
  await vi.waitFor(() => expect(bereiteMarkierungsStartPruefungVor).toHaveBeenCalledTimes(1));
  expect(holePlattform).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
  weiter();
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  vi.unstubAllGlobals();
});
it('wartet mit dem ersten Render auf die native Farbschema-Anwendung', async () => {
  vi.stubGlobal('document', { getElementById: () => ({}) });
  getCurrentWindow.mockReturnValue({ label: 'kommentar-1' });
  let weiter!: () => void;
  initialisiereFensterFarbschema.mockImplementationOnce(
    () =>
      new Promise<() => void>((resolve) => {
        weiter = () => resolve(() => {});
      }),
  );
  await import('./main');
  await vi.waitFor(() => expect(initialisiereFensterFarbschema).toHaveBeenCalledTimes(1));
  expect(render).not.toHaveBeenCalled();
  expect(ladeHilfsfensterWurzel).not.toHaveBeenCalled();
  weiter();
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  vi.unstubAllGlobals();
});

it('rendert trotz fehlgeschlagener Startvorbereitung', async () => {
  vi.stubGlobal('document', { getElementById: () => ({}) });
  getCurrentWindow.mockReturnValue({ label: 'main' });
  bereiteMarkierungsStartPruefungVor.mockRejectedValueOnce(new Error('Lesen verweigert'));
  await import('./main');
  await vi.waitFor(() => expect(bereiteMarkierungsStartPruefungVor).toHaveBeenCalledTimes(1));
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  vi.unstubAllGlobals();
});

function gerenderteWurzel() {
  return render.mock.calls[0]![0].props.children.type;
}

it.each(['verweismarkierung-1', 'kommentar-1', 'markierungskonflikte', 'einstellungen'])(
  'übergibt %s und rendert die geladene Wurzel nach Plattforminitialisierung',
  async (label) => {
    const Wurzel = () => null;
    ladeHilfsfensterWurzel.mockResolvedValueOnce(Wurzel);
    vi.stubGlobal('document', { getElementById: () => ({}) });
    getCurrentWindow.mockReturnValue({ label });
    await import('./main');
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(ladeHilfsfensterWurzel).toHaveBeenCalledWith(label);
    expect(holePlattform.mock.invocationCallOrder[0]!).toBeLessThan(
      ladeHilfsfensterWurzel.mock.invocationCallOrder[0]!,
    );
    expect(gerenderteWurzel()).toBe(Wurzel);
    expect(istMobilePlattform).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  },
);

it.each([false, true])('nutzt bei null die Haupt-/Mobile-Weiche (mobil: %s)', async (mobil) => {
  istMobilePlattform.mockResolvedValueOnce(mobil);
  vi.stubGlobal('document', { getElementById: () => ({}) });
  getCurrentWindow.mockReturnValue({ label: 'main' });
  await import('./main');
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  expect(ladeHilfsfensterWurzel).toHaveBeenCalledWith('main');
  expect(gerenderteWurzel()).toBe(mobil ? MobileWurzel : AppWurzel);
  vi.unstubAllGlobals();
});

// Der bisherige Ersatzwurzeltest wird bewusst durch den beschlossenen
// Ladefehlervertrag ersetzt: bekannte Hilfsfenster bleiben Hilfsfenster.
it.each(['verweismarkierung-1', 'kommentar-1', 'markierungskonflikte', 'einstellungen'])(
  'behält %s bei Fehlern und startet nur dessen Wurzel nach erfolgreicher Wiederholung',
  async (label) => {
    const kontextAbholen = vi.fn();
    const Wurzel = () => {
      kontextAbholen();
      return null;
    };
    ladeHilfsfensterWurzel
      .mockRejectedValueOnce(new Error('Laden fehlgeschlagen'))
      .mockRejectedValueOnce(new Error('Weiterhin fehlgeschlagen'));
    vi.stubGlobal('document', { getElementById: () => ({}) });
    getCurrentWindow.mockReturnValue({ label });
    await import('./main');
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(gerenderteWurzel()).toBe(FensterStartFehler);
    expect(kontextAbholen).not.toHaveBeenCalled();
    const wiederholen = render.mock.calls[0]![0].props.children.props.erneutVersuchen;
    await wiederholen();
    expect(render.mock.calls[1]![0].props.children.type).toBe(FensterStartFehler);
    let weiter!: (wurzel: typeof Wurzel) => void;
    ladeHilfsfensterWurzel.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          weiter = resolve;
        }),
    );
    const versuch = wiederholen();
    await wiederholen();
    expect(ladeHilfsfensterWurzel).toHaveBeenCalledTimes(3);
    expect(kontextAbholen).not.toHaveBeenCalled();
    weiter(Wurzel);
    await versuch;
    expect(render.mock.calls[2]![0].props.children.type).toBe(Wurzel);
    await wiederholen();
    expect(ladeHilfsfensterWurzel.mock.calls.map(([ziel]) => ziel)).toEqual([label, label, label]);
    expect(createRoot).toHaveBeenCalledTimes(1);
    expect(initialisiereMarkierungen).toHaveBeenCalledTimes(1);
    expect(bereiteMarkierungsStartPruefungVor).toHaveBeenCalledTimes(1);
    expect(holePlattform).toHaveBeenCalledTimes(1);
    expect(istMobilePlattform).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  },
);

it('lädt bei identischem zwischengespeicherten Importfehler nur das eigene WebView neu', async () => {
  const fehler = new Error('Modul-Auswertung fehlgeschlagen');
  ladeHilfsfensterWurzel.mockRejectedValueOnce(fehler).mockRejectedValueOnce(fehler);
  const reload = vi.fn();
  vi.stubGlobal('window', { location: { reload } });
  vi.stubGlobal('document', { getElementById: () => ({}) });
  getCurrentWindow.mockReturnValue({ label: 'kommentar-1' });
  await import('./main');
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  await render.mock.calls[0]![0].props.children.props.erneutVersuchen();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(createRoot).toHaveBeenCalledTimes(1);
  expect(bereiteMarkierungsStartPruefungVor).toHaveBeenCalledTimes(1);
  expect(istMobilePlattform).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it.each([false, true])('nutzt im Browser die normale Weiche (mobil: %s)', async (mobil) => {
  getCurrentWindow.mockImplementation(() => {
    throw new Error('Kein Tauri');
  });
  istMobilePlattform.mockResolvedValueOnce(mobil);
  vi.stubGlobal('document', { getElementById: () => ({}) });
  await import('./main');
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  expect(ladeHilfsfensterWurzel).not.toHaveBeenCalled();
  expect(gerenderteWurzel()).toBe(mobil ? MobileWurzel : AppWurzel);
  vi.unstubAllGlobals();
});

it('wartet nach Plattform und Label vor Farbschema und Render auf die Wiederherstellung', async () => {
  vi.stubGlobal('document', { getElementById: () => ({}) });
  getCurrentWindow.mockReturnValue({ label: 'main' });
  holePlattform.mockResolvedValueOnce('linux');
  let weiter!: (ergebnis: string) => void;
  wiederherstellen.mockImplementationOnce(
    () =>
      new Promise<string>((resolve) => {
        weiter = resolve;
      }),
  );
  await import('./main');
  await vi.waitFor(() => expect(wiederherstellen).toHaveBeenCalledTimes(1));
  expect(holePlattform.mock.invocationCallOrder[0]!).toBeLessThan(
    wiederherstellen.mock.invocationCallOrder[0]!,
  );
  expect(getCurrentWindow.mock.invocationCallOrder[0]!).toBeLessThan(
    wiederherstellen.mock.invocationCallOrder[0]!,
  );
  expect(initialisiereFensterFarbschema).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
  weiter('wiederhergestellt');
  await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
  expect(backupBanner).toHaveBeenCalledTimes(1);
  expect(initialisiereFensterFarbschema.mock.invocationCallOrder[0]!).toBeLessThan(
    render.mock.invocationCallOrder[0]!,
  );
  vi.unstubAllGlobals();
});
it.each(['einstellungen', 'kommentar-1', 'fenster-1', 'main'])(
  'stellt auf Mobile oder in Hilfsfenstern nicht wieder her (%s)',
  async (label) => {
    vi.stubGlobal('document', { getElementById: () => ({}) });
    getCurrentWindow.mockReturnValue({ label });
    holePlattform.mockResolvedValueOnce(label === 'main' ? 'android' : 'linux');
    await import('./main');
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(wiederherstellen).not.toHaveBeenCalled();
    expect(backupBanner).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  },
);
it.each(['nichts-zu-tun', 'fehler'])(
  'zeigt ohne Wiederherstellung keinen Banner und startet weiter (%s)',
  async (ergebnis) => {
    vi.stubGlobal('document', { getElementById: () => ({}) });
    getCurrentWindow.mockReturnValue({ label: 'main' });
    holePlattform.mockResolvedValueOnce('linux');
    wiederherstellen.mockResolvedValueOnce(ergebnis);
    await import('./main');
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(backupBanner).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  },
);

it('startet beim Entwicklerauftrag ausschließlich den Prüflauf', async () => {
  const auftrag = { normgeber: 'de-bund', anzahl: 2 };
  auftragAbfragen.mockResolvedValueOnce(auftrag);
  await import('./main');
  await vi.waitFor(() => expect(praefixlaufStarten).toHaveBeenCalledWith(auftrag));
  expect(initialisiereMarkierungen).not.toHaveBeenCalled();
  expect(bereiteMarkierungsStartPruefungVor).not.toHaveBeenCalled();
  expect(wiederherstellen).not.toHaveBeenCalled();
  expect(initialisiereFensterFarbschema).not.toHaveBeenCalled();
  expect(createRoot).not.toHaveBeenCalled();
});
