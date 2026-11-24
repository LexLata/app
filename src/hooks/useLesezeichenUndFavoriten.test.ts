import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
// @vitest-environment jsdom
import { tabFuerTest, holeTabGesetzFuerTest } from '@/test/tabs/tabBestandFuerTest';

import {
  normaleNorm,
  gesetzDarstellung,
  gliederungsartikel,
  gesetzMitNormen,
} from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { act, createElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { useLesezeichenUndFavoriten } from './useLesezeichenUndFavoriten';
import {
  pruefeFavoritenImport,
  ersetzeFavoritenDatei,
  ladeFavoriten,
} from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import {
  pruefeLesezeichenImport,
  ersetzeLesezeichenDatei,
  ladeLesezeichen,
} from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
const dom = domTestWurzel();
const gesetz = gesetzDarstellung({
  elemente: [
    { typ: 'norm', data: normaleNorm({ id: 'n', xmlId: 'a1', bezeichnung: 'Art. 1' }) },
    {
      typ: 'ueberschrift',
      data: {
        id: 'u',
        xmlId: 'ueberschrift:001',
        gliederungskennzahl: '001',
        ebene: 1,
        bezeichnung: 'Teil 1',
      },
    },
  ],
});
let hook: ReturnType<typeof useLesezeichenUndFavoriten>;
async function zeichne(aktivesElementId = 'n', kollision = false, basis = gesetz) {
  const g = kollision
    ? {
        ...basis,
        elemente: [
          ...basis.elemente,
          {
            typ: 'norm' as const,
            data: normaleNorm({ id: 'a', xmlId: 'anhang', bezeichnung: 'Anhang 1' }),
          },
        ],
      }
    : basis;
  function Probe() {
    hook = useLesezeichenUndFavoriten({
      holeTabGesetz: holeTabGesetzFuerTest,
      tabsRef: { current: [tabFuerTest({ id: 'tab', gesetz: g })] },
      aktiverTabIdRef: { current: 'tab' },
      einklappZustandRef: {
        current: {
          ['tab-' + gesetzesreferenzSchluessel(g)]: {
            aktivesElementId,
            ueberschriften: new Set(),
            normen: new Set(),
          },
        },
      },
    });
    return null;
  }
  await act(async () => dom.root.render(createElement(Probe)));
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  alleBannerSchliessen();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
it.each(['Favorit', 'Lesezeichen'] as const)(
  '%s liefert bei Hinzufügen und Entfernen Erfolg und speichert die volle Bezeichnung im XML',
  async (art) => {
    await zeichne();
    const speichern = () => hook[`handle${art}Speichern`]();
    await act(async () => expect(await speichern()).toBe(true));
    expect(
      [...io.dateien.values()].some((xml) => xml.includes('<bezeichnung>Art. 1</bezeichnung>')),
    ).toBe(true);
    expect(art === 'Favorit' ? await ladeFavoriten(gesetz) : await ladeLesezeichen()).toHaveLength(
      1,
    );
    await act(async () => expect(await speichern()).toBe(true));
    expect(art === 'Favorit' ? await ladeFavoriten(gesetz) : await ladeLesezeichen()).toEqual([]);
  },
);
it.each(['Favorit', 'Lesezeichen'] as const)(
  '%s verweigert Überschrift und kollidierende Kurzform mit bestehender Meldung',
  async (art) => {
    await zeichne('u');
    await act(async () => expect(await hook[`handle${art}Speichern`]()).toBe(false));
    expect(getSnapshot().at(-1)?.text).toBe(
      `Überschriften können nicht als ${art === 'Favorit' ? 'Favoriten' : 'Lesezeichen'} gespeichert werden.`,
    );
    await zeichne('a', true);
    expect(hook.aktivesElementBezeichnungErmitteln()).toBeNull();
    await act(async () => expect(await hook[`handle${art}Speichern`]()).toBe(false));
    expect(getSnapshot().at(-1)?.text).toContain('Die Bezeichnung „1“ führt zu Art. 1.');
    expect(io.schreiben).not.toHaveBeenCalled();
  },
);
it.each(['Favorit', 'Lesezeichen'] as const)(
  '%s liefert bei Speicherfehler false und erklärt den Fehler',
  async (art) => {
    await zeichne();
    io.schreiben.mockRejectedValueOnce(new Error('Schreiben fehlgeschlagen'));
    await act(async () => expect(await hook[`handle${art}Speichern`]()).toBe(false));
    expect(getSnapshot().at(-1)).toMatchObject({
      typ: 'fehler',
      text: `${art} konnte nicht gespeichert werden.`,
    });
    expect(io.dateien.size).toBe(0);
  },
);
it.each(['FavoritSpeichern', 'LesezeichenSpeichern', 'AlleLesezeichenEntfernen'] as const)(
  '%s erhält die Erklärung einer Dateisperren-Wartefrist',
  async (art) => {
    await zeichne();
    io.invoke.mockRejectedValueOnce('wartefrist');
    await act(async () => {
      await hook[`handle${art}`]();
    });
    expect(getSnapshot()).toEqual([
      expect.objectContaining({ text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.' }),
    ]);
    expect(io.emitTo).not.toHaveBeenCalled();
  },
);
it('löscht alle Lesezeichen erst nach Zustimmung im nativen Dialog', async () => {
  await zeichne();
  await act(async () => {
    await hook.handleLesezeichenSpeichern();
  });
  io.confirm.mockResolvedValueOnce(false);
  await act(async () => hook.handleAlleLesezeichenEntfernen());
  expect(await ladeLesezeichen()).toHaveLength(1);
  expect(io.confirm).toHaveBeenCalledWith('Wirklich alle Lesezeichen unwiderruflich löschen?', {
    title: 'Lesezeichen löschen',
    kind: 'warning',
    okLabel: 'Löschen',
    cancelLabel: 'Abbrechen',
  });
  await act(async () => hook.handleAlleLesezeichenEntfernen());
  expect(await ladeLesezeichen()).toEqual([]);
});

it.each(['Favorit', 'Lesezeichen'] as const)(
  '%s speichert §§ 1 und 2 trotz gleich nummerierter Anlagen und benennt echte Mehrdeutigkeit',
  async (art) => {
    const g = gesetzMitNormen(['§ 1', '§ 2', 'Anlage 1', 'Anlage 2'], {
      kurztitel: 'BGB',
      langtitel: 'Bürgerliches Gesetzbuch',
    });
    for (const id of ['0', '1']) {
      await zeichne(id, false, g);
      await act(async () => expect(await hook[`handle${art}Speichern`]()).toBe(true));
    }
    expect(
      art === 'Favorit'
        ? await ladeFavoriten(g)
        : (await ladeLesezeichen()).map((e) => e.bezeichnung),
    ).toEqual(['§ 1', '§ 2']);
    expect(getSnapshot()).toEqual([]);
    const mehrdeutig = {
      ...g,
      elemente: [
        ...g.elemente,
        {
          typ: 'norm' as const,
          data: gliederungsartikel({
            id: 'artikel',
            xmlId: 'artikel',
            bezeichnung: 'Art. 1',
          }),
        },
      ],
    };
    await zeichne('0', false, mehrdeutig);
    await act(async () => expect(await hook[`handle${art}Speichern`]()).toBe(false));
    expect(getSnapshot().at(-1)?.text).toBe(
      `§ 1 kann nicht als ${art} gespeichert werden: Die Bezeichnung „1“ passt zu mehreren Normen und ist nicht eindeutig.`,
    );
  },
);

it.each(['Favorit', 'Lesezeichen'] as const)(
  'speichert bei %s den Gliederungsartikel und die Schreibweise der Quelle',
  async (art) => {
    const basis = gesetzDarstellung({
      hatGliederungsartikel: true,
      elemente: [
        {
          typ: 'norm',
          data: gliederungsartikel({
            id: 'artikel',
            xmlId: 'art229',
            bezeichnung: 'Art. 229',
            gliederungsEbene: 1,
            ueberschriftartig: true,
          }),
        },
        { typ: 'norm', data: normaleNorm({ id: 'n', xmlId: 'p3', bezeichnung: '§3' }) },
      ],
    });
    await zeichne('n', false, basis);
    await act(async () => expect(await hook[`handle${art}Speichern`]()).toBe(true));
    expect(
      [...io.dateien.values()].some((xml) =>
        xml.includes('<bezeichnung>Art. 229 §3</bezeichnung>'),
      ),
    ).toBe(true);
    expect(hook.aktivesElementBezeichnungErmitteln()?.bezeichnung).toBe('Art. 229 §3');
  },
);

it('übernimmt importierte volle Bezeichnungen auch bei gleicher Kurzform ohne Verlust', async () => {
  const eintraege = ['§ 1', 'Anlage 1'];
  const infos = '<infos><gesetz normgeber="de-bund">BGB</gesetz></infos>';
  const favoriten = `<favoriten version="1">${infos}<inhalt>${eintraege.map((b) => `<eintrag><bezeichnung>${b}</bezeichnung></eintrag>`).join('')}</inhalt></favoriten>`;
  const lesezeichen = `<lesezeichen version="1"><infos/><inhalt>${eintraege.map((b) => `<eintrag><bezeichnung>${b}</bezeichnung><gesetz normgeber="de-bund">BGB</gesetz></eintrag>`).join('')}</inhalt></lesezeichen>`;
  const referenz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  const meldungen: unknown[] = [];
  expect(pruefeFavoritenImport(favoriten, referenz, (m) => meldungen.push(m))).toBe(2);
  expect(pruefeLesezeichenImport(lesezeichen, (m) => meldungen.push(m))).toBe(2);
  await ersetzeFavoritenDatei(referenz, favoriten);
  await ersetzeLesezeichenDatei(lesezeichen);
  expect(await ladeFavoriten(referenz)).toEqual(eintraege);
  expect((await ladeLesezeichen()).map((e) => e.bezeichnung)).toEqual(eintraege);
  expect(meldungen).toEqual([]);
});

it('meldet die Lesezeichenmenübedingung beim Laden, Speichern und nach Änderung eines anderen Fensters', async () => {
  await zeichne();
  const pruefeMenue = (aktiv: boolean) =>
    expect(io.invoke).toHaveBeenCalledWith('menu_item_aktivieren', {
      id: 'alle-lesezeichen-entfernen',
      aktiv,
    });
  pruefeMenue(false);
  await act(async () => vi.dynamicImportSettled());
  io.invoke.mockClear();
  await act(async () => {
    expect(await hook.handleLesezeichenSpeichern()).toBe(true);
    for (const empfangen of io.listener.get('lesezeichen-geaendert') ?? [])
      empfangen({ payload: undefined });
  });
  pruefeMenue(true);
  // Ein anderes Fenster entfernt die gemeinsame Datei und sendet das reguläre Ereignis.
  io.dateien.delete('lesezeichen/lesezeichen.xml');
  io.invoke.mockClear();
  await act(async () => {
    for (const empfangen of io.listener.get('lesezeichen-geaendert') ?? [])
      empfangen({ payload: undefined });
  });
  expect(hook.lesezeichen).toEqual([]);
  pruefeMenue(false);
});

it('meldet Normwechsel direkt, übernimmt Lesezeichen nach verzögerter Anmeldung und beendet das Abonnement beim Abbau', async () => {
  let anmeldungFreigeben = () => {};
  const anmeldeWartezeit = new Promise<void>((resolve) => {
    anmeldungFreigeben = resolve;
  });
  io.vorListener = (name) => (name === 'lesezeichen-geaendert' ? anmeldeWartezeit : undefined);
  const { schreibeSpeicherbareNorm } =
    await import('@/lib/domain/aktives-element/aktives-element.index');
  const { menuText } = await import('@/lib/plattform/menu/menu.index');
  await zeichne();
  const norm = { gesetz, bezeichnung: 'Art. 1', istFavorit: false };
  await act(async () => schreibeSpeicherbareNorm(norm));
  const meldungen = () =>
    io.invoke.mock.calls.filter(([befehl]) => befehl === 'menu_normstatus_melden');
  const anzahl = meldungen().length;
  await act(async () => schreibeSpeicherbareNorm({ ...norm }));
  expect(meldungen()).toHaveLength(anzahl);
  // Erst nach der nativen Anmeldung kann die Speicheränderung zugestellt werden.
  expect(io.listener.get('lesezeichen-geaendert')?.size ?? 0).toBe(0);
  await act(async () => {
    anmeldungFreigeben();
    await vi.dynamicImportSettled();
  });
  expect(io.listener.get('lesezeichen-geaendert')?.size).toBe(1);
  expect(hook.lesezeichenGeladen).toBe(true);
  expect(meldungen()).toHaveLength(anzahl);
  await act(async () => expect(await hook.handleLesezeichenSpeichern()).toBe(true));
  await act(async () => vi.dynamicImportSettled());
  expect(menuText('lesezeichen-speichern')).toBe('Art. 1 aus Lesezeichen entfernen');
  expect(meldungen()).toHaveLength(anzahl + 1);
  await act(async () => schreibeSpeicherbareNorm({ ...norm, bezeichnung: 'Art. 2' }));
  expect(meldungen()).toHaveLength(anzahl + 2);
  await act(async () => schreibeSpeicherbareNorm(null));
  await act(async () => schreibeSpeicherbareNorm(null));
  expect(meldungen()).toHaveLength(anzahl + 3);
  expect(menuText('favorit-speichern')).toBe('Ausgewählte Norm als Favoriten speichern');
  await act(async () => dom.root.render(null));
  expect(io.listener.get('lesezeichen-geaendert')?.size).toBe(0);
  const vorAbbau = meldungen().length;
  schreibeSpeicherbareNorm(norm);
  expect(meldungen()).toHaveLength(vorAbbau);
  schreibeSpeicherbareNorm(null);
});
