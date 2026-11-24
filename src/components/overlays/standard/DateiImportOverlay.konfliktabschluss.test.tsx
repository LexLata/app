// @vitest-environment jsdom
// Echte Overlayklicks mit Konfliktoperation und gezielt gestörten Speicherabschlüssen.
import '@/test/import/dateiImportOverlayAnzeigeAttrappen';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DateiImportOverlay } from './DateiImportOverlay';
import type { ImportKonflikt } from '@/lib/import-export/import-export.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';

const io = vi.hoisted(() => ({
  schreiben: vi.fn(),
  fehler: new Map<string, 'schreiben' | 'folge' | 'sicherung'>(),
}));
async function speichern(art: string, empfangen?: (m: unknown) => void, bestaetigen?: () => void) {
  io.schreiben(art);
  const fehler = io.fehler.get(art);
  if (fehler === 'sicherung')
    empfangen?.({
      typ: 'warnung',
      art: 'hinweis',
      anlass: 'sicherung',
      aenderungsstand: 'vollstaendig',
      text: 'Bestand gesichert',
    });
  if (fehler === 'schreiben' || fehler === 'sicherung') throw new Error('Schreiben verweigert');
  bestaetigen?.();
  if (fehler === 'folge') {
    empfangen?.({
      typ: 'fehler',
      art: 'hinweis',
      anlass: 'synchronisation',
      aenderungsstand: 'vollstaendig',
      text: 'Fensterabgleich fehlgeschlagen',
    });
    throw new Error('Fensterabgleich fehlgeschlagen');
  }
  return true;
}
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  speichereGesetz: (
    _g: unknown,
    _xml: string,
    optionen: { meldungEmpfangen: (m: unknown) => void; zielGeschrieben: () => void },
  ) => speichern('gesetz', optionen.meldungEmpfangen, optionen.zielGeschrieben),
  ersetzeNichtamtlicheTitelDatei: (
    _g: unknown,
    _xml: string,
    empfangen: (m: unknown) => void,
    bestaetigen: () => void,
  ) => speichern('nichtamtlicheTitel', empfangen, bestaetigen),
}));
vi.mock('@/lib/markierungen/markierungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/markierungen/markierungen.index')>()),
  beurteileMarkierungsImport: () => ({ eintraege: [], ausgeschlossen: 0, meldungen: [] }),
  leseMarkierungenRohtext: async () => null,
  ersetzeMarkierungenDatei: (
    _g: unknown,
    _xml: string,
    empfangen: (m: unknown) => void,
    bestaetigen: () => void,
  ) => speichern('markierung', empfangen, bestaetigen),
  zusammenfuehrenMarkierungen: (
    _g: unknown,
    _e: unknown,
    _b: boolean,
    empfangen: (m: unknown) => void,
    bestaetigen: () => void,
  ) => speichern('markierung', empfangen, bestaetigen),
}));
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  pruefeFavoritenImport: () => 1,
  ersetzeFavoritenDatei: () => speichern('favoriten'),
  zusammenfuehrenFavoriten: async () =>
    (await speichern('favoriten')) ? new Set(['neu']) : new Set(),
}));
vi.mock('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher', () => ({
  pruefeLesezeichenImport: () => 1,
  ersetzeLesezeichenDatei: () => speichern('lesezeichen'),
  zusammenfuehrenLesezeichen: () => speichern('lesezeichen'),
}));
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', () => ({
  pruefeGesetzeskurzbefehleImport: () => 1,
  ersetzeGesetzeskurzbefehleDatei: () => speichern('gesetzeskurzbefehle'),
  zusammenfuehrenGesetzeskurzbefehle: () => speichern('gesetzeskurzbefehle'),
}));
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  wendeEinstellungenXMLAn: () => {},
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => {}) }));

