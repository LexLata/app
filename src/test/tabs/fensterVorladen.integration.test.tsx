// @vitest-environment jsdom
// Startbarrieren und Leerlauf mit echten Hooks, Fensterbestand und Persistenz; nur native Grenzen ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFensterVorladen } from '@/hooks/useFensterVorladen';
import { useSuchverzeichnis } from '@/hooks/useSuchverzeichnis';
import {
  erzeugeGeladeneGesetze,
  bereiteSuchverzeichnisVor,
} from '@/lib/gesetz-laden/gesetz-laden.index';
import { merkeAnzeige } from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { vergleicheSuchverzeichnisDateistempel } from '@/lib/persistenz/gesetz/gesetz.index';
import { erstelleSpeicherbericht } from '@/lib/utils/speicherMessung';
const ref = (kurztitel: string) => ({ kurztitel, normgeber: 'de-bund' });
let root: Root;
let container: HTMLElement;
let bestand: ReturnType<typeof erzeugeGeladeneGesetze>;
let callbacks: IdleRequestCallback[];
let protokoll: string[];
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  callbacks = [];
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  protokoll = [];
  io.vorLesen = (pfad) => {
    protokoll.push(pfad.replace('/daten/LexLata/', ''));
    return undefined;
  };
  for (let i = 0; i < 12; i++) {
    const name = `G${i}`;
    io.dateien.set(
      `gesetze/${name}_de-bund.xml`,
      `<gesetz><infos><kurztitel>${name}</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz>Inhalt</absatz></text></norm></inhalt></gesetz>`,
    );
    merkeAnzeige(ref(name));
  }
  bestand = erzeugeGeladeneGesetze();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  bestand.beenden();
  vi.unstubAllGlobals();
});
function Fenster({ start, indizes }: { start: boolean; indizes: boolean }) {
  useSuchverzeichnis(start);
  useFensterVorladen(start, indizes, bestand.vorladen);
  return null;
}
it('liest das Suchverzeichnis nach den Starttabs und lädt die zehn jüngsten Gesetze erst nach beiden Barrieren im Leerlauf', async () => {
  await act(async () => root.render(<Fenster start={false} indizes={false} />));
  expect(protokoll).toEqual([]);
  expect(callbacks).toHaveLength(0);
  await act(async () => root.render(<Fenster start indizes={false} />));
  expect(protokoll).toContain('cache/suchverzeichnis.json');
  expect(callbacks).toHaveLength(0);
  await act(async () => root.render(<Fenster start indizes />));
  expect(io.invoke.mock.calls.some(([name]) => name === 'gesetz_dateistempel_lesen')).toBe(true);
  expect(protokoll.filter((p) => p.startsWith('gesetze/'))).toEqual([]);
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      callbacks.shift()?.({ didTimeout: false, timeRemaining: () => 20 });
      // Der Idlecallback startet das asynchrone Laden; maßgeblich ist sein öffentlicher Abschluss.
      await vi.waitFor(() => expect(bestand.holeGeladenes(ref(`G${11 - i}`))).toBeDefined());
    });
  }
  expect(callbacks).toHaveLength(0);
  expect(protokoll.filter((p) => p.startsWith('gesetze/'))).toHaveLength(10);
  expect(bestand.holeGeladenes(ref('G1'))).toBeUndefined();
  const { gesetze } = bestand.holeBestandsauskunft();
  expect(gesetze.map((g) => g.zustand)).toEqual(Array(10).fill('vorgeladen'));
  expect(erstelleSpeicherbericht().posten.map((p) => p.name)).toContain('Suchverzeichnis');
});
it('vergleicht Dateistempel ohne GesetzesXML und lädt bei unbekanntem Ordner nichts vor', async () => {
  expect(await vergleicheSuchverzeichnisDateistempel()).toMatchObject({ aktuell: false });
  expect(protokoll.filter((p) => p.startsWith('gesetze/'))).toEqual([]);
  const invoke = io.invoke.getMockImplementation();
  if (!invoke) throw new Error('Native Grenze fehlt');
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') throw new Error('Ordner gesperrt');
    return invoke(name, args);
  });
  await act(async () => root.render(<Fenster start indizes />));
  expect(callbacks).toHaveLength(0);
  expect(protokoll.filter((p) => p.startsWith('gesetze/'))).toEqual([]);
});

