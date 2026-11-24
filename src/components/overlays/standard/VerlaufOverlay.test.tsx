// @vitest-environment jsdom
// VerlaufOverlay.test.tsx
// Echte Verlaufsvorschau über die öffentliche AbsatzListe mit Originaldaten und Navigation.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { normtextPfad, pfadAusBlatt } from '@/test/gesetz/textpfadFabrik';
import { act } from 'react';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { blattPfad, textAnTextpfad } from '@/lib/domain/textpfad/textpfad.index';
import { VerlaufOverlay, type VerlaufOverlayProps } from './VerlaufOverlay';

const dom = domTestWurzel();
let bestand: ReturnType<typeof erzeugeGeladeneGesetze>;
function uebernehmen(gesetz: GesetzDarstellung | null) {
  assert(gesetz);
  bestand.uebernehmeGeladenes(gesetz);
  return bestand.ladeGesetz;
}
async function anzeigen(props: VerlaufOverlayProps, erwarteterKopf: string) {
  await act(async () => dom.root.render(<VerlaufOverlay {...props} />));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(dom.host.textContent).toContain(erwarteterKopf);
  });
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  bestand = erzeugeGeladeneGesetze();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  bestand.beenden();
  vi.restoreAllMocks();
});

for (const silbentrennung of [true, false]) {
  it.each(['Doppelklick', 'Steuerung', 'Command'] as const)(
    `erhält geschützte Vorschau und originale Navigation mit %s (Silbentrennung: ${silbentrennung})`,
    async (aktion) => {
      const gesetz = parseGesetzesXML(
        '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 9999</bezeichnung><titel>😀 Art. 1 Abs. 2 I 3</titel><text><absatz zahl="(1)"><satz zahl="1">😀 Art. 2<nummer zahl="1">Abs. 3</nummer>§ 9999 Abs. 1 I 2</satz></absatz></text></norm></inhalt></gesetz>',
      )!;
      const el = gesetz.elemente[0]!;
      if (el.typ !== 'norm') throw new Error('Norm fehlt');
      const norm = el.data;
      const verlauf = {
        eintraege: [
          {
            gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
            xmlId: norm.xmlId,
          },
        ],
        position: 0,
      };
      const vorher = structuredClone({ gesetz, verlauf });
      const schliessen = vi.fn();
      const oeffnen = vi.fn();
      const neuerTab = vi.fn();
      await anzeigen(
        {
          textDarstellung: {
            schriftgroesse: 19,
            silbentrennung,
            schriftart: 'serif',
            zeilenabstand: 1.8,
            blocksatz: false,
            satzNeuZeile: true,
          },
          verlauf,
          ladeGesetz: uebernehmen(gesetz),
          onSchliessen: schliessen,
          onOeffnen: oeffnen,
          onNeuenTabOeffnen: neuerTab,
        },
        'TestG: 😀 Art.\u00a01 Abs.\u00a02 I 3',
      );
      const kopf = [...dom.host.querySelectorAll<HTMLElement>('span')].find(
        (s) => s.textContent === '§\u00a09999 TestG: 😀 Art.\u00a01 Abs.\u00a02 I 3',
      )!;
      expect(kopf).toBeDefined();
      expect(kopf.style.fontWeight).toBe('600');
      expect(kopf.style.fontSize).toBe('19px');
      expect(kopf.parentElement?.style.paddingRight).toBe('38px');
      const pfeilspalte = kopf.previousElementSibling;
      assert(pfeilspalte);
      expect(kopf.parentElement?.children).toHaveLength(2);
      expect(pfeilspalte.querySelector('svg')).not.toBeNull();
      expect(dom.host.querySelector('[data-leaf]')).toBeNull();
      await act(async () => kopf.click());
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(dom.host.querySelector('[data-zeichen-versatz]')).not.toBeNull();
      });
      const fortsetzung = dom.host.querySelector<HTMLElement>('[data-zeichen-versatz]')!;
      const textRahmen = dom.host.querySelector<HTMLElement>('[lang]');
      const vorschau = dom.host.querySelector<HTMLElement>('.gesetz-text');
      expect(vorschau?.style.paddingLeft).toBe('38px');
      expect(vorschau?.style.paddingRight).toBe('38px');
      expect(textRahmen?.style.getPropertyValue('--hyphens')).toBe(
        silbentrennung ? 'auto' : 'none',
      );
      expect(dom.host.querySelector('[style*="font-size: 19px"]')).not.toBeNull();
      expect(getComputedStyle(fortsetzung).fontWeight).not.toBe('600');
      expect(fortsetzung.textContent).toBe('§\u00a09999 Abs.\u00a01 I 2');
      expect(fortsetzung.getAttribute('data-zeichen-versatz')).toBe(String('😀 Art. 2'.length));
      expect(pfadAusBlatt(blattPfad(fortsetzung))).toEqual(
        normtextPfad({ absatz: '(1)', satz: 1 }),
      );
      expect(
        textAnTextpfad(norm, {
          pfad: pfadAusBlatt(blattPfad(fortsetzung)),
          zeichenbereichStart: '😀 Art. 2'.length,
          zeichenbereichEnde: '😀 Art. 2'.length + 13,
        }),
      ).toBe('§\u00a09999 Abs.\u00a01');
      const gruppe = [...fortsetzung.querySelectorAll<HTMLElement>('span')].find(
        (s) => s.style.whiteSpace === 'nowrap' && s.textContent === '§\u00a09999',
      );
      expect(gruppe).toBeDefined();
      expect(dom.host.querySelectorAll('[data-leaf]')).toHaveLength(3);
      await act(async () => kopf.click());
      expect(dom.host.querySelector('[data-leaf]')).toBeNull();
      expect(oeffnen).not.toHaveBeenCalled();
      expect(neuerTab).not.toHaveBeenCalled();
      await act(async () =>
        kopf.dispatchEvent(
          new MouseEvent(aktion === 'Doppelklick' ? 'dblclick' : 'mousedown', {
            bubbles: true,
            cancelable: true,
            ctrlKey: aktion === 'Steuerung',
            metaKey: aktion === 'Command',
          }),
        ),
      );
      const navigation = aktion === 'Doppelklick' ? oeffnen : neuerTab;
      expect(navigation).toHaveBeenCalledExactlyOnceWith(
        verlauf.eintraege[0]!.gesetzesreferenz,
        norm.xmlId,
      );
      expect(navigation.mock.calls[0]![0]).toBe(verlauf.eintraege[0]!.gesetzesreferenz);
      expect(schliessen).toHaveBeenCalledTimes(1);
      expect(schliessen.mock.invocationCallOrder[0]).toBeLessThan(
        navigation.mock.invocationCallOrder[0]!,
      );
      expect({ gesetz, verlauf }).toEqual(vorher);
    },
  );
}

