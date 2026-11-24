// @vitest-environment jsdom
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
// Echte Suchoberfläche: Einführung sperrt Abbruch und neue Tabs.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { assert, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { OeffnenOverlay } from './OeffnenOverlay';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';
const { abruf } = vi.hoisted(() => ({ abruf: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: abruf }));
afterEach(() => vi.restoreAllMocks());
const dom = domTestWurzel();
const gesetz = gesetzDarstellung({
  kurztitel: 'GG',
  elemente: [{ typ: 'norm', data: normaleNorm({ bezeichnung: 'Art. 1' }) }],
});
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  setzeSuchverzeichnisTestdaten([gesetz]);
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
async function taste(key: string, ctrlKey = false) {
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey })));
}
it.each([true, false])(
  'Abbruch und neuer Tab folgen der Einführungssperre %s',
  async (gesperrt) => {
    const schliessen = vi.fn();
    const oeffnen = vi.fn();
    const neuerTab = vi.fn();
    await act(async () =>
      dom.root.render(
        <OeffnenOverlay
          gesetze={[gesetz]}
          aktivesGesetz={gesetz}
          initialInput="1"
          einfuehrungGesperrt={gesperrt ? true : undefined}
          onSchliessen={schliessen}
          onGesetzOeffnen={oeffnen}
          onNeuenTabOeffnen={neuerTab}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest([gesetz], oeffnen, neuerTab)}
        />,
      ),
    );
    await taste('Escape');
    expect(schliessen).toHaveBeenCalledTimes(gesperrt ? 0 : 1);
    const backdrop = dom.host.querySelector<HTMLElement>('[data-overlay-aktiv]');
    assert(backdrop);
    await act(async () => backdrop.click());
    expect(schliessen).toHaveBeenCalledTimes(gesperrt ? 0 : 2);
    await taste('Enter', true);
    expect(oeffnen).toHaveBeenCalledTimes(gesperrt ? 1 : 0);
    expect(neuerTab).toHaveBeenCalledTimes(gesperrt ? 0 : 1);
    expect(schliessen).toHaveBeenCalledTimes(gesperrt ? 1 : 3);
  },
);

it.each(['offline', 'geworfener Verbindungsfehler', 'anderer Fehler'])(
  'meldet %s und löscht den Hinweis bei neuer Eingabe',
  async (art) => {
    io.dateien.set(
      'importindizes/de-bund.xml',
      '<?xml version="1.0"?><importindex version="1"><infos><verarbeitungszeit herkunft="nutzer">2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt><gesetz><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung>bgb</abrufkennung></gesetz></inhalt></importindex>',
    );
    if (art === 'geworfener Verbindungsfehler') {
      io.dateien.set(
        'importindizes/de-bw.xml',
        io.dateien.get('importindizes/de-bund.xml')?.replace('de-bund', 'de-bw') ?? '',
      );
      io.dateien.delete('importindizes/de-bund.xml');
      vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockImplementation(() => {
        throw new TypeError('Failed to fetch');
      });
    }
    if (art === 'offline') abruf.mockRejectedValue(new TypeError('Failed to fetch'));
    else abruf.mockResolvedValue({ ok: false, status: 404 });
    const verbindung = vi.fn();
    const schliessen = vi.fn();
    await act(async () =>
      dom.root.render(
        <OeffnenOverlay
          gesetze={[]}
          aktivesGesetz={null}
          initialInput="BGB"
          onKeineVerbindung={verbindung}
          onSchliessen={schliessen}
          onGesetzOeffnen={vi.fn()}
          onNeuenTabOeffnen={vi.fn()}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest([], vi.fn(), vi.fn())}
        />,
      ),
    );
    await taste('Enter');
    await act(async () => vi.dynamicImportSettled());
    if (art !== 'geworfener Verbindungsfehler') expect(abruf).toHaveBeenCalled();
    expect(verbindung).toHaveBeenLastCalledWith(art !== 'anderer Fehler');
    expect(schliessen).not.toHaveBeenCalled();
    const input = dom.host.querySelector('input');
    assert(input);
    await act(async () => {
      const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      assert(setzen);
      setzen.call(input, 'GG');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(verbindung).toHaveBeenLastCalledWith(false);
  },
);
