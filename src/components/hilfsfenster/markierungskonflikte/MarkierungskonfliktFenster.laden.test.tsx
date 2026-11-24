// Ladefehler dürfen im Markierungskonflikte-Fenster keine Konfliktfreiheit vortäuschen.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import Fenster from './MarkierungskonfliktFenster';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const mocks = vi.hoisted(() => ({
  laden: vi.fn(),
  moeglichkeit: vi.fn(),
  titel: vi.fn(),
  neuLaden: undefined as (() => void) | undefined,
}));
let werte = new Map<number, unknown>();
let index = 0;
let erstmals = true;
let effekte: (() => unknown)[] = [];
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useCallback: (fn: unknown) => fn,
  useEffectEvent: (handler: (...args: unknown[]) => unknown) => {
    const platz = index++;
    if (!werte.has(platz)) {
      const eintrag = {
        handler,
        ereignis: (...args: unknown[]): unknown => eintrag.handler(...args),
      };
      werte.set(platz, eintrag);
    }
    const eintrag = werte.get(platz) as { handler: typeof handler; ereignis: typeof handler };
    eintrag.handler = handler;
    return eintrag.ereignis;
  },
  useState: (initial: unknown) => {
    const platz = index;
    index += 1;
    if (!werte.has(platz)) werte.set(platz, initial);
    const setzen = (naechster: unknown) =>
      werte.set(platz, typeof naechster === 'function' ? naechster(werte.get(platz)) : naechster);
    return [werte.get(platz), setzen];
  },
  useRef: (initial: unknown) => {
    const platz = index;
    index += 1;
    if (!werte.has(platz)) werte.set(platz, { current: initial });
    return werte.get(platz);
  },
  useEffect: (effekt: () => unknown) => {
    if (erstmals) effekte.push(effekt);
  },
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  ladeMarkierungskonflikteFuerAnzeige: mocks.laden,
  ermittleAktuelleVerknuepfungsMoeglichkeit: mocks.moeglichkeit,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, callback: () => void) => {
    mocks.neuLaden = callback;
    return () => {};
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ setTitle: mocks.titel }),
}));
vi.mock('@/hooks/fenster/useSchliessenAnfrageSchliesstFenster', () => ({
  useSchliessenAnfrageSchliesstFenster: vi.fn(),
}));
vi.mock('@/hooks/fenster/useFensterSichtbarMachen', () => ({ useFensterSichtbarMachen: vi.fn() }));
vi.mock('@/hooks/einstellungen/useAppAkzentfarbe', () => ({ useAppAkzentfarbe: vi.fn() }));
vi.mock('@/hooks/einstellungen/UiGroesseProvider', () => ({ UiGroesseProvider: 'div' }));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({
  useUiSkalierungsFaktor: () => 1,
}));
vi.mock('@/hooks/stil/useTextRollen', () => ({ useTextRollen: () => ({ fehlertext: {} }) }));
vi.mock('./KonfliktListe', () => ({ GesetzZeile: 'gesetz' }));
vi.mock('./Konfliktseitenleiste', () => ({ Konfliktseitenleiste: 'konfliktseitenleiste' }));

