// @vitest-environment jsdom
// Echte unveränderte Nutzerdaten-Zusammenführungen durch Konfliktoperation und Overlayklicks.
import {
  dateien,
  sperrstatusBeimVersand,
  emit,
  schreiben,
} from '@/test/import/nutzerdatenDateiimportAttrappe';
import '@/test/import/dateiImportOverlayAnzeigeAttrappen';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DateiImportOverlay } from './DateiImportOverlay';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { loeseImportKonflikt, type ImportKonflikt } from '@/lib/import-export/import-export.index';
import * as f from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import * as l from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import * as k from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  dateien.clear();
  sperrstatusBeimVersand.length = 0;
  vi.clearAllMocks();
  k.setzeReservierteTastenkuerzel([]);
});
afterEach(() => {
  expect(sperrstatusBeimVersand.every((status) => !status)).toBe(true);
});
type DateiKonflikt = Exclude<ImportKonflikt, { art: 'gesetz' }>;
const noopReferenz = gesetzesreferenz({ kurztitel: 'BGB' });
const noopFaelle = [
  {
    art: 'favoriten',
    importInhalt:
      '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>',
    vorbereiten: () => f.hinzufuegenFavoriten(noopReferenz, ['1', '2']),
  },
  {
    art: 'lesezeichen',
    importInhalt:
      '<lesezeichen><inhalt><eintrag><gesetz normgeber="de-bund">BGB</gesetz><bezeichnung>1</bezeichnung></eintrag></inhalt></lesezeichen>',
    vorbereiten: () =>
      l.hinzufuegenLesezeichen(
        ['1', '2'].map((bezeichnung) => ({ gesetz: noopReferenz, bezeichnung })),
      ),
  },
  {
    art: 'gesetzeskurzbefehle',
    importInhalt:
      '<gesetzeskurzbefehle><inhalt><gesetzeskurzbefehl><gesetz normgeber="de-bund">BGB</gesetz><taste primaer="true">x</taste></gesetzeskurzbefehl></inhalt></gesetzeskurzbefehle>',
    vorbereiten: () =>
      k.speichereGesetzeskurzbefehl(noopReferenz, {
        taste: 'e',
        meta: true,
        ctrl: false,
        shift: false,
        alt: false,
      }),
  },
] satisfies {
  art: DateiKonflikt['art'];
  importInhalt: string;
  vorbereiten: () => Promise<unknown>;
}[];
function noopKonflikt(fall: (typeof noopFaelle)[number]): DateiKonflikt {
  return {
    art: fall.art,
    gesetz: noopReferenz,
    kurztitel: 'BGB',
    anzeigename: fall.art,
    importInhalt: fall.importInhalt,
    quelle: `Sicherung.zip → Daten/${fall.art}.xml`,
  };
}
it.each(noopFaelle)(
  '$art meldet echte Zusammenführung ohne Bestandsänderung als unverändert',
  async (fall) => {
    await fall.vorbereiten();
    const vorher = new Map(dateien);
    schreiben.mockClear();
    emit.mockClear();
    const bericht = await loeseImportKonflikt(noopKonflikt(fall), 'zusammenfuehren');
    expect(bericht).toMatchObject({
      aktion: 'unveraendert',
      quelle: `Sicherung.zip → Daten/${fall.art}.xml`,
    });
    expect(dateien).toEqual(vorher);
    expect(schreiben).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  },
);
it.each(
  noopFaelle.flatMap((fall) =>
    ['Zusammenführen', 'Alle zusammenführen'].map((aktion) => ({ ...fall, aktion })),
  ),
)('$art/$aktion erledigt echte No-op-Entscheidung mit unverändertem Bericht', async (fall) => {
  await fall.vorbereiten();
  schreiben.mockClear();
  emit.mockClear();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(DateiImportOverlay, {
          zustand: {
            art: 'fertig',
            ergebnis: { konflikte: [noopKonflikt(fall)], berichtEintraege: [], fehler: [] },
          },
          onSchliessen: vi.fn(),
          onNeuLaden: vi.fn(),
        }),
      ),
    );
    const button = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === fall.aktion,
    );
    if (!button) throw new Error('Zusammenführen-Button fehlt');
    await act(async () => button.click());
    expect(container.textContent).not.toContain('Importkonflikte');
    expect(container.textContent).not.toContain('zusammengeführt.');
    expect(container.textContent).toContain('schon in dieser Version');
    expect(container.textContent).not.toContain('Sicherung.zip');
    expect(schreiben).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
