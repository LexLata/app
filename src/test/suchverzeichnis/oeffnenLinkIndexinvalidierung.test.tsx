// @vitest-environment jsdom
// Echte OeffnenLinkauswahl über native Auftragsprüfungen und erfolgreiche Indexschreibungen hinweg.
import { suchverzeichnisTestdatei } from './suchverzeichnisFabriken';
import { io, bereiteImportindexDateienVor } from '@/test/import/importindexAnsichtUmgebung';
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOeffnenLinkNavigation } from '@/hooks/fenster/useOeffnenLinkNavigation';
import {
  leseImportindexZwischenspeicher,
  sucheKandidatenAlleQuellen,
  uebernehmeImportindexDatei,
} from '@/lib/import/import.index';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { importindexFixture } from '@/test/import/europaImportFixtures';

let root: Root;
let navigieren: ReturnType<typeof useOeffnenLinkNavigation>;
const fehler = vi.fn();
const oeffnen = vi.fn();
function Host() {
  const importindexVorbereitungRef = useRef<Promise<void> | null>(Promise.resolve());
  const ausfuehren = useOeffnenLinkNavigation({
    importindexVorbereitungRef,
    zeigeSuchfehler: fehler,
  });
  useEffect(() => {
    navigieren = ausfuehren;
  }, [ausfuehren]);
  return null;
}
function bund(mitNeu: boolean) {
  return importindexFixture(
    'de-bund',
    mitNeu
      ? '<gesetz><kurztitel>NeuG</kurztitel><langtitel>Neues Gesetz</langtitel><abrufkennung>neug</abrufkennung></gesetz>'
      : '',
  );
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  bereiteImportindexDateienVor();
  io.lokal.set('cache/suchverzeichnis.json', suchverzeichnisTestdatei([]));
  fehler.mockReset();
  oeffnen.mockReset();
  leseImportindexZwischenspeicher();
  await vi.waitFor(() => expect(io.listener.has('importindex-geaendert')).toBe(true));
  io.listener.get('importindex-geaendert')?.({
    payload: { kategorie: 'de-bund', absender: 'fenster-a' },
  });
  const container = document.createElement('main');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<Host />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});
