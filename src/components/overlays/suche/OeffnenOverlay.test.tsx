import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import {
  setzeSuchverzeichnisTestdaten,
  erfolgreicherSuchTestImport,
} from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
// OeffnenOverlay.test.tsx
// Suchnavigation, Importabschlüsse und wirkungsloses Enter ohne Treffer.
import { normaleNorm, gesetzesreferenz, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { act, StrictMode, useRef, type ReactNode } from 'react';
import { useOeffnenLinkNavigation } from '@/hooks/fenster/useOeffnenLinkNavigation';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OeffnenOverlay } from './OeffnenOverlay';

const { importieren, indexLaden, eingabe } = vi.hoisted(() => ({
  importieren: vi.fn(),
  indexLaden: vi.fn(),
  eingabe: { aendern: (_: string) => {} },
}));
vi.mock('@/lib/import/import.index', async (original) => ({
  ...(await original<typeof import('@/lib/import/import.index')>()),
  istVerbindungsFehler: (await original<typeof import('@/lib/import/import.index')>())
    .istVerbindungsFehler,
  importiereGesetze: importieren,
  istImportindexSuchbestandAktuell: () => true,
  istImportindexSuchbestandVollstaendig: () => true,
  sucheKandidatenAlleQuellen: indexLaden,
}));
vi.mock('@/components/overlays/OverlayRahmen', () => ({
  OVERLAY_BREITE_GROSS: 600,
  OverlayRahmen: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/overlays/suche/SuchleisteKopf', () => ({
  SuchleisteKopf: ({ onChange, value }: { onChange: (s: string) => void; value: string }) => {
    eingabe.aendern = onChange;
    return <span>{value}</span>;
  },
}));
vi.mock('@/components/overlays/suche/OeffnenTrefferZeile', () => ({
  TrefferZeile: ({
    treffer,
    onClick,
  }: {
    treffer: {
      art: string;
      gesetzesreferenz?: { kurztitel: string };
      eintrag?: { kurztitel: string };
    };
    onClick: () => void;
  }) => (
    <button onClick={onClick}>
      {treffer.gesetzesreferenz?.kurztitel ?? treffer.eintrag?.kurztitel}
    </button>
  ),
}));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));

let root: Root;
beforeEach(() => {
  vi.resetAllMocks();
  indexLaden.mockResolvedValue({
    'de-bund': [
      { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'bgb.xml' },
    ],
    'de-bw': [],
    eu: [],
  });
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  nativeAttrappeZuruecksetzen();
  setzeSuchverzeichnisTestdaten([]);
  root = createRoot(document.querySelector('main')!);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function taste(key: string, altKey = false, ctrlKey = false) {
  const event = new window.Event('keydown', { cancelable: true });
  Object.assign(event, { key, altKey, metaKey: false, ctrlKey });
  await act(async () => {
    window.dispatchEvent(event);
  });
  return event;
}
it.each(['Erfolg', 'Fehlerergebnis', 'Ausnahme'])(
  'erhält den Importabschluss %s ohne Schließen durch Alt+Leertaste',
  async (abschluss) => {
    indexLaden.mockResolvedValueOnce({
      'de-bund': [
        { kurztitel: 'BGB § 9999', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'bgb.xml' },
      ],
      'de-bw': [],
      eu: [],
    });
    let fertig!: () => void;
    importieren.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          fertig = () => {
            if (abschluss === 'Ausnahme') reject(new Error('§ 9999 fehlt'));
            else
              resolve({
                erfolgreiche:
                  abschluss === 'Erfolg' ? [gesetzesreferenz({ kurztitel: 'BGB' })] : [],
                fehlgeschlagene: [{ fehler: { meldung: '§ 9999 fehlt' } }],
              });
          };
        }),
    );
    const schliessen = vi.fn();
    const oeffnen = vi.fn();
    await act(async () =>
      root.render(
        <OeffnenOverlay
          gesetze={[]}
          aktivesGesetz={null}
          initialInput="BGB"
          onSchliessen={schliessen}
          onGesetzOeffnen={oeffnen}
          onNeuenTabOeffnen={vi.fn()}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], oeffnen, vi.fn())}
        />,
      ),
    );
    await taste('Enter');
    expect(importieren).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('„BGB §\u00a09999" wird importiert …');
    await taste(' ', true);
    await taste('\u00a0', true);
    expect(schliessen).not.toHaveBeenCalled();
    await act(async () => {
      fertig();
    });
    expect(oeffnen).toHaveBeenCalledTimes(abschluss === 'Erfolg' ? 1 : 0);
    if (abschluss !== 'Erfolg') expect(document.body.textContent).toContain('§\u00a09999 fehlt');
    schliessen.mockClear();
    await taste(' ', true);
    await taste('\u00a0', true);
    expect(schliessen).not.toHaveBeenCalled();
  },
);
it('behandelt Alt+Leertaste auch vor einem Import nicht mehr', async () => {
  const schliessen = vi.fn();
  await act(async () =>
    root.render(
      <OeffnenOverlay
        gesetze={[]}
        aktivesGesetz={null}
        onSchliessen={schliessen}
        onGesetzOeffnen={vi.fn()}
        onNeuenTabOeffnen={vi.fn()}
        onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], vi.fn(), vi.fn())}
      />,
    ),
  );
  expect((await taste(' ', true)).defaultPrevented).toBe(false);
  expect((await taste('\u00a0', true)).defaultPrevented).toBe(false);
  expect(schliessen).not.toHaveBeenCalled();
});

