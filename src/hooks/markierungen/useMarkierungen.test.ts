import { tabFuerTest, holeTabGesetzFuerTest } from '@/test/tabs/tabBestandFuerTest';
import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// useMarkierungen.test.ts
//
// Prüft die Ereignis-Effekte ohne DOM: React-Hooks werden durch kleine
// Attrappen ersetzt; Listener und deren verzögerte Anmeldung bleiben async.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import {
  ausgangsstelle,
  elementstand as testElementstand,
} from '@/test/markierungen/elementstandFabrik';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, EventCallback } from '@tauri-apps/api/event';
import { emitTo } from '@tauri-apps/api/event';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import { useMarkierungen } from './useMarkierungen';
import { zeigeMarkierungenDeaktiviertBanner } from '@/hooks/einstellungen/useMarkierungenDeaktiviert';
import {
  entferneMarkierung,
  hinzufuegenMarkierung,
  fuehreRueckgaengigAus,
  fuehreWiederholenAus,
  registriereMarkierungsHistorienEmpfang,
  zeigeUeberlappungsBanner,
} from '@/lib/markierungen/markierungen.index';
import { setzeAktiv } from '@/lib/plattform/menu/menu.index';
import { bannerDauerMs, zeigeBanner } from '@/lib/banner/banner.index';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

const { effekte } = vi.hoisted(() => ({ effekte: [] as Array<() => void | (() => void)> }));
vi.mock('react', () => ({
  useEffect: (effekt: () => void | (() => void)) => effekte.push(effekt),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('@/lib/plattform/menu/menu.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/plattform/menu/menu.index')>()),
  setzeAktiv: vi.fn(),
}));
vi.mock('@/hooks/einstellungen/useMarkierungenDeaktiviert', () => ({
  zeigeMarkierungenDeaktiviertBanner: vi.fn(),
}));
vi.mock('@/lib/markierungen/markierungen.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/markierungen/markierungen.index')>()),
  fuehreRueckgaengigAus: vi.fn(),
  fuehreWiederholenAus: vi.fn(),
  entferneMarkierung: vi.fn(),
  hinzufuegenMarkierung: vi.fn(),
  registriereMarkierungsHistorienEmpfang: vi.fn(),
  zeigeUeberlappungsBanner: vi.fn(async () => undefined),
}));
vi.mock('@/lib/domain/textpfad/textpfad.index', () => ({
  ermittleAuswahl: () => ({
    textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
    xmlId: 'n1',
    bezugstext: 'A',
  }),
}));
vi.mock('@/lib/domain/norm/norm.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/domain/norm/norm.index')>()),
  ausgangsnormKennung: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(),
  listen: (...args: unknown[]) => listen(...args),
}));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ listen }) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));

function TestMarkierungsAktionen() {
  return useMarkierungen({
    holeTabGesetz: holeTabGesetzFuerTest,
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: null },
    markierungenDeaktiviertRef: { current: false },
  });
}

function TestMarkierungen() {
  useMarkierungen({
    holeTabGesetz: holeTabGesetzFuerTest,
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: null },
    markierungenDeaktiviertRef: { current: false },
  });
  return effekte[1]!();
}

async function verarbeiteAnmeldung() {
  await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(2));
  await Promise.resolve();
}

const listen = vi.fn();
beforeEach(() => {
  effekte.length = 0;
  vi.clearAllMocks();
  vi.mocked(ausgangsnormKennung).mockReset().mockReturnValue(ausgangsstelle().ausgangsstelle);
  vi.mocked(fuehreRueckgaengigAus).mockReset();
  vi.mocked(fuehreWiederholenAus).mockReset();
  vi.mocked(entferneMarkierung).mockReset();
  vi.mocked(emitTo).mockReset().mockResolvedValue(undefined);
  vi.mocked(hinzufuegenMarkierung).mockReset();
  listen.mockReset();
  vi.mocked(registriereMarkierungsHistorienEmpfang)
    .mockReset()
    .mockImplementation(async (uebernehme) => {
      return listen('historienempfang', (event: Event<unknown>) =>
        uebernehme(event.payload as Parameters<typeof uebernehme>[0]),
      );
    });
});

