// @vitest-environment jsdom
// Öffnen verwendet den echten Einzelzugriff; die Dateigrenze hält das Laden an.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useLayoutEffect, useState } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { HauptansichtFixture } from '@/test/hauptfenster/HauptansichtFixture';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { useTiefenLinks } from '@/hooks/useTiefenLinks';
import { useAppAktionen } from '@/hooks/useAppAktionen';
import { useInterneNavigation } from '@/hooks/fenster/useInterneNavigation';
import { geschlossenenTabPushen } from '@/lib/persistenz/fenster/fenster.index';
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { appOverlayHostFixture } from '@/test/hauptfenster/appOverlayHostFixture';
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { speichereAktivierung } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';
import { getSnapshot, alleBannerSchliessen } from '@/lib/banner/banner.index';
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/hauptfenster/scrollNachfuehrungMessung'))
    .scrollVirtualizerMessung,
}));
const dom = domTestWurzel();
function vorhanden<T>(wert: T | null | undefined): T {
  assert(wert !== null && wert !== undefined);
  return wert;
}
const nichts = () => {};
let intern: {
  kennung: number;
  auftrag: {
    gesetz: typeof referenz;
    ziel:
      { type: 'norm'; bezeichnung: string } | { type: 'ueberschrift'; gliederungskennzahl: string };
  };
  neuesFenster: boolean;
} | null = null;
let aktionen: ReturnType<typeof useAppAktionen>;
const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
let tabs: ReturnType<typeof useAppTabs>;
let navigation: ReturnType<typeof useGesetzOeffnen>;
function Probe() {
  const t = useAppTabs();
  const n = useGesetzOeffnen(gesetzOeffnenFixture(t));
  const [suche, setSuche] = useState(false);
  const lesezeichen = useLesezeichenUndFavoriten(t);
  const a = useAppAktionen({
    uebersichtExportAktionRef: { current: null },
    ...t,
    ...n,
    fensterSchliessen: nichts,
    aktivesOverlay: null,
    setAktivesOverlay: nichts,
  });
  useTiefenLinks({
    gesetze: [],
    elementOeffnen: n.elementOeffnen,
    gesetzesreferenzOeffnen: n.gesetzesreferenzOeffnen,
  });
  useInterneNavigation({
    startAbgeschlossen: true,
    tabsRef: t.tabsRef,
    aktiverTabIdRef: t.aktiverTabIdRef,
    elementOeffnen: n.elementOeffnen,
    gesetzesreferenzOeffnen: n.gesetzesreferenzOeffnen,
  });
  useLayoutEffect(() => {
    tabs = t;
    navigation = n;
    aktionen = a;
  });
  return (
    <>
      <button onClick={() => setSuche(true)}>Suche</button>
      <output>
        {t.tabs
          .filter((tab) => tab.gesetzesreferenz)
          .map(
            (tab) =>
              `${vorhanden(tab.gesetzesreferenz).kurztitel}:${tab.ladezustand}:${tab.initialNorm ?? ''}`,
          )
          .join('|')}
      </output>
      <HauptansichtFixture
        tabsteuerung={t}
        lesezeichen={lesezeichen}
        setFavoritenStatus={nichts}
        navigation={n}
        verlaufSchrittUndOeffnen={a.verlaufSchrittUndOeffnen}
        verlaufAktivierung={t.verlaufAktivierung}
        verlaufBedienung={t.verlaufBedienung}
      />
      <AppOverlayHost
        {...appOverlayHostFixture({
          aktivesOverlay: suche ? 'oeffnen' : null,
          elementOeffnen: n.elementOeffnen,
          gesetzesreferenzOeffnen: n.gesetzesreferenzOeffnen,
          onSchliessen: () => setSuche(false),
        })}
      />
    </>
  );
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  alleBannerSchliessen();
  Element.prototype.scrollIntoView = nichts;
  intern = null;
  const nativ = vorhanden(io.invoke.getMockImplementation());
  io.invoke.mockImplementation(async (name, args) => {
    if (name.startsWith('interne_navigation_')) {
      if (name === 'interne_navigation_lesen' || name === 'interne_navigation_bereit')
        return intern;
      if (name === 'interne_navigation_bestaetigen') intern = null;
      return;
    }
    return nativ(name, args);
  });
  localStorage.clear();
  io.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz version="1"><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  const gesetz = parseGesetzesXML(vorhanden(io.dateien.get('gesetze/BGB_de-bund.xml')));
  assert(gesetz);
  setzeSuchverzeichnisTestdaten([gesetz]);
  await act(async () => dom.root.render(<Probe />));
});
it.each(['suche', 'tiefenlink', 'verlauf', 'intern', 'wiederoeffnen'] as const)(
  'öffnet ein ungeladenes Gesetz per %s erst nach dem Laden, bis dahin nur mit Ladeanzeige',
  async (pfad) => {
    let freigeben = () => {};
    const warten = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    const gelesen: string[] = [];
    io.vorLesen = (pfad) => {
      gelesen.push(pfad);
      if (pfad.endsWith('/gesetze/BGB_de-bund.xml')) return warten;
    };
    try {
      await act(async () => {
        if (pfad === 'suche')
          vorhanden(
            Array.from(dom.host.querySelectorAll('button')).find(
              (button) => button.textContent === 'Suche',
            ),
          ).click();
        if (pfad === 'tiefenlink')
          for (const callback of io.listener.get('tiefenlink-oeffnen') ?? [])
            callback({ payload: ['lexlata://de-bund/BGB/1'] });
        if (pfad === 'verlauf') {
          tabs.verlaufSetzen(vorhanden(tabs.aktiverTabId), {
            eintraege: [
              { gesetzesreferenz: { kurztitel: 'HGB', normgeber: 'de-bund' }, xmlId: 'h1' },
              { gesetzesreferenz: referenz, xmlId: 'p1' },
            ],
            position: 0,
          });
          aktionen.verlaufSchrittUndOeffnen('zurueck');
        }
        if (pfad === 'intern') {
          intern = {
            kennung: 1,
            auftrag: { gesetz: referenz, ziel: { type: 'norm', bezeichnung: '§ 1' } },
            neuesFenster: false,
          };
          for (const callback of io.listener.get('interne-navigation-vorhanden') ?? [])
            callback({ payload: null });
        }
        if (pfad === 'wiederoeffnen') {
          geschlossenenTabPushen({
            gesetzesreferenz: referenz,
            verlauf: { eintraege: [{ gesetzesreferenz: referenz, xmlId: 'p1' }], position: 0 },
          });
          aktionen.tabWiederherstellenAktuell();
        }
      });
      if (pfad === 'suche')
        await act(async () => {
          vorhanden(dom.host.querySelector<HTMLElement>('[data-idx="0"]')).click();
        });
      expect(tabs.tabs.filter((tab) => tab.gesetzesreferenz)).toHaveLength(0);
    } finally {
      await act(async () => freigeben());
    }
    await vi.waitFor(async () => {
      await act(async () => {
        await tabs.ladeGesetz(referenz);
      });
      expect(dom.host.querySelector('output')?.textContent).toBe('BGB:geladen:');
    });
    expect(
      tabs
        .verlaufLesen(vorhanden(tabs.aktiverTabId))
        ?.eintraege.some((eintrag) => eintrag.xmlId === 'p1'),
    ).toBe(true);
    expect(gelesen.filter((pfad) => pfad.includes('/gesetze/'))).toHaveLength(1);
    expect(dom.host.textContent).not.toContain('Gesetz wird geladen');
  },
);
it('zeigt bei inzwischen fehlender installierter Datei nur ein Banner und keinen Tab', async () => {
  const abschluss = oeffnungsabschluss();
  io.dateien.delete('gesetze/BGB_de-bund.xml');
  const nativ = vorhanden(io.invoke.getMockImplementation());
  let freigeben = nichts;
  const freigabe = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') await freigabe;
    return nativ(name, args);
  });
  await act(async () => {
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: referenz, nurInstalliert: true },
      undefined,
      undefined,
      abschluss.melden,
    );
  });
  await act(async () => {
    freigeben();
    await abschluss.wartet;
  });
  expect(tabs.tabs.filter((tab) => tab.gesetzesreferenz)).toHaveLength(0);
  expect(getSnapshot().some((banner) => banner.text === 'Gesetz nicht mehr vorhanden.')).toBe(true);
});
it('zeigt bei unlesbarer Datei nur ein Banner und öffnet nach ausdrücklicher Wiederholung dieselbe Referenz', async () => {
  let abschluss = oeffnungsabschluss();
  const inhalt = vorhanden(io.dateien.get('gesetze/BGB_de-bund.xml'));
  io.dateien.set('gesetze/BGB_de-bund.xml', '<gesetz');
  await act(async () => {
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: referenz, nurInstalliert: true },
      undefined,
      undefined,
      () => abschluss.melden(),
    );
  });
  await act(async () => {
    await abschluss.wartet;
  });
  expect(tabs.tabs.filter((tab) => tab.gesetzesreferenz)).toHaveLength(0);
  expect(tabs.verlaufLesen(vorhanden(tabs.aktiverTabId))?.eintraege ?? []).toEqual([]);
  const fehler = getSnapshot().find((banner) => banner.aktion?.label === 'Erneut versuchen');
  assert(fehler?.aktion);
  io.dateien.set('gesetze/BGB_de-bund.xml', inhalt);
  abschluss = oeffnungsabschluss();
  await act(async () => {
    vorhanden(fehler.aktion).onClick();
  });
  await act(async () => {
    await abschluss.wartet;
  });
  expect(dom.host.querySelector('output')?.textContent).toBe('BGB:geladen:');
  expect(tabs.tabs.filter((tab) => tab.gesetzesreferenz)).toHaveLength(1);
});
it('öffnet bei nicht vorhandenem ausdrücklichem Normziel das geladene Gesetz und meldet nur den gescheiterten Normsprung', async () => {
  const abschluss = oeffnungsabschluss();
  await act(async () => {
    navigation.gesetzesreferenzOeffnen(
      {
        gesetzesreferenz: referenz,
        xmlId: 'entfernt',
        nurInstalliert: true,
      },
      undefined,
      undefined,
      abschluss.melden,
    );
  });
  await act(async () => {
    await abschluss.wartet;
  });
  expect(dom.host.querySelector('output')?.textContent).toBe('BGB:geladen:');
  expect(
    tabs.verlaufLesen(vorhanden(tabs.aktiverTabId))?.eintraege.map((eintrag) => eintrag.xmlId),
  ).toEqual(['p1']);
  expect(getSnapshot().at(-1)?.text).toBe('Norm nicht gefunden.');
  expect(dom.host.querySelector('[role="status"]')).toBeNull();
});