import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';
const g = (kurztitel: string): GesetzDarstellung => ({
  kurztitel,
  langtitel: kurztitel,
  normgeber: 'de-bund',
  elemente: [],
  hatGliederungsartikel: false,
});
async function anzeigen(initialInput: string, gesetze = [g('EGStGB'), g('BGB')]) {
  setzeSuchverzeichnisTestdaten(gesetze);
  const oeffnen = vi.fn();
  await act(async () =>
    root.render(
      <OeffnenOverlay
        gesetze={gesetze}
        aktivesGesetz={null}
        initialInput={initialInput}
        onSchliessen={vi.fn()}
        onGesetzOeffnen={oeffnen}
        onNeuenTabOeffnen={vi.fn()}
        onInstalliertOeffnen={suchtrefferOeffnenFuerTest(gesetze, oeffnen, vi.fn())}
      />,
    ),
  );
  return oeffnen;
}
it('wartet auf exakten Indexvorschlag und importiert erst nach tatsächlicher Auswahl', async () => {
  let fertig!: (v: unknown) => void;
  indexLaden.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        fertig = resolve;
      }),
  );
  const oeffnen = await anzeigen('StGB');
  await taste('Enter');
  expect(oeffnen).not.toHaveBeenCalled();
  importieren.mockResolvedValue({ erfolgreiche: [g('StGB')], fehlgeschlagene: [] });
  await act(async () =>
    fertig({
      'de-bund': [{ kurztitel: 'StGB', langtitel: 'Strafgesetzbuch', abrufkennung: 'stgb.xml' }],
      eu: [],
      'de-bw': [],
    }),
  );
  expect([...document.querySelectorAll('button')].map((b) => b.textContent)).toEqual([
    'StGB',
    'EGStGB',
  ]);
  await taste('Enter');
  expect(importieren).toHaveBeenCalledWith(
    [{ kurztitel: 'StGB', abrufkennung: 'stgb.xml' }],
    'de-bund',
    undefined,
    expect.any(Function),
  );
  expect(oeffnen).toHaveBeenCalledWith(g('StGB'), undefined);
});
it('behält aktuelle Eingabe und Auswahl, wenn alte Indexprüfung erst später endet', async () => {
  let fertig!: (v: unknown) => void;
  indexLaden.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        fertig = resolve;
      }),
  );
  const oeffnen = await anzeigen('StGB');
  await act(async () => eingabe.aendern(''));
  await taste('ArrowDown');
  await act(async () =>
    fertig({
      'de-bund': [{ kurztitel: 'StGB', langtitel: 'Strafgesetzbuch', abrufkennung: 'stgb.xml' }],
      eu: [],
      'de-bw': [],
    }),
  );
  await taste('Enter');
  expect(oeffnen).toHaveBeenCalledWith(g('BGB'), undefined);
  expect(indexLaden).toHaveBeenCalledOnce();
});
it('verwendet verzögerten Sitzungsindex bei Wechsel zu anderer Gesetzesangabe', async () => {
  let fertig!: (v: unknown) => void;
  indexLaden.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        fertig = resolve;
      }),
  );
  const oeffnen = await anzeigen('StGB', [g('EGStGB'), g('AEUV')]);
  await act(async () => eingabe.aendern('EUV'));
  importieren.mockResolvedValue({ erfolgreiche: [g('EUV')], fehlgeschlagene: [] });
  await act(async () =>
    fertig({
      'de-bund': [],
      eu: [{ kurztitel: 'EUV', langtitel: 'Vertrag', abrufkennung: 'euv.xml' }],
      'de-bw': [],
    }),
  );
  await taste('Enter');
  expect(importieren).toHaveBeenCalledWith(
    [{ kurztitel: 'EUV', abrufkennung: 'euv.xml' }],
    'eu',
    undefined,
    expect.any(Function),
  );
  expect(oeffnen).toHaveBeenCalledWith(g('EUV'), undefined);
});
it('fängt Indexablehnung ab und lässt installierte Treffer weiterhin auswählen', async () => {
  indexLaden.mockRejectedValueOnce(new Error('Index unlesbar'));
  const oeffnen = await anzeigen('StGB');
  await taste('Enter');
  expect(oeffnen).toHaveBeenCalledWith(g('EGStGB'), undefined);
});
it.each(['433', '433a', '229 3', 'e1', ''])(
  'lädt bei %s keine zusätzlichen Indizes',
  async (text) => {
    await anzeigen(text);
    expect(indexLaden).not.toHaveBeenCalled();
  },
);

