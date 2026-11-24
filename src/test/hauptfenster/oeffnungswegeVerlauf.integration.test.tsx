import { getSnapshot } from '@/lib/banner/banner.index';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// @vitest-environment jsdom
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
// Öffnungsziele schreiben standardmäßig; Einführung und Ausnahmen nutzen denselben Ablauf.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { useTiefenLinks } from '@/hooks/useTiefenLinks';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useEinfuehrungsAblauf } from '@/hooks/einfuehrung/useEinfuehrungsAblauf';
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { appOverlayHostFixture } from '@/test/hauptfenster/appOverlayHostFixture';
import { speichereAktivierung } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';
import { behandleGesetzeskurzbefehl } from '@/hooks/eingabe/useTastenkuerzel.helpers';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { AktivesOverlay } from '@/lib/domain/appTypes';
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { leseGesetz } from '@/lib/persistenz/gesetz/gesetz.index';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { VerlaufOverlay } from '@/components/overlays/overlays.index';

let lesesperren: (() => void)[] = [];
let aktivesOverlay: AktivesOverlay | null = null;
let zeichne: () => Promise<void>;
const gesetz: GesetzDarstellung = {
  kurztitel: 'TestG',
  normgeber: 'de-bund',
  langtitel: '',
  hatGliederungsartikel: false,
  elemente: [
    {
      typ: 'ueberschrift',
      data: {
        id: 'u',
        xmlId: 'ueberschrift:001',
        gliederungskennzahl: '001',
        ebene: 1,
        bezeichnung: 'Teil 1',
        titel: 'Allgemeines',
      },
    },
    { typ: 'norm', data: normaleNorm({ id: 'n', xmlId: 'n1', bezeichnung: '§ 1' }) },
    {
      typ: 'norm',
      data: normaleNorm({ id: 'm', xmlId: 'n2', bezeichnung: '§ 2', titel: 'Suchziel' }),
    },
  ],
};
let root: Root;
let tabs: ReturnType<typeof useAppTabs>;
let navigation: ReturnType<typeof useGesetzOeffnen>;
let links: ReturnType<typeof useTiefenLinks>;
let einfuehrung: ReturnType<typeof useEinfuehrungsAblauf>;
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  lesesperren = [];
  setzeSuchverzeichnisTestdaten([gesetz]);
  // Suchverzeichnis und Gesetzesdatei sind getrennte native Eingaben.
  // Der Fensterbestand wird nach dem Mount ausdrücklich über seinen Einzelzugriff geladen.
  io.dateien.set(
    'gesetze/TestG_de-bund.xml',
    '<gesetz><infos><kurztitel>TestG</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><gliederung gliederungskennzahl="001"><bezeichnung>Teil 1</bezeichnung><titel>Allgemeines</titel></gliederung><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>Erster Inhalt</absatz></text></norm><norm id="n2"><bezeichnung>§ 2</bezeichnung><titel>Suchziel</titel><text><absatz>Zweiter Inhalt</absatz></text></norm></inhalt></gesetz>',
  );
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Element.prototype.scrollIntoView = () => {};
  localStorage.clear();
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  aktivesOverlay = null;
  function Probe({ aktivesOverlay }: { aktivesOverlay: AktivesOverlay | null }) {
    tabs = useAppTabs();
    navigation = useGesetzOeffnen(gesetzOeffnenFixture(tabs));
    links = useTiefenLinks({
      gesetze: [gesetz],
      elementOeffnen: navigation.elementOeffnen,
      gesetzesreferenzOeffnen: navigation.gesetzesreferenzOeffnen,
    });
    const speicher = useLesezeichenUndFavoriten(tabs);
    einfuehrung = useEinfuehrungsAblauf({
      holeTabGesetz: tabs.holeTabGesetz,
      tabsRef: tabs.tabsRef,
      aktiverTabIdRef: tabs.aktiverTabIdRef,
      einklappZustandRef: tabs.einklappZustandRef,
      favoritenStatus: { istAktuellFavorit: false, favoritenleisteSichtbar: false },
      tabZustand: undefined,
      aktivesOverlay,
      handleFavoritSpeichern: speicher.handleFavoritSpeichern,
      handleLesezeichenSpeichern: speicher.handleLesezeichenSpeichern,
      elementOeffnen: navigation.elementOeffnen,
      leistenTauschen: false,
      minimalistischerModus: false,
    });
    return (
      <AppOverlayHost
        {...appOverlayHostFixture({
          aktivesOverlay,
          ladeGesetz: tabs.ladeGesetz,
          suchverzeichnisWirdVorbereitet: false,
          gesetze: [gesetz],
          aktiverTab: tabs.tabs.find((t) => t.id === tabs.aktiverTabId) ?? null,
          elementOeffnen: navigation.elementOeffnen,
          gesetzesreferenzOeffnen: navigation.gesetzesreferenzOeffnen,
          verlaufNavigieren: tabs.verlaufNavigieren,
          verlauf: tabs.aktiverTabId ? tabs.verlaufLesen(tabs.aktiverTabId) : undefined,
        })}
      />
    );
  }
  zeichne = async () => {
    await act(async () => root.render(<Probe aktivesOverlay={aktivesOverlay} />));
  };
  await zeichne();
  // Der öffentliche Lader wartet auch auf beide Bestandslistener. Kein Rendern
  // schreibt Testdaten in den Bestand oder entwertet einen laufenden Dateizugriff.
  await act(async () => {
    expect((await tabs.ladeGesetz(gesetz)).status).toBe('geladen');
  });
});
afterEach(async () => {
  // Auch bei einer fehlgeschlagenen Assertion bleiben keine nativen Lesungen
  // oder Öffnungsaufträge für den nächsten Test zurück.
  io.vorLesen = () => undefined;
  await act(async () => {
    for (const freigeben of lesesperren) freigeben();
    await tabs.ladeGesetz(gesetz);
  });
  await warteAufOeffnungsabschluss();
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
function aktiverTabId() {
  const id = tabs.aktiverTabId;
  assert(id);
  return id;
}
async function warteAufOeffnungsabschluss() {
  await vi.waitFor(async () => {
    await act(async () => {});
    // Laufende Öffnungen zeigen ein Ladebanner; ihr Abschluss schließt es.
    expect(getSnapshot().some((banner) => banner.laedt)).toBe(false);
  });
}
async function eingeben(text: string) {
  const input = document.querySelector('input');
  assert(input);
  await act(async () => {
    const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    assert(setzen);
    setzen.call(input, text);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
async function taste(key: string, ctrlKey = false) {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true }));
  });
  await warteAufOeffnungsabschluss();
}
async function suchziel(xmlId: string, neuerTab = false) {
  await eingeben((xmlId === 'n1' ? '1' : '2') + ' TestG');
  await taste('Enter', neuerTab);
}
async function verlaufZeile(xmlId: string) {
  const text = xmlId === 'n1' ? '§ 1 TestG' : '§ 2 TestG';
  const findeZeile = () =>
    [...document.querySelectorAll('div')]
      .filter(
        (el) =>
          el.textContent?.replaceAll('\u00a0', ' ') ===
            (xmlId === 'n2' ? text + ': Suchziel' : text) && el.querySelector('svg'),
      )
      .at(-1);
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(findeZeile(), text + ':' + document.body.textContent).toBeDefined();
  });
  const zeile = findeZeile();
  assert(zeile);
  return zeile;
}
async function verlaufZiel(xmlId: string, neuerTab = false, abschlussAbwarten = true) {
  const zeile = await verlaufZeile(xmlId);
  await act(async () =>
    zeile.dispatchEvent(
      new MouseEvent(neuerTab ? 'mousedown' : 'dblclick', { bubbles: true, ctrlKey: neuerTab }),
    ),
  );
  if (abschlussAbwarten) await warteAufOeffnungsabschluss();
}
async function uebersichtOeffnen() {
  await taste('ArrowDown');
  await taste('Enter');
}
function eintraege() {
  return tabs.verlaufLesen(aktiverTabId())?.eintraege.map((e) => e.xmlId) ?? [];
}
it.each(['aktiver-tab', 'immer-neu'] as const)(
  'trägt ausdrückliche Suchziele ohne Zusatzflag ein (%s)',
  async (modus) => {
    await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'n2', modus }));
    await warteAufOeffnungsabschluss();
    expect(eintraege()).toEqual(['n2']);
  },
);
it('trägt das Lesezeichenziel nach erfolgreicher Prüfung ein', async () => {
  await act(async () => navigation.handleLesezeichenOeffnen('§ 2', gesetz));
  await warteAufOeffnungsabschluss();
  expect(eintraege()).toEqual(['n2']);
});
it.each(['n2', undefined])('führt die Einführung regulär zum Ziel %s', async (xmlId) => {
  aktivesOverlay = 'oeffnen';
  // Der echte Ablauf erreicht Teilaktion 1 über das Öffnen der Suche.
  await act(async () => einfuehrung.einfuehrungNeuStarten());
  await zeichne();
  await act(async () => einfuehrung.elementOeffnenFuerSuche({ gesetz, xmlId }));
  expect(einfuehrung.einfuehrungTeilaktion).toBe(1);
  expect(eintraege()).toEqual([xmlId ?? 'n1']);
});
it('öffnet bei unbekanntem Normziel das Gesetz am Startelement ohne fiktiven Zieleintrag', async () => {
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'fehlt' }));
  expect(eintraege()).toEqual(['ueberschrift:001']);
  await act(async () => navigation.elementOeffnen({ gesetz }));
  expect(eintraege()).toEqual(['ueberschrift:001']);
});