function rendern() {
  index = 0;
  const wurzel = Fenster() as ReactElement<{ children: ReactElement }>;
  const inhalt = wurzel.props.children;
  const baum = (inhalt.type as () => ReactElement)();
  const aktuell = effekte;
  effekte = [];
  erstmals = false;
  aktuell.forEach((effekt) => effekt());
  return baum;
}
function texte(knoten: unknown): string[] {
  if (typeof knoten === 'string') return [knoten];
  if (Array.isArray(knoten)) return knoten.flatMap(texte);
  if (!knoten || typeof knoten !== 'object' || !('props' in knoten)) return [];
  const element = knoten as ReactElement<{ children: unknown }>;
  if (element.type === TextAnzeige)
    return texte(TextAnzeige((knoten as ReactElement<Parameters<typeof TextAnzeige>[0]>).props));
  return texte(element.props.children);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.moeglichkeit.mockReset().mockResolvedValue({ moeglich: false, fehler: [] });
  mocks.titel.mockReset().mockResolvedValue(undefined);
  werte = new Map();
  index = 0;
  erstmals = true;
  effekte = [];
  mocks.neuLaden = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

it('zeigt die Anzahl aller Konfliktzeilen im Titel und aktualisiert sie beim Nachladen', async () => {
  mocks.laden
    .mockResolvedValueOnce({
      pruefstatus: 'aktuell',
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'Fehlt' }), fehlendesGesetz: true, eintraege: [] },
        {
          gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
          nichtamtlicheTitelXmlFehlt: true,
          eintraege: [
            {
              schluessel: 'm',
              ausgangsstelle: normAusgangsstelle('§ 1'),
              bezeichnungAnzeige: '§ 1',
              markierungstyp: 'verweismarkierung',
              eigenerKonflikt: 'pauschalerBezugUnpassend',
              zielKonflikte: [
                {
                  gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
                  typ: 'zielNormUnpassend',
                  bezeichnungenAnzeige: [],
                },
                {
                  gesetz: gesetzesreferenz({ kurztitel: 'Ziel fehlt' }),
                  typ: 'zielGesetzFehlt',
                  bezeichnungenAnzeige: [],
                },
              ],
            },
          ],
        },
      ],
    })
    .mockResolvedValue({ pruefstatus: 'aktuell', gesetze: [] });
  rendern();
  expect(mocks.titel).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(mocks.titel).toHaveBeenLastCalledWith('Markierungskonflikte (5)'));
  mocks.neuLaden!();
  await vi.waitFor(() => expect(mocks.titel).toHaveBeenLastCalledWith('Markierungskonflikte (0)'));
});

it('behandelt einen Fehler beim Setzen des Titels unabhängig vom Laden der Konflikte', async () => {
  mocks.laden.mockResolvedValue({ pruefstatus: 'aktuell', gesetze: [] });
  mocks.titel.mockRejectedValue(new Error('Titel nicht gesetzt'));
  rendern();
  await vi.waitFor(() => expect(mocks.titel).toHaveBeenCalled());
  expect(texte(rendern()).join()).toContain('Keine Markierungskonflikte vorhanden.');
  expect(texte(rendern()).join()).not.toContain('konnten nicht geladen werden');
});

it('zeigt initialen Ladefehler und entfernt ihn nach erfolgreicher Wiederholung', async () => {
  mocks.laden
    .mockRejectedValueOnce(new Error('Keine Rechte'))
    .mockResolvedValue({ pruefstatus: 'aktuell', gesetze: [] });
  rendern();
  await vi.waitFor(() => expect(texte(rendern()).join()).toContain('konnten nicht geladen werden'));
  expect(texte(rendern()).join()).not.toContain('Keine Markierungskonflikte vorhanden.');
  await vi.waitFor(() => expect(mocks.neuLaden).toBeTypeOf('function'));
  mocks.neuLaden!();
  await vi.waitFor(() =>
    expect(texte(rendern()).join()).toContain('Keine Markierungskonflikte vorhanden.'),
  );
  expect(texte(rendern()).join()).not.toContain('konnten nicht geladen werden');
});

it('ersetzt bei fehlgeschlagenem Neuladen den vorherigen Stand durch einen sichtbaren Fehler', async () => {
  mocks.laden
    .mockResolvedValueOnce({
      pruefstatus: 'aktuell',
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
      ],
    })
    .mockRejectedValue(new Error('Platte nicht lesbar'));
  rendern();
  await vi.waitFor(() => expect(mocks.neuLaden).toBeTypeOf('function'));
  await vi.waitFor(() => expect(mocks.laden).toHaveBeenCalledTimes(1));
  mocks.neuLaden!();
  await vi.waitFor(() => expect(texte(rendern()).join()).toContain('konnten nicht geladen werden'));
  expect(texte(rendern()).join()).not.toContain('Keine Markierungskonflikte vorhanden.');
});