function Teilstand() {
  const { eintraege } = useSuchverzeichnis();
  return <div>{eintraege.map((e) => e.kurztitel).join(',')}</div>;
}
it('zeigt ein veröffentlichtes Paket bereits während das folgende Paket noch eingelesen wird', async () => {
  const vorlage = io.dateien.get('gesetze/G0_de-bund.xml');
  if (!vorlage) throw new Error('Vorlage fehlt');
  io.dateien.clear();
  for (const name of ['A', 'B', 'C'])
    io.dateien.set(`gesetze/${name}_de-bund.xml`, vorlage.replaceAll('G0', name));
  let weiter = () => {};
  const warten = new Promise<void>((r) => {
    weiter = r;
  });
  let cBegonnen = false;
  io.vorLesen = (pfad) => {
    if (pfad.endsWith('/C_de-bund.xml')) {
      cBegonnen = true;
      return warten;
    }
    return undefined;
  };
  await act(async () => root.render(<Teilstand />));
  let lauf = Promise.resolve(true);
  await act(async () => {
    lauf = bereiteSuchverzeichnisVor();
  });
  try {
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(cBegonnen).toBe(true);
    });
    // Der fachliche Gesamtabschluss steht noch aus; A ist bereits suchbar.
    expect(container.textContent).toBe('A');
  } finally {
    await act(async () => {
      weiter();
      await lauf;
    });
  }
});
it('lädt die gemeinsamen Anzeigezeitpunkte für zwei Fenster in jeweils den eigenen Bestand vor', async () => {
  const zweiterBestand = erzeugeGeladeneGesetze();
  // Browser gewährt jedem tatsächlich angeforderten Hintergrundschritt Budget.
  // Die Abnahme wartet auf beide öffentlichen Vorladeabschlüsse statt auf eine
  // angenommene Zahl von React-/Promise-Zwischenschritten.
  let naechsteAnfrage = 0;
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    const id = ++naechsteAnfrage;
    queueMicrotask(() => callback({ didTimeout: false, timeRemaining: () => 20 }));
    return id;
  });
  let ersteAnmeldung = () => {};
  let zweiteAnmeldung = () => {};
  const ersterAbschluss = new Promise<void>((resolve) => {
    ersteAnmeldung = resolve;
  });
  const zweiterAbschluss = new Promise<void>((resolve) => {
    zweiteAnmeldung = resolve;
  });
  const erstesVorladen: typeof bestand.vorladen = async (referenzen) => {
    await bestand.vorladen(referenzen);
    ersteAnmeldung();
  };
  const zweitesVorladen: typeof bestand.vorladen = async (referenzen) => {
    await zweiterBestand.vorladen(referenzen);
    zweiteAnmeldung();
  };
  function ZweiFenster() {
    useFensterVorladen(true, true, erstesVorladen);
    useFensterVorladen(true, true, zweitesVorladen);
    return null;
  }
  try {
    await act(async () => {
      root.render(<ZweiFenster />);
    });
    await act(async () => {
      await Promise.all([ersterAbschluss, zweiterAbschluss]);
    });
    for (const fenster of [bestand, zweiterBestand]) {
      expect(fenster.holeGeladenes(ref('G11'))).toBeDefined();
      expect(fenster.holeGeladenes(ref('G2'))).toBeDefined();
      expect(fenster.holeGeladenes(ref('G1'))).toBeUndefined();
    }
    expect(bestand.holeGeladenes(ref('G11'))).not.toBe(zweiterBestand.holeGeladenes(ref('G11')));
    expect(callbacks).toHaveLength(0);
  } finally {
    zweiterBestand.beenden();
  }
});