describe('useMarkierungen: Hilfsfensterereignisse', () => {
  it('zeigt das Überlappungsbanner im empfangenden Fenster und meldet beide Listener ab', async () => {
    const abmeldenAktion = vi.fn();
    const abmeldenUeberlappung = vi.fn();
    const callbacks = new Map<string, EventCallback<unknown>>();
    listen.mockImplementation(async (name: string, callback: EventCallback<unknown>) => {
      callbacks.set(name, callback);
      return name === 'historienempfang' ? abmeldenAktion : abmeldenUeberlappung;
    });
    const aufraeumen = TestMarkierungen();
    await verarbeiteAnmeldung();

    callbacks.get('markierung-wegen-ueberlappung-abgelehnt')!({ payload: null } as Event<unknown>);
    await vi.waitFor(() => expect(zeigeUeberlappungsBanner).toHaveBeenCalledTimes(1));
    expect(abmeldenUeberlappung).not.toHaveBeenCalled();
    aufraeumen?.();
    expect(abmeldenAktion).toHaveBeenCalledTimes(1);
    expect(abmeldenUeberlappung).toHaveBeenCalledTimes(1);
  });

  it('meldet nach dem Aufräumen fertig registrierte Listener sofort wieder ab', async () => {
    const abmelden = vi.fn();
    let fertig!: (fn: () => void) => void;
    listen.mockReturnValue(
      new Promise<() => void>((resolve) => {
        fertig = resolve;
      }),
    );
    const aufraeumen = TestMarkierungen();
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    aufraeumen?.();
    fertig(abmelden);
    await vi.waitFor(() => expect(abmelden).toHaveBeenCalled());
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it('meldet auch einen erst nach dem Aufräumen registrierten Überlappungslistener ab', async () => {
    const abmeldenAktion = vi.fn();
    const abmeldenUeberlappung = vi.fn();
    let fertig!: (fn: () => void) => void;
    listen.mockResolvedValueOnce(abmeldenAktion).mockReturnValueOnce(
      new Promise<() => void>((resolve) => {
        fertig = resolve;
      }),
    );
    const aufraeumen = TestMarkierungen();
    await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(2));
    aufraeumen?.();
    expect(abmeldenAktion).toHaveBeenCalledTimes(1);
    expect(abmeldenUeberlappung).not.toHaveBeenCalled();
    fertig(abmeldenUeberlappung);
    await vi.waitFor(() => expect(abmeldenUeberlappung).toHaveBeenCalledTimes(1));
    expect(abmeldenAktion).toHaveBeenCalledTimes(1);
  });

  it('registriert außerhalb von Tauri keine Listener', async () => {
    vi.mocked(registriereMarkierungsHistorienEmpfang).mockRejectedValue(
      new Error('Keine Tauri-Umgebung'),
    );
    const aufraeumen = TestMarkierungen();
    await Promise.resolve();
    aufraeumen?.();
    expect(listen).not.toHaveBeenCalled();
  });
});

describe('useMarkierungen: fehlgeschlagene Speicheraktionen', () => {
  async function vorbereiten() {
    const callbacks = new Map<string, EventCallback<unknown>>();
    listen.mockImplementation(async (name: string, callback: EventCallback<unknown>) => {
      callbacks.set(name, callback);
      return vi.fn();
    });
    const handler = TestMarkierungsAktionen();
    effekte[1]!();
    await verarbeiteAnmeldung();
    return {
      handler,
      meldeAktion: (aktion: unknown) =>
        callbacks.get('historienempfang')!({ payload: aktion } as Event<unknown>),
    };
  }

  it.each(['unterstreichung', 'hervorhebung'] as const)(
    'meldet Speicherfehler beim Anlegen von %s und bewahrt erfolgreiche Aktionen trotz Meldefehler',
    async (typ) => {
      vi.stubGlobal('window', { getSelection: () => null });
      const handler = useMarkierungen({
        holeTabGesetz: holeTabGesetzFuerTest,
        tabsRef: {
          current: [
            tabFuerTest({
              id: 'tab',
              gesetz: {
                kurztitel: 'TestG',
                normgeber: 'de-bund',
                langtitel: 'Testgesetz',
                hatGliederungsartikel: false,
                elemente: [
                  {
                    typ: 'norm',
                    data: normaleNorm({ id: 'n1', xmlId: 'n1', bezeichnung: '§ 1', absaetze: [] }),
                  },
                ],
              },
            }),
          ] as never,
        },
        aktiverTabIdRef: { current: 'tab' },
        markierungenDeaktiviertRef: { current: false },
      });
      const ausfuehren =
        typ === 'unterstreichung' ? handler.handleUnterstreichen : handler.handleHervorheben;
      vi.mocked(hinzufuegenMarkierung)
        .mockRejectedValueOnce(new Error('Platte voll'))
        .mockRejectedValueOnce('wartefrist');
      await expect(ausfuehren()).resolves.toBeUndefined();
      expect(zeigeBanner).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Die Markierung konnte nicht gespeichert werden.',
          typ: 'fehler',
        }),
      );
      // P2-A3: nicht speicherbare Markierung bleibt stehen.
      expect(vi.mocked(zeigeBanner).mock.calls.map(([b]) => bannerDauerMs(b))).toEqual([undefined]);
      vi.mocked(zeigeBanner).mockClear();
      await ausfuehren();
      expect(zeigeBanner).not.toHaveBeenCalled();
      const aktion = {
        art: 'hinzufuegen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        eintrag: {},
      };
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: true,
        aktion,
      } as never);
      vi.mocked(emitTo).mockRejectedValue(new Error('IPC'));
      await expect(ausfuehren()).resolves.toBeUndefined();
      vi.mocked(fuehreRueckgaengigAus).mockResolvedValue(true);
      await expect(handler.handleMarkierungRueckgaengig()).resolves.toBeUndefined();
      expect(fuehreRueckgaengigAus).toHaveBeenCalledWith(aktion);
      expect(zeigeBanner).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    },
  );

  it.each(['rueckgaengig', 'wiederholen'] as const)(
    'meldet %s-Speicherfehler und fängt Teilfortschritt- und Erfolgsmeldefehler ab',
    async (richtung) => {
      const { handler, meldeAktion } = await vorbereiten();
      const aktion = {
        art: 'ersetzen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        fortschritt: { richtung, naechsterSchritt: 1, erfolgreich: true },
      };
      meldeAktion(aktion);
      vi.mocked(fuehreRueckgaengigAus).mockResolvedValue(true);
      if (richtung === 'wiederholen') await handler.handleMarkierungRueckgaengig();
      const speichern = richtung === 'rueckgaengig' ? fuehreRueckgaengigAus : fuehreWiederholenAus;
      const ausfuehren =
        richtung === 'rueckgaengig'
          ? handler.handleMarkierungRueckgaengig
          : handler.handleMarkierungWiederholen;
      vi.mocked(speichern)
        .mockRejectedValueOnce(new Error('Platte voll'))
        .mockRejectedValueOnce('wartefrist')
        .mockResolvedValue(true);
      vi.mocked(emitTo).mockRejectedValue(new Error('IPC'));
      await expect(ausfuehren()).resolves.toBeUndefined();
      expect(zeigeBanner).toHaveBeenCalledWith(
        expect.objectContaining({
          text:
            richtung === 'rueckgaengig'
              ? 'Rückgängig konnte nicht vollständig gespeichert werden. Bitte erneut versuchen.'
              : 'Wiederholen konnte nicht vollständig gespeichert werden. Bitte erneut versuchen.',
          typ: 'fehler',
        }),
      );
      vi.mocked(zeigeBanner).mockClear();
      await expect(ausfuehren()).resolves.toBeUndefined();
      await expect(ausfuehren()).resolves.toBeUndefined();
      expect(zeigeBanner).not.toHaveBeenCalled();
      expect(speichern).toHaveBeenLastCalledWith(aktion);
      const gegenrichtung =
        richtung === 'rueckgaengig'
          ? handler.handleMarkierungWiederholen
          : handler.handleMarkierungRueckgaengig;
      vi.mocked(fuehreWiederholenAus).mockResolvedValue(true);
      await expect(gegenrichtung()).resolves.toBeUndefined();
    },
  );

  it('fängt beim Teilfortschritt auch einen fehlgeschlagenen Ereignismodulimport ab und erhält den erneuten Versuch', async () => {
    const { handler, meldeAktion } = await vorbereiten();
    const aktion = {
      art: 'ersetzen',
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      fortschritt: { richtung: 'rueckgaengig', naechsterSchritt: 1, erfolgreich: true },
    };
    meldeAktion(aktion);
    vi.mocked(fuehreRueckgaengigAus)
      .mockRejectedValueOnce(new Error('Platte voll'))
      .mockResolvedValueOnce(true);
    const importVersucht = vi.fn();
    vi.doMock('@tauri-apps/api/event', () => {
      importVersucht();
      throw new Error('Ereignismodul nicht geladen');
    });
    try {
      await expect(handler.handleMarkierungRueckgaengig()).resolves.toBeUndefined();
      expect(importVersucht).toHaveBeenCalledOnce();
      expect(zeigeBanner).toHaveBeenCalledTimes(1);
    } finally {
      vi.doMock('@tauri-apps/api/event', () => ({ emitTo, listen }));
    }
    await expect(handler.handleMarkierungRueckgaengig()).resolves.toBeUndefined();
    expect(fuehreRueckgaengigAus).toHaveBeenLastCalledWith(aktion);
  });

  it('behält nach erfolgreichem Löschen den Undo-Eintrag trotz Meldefehler ohne Speicherbanner', async () => {
    const { handler } = await vorbereiten();
    vi.mocked(entferneMarkierung).mockResolvedValue(true);
    vi.mocked(emitTo).mockRejectedValue(new Error('IPC'));
    await expect(
      handler.handleMarkierungLoeschen(gesetzesreferenz({ kurztitel: 'TestG' }), {} as never),
    ).resolves.toBeUndefined();
    expect(zeigeBanner).not.toHaveBeenCalled();
    vi.mocked(fuehreRueckgaengigAus).mockResolvedValue(true);
    await expect(handler.handleMarkierungRueckgaengig()).resolves.toBeUndefined();
    expect(fuehreRueckgaengigAus).toHaveBeenCalledWith(
      expect.objectContaining({ art: 'entfernen' }),
    );
  });

  it('überschreibt beim Löschen keine Wartefristmeldung und legt keinen Undo-Eintrag an', async () => {
    vi.mocked(entferneMarkierung).mockRejectedValue('wartefrist');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { handler } = await vorbereiten();
    await handler.handleMarkierungLoeschen(gesetzesreferenz({ kurztitel: 'TestG' }), {} as never);
    await handler.handleMarkierungRueckgaengig();
    expect(zeigeBanner).not.toHaveBeenCalled();
    expect(fuehreRueckgaengigAus).not.toHaveBeenCalled();
    expect(emitTo).not.toHaveBeenCalled();
  });

  it('behält eine fehlgeschlagene Undo-Aktion unter inzwischen neu hinzugekommenen Aktionen', async () => {
    const { handler, meldeAktion } = await vorbereiten();
    const alt = {
      art: 'hinzufuegen',
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      eintrag: {},
    };
    const neu = { ...alt, eintrag: { bezeichnung: '2' } };
    meldeAktion(alt);
    let ablehnen!: (grund: unknown) => void;
    vi.mocked(fuehreRueckgaengigAus).mockReturnValueOnce(
      new Promise<boolean>((_resolve, reject) => {
        ablehnen = reject;
      }),
    );
    const fehlversuch = handler.handleMarkierungRueckgaengig();
    await vi.waitFor(() => expect(fuehreRueckgaengigAus).toHaveBeenCalledTimes(1));
    meldeAktion(neu);
    ablehnen('wartefrist');
    await expect(fehlversuch).resolves.toBeUndefined();
    expect(emitTo).not.toHaveBeenCalled();
    vi.mocked(fuehreRueckgaengigAus).mockResolvedValue(true);
    await handler.handleMarkierungRueckgaengig();
    await handler.handleMarkierungRueckgaengig();
    expect(vi.mocked(fuehreRueckgaengigAus).mock.calls.map(([aktion]) => aktion)).toEqual([
      alt,
      neu,
      alt,
    ]);
  });

  it('behält eine fehlgeschlagene Redo-Aktion für den nächsten Versuch', async () => {
    const { handler, meldeAktion } = await vorbereiten();
    const aktion = {
      art: 'hinzufuegen',
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      eintrag: {},
    };
    meldeAktion(aktion);
    vi.mocked(fuehreRueckgaengigAus).mockResolvedValue(true);
    await handler.handleMarkierungRueckgaengig();
    vi.mocked(emitTo).mockClear();
    vi.mocked(fuehreWiederholenAus).mockRejectedValueOnce('wartefrist');
    await expect(handler.handleMarkierungWiederholen()).resolves.toBeUndefined();
    expect(emitTo).not.toHaveBeenCalled();
    vi.mocked(fuehreWiederholenAus).mockResolvedValue(true);
    await handler.handleMarkierungWiederholen();
    expect(fuehreWiederholenAus).toHaveBeenCalledTimes(2);
  });

  it.each(['rueckgaengig', 'wiederholen'] as const)(
    'aktualisiert nach Teilfehler beim %s die Anzeige und behält die offene Aktion',
    async (richtung) => {
      const { handler, meldeAktion } = await vorbereiten();
      const aktion = {
        art: 'ersetzen' as const,
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        rest: [],
        entfernt: [],
        fortschritt: { richtung, naechsterSchritt: 1, erfolgreich: true },
      };
      meldeAktion(aktion);
      if (richtung === 'wiederholen') {
        vi.mocked(fuehreRueckgaengigAus).mockResolvedValueOnce(true);
        await handler.handleMarkierungRueckgaengig();
      }
      vi.mocked(emitTo).mockClear();
      const ausfuehren = richtung === 'rueckgaengig' ? fuehreRueckgaengigAus : fuehreWiederholenAus;
      vi.mocked(ausfuehren).mockRejectedValueOnce('wartefrist').mockResolvedValueOnce(true);
      const handlerAusfuehren =
        richtung === 'rueckgaengig'
          ? handler.handleMarkierungRueckgaengig
          : handler.handleMarkierungWiederholen;
      await handlerAusfuehren();
      expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'markierungen-geaendert', {
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      });
      await handlerAusfuehren();
      expect(ausfuehren).toHaveBeenLastCalledWith(aktion);
    },
  );

  it('belebt nach einer neuen Aktion einen währenddessen fehlgeschlagenen alten Redo-Eintrag nicht wieder', async () => {
    const { handler, meldeAktion } = await vorbereiten();
    meldeAktion({
      art: 'hinzufuegen',
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      eintrag: {},
    });
    vi.mocked(fuehreRueckgaengigAus).mockResolvedValue(true);
    await handler.handleMarkierungRueckgaengig();
    let ablehnen!: (grund: unknown) => void;
    vi.mocked(fuehreWiederholenAus).mockReturnValueOnce(
      new Promise<boolean>((_resolve, reject) => {
        ablehnen = reject;
      }),
    );
    const fehlversuch = handler.handleMarkierungWiederholen();
    await vi.waitFor(() => expect(fuehreWiederholenAus).toHaveBeenCalledTimes(1));
    meldeAktion({
      art: 'hinzufuegen',
      gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
      eintrag: { bezeichnung: '2' },
    });
    ablehnen('wartefrist');
    await expect(fehlversuch).resolves.toBeUndefined();
    await handler.handleMarkierungWiederholen();
    expect(fuehreWiederholenAus).toHaveBeenCalledTimes(1);
  });
});