for (const pruefstatus of ['ausstehend', 'fehlgeschlagen']) {
  it(`zeigt ${pruefstatus} auch ohne Befunde und bestätigt keine Konfliktfreiheit`, async () => {
    mocks.laden.mockResolvedValue({ pruefstatus, gesetze: [] });
    rendern();
    await vi.waitFor(() =>
      expect(texte(rendern()).join()).toContain(
        pruefstatus === 'ausstehend'
          ? 'Die Prüfung steht noch aus.'
          : 'Die Prüfung ist fehlgeschlagen.',
      ),
    );
    expect(texte(rendern()).join()).not.toContain('Keine Markierungskonflikte vorhanden.');
  });
}
it('erfolgreiches Laden nach Ladefehler erhält den gespeicherten Fehlerstatus', async () => {
  mocks.laden
    .mockRejectedValueOnce(new Error('Keine Rechte'))
    .mockResolvedValue({ pruefstatus: 'fehlgeschlagen', gesetze: [] });
  rendern();
  await vi.waitFor(() => expect(texte(rendern()).join()).toContain('konnten nicht geladen werden'));
  mocks.neuLaden!();
  await vi.waitFor(() =>
    expect(texte(rendern()).join()).toContain('Die Prüfung ist fehlgeschlagen.'),
  );
  expect(texte(rendern()).join()).not.toContain('konnten nicht geladen werden');
});

it.each(['ausstehend', 'fehlgeschlagen'] as const)(
  'zeigt %s bei Erstöffnung zusammen mit erhaltenen früheren Befunden',
  async (pruefstatus) => {
    mocks.laden.mockResolvedValue({
      pruefstatus,
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
      ],
    });
    rendern();
    await vi.waitFor(() =>
      expect(texte(rendern()).join()).toContain(
        pruefstatus === 'ausstehend'
          ? 'Die Prüfung steht noch aus.'
          : 'Die Prüfung ist fehlgeschlagen.',
      ),
    );
    function gesetze(knoten: unknown): ReactElement[] {
      if (Array.isArray(knoten)) return knoten.flatMap(gesetze);
      if (!knoten || typeof knoten !== 'object' || !('props' in knoten)) return [];
      const element = knoten as ReactElement<{ children: unknown }>;
      return [...(element.type === 'gesetz' ? [element] : []), ...gesetze(element.props.children)];
    }
    expect(gesetze(rendern())).toHaveLength(1);
  },
);

it('ersetzt Fehlerstatus und Befunde nach manueller Vollprüfung durch frisch geladenen Stand', async () => {
  mocks.laden
    .mockResolvedValueOnce({
      pruefstatus: 'fehlgeschlagen',
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
      ],
    })
    .mockResolvedValue({ pruefstatus: 'aktuell', gesetze: [] });
  rendern();
  await vi.waitFor(() =>
    expect(texte(rendern()).join()).toContain('Die Prüfung ist fehlgeschlagen.'),
  );
  function findeKonfliktseitenleiste(
    knoten: unknown,
  ): ReactElement<{ onAlleGeprueft: () => void }> | undefined {
    if (Array.isArray(knoten)) return knoten.map(findeKonfliktseitenleiste).find(Boolean);
    if (!knoten || typeof knoten !== 'object' || !('props' in knoten)) return undefined;
    const element = knoten as ReactElement<{ children: unknown; onAlleGeprueft: () => void }>;
    return element.type === 'konfliktseitenleiste'
      ? element
      : findeKonfliktseitenleiste(element.props.children);
  }
  findeKonfliktseitenleiste(rendern())!.props.onAlleGeprueft();
  await vi.waitFor(() =>
    expect(texte(rendern()).join()).toContain('Keine Markierungskonflikte vorhanden.'),
  );
  expect(texte(rendern()).join()).not.toContain('Die Prüfung ist fehlgeschlagen.');
  expect(mocks.laden).toHaveBeenCalledTimes(2);
});

function findeElement(
  knoten: unknown,
  typ: string,
): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(knoten)) return knoten.map((k) => findeElement(k, typ)).find(Boolean);
  if (!knoten || typeof knoten !== 'object' || !('props' in knoten)) return undefined;
  const element = knoten as ReactElement<Record<string, unknown>>;
  return element.type === typ ? element : findeElement(element.props.children, typ);
}

it('behält die sichtbare Gesetzgruppe bei erneutem Ladefehler', async () => {
  mocks.laden
    .mockResolvedValueOnce({
      pruefstatus: 'aktuell',
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
      ],
    })
    .mockRejectedValue(new Error('Platte'));
  rendern();
  await vi.waitFor(() => expect(findeElement(rendern(), 'gesetz')).toBeDefined());
  mocks.neuLaden!();
  await vi.waitFor(() => expect(texte(rendern()).join()).toContain('konnten nicht geladen werden'));
  expect(findeElement(rendern(), 'gesetz')).toBeDefined();
});