const arten = [
  'gesetz',
  'markierung',
  'nichtamtlicheTitel',
  'favoriten',
  'lesezeichen',
  'gesetzeskurzbefehle',
] as const;
function kandidat(art: (typeof arten)[number], name: string = art): ImportKonflikt {
  const gesetz = { kurztitel: name, normgeber: 'de-bund' };
  const quelle = `Sicherung.zip → ${name}/Datei.xml`;
  return art === 'gesetz'
    ? { art, kurztitel: name, neuesGesetz: gesetz, neuesXML: '<gesetz/>', quelle }
    : { art, gesetz, kurztitel: name, anzeigename: name, importInhalt: '<xml/>', quelle };
}
let wurzel: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  io.fehler.clear();
  alleBannerSchliessen();
  container = document.createElement('div');
  document.body.append(container);
  wurzel = createRoot(container);
});
afterEach(async () => {
  await act(async () => wurzel.unmount());
  container.remove();
});
async function anzeigen(
  konflikte: ImportKonflikt[],
  reload: Parameters<typeof DateiImportOverlay>[0]['onNeuLaden'] = vi.fn(async () => {}),
) {
  await act(async () =>
    wurzel.render(
      <DateiImportOverlay
        zustand={{ art: 'fertig', ergebnis: { konflikte, berichtEintraege: [], fehler: [] } }}
        onSchliessen={vi.fn()}
        onNeuLaden={reload}
      />,
    ),
  );
}
async function klicken(text: string) {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent === text);
  if (!button) throw new Error(`Button fehlt: ${text}`);
  await act(async () => button.click());
}
const entscheidungen = arten.flatMap((art) => [
  ...['Ersetzen', 'Alle ersetzen'].map((aktion) => ({ art, aktion })),
  ...(['favoriten', 'lesezeichen', 'gesetzeskurzbefehle', 'markierung'].includes(art)
    ? ['Zusammenführen', 'Alle zusammenführen'].map((aktion) => ({ art, aktion }))
    : []),
]);
it.each(entscheidungen)(
  '$art/$aktion erhält Schreibfehler mit Quelle und offenen Kandidaten',
  async ({ art, aktion }) => {
    io.fehler.set(art, 'schreiben');
    await anzeigen([kandidat(art)]);
    await klicken(aktion);
    expect(container.textContent).toContain('Importkonflikte');
    expect(container.textContent).toContain('Schreiben verweigert');
    expect(container.textContent).toContain(`Sicherung.zip → ${art}/Datei.xml`);
    expect(container.textContent).not.toContain('ersetzt.');
    expect(io.schreiben).toHaveBeenCalledExactlyOnceWith(art);
  },
);
it.each(entscheidungen)(
  '$art/$aktion entfernt erfolgreich erledigten Kandidaten',
  async ({ art, aktion }) => {
    await anzeigen([kandidat(art)]);
    await klicken(aktion);
    expect(container.textContent).not.toContain('Importkonflikte');
    expect(container.textContent).toContain(
      aktion.toLowerCase().includes('zusammen') ? 'zusammengeführt.' : 'ersetzt.',
    );
  },
);
it.each(['Alle ersetzen', 'Alle zusammenführen'])(
  '%s stoppt nach echtem Schreibfehler',
  async (aktion) => {
    io.fehler.set('lesezeichen', 'schreiben');
    await anzeigen([
      kandidat('favoriten', 'A'),
      kandidat('lesezeichen', 'B'),
      kandidat('markierung', 'C'),
    ]);
    await klicken(aktion);
    expect(io.schreiben.mock.calls).toEqual([['favoriten'], ['lesezeichen']]);
    expect(container.textContent).toContain(
      aktion === 'Alle ersetzen' ? 'A ersetzt.' : 'A zusammengeführt.',
    );
    expect(container.textContent).toContain('Schreiben verweigert');
    const schaltflaechen = [...container.querySelectorAll('button')];
    // Die echte Kopfzeile ergänzt das beschriftungslose Schließen-Symbol.
    expect(schaltflaechen.filter((b) => b.textContent === '')).toHaveLength(1);
    expect(schaltflaechen.filter((b) => b.textContent !== '')).toHaveLength(6);
  },
);
it.each(['Alle ersetzen', 'Alle zusammenführen'])(
  '%s setzt nach bloßem Folgeproblem fort',
  async (aktion) => {
    io.fehler.set('markierung', 'folge');
    await anzeigen([kandidat('markierung', 'A'), kandidat('favoriten', 'B')]);
    await klicken(aktion);
    expect(io.schreiben.mock.calls).toEqual([['markierung'], ['favoriten']]);
    expect(container.textContent).not.toContain('Importkonflikte');
    expect(container.textContent?.match(/Fensterabgleich fehlgeschlagen/g)).toHaveLength(1);
  },
);
it.each(['gesetz', 'nichtamtlicheTitel', 'markierung'] as const)(
  '%s bleibt bei Folgeproblem erledigt',
  async (art) => {
    io.fehler.set(art, 'folge');
    await anzeigen([kandidat(art)]);
    await klicken('Ersetzen');
    expect(container.textContent).not.toContain('Importkonflikte');
    expect(container.textContent).toContain('ersetzt.');
    expect(container.textContent?.match(/Fensterabgleich fehlgeschlagen/g)).toHaveLength(1);
    expect(io.schreiben).toHaveBeenCalledOnce();
  },
);
it('gesicherte, aber nicht geschriebene Titel bleiben offen', async () => {
  io.fehler.set('nichtamtlicheTitel', 'sicherung');
  await anzeigen([kandidat('nichtamtlicheTitel')]);
  await klicken('Ersetzen');
  expect(container.textContent).toContain('Importkonflikte');
  expect(container.textContent).toContain('Bestand gesichert Schreiben verweigert');
});
it('Reloadfehler erhält die Gesetzesspeicherung und nennt die Quelle', async () => {
  await anzeigen(
    [kandidat('gesetz')],
    vi.fn(async () => {
      throw new Error('Ladeproblem');
    }),
  );
  await klicken('Ersetzen');
  expect(container.textContent).not.toContain('Importkonflikte');
  // Erfolge nennen den Namen, nicht die Herkunftsdatei.
  expect(container.textContent).not.toContain('Sicherung.zip');
  expect(container.textContent).toContain('ersetzt.');
  expect(container.textContent).toContain('Ladeproblem');
  expect(io.schreiben).toHaveBeenCalledOnce();
});