it('wählt per Klick den angeklickten Treffer statt der vorher markierten Zeile', async () => {
  const oeffnen = await anzeigen('');
  await act(async () => document.querySelectorAll('button')[1]!.click());
  expect(oeffnen).toHaveBeenCalledWith(g('BGB'), undefined);
});
it('übernimmt verzögerten Index auch bei StrictMode-Neuanmeldung', async () => {
  let fertig!: (v: unknown) => void;
  indexLaden.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        fertig = resolve;
      }),
  );
  const oeffnen = vi.fn();
  await act(async () =>
    root.render(
      <StrictMode>
        <OeffnenOverlay
          gesetze={[g('EGStGB')]}
          aktivesGesetz={null}
          initialInput="StGB"
          onSchliessen={vi.fn()}
          onGesetzOeffnen={oeffnen}
          onNeuenTabOeffnen={vi.fn()}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest([g('EGStGB')], oeffnen, vi.fn())}
        />
      </StrictMode>,
    ),
  );
  importieren.mockResolvedValue({ erfolgreiche: [g('StGB')], fehlgeschlagene: [] });
  await act(async () =>
    fertig({
      'de-bund': [{ kurztitel: 'StGB', langtitel: 'Strafgesetzbuch', abrufkennung: 'stgb.xml' }],
      eu: [],
      'de-bw': [],
    }),
  );
  await taste('Enter');
  expect(indexLaden).toHaveBeenCalledOnce();
  expect(oeffnen).toHaveBeenCalledWith(g('StGB'), undefined);
});

it('zeigt OeffnenLinkmeldung und entfernt sie bei Änderung der vorbelegten Eingabe', async () => {
  await act(async () =>
    root.render(
      <OeffnenOverlay
        gesetze={[]}
        aktivesGesetz={null}
        initialInput="kein Ergebnis"
        initialMeldung="Öffnen-Link fehlgeschlagen"
        onSchliessen={vi.fn()}
        onGesetzOeffnen={vi.fn()}
        onNeuenTabOeffnen={vi.fn()}
        onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], vi.fn(), vi.fn())}
      />,
    ),
  );
  expect(document.body.textContent).toContain('Öffnen-Link fehlgeschlagen');
  await act(async () => eingabe.aendern('neu'));
  expect(document.body.textContent).not.toContain('Öffnen-Link fehlgeschlagen');
});