it('behält bei gemeldetem Nachfehler Befunde und sperrt erneutes Nachladen bis zur erfolgreichen Vollprüfung', async () => {
  const bestand = {
    pruefstatus: 'aktuell',
    gesetze: [
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
    ],
  };
  mocks.laden
    .mockResolvedValueOnce(bestand)
    .mockResolvedValue({ pruefstatus: 'aktuell', gesetze: [] });
  rendern();
  await vi.waitFor(() => expect(findeElement(rendern(), 'gesetz')).toBeDefined());
  const konfliktseitenleiste = findeElement(rendern(), 'konfliktseitenleiste')!;
  expect(konfliktseitenleiste.props.aktionsAbschlussOffen).toBe(false);
  (konfliktseitenleiste.props.onAktionsNachfehler as () => void)();
  expect(findeElement(rendern(), 'konfliktseitenleiste')!.props.aktionsAbschlussOffen).toBe(true);
  mocks.neuLaden!();
  await Promise.resolve();
  expect(mocks.laden).toHaveBeenCalledTimes(1);
  expect(findeElement(rendern(), 'gesetz')).toBeDefined();
  expect(texte(rendern()).join()).toContain(
    'Nach der Aktion ist kein verlässlicher Prüfabschluss bestätigt.',
  );
  expect(texte(rendern()).join()).not.toContain('Keine Markierungskonflikte vorhanden.');
  (konfliktseitenleiste.props.onAlleGeprueft as () => void)();
  await vi.waitFor(() =>
    expect(texte(rendern()).join()).toContain('Keine Markierungskonflikte vorhanden.'),
  );
  expect(findeElement(rendern(), 'konfliktseitenleiste')!.props.aktionsAbschlussOffen).toBe(false);
});

it('übernimmt eine vor dem Nachfehler begonnene spätere Leerantwort nicht', async () => {
  let abschliessen!: (e: unknown) => void;
  mocks.laden
    .mockResolvedValueOnce({
      pruefstatus: 'aktuell',
      gesetze: [
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), fehlendesGesetz: true, eintraege: [] },
      ],
    })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          abschliessen = resolve;
        }),
    );
  rendern();
  await vi.waitFor(() => expect(findeElement(rendern(), 'gesetz')).toBeDefined());
  mocks.neuLaden!();
  (findeElement(rendern(), 'konfliktseitenleiste')!.props.onAktionsNachfehler as () => void)();
  abschliessen({ pruefstatus: 'aktuell', gesetze: [] });
  await Promise.resolve();
  expect(findeElement(rendern(), 'gesetz')).toBeDefined();
  expect(texte(rendern()).join()).not.toContain('Keine Markierungskonflikte vorhanden.');
});

it('behauptet nach einem Aktionsfehler auch bei zuvor leerer Liste keine Konfliktfreiheit', async () => {
  mocks.laden.mockResolvedValue({ pruefstatus: 'aktuell', gesetze: [] });
  rendern();
  await vi.waitFor(() =>
    expect(texte(rendern()).join()).toContain('Keine Markierungskonflikte vorhanden.'),
  );
  (findeElement(rendern(), 'konfliktseitenleiste')!.props.onAktionsNachfehler as () => void)();
  expect(texte(rendern()).join()).not.toContain('Keine Markierungskonflikte vorhanden.');
  expect(texte(rendern()).join()).toContain('kein verlässlicher Prüfabschluss bestätigt');
});

it('behält den Listener bei Zustandsänderung und berücksichtigt den aktuellen Nachfehler', async () => {
  mocks.laden.mockResolvedValue({ pruefstatus: 'aktuell', gesetze: [] });
  rendern();
  await vi.waitFor(() => expect(mocks.neuLaden).toBeDefined());
  await vi.waitFor(() =>
    expect(texte(rendern()).join()).toContain('Keine Markierungskonflikte vorhanden.'),
  );
  const listener = mocks.neuLaden;
  (findeElement(rendern(), 'konfliktseitenleiste')!.props.onAktionsNachfehler as () => void)();
  rendern();
  listener!();
  await Promise.resolve();
  expect(mocks.neuLaden).toBe(listener);
  expect(mocks.laden).toHaveBeenCalledOnce();
  expect(texte(rendern()).join()).toContain('kein verlässlicher Prüfabschluss bestätigt');
});
