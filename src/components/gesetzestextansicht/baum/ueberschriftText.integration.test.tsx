// @vitest-environment jsdom
// Prüft Überschrifttext durch Schreiben, Lesen und Bedienung der Anzeige.
import { act, useContext, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { baueGesetzesXML } from '@/lib/import/basis/basis.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { EinklappCtx } from '@/components/gesetzestextansicht/Gesetzestextansicht.context';
import { UeberschriftZeile } from '@/components/gesetzestextansicht/baum/ueberschriftZeile';
import {
  TextDarstellungsRahmen,
  useTextDarstellungsModell,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';

beforeAll(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterAll(() => vi.unstubAllGlobals());

it('zeigt geschriebenen und gelesenen Überschrifttext wie Norminhalt und verbirgt ihn beim Einklappen', async () => {
  const xml = baueGesetzesXML(
    {
      normgeber: 'de-bund',
      kurztitel: 'G',
      langtitel: 'Gesetz',
      verarbeitungszeit: new Date('2026-01-01'),
    },
    [
      {
        type: 'gliederung',
        bez: 'Teil 1',
        titel: 'Allgemeines',
        ebene: 1,
        gliederungskennzahl: '010',
        absaetze: [1, 2].map((n) => ({
          nummer: `(${n})`,
          elemente: [{ type: 'texte', saetze: [`Regelung ${n}.`] }],
        })),
      },
    ],
  );
  const gesetz = parseGesetzesXML(xml);
  if (!gesetz) throw new Error('Gesetz erwartet');
  const element = gesetz.elemente[0];
  if (element?.typ !== 'ueberschrift') throw new Error('Überschrift erwartet');
  const ueberschrift = element.data;
  function AnsichtMitText() {
    const basis = useContext(EinklappCtx);
    const [zu, setZu] = useState(false);
    const modell = useTextDarstellungsModell({});
    return (
      <TextDarstellungsRahmen modell={modell}>
        <EinklappCtx.Provider
          value={{
            ...basis,
            eingeklappteUeberschriften: new Set(zu ? [ueberschrift.id] : []),
            onUeberschriftKlick: () => setZu(!zu),
          }}
        >
          <UeberschriftZeile u={ueberschrift} schrift={15} />
        </EinklappCtx.Provider>
      </TextDarstellungsRahmen>
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AnsichtMitText />));
    expect(host.textContent).toContain('Teil 1');
    expect(host.textContent).toContain('Allgemeines');
    expect(host.querySelector('[data-nicht-markierbar]')?.textContent).toContain('(1)');
    expect(host.textContent).toContain('Regelung 1.');
    await act(async () => host.querySelector<HTMLElement>('.gt-klapp-zeile')?.click());
    expect(host.textContent).not.toContain('Regelung 1.');
    expect(host.textContent).toContain('Allgemeines');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
