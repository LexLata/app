// tauriHelpers.test.ts
//
// Die meisten Funktionen hier laden Tauri-Module dynamisch und fangen Fehler ab
// (siehe Kopfkommentare in tauriHelpers.ts: "liefert X außerhalb von
// Tauri/im Browser-Dev-Modus, statt einen Fehler zu werfen"). Getestet wird
// daher jeweils: (a) der Erfolgspfad mit gemockten Tauri-Modulen, (b) dass
// ein Fehler in der Tauri-IPC (z.B. invoke() lehnt ab) NICHT nach außen
// dringt, sondern den dokumentierten Fallback-Wert liefert.
//
// holePlattform() ist eine weitere Ausnahme: sein Ergebnis wird modulweit in einer
// Closure-Variable gecacht (siehe Kommentar dort, "die Plattform ändert
// sich zur Laufzeit nie"). Um dieses Caching pro Test isoliert zu prüfen,
// wird für diesen Teil vi.resetModules() + ein frischer dynamischer Import
// von tauriHelpers verwendet, statt des statischen Top-Level-Imports, den
// die übrigen (zustandslosen) Funktionen unten nutzen.
import { tabUebertragungAbholen } from './fensterUebergabe';
import {
  verweismarkierungKontextAbholen,
  kommentarKontextAbholen,
} from '@/lib/markierungen/markierungen.index';

import { describe, it, expect, expectTypeOf, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import vertraege from '@/test/plattform/native-vertraege.json';

const invoke = vi.fn();
const getCurrentWindow = vi.fn();
const platform = vi.fn();

// Steuerbarer Importfehler für holePlattform: nur ein IPC-Fehler würde den
// hier zu prüfenden Modulimport nicht abbilden. vi.hoisted hält das Flag bereits
// zur Zeit der Mock-Factories bereit.
const modulFehlerFlags = vi.hoisted(() => ({ pluginOs: false }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: (...args: unknown[]) => getCurrentWindow(...args),
}));
vi.mock('@tauri-apps/plugin-os', () => {
  if (modulFehlerFlags.pluginOs) throw new Error('Modul nicht verfügbar');
  return { platform: (...args: unknown[]) => platform(...args) };
});

import type { FensterPosition } from './tauriHelpers';
import {
  einstellungenFensterOeffnen,
  letzterTabAnfrageLesen,
  menuItemAktivieren,
  alleFensterPositionenLesen,
  fensterVordergrundHolen,
} from './tauriHelpers';

beforeEach(() => {
  invoke.mockReset();
  getCurrentWindow.mockReset();
  platform.mockReset();
});

describe('einstellungenFensterOeffnen', () => {
  it('ruft invoke mit dem Rust-Befehlsnamen auf', async () => {
    invoke.mockResolvedValue(undefined);
    await einstellungenFensterOeffnen();
    expect(invoke).toHaveBeenCalledWith('einstellungen_fenster_oeffnen');
  });

  it('wirft NICHT, wenn invoke ablehnt (außerhalb von Tauri)', async () => {
    invoke.mockRejectedValue(new Error('nicht in Tauri'));
    await expect(einstellungenFensterOeffnen()).resolves.toBeUndefined();
  });
});

describe('letzterTabAnfrageLesen', () => {
  it('gibt das von invoke gelieferte boolean durch', async () => {
    invoke.mockResolvedValue(true);
    await expect(letzterTabAnfrageLesen()).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith('letzter_tab_anfrage_lesen');
  });

  it('liefert false, wenn invoke ablehnt', async () => {
    invoke.mockRejectedValue(new Error('nicht in Tauri'));
    await expect(letzterTabAnfrageLesen()).resolves.toBe(false);
  });
});

describe('menuItemAktivieren', () => {
  it('ruft invoke mit id und aktiv auf', async () => {
    invoke.mockResolvedValue(undefined);
    await menuItemAktivieren('gesetze-aktualisieren', false);
    expect(invoke).toHaveBeenCalledWith('menu_item_aktivieren', {
      id: 'gesetze-aktualisieren',
      aktiv: false,
    });
  });

  it('wirft NICHT, wenn invoke ablehnt (z.B. Windows/Linux ohne native Menüleiste)', async () => {
    invoke.mockRejectedValue(new Error('kein natives Menü'));
    await expect(menuItemAktivieren('x', true)).resolves.toBeUndefined();
  });
});