it('öffnet bei unbekannter Überschrift aus interner Navigation das Gesetz ohne Normziel', async () => {
  io.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz version="1"><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><gliederung gliederungskennzahl="010"><bezeichnung>Buch 1</bezeichnung></gliederung><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm><norm id="433"><bezeichnung>§ 433</bezeichnung><text><absatz>Kauf</absatz></text></norm></inhalt></gesetz>',
  );
  intern = {
    kennung: 1,
    auftrag: { gesetz: referenz, ziel: { type: 'ueberschrift', gliederungskennzahl: '433' } },
    neuesFenster: false,
  };
  await act(async () => benachrichtigeIntern());
  await act(async () => {
    await vi.waitFor(() => expect(intern).toBeNull());
  });
  expect(dom.host.querySelector('output')?.textContent).toBe('BGB:geladen:');
  expect(
    tabs.verlaufLesen(vorhanden(tabs.aktiverTabId))?.eintraege.map((eintrag) => eintrag.xmlId),
  ).toEqual(['ueberschrift:010']);
  expect(getSnapshot().at(-1)?.text).toBe('Norm nicht gefunden.');
});

it.each([
  {
    ziel: { type: 'ueberschrift' as const, gliederungskennzahl: '100' },
    xmlId: 'ueberschrift:100',
  },
  { ziel: { type: 'norm' as const, bezeichnung: '§ 100' }, xmlId: '100' },
])('unterscheidet interne Ziele bei gleicher Nummer: $xmlId', async ({ ziel, xmlId }) => {
  io.dateien.set(
    'gesetze/BGB_de-bund.xml',
    '<gesetz version="1"><infos><kurztitel>BGB</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><gliederung gliederungskennzahl="100"><bezeichnung>Buch 1</bezeichnung></gliederung><norm id="100"><bezeichnung>§ 100</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  intern = { kennung: 1, auftrag: { gesetz: referenz, ziel }, neuesFenster: false };
  await act(async () => benachrichtigeIntern());
  await act(async () => {
    await vi.waitFor(() => expect(intern).toBeNull());
  });
  expect(
    tabs.verlaufLesen(vorhanden(tabs.aktiverTabId))?.eintraege.map((eintrag) => eintrag.xmlId),
  ).toEqual([xmlId]);
  expect(dom.host.querySelector(`[data-xml-id="${xmlId}"]`)).not.toBeNull();
});

it.each(['vorhanden', 'entfernt'] as const)(
  'prüft eine gespeicherte Stelle nach dem Einzelzugriff: %s',
  async (zustand) => {
    const abschluss = oeffnungsabschluss();
    const erstes = vorhanden(io.dateien.get('gesetze/BGB_de-bund.xml'));
    const mitZweiterNorm = erstes.replace(
      '</inhalt>',
      '<norm id="p2"><bezeichnung>§ 2</bezeichnung><text><absatz>Zweite Norm</absatz></text></norm></inhalt>',
    );
    const gespeichert = parseGesetzesXML(mitZweiterNorm);
    assert(gespeichert);
    speichereAktivierung(gespeichert, vorhanden(gespeichert.elemente[1]));
    io.dateien.set('gesetze/BGB_de-bund.xml', zustand === 'vorhanden' ? mitZweiterNorm : erstes);
    await act(async () => {
      navigation.gesetzesreferenzOeffnen(
        { gesetzesreferenz: referenz, nurInstalliert: true },
        undefined,
        undefined,
        abschluss.melden,
      );
    });
    await act(async () => {
      await abschluss.wartet;
    });
    const erwartet = zustand === 'vorhanden' ? 'p2' : 'p1';
    expect(
      tabs.verlaufLesen(vorhanden(tabs.aktiverTabId))?.eintraege.map((eintrag) => eintrag.xmlId),
    ).toEqual([erwartet]);
    expect(dom.host.querySelector(`[data-xml-id="${erwartet}"]`)).not.toBeNull();
  },
);
it('öffnet denselben nativen Auftrag bei doppelter Benachrichtigung während des Einzelzugriffs nur einmal', async () => {
  let freigeben = nichts;
  const warten = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  io.vorLesen = (pfad) => (pfad.endsWith('/gesetze/BGB_de-bund.xml') ? warten : undefined);
  const benachrichtigen = () => {
    for (const callback of io.listener.get('interne-navigation-vorhanden') ?? [])
      callback({ payload: null });
  };
  try {
    intern = {
      kennung: 1,
      auftrag: { gesetz: referenz, ziel: { type: 'norm', bezeichnung: '§ 1' } },
      neuesFenster: true,
    };
    await act(async () => {
      benachrichtigen();
    });
    await act(async () => {
      benachrichtigen();
      benachrichtigen();
    });
    expect(tabs.tabs.filter((tab) => tab.gesetzesreferenz)).toHaveLength(0);
  } finally {
    await act(async () => freigeben());
  }
  await act(async () => {
    await vi.waitFor(() => expect(intern).toBeNull());
  });
  expect(tabs.tabs.filter((tab) => tab.gesetzesreferenz)).toHaveLength(1);
  expect(dom.host.querySelector('output')?.textContent).toBe('BGB:geladen:');
});

it('bestätigt eine interne Navigation zu einem fehlenden Gesetz als erledigt (E7)', async () => {
  io.dateien.delete('gesetze/BGB_de-bund.xml');
  setzeSuchverzeichnisTestdaten([]);
  intern = {
    kennung: 1,
    auftrag: { gesetz: referenz, ziel: { type: 'norm', bezeichnung: '§ 1' } },
    neuesFenster: false,
  };
  await act(async () => benachrichtigeIntern());
  await act(async () => {
    await vi.waitFor(() => expect(intern).toBeNull());
  });
  expect(tabs.tabs.filter((tab) => tab.gesetzesreferenz)).toHaveLength(0);
  expect(getSnapshot()).toHaveLength(1);
});

it('lässt eine interne Navigation bei unlesbarer Datei für die Wiederholung offen (E7)', async () => {
  const inhalt = vorhanden(io.dateien.get('gesetze/BGB_de-bund.xml'));
  io.dateien.set('gesetze/BGB_de-bund.xml', '<gesetz');
  const auftrag = {
    kennung: 1,
    auftrag: { gesetz: referenz, ziel: { type: 'norm' as const, bezeichnung: '§ 1' } },
    neuesFenster: false,
  };
  intern = auftrag;
  await act(async () => benachrichtigeIntern());
  await vi.waitFor(() =>
    expect(getSnapshot().some((b) => b.aktion?.label === 'Erneut versuchen')).toBe(true),
  );
  expect(intern).toBe(auftrag);
  expect(tabs.tabs.filter((tab) => tab.gesetzesreferenz)).toHaveLength(0);
  // Die nächste Benachrichtigung wiederholt den offenen Auftrag.
  io.dateien.set('gesetze/BGB_de-bund.xml', inhalt);
  await act(async () => benachrichtigeIntern());
  await act(async () => {
    await vi.waitFor(() => expect(intern).toBeNull());
  });
  expect(dom.host.querySelector('output')?.textContent).toBe('BGB:geladen:');
});

function benachrichtigeIntern() {
  for (const callback of io.listener.get('interne-navigation-vorhanden') ?? [])
    callback({ payload: null });
}

// Der Öffnungsrückruf bestätigt auch Fehler und fehlgeschlagene Normsprünge.
function oeffnungsabschluss() {
  let melden = nichts;
  const wartet = new Promise<void>((resolve) => {
    melden = resolve;
  });
  return { melden, wartet };
}