it('bestätigt trotz Menüfehler nur einmal, auch nach Undo und StrictMode-Neuanmeldung', async () => {
  const facade = await vi.importActual<typeof import('@/lib/markierungen/markierungen.index')>(
    '@/lib/markierungen/markierungen.index',
  );
  vi.doMock('@tauri-apps/api/event', () => ({ emitTo, listen }));
  vi.doMock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
  vi.mocked(registriereMarkierungsHistorienEmpfang).mockImplementation(
    facade.registriereMarkierungsHistorienEmpfang,
  );
  const callbacks = new Map<string, EventCallback<unknown>>();
  const abmelden = vi.fn();
  listen.mockImplementation(async (name: string, callback: EventCallback<unknown>) => {
    callbacks.set(name, callback);
    return abmelden;
  });
  const handler = TestMarkierungsAktionen();
  const cleanup = effekte[1]!();
  await verarbeiteAnmeldung();
  const aktion = {
    art: 'hinzufuegen',
    gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
    eintrag: markierungsEintrag({
      bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
      typ: 'kommentar',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      kommentarText: 'neu',
    }),
  };
  const nachricht = {
    payload: {
      kennung: crypto.randomUUID(),
      senderLabel: 'hilfe',
      empfaengerLabel: 'main',
      aktion,
    },
  } as Event<unknown>;
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(setzeAktiv).mockImplementationOnce(() => {
    throw new Error('Menü');
  });
  callbacks.get('markierung-historie-uebertragen')!(nachricht);
  await Promise.resolve();
  expect(log).toHaveBeenCalledWith(
    'Markierungsmenü konnte nicht aktualisiert werden:',
    expect.any(Error),
  );
  await vi.waitFor(() =>
    expect(emitTo).toHaveBeenCalledWith(
      'hilfe',
      'markierung-historie-bestaetigt',
      expect.objectContaining({ kennung: (nachricht.payload as { kennung: string }).kennung }),
    ),
  );
  vi.mocked(fuehreRueckgaengigAus).mockResolvedValue(true);
  await handler.handleMarkierungRueckgaengig();
  expect(fuehreRueckgaengigAus).toHaveBeenCalledExactlyOnceWith(aktion);
  cleanup?.();
  const cleanupNeu = effekte[1]!();
  await vi.waitFor(() => expect(listen).toHaveBeenCalledTimes(4));
  callbacks.get('markierung-historie-uebertragen')!(nachricht);
  await handler.handleMarkierungRueckgaengig();
  expect(fuehreRueckgaengigAus).toHaveBeenCalledOnce();
  await handler.handleMarkierungWiederholen();
  expect(fuehreWiederholenAus).toHaveBeenCalledWith(aktion);
  cleanupNeu?.();
  expect(abmelden).toHaveBeenCalledTimes(4);
  log.mockRestore();
});

