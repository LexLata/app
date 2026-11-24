// @vitest-environment jsdom
// Der Einstieg der echten Hauptansicht öffnet die Suche und bleibt während der Einführung gesperrt.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useState } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { HauptansichtFixture } from './HauptansichtFixture';
import { gesetzOeffnenFixture } from './gesetzOeffnenFixture';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
const dom = domTestWurzel();
const nichts = () => {};
function Probe({ einfuehrungAktiv }: { einfuehrungAktiv: boolean }) {
  const tabs = useAppTabs();
  const navigation = useGesetzOeffnen(gesetzOeffnenFixture(tabs, []));
  const lesezeichen = useLesezeichenUndFavoriten(tabs);
  const [suche, setSuche] = useState(false);
  return (
    <>
      <output>{suche ? 'Suche offen' : 'Suche geschlossen'}</output>
      <HauptansichtFixture
        tabsteuerung={tabs}
        navigation={navigation}
        lesezeichen={lesezeichen}
        setFavoritenStatus={nichts}
        verlaufSchrittUndOeffnen={nichts}
        verlaufAktivierung={tabs.verlaufAktivierung}
        verlaufBedienung={tabs.verlaufBedienung}
        onOeffnenOverlayUmschalten={() => setSuche(true)}
        einfuehrung={{
          einfuehrungAktiv,
          einfuehrungTeilaktion: 0,
          favoritSpeichernMitEinfuehrung: async () => {},
          lesezeichenSpeichernMitEinfuehrung: async () => {},
          meldeEinklappAenderung: nichts,
          leistenTauschenEffektiv: false,
          minimalistischerModusEffektiv: true,
          einfuehrungErlaubtFuerUI: undefined,
          einfuehrungSperrenFuerGesetzestextansicht: undefined,
          einfuehrungFavoritErlaubtFuerGesetzestextansicht: true,
        }}
      />
    </>
  );
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  HTMLElement.prototype.scrollIntoView = nichts;
});
it.each([false, true])(
  'zeigt Lupe und Suchkürzel und beachtet die Einführungssperre (%s)',
  async (einfuehrungAktiv) => {
    await act(async () => dom.root.render(<Probe einfuehrungAktiv={einfuehrungAktiv} />));
    const link = Array.from(dom.host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Gesetz oder Norm öffnen',
    );
    assert(link);
    expect(link.nextElementSibling?.tagName).toBe('KBD');
    expect(link.nextSibling).toBe(link.nextElementSibling);
    expect(link?.querySelector('svg')).not.toBeNull();
    expect(dom.host.textContent).not.toContain('Gesetze verwalten');
    expect(dom.host.querySelector('kbd')?.textContent?.replaceAll('\u202f', '')).toBe('⌘O');
    await act(async () => link.click());
    expect(dom.host.querySelector('output')?.textContent).toBe(
      einfuehrungAktiv ? 'Suche geschlossen' : 'Suche offen',
    );
  },
);