it.each(['oeffnen', 'volltextSuche', 'volltextAlle'] as const)(
  'trägt ein Ziel aus dem tatsächlichen Overlay-Host ein: %s',
  async (art) => {
    await act(async () => navigation.elementOeffnen({ gesetz }));
    aktivesOverlay = art;
    await zeichne();
    if (art === 'oeffnen') await suchziel('n2');
    else {
      await eingeben('Suchziel');
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(document.querySelector('[data-idx="0"]')).not.toBeNull();
      });
      await taste('Enter');
    }
    expect(eintraege()).toEqual(['n2', 'ueberschrift:001']);
  },
);
it('trägt das Öffnen über das Overlay im neuen Tab ein', async () => {
  aktivesOverlay = 'oeffnen';
  await zeichne();
  await suchziel('n2', true);
  await warteAufOeffnungsabschluss();
  expect(eintraege()).toEqual(['n2']);
});
it('erhält den Verlauf bei Overlay-Auswahl im aktuellen Tab und schreibt im neuen Tab', async () => {
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'n1' }));
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'n2' }));
  const vorher = structuredClone(tabs.verlaufLesen(aktiverTabId()));
  aktivesOverlay = 'verlauf';
  await zeichne();
  await verlaufZiel('n1');
  await act(async () =>
    tabs.verlaufAktivierung(
      aktiverTabId(),
      { gesetzesreferenz: gesetz, xmlId: 'n1' },
      'vorgegeben',
    ),
  );
  expect(tabs.verlaufLesen(aktiverTabId())).toEqual({
    ...vorher,
    position: 1,
    aktivesElement: {
      gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
      xmlId: 'n1',
    },
  });
  await verlaufZiel('n1', true);
  expect(eintraege()).toEqual(['n1']);
});

