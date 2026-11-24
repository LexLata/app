// @vitest-environment jsdom
// Die Verlaufanzeige verwendet den echten Bestand und hält ausschließlich Zeilentexte und angeforderte Vorschauen.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useLayoutEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { VerlaufOverlay } from '@/components/overlays/overlays.index';
const dom = domTestWurzel();
const referenz = { kurztitel: 'A', normgeber: 'de-bund' };
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  io.dateien.set(
    'gesetze/A_de-bund.xml',
    '<gesetz><infos><kurztitel>A</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><titel>Probe</titel><text><absatz><satz>Gezielter Vorschautext</satz></absatz></text></norm></inhalt></gesetz>',
  );
});
it.each([false, true])(
  'lädt erst bei angefordertem Verlauf und erhält den bisherigen Bestandsschutz (offen: %s)',
  async (offen) => {
    let bestand: ReturnType<typeof useAppTabs> | undefined;
    const verlauf = { eintraege: [{ gesetzesreferenz: referenz, xmlId: 'n1' }], position: 0 };
    function Probe({ sichtbar, renderNummer }: { sichtbar: boolean; renderNummer: number }) {
      const tabs = useAppTabs();
      useLayoutEffect(() => {
        bestand = tabs;
      });
      return (
        <div data-render={renderNummer}>
          {sichtbar ? (
            <VerlaufOverlay
              textDarstellung={{
                schriftgroesse: 19,
                silbentrennung: true,
                schriftart: 'serif',
                zeilenabstand: 1.8,
                blocksatz: false,
                satzNeuZeile: true,
              }}
              verlauf={verlauf}
              ladeGesetz={tabs.ladeGesetz}
              onSchliessen={() => {}}
              onOeffnen={() => {}}
              onNeuenTabOeffnen={() => {}}
            />
          ) : null}
        </div>
      );
    }
    const gelesen: string[] = [];
    let freigeben = () => {};
    const wartet = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    io.vorLesen = (pfad) => {
      gelesen.push(pfad);
      return gelesen.length > 2 ? wartet : undefined;
    };
    try {
      await act(async () => dom.root.render(<Probe sichtbar={false} renderNummer={0} />));
      expect(gelesen).toEqual([]);
      if (offen)
        await act(async () => bestand?.setTabs([{ id: 'offen', gesetzesreferenz: referenz }]));
      await act(async () => dom.root.render(<Probe sichtbar renderNummer={1} />));
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(dom.host.textContent).toContain('A: Probe');
      });
      expect(gelesen).toHaveLength(1);
      expect(Boolean(bestand?.holeGeladenes(referenz))).toBe(offen);
      for (let renderNummer = 2; renderNummer <= 4; renderNummer++)
        await act(async () => dom.root.render(<Probe sichtbar renderNummer={renderNummer} />));
      expect(gelesen).toHaveLength(1);
      const kopf = [...dom.host.querySelectorAll<HTMLElement>('span')].find(
        (el) => el.textContent === '§\u00a01 A: Probe',
      );
      expect(kopf).toBeDefined();
      expect(dom.host.textContent).not.toContain('Gezielter Vorschautext');
      await act(async () => kopf?.click());
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(dom.host.textContent).toContain('Gezielter Vorschautext');
      });
      expect(gelesen).toHaveLength(offen ? 1 : 2);
      expect(Boolean(bestand?.holeGeladenes(referenz))).toBe(offen);
      for (let renderNummer = 5; renderNummer <= 7; renderNummer++)
        await act(async () => dom.root.render(<Probe sichtbar renderNummer={renderNummer} />));
      expect(gelesen).toHaveLength(offen ? 1 : 2);
      await act(async () => kopf?.click());
      expect(dom.host.textContent).not.toContain('Gezielter Vorschautext');
    } finally {
      await act(async () => dom.root.render(null));

      freigeben();
      vi.restoreAllMocks();
    }
  },
);
