// @vitest-environment jsdom
// Prüft den Überschriftenabstand beim Einklappen durch Bedienung der echten Zeile.
import { act, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EinklappCtx } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import { UeberschriftZeile } from './ueberschriftZeile';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

function Ansicht({ ebene, mitTrenner }: { ebene: number; mitTrenner: boolean }) {
  const basis = useContext(EinklappCtx);
  const [eingeklappt, setEingeklappt] = useState(false);
  return (
    <EinklappCtx.Provider
      value={{
        ...basis,
        eingeklappteUeberschriften: new Set(eingeklappt ? ['u1'] : []),
        trennerVorIds: new Set(mitTrenner ? ['u1'] : []),
        onUeberschriftKlick: () => setEingeklappt((wert) => !wert),
      }}
    >
      <UeberschriftZeile
        schrift={15}
        u={{
          id: 'u1',
          xmlId: 'ueberschrift:001',
          gliederungskennzahl: '001',
          ebene,
          bezeichnung: 'Erster Teil',
        }}
      />
    </EinklappCtx.Provider>
  );
}

function gesamtabstand(zeile: HTMLElement): number {
  const trenner = zeile.previousElementSibling;
  const stil = getComputedStyle(zeile);
  if (!(trenner instanceof HTMLElement)) return parseFloat(stil.paddingTop);
  const trennerStil = getComputedStyle(trenner);
  return (
    parseFloat(trennerStil.marginTop) +
    parseFloat(trenner.style.borderTop) +
    parseFloat(stil.paddingTop)
  );
}

describe('Überschriftenabstand beim Einklappen', () => {
  it.each([
    [1, false, 44],
    [1, true, 44],
    [2, false, 32],
    [2, true, 32],
    [3, false, 24],
    [3, true, 24],
  ] as const)(
    'Ebene %i, Trenner %s: behält den oberen Gesamtabstand %i',
    async (ebene, mitTrenner, erwartet) => {
      const host = document.createElement('div');
      host.style.setProperty('--trenner-ebene', 'black');
      document.body.append(host);
      const root = createRoot(host);
      try {
        await act(async () => root.render(<Ansicht ebene={ebene} mitTrenner={mitTrenner} />));
        const zeile = host.querySelector<HTMLElement>('[data-xml-id="ueberschrift:001"]');
        if (!zeile) throw new Error('Überschriftenzeile fehlt');
        expect(gesamtabstand(zeile)).toBe(erwartet);
        const farbe = zeile.style.color;
        await act(async () => zeile.click());
        expect(zeile.style.color).not.toBe(farbe);
        expect(gesamtabstand(zeile)).toBe(erwartet);
        await act(async () => zeile.click());
        expect(zeile.style.color).toBe(farbe);
        expect(gesamtabstand(zeile)).toBe(erwartet);
      } finally {
        await act(async () => root.unmount());
        host.remove();
      }
    },
  );
});