it('behält fehlende Gesetze als Referenzziele ohne fremde gleichnamige Vorschau', async () => {
  const fremdes = parseGesetzesXML(
    '<gesetz><infos><kurztitel>X</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Fremde Norm</titel><text/></norm></inhalt></gesetz>',
  )!;
  const gesetzesreferenz = { kurztitel: 'X', normgeber: 'de-bw' };
  const oeffnen = vi.fn();
  await act(async () =>
    dom.root.render(
      <VerlaufOverlay
        textDarstellung={{
          schriftgroesse: 19,
          silbentrennung: true,
          schriftart: 'serif',
          zeilenabstand: 1.5,
          blocksatz: false,
          satzNeuZeile: true,
        }}
        verlauf={{ eintraege: [{ gesetzesreferenz, xmlId: 'p1' }], position: 0 }}
        ladeGesetz={uebernehmen(fremdes)}
        onSchliessen={vi.fn()}
        onOeffnen={oeffnen}
        onNeuenTabOeffnen={vi.fn()}
      />,
    ),
  );
  expect(dom.host.textContent).toContain('Eintrag nicht verfügbar X');
  expect(dom.host.textContent).not.toContain('Fremde Norm');
  const zeile = [...dom.host.querySelectorAll('span')].find(
    (span) => span.textContent === 'Eintrag nicht verfügbar X',
  )!;
  await act(async () => zeile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(oeffnen).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz, 'p1');
});