it.each(['X', ' x ', ' X '])(
  'öffnet exakt installiertes %s frisch und nach vorheriger Indexsuche per Enter',
  async (text) => {
    const installiert = g('X');
    const bw = { ...g('X'), normgeber: 'de-bw' };
    const eintraege = {
      'de-bund': [],
      eu: [],
      'de-bw': [{ kurztitel: 'X', langtitel: 'X', abrufkennung: 'x.xml' }],
    };
    indexLaden.mockResolvedValue(eintraege);
    importieren.mockResolvedValue({ erfolgreiche: [bw], fehlgeschlagene: [] });
    const oeffnen = await anzeigen(text, [installiert]);
    await taste('Enter');
    expect(oeffnen).toHaveBeenLastCalledWith(installiert, undefined);
    expect(indexLaden).toHaveBeenCalledOnce();
    expect(document.querySelectorAll('button')).toHaveLength(2);
    await act(async () => eingabe.aendern('andere Indexsuche'));
    expect(indexLaden).toHaveBeenCalledOnce();
    await act(async () => eingabe.aendern(text));
    await taste('Enter');
    expect(oeffnen).toHaveBeenCalledTimes(2);
    expect(oeffnen).toHaveBeenLastCalledWith(installiert, undefined);
    expect(importieren).not.toHaveBeenCalled();
    await act(async () => document.querySelectorAll('button')[1]!.click());
    expect(importieren).toHaveBeenCalledWith(
      [{ kurztitel: 'X', abrufkennung: 'x.xml' }],
      'de-bw',
      undefined,
      expect.any(Function),
    );
    expect(oeffnen).toHaveBeenLastCalledWith(bw, undefined);
  },
);

it.each(['verfügbar', 'verzögert'])(
  'Öffnen-Link und Overlay ohne aktives Gesetz wählen bei %s geladenem Index denselben ersten Treffer',
  async (art) => {
    const installiert = g('X');

    const eintraege = {
      'de-bund': [],
      eu: [],
      'de-bw': [{ kurztitel: 'X', langtitel: 'X', abrufkennung: 'x.xml' }],
    };
    let fertig!: () => void;
    const indexAbschluesse: (() => void)[] = [];
    let oeffnenLinkIndexGestartet!: () => void;
    const oeffnenLinkIndexStart = new Promise<void>((resolve) => {
      oeffnenLinkIndexGestartet = resolve;
    });
    indexLaden.mockImplementation(() =>
      art === 'verfügbar'
        ? Promise.resolve(eintraege)
        : new Promise((resolve) => {
            fertig = () => resolve(eintraege);
            indexAbschluesse.push(fertig);
            if (indexAbschluesse.length === 2) oeffnenLinkIndexGestartet();
          }),
    );
    const oeffnen = await anzeigen('andere Indexsuche', [installiert]);
    await act(async () => eingabe.aendern(' x '));
    if (art === 'verzögert') await act(async () => fertig());
    await taste('Enter');
    expect(oeffnen).toHaveBeenCalledWith(installiert, undefined);

    const linkOeffnen = vi.fn();
    const fehler = vi.fn();
    let ausfuehren!: ReturnType<typeof useOeffnenLinkNavigation>;
    function OeffnenLinkAnbindung() {
      const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
      ausfuehren = useOeffnenLinkNavigation({
        importindexVorbereitungRef,
        zeigeSuchfehler: fehler,
      });
      return null;
    }
    await act(async () => root.render(<OeffnenLinkAnbindung />));
    await act(async () => {
      const vorgang = ausfuehren(
        { type: 'oeffnen', suchtext: ' x ' },

        async () => true,
        linkOeffnen,
      );
      if (art === 'verzögert') {
        // Der Öffnen-Link prüft seinen eigenen Index auch bei exaktem Bestandstreffer.
        await oeffnenLinkIndexStart;
        indexAbschluesse[1]!();
      }
      await vorgang;
    });
    expect(linkOeffnen).toHaveBeenCalledWith({
      gesetzesreferenz: {
        kurztitel: oeffnen.mock.calls[0]![0].kurztitel,
        normgeber: oeffnen.mock.calls[0]![0].normgeber,
      },
      xmlId: undefined,
      nurInstalliert: true,
    });
    expect(fehler).not.toHaveBeenCalled();
    expect(importieren).not.toHaveBeenCalled();
    expect(indexLaden).toHaveBeenCalledTimes(2);
  },
);

