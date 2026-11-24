// @vitest-environment jsdom
// Prüft einheitliche Titelfarben und den Zeiger für das aktive Element durch Bedienung.
import { act, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EinklappCtx } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  TextDarstellungsRahmen,
  useTextDarstellungsModell,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { NormBlock } from './normBlock';
import { UeberschriftZeile } from './ueberschriftZeile';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(100);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Ansicht({ minimal, weggefallen }: { minimal: boolean; weggefallen: boolean }) {
  const basis = useContext(EinklappCtx);
  const modell = useTextDarstellungsModell({});
  const [aktivesElementId, setAktivesElementId] = useState<string | null>(null);
  const [gesetz] = useState(() =>
    parseGesetzesXML(
      `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel></infos><inhalt><norm id="n1"${weggefallen ? ' status="weggefallen"' : ''}><bezeichnung>§ 1</bezeichnung><titel>Titel</titel>${weggefallen ? '' : '<text>Inhalt.</text>'}</norm></inhalt></gesetz>`,
    ),
  );
  const element = gesetz?.elemente[0];
  if (element?.typ !== 'norm') throw new Error('Norm erwartet');
  return (
    <TextDarstellungsRahmen modell={modell}>
      <EinklappCtx.Provider
        value={{
          ...basis,
          minimalistischerModus: minimal,
          aktivesElementId,
          onNormKlick: setAktivesElementId,
          onUeberschriftKlick: setAktivesElementId,
        }}
      >
        <button onClick={() => setAktivesElementId(element.data.id)}>Norm aufrufen</button>
        <UeberschriftZeile
          schrift={15}
          u={{
            id: 'u1',
            xmlId: 'ueberschrift:001',
            gliederungskennzahl: '001',
            ebene: 1,
            bezeichnung: 'Erster Teil',
          }}
        />
        <NormBlock norm={element.data} schrift={15} satzNeuZeile />
      </EinklappCtx.Provider>
    </TextDarstellungsRahmen>
  );
}

it.each([false, true])(
  'zeigt bei minimalistischem Modus %s den Zeiger am aktiven Element, auch bei weggefallenen Normen',
  async (minimal) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      for (const weggefallen of [false, true]) {
        await act(async () =>
          root.render(
            <Ansicht key={String(weggefallen)} minimal={minimal} weggefallen={weggefallen} />,
          ),
        );
        const ueberschrift = host.querySelector<HTMLElement>('[data-xml-id="ueberschrift:001"]');
        const norm = host.querySelector<HTMLElement>('[data-xml-id="n1"] .gt-klapp-zeile');
        const aufruf = host.querySelector<HTMLButtonElement>('button');
        if (!ueberschrift || !norm || !aufruf) throw new Error('Bedienelement fehlt');
        expect(ueberschrift.style.color).toBe('var(--aktiv-element)');
        const farbe = norm.style.color;
        const zeiger = () =>
          host.querySelectorAll<HTMLElement>(
            'span[aria-hidden="true"][style*="position: absolute"]',
          );
        expect(zeiger()).toHaveLength(0);
        await act(async () => ueberschrift.click());
        expect(zeiger()).toHaveLength(1);
        expect(ueberschrift.contains(zeiger().item(0))).toBe(true);
        expect(ueberschrift.style.color).toBe('var(--aktiv-element)');
        expect(ueberschrift.style.paddingLeft).toBe(minimal ? '9px' : '21px');
        await act(async () => {
          if (weggefallen) aufruf.click();
          else norm.click();
        });
        expect(zeiger()).toHaveLength(1);
        expect(norm.contains(zeiger().item(0))).toBe(true);
        expect(norm.style.color).toBe(farbe);
        expect(norm.style.paddingLeft).toBe(minimal ? '9px' : '21px');
        expect(host.querySelectorAll('.gt-chevron').length).toBe(minimal ? 0 : weggefallen ? 1 : 2);
      }
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  },
);