/** Neuladen, das erst auf Freigabe endet und dabei eine Meldung liefert. */
function haengendesNeuladen(meldung?: string) {
  let freigeben = () => {};
  const frei = new Promise<void>((r) => (freigeben = r));
  const reload = vi.fn(async (_referenzen: unknown, empfangen?: AktionsMeldungEmpfaenger) => {
    await frei;
    if (meldung)
      empfangen?.({
        text: meldung,
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'lesen',
        aenderungsstand: 'keine',
        betroffen: 'Fremd_de-bund.xml',
      });
  });
  return { reload, freigeben: () => act(async () => freigeben()) };
}
const schliessenKnopf = () =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === '');
it('entfernt die Zeile nach dem Speichern, ohne auf das Neuladen zu warten, und ergänzt dessen Meldung später', async () => {
  const { reload, freigeben } = haengendesNeuladen('Später Befund');
  await anzeigen([kandidat('gesetz', 'A'), kandidat('gesetz', 'B')], reload);
  await klicken('Ersetzen');
  expect(reload).toHaveBeenCalledOnce();
  expect(container.textContent).toContain('A ersetzt.');
  // Zweite Zeile und Sammelaktion sind sofort wieder bedienbar, ebenso das Schließen.
  expect(schliessenKnopf()?.disabled).toBe(false);
  await klicken('Alle ersetzen');
  expect(io.schreiben).toHaveBeenCalledTimes(2);
  expect(container.textContent).not.toContain('Importkonflikte');
  expect(container.textContent).not.toContain('Später Befund');
  await freigeben();
  expect(container.textContent).toContain('Später Befund');
});
it('zeigt nach dem Schließen eintreffende Meldungen einmal als Vorgangsergebnis-Banner', async () => {
  const { reload, freigeben } = haengendesNeuladen('Später Befund');
  await anzeigen([kandidat('gesetz')], reload);
  await klicken('Ersetzen');
  await act(async () => wurzel.unmount());
  expect(getSnapshot()).toEqual([]);
  await freigeben();
  const banner = getSnapshot();
  expect(banner).toHaveLength(1);
  expect(banner[0]?.art).toBe('vorgangsergebnis');
  expect(JSON.stringify(banner[0])).toContain('Später Befund');
  wurzel = createRoot(container);
});
it('zeigt nach dem Schließen ohne späte Meldung kein Banner', async () => {
  const { reload, freigeben } = haengendesNeuladen();
  await anzeigen([kandidat('gesetz')], reload);
  await klicken('Ersetzen');
  await act(async () => wurzel.unmount());
  await freigeben();
  expect(getSnapshot()).toEqual([]);
  wurzel = createRoot(container);
});

it('zeigt Schemahinweise des gesunden Gesetzreloads beim bestätigten Import', async () => {
  await anzeigen(
    [kandidat('gesetz')],
    vi.fn(async (_referenzen: unknown, empfangen?: AktionsMeldungEmpfaenger) => {
      empfangen?.({
        text: 'Bestandsquelle: gesetze/Alt_de-bund.xml. Schemaversion „999“',
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'lesen',
        aenderungsstand: 'keine',
      });
    }),
  );
  await klicken('Ersetzen');
  expect(container.textContent).toContain('ersetzt.');
  expect(container.textContent).toContain('Bestandsquelle: gesetze/Alt_de-bund.xml');
  expect(container.textContent).toContain('999');
  expect(container.textContent).not.toContain('nicht neu geladen');
});