it.each([false, true])('Enter ohne Treffer lässt Suche offen (neuer Tab: %s)', async (neuerTab) => {
  const schliessen = vi.fn();
  const oeffnen = vi.fn();
  const neuenTabOeffnen = vi.fn();
  const browserOeffnen = vi.fn();
  Object.assign(window, { open: browserOeffnen });
  await act(async () =>
    root.render(
      <OeffnenOverlay
        gesetze={[]}
        aktivesGesetz={null}
        initialInput="unauffindbares Gesetz"
        onSchliessen={schliessen}
        onGesetzOeffnen={oeffnen}
        onNeuenTabOeffnen={neuenTabOeffnen}
        onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], oeffnen, neuenTabOeffnen)}
      />,
    ),
  );
  await taste('Enter', false, neuerTab);
  expect(schliessen).not.toHaveBeenCalled();
  expect(oeffnen).not.toHaveBeenCalled();
  expect(neuenTabOeffnen).not.toHaveBeenCalled();
  expect(importieren).not.toHaveBeenCalled();
  expect(browserOeffnen).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Kein Treffer');
  expect(document.body.textContent).toContain('Ggf. App oder Importindex aktualisieren');
  expect(document.body.textContent).not.toContain('dejure');
});

it('springt nach dem Import bei zwei Zahlen zur ersten Norm des tatsächlichen Gesetzes', async () => {
  indexLaden.mockResolvedValue({
    'de-bund': [
      {
        kurztitel: 'StGB',
        langtitel: 'StGB',
        abrufkennung: 'stgb',
        praefixstruktur: 'gliederungsartikel',
      },
    ],
    'de-bw': [],
    eu: [],
  });
  const gesetz = {
    kurztitel: 'StGB',
    langtitel: 'StGB',
    normgeber: 'de-bund',
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'norm' as const,
        data: normaleNorm({ id: '10', xmlId: '10', bezeichnung: '§ 10', absaetze: [] }),
      },
    ],
  };
  importieren.mockImplementation(async () => erfolgreicherSuchTestImport(gesetz));
  const oeffnen = vi.fn();
  await act(async () =>
    root.render(
      <OeffnenOverlay
        gesetze={[]}
        aktivesGesetz={null}
        initialInput="10 5 StGB"
        onSchliessen={vi.fn()}
        onGesetzOeffnen={oeffnen}
        onNeuenTabOeffnen={vi.fn()}
        onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], oeffnen, vi.fn())}
      />,
    ),
  );
  await act(async () => document.querySelector('button')!.click());
  expect(oeffnen).toHaveBeenCalledWith(gesetz, '10');
});

it('importiert den längsten exakten Zahlbeginn-Titel und öffnet dessen Norm 1', async () => {
  const gesetz: GesetzDarstellung = {
    ...g('2. PKHB 2012'),
    elemente: [
      {
        typ: 'norm',
        data: normaleNorm({ id: '1', xmlId: 'ziel-1', bezeichnung: '§ 1', absaetze: [] }),
      },
    ],
  };
  indexLaden.mockResolvedValue({
    'de-bund': [
      { kurztitel: 'PKHB 2012', langtitel: '', abrufkennung: 'falsch' },
      { kurztitel: gesetz.kurztitel, langtitel: '', abrufkennung: 'richtig' },
    ],
    'de-bw': [],
    eu: [],
  });
  importieren.mockImplementation(async () => erfolgreicherSuchTestImport(gesetz));
  const oeffnen = await anzeigen('1 2. PKHB 2012', []);
  expect(document.querySelector('button')?.textContent).toBe('2. PKHB 2012');
  await taste('Enter');
  expect(importieren).toHaveBeenCalledWith(
    [{ kurztitel: gesetz.kurztitel, abrufkennung: 'richtig' }],
    'de-bund',
    undefined,
    expect.any(Function),
  );
  expect(oeffnen).toHaveBeenCalledWith(gesetz, 'ziel-1');
});

