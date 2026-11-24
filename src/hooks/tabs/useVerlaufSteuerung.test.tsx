// Prüft den alleinigen Besitzer des tabweiten Verlaufs und seine Render-Auslöser.
import { act, createElement, StrictMode, useEffect, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { verlaufPfeilzustaende } from '@/lib/domain/app/tabVerlauf';
import { useVerlaufSteuerung } from './useVerlaufSteuerung';

let root: Root;
let steuerung: ReturnType<typeof useVerlaufSteuerung>;
let renderAnzahl: number;
const tabsRef = { current: [{ id: 'tab' }] };
const eintrag = { gesetzesreferenz: { normgeber: 'de-bund', kurztitel: 'BGB' }, xmlId: 'p1' };
const verlauf = { eintraege: [eintrag], position: 0 };
function VerlaufTest() {
  const aktuell = useVerlaufSteuerung(tabsRef);
  useLayoutEffect(() => {
    renderAnzahl++;
    steuerung = aktuell;
  });
  return null;
}

beforeEach(async () => {
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  renderAnzahl = 0;
  const container = document.querySelector('main');
  assert(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(VerlaufTest)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('liest ohne neuen Render und setzt den Verlauf mit genau einem neuen Render', () => {
  expect(steuerung.verlaufLesen('tab')).toBeUndefined();
  act(() => steuerung.verlaufSetzen('tab', verlauf));
  expect(renderAnzahl).toBe(2);
  expect(steuerung.verlaufLesen('tab')).toBe(verlauf);
  expect(renderAnzahl).toBe(2);
});
it('entfernt den Verlauf mit genau einem neuen Render', () => {
  act(() => steuerung.verlaufSetzen('tab', verlauf));
  act(() => steuerung.verlaufEntfernen('tab'));
  expect(steuerung.verlaufLesen('tab')).toBeUndefined();
  expect(renderAnzahl).toBe(3);
});
it('trägt nur für vorhandene Tabs ein und rendert pro bestätigter Änderung einmal', async () => {
  act(() => steuerung.verlaufHinzufuegen('fehlt', eintrag));
  expect(steuerung.verlaufLesen('fehlt')).toBeUndefined();
  expect(renderAnzahl).toBe(1);
  act(() => steuerung.verlaufHinzufuegen('tab', eintrag));
  expect(renderAnzahl).toBe(2);
  act(() => steuerung.verlaufHinzufuegen('tab', { ...eintrag, xmlId: 'p2' }));
  expect(renderAnzahl).toBe(3);
  const oeffnen = vi.fn((ziel, melden: (erfolg: boolean) => void) => {
    melden(true);
    steuerung.verlaufAktivierung('tab', ziel, 'vorgegeben');
    return () => {};
  });
  await act(async () => steuerung.verlaufNavigieren('tab', 'zurueck', oeffnen));
  expect(oeffnen.mock.calls[0]?.[0]).toEqual(eintrag);
  expect(renderAnzahl).toBe(4);
  await act(async () => steuerung.verlaufNavigieren('tab', 'zurueck', oeffnen));
  expect(oeffnen).toHaveBeenCalledOnce();
  expect(renderAnzahl).toBe(4);
});

it('meldet Schritte ohne Liste und ohne weitere Render bei unveränderten Pfeilen', () => {
  act(() => steuerung.verlaufSetzen('tab', verlauf));
  act(() => steuerung.verlaufAktivierung('tab', { ...eintrag, xmlId: 'D' }, 'schritt'));
  const vorher = renderAnzahl;
  act(() => steuerung.verlaufAktivierung('tab', { ...eintrag, xmlId: 'E' }, 'schritt'));
  expect(renderAnzahl).toBe(vorher);
  expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([eintrag]);
});

it('wartet nach erfolgreicher Navigation auf das Echo vor dem nächsten Befehl', async () => {
  const alt = { ...eintrag, xmlId: 'alt' };
  act(() => steuerung.verlaufSetzen('tab', { eintraege: [eintrag, alt], position: 0 }));
  act(() => steuerung.verlaufAktivierung('tab', { ...eintrag, xmlId: 'D' }, 'schritt'));
  const abschluesse: ((erfolg: boolean) => void)[] = [];
  const oeffnen = vi.fn((_ziel, melden: (erfolg: boolean) => void) => {
    abschluesse.push(melden);
    return () => {};
  });
  act(() => {
    steuerung.verlaufNavigieren('tab', 'zurueck', oeffnen);
    steuerung.verlaufNavigieren('tab', 'zurueck', oeffnen);
  });
  await act(async () => abschluesse[0]?.(true));
  expect(oeffnen).toHaveBeenCalledTimes(1);
  expect(steuerung.verlaufLesen('tab')?.aktivesElement?.xmlId).toBe('D');
  await act(async () => steuerung.verlaufAktivierung('tab', eintrag, 'vorgegeben'));
  expect(oeffnen.mock.calls[1]?.[0]).toEqual(alt);
  expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke?.eintrag.xmlId).toBe('D');
});

const element = (xmlId: string) => ({ ...eintrag, xmlId });
function melden(xmlId: string, art: 'schritt' | 'vorgegeben' = 'schritt') {
  act(() => steuerung.verlaufAktivierung('tab', element(xmlId), art));
}
function pfeile() {
  return verlaufPfeilzustaende(steuerung.verlaufLesen('tab'));
}
async function navigieren(richtung: 'zurueck' | 'vorwaerts') {
  await act(async () =>
    steuerung.verlaufNavigieren('tab', richtung, (ziel, fertig) => {
      fertig(true);
      steuerung.verlaufAktivierung('tab', ziel, 'vorgegeben');
      return () => {};
    }),
  );
}
it('führt nach drei Schritten über den Eintrag zur Rückkehrmarke und verbraucht sie', async () => {
  act(() => steuerung.verlaufSetzen('tab', verlauf));
  melden('B');
  melden('C');
  melden('D');
  expect(pfeile()).toEqual({ kannZurueck: true, kannVorwaerts: false });
  await navigieren('zurueck');
  expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([eintrag]);
  expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke?.eintrag).toEqual(element('D'));
  expect(pfeile()).toEqual({ kannZurueck: false, kannVorwaerts: true });
  await navigieren('vorwaerts');
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(element('D'));
  expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke).toBeUndefined();
  expect(pfeile()).toEqual({ kannZurueck: true, kannVorwaerts: false });
});
it('geht abgewichen ohne Marke zum neueren Eintrag und bleibt am Rand stehen', async () => {
  act(() => steuerung.verlaufSetzen('tab', { eintraege: [element('neu'), eintrag], position: 1 }));
  melden('D');
  await navigieren('vorwaerts');
  expect(steuerung.verlaufLesen('tab')?.position).toBe(0);
  expect(steuerung.verlaufLesen('tab')?.aktivesElement?.xmlId).toBe('neu');
  melden('E');
  await navigieren('vorwaerts');
  expect(steuerung.verlaufLesen('tab')?.aktivesElement?.xmlId).toBe('E');
});
it('behält die Marke beim Echo und verwirft sie beim nächsten Schritt', async () => {
  act(() => steuerung.verlaufSetzen('tab', verlauf));
  melden('D');
  await navigieren('zurueck');
  melden(eintrag.xmlId, 'vorgegeben');
  expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke?.eintrag.xmlId).toBe('D');
  melden('E');
  expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke).toBeUndefined();
});
it.each(['norm', '001'])(
  'trägt nach 60 s auch %s ein und setzt bei Wechseln zurück',
  async (xmlId) => {
    vi.useFakeTimers();
    act(() => steuerung.verlaufSichtbarkeit('tab'));
    melden('vorher');
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    melden(xmlId);
    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([element(xmlId)]);
    expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke).toBeUndefined();
  },
);
it.each(['anderer', 'leer'])(
  'stoppt beim Wechsel nach %s und startet bei Rückkehr volle 60 s ohne Echoverschiebung',
  (tabId) => {
    vi.useFakeTimers();
    act(() => {
      steuerung.verlaufSetzen('tab', verlauf);
      steuerung.verlaufSichtbarkeit('tab');
    });
    melden('D');
    act(() => {
      vi.advanceTimersByTime(40_000);
    });
    act(() => steuerung.verlaufSichtbarkeit(tabId));
    act(() => {
      vi.advanceTimersByTime(80_000);
    });
    expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([eintrag]);
    act(() => steuerung.verlaufSichtbarkeit('tab'));
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    melden('D', 'vorgegeben');
    act(() => {
      vi.advanceTimersByTime(29_999);
    });
    expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([eintrag]);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([element('D'), eintrag]);
    act(() => steuerung.verlaufSichtbarkeit(tabId));
    act(() => steuerung.verlaufSichtbarkeit('tab'));
    expect(vi.getTimerCount()).toBe(0);
  },
);
it('stoppt beim Navigationsbeginn und bei Unmount ohne verspätete Einträge', async () => {
  vi.useFakeTimers();
  act(() => {
    steuerung.verlaufSetzen('tab', verlauf);
    steuerung.verlaufSichtbarkeit('tab');
  });
  melden('D');
  act(() => {
    vi.advanceTimersByTime(59_999);
  });
  await navigieren('zurueck');
  act(() => {
    vi.advanceTimersByTime(80_000);
  });
  expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([eintrag]);
  melden('E');
  const vorher = steuerung.verlaufLesen('tab');
  await act(async () => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  act(() => {
    vi.advanceTimersByTime(80_000);
  });
  expect(steuerung.verlaufLesen('tab')).toBe(vorher);
});
it('verbraucht eine Marke weder bei Fehler noch vor Echo und entwertet alte Abschlüsse durch Schritte', async () => {
  act(() => steuerung.verlaufSetzen('tab', verlauf));
  melden('D');
  await navigieren('zurueck');
  const vorher = steuerung.verlaufLesen('tab');
  let fertig: (erfolg: boolean) => void = () => {
    throw new Error('Öffnung fehlt');
  };
  const oeffnen = (_ziel: typeof eintrag, melden: (erfolg: boolean) => void) => {
    fertig = melden;
    return () => {};
  };
  await act(async () => steuerung.verlaufNavigieren('tab', 'vorwaerts', oeffnen));
  await act(async () => fertig(false));
  expect(steuerung.verlaufLesen('tab')).toBe(vorher);
  await act(async () => steuerung.verlaufNavigieren('tab', 'vorwaerts', oeffnen));
  await act(async () => fertig(true));
  expect(steuerung.verlaufLesen('tab')).toBe(vorher);
  melden('E');
  const neu = steuerung.verlaufLesen('tab');
  await act(async () => fertig(true));
  expect(steuerung.verlaufLesen('tab')).toBe(neu);
  expect(neu?.aktivesElement?.xmlId).toBe('E');
  expect(neu?.rueckkehrmarke).toBeUndefined();
});
it('blockiert bei bereits aktivem Ziel ohne Wechselcallback keinen Folgebefehl', async () => {
  act(() => steuerung.verlaufSetzen('tab', { ...verlauf, aktivesElement: eintrag }));
  const oeffnen = vi.fn((_ziel, fertig: (erfolg: boolean) => void) => {
    fertig(true);
    return () => {};
  });
  await act(async () => {
    steuerung.verlaufNavigieren('tab', eintrag, oeffnen);
    steuerung.verlaufNavigieren('tab', eintrag, oeffnen);
  });
  expect(oeffnen).toHaveBeenCalledTimes(2);
});

it('räumt StrictMode-Probeläufe auf und erfasst die Stelle im zweiten Aufbau genau einmal', async () => {
  vi.useFakeTimers();
  let probe: ReturnType<typeof useVerlaufSteuerung> | undefined;
  function StrictProbe() {
    const verlauf = useVerlaufSteuerung(tabsRef);
    useEffect(() => {
      probe = verlauf;
      verlauf.verlaufSichtbarkeit('tab');
      verlauf.verlaufAktivierung('tab', element('D'), 'schritt');
      // Jeder Effektaufbau entspricht hier einer neuen Bedienung.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- StrictMode-Aufbau gezielt prüfen, keine erneute Aktivierung nach dem Timer-Render.
    }, []);
    return null;
  }
  await act(async () => root.render(createElement(StrictMode, null, createElement(StrictProbe))));
  expect(vi.getTimerCount()).toBe(1);
  act(() => {
    vi.advanceTimersByTime(59_999);
  });
  expect(probe?.verlaufLesen('tab')?.eintraege).toEqual([]);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(probe?.verlaufLesen('tab')?.eintraege).toEqual([element('D')]);
  expect(vi.getTimerCount()).toBe(0);
});

it('verwirft den wiederholten Abschluss eines fehlgeschlagenen Vorgängers nach Beginn des nächsten Befehls', async () => {
  act(() =>
    steuerung.verlaufSetzen('tab', {
      eintraege: [element('A'), element('B'), element('C')],
      position: 0,
    }),
  );
  melden('A', 'vorgegeben');
  const abschluesse: ((erfolg: boolean) => void)[] = [];
  const oeffnen = (_ziel: typeof eintrag, melden: (erfolg: boolean) => void) => {
    abschluesse.push(melden);
    return () => {};
  };
  await act(async () => {
    steuerung.verlaufNavigieren('tab', 'zurueck', oeffnen);
    steuerung.verlaufNavigieren('tab', element('C'), oeffnen);
  });
  await act(async () => abschluesse[0]?.(false));
  expect(abschluesse).toHaveLength(2);
  await act(async () => abschluesse[0]?.(true));
  melden('B', 'vorgegeben');
  expect(steuerung.verlaufLesen('tab')?.position).toBe(0);
  await act(async () => abschluesse[1]?.(true));
  await act(async () => steuerung.verlaufAktivierung('tab', element('C'), 'vorgegeben'));
  expect(steuerung.verlaufLesen('tab')?.position).toBe(2);
});

it('bewahrt aktive Stelle und Marke beim Tabwechsel und verwirft die Marke beim Timer-Eintrag', async () => {
  vi.useFakeTimers();
  act(() => steuerung.verlaufSetzen('tab', verlauf));
  melden('D');
  await navigieren('zurueck');
  const marke = steuerung.verlaufLesen('tab')?.rueckkehrmarke;
  act(() => steuerung.verlaufSichtbarkeit('anderer'));
  expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(eintrag);
  expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke).toBe(marke);
  // Ein vorgegebenes Echo ändert die aktive Stelle, ohne die Marke anzutasten.
  melden('E', 'vorgegeben');
  act(() => steuerung.verlaufSichtbarkeit('tab'));
  expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke).toBe(marke);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([element('E'), eintrag]);
  expect(steuerung.verlaufLesen('tab')?.rueckkehrmarke).toBeUndefined();
});

