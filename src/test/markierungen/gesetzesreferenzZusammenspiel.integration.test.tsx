import { geladenesTabGesetz } from '@/test/tabs/tabFabriken';
// @vitest-environment jsdom
// Gesetzesreferenz vom Import mit Bestandsabgleich bis zur Wiederherstellung;
// Fachmodule und Hooks bleiben echt, nur native I/O-Grenzen sind Attrappen.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useFensterRestore } from '@/hooks/fenster/useFensterRestore';
import { loeseImportKonflikt } from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { ladeFensterZustand } from '@/lib/persistenz/fenster/fenster.index';
import { speichereAktivierung } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';

const fenster = new Map<
  string,
  { tabs: ReturnType<typeof useAppTabs>; restore: ReturnType<typeof useFensterRestore> }
>();
function zustand() {
  return fenster.get('main')!;
}
const wurzeln: Root[] = [];
function Hauptfenster() {
  const tabs = useAppTabs();
  const restore = useFensterRestore(
    tabs.tabs,
    tabs.aktiverTabId,
    tabs.tabsRef,
    tabs.aktiverTabIdRef,
    tabs.verlaufLesen,
    tabs.verlaufSetzen,
    tabs.uebernehmeTabGesetz,
  );
  fenster.set('main', { tabs, restore });
  return null;
}
async function starteHauptfenster() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  await act(async () => root.render(<Hauptfenster />));
  let wiederhergestellt = false;
  await act(async () => {
    wiederhergestellt = await zustand().restore.initialRestore(
      zustand().tabs.ladeGesetz,
      zustand().tabs.setTabs,
      zustand().tabs.setAktiverTabId,
    );
  });
  return wiederhergestellt;
}
function gesetzXML(kurztitel: string, normgeber: string, text: string) {
  return `<gesetz version="1"><infos><kurztitel>${kurztitel}</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><normgeber>${normgeber}</normgeber></infos><inhalt>
    <norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz><satz>Erste Norm.</satz></absatz></text></norm>
    <norm id="p2"><bezeichnung>§ 2</bezeichnung><text><absatz><satz>${text}</satz></absatz></text></norm>
  </inhalt></gesetz>`;
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  aufbau.bereiteNativeAttrappeVor();
});
afterEach(async () => {
  await aufbau.raeumeTestFensterAuf(wurzeln);
  fenster.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['de-bund', 'unbekannt'])(
  'erhält Bestandsschreibweise, Tab und aktive Norm nach Import Bgb und Neustart (Normgeber %s)',
  async (normgeber) => {
    const referenz = { kurztitel: 'BGB', normgeber };
    const gesetzpfad = aufbau.basis + `gesetze/BGB_${normgeber}.xml`;
    aufbau.native.texte.set(gesetzpfad, gesetzXML('BGB', normgeber, 'Alter Inhalt.'));
    aufbau.native.texte.set(
      '/import/Bgb.xml',
      gesetzXML('Bgb', normgeber.toLowerCase(), 'Neuer Inhalt.'),
    );
    const bericht = await importierePfade(['/import/Bgb.xml']);
    expect(bericht.fehler).toEqual([]);
    expect(bericht.konflikte).toHaveLength(1);
    await loeseImportKonflikt(bericht.konflikte[0]!, 'ersetzen');
    expect([...aufbau.native.texte.keys()].filter((pfad) => pfad.includes('/gesetze/'))).toEqual([
      gesetzpfad,
    ]);
    expect(aufbau.native.texte.get(gesetzpfad)).toContain('<kurztitel>BGB</kurztitel>');
    expect(aufbau.native.texte.get(gesetzpfad)).toContain('Neuer Inhalt.');
    const erneut = await importierePfade(['/import/Bgb.xml']);
    expect(erneut.fehler).toEqual([]);
    expect(erneut.konflikte).toEqual([]);
    expect(erneut.berichtEintraege).toEqual([
      { kategorie: 'gesetz', aktion: 'unveraendert', name: 'Bgb', quelle: 'Bgb.xml' },
    ]);
    const [gesetz] = await ladeAlleGesetze();
    expect(referenzVon(gesetz!)).toEqual(referenz);
    expect(gesetz).not.toHaveProperty('id');
    vi.useFakeTimers();
    expect(await starteHauptfenster()).toBe(false);
    const aktiveNorm = gesetz!.elemente[1]!;
    speichereAktivierung(gesetz!, aktiveNorm);
    await act(async () =>
      zustand().tabs.gesetzOeffnen(gesetz!, aktiveNorm.data.xmlId, 'aktiver-tab'),
    );
    expect(zustand().tabs.tabs).toHaveLength(1);
    expect(zustand().tabs.tabs[0]!.initialNorm).toBe('p2');
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(ladeFensterZustand('main')?.tabs).toEqual([{ gesetzesreferenz: referenz }]);
    await aufbau.raeumeTestFensterAuf(wurzeln);
    expect(await starteHauptfenster()).toBe(true);
    expect(zustand().tabs.tabs).toHaveLength(1);
    expect(referenzVon(geladenesTabGesetz(zustand().tabs, zustand().tabs.tabs[0]))).toEqual(
      referenz,
    );
    expect(zustand().tabs.holeTabGesetz(zustand().tabs.tabs[0])).not.toBe(gesetz);
    expect(zustand().tabs.tabs[0]!.initialNorm).toBe('p2');
    expect(zustand().tabs.aktiverTabId).toBe(zustand().tabs.tabs[0]!.id);
  },
);