it('hält namensgleiche Treffer mit verschiedenem und fehlendem Normgeber getrennt', async () => {
  indexLaden.mockResolvedValue({ 'de-bund': [], 'de-bw': [], eu: [] });
  const gesetze = ['de-bund', 'de-bw', 'unbekannt'].map((normgeber) => ({
    ...g('TestG'),
    normgeber,
  }));
  const oeffnen = await anzeigen('testg', gesetze);
  expect(document.querySelectorAll('button')).toHaveLength(3);
  for (let i = 0; i < gesetze.length; i++) {
    await act(async () => document.querySelectorAll('button')[i]!.click());
    expect(oeffnen).toHaveBeenLastCalledWith(gesetze[i], undefined);
  }
  expect(console.error).not.toHaveBeenCalled();
});

function bereiteZahlentitelImportVor() {
  const gesetz: GesetzDarstellung = {
    ...g('2004/38/EG'),
    normgeber: 'eu',
    elemente: [
      {
        typ: 'norm',
        data: normaleNorm({ id: '6', xmlId: 'artikel-6', bezeichnung: 'Art. 6', absaetze: [] }),
      },
    ],
  };
  indexLaden.mockResolvedValue({
    'de-bund': [],
    'de-bw': [],
    eu: [{ kurztitel: gesetz.kurztitel, langtitel: '', abrufkennung: '32004L0038' }],
  });
  importieren.mockImplementation(async () => erfolgreicherSuchTestImport(gesetz));
  return gesetz;
}

it.each(['2004/38/EG', '6 2004/38/EG'])(
  'lädt in frischer Sitzung den Zahlentitel bei %s und öffnet das Importziel',
  async (suchtext) => {
    const gesetz = bereiteZahlentitelImportVor();
    const oeffnen = await anzeigen(suchtext, []);
    expect(indexLaden).toHaveBeenCalledOnce();
    expect(document.querySelector('button')?.textContent).toBe(gesetz.kurztitel);
    await taste('Enter');
    expect(importieren).toHaveBeenCalledWith(
      [{ kurztitel: gesetz.kurztitel, abrufkennung: '32004L0038' }],
      'eu',
      undefined,
      expect.any(Function),
    );
    expect(oeffnen).toHaveBeenCalledWith(
      gesetz,
      suchtext.startsWith('6 ') ? 'artikel-6' : undefined,
    );
  },
);

it('lädt auch beim frischen Öffnen-Link den Zahlentitel und öffnet Artikel 6', async () => {
  const gesetz = bereiteZahlentitelImportVor();
  let ausfuehren!: ReturnType<typeof useOeffnenLinkNavigation>;
  function OeffnenLinkAnbindung() {
    const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
    ausfuehren = useOeffnenLinkNavigation({ importindexVorbereitungRef, zeigeSuchfehler: vi.fn() });
    return null;
  }
  await act(async () => root.render(<OeffnenLinkAnbindung />));
  const oeffnen = vi.fn();
  await act(async () => {
    await ausfuehren(
      { type: 'oeffnen', suchtext: '6 2004/38/EG' },

      async () => true,
      oeffnen,
    );
  });
  expect(indexLaden).toHaveBeenCalledOnce();
  expect(oeffnen).toHaveBeenCalledWith({ gesetz, xmlId: 'artikel-6' });
});

it('Öffnen-Link 1 LBO öffnet die Hauptnorm vor der vorherstehenden Anlage', async () => {
  const installiert = gesetzMitNormen(['Anlage 1', '§ 1'], {
    kurztitel: 'LBO',
    langtitel: 'LBO',
    kennung: (i) => `lbo-${i}`,
  });
  setzeSuchverzeichnisTestdaten([installiert]);
  indexLaden.mockResolvedValue({ 'de-bund': [], 'de-bw': [], eu: [] });
  let ausfuehren!: ReturnType<typeof useOeffnenLinkNavigation>;
  function Probe() {
    const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
    ausfuehren = useOeffnenLinkNavigation({ importindexVorbereitungRef, zeigeSuchfehler: vi.fn() });
    return null;
  }
  await act(async () => root.render(<Probe />));
  const oeffnen = vi.fn();
  await act(async () => {
    await ausfuehren({ type: 'oeffnen', suchtext: '1 LBO' }, async () => true, oeffnen);
  });
  expect(oeffnen).toHaveBeenCalledWith(expect.objectContaining({ xmlId: 'lbo-1' }));
});