it('bewahrt bei Bedienung ohne Aktivwechsel die verbleibenden 20 Sekunden der Lesefrist', () => {
  vi.useFakeTimers();
  act(() => {
    steuerung.verlaufSetzen('tab', verlauf);
    steuerung.verlaufSichtbarkeit('tab');
    steuerung.verlaufAktivierung('tab', element('D'), 'schritt');
  });
  act(() => {
    vi.advanceTimersByTime(40_000);
  });
  act(() => steuerung.verlaufBedienung('tab'));
  act(() => {
    vi.advanceTimersByTime(19_999);
  });
  expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([eintrag]);
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([element('D'), eintrag]);
});

it.each(['Bedienung', 'Ladefehler', 'Rand'])(
  'führt die Lesefrist nach %s ohne verlorene aktive Stelle fort',
  async (art) => {
    vi.useFakeTimers();
    act(() => {
      steuerung.verlaufSetzen('tab', verlauf);
      steuerung.verlaufSichtbarkeit('tab');
      steuerung.verlaufAktivierung('tab', element('D'), 'schritt');
      vi.advanceTimersByTime(40_000);
    });
    let abschliessen: ((erfolg: boolean) => void) | undefined;
    const oeffnen = vi.fn((_ziel: typeof eintrag, melden: (erfolg: boolean) => void) => {
      abschliessen = melden;
      return () => {};
    });
    act(() =>
      steuerung.verlaufNavigieren('tab', art === 'Rand' ? 'vorwaerts' : 'zurueck', oeffnen),
    );
    if (art === 'Rand') expect(oeffnen).not.toHaveBeenCalled();
    else expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      if (art === 'Bedienung') steuerung.verlaufBedienung('tab');
      if (art === 'Ladefehler') {
        assert(abschliessen);
        abschliessen(false);
      }
    });
    expect(steuerung.verlaufLesen('tab')?.aktivesElement).toEqual(element('D'));
    act(() => {
      vi.advanceTimersByTime(art === 'Rand' ? 19_999 : 59_999);
    });
    expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([eintrag]);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([element('D'), eintrag]);
  },
);

