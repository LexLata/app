// Prüft gemeinsame Stapelwerte und getrennte Fenstersnapshots beim echten Menüaufbau.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import type { EventCallback } from '@tauri-apps/api/event';
const native = vi.hoisted(() => ({
  label: 'a',
  listen: vi.fn(),
  status: vi.fn(),
  item: vi.fn(async (optionen: { id?: string; text?: string }) => optionen),
  popup: vi.fn(),
  ipc: vi.fn(),
  kanaele: new Map<string, number>(),
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: native.listen }),
}));
let anfragen: Map<string, EventCallback<unknown>>;
const menuButton = { getBoundingClientRect: () => ({ left: 0, bottom: 10 }) } as HTMLElement;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('window', {
    crypto: globalThis.crypto,
    matchMedia: () => ({ matches: false }),
  });
  mockWindows('main');
  let rid = 0;
  native.kanaele.clear();
  mockIPC((cmd, argumente) => {
    native.ipc(cmd, argumente);
    const daten = argumente as { options: { id?: string }; rid: number; handler?: { id: number } };
    if (cmd === 'plugin:menu|new') {
      void native.item(daten.options);
      if (daten.options.id && daten.handler) native.kanaele.set(daten.options.id, daten.handler.id);
      return [++rid, daten.options.id ?? `menu-${rid}`];
    }
    if (cmd === 'plugin:menu|popup') native.popup();
    return null;
  });
  anfragen = new Map();
  native.label = 'a';
  native.listen.mockImplementation(async (_name, handler) => {
    const label = native.label;
    anfragen.set(label, handler);
    return () => anfragen.delete(label);
  });
  const daten = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => daten.get(key) ?? null,
    setItem: (key: string, wert: string) => daten.set(key, wert),
    removeItem: (key: string) => daten.delete(key),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function fenster(label: string, lokalAktiv: boolean) {
  native.label = label;
  const helfer = await import('@/lib/plattform/tauriHelpers');
  vi.spyOn(helfer, 'menuItemAktivieren').mockImplementation(native.status);
  const menu = await import('@/lib/plattform/menu/menu.index');
  const speicher = await import('@/lib/persistenz/fenster/fenster.index');
  const hamburger = await import('./hamburgerMenu');
  menu.meldeGesetzOffenStatus(lokalAktiv);
  menu.meldeTextAuswahlStatus(lokalAktiv);
  menu.setzeAktiv('markierung-rueckgaengig', lokalAktiv);
  menu.setzeAktiv('markierung-wiederholen', !lokalAktiv);
  speicher.geschlosseneTabsMenuStatusSynchronisieren();
  const abmelden = menu.registriereMenuZustandAnfrageListener(
    speicher.geschlosseneTabsMenuStatusSynchronisieren,
  );
  await vi.waitFor(() => expect(anfragen.has(label)).toBe(true));
  return { menu, speicher, hamburger, abmelden };
}
it.each(['fokus', 'hamburger'] as const)(
  'liest bei %s den gemeinsamen echten Stapel neu, ohne lokale Werte zu überschreiben',
  async (abgleich) => {
    const a = await fenster('a', true);
    vi.resetModules();
    const b = await fenster('b', false);
    expect(a.speicher).not.toBe(b.speicher);
    const pruefe = async (aktiv: boolean) => {
      native.status.mockClear();
      native.item.mockClear();
      if (abgleich === 'fokus') {
        anfragen.get('b')!({ event: 'menu-zustand-anfordern', payload: undefined, id: 1 });
        expect(native.status.mock.calls.filter(([id]) => id === 'letzter-tab')).toEqual([
          ['letzter-tab', aktiv],
        ]);
      } else {
        await b.hamburger.zeigeHamburgerMenu(menuButton);
        expect(native.item).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'letzter-tab', enabled: aktiv }),
        );
        expect(native.popup).toHaveBeenCalled();
      }
      const lokaleWerte = {
        'gesetz-info': false,
        unterstreichen: false,
        'markierung-rueckgaengig': false,
        'markierung-wiederholen': true,
      };
      for (const [id, enabled] of Object.entries(lokaleWerte)) {
        if (abgleich === 'fokus') {
          expect(native.status).toHaveBeenCalledWith(id, enabled);
        } else {
          expect(native.item).toHaveBeenCalledWith(expect.objectContaining({ id, enabled }));
        }
      }
      expect(b.menu.istAktiv('letzter-tab')).toBe(aktiv);
      for (const id of ['gesetz-info', 'unterstreichen', 'markierung-rueckgaengig']) {
        expect(a.menu.istAktiv(id)).toBe(true);
        expect(b.menu.istAktiv(id)).toBe(false);
      }
      expect(a.menu.istAktiv('markierung-wiederholen')).toBe(false);
      expect(b.menu.istAktiv('markierung-wiederholen')).toBe(true);
    };
    a.speicher.geschlossenenTabPushen({
      gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g' }),
      verlauf: { eintraege: [], position: 0 },
    });
    await pruefe(true);
    a.speicher.geschlossenenTabPoppen();
    await pruefe(false);
    a.abmelden();
    b.abmelden();
  },
);