it.each([
  { vorher: false, nachher: true, pruefung: 3 },
  { vorher: false, nachher: true, pruefung: 4 },
  { vorher: true, nachher: false, pruefung: 3 },
])(
  'entscheidet nach Indexänderung während Auftragsprüfung $pruefung mit dem aktuellen Angebot (zuvor: $vorher, danach: $nachher)',
  async ({ vorher, nachher, pruefung }) => {
    io.lokal.set('importindizes/de-bund.xml', bund(vorher));

    let freigeben!: () => void;
    let pruefungBegonnen!: () => void;
    const sperre = new Promise<void>((r) => {
      freigeben = r;
    });
    const begonnen = new Promise<void>((r) => {
      pruefungBegonnen = r;
    });
    let anzahl = 0;
    const istAktuell = async () => {
      if (++anzahl === pruefung) {
        pruefungBegonnen();
        await sperre;
      }
      return true;
    };
    const lauf = navigieren(
      { type: 'oeffnen', suchtext: 'NeuG' },

      istAktuell,
      oeffnen,
    );
    await begonnen;
    await uebernehmeImportindexDatei(bund(nachher).replace('2026-10-01', '2026-10-29'));
    const aktuell = await sucheKandidatenAlleQuellen();
    expect(aktuell['de-bund'].some((e) => e.kurztitel === 'NeuG')).toBe(nachher);
    freigeben();
    expect(await lauf).toBe(true);
    if (nachher) {
      expect(io.netz).toHaveBeenCalled();
      expect(fehler).not.toHaveBeenCalledWith(
        expect.objectContaining({ meldung: 'Kein Treffer für diesen Link.' }),
      );
    } else {
      expect(io.netz).not.toHaveBeenCalled();
      expect(fehler).toHaveBeenCalledExactlyOnceWith({
        suchtext: 'NeuG',
        meldung: 'Kein Treffer für diesen Link.',
        ohneAktivesGesetz: true,
      });
    }
    const lesungen =
      io.lesen.mock.calls.filter(([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json'))
        .length + io.ressourcen.mock.calls.length;
    await new Promise((r) => setTimeout(r, 10));
    expect(
      io.lesen.mock.calls.filter(([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json'))
        .length + io.ressourcen.mock.calls.length,
    ).toBe(lesungen);
  },
);

it('verwendet ein Teilergebnis einmalig ohne automatische erneute Dateilesungen', async () => {
  io.fehler = true;

  expect(
    await navigieren(
      { type: 'oeffnen', suchtext: 'NichtVorhanden' },

      async () => true,
      oeffnen,
    ),
  ).toBe(true);
  expect(fehler).toHaveBeenCalledExactlyOnceWith({
    suchtext: 'NichtVorhanden',
    meldung: 'Kein Treffer für diesen Link.',
    ohneAktivesGesetz: true,
  });
  expect(
    io.lesen.mock.calls.filter(([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json')),
  ).toHaveLength(9);
  expect(leseImportindexZwischenspeicher()).toBeUndefined();
  const lesungen =
    io.lesen.mock.calls.filter(([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json'))
      .length + io.ressourcen.mock.calls.length;
  await new Promise((r) => setTimeout(r, 10));
  expect(
    io.lesen.mock.calls.filter(([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json'))
      .length + io.ressourcen.mock.calls.length,
  ).toBe(lesungen);
});

function halteErstePraefixressource() {
  let freigeben!: () => void;
  let begonnen!: () => void;
  const sperre = new Promise<void>((r) => {
    freigeben = r;
  });
  const start = new Promise<void>((r) => {
    begonnen = r;
  });
  const ressourcen = io.ressourcen.getMockImplementation();
  if (!ressourcen) throw Error('Ressourcenmock fehlt');
  let erstes = true;
  io.ressourcen.mockImplementation(async (pfad: string) => {
    if (erstes && pfad.includes('praefixstrukturen')) {
      erstes = false;
      begonnen();
      await sperre;
    }
    return ressourcen(pfad);
  });
  return { start, freigeben };
}

it('lädt das bereits aktuelle Teilergebnis nach Invalidierung im Ladevorgang nicht nochmals', async () => {
  io.fehler = true;
  const { start, freigeben } = halteErstePraefixressource();

  const lauf = navigieren(
    { type: 'oeffnen', suchtext: 'NichtVorhanden' },

    async () => true,
    oeffnen,
  );
  await start;
  expect(
    io.lesen.mock.calls.filter(([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json')),
  ).toHaveLength(9);
  io.listener.get('importindex-geaendert')?.({
    payload: { kategorie: 'de-bund', absender: 'fenster-a' },
  });
  freigeben();
  expect(await lauf).toBe(true);
  expect(fehler).toHaveBeenCalledTimes(1);
  expect(
    io.lesen.mock.calls.filter(([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json')),
  ).toHaveLength(18);
});

it.each([false, true])(
  'verwirft eine weitere Invalidierung zwischen Ladeauflösung und Hookfortsetzung (Teilfehler: %s)',
  async (teilfehler) => {
    io.fehler = teilfehler;
    io.lokal.set('importindizes/de-bund.xml', bund(true));
    const { start, freigeben } = halteErstePraefixressource();
    const laden = sucheKandidatenAlleQuellen();
    // Dieser Wartende läuft vor der bereits wartenden Hookfortsetzung.
    const invalidiert = laden.then(() => {
      io.lokal.set('importindizes/de-bund.xml', bund(false));
      io.listener.get('importindex-geaendert')?.({
        payload: { kategorie: 'de-bund', absender: 'fenster-a' },
      });
    });
    await start;

    const lauf = navigieren(
      { type: 'oeffnen', suchtext: 'NeuG' },

      async () => true,
      oeffnen,
    );
    // Native Prüfungen bis zum gemeinsamen laufenden Indexzugriff abarbeiten.
    await act(async () => {});
    freigeben();
    await invalidiert;
    expect(await lauf).toBe(true);
    expect(io.netz).not.toHaveBeenCalled();
    expect(fehler).toHaveBeenCalledExactlyOnceWith({
      suchtext: 'NeuG',
      meldung: 'Kein Treffer für diesen Link.',
      ohneAktivesGesetz: true,
    });
    expect(
      io.lesen.mock.calls.filter(([pfad]) => !String(pfad).includes('cache/suchverzeichnis.json')),
    ).toHaveLength(18);
  },
);

it('öffnet beim Öffnen-Link zum exakten Gesetz die Hauptnorm vor der vorangestellten Anlage', async () => {
  const gesetz = gesetzDarstellung({
    kurztitel: 'LBO',
    elemente: [
      { typ: 'norm', data: normaleNorm({ xmlId: 'anlage', bezeichnung: 'Anlage 1' }) },
      { typ: 'norm', data: normaleNorm({ xmlId: 'paragraph', bezeichnung: '§ 1' }) },
    ],
  });
  io.lokal.set('cache/suchverzeichnis.json', suchverzeichnisTestdatei([gesetz]));

  expect(
    await navigieren(
      { type: 'oeffnen', suchtext: '1 LBO' },

      async () => true,
      oeffnen,
    ),
  ).toBe(true);
  expect(oeffnen).toHaveBeenCalledExactlyOnceWith({
    gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
    xmlId: 'paragraph',
    nurInstalliert: true,
  });
  expect(fehler).not.toHaveBeenCalled();
});