it('trägt beim Verweisklick die Ausgangsnorm statt einer anderen aktiven Norm ein', async () => {
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'n2' }));
  await act(async () =>
    tabs.verlaufSetzen(aktiverTabId(), {
      eintraege: [],
      position: 0,
      aktivesElement: { gesetzesreferenz: gesetz, xmlId: 'ueberschrift:001' },
    }),
  );
  await act(async () =>
    navigation.handleVerweisKlick(
      'n1',
      {
        typ: 'getaggterVerweis',
        zielBezeichnung: '§ 2',
      },
      false,
    ),
  );
  expect(eintraege()).toEqual(['n2', 'n1']);
});
it('schreibt auch die Ausgangsnorm bei fehlgeschlagener Verweiszielprüfung nicht', async () => {
  await act(async () => navigation.elementOeffnen({ gesetz }));
  await act(async () =>
    navigation.handleVerweisKlick(
      'n1',
      {
        typ: 'getaggterVerweis',
        zielBezeichnung: '§ 99',
      },
      false,
    ),
  );
  expect(eintraege()).toEqual(['ueberschrift:001']);
});
it('wechselt ohne Ziel in einen vorhandenen Tab ohne Eintrag', async () => {
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'n2' }));
  const id = aktiverTabId();
  const vorher = structuredClone(tabs.verlaufLesen(id));
  await act(async () => tabs.erstelleLeerenTab());
  await act(async () => navigation.elementOeffnen({ gesetz }));
  expect(tabs.aktiverTabId).toBe(id);
  expect(tabs.verlaufLesen(id)).toEqual(vorher);
});
it('trägt beim Ganzgesetzverweis ohne Ziel auf den vorhandenen Tab nichts ein', async () => {
  await act(async () => navigation.elementOeffnen({ gesetz }));
  await act(async () =>
    navigation.handleVerweisKlick(
      'n1',
      {
        typ: 'ganzesGesetz',
        gesetz,
        verweistextZeichenbereich: [0, 5],
      },
      false,
    ),
  );
  expect(eintraege()).toEqual(['ueberschrift:001']);
});