it('schützt auch neue Normangaben im Hamburger-Menü ohne Änderung der Strukturtexte', async () => {
  const a = await fenster('a', true);
  const knoten = a.menu.HAMBURGER_MENU_STRUKTUR.find((eintrag) => !eintrag.trennstrich)!;
  if (knoten.trennstrich) throw new Error('Testmenüeintrag fehlt');
  const original = knoten.label;
  knoten.label = 'Art. 1 Abs. 1';
  try {
    await a.hamburger.zeigeHamburgerMenu(menuButton);
    expect(native.item).toHaveBeenCalledWith(
      expect.objectContaining({ id: knoten.id, text: 'Art.\u00a01 Abs.\u00a01' }),
    );
    expect(knoten.label).toBe('Art. 1 Abs. 1');
  } finally {
    knoten.label = original;
    a.abmelden();
  }
});

it('übergibt beim Ressourcenaufbau keine Texte und löst nur die originalen Befehle ohne Nutzdaten aus', async () => {
  const a = await fenster('a', true);
  try {
    await a.hamburger.zeigeHamburgerMenu(menuButton);
    const menueAufrufe = native.ipc.mock.calls.filter(
      ([cmd, args]) => cmd === 'plugin:menu|new' && args.kind === 'Menu',
    );
    expect(menueAufrufe).toHaveLength(1);
    const optionen = menueAufrufe[0]![1].options;
    expect(Object.keys(optionen)).toEqual(['items']);
    expect(optionen.items.length).toBeGreaterThan(0);
    expect(
      optionen.items.every((item: unknown) => Array.isArray(item) && typeof item[0] === 'number'),
    ).toBe(true);
    const befehlsKnoten: { id: string; befehl: string }[] = [];
    function sammle(knoten: typeof a.menu.HAMBURGER_MENU_STRUKTUR) {
      for (const eintrag of knoten) {
        if (eintrag.trennstrich) continue;
        if (eintrag.befehl) befehlsKnoten.push({ id: eintrag.id, befehl: eintrag.befehl });
        if (eintrag.kinder) sammle(eintrag.kinder);
      }
    }
    sammle(a.menu.HAMBURGER_MENU_STRUKTUR);
    expect(befehlsKnoten.map((k) => k.befehl).sort()).toEqual([
      'markierungskonflikte_fenster_oeffnen',
      'neues_fenster_anfordern',
    ]);
    for (const knoten of befehlsKnoten) {
      const kanal = native.kanaele.get(knoten.id)!;
      expect(kanal).toBeDefined();
      const intern = window as unknown as {
        __TAURI_INTERNALS__: { runCallback: (id: number, daten: unknown) => void };
      };
      intern.__TAURI_INTERNALS__.runCallback(kanal, { message: knoten.id, index: 0 });
      await vi.waitFor(() => expect(native.ipc).toHaveBeenCalledWith(knoten.befehl, {}));
    }
  } finally {
    a.abmelden();
  }
});

