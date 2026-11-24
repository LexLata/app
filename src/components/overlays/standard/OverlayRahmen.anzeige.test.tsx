// @vitest-environment jsdom
// OverlayRahmen.anzeige.test.tsx
// Prüft gemeinsame Titelanzeige und zukünftige Beschriftungen bei unveränderten Aktionen.
import { act } from 'react';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { expect, it, vi } from 'vitest';
import { OverlayKopfzeile } from './OverlayKopfzeile';
import { LinuxTitelleistenAbfrage } from './LinuxTitelleistenAbfrage';
import { Willkommensansicht } from '@/components/hauptfenster/Willkommensansicht';

const roh = 'Art. 1 Abs. 1';
// Simuliert spätere Änderungen fester Beschriftungen an der gemeinsamen Grenze.
// Die echte Anzeigeimplementierung und ihre Regeln bleiben vollständig aktiv.
vi.mock('@/components/textanzeige/textanzeige.index', async (original) => {
  const modul = await original<typeof import('@/components/textanzeige/textanzeige.index')>();
  return {
    ...modul,
    TextAnzeige: (props: Parameters<typeof modul.TextAnzeige>[0]) => (
      <modul.TextAnzeige
        {...props}
        text={
          ['Gesetz oder Norm öffnen', 'Native Titelleiste', 'Eigene Titelleiste'].includes(
            String(props.text),
          )
            ? 'Art. 1 Abs. 1'
            : props.text
        }
      />
    ),
  };
});
vi.mock('@/hooks/utils/usePlattform', () => ({ usePlattform: () => ({ istMac: false }) }));
vi.mock('@/lib/plattform/tastenkuerzel/tastenkuerzel.index', () => ({
  tastenkuerzelAnzeige: () => 'Art. 1 Abs. 1',
}));
const dom = domTestWurzel();
it('schützt Roh-Titel und erhält Schließen, disabled und ursprüngliche Werte', async () => {
  const schliessen = vi.fn();
  await act(async () =>
    dom.root.render(<OverlayKopfzeile titel={roh} onSchliessen={schliessen} />),
  );
  expect(dom.host.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  expect(
    [...dom.host.querySelectorAll('span')]
      .filter((n) => n.style.whiteSpace === 'nowrap')
      .map((n) => n.textContent),
  ).toEqual(['Art.\u00a01', 'Abs.\u00a01']);
  await act(async () => dom.host.querySelector('button')!.click());
  expect(schliessen).toHaveBeenCalledOnce();
  await act(async () =>
    dom.root.render(
      <OverlayKopfzeile titel={roh} onSchliessen={schliessen} schliessenDeaktiviert />,
    ),
  );
  expect(dom.host.querySelector('button')!.disabled).toBe(true);
  await act(async () => dom.host.querySelector('button')!.click());
  expect(schliessen).toHaveBeenCalledOnce();
  expect(roh).toBe('Art. 1 Abs. 1');
});
it('schützt die Auswahlbeschriftungen und meldet die Titelleistenwahl', async () => {
  const auswahl = vi.fn();
  await act(async () => dom.root.render(<LinuxTitelleistenAbfrage onAuswahl={auswahl} />));
  const buttons = [...dom.host.querySelectorAll('button')];
  expect(buttons.map((b) => b.textContent)).toEqual([
    'Art.\u00a01 Abs.\u00a01',
    'Art.\u00a01 Abs.\u00a01',
  ]);
  for (const button of buttons) await act(async () => button.click());
  expect(auswahl.mock.calls).toEqual([['nativ'], ['eigene']]);
});
it('schützt künftigen Öffnungslink und Tastenkürzel und erhält die Öffnungsaktion', async () => {
  const oeffnen = vi.fn();
  await act(async () => dom.root.render(<Willkommensansicht onOeffnenOverlayOeffnen={oeffnen} />));
  const link = dom.host.querySelector('button')!;
  expect(link.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  expect(dom.host.querySelector('kbd')!.textContent).toBe('Art.\u00a01 Abs.\u00a01');
  await act(async () => link.click());
  expect(oeffnen).toHaveBeenCalledOnce();
});
