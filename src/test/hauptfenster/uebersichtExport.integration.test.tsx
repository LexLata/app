// @vitest-environment jsdom
// Prüft Exportziel und Lebensdauer der Übersichtsauswahl über Tastatur und natives Menü.
import { nativeAttrappeZuruecksetzen, io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useCallback, useRef, useState } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { appOverlayHostFixture } from './appOverlayHostFixture';
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { useAppAktionen } from '@/hooks/useAppAktionen';
import { useTastenkuerzel } from '@/hooks/eingabe/useTastenkuerzel';
import { useMenueEvents } from '@/hooks/eingabe/useMenueEvents';
import type { AktivesOverlay } from '@/lib/domain/appTypes';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';

const dom = domTestWurzel();
const nichts = () => {};
const gesetzA = gesetzMitNormen(['§ 1'], { kurztitel: 'A' });
const gesetzB = gesetzMitNormen(['§ 1'], { kurztitel: 'B' });
const gesetzC = gesetzMitNormen(['§ 1'], { kurztitel: 'C' });
const gesetze = [gesetzA, gesetzB, gesetzC];
const exportieren = vi.fn(async () => {});
function Probe() {
  const [overlay, setOverlay] = useState<AktivesOverlay | null>('uebersicht');
  const exportAktionRef = useRef<(() => void) | null>(null);
  const anmelden = useCallback((aktion: (() => void) | null) => {
    exportAktionRef.current = aktion;
  }, []);
  const tabsRef = useRef([tabFuerTest({ id: 'a', gesetz: gesetzA })]);
  const aktiverTabIdRef = useRef<string | null>('a');
  const aktionen = useAppAktionen({
    tabsRef,
    aktiverTabIdRef,
    uebersichtExportAktionRef: exportAktionRef,
    tabSchliessen: nichts,
    tabWiederherstellen: nichts,
    fensterSchliessen: nichts,
    verlaufNavigieren: nichts,
    gesetzesreferenzOeffnen: () => nichts,
    gesetzInfoInTabsPatchen: nichts,
    aktivesOverlay: overlay,
    setAktivesOverlay: setOverlay,
  });
  const eingabe = {
    ...aktionen,
    erstelleLeerenTab: nichts,
    tabWiederherstellen: nichts,
    tabsRef,
    aktiverTabIdRef,
    setAktivesOverlay: setOverlay,
    setOeffnenOverlayInitial: nichts,
    handleFavoritSpeichern: nichts,
    handleLesezeichenSpeichern: nichts,
    handleAlleLesezeichenEntfernen: nichts,
    handleUnterstreichen: nichts,
    handleHervorheben: nichts,
    handleVerweismarkierungAnfrage: nichts,
    handleKommentarAnfrage: nichts,
    handleMarkierungRueckgaengig: nichts,
    handleMarkierungWiederholen: nichts,
    einfuehrungAktiv: false,
    einfuehrungTeilaktion: 0,
  };
  useMenueEvents({ ...eingabe, einfuehrungNeuStarten: nichts });
  useTastenkuerzel({
    ...eingabe,
    gesetzeskurzbefehle: {},
    gesetze: [],
    lesezeichenEintraege: [],
    gesetzesreferenzOeffnen: () => nichts,
    elementOeffnen: nichts,
    setAktiverTabId: nichts,
    handleLesezeichenOeffnen: nichts,
    handleZuklappen: nichts,
    handleAufklappen: nichts,
  });
  return (
    <>
      <button onClick={() => setOverlay('uebersicht')}>Übersicht öffnen</button>
      <output>{overlay}</output>
      <AppOverlayHost
        {...appOverlayHostFixture({
          gesetze,
          aktiverTab: tabsRef.current[0],
          aktivesOverlay: overlay,
          onSchliessen: () => setOverlay(null),
          onExportieren: exportieren,
          onLoeschen: async () => {},
          onUebersichtExportAktionAnmelden: anmelden,
        })}
      />
    </>
  );
}
beforeEach(async () => {
  nativeAttrappeZuruecksetzen();
  exportieren.mockClear();
  document.body.append(dom.host);
  await act(async () => dom.root.render(<Probe />));
});
async function klick(text: string) {
  const element = Array.from(dom.host.querySelectorAll('button')).find(
    (el) => el.textContent === text,
  );
  assert(element);
  await act(async () => element.click());
}
async function auswaehlen(kurztitel: string) {
  const text = Array.from(dom.host.querySelectorAll('span')).find(
    (el) => el.textContent === kurztitel,
  );
  assert(text);
  await act(async () => text.click());
}
async function exportTaste(modifikator: 'metaKey' | 'ctrlKey' = 'ctrlKey') {
  await act(async () =>
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'e',
        code: 'KeyE',
        [modifikator]: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
it.each(['metaKey', 'ctrlKey'] as const)(
  'exportiert die Übersichtsauswahl über beide Eingabewege genau einmal und hält sie aktuell (%s)',
  async (modifikator) => {
    await auswaehlen('B');
    await exportTaste(modifikator);
    expect(exportieren).toHaveBeenCalledExactlyOnceWith(referenzVon(gesetzB));
    expect(dom.host.querySelector('output')?.textContent).toBe('uebersicht');
    exportieren.mockClear();
    await act(async () =>
      io.listener.get('export-oeffnen')?.forEach((fn) => fn({ payload: undefined })),
    );
    expect(exportieren).toHaveBeenCalledExactlyOnceWith(referenzVon(gesetzB));
    await auswaehlen('C');
    exportieren.mockClear();
    await exportTaste(modifikator);
    expect(exportieren).toHaveBeenCalledExactlyOnceWith(referenzVon(gesetzC));
  },
);
it('verwirft die Auswahl beim Abwählen, Filtern und Schließen und öffnet danach das allgemeine Export-Overlay', async () => {
  for (const fall of ['abwaehlen', 'filtern', 'schliessen', 'ohne-auswahl']) {
    if (fall !== 'ohne-auswahl') await auswaehlen('B');
    if (fall === 'abwaehlen')
      await act(async () =>
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })),
      );
    if (fall === 'filtern') {
      const input = dom.host.querySelector('input');
      assert(input);
      const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      assert(setzen);
      await act(async () => {
        setzen.call(input, 'C');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    if (fall === 'schliessen')
      await act(async () =>
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      );
    exportieren.mockClear();
    await exportTaste();
    expect(exportieren).not.toHaveBeenCalled();
    expect(dom.host.querySelector('output')?.textContent).toBe('export');
    expect(dom.host.textContent).toContain('Aktuelles Gesetz (A)');
    await klick('Übersicht öffnen');
  }
});