it('trägt das Tiefenlinkziel nach erfolgreicher Öffnung ein', async () => {
  await act(async () =>
    links.oeffneTiefenLinkZiel(
      {
        kurztitel: 'TestG',
        normgeber: 'de-bund',
        bezeichnung: '§ 2',
      },
      [gesetz],
    ),
  );
  await warteAufOeffnungsabschluss();
  expect(eintraege()).toEqual(['n2']);
});

it.each(['gesetzesuebersicht', 'kurzbefehl'] as const)(
  'trägt das Startelement über %s ein',
  async (weg) => {
    if (weg === 'gesetzesuebersicht') {
      aktivesOverlay = 'uebersicht';
      await zeichne();
      await uebersichtOeffnen();
    } else {
      await act(async () =>
        behandleGesetzeskurzbefehl(
          {
            key: '1',
            code: 'Digit1',
            altKey: false,
            ctrlKey: true,
            metaKey: false,
            shiftKey: true,
            preventDefault: vi.fn(),
          },
          {
            current: {
              [gesetzesreferenzSchluessel(gesetz)]: {
                taste: '1',
                ctrl: true,
                meta: false,
                shift: true,
                alt: false,
              },
            },
          },
          { current: alsSuchverzeichniseintraege([gesetz]) },
          { current: navigation.gesetzesreferenzOeffnen },
        ),
      );
    }
    await warteAufOeffnungsabschluss();
    expect(eintraege()).toEqual(['ueberschrift:001']);
  },
);

it.each(['erstes', 'gespeicherte-norm', 'gespeicherte-ueberschrift', 'ausdruecklich'] as const)(
  'bestimmt beim erstmaligen Zeigen genau das Startelement: %s',
  async (art) => {
    const g = structuredClone(gesetz);
    const kopf = g.elemente.shift();
    assert(kopf);
    g.elemente.push(kopf);
    if (art === 'gespeicherte-norm') {
      const gespeichert = g.elemente[1];
      assert(gespeichert);
      speichereAktivierung(g, gespeichert);
    }
    if (art === 'gespeicherte-ueberschrift') speichereAktivierung(g, kopf);
    await act(async () =>
      navigation.elementOeffnen({
        gesetz: g,
        modus: 'aktiver-tab',
        xmlId: art === 'ausdruecklich' ? 'n2' : undefined,
      }),
    );
    expect(eintraege()).toEqual([
      art === 'gespeicherte-ueberschrift' ? 'ueberschrift:001' : art === 'erstes' ? 'n1' : 'n2',
    ]);
    const erstes = aktiverTabId();
    await act(async () =>
      navigation.elementOeffnen({
        gesetz: g,
        modus: 'immer-neu',
        xmlId: art === 'ausdruecklich' ? 'n2' : undefined,
      }),
    );
    expect(aktiverTabId()).not.toBe(erstes);
    expect(eintraege()).toHaveLength(1);
  },
);