it.each(['datenschutz', 'ueber'])(
  'sendet beim Klick auf %s das Ereignis gezielt ohne Nutzdaten an das eigene Fenster',
  async (id) => {
    const a = await fenster('a', false);
    try {
      await a.hamburger.zeigeHamburgerMenu(menuButton);
      expect(native.item).toHaveBeenCalledWith(expect.objectContaining({ id, enabled: true }));
      const kanal = native.kanaele.get(id)!;
      expect(kanal).toBeDefined();
      const intern = window as unknown as {
        __TAURI_INTERNALS__: { runCallback: (id: number, daten: unknown) => void };
      };
      intern.__TAURI_INTERNALS__.runCallback(kanal, { message: id, index: 0 });
      await vi.waitFor(() =>
        expect(native.ipc).toHaveBeenCalledWith('plugin:event|emit_to', {
          target: { kind: 'AnyLabel', label: 'main' },
          event: `${id}-oeffnen`,
          payload: undefined,
        }),
      );
    } finally {
      a.abmelden();
    }
  },
);

it.each([
  [
    null,
    false,
    'Ausgewählte Norm als Favoriten speichern',
    'Ausgewählte Norm als Lesezeichen speichern',
  ],
  ['§ 4', false, '§ 4 als Favoriten speichern', '§ 4 als Lesezeichen speichern'],
  ['§ 4', true, '§ 4 aus Favoriten entfernen', '§ 4 aus Lesezeichen entfernen'],
  [
    'Art. 229 § 3',
    true,
    'Art. 229 § 3 aus Favoriten entfernen',
    'Art. 229 § 3 aus Lesezeichen entfernen',
  ],
  ['A & B_C', false, 'A && B_C als Favoriten speichern', 'A && B_C als Lesezeichen speichern'],
])(
  'baut Normaktionen aus dem lokalen Status %s und maskiert nur Zugriffstastenzeichen',
  async (bezeichnung, gespeichert, favorit, lesezeichen) => {
    const a = await fenster('a', true);
    if (bezeichnung)
      a.menu.meldeNormstatus({
        bezeichnung,
        ist_favorit: gespeichert,
        ist_lesezeichen: gespeichert,
      });
    await a.hamburger.zeigeHamburgerMenu(menuButton);
    for (const [id, text] of [
      ['favorit-speichern', favorit],
      ['lesezeichen-speichern', lesezeichen],
    ]) {
      const eintrag = native.item.mock.calls.map(([wert]) => wert).find((wert) => wert.id === id);
      expect(eintrag?.text?.replaceAll('\u00a0', ' ')).toBe(text);
    }
    a.abmelden();
  },
);

it('sendet bei „Nach Updates suchen…“ die Anfrage gezielt an das eigene Fenster', async () => {
  const a = await fenster('a', false);
  try {
    await a.hamburger.zeigeHamburgerMenu(menuButton);
    expect(native.item).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'nach-updates-suchen',
        text: 'Nach Updates suchen…',
        enabled: true,
      }),
    );
    const kanal = native.kanaele.get('nach-updates-suchen');
    if (kanal === undefined) throw new Error('Menükanal fehlt');
    const intern: unknown = Reflect.get(window, '__TAURI_INTERNALS__');
    const runCallback: unknown = intern && Reflect.get(intern, 'runCallback');
    if (typeof runCallback !== 'function') throw new Error('Tauri-Mock fehlt');
    Reflect.apply(runCallback, intern, [kanal, { message: 'nach-updates-suchen', index: 0 }]);
    await vi.waitFor(() =>
      expect(native.ipc).toHaveBeenCalledWith('plugin:event|emit_to', {
        target: { kind: 'AnyLabel', label: 'main' },
        event: 'nach-updates-suchen-anfrage',
        payload: undefined,
      }),
    );
  } finally {
    a.abmelden();
  }
});