it('fängt eine fehlgeschlagene öffentliche Empfängeranmeldung ab', async () => {
  const fehler = new Error('Listener');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(registriereMarkierungsHistorienEmpfang).mockRejectedValue(fehler);
  const cleanup = TestMarkierungen();
  await vi.waitFor(() =>
    expect(log).toHaveBeenCalledWith('Markierungsempfang konnte nicht angemeldet werden:', fehler),
  );
  expect(listen).not.toHaveBeenCalled();
  cleanup?.();
  log.mockRestore();
});

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'adressiert direktes %s sowie Undo und Redo nativ an Any',
  async (typ) => {
    const eventAPI =
      await vi.importActual<typeof import('@tauri-apps/api/event')>('@tauri-apps/api/event');
    vi.doMock('@tauri-apps/api/event', () => eventAPI);
    const nativeInvoke = vi.fn(async (befehl: string, _args: unknown) => {
      if (befehl !== 'plugin:event|emit_to') throw new Error(befehl);
    });
    vi.stubGlobal('window', {
      getSelection: () => null,
      __TAURI_INTERNALS__: { invoke: nativeInvoke },
    });
    try {
      const handler = useMarkierungen({
        holeTabGesetz: holeTabGesetzFuerTest,
        tabsRef: {
          current: [
            tabFuerTest({
              id: 'tab',
              gesetz: {
                kurztitel: 'TestG',
                normgeber: 'de-bund',
                langtitel: 'Testgesetz',
                hatGliederungsartikel: false,
                elemente: [
                  {
                    typ: 'norm',
                    data: normaleNorm({ id: 'n1', xmlId: 'n1', bezeichnung: '§ 1', absaetze: [] }),
                  },
                ],
              },
            }),
          ] as never,
        },
        aktiverTabIdRef: { current: 'tab' },
        markierungenDeaktiviertRef: { current: false },
      });
      const aktion = {
        art: 'hinzufuegen',
        gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
        eintrag: markierungsEintrag({ typ, ausgangsstelle: normAusgangsstelle('§ 1') }),
      } as const;
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: true, aktion });
      vi.mocked(fuehreRueckgaengigAus).mockResolvedValue(true);
      vi.mocked(fuehreWiederholenAus).mockResolvedValue(true);
      await (typ === 'unterstreichung'
        ? handler.handleUnterstreichen()
        : handler.handleHervorheben());
      await handler.handleMarkierungRueckgaengig();
      await handler.handleMarkierungWiederholen();
      expect(hinzufuegenMarkierung).toHaveBeenCalledOnce();
      expect(fuehreRueckgaengigAus).toHaveBeenCalledExactlyOnceWith(aktion);
      expect(fuehreWiederholenAus).toHaveBeenCalledExactlyOnceWith(aktion);
      expect(nativeInvoke.mock.calls).toEqual(
        Array.from({ length: 3 }, () => [
          'plugin:event|emit_to',
          {
            target: { kind: 'Any' },
            event: 'markierungen-geaendert',
            payload: { gesetz: aktion.gesetz },
          },
          undefined,
        ]),
      );
    } finally {
      vi.unstubAllGlobals();
      vi.doMock('@tauri-apps/api/event', () => ({ emitTo, listen }));
    }
  },
);

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'übergibt bei %s die Überschrift 010 getrennt von § 1010 an den Speicher',
  async (typ) => {
    const domain = await vi.importActual<typeof import('@/lib/domain/norm/norm.index')>(
      '@/lib/domain/norm/norm.index',
    );
    vi.mocked(ausgangsnormKennung).mockImplementation(domain.ausgangsnormKennung);
    const gesetz: GesetzDarstellung = gesetzDarstellung({
      kurztitel: 'BGB',
      langtitel: 'BGB',
      hatGliederungsartikel: false,
      elemente: [
        {
          typ: 'ueberschrift',
          data: {
            id: 'u',
            xmlId: 'n1',
            gliederungskennzahl: '010',
            bezeichnung: 'Buch 1',
            ebene: 1,
          },
        },
        {
          typ: 'norm',
          data: normaleNorm({ id: 'n', xmlId: 'norm-1010', bezeichnung: '§ 1010', absaetze: [] }),
        },
      ],
    });
    vi.stubGlobal('window', { getSelection: () => null });
    try {
      const handler = useMarkierungen({
        holeTabGesetz: holeTabGesetzFuerTest,
        tabsRef: { current: [tabFuerTest({ id: 'tab', gesetz })] },
        aktiverTabIdRef: { current: 'tab' },
        markierungenDeaktiviertRef: { current: false },
      });
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({ erfolgreich: false });
      await (typ === 'unterstreichung'
        ? handler.handleUnterstreichen()
        : handler.handleHervorheben());
      expect(hinzufuegenMarkierung).toHaveBeenCalledExactlyOnceWith(
        gesetzesreferenz({ kurztitel: 'BGB' }),
        markierungsEintrag({
          typ,
          ausgangsstelle: ueberschriftAusgangsstelle('010'),

          bezug: {
            typ: 'bezugstext' as const,
            textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
            bezugstext: 'A',
          },
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'sperrt %s bei deaktivierten Markierungen vor Speicherung und Historie',
  async (typ) => {
    vi.stubGlobal('window', { getSelection: () => ({ toString: () => 'Text' }) });
    try {
      const hook = useMarkierungen({
        holeTabGesetz: holeTabGesetzFuerTest,
        tabsRef: { current: [] },
        aktiverTabIdRef: { current: null },
        markierungenDeaktiviertRef: { current: true },
      });
      await (typ === 'unterstreichung' ? hook.handleUnterstreichen() : hook.handleHervorheben());
      expect(zeigeMarkierungenDeaktiviertBanner).toHaveBeenCalledOnce();
      expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
      expect(emitTo).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'zeigt bei abgelehntem %s das Überlappungsbanner ohne Historienaktion',
  async (typ) => {
    vi.stubGlobal('window', { getSelection: () => null });
    try {
      const hook = useMarkierungen({
        holeTabGesetz: holeTabGesetzFuerTest,
        tabsRef: {
          current: [
            tabFuerTest({
              id: 'tab',
              gesetz: {
                kurztitel: 'TestG',
                normgeber: 'de-bund',
                langtitel: 'Testgesetz',
                hatGliederungsartikel: false,
                elemente: [
                  {
                    typ: 'norm',
                    data: normaleNorm({ id: 'n1', xmlId: 'n1', bezeichnung: '§ 1', absaetze: [] }),
                  },
                ],
              },
            }),
          ] as never,
        },
        aktiverTabIdRef: { current: 'tab' },
        markierungenDeaktiviertRef: { current: false },
      });
      vi.mocked(hinzufuegenMarkierung).mockResolvedValue({
        erfolgreich: false,
        ablehnungsgrund: 'ueberlappung',
      });
      await (typ === 'unterstreichung' ? hook.handleUnterstreichen() : hook.handleHervorheben());
      expect(zeigeUeberlappungsBanner).toHaveBeenCalledOnce();
      expect(emitTo).not.toHaveBeenCalled();
      await hook.handleMarkierungRueckgaengig();
      await hook.handleMarkierungWiederholen();
      expect(fuehreRueckgaengigAus).not.toHaveBeenCalled();
      expect(fuehreWiederholenAus).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it.each(
  (['unterstreichung', 'hervorhebung'] as const).flatMap((typ) =>
    [0, 1, 2].map((treffer) => ({ typ, treffer })),
  ),
)('$typ legt nur bei genau einem Treffer an ($treffer)', async ({ typ, treffer }) => {
  const norm = {
    typ: 'norm' as const,
    data: normaleNorm({
      id: 'n1',
      xmlId: 'n1',
      bezeichnung: treffer === 0 ? '§ 2' : '§ 1',
      absaetze: [],
    }),
  };
  const gesetz = gesetzDarstellung({
    elemente: [
      norm,
      ...(treffer === 2 ? [{ ...norm, data: { ...norm.data, id: 'n2', xmlId: 'n2' } }] : []),
    ],
  });
  vi.mocked(hinzufuegenMarkierung).mockImplementation(async (gesetz, eintrag) => ({
    erfolgreich: true,
    aktion: { art: 'hinzufuegen', gesetz, eintrag },
  }));
  vi.stubGlobal('window', { getSelection: () => null });
  try {
    const hook = useMarkierungen({
      holeTabGesetz: holeTabGesetzFuerTest,
      tabsRef: { current: [tabFuerTest({ id: 'tab', gesetz })] },
      aktiverTabIdRef: { current: 'tab' },
      markierungenDeaktiviertRef: { current: false },
    });
    await (typ === 'unterstreichung' ? hook.handleUnterstreichen() : hook.handleHervorheben());
    if (treffer === 1) {
      expect(hinzufuegenMarkierung).toHaveBeenCalledOnce();
      expect(zeigeBanner).not.toHaveBeenCalled();
    } else {
      expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
      expect(zeigeBanner).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Diese Stelle lässt sich im Gesetz nicht eindeutig adressieren. Hier sind keine Markierungen möglich.',
        }),
      );
      await hook.handleMarkierungRueckgaengig();
      expect(fuehreRueckgaengigAus).not.toHaveBeenCalled();
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each(
  (['unterstreichung', 'hervorhebung'] as const).flatMap((typ) =>
    ['fehlendes Gesetz', 'fehlendes Element'].map((fall) => ({ typ, fall })),
  ),
)('$typ speichert bei $fall nichts und erklärt die Ablehnung', async ({ typ, fall }) => {
  vi.stubGlobal('window', { getSelection: () => ({ toString: () => 'Auswahl' }) });
  try {
    const hook = useMarkierungen({
      holeTabGesetz: holeTabGesetzFuerTest,
      tabsRef: {
        current: [
          tabFuerTest({
            id: 'tab',
            gesetz: fall === 'fehlendes Gesetz' ? undefined : gesetzDarstellung(),
          }),
        ],
      },
      aktiverTabIdRef: { current: 'tab' },
      markierungenDeaktiviertRef: { current: false },
    });
    await (typ === 'unterstreichung' ? hook.handleUnterstreichen() : hook.handleHervorheben());
    expect(hinzufuegenMarkierung).not.toHaveBeenCalled();
    expect(zeigeBanner).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Diese Stelle lässt sich im Gesetz nicht eindeutig adressieren. Hier sind keine Markierungen möglich.',
      }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
