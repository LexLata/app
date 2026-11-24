// @vitest-environment jsdom
// Tastenkürzel wechseln den Suchbereich im echten Overlay-Host ohne Eingabeverlust.
import { act, useState } from 'react';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { AppOverlayHost } from './OverlayHost';
import { useTastenkuerzel } from '@/hooks/eingabe/useTastenkuerzel';
import type { AktivesOverlay } from '@/lib/domain/appTypes';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { appOverlayHostFixture } from '@/test/hauptfenster/appOverlayHostFixture';
import { menueUndTastenAktionenFuerTest } from '@/test/plattform/menueUndTastenAktionenFuerTest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';

vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
const dom = domTestWurzel();
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

it.each(['volltextSuche', 'volltextAlle'] as const)(
  'erhält die Eingabe beim Wechsel aus %s und zurück',
  async (start) => {
    const gesetz = parseGesetzesXML(
      '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>Suchwort</absatz></text></norm></inhalt></gesetz>',
    );
    assert(gesetz);
    const props = appOverlayHostFixture({ gesetze: [gesetz], aktivesGesetz: gesetz });
    function Probe() {
      const [overlay, setOverlay] = useState<AktivesOverlay | null>(start);
      useTastenkuerzel({
        ...menueUndTastenAktionenFuerTest(),
        setAktivesOverlay: setOverlay,
        tabsRef: { current: [] },
        aktiverTabIdRef: { current: 'tab' },
        gesetzeskurzbefehle: {},
        gesetze: [],
        lesezeichenEintraege: [],
        elementOeffnen: props.elementOeffnen,
        gesetzesreferenzOeffnen: props.gesetzesreferenzOeffnen,
        setAktiverTabId: vi.fn(),
        handleLesezeichenOeffnen: vi.fn(),
        verlaufSchrittUndOeffnen: vi.fn(),
        handleZuklappen: vi.fn(),
        handleAufklappen: vi.fn(),
        einfuehrungAktiv: false,
        einfuehrungTeilaktion: 0,
      });
      return <AppOverlayHost {...props} aktivesOverlay={overlay} />;
    }
    await act(async () => dom.root.render(<Probe />));
    const eingabe = () => {
      const feld = dom.host.querySelector<HTMLInputElement>('input:not([type="checkbox"])');
      assert(feld);
      return feld;
    };
    await act(async () => {
      const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      assert(setzen);
      setzen.call(eingabe(), 'Suchwort');
      eingabe().dispatchEvent(new Event('input', { bubbles: true }));
    });
    for (const ziel of [start === 'volltextSuche' ? 'volltextAlle' : 'volltextSuche', start]) {
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'f',
            code: 'KeyF',
            metaKey: true,
            shiftKey: ziel === 'volltextAlle',
          }),
        );
      });
      expect(eingabe().placeholder).toBe(
        ziel === 'volltextAlle'
          ? 'Text in allen Gesetzen suchen …'
          : 'Text im geöffneten Gesetz suchen …',
      );
      expect(eingabe().value).toBe('Suchwort');
      expect(dom.host.querySelector('[data-idx="0"]')?.textContent).toContain('Suchwort');
    }
  },
);