it.each(['Doppelklick', 'Steuerung', 'Command'] as const)(
  'zeigt eine Überschrift ohne Vorschau und öffnet sie mit %s',
  async (aktion) => {
    const gesetz = parseGesetzesXML(
      '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><gliederung gliederungskennzahl="001"><bezeichnung>Teil 1</bezeichnung><titel>Allgemeine Vorschriften</titel></gliederung></inhalt></gesetz>',
    );
    assert(gesetz);
    const gesetzesreferenz = { kurztitel: 'TestG', normgeber: 'de-bund' };
    const schliessen = vi.fn();
    const oeffnen = vi.fn();
    const neuerTab = vi.fn();
    await anzeigen(
      {
        textDarstellung: {
          schriftgroesse: 19,
          silbentrennung: true,
          schriftart: 'serif',
          zeilenabstand: 1.5,
          blocksatz: false,
          satzNeuZeile: true,
        },
        verlauf: { eintraege: [{ gesetzesreferenz, xmlId: 'ueberschrift:001' }], position: 0 },
        ladeGesetz: uebernehmen(gesetz),
        onSchliessen: schliessen,
        onOeffnen: oeffnen,
        onNeuenTabOeffnen: neuerTab,
      },
      'Teil 1 TestG: Allgemeine Vorschriften',
    );
    const kopf = [...dom.host.querySelectorAll('span')].find(
      (span) => span.textContent === 'Teil 1 TestG: Allgemeine Vorschriften',
    );
    assert(kopf);
    const zeile = kopf.parentElement;
    assert(zeile);
    expect(kopf.style.fontWeight).toBe('600');
    expect(zeile.children).toHaveLength(2);
    const pfeilspalte = kopf.previousElementSibling;
    assert(pfeilspalte);
    expect(kopf.style.fontSize).toBe('19px');
    expect(kopf.style.fontWeight).toBe('600');
    expect(kopf.parentElement?.style.paddingRight).toBe('38px');
    expect(pfeilspalte.textContent).toBe('');
    expect(pfeilspalte.children).toHaveLength(0);
    expect(zeile.querySelector('svg')).toBeNull();
    await act(async () => kopf.click());
    expect(dom.host.querySelector('.gesetz-text')).toBeNull();
    expect(oeffnen).not.toHaveBeenCalled();
    expect(neuerTab).not.toHaveBeenCalled();
    const ereignis = new MouseEvent(aktion === 'Doppelklick' ? 'dblclick' : 'mousedown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: aktion === 'Steuerung',
      metaKey: aktion === 'Command',
    });
    await act(async () => zeile.dispatchEvent(ereignis));
    const navigation = aktion === 'Doppelklick' ? oeffnen : neuerTab;
    expect(navigation).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz, 'ueberschrift:001');
    expect(aktion === 'Doppelklick' ? neuerTab : oeffnen).not.toHaveBeenCalled();
    expect(schliessen).toHaveBeenCalledTimes(1);
    const navigationsreihenfolge = navigation.mock.invocationCallOrder[0];
    assert(navigationsreihenfolge);
    expect(schliessen.mock.invocationCallOrder[0]).toBeLessThan(navigationsreihenfolge);
  },
);

it('zeigt eine fehlende Überschrift und den leeren Verlauf neutral an', async () => {
  const gesetz = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt/></gesetz>',
  );
  assert(gesetz);
  const props = {
    textDarstellung: {
      schriftgroesse: 19,
      silbentrennung: true,
      schriftart: 'serif' as const,
      zeilenabstand: 1.5,
      blocksatz: false,
      satzNeuZeile: true,
    },
    ladeGesetz: uebernehmen(gesetz),
    onSchliessen: vi.fn(),
    onOeffnen: vi.fn(),
    onNeuenTabOeffnen: vi.fn(),
  };
  await act(async () =>
    dom.root.render(
      <VerlaufOverlay
        {...props}
        verlauf={{
          eintraege: [
            {
              gesetzesreferenz: { normgeber: 'de-bund', kurztitel: 'TestG' },
              xmlId: 'ueberschrift:001',
            },
          ],
          position: 0,
        }}
      />,
    ),
  );
  expect(dom.host.textContent).toContain('Eintrag nicht verfügbar TestG');
  await act(async () =>
    dom.root.render(<VerlaufOverlay {...props} verlauf={{ eintraege: [], position: 0 }} />),
  );
  expect(dom.host.textContent).toContain('Noch keine Einträge im Verlauf dieses Tabs');
});