it('öffnet die Overlay-Auswahl im aktuellen Tab trotz eines anderen Tabs desselben Gesetzes', async () => {
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'n1' }));
  const anderer = aktiverTabId();
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'n2', modus: 'immer-neu' }));
  const quelle = aktiverTabId();
  await act(async () =>
    navigation.elementOeffnen({ gesetz, xmlId: 'n1', modus: 'immer-aktiver-tab' }),
  );
  const quellVerlauf = tabs.verlaufLesen(quelle);
  assert(quellVerlauf);
  const liste = quellVerlauf.eintraege;
  aktivesOverlay = 'verlauf';
  await zeichne();
  await verlaufZiel('n2');
  await act(async () =>
    tabs.verlaufAktivierung(quelle, { gesetzesreferenz: gesetz, xmlId: 'n2' }, 'vorgegeben'),
  );
  expect(aktiverTabId()).toBe(quelle);
  expect(tabs.verlaufLesen(quelle)?.position).toBe(1);
  expect(tabs.verlaufLesen(quelle)?.eintraege).toBe(liste);
  expect(tabs.tabs.find((t) => t.id === anderer)?.initialNorm).toBe('n1');
  const vorher = structuredClone(tabs.verlaufLesen(quelle));
  await verlaufZiel('n1', true);
  expect(aktiverTabId()).not.toBe(quelle);
  expect(eintraege()).toEqual(['n1']);
  expect(tabs.verlaufLesen(quelle)).toEqual(vorher);
});

it('liest die native Gesetzesdatei mit den erwarteten Verlaufszielen', async () => {
  const gelesen = await leseGesetz(gesetz);
  expect(gelesen.status, JSON.stringify(gelesen)).toBe('geladen');
  if (gelesen.status === 'geladen')
    expect(gelesen.gesetz.elemente.map((element) => element.data.xmlId)).toEqual([
      'ueberschrift:001',
      'n1',
      'n2',
    ]);
});

it('zeigt den Verlauf nach einem erst nach dem Rendern abgeschlossenen Dateizugriff', async () => {
  // Eigener kalter Bestand: weder die warme Probe noch Ereignisse können
  // den Beginn des nativen Lesens umgehen.
  const bestand = erzeugeGeladeneGesetze();
  let gelesen!: () => void;
  let lesenBegonnen!: () => void;
  const begonnen = new Promise<void>((resolve) => {
    lesenBegonnen = resolve;
  });
  const warten = new Promise<void>((resolve) => {
    gelesen = resolve;
    lesesperren.push(resolve);
  });
  io.vorLesen = (pfad) => {
    if (!pfad.endsWith('/gesetze/TestG_de-bund.xml')) return;
    lesenBegonnen();
    return warten;
  };
  try {
    await bestand.bereit;
    await act(async () =>
      root.render(
        <VerlaufOverlay
          textDarstellung={{
            schriftgroesse: 19,
            silbentrennung: true,
            schriftart: 'serif',
            zeilenabstand: 1.5,
            blocksatz: false,
            satzNeuZeile: true,
          }}
          verlauf={{ eintraege: [{ gesetzesreferenz: gesetz, xmlId: 'n2' }], position: 0 }}
          ladeGesetz={bestand.ladeGesetz}
          onSchliessen={() => {}}
          onOeffnen={() => {}}
          onNeuenTabOeffnen={() => {}}
        />,
      ),
    );
    await begonnen;
    expect(document.body.textContent).toContain('Eintrag nicht verfügbar');
    await act(async () => {
      gelesen();
      expect((await bestand.ladeGesetz(gesetz)).status).toBe('geladen');
    });
    await verlaufZeile('n2');
  } finally {
    gelesen();
    await bestand.ladeGesetz(gesetz);
    bestand.beenden();
  }
});

