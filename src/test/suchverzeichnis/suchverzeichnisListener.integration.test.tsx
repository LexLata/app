// @vitest-environment jsdom
// Echte Suche liest nach verzögerter nativer Ereignisanmeldung den aktuellen Dateistand.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useSuchverzeichnis } from '@/hooks/useSuchverzeichnis';
import { suchverzeichnisTestdatei } from './suchverzeichnisFabriken';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
const dom = domTestWurzel();
function Suche() {
  const { eintraege, wirdVorbereitet } = useSuchverzeichnis();
  return (
    <output>{wirdVorbereitet ? 'wartend' : eintraege.map((e) => e.kurztitel).join(',')}</output>
  );
}
it.each(['gesetze-geaendert', 'gesetze-geloescht'])(
  'übernimmt Änderungen während der nativen Anmeldung von %s ohne weiteres Ereignis',
  async (name) => {
    nativeAttrappeZuruecksetzen();
    const datei = 'cache/suchverzeichnis.json';
    const alt = gesetzDarstellung({ kurztitel: 'Alt' });
    const neu = gesetzDarstellung({ kurztitel: 'Neu' });
    io.dateien.set(datei, suchverzeichnisTestdatei([alt]));
    let weiter = () => {};
    let anmeldungBegonnen = false;
    const warten = new Promise<void>((resolve) => {
      weiter = resolve;
    });
    io.vorListener = (ereignis) => {
      if (ereignis !== name) return undefined;
      anmeldungBegonnen = true;
      return warten;
    };
    try {
      await act(async () => dom.root.render(<Suche />));
      await vi.waitFor(() => expect(anmeldungBegonnen).toBe(true));
      expect(dom.host.textContent).toBe('Alt');
      // Das andere Fenster veröffentlicht, bevor die Anmeldung wirksam wird.
      io.dateien.set(datei, suchverzeichnisTestdatei(name === 'gesetze-geloescht' ? [] : [neu]));
      for (const empfangen of io.listener.get(name) ?? []) empfangen({ payload: [] });
      await act(async () => weiter());
      await vi.waitFor(async () => {
        await act(async () => {});
        expect(dom.host.textContent).toBe(name === 'gesetze-geloescht' ? '' : 'Neu');
      });
    } finally {
      weiter();
    }
  },
);
