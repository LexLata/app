// ablehnungsAnzeige.integration.test.ts
// Echte Hilfsfenster-Sender, Empfänger-Hook und Bannerzuordnung; nur React,
// Speicherung und native Fensterkommunikation werden ersetzt.
import { holeTabGesetzFuerTest } from '@/test/tabs/tabBestandFuerTest';
import { normaleNorm, gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, EventCallback } from '@tauri-apps/api/event';
import { emitTo } from '@tauri-apps/api/event';
import { useMarkierungen } from './useMarkierungen';
import {
  hinzufuegenMarkierung,
  speichereVerweismarkierung,
  speichereKommentar,
  type MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import { zeigeBanner } from '@/lib/banner/banner.index';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';
import { kommentar, verweismarkierung } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';

const ipc = vi.hoisted(() => ({
  label: 'main',
  effekte: [] as Array<() => void | (() => void)>,
  listener: [] as Array<{ label: string; name: string; callback: EventCallback<unknown> }>,
  empfaenger: [] as string[],
}));
vi.mock('react', () => ({
  useEffect: (effekt: () => void | (() => void)) => ipc.effekte.push(effekt),
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: ipc.label }),
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, callback: EventCallback<unknown>) => {
    const eintrag = { label: ipc.label, name, callback };
    ipc.listener.push(eintrag);
    return () => {
      ipc.listener = ipc.listener.filter((e) => e !== eintrag);
    };
  }),
  emitTo: vi.fn(async (label: string, name: string, payload: unknown) => {
    for (const e of ipc.listener.filter((e) => e.label === label && e.name === name)) {
      ipc.empfaenger.push(e.label);
      e.callback({ event: name, id: 1, payload } as Event<unknown>);
    }
  }),
}));
vi.mock('@tauri-apps/api/webview', async () => {
  const { listen } = await import('@tauri-apps/api/event');
  return { getCurrentWebview: () => ({ listen }) };
});
vi.mock('@/lib/plattform/menu/menu.index', () => ({ setzeAktiv: vi.fn() }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));
// Flüchtiger Dateibestand statt AppData; Sperren ohne native Brücke.
const dateien = vi.hoisted(() => new Map<string, string>());
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sicherstelleOrdner: async () => {},
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('token'),
  mitDateiSperren: async (
    pfade: string[],
    aktion: (tokens: Map<string, string>) => Promise<unknown>,
  ) => aktion(new Map(pfade.map((pfad) => [pfad, 'token']))),
  appDatenExistiert: async (pfad: string) => dateien.has(pfad),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenLesen: async (pfad: string) => {
    const inhalt = dateien.get(pfad);
    if (inhalt === undefined) throw new Error('Datei fehlt');
    return inhalt;
  },
  appDatenLesenOhneHinweis: async (pfad: string) => dateien.get(pfad) ?? '',
  appDatenLesenOderNull: async (pfad: string) => dateien.get(pfad) ?? null,
  appDatenSchreiben: async (pfad: string, inhalt: string) => {
    dateien.set(pfad, inhalt);
  },
}));
// Prüfbedarf-Empfänger des Hauptfensters ist hier nicht gestartet.
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: async () => 'vorgang',
  schliessePruefpflichtigeQuelleAb: async () => true,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ladeAlleGesetze: vi.fn(async () => [
    gesetzDarstellung({
      kurztitel: 'TestG',
      langtitel: 'Testgesetz',
      hatGliederungsartikel: false,
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({ id: 'norm', xmlId: 'n1', bezeichnung: '§ 1', absaetze: [] }),
        },
      ],
    }),
  ]),
}));

const aufraeumen: Array<() => void> = [];
beforeEach(() => {
  ipc.effekte = [];
  ipc.listener = [];
  ipc.empfaenger = [];
  dateien.clear();
  dateien.set(
    'gesetze/TestG_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text eins</absatz></text></norm></inhalt></gesetz>',
  );
  vi.clearAllMocks();
});
afterEach(() => {
  for (const fn of aufraeumen.splice(0)) fn();
});

function TestHauptfenster() {
  useMarkierungen({
    holeTabGesetz: holeTabGesetzFuerTest,
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: null },
    markierungenDeaktiviertRef: { current: false },
  });
}

async function meldeHauptfensterAn(label: string) {
  ipc.label = label;
  TestHauptfenster();
  for (const effekt of ipc.effekte.splice(0)) {
    const cleanup = effekt();
    if (cleanup) aufraeumen.push(cleanup);
  }
  await vi.waitFor(() => expect(ipc.listener.filter((e) => e.label === label)).toHaveLength(2));
}

const textstelle = { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 4 };