it('wartet nach einem Ladefehler mit der neuen Lesefrist auf den letzten Folgebefehl', async () => {
  vi.useFakeTimers();
  act(() => {
    steuerung.verlaufSetzen('tab', verlauf);
    steuerung.verlaufSichtbarkeit('tab');
    steuerung.verlaufAktivierung('tab', element('D'), 'schritt');
  });
  const abschluesse: ((erfolg: boolean) => void)[] = [];
  const oeffnen = (_ziel: typeof eintrag, melden: (erfolg: boolean) => void) => {
    abschluesse.push(melden);
    return () => {};
  };
  act(() => {
    steuerung.verlaufNavigieren('tab', 'zurueck', oeffnen);
    steuerung.verlaufNavigieren('tab', 'zurueck', oeffnen);
  });
  const erster = abschluesse[0];
  assert(erster);
  await act(async () => erster(false));
  expect(abschluesse).toHaveLength(2);
  act(() => {
    steuerung.verlaufSichtbarkeit(null);
    steuerung.verlaufSichtbarkeit('tab');
  });
  expect(vi.getTimerCount()).toBe(0);
  const letzter = abschluesse[1];
  assert(letzter);
  await act(async () => letzter(false));
  expect(vi.getTimerCount()).toBe(1);
});

it.each(['leerer Tab', 'anderer Tab', 'geschlossen', 'Erfolg am Zeiger', 'Schritt'])(
  'beachtet nach laufender Navigation den Abschluss %s bei der Lesefrist',
  async (abschluss) => {
    vi.useFakeTimers();
    const vorherigeTabs = tabsRef.current;
    try {
      act(() => {
        steuerung.verlaufSetzen('tab', verlauf);
        steuerung.verlaufSichtbarkeit('tab');
        steuerung.verlaufAktivierung('tab', element('D'), 'schritt');
        vi.advanceTimersByTime(40_000);
      });
      let fertig: ((erfolg: boolean) => void) | undefined;
      act(() =>
        steuerung.verlaufNavigieren('tab', 'zurueck', (_ziel, melden) => {
          fertig = melden;
          return () => {};
        }),
      );
      assert(fertig);
      const melden = fertig;
      await act(async () => {
        if (abschluss === 'leerer Tab') steuerung.verlaufSichtbarkeit(null);
        if (abschluss === 'anderer Tab') steuerung.verlaufSichtbarkeit('anderer');
        if (abschluss === 'geschlossen') {
          tabsRef.current = [];
          steuerung.verlaufBedienung('tab');
        }
        if (abschluss === 'Erfolg am Zeiger') {
          melden(true);
          steuerung.verlaufAktivierung('tab', eintrag, 'vorgegeben');
        } else if (abschluss === 'Schritt') {
          steuerung.verlaufAktivierung('tab', element('E'), 'schritt');
        } else melden(false);
      });
      expect(vi.getTimerCount()).toBe(abschluss === 'Schritt' ? 1 : 0);
      act(() => {
        vi.advanceTimersByTime(59_999);
      });
      expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual([eintrag]);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(steuerung.verlaufLesen('tab')?.eintraege).toEqual(
        abschluss === 'Schritt' ? [element('E'), eintrag] : [eintrag],
      );
    } finally {
      tabsRef.current = vorherigeTabs;
    }
  },
);
