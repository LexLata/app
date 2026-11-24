// Charakterisiert die Reservierung über den echten Hook und den öffentlichen Speicherzugang.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { expect, it, vi } from 'vitest';
import {
  parseTastenkuerzel,
  tastenkuerzelKatalog,
} from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { useTastenkuerzel } from './useTastenkuerzel';
import { speichereGesetzeskurzbefehl } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
vi.mock('react', () => ({
  useEffectEvent: (handler: unknown) => handler,
  useEffect: (effekt: () => unknown) => effekt(),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('@/lib/plattform/tauriHelpers', () => ({
  holePlattform: async () => 'macos',
  plattformFallsBekannt: vi.fn(() => 'linux'),
  einstellungenFensterOeffnen: vi.fn(),
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => unknown) => aktion('test'),
  appDatenLesenGeschuetzt: async () => null,
  sicherstelleOrdner: async () => undefined,
  nutzerdatenSchreiben: async () => undefined,
  EINSTELLUNGEN_ORDNER: 'einstellungen',
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: async () => undefined }));

it.each([false, true])(
  'reserviert die vollständige Belegung auch bei ausgeschalteten Seitenleisten-Kürzeln (%s)',
  async (seitenleistenTastenkuerzel) => {
    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    useTastenkuerzel({
      seitenleistenTastenkuerzel,
      tabsRef: { current: [] },
      aktiverTabIdRef: { current: null },
    } as unknown as Parameters<typeof useTastenkuerzel>[0]);
    const primaer = [
      'f',
      'Shift+f',
      'o',
      'Shift+o',
      ',',
      'i',
      'Shift+i',
      'u',
      'w',
      'Shift+w',
      'e',
      'd',
      'Shift+d',
      'Shift+Alt+d',
      'Shift+u',
      'r',
      'y',
      'Shift+k',
      ...'123456789',
      'n',
      't',
      'Shift+t',
      'z',
      'Shift+z',
      'x',
      'c',
      'v',
      'a',
      'm',
      'q',
      'h',
      'k',
      'arrowleft',
      'arrowright',
      'arrowup',
      'arrowdown',
    ];
    const reserviert = [
      ...primaer.flatMap((taste) => [`Meta+${taste}`, `Ctrl+${taste}`]),
      'Ctrl+tab',
      'Ctrl+Shift+tab',
      'Alt+arrowleft',
      'Alt+arrowright',
      'Alt+arrowup',
      'Alt+arrowdown',
      'Shift+arrowleft',
      'Shift+arrowright',
      ...[...'abcdefghijklmnopqrstuvwxyz'].flatMap((taste) => [`Shift+${taste}`, `Alt+${taste}`]),
      ...[...'0123456789'].flatMap((taste) => [`Alt+${taste}`, `Alt+Shift+${taste}`]),
    ];
    const frei = [
      ...['b', 'Shift+b', 's', 'Shift+s', 'Shift+Alt+s', 'g', '.', 'Shift+n', 'Shift+h'].flatMap(
        (taste) => [`Meta+${taste}`, `Ctrl+${taste}`],
      ),
      'Meta+tab',
    ];
    for (const [kombinationen, ergebnis] of [
      [reserviert, 'reserviert'],
      [frei, 'ok'],
    ] as const) {
      for (const kombination of kombinationen) {
        const teile = kombination.split('+');
        const taste = teile.at(-1)!;
        const alt = teile.includes('Alt');
        const code = /^[a-z]$/.test(taste)
          ? `Key${taste.toUpperCase()}`
          : /^\d$/.test(taste)
            ? `Digit${taste}`
            : undefined;
        expect(
          await speichereGesetzeskurzbefehl(
            gesetzesreferenz({ kurztitel: 'BGB' }),
            {
              taste,
              meta: teile.includes('Meta'),
              ctrl: teile.includes('Ctrl'),
              shift: teile.includes('Shift'),
              alt,
            },
            alt ? code : undefined,
          ),
          kombination,
        ).toBe(ergebnis);
      }
    }
  },
);

const aktionsFaelle = [
  ['f', false, 'volltextSuche'],
  ['f', true, 'volltextAlle'],
  ['o', true, 'uebersicht'],
  [',', false, 'einstellungen'],
  ['i', true, 'handleDateiImportAnfrage'],
  ['r', false, 'aktualisieren'],
  ['i', false, 'gesetzInfo'],
  ['y', false, 'verlauf'],
  ['t', false, 'erstelleLeerenTab'],
  ['t', true, 'tabWiederherstellen'],
  ['w', false, 'tabOderFensterSchliessen'],
  ['w', true, 'fensterSchliessen'],
  ['e', false, 'handleExportOeffnen'],
  ['d', false, 'handleLesezeichenSpeichern'],
  ['d', true, 'handleFavoritSpeichern'],
  ['u', false, 'handleUnterstreichen'],
  ['u', true, 'handleHervorheben'],
  ['k', false, 'handleVerweismarkierungAnfrage'],
  ['k', true, 'handleKommentarAnfrage'],
  ['z', false, 'handleMarkierungRueckgaengig'],
  ['z', true, 'handleMarkierungWiederholen'],
  ['d', true, 'handleAlleLesezeichenEntfernen'],
  ['o', false, 'oeffnen'],
] as const;

it.each(
  aktionsFaelle.flatMap((fall) =>
    ['metaKey', 'ctrlKey'].map((primaer) => [...fall, primaer] as const),
  ),
)('charakterisiert %s (Umschalt %s): %s mit %s', async (key, shiftKey, ziel, primaer) => {
  const { einstellungenFensterOeffnen } = await import('@/lib/plattform/tauriHelpers');
  vi.clearAllMocks();
  let listener: (e: KeyboardEvent) => void = () => undefined;
  vi.stubGlobal('window', {
    addEventListener: (_name: string, h: typeof listener) => {
      listener = h;
    },
    removeEventListener: vi.fn(),
  });
  const aktion = vi.fn();
  let overlay: unknown = null;
  const setOeffnenOverlayInitial = vi.fn();
  useTastenkuerzel({
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: 'tab' },
    gesetzeskurzbefehle: {},
    gesetze: [],
    lesezeichenEintraege: [],
    setOeffnenOverlayInitial,
    setAktivesOverlay: (wert: unknown) => {
      overlay = typeof wert === 'function' ? wert(overlay) : wert;
    },
    [ziel]: aktion,
  } as unknown as Parameters<typeof useTastenkuerzel>[0]);
  const event = {
    key: ziel === 'handleAlleLesezeichenEntfernen' ? 'ß' : key,
    code: `Key${key.toUpperCase()}`,
    metaKey: false,
    ctrlKey: false,
    shiftKey,
    altKey: ziel === 'handleAlleLesezeichenEntfernen',
    [primaer]: true,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
  listener(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  if (ziel === 'einstellungen') expect(einstellungenFensterOeffnen).toHaveBeenCalledOnce();
  else if (
    ziel.startsWith('handle') ||
    [
      'erstelleLeerenTab',
      'tabWiederherstellen',
      'tabOderFensterSchliessen',
      'fensterSchliessen',
    ].includes(ziel)
  ) {
    expect(aktion).toHaveBeenCalledOnce();
  } else {
    expect(overlay).toBe(ziel);
    listener(event);
    expect(overlay).toBeNull();
  }
  if (ziel === 'oeffnen') expect(setOeffnenOverlayInitial).toHaveBeenCalledWith('');
});

it.each(['f', 'i', 'y'])('behält für %s die Bedingung eines aktiven Tabs bei', (key) => {
  let listener: (e: KeyboardEvent) => void = () => undefined;
  vi.stubGlobal('window', {
    addEventListener: (_name: string, h: typeof listener) => {
      listener = h;
    },
    removeEventListener: vi.fn(),
  });
  const setAktivesOverlay = vi.fn();
  useTastenkuerzel({
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: null },
    setAktivesOverlay,
  } as unknown as Parameters<typeof useTastenkuerzel>[0]);
  const event = {
    key,
    metaKey: true,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
  listener(event);
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(setAktivesOverlay).not.toHaveBeenCalled();
});

it.each(tastenkuerzelKatalog.filter((e) => e.behandlung === 'J'))(
  '$id akzeptiert keine zusätzlichen Modifikatoren',
  (eintrag) => {
    let listener: (e: KeyboardEvent) => void = () => undefined;
    vi.stubGlobal('window', {
      addEventListener: (_name: string, h: typeof listener) => {
        listener = h;
      },
      removeEventListener: vi.fn(),
    });
    useTastenkuerzel({
      tabsRef: { current: [] },
      aktiverTabIdRef: { current: 'tab' },
      gesetzeskurzbefehle: {},
      gesetze: [],
      lesezeichenEintraege: [],
    } as unknown as Parameters<typeof useTastenkuerzel>[0]);
    const taste = parseTastenkuerzel(eintrag.accelerator);
    const event = {
      key: taste.taste,
      code: `Key${taste.taste.toUpperCase()}`,
      metaKey: true,
      ctrlKey: true,
      shiftKey: taste.shift,
      altKey: taste.alt,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    listener(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    // Favorit + Alt ist selbst das reguläre Kürzel zum Entfernen aller Lesezeichen.
    if (!taste.alt && eintrag.id !== 'favorit-speichern') {
      listener({ ...event, ctrlKey: false, altKey: true });
      expect(event.preventDefault).not.toHaveBeenCalled();
    }
  },
);

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
it.each(['windows', 'linux', 'macos', null])(
  'öffnet neue Fenster nur bei bekannter Nicht-Mac-Plattform %s',
  async (plattform) => {
    const { plattformFallsBekannt } = await import('@/lib/plattform/tauriHelpers');
    const { invoke } = await import('@tauri-apps/api/core');
    vi.clearAllMocks();
    vi.mocked(plattformFallsBekannt).mockReturnValue(
      plattform as ReturnType<typeof plattformFallsBekannt>,
    );
    let listener: (e: KeyboardEvent) => void = () => undefined;
    vi.stubGlobal('window', {
      addEventListener: (_: string, h: typeof listener) => {
        listener = h;
      },
      removeEventListener: vi.fn(),
    });
    useTastenkuerzel({
      tabsRef: { current: [] },
      aktiverTabIdRef: { current: null },
      gesetzeskurzbefehle: {},
      gesetze: [],
      lesezeichenEintraege: [],
    } as unknown as Parameters<typeof useTastenkuerzel>[0]);
    const e = {
      key: 'n',
      ctrlKey: plattform !== 'macos',
      metaKey: plattform === 'macos',
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    listener(e);
    const erwartet = plattform === 'windows' || plattform === 'linux';
    expect(e.preventDefault).toHaveBeenCalledTimes(erwartet ? 1 : 0);
    if (erwartet) expect(invoke).toHaveBeenCalledWith('neues_fenster_anfordern');
    else expect(invoke).not.toHaveBeenCalled();
  },
);

it.each(['b', 'Shift+b', 's', 'Shift+s', 'Shift+Alt+s', 'g', '.', 'Shift+n', 'Shift+h'])(
  'fängt das freigewordene Kürzel %s nicht mehr ab',
  (kombination) => {
    let listener: (e: KeyboardEvent) => void = () => undefined;
    vi.stubGlobal('window', {
      addEventListener: (_: string, h: typeof listener) => {
        listener = h;
      },
      removeEventListener: vi.fn(),
    });
    useTastenkuerzel({
      tabsRef: { current: [] },
      aktiverTabIdRef: { current: null },
      gesetzeskurzbefehle: {},
      gesetze: [],
      lesezeichenEintraege: [],
    } as unknown as Parameters<typeof useTastenkuerzel>[0]);
    const key = kombination.split('+').at(-1)!;
    const e = {
      key,
      code: `Key${key.toUpperCase()}`,
      metaKey: true,
      ctrlKey: false,
      shiftKey: kombination.includes('Shift'),
      altKey: kombination.includes('Alt'),
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent;
    listener(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
  },
);