describe('alleFensterPositionenLesen', () => {
  it('gibt die von invoke gelieferte Liste durch', async () => {
    const positionen = [{ label: 'main', x: 0, y: 0, breite: 800, hoehe: 600 }];
    invoke.mockResolvedValue(positionen);
    await expect(alleFensterPositionenLesen()).resolves.toEqual(positionen);
  });

  it('liefert ein leeres Array, wenn invoke ablehnt', async () => {
    invoke.mockRejectedValue(new Error('nicht in Tauri'));
    await expect(alleFensterPositionenLesen()).resolves.toEqual([]);
  });
});

describe('fensterVordergrundHolen', () => {
  it('ruft invoke mit dem übergebenen label auf', async () => {
    invoke.mockResolvedValue(undefined);
    await fensterVordergrundHolen('fenster-2');
    expect(invoke).toHaveBeenCalledWith('fenster_vordergrund_holen', { label: 'fenster-2' });
  });

  it('wirft NICHT, wenn invoke ablehnt', async () => {
    invoke.mockRejectedValue(new Error('nicht in Tauri'));
    await expect(fensterVordergrundHolen('x')).resolves.toBeUndefined();
  });
});

// tabUebertragungAbholen / verweismarkierungKontextAbholen / kommentarKontextAbholen
// sind strukturell identisch (getCurrentWindow().label -> invoke -> JSON.parse
// bei Nicht-null) – ein Tabelle-Test deckt alle drei mit demselben Verhalten ab.
describe.each([
  ['tabUebertragungAbholen', tabUebertragungAbholen, 'tab_uebertragung_abholen'] as const,
  [
    'verweismarkierungKontextAbholen',
    verweismarkierungKontextAbholen,
    'verweismarkierung_kontext_abholen',
  ] as const,
  ['kommentarKontextAbholen', kommentarKontextAbholen, 'kommentar_kontext_abholen'] as const,
])('%s', (_name, fn, befehlsName) => {
  beforeEach(() => {
    getCurrentWindow.mockReturnValue({ label: 'fenster-1' });
  });

  it('parst und gibt das per invoke gelieferte JSON zurück', async () => {
    const daten =
      befehlsName === 'tab_uebertragung_abholen'
        ? {}
        : {
            openerLabel: 'main',
            gesetz: { normgeber: 'de-bund', kurztitel: 'BGB' },
            ausgangsstelle: { typ: 'erwaegungsgrund', bezeichnung: 'E1' },
          };
    invoke.mockResolvedValue(JSON.stringify(daten));
    await expect(fn()).resolves.toEqual(daten);
    expect(invoke).toHaveBeenCalledWith(befehlsName, { label: 'fenster-1' });
  });

  it('liefert null, wenn invoke null liefert (keine hinterlegte Übertragung)', async () => {
    invoke.mockResolvedValue(null);
    await expect(fn()).resolves.toBeNull();
  });

  it('liefert null bei ungültigem JSON (Parse-Fehler wird abgefangen)', async () => {
    invoke.mockResolvedValue('{ungültiges json');
    await expect(fn()).resolves.toBeNull();
  });

  it('liefert null, wenn invoke ablehnt', async () => {
    invoke.mockRejectedValue(new Error('nicht in Tauri'));
    await expect(fn()).resolves.toBeNull();
  });

  it('liefert null, wenn getCurrentWindow wirft', async () => {
    getCurrentWindow.mockImplementation(() => {
      throw new Error('kein Fenster-Kontext');
    });
    await expect(fn()).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// holePlattform / plattformFallsBekannt / istMobilePlattform – Caching
// ---------------------------------------------------------------------------
// Eigener Block mit frischem Modul-Import pro Test (vi.resetModules()), da
// der Cache in einer modulweiten Variable liegt und sonst zwischen Tests
// durchsickern würde.

describe('holePlattform / plattformFallsBekannt / istMobilePlattform', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('plattformFallsBekannt() ist null, solange holePlattform() noch nie aufgerufen wurde', async () => {
    const { plattformFallsBekannt } = await import('./tauriHelpers');
    expect(plattformFallsBekannt()).toBeNull();
  });

  it.each(['macos', 'windows', 'linux', 'ios', 'android'] as const)(
    'erkennt bekannte Plattform %p korrekt',
    async (p) => {
      platform.mockReturnValue(p);
      const { holePlattform } = await import('./tauriHelpers');
      await expect(holePlattform()).resolves.toBe(p);
    },
  );

  it('mappt eine unbekannte Plattform-Kennung auf "unbekannt"', async () => {
    platform.mockReturnValue('freebsd');
    const { holePlattform } = await import('./tauriHelpers');
    await expect(holePlattform()).resolves.toBe('unbekannt');
  });

  it('liefert "unbekannt", wenn das plugin-os-Modul nicht geladen werden kann (Browser-Dev-Modus)', async () => {
    modulFehlerFlags.pluginOs = true;
    try {
      const { holePlattform } = await import('./tauriHelpers');
      await expect(holePlattform()).resolves.toBe('unbekannt');
    } finally {
      modulFehlerFlags.pluginOs = false;
    }
  });

  it('cached das Ergebnis: platform() wird bei mehrfachem Aufruf nur einmal ausgeführt', async () => {
    platform.mockReturnValue('linux');
    const { holePlattform } = await import('./tauriHelpers');

    await holePlattform();
    await holePlattform();
    await holePlattform();

    expect(platform).toHaveBeenCalledTimes(1);
  });

  it('plattformFallsBekannt() spiegelt den Wert erst NACH Auflösung von holePlattform()', async () => {
    platform.mockReturnValue('macos');
    const { holePlattform, plattformFallsBekannt } = await import('./tauriHelpers');

    const pending = holePlattform();
    // Synchron direkt nach dem Aufruf, aber vor dem await, ist der
    // Sync-Spiegel noch nicht befüllt (Promise löst erst als Microtask auf).
    expect(plattformFallsBekannt()).toBeNull();
    await pending;
    expect(plattformFallsBekannt()).toBe('macos');
  });

  it.each([
    ['ios', true],
    ['android', true],
    ['macos', false],
    ['windows', false],
    ['linux', false],
  ] as const)('istMobilePlattform() === %p für Plattform %p', async (p, erwartet) => {
    platform.mockReturnValue(p);
    const { istMobilePlattform } = await import('./tauriHelpers');
    await expect(istMobilePlattform()).resolves.toBe(erwartet);
  });
});

describe('holePlattform – Property: beliebiger platform()-Rückgabewert wird entweder unverändert übernommen (falls bekannt) oder auf "unbekannt" gemappt', () => {
  it('hält für beliebige Strings', async () => {
    const BEKANNTE_PLATTFORMEN = new Set(['macos', 'windows', 'linux', 'ios', 'android']);

    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 20 }), async (rohwert) => {
        vi.resetModules();
        platform.mockReset();
        platform.mockReturnValue(rohwert);
        const { holePlattform } = await import('./tauriHelpers');

        const ergebnis = await holePlattform();

        expect(ergebnis).toBe(BEKANNTE_PLATTFORMEN.has(rohwert) ? rohwert : 'unbekannt');
      }),
      { numRuns: 20 },
    );
  });
});

it('empfängt den gemeinsam geprüften nativen Fensterpositionsvertrag', async () => {
  expectTypeOf(vertraege.fenster.position).toEqualTypeOf<FensterPosition>();
  expectTypeOf<{
    label: string;
    x: number;
    y: number;
    breite: number;
  }>().not.toMatchTypeOf<FensterPosition>();
  invoke.mockResolvedValueOnce([vertraege.fenster.position]);
  await expect(alleFensterPositionenLesen()).resolves.toEqual([vertraege.fenster.position]);
  expect(invoke).toHaveBeenCalledWith(vertraege.fenster.positionCommand);
});