/** Legt über den echten Speicherweg eine vorhandene Markierung in der Markierungsdatei an. */
async function legeVorhandeneMarkierungAn(eintrag: MarkierungsEintrag) {
  const ergebnis = await hinzufuegenMarkierung(gesetzesreferenz({ kurztitel: 'TestG' }), eintrag);
  expect(ergebnis.erfolgreich).toBe(true);
  vi.clearAllMocks();
  ipc.empfaenger = [];
}

async function versucheAnlegen(typ: 'kommentar' | 'verweismarkierung', mitTextbezug = false) {
  ipc.label = 'hilfsfenster';
  const kontext = {
    gesetz: gesetzesreferenz({ kurztitel: 'TestG' }),
    ausgangsstelle: normAusgangsstelle('§ 1'),
    openerLabel: 'main-2',
    ...(mitTextbezug ? { auswahl: { textstelle, bezugstext: 'Text' } } : {}),
  };
  if (typ === 'kommentar')
    return speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Kommentar', mitTextbezug);
  return speichereVerweismarkierung(
    kontext,
    markierungsEinzelzugriffFuerTest,
    '§ 1 TestG',
    mitTextbezug,
    false,
    new Map(),
  );
}

describe('Ablehnungsanzeige vom Hilfsfenster zum öffnenden Hauptfenster', () => {
  it('Verweismarkierung gibt Überlappung lokal ohne Hauptfensterbanner zurück', async () => {
    await meldeHauptfensterAn('main');
    await meldeHauptfensterAn('main-2');
    await legeVorhandeneMarkierungAn(kommentar({ textstelle, bezugstext: 'Text' }));
    expect(await versucheAnlegen('verweismarkierung', true)).toEqual({
      art: 'fehler',
      fehler: [
        { art: 'sonst', text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.' },
      ],
    });
    expect(emitTo).not.toHaveBeenCalled();
    expect(ipc.empfaenger).toEqual([]);
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it('erhält die bisherige Hauptfensteranzeige eines ausdrücklichen Überlappungsereignisses', async () => {
    await meldeHauptfensterAn('main');
    await meldeHauptfensterAn('main-2');
    await emitTo('main-2', 'markierung-wegen-ueberlappung-abgelehnt', null);
    expect(ipc.empfaenger).toEqual(['main-2']);
    await vi.waitFor(() =>
      expect(zeigeBanner).toHaveBeenCalledExactlyOnceWith({
        text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.',
        typ: 'warnung',
        art: 'bedienhinweis',
      }),
    );
  });

  it('Kommentar gibt Überlappung lokal zurück, ohne Bannerereignis oder Historienaktion', async () => {
    await meldeHauptfensterAn('main');
    await meldeHauptfensterAn('main-2');
    await legeVorhandeneMarkierungAn(
      verweismarkierung({
        textstelle,
        bezugstext: 'Text',
        verweisinhalt: { verweistext: 'Art. 1 GG', verweisziele: [] },
      }),
    );
    expect(await versucheAnlegen('kommentar', true)).toEqual({
      art: 'fehler',
      text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.',
    });
    expect(emitTo).not.toHaveBeenCalled();
    expect(ipc.empfaenger).toEqual([]);
    expect(zeigeBanner).not.toHaveBeenCalled();
  });

  it.each(['kommentar', 'verweismarkierung'] as const)(
    '%s meldet Duplikat inline und sendet weder Bannerereignis noch Historienaktion',
    async (typ) => {
      await meldeHauptfensterAn('main-2');
      await legeVorhandeneMarkierungAn(
        typ === 'kommentar'
          ? kommentar({ kommentarText: 'Kommentar' })
          : verweismarkierung({ verweisinhalt: { verweistext: '§ 1 TestG', verweisziele: [] } }),
      );
      expect(await versucheAnlegen(typ)).toEqual(
        typ === 'kommentar'
          ? { art: 'fehler', text: 'Ein identischer Kommentar existiert bereits.' }
          : {
              art: 'fehler',
              fehler: [{ art: 'sonst', text: 'Ein identischer Verweis existiert bereits.' }],
            },
      );
      expect(emitTo).not.toHaveBeenCalled();
      expect(ipc.empfaenger).toEqual([]);
      expect(zeigeBanner).not.toHaveBeenCalled();
    },
  );
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: vi.fn(async () => [
    gesetzDarstellung({
      kurztitel: 'TestG',
      langtitel: 'Testgesetz',
      hatGliederungsartikel: false,
      elemente: [
        {
          typ: 'norm',
          data: normaleNorm({ id: 'norm', xmlId: 'n1', bezeichnung: '§ 1', absaetze: [] }),
        },
      ],
    }),
  ]),
}));