it('bestätigt die verzögerte Overlay-Auswahl mit Rückkehrmarke erst bei gültigem Öffnungsabschluss', async () => {
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'n1' }));
  const id = aktiverTabId();
  const vorher = {
    eintraege: ['n2', 'n1', 'ueberschrift:001'].map((xmlId) => ({
      gesetzesreferenz: gesetz,
      xmlId,
    })),
    position: 1,
    aktivesElement: { gesetzesreferenz: gesetz, xmlId: 'ueberschrift:001' },
  };
  await act(async () => tabs.verlaufSetzen(id, vorher));
  aktivesOverlay = 'verlauf';
  await zeichne();
  await verlaufZeile('n2');
  // Die Zeilen sind bereits aufgelöst. Erst die anschließende echte
  // Bestandsauffrischung und damit der Öffnungsabschluss bleiben am Dateisystem stehen.
  let fertig!: () => void;
  let lesenBegonnen!: () => void;
  const begonnen = new Promise<void>((resolve) => {
    lesenBegonnen = resolve;
  });
  const warten = new Promise<void>((resolve) => {
    fertig = resolve;
    lesesperren.push(resolve);
  });
  io.vorLesen = (pfad) => {
    if (!pfad.endsWith('/gesetze/TestG_de-bund.xml')) return;
    lesenBegonnen();
    return warten;
  };
  await act(async () => io.emitTo('main', 'gesetze-geaendert', [gesetz]));
  await begonnen;
  await verlaufZiel('n2', false, false);
  expect(tabs.verlaufLesen(id)).toBe(vorher);
  await act(async () => {
    fertig();
    expect((await tabs.ladeGesetz(gesetz)).status).toBe('geladen');
  });
  await warteAufOeffnungsabschluss();
  expect(tabs.verlaufLesen(id)).toBe(vorher);
  await act(async () =>
    tabs.verlaufAktivierung(id, { gesetzesreferenz: gesetz, xmlId: 'n2' }, 'vorgegeben'),
  );
  expect(tabs.verlaufLesen(id)).toEqual({
    ...vorher,
    position: 0,
    aktivesElement: {
      gesetzesreferenz: { normgeber: gesetz.normgeber, kurztitel: gesetz.kurztitel },
      xmlId: 'n2',
    },
    rueckkehrmarke: { eintrag: vorher.aktivesElement, position: 0 },
  });
  expect(tabs.verlaufLesen(id)?.eintraege).toBe(vorher.eintraege);
});

it.each(['uebersicht', 'kurzbefehl'] as const)(
  'bewahrt beim Wechsel ohne Ziel über %s die eigene Stelle und Scrollposition des gewählten Tabs',
  async (weg) => {
    const schluessel = gesetzesreferenzSchluessel(gesetz);
    await act(async () => {
      tabs.setTabs([
        tabFuerTest({ id: 'eins', gesetz }, tabs),
        tabFuerTest({ id: 'zwei', gesetz }, tabs),
      ]);
      tabs.setAktiverTabId('zwei');
      for (const [index, id] of ['eins', 'zwei'].entries()) {
        tabs.einklappZustandRef.current[id + '-' + schluessel] = {
          aktivesElementId: index ? 'm' : 'n',
          normen: new Set(),
          ueberschriften: new Set(['u']),
        };
        tabs.scrollPositionenRef.current[id + '-' + schluessel] = {
          index: index + 1,
          offset: 20 + index,
        };
        tabs.verlaufSetzen(id, {
          eintraege: [{ gesetzesreferenz: gesetz, xmlId: index ? 'n2' : 'n1' }],
          position: 0,
        });
      }
      const gespeichert = gesetz.elemente[0];
      assert(gespeichert);
      speichereAktivierung(gesetz, gespeichert);
    });
    const ansichten = { ...tabs.einklappZustandRef.current };
    const positionen = { ...tabs.scrollPositionenRef.current };
    const verlaeufe = ['eins', 'zwei'].map((id) => tabs.verlaufLesen(id));
    if (weg === 'uebersicht') {
      aktivesOverlay = 'uebersicht';
      await zeichne();
      await uebersichtOeffnen();
    } else {
      await act(async () =>
        behandleGesetzeskurzbefehl(
          {
            key: '1',
            code: 'Digit1',
            ctrlKey: true,
            metaKey: false,
            altKey: false,
            shiftKey: true,
            preventDefault: vi.fn(),
          },
          {
            current: {
              [schluessel]: { taste: '1', ctrl: true, meta: false, alt: false, shift: true },
            },
          },
          { current: alsSuchverzeichniseintraege([gesetz]) },
          { current: navigation.gesetzesreferenzOeffnen },
        ),
      );
    }
    await warteAufOeffnungsabschluss();
    expect(aktiverTabId()).toBe(weg === 'uebersicht' ? 'eins' : 'zwei');
    expect(tabs.tabs.map((tab) => tab.initialNorm)).toEqual([undefined, undefined]);
    expect(tabs.einklappZustandRef.current).toEqual(ansichten);
    expect(tabs.scrollPositionenRef.current).toEqual(positionen);
    expect(['eins', 'zwei'].map((id) => tabs.verlaufLesen(id))).toEqual(verlaeufe);
  },
);
