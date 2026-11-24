import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
// @vitest-environment jsdom
import { tabFuerTest, holeTabGesetzFuerTest } from '@/test/tabs/tabBestandFuerTest';

import { useLeistenTauschen } from '@/hooks/einstellungen/useLeistenTauschen';
import { act, createElement, useEffect } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { useEinfuehrungsAblauf } from './useEinfuehrungsAblauf';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { ladeFavoriten } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
import { ladeLesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import type { EinklappZustand, AktivesOverlay, ElementOeffnenParams } from '@/lib/domain/appTypes';
const dom = domTestWurzel();
const gesetz = gesetzDarstellung({
  kurztitel: 'GG',
  elemente: [
    { typ: 'norm', data: normaleNorm({ id: 'p', xmlId: 'p', bezeichnung: 'Präambel' }) },
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
    { typ: 'norm', data: normaleNorm({ id: 'a', xmlId: 'a1', bezeichnung: 'Art. 1' }) },
    { typ: 'norm', data: normaleNorm({ id: 'b', xmlId: 'a2', bezeichnung: 'Art. 2' }) },
  ],
});
const tabsRef = { current: [tabFuerTest({ id: 'tab', gesetz })] };
const aktiverTabIdRef = { current: 'tab' };
const schluessel = 'tab-' + gesetzesreferenzSchluessel(gesetz);
const einklappZustandRef: { current: Record<string, EinklappZustand> } = { current: {} };
const oeffnen = vi.fn<(params: ElementOeffnenParams) => void>();
let ablauf: ReturnType<typeof useEinfuehrungsAblauf>;
let overlay: AktivesOverlay | null;
let warFavorit: boolean;
function Probe() {
  const { leistenTauschen } = useLeistenTauschen();
  const speicher = useLesezeichenUndFavoriten({
    holeTabGesetz: holeTabGesetzFuerTest,
    tabsRef,
    aktiverTabIdRef,
    einklappZustandRef,
  });
  const ergebnis = useEinfuehrungsAblauf({
    holeTabGesetz: holeTabGesetzFuerTest,
    tabsRef,
    aktiverTabIdRef,
    einklappZustandRef,
    favoritenStatus: { istAktuellFavorit: warFavorit, favoritenleisteSichtbar: warFavorit },
    tabZustand: einklappZustandRef.current[schluessel],
    aktivesOverlay: overlay,
    handleFavoritSpeichern: speicher.handleFavoritSpeichern,
    handleLesezeichenSpeichern: speicher.handleLesezeichenSpeichern,
    elementOeffnen: oeffnen,
    leistenTauschen,
    minimalistischerModus: true,
  });
  useEffect(() => {
    ablauf = ergebnis;
  });
  return null;
}
const zeichne = () => act(async () => dom.root.render(createElement(Probe)));
async function norm(aktivesElementId: string) {
  const zustand = einklappZustandRef.current[schluessel];
  assert(zustand);
  zustand.aktivesElementId = aktivesElementId;
  await zeichne();
}
async function bisFavorit() {
  overlay = 'oeffnen';
  await zeichne();
  await act(async () => ablauf.onOeffnenNavigation());
  expect(ablauf.einfuehrungTeilaktion).toBe(2);
}
async function bisLesezeichen() {
  await bisFavorit();
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  warFavorit = true;
  await zeichne();
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  expect(ablauf.einfuehrungTeilaktion).toBe(4);
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  tabsRef.current = [tabFuerTest({ id: 'tab', gesetz })];
  alleBannerSchliessen();
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  overlay = null;
  warFavorit = false;
  einklappZustandRef.current = {
    [schluessel]: { aktivesElementId: 'a', ueberschriften: new Set(), normen: new Set() },
  };
  await zeichne();
});
it.each([undefined, 'p', 'ueberschrift:001', 'a2'])(
  'ersetzt nur während der Suche das ungeeignete Ziel %s und erhält gültige Ziele',
  async (xmlId) => {
    const params = { gesetz, xmlId, modus: 'aktiver-tab' as const };
    ablauf.elementOeffnenFuerSuche(params);
    expect(oeffnen).toHaveBeenLastCalledWith(params);
    expect(oeffnen.mock.calls.at(-1)?.[0]).toBe(params);
    overlay = 'oeffnen';
    await zeichne();
    ablauf.elementOeffnenFuerSuche(params);
    expect(oeffnen).toHaveBeenLastCalledWith({ ...params, xmlId: xmlId === 'a2' ? 'a2' : 'a1' });
    await act(async () => ablauf.einfuehrungBeenden());
    ablauf.elementOeffnenFuerSuche(params);
    expect(oeffnen.mock.calls.at(-1)?.[0]).toBe(params);
  },
);
it('lässt die Favorit-Teilaktionen bei Schreibfehler stehen und schaltet erst nach erfolgreichem Umschalten weiter', async () => {
  await bisFavorit();
  io.schreiben.mockRejectedValueOnce(new Error('Schreiben fehlgeschlagen'));
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  expect(ablauf.einfuehrungTeilaktion).toBe(2);
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  expect(ablauf.einfuehrungTeilaktion).toBe(3);
  expect(await ladeFavoriten(gesetz)).toEqual(['Art. 1']);
  warFavorit = true;
  await zeichne();
  io.schreiben.mockRejectedValueOnce(new Error('Löschen fehlgeschlagen'));
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  expect(ablauf.einfuehrungTeilaktion).toBe(3);
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  expect(ablauf.einfuehrungTeilaktion).toBe(4);
  expect(await ladeFavoriten(gesetz)).toEqual([]);
});
it('überspringt Favorit entfernen, wenn die Zielnorm bereits Favorit war', async () => {
  await bisFavorit();
  // Vorhandenen Favorit über den echten Handler außerhalb des Übergangs anlegen.
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  await act(async () => ablauf.einfuehrungNeuStarten());
  warFavorit = true;
  await bisFavorit();
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  expect(ablauf.einfuehrungTeilaktion).toBe(4);
  expect(await ladeFavoriten(gesetz)).toEqual([]);
});
it.each([false, true])(
  'schaltet Lesezeichen nur nach erfolgreichem Umschalten weiter, auch beim Entfernen (%s)',
  async (vorhanden) => {
    await bisLesezeichen();
    if (vorhanden) {
      await act(async () => ablauf.lesezeichenSpeichernMitEinfuehrung());
      await act(async () => ablauf.einfuehrungNeuStarten());
      warFavorit = false;
      await bisLesezeichen();
    }
    io.schreiben.mockRejectedValueOnce(new Error('Schreiben fehlgeschlagen'));
    await act(async () => ablauf.lesezeichenSpeichernMitEinfuehrung());
    expect(ablauf.einfuehrungTeilaktion).toBe(4);
    await act(async () => ablauf.lesezeichenSpeichernMitEinfuehrung());
    expect(ablauf.einfuehrungTeilaktion).toBe(5);
    expect(await ladeLesezeichen()).toHaveLength(vorhanden ? 0 : 1);
  },
);
it.each(['favorit', 'lesezeichen'] as const)(
  'erklärt eine aktive Überschrift bei %s und schaltet nach anschließender Normwahl weiter',
  async (art) => {
    if (art === 'favorit') await bisFavorit();
    else await bisLesezeichen();
    const teilaktion = ablauf.einfuehrungTeilaktion;
    const speichern = () =>
      art === 'favorit'
        ? ablauf.favoritSpeichernMitEinfuehrung()
        : ablauf.lesezeichenSpeichernMitEinfuehrung();
    await norm('u');
    await act(async () => speichern());
    expect(ablauf.einfuehrungTeilaktion).toBe(teilaktion);
    expect(getSnapshot().at(-1)?.text).toContain('Überschriften können nicht');
    await norm('b');
    await act(async () => speichern());
    expect(ablauf.einfuehrungTeilaktion).toBe(teilaktion + 1);
  },
);
it('erfasst aktuelle Klappgrößen beim Teilaktionseinstieg und behält die Basis bei Größenänderungen', async () => {
  await bisLesezeichen();
  await act(async () => ablauf.lesezeichenSpeichernMitEinfuehrung());
  einklappZustandRef.current[schluessel]!.normen = new Set(['a', 'b']);
  await act(async () => ablauf.meldeEinklappAenderung(2));
  expect(ablauf.einfuehrungTeilaktion).toBe(6);
  await act(async () => ablauf.meldeEinklappAenderung(2));
  expect(ablauf.einfuehrungTeilaktion).toBe(6);
  einklappZustandRef.current[schluessel]!.normen.add('p');
  await zeichne();
  await act(async () => ablauf.meldeEinklappAenderung(3));
  expect(ablauf.einfuehrungTeilaktion).toBe(7);
  await act(async () => ablauf.meldeEinklappAenderung(3));
  expect(ablauf.einfuehrungTeilaktion).toBe(7);
  einklappZustandRef.current[schluessel]!.normen.delete('p');
  await zeichne();
  await act(async () => ablauf.meldeEinklappAenderung(2));
  expect(ablauf.einfuehrungTeilaktion).toBe(8);
});

