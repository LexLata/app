// @vitest-environment jsdom
// Zwei Fenster lesen echte Suchverzeichnisdateien; Änderungen passieren an nativen Dateigrenzen.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useLayoutEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useSuchverzeichnis } from '@/hooks/useSuchverzeichnis';
import { Gesetzesuebersicht, AktualisierenOverlay } from '@/components/overlays/overlays.index';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { leiteSuchverzeichniseintragAb } from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  loescheGesetz,
  speichereGesetz,
  warteAufSpeicherBatchAbschluss,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { initialisiereMarkierungen } from '@/lib/markierungen/markierungen.index';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';

const dom = domTestWurzel();
const nichts = () => {};
const keineDateiaktion = async () => {};
const xml = (titel: string, zeit = '2026-01-01T00:00:00Z') =>
  `<gesetz><infos><kurztitel>${titel}</kurztitel><langtitel>${titel} Langtitel</langtitel><normgeber>de-bund</normgeber><verarbeitungszeit>${zeit}</verarbeitungszeit></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Amtlich</titel><text><absatz>Inhalt</absatz></text></norm></inhalt></gesetz>`;
function cache() {
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({
      version: 1,
      abgeglichen: true,
      eintraege: [...io.dateien]
        .filter(([pfad]) => pfad.startsWith('gesetze/'))
        .map(([, inhalt]) => {
          const gesetz = parseGesetzesXML(inhalt);
          if (!gesetz) throw new Error('Ungültige Testdatei');
          return leiteSuchverzeichniseintragAb(gesetz, {
            groesse: String(inhalt.length),
            aenderungszeit: '1',
          });
        }),
    }),
  );
}
let tabs: ReturnType<typeof useAppTabs>;
let oeffnen: ReturnType<typeof useGesetzOeffnen>;
function Fenster() {
  const { eintraege, wirdVorbereitet } = useSuchverzeichnis();
  const gesetze = eintraege.filter((eintrag) => eintrag.status === 'in-ordnung');
  return (
    <section>
      <Gesetzesuebersicht
        gesetze={gesetze}
        wirdVorbereitet={wirdVorbereitet}
        onSchliessen={nichts}
        onOeffnen={(gesetzesreferenz) =>
          oeffnen.gesetzesreferenzOeffnen({ gesetzesreferenz, nurInstalliert: true })
        }
        onLoeschen={keineDateiaktion}
        onExportAktionAnmelden={() => {}}
        onExportieren={keineDateiaktion}
        onDateienAbgelegt={nichts}
        gesetzeskurzbefehle={{}}
        onGesetzeskurzbefehleGeaendert={nichts}
      />
      <AktualisierenOverlay
        gesetze={gesetze}
        wirdVorbereitet={wirdVorbereitet}
        onSchliessen={nichts}
        onInfoAktualisiert={nichts}
      />
    </section>
  );
}
function Bestand() {
  const t = useAppTabs();
  const o = useGesetzOeffnen(gesetzOeffnenFixture(t));
  useLayoutEffect(() => {
    tabs = t;
    oeffnen = o;
  });
  return null;
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  initialisiereMarkierungen();
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'pruefvorgang_registrieren') return 'quelle';
    if (name.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    return nativ?.(name, args);
  });
  io.dateien.set('gesetze/BGB_de-bund.xml', xml('BGB'));
  io.dateien.set(
    'importindizes/de-bund.xml',
    importindexFixture(
      'de-bund',
      ['BGB', 'ZPO']
        .map(
          (titel) =>
            `<gesetz><kurztitel>${titel}</kurztitel><langtitel>Langtitel</langtitel><abrufkennung>${titel}</abrufkennung></gesetz>`,
        )
        .join(''),
    ),
  );
  cache();
});
it('zeigt Übersicht und Aktualisierung in zwei Fenstern ohne einen Volltextzugriff und übernimmt Import sowie Löschung', async () => {
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) gelesen.push(pfad);
    return undefined;
  };
  await act(async () =>
    dom.root.render(
      <>
        <Fenster />
        <Fenster />
      </>,
    ),
  );
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(dom.host.querySelectorAll('section')).toHaveLength(2);
  for (const fenster of dom.host.querySelectorAll('section'))
    expect(fenster.textContent).toContain('BGB Langtitel');
  expect(gelesen).toEqual([]);
  await act(async () => {
    await speichereGesetz({ kurztitel: 'ZPO', normgeber: 'de-bund' }, xml('ZPO'));
    await warteAufSpeicherBatchAbschluss();
  });
  for (const fenster of dom.host.querySelectorAll('section'))
    expect(fenster.textContent).toContain('ZPO Langtitel');
  await act(async () => {
    await loescheGesetz({ kurztitel: 'BGB', normgeber: 'de-bund' });
    await warteAufSpeicherBatchAbschluss();
  });
  for (const fenster of dom.host.querySelectorAll('section')) {
    expect(fenster.textContent).not.toContain('BGB');
    expect(fenster.textContent).toContain('ZPO');
  }
  // Die unabhängige strenge Markierungsprüfung darf die geänderten Dateien lesen.
});
it('frischt nach unverändertem Inhalt alle Prüfzeiten auf ohne geladene Tabs erneut zu lesen oder auszutauschen', async () => {
  await act(async () =>
    dom.root.render(
      <>
        <Bestand />
        <Fenster />
        <Fenster />
      </>,
    ),
  );
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  await act(async () => {
    await tabs.ladeGesetz(referenz);
  });
  const vorher = tabs.holeGeladenes(referenz);
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) gelesen.push(pfad);
    return undefined;
  };
  await act(async () => {
    await speichereGesetz(referenz, xml('BGB', '2026-02-03T00:00:00Z'), {
      inhaltGeaendert: false,
    });
    await warteAufSpeicherBatchAbschluss();
  });
  for (const fenster of dom.host.querySelectorAll('section'))
    expect(fenster.textContent).toContain('Februar 2026');
  expect(tabs.holeGeladenes(referenz)).toBe(vorher);
  expect(gelesen).toEqual([]);
});
it.each([undefined, '{kaputt', JSON.stringify({ version: 1, abgeglichen: false, eintraege: [] })])(
  'bestätigt bei nicht vorbereitetem Verzeichnis %s keinen leeren Gerätebestand',
  async (inhalt) => {
    if (inhalt === undefined) io.dateien.delete('cache/suchverzeichnis.json');
    else io.dateien.set('cache/suchverzeichnis.json', inhalt);
    await act(async () => dom.root.render(<Fenster />));
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(dom.host.textContent).toContain('Gesetzesliste wird vorbereitet');
    expect(dom.host.textContent).not.toContain('Noch keine Gesetze auf dem Gerät');
    expect(dom.host.textContent).not.toContain('Keine Gesetze aus dem Internet importiert');
  },
);

it('öffnet aus der Übersicht erst bei Bedienung über den Einzelzugriff', async () => {
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) gelesen.push(pfad);
    return undefined;
  };
  await act(async () =>
    dom.root.render(
      <>
        <Bestand />
        <Fenster />
      </>,
    ),
  );
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  expect(tabs.holeGeladenes(referenz)).toBeUndefined();
  expect(gelesen).toEqual([]);
  const knopf = [...dom.host.querySelectorAll('span')].find(
    (element) => element.textContent === 'BGB Langtitel',
  );
  expect(knopf).toBeDefined();
  await act(async () => {
    knopf?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await act(async () => {
    await tabs.ladeGesetz(referenz);
  });
  expect(tabs.holeGeladenes(referenz)?.kurztitel).toBe('BGB');
  expect(gelesen).toHaveLength(1);
});
