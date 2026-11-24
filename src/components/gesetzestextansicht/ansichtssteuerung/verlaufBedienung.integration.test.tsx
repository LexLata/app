// @vitest-environment jsdom
// Echte Öffnungs- und Ansichtshooks schützen Textbedienung vor verspäteter Verlaufsnavigation.
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useAnsichtssteuerung } from './useAnsichtssteuerung';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import type { Tab } from '@/lib/domain/appTypes';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({ getVirtualItems: () => [], getTotalSize: () => 0 }),
}));
const gesetz = gesetzDarstellung({
  elemente: [
    {
      typ: 'ueberschrift',
      data: {
        id: 'oben',
        xmlId: 'ueberschrift:001',
        gliederungskennzahl: '001',
        ebene: 1,
        bezeichnung: 'Teil',
      },
    },
    ...['A', 'B'].map((id) => ({
      typ: 'norm' as const,
      data: normaleNorm({ id, xmlId: id, bezeichnung: id }),
    })),
  ],
});
const eintrag = (xmlId: string) => ({ gesetzesreferenz: gesetz, xmlId });
it.each(['Normzeile', 'Text', 'Überschrift', 'Klappstufe', 'Tastatur'] as const)(
  '%s entwertet laufende Verlaufsnavigation auch ohne Aktivwechsel',
  async (bedienung) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const aktivesElementId = bedienung === 'Überschrift' ? 'oben' : 'A';
    const aktiv = eintrag(bedienung === 'Überschrift' ? 'ueberschrift:001' : 'A');
    let tabs!: ReturnType<typeof useAppTabs>;
    let navigation!: ReturnType<typeof useGesetzOeffnen>;
    let ansicht!: ReturnType<typeof useAnsichtssteuerung>;
    type Ladeergebnis = { liste: (typeof gesetz)[]; befunde: []; ordnerLesbar: boolean };
    let fertig!: (ergebnis: Ladeergebnis) => void;
    const laden = vi.fn(
      () =>
        new Promise<Ladeergebnis>((resolve) => {
          fertig = resolve;
        }),
    );
    function Ansicht({ tab }: { tab: Tab }) {
      ansicht = useAnsichtssteuerung({
        gesetz,
        initialAktivesElementId: aktivesElementId,
        initialNorm: tab.initialNorm,
        onBedienung: () => tabs.verlaufBedienung(tab.id),
        messung: erstelleTestTextMessung(),
        inhaltEinzug: 12,
        satzNeuZeile: true,
        textAlign: 'left',
        hyphens: 'auto',
        lang: 'de',
        strukturKontextLeisteGroesse: 1,
        onAktivierung: ({ xmlId, art }) => tabs.verlaufAktivierung(tab.id, eintrag(xmlId), art),
      });
      return null;
    }
    function Probe() {
      const t = useAppTabs();
      const n = useGesetzOeffnen({
        ...gesetzOeffnenFixture(t, [gesetz]),

        ladeGesetz: einzelzugriffFuerTest(laden),
      });
      useLayoutEffect(() => {
        tabs = t;
        navigation = n;
      });
      const tab = t.tabs.find((tab) => tab.id === t.aktiverTabId);
      return t.holeTabGesetz(tab) ? <Ansicht tab={tab!} /> : null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      await act(async () => root.render(<Probe />));
      await act(async () => tabs.setTabs([tabFuerTest({ id: 'tab', gesetz }, tabs)]));
      await act(async () => tabs.setAktiverTabId('tab'));
      await act(async () =>
        tabs.verlaufSetzen('tab', {
          eintraege: [aktiv, eintrag('B')],
          position: 0,
          aktivesElement: aktiv,
          rueckkehrmarke: { eintrag: eintrag('C'), position: 0 },
        }),
      );
      await act(async () =>
        tabs.verlaufNavigieren('tab', 'zurueck', (ziel, melden) =>
          navigation.gesetzesreferenzOeffnen(
            { ...ziel, ohneVerlauf: true },
            'immer-aktiver-tab',
            'tab',
            melden,
          ),
        ),
      );
      await act(async () => {
        if (bedienung === 'Normzeile') ansicht.baum.onNormKlick('A');
        if (bedienung === 'Text') ansicht.baum.onNormTextKlick('A');
        if (bedienung === 'Überschrift') ansicht.baum.onUeberschriftKlick('oben');
        if (bedienung === 'Klappstufe') ansicht.klappstufen.aufklappen();
        if (bedienung === 'Tastatur')
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
      });
      expect(ansicht.baum.aktivesElementId).toBe(aktivesElementId);
      const vorher = tabs.verlaufLesen('tab');
      await act(async () => fertig({ liste: [gesetz], befunde: [], ordnerLesbar: true }));
      expect(ansicht.baum.aktivesElementId).toBe(aktivesElementId);
      expect(tabs.verlaufLesen('tab')).toEqual(vorher);
      expect(tabs.verlaufLesen('tab')?.position).toBe(0);
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);