it.each(['favorit', 'lesezeichen'] as const)(
  'ignoriert Doppelklick und einen Zielwechsel während der %s-Speicherung',
  async (art) => {
    if (art === 'favorit') await bisFavorit();
    else await bisLesezeichen();
    const teilaktion = ablauf.einfuehrungTeilaktion;
    const speichern = () =>
      art === 'favorit'
        ? ablauf.favoritSpeichernMitEinfuehrung()
        : ablauf.lesezeichenSpeichernMitEinfuehrung();
    let freigeben!: () => void;
    let schreibenBegonnen!: () => void;
    const begonnen = new Promise<void>((resolve) => {
      schreibenBegonnen = resolve;
    });
    io.schreiben.mockImplementationOnce(async () => {
      schreibenBegonnen();
      await new Promise<void>((resolve) => {
        freigeben = resolve;
      });
    });
    let erster!: Promise<void>;
    await act(async () => {
      erster = speichern();
      await begonnen;
    });
    const anzahl = io.schreiben.mock.calls.length;
    await act(async () => speichern());
    expect(io.schreiben).toHaveBeenCalledTimes(anzahl);
    await norm('b');
    await act(async () => {
      freigeben();
      await erster;
    });
    expect(ablauf.einfuehrungTeilaktion).toBe(teilaktion);
    const xml = [...io.dateien.values()].join('');
    expect(xml).toContain('<bezeichnung>Art. 1</bezeichnung>');
    expect(xml).not.toContain('<bezeichnung>Art. 2</bezeichnung>');
    await act(async () => speichern());
    expect(ablauf.einfuehrungTeilaktion).toBe(teilaktion + 1);
    expect([...io.dateien.values()].join('')).toContain('<bezeichnung>Art. 2</bezeichnung>');
  },
);
it.each(['neustart', 'beenden'] as const)(
  'schaltet nach %s während des Speicherns nicht zusätzlich weiter',
  async (aktion) => {
    await bisFavorit();
    let freigeben!: () => void;
    let schreibenBegonnen!: () => void;
    const begonnen = new Promise<void>((resolve) => {
      schreibenBegonnen = resolve;
    });
    io.schreiben.mockImplementationOnce(async () => {
      schreibenBegonnen();
      await new Promise<void>((resolve) => {
        freigeben = resolve;
      });
    });
    let erster!: Promise<void>;
    await act(async () => {
      erster = ablauf.favoritSpeichernMitEinfuehrung();
      await begonnen;
    });
    await act(async () =>
      aktion === 'neustart' ? ablauf.einfuehrungNeuStarten() : ablauf.einfuehrungBeenden(),
    );
    const teilaktion = ablauf.einfuehrungTeilaktion;
    await act(async () => {
      freigeben();
      await erster;
    });
    expect(ablauf.einfuehrungTeilaktion).toBe(teilaktion);
    expect(await ladeFavoriten(gesetz)).toEqual(['Art. 1']);
  },
);
it('ignoriert auch ohne Zielwechsel den zweiten Klick bis der erste gespeichert ist', async () => {
  await bisFavorit();
  let freigeben!: () => void;
  let schreibenBegonnen!: () => void;
  const begonnen = new Promise<void>((resolve) => {
    schreibenBegonnen = resolve;
  });
  io.schreiben.mockImplementationOnce(async () => {
    schreibenBegonnen();
    await new Promise<void>((resolve) => {
      freigeben = resolve;
    });
  });
  let erster!: Promise<void>;
  await act(async () => {
    erster = ablauf.favoritSpeichernMitEinfuehrung();
    await begonnen;
  });
  await act(async () => ablauf.favoritSpeichernMitEinfuehrung());
  await act(async () => {
    freigeben();
    await erster;
  });
  expect(await ladeFavoriten(gesetz)).toEqual(['Art. 1']);
  expect(ablauf.einfuehrungTeilaktion).toBe(3);
  expect(io.schreiben).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'speichert außerhalb der Einführung ein Lesezeichen trotz laufender Favoritenspeicherung (währenddessen beendet: %s)',
  async (waehrenddessenBeendet) => {
    if (waehrenddessenBeendet) await bisFavorit();
    else await act(async () => ablauf.einfuehrungBeenden());
    let freigeben = () => {};
    let schreibenBegonnen = () => {};
    const begonnen = new Promise<void>((resolve) => {
      schreibenBegonnen = resolve;
    });
    const freigabe = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    io.schreiben.mockImplementationOnce(async () => {
      schreibenBegonnen();
      await freigabe;
    });
    const erster = ablauf.favoritSpeichernMitEinfuehrung();
    await begonnen;
    try {
      if (waehrenddessenBeendet) await act(async () => ablauf.einfuehrungBeenden());
      await act(async () => ablauf.lesezeichenSpeichernMitEinfuehrung());
      expect(await ladeLesezeichen()).toHaveLength(1);
      expect(io.dateien.get('lesezeichen/lesezeichen.xml')).toContain(
        '<bezeichnung>Art. 1</bezeichnung>',
      );
    } finally {
      await act(async () => {
        freigeben();
        await erster;
      });
    }
    expect(await ladeFavoriten(gesetz)).toEqual(['Art. 1']);
  },
);

it('löscht den Verbindungshinweis beim Schließen und beim Wechsel der Teilaktion', async () => {
  overlay = 'oeffnen';
  await zeichne();
  expect(ablauf.einfuehrungTeilaktion).toBe(1);
  await act(async () => ablauf.onKeineVerbindung(true));
  expect(ablauf.keineVerbindung).toBe(true);
  expect(ablauf.einfuehrungTeilaktion).toBe(1);
  overlay = null;
  await zeichne();
  expect(ablauf.keineVerbindung).toBe(false);
  overlay = 'oeffnen';
  await zeichne();
  await act(async () => ablauf.onKeineVerbindung(true));
  await act(async () => ablauf.onOeffnenNavigation());
  expect(ablauf.einfuehrungTeilaktion).toBe(2);
  expect(ablauf.keineVerbindung).toBe(false);
});

it.each(['favorit', 'lesezeichen'] as const)(
  'schaltet nach verzögerter %s-Speicherung bei gleichem Kurztitel und gleicher XML-ID eines anderen Normgebers nicht weiter',
  async (art) => {
    if (art === 'favorit') await bisFavorit();
    else await bisLesezeichen();
    const teilaktion = ablauf.einfuehrungTeilaktion;
    let freigeben!: () => void;
    let begonnen!: () => void;
    const start = new Promise<void>((resolve) => {
      begonnen = resolve;
    });
    io.schreiben.mockImplementationOnce(async () => {
      begonnen();
      await new Promise<void>((resolve) => {
        freigeben = resolve;
      });
    });
    const speichern =
      art === 'favorit'
        ? ablauf.favoritSpeichernMitEinfuehrung
        : ablauf.lesezeichenSpeichernMitEinfuehrung;
    let lauf!: Promise<void>;
    await act(async () => {
      lauf = speichern();
      await start;
    });
    const anderesGesetz = { ...gesetz, normgeber: 'de-bw' };
    tabsRef.current = [tabFuerTest({ id: 'tab', gesetz: anderesGesetz })];
    einklappZustandRef.current['tab-' + gesetzesreferenzSchluessel(anderesGesetz)] = {
      aktivesElementId: 'a',
      ueberschriften: new Set(),
      normen: new Set(),
    };
    await zeichne();
    try {
      await act(async () => {
        freigeben();
        await lauf;
      });
      expect(ablauf.einfuehrungTeilaktion).toBe(teilaktion);
      const datei = io.dateien.get(
        art === 'favorit' ? 'favoriten/GG_de-bund-favoriten.xml' : 'lesezeichen/lesezeichen.xml',
      );
      expect(datei).toContain('normgeber="de-bund"');
      expect(datei).not.toContain('normgeber="de-bw"');
    } finally {
      tabsRef.current = [tabFuerTest({ id: 'tab', gesetz })];
    }
  },
);

it('zeigt während der Einführung die Standardanordnung und danach wieder die gespeicherte Einstellung', async () => {
  localStorage.setItem('lexlata.leistenTauschen', 'true');
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'lexlata.leistenTauschen', newValue: 'true' }),
    ),
  );
  expect(ablauf.leistenTauschenEffektiv).toBe(false);
  await act(async () => ablauf.einfuehrungBeenden());
  expect(ablauf.leistenTauschenEffektiv).toBe(true);
  expect(localStorage.getItem('lexlata.leistenTauschen')).toBe('true');
});
