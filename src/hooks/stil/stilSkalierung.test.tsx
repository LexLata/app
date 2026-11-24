// stilSkalierung.test.tsx
// Prüft erhaltene Skalierung und Context-Anbindung bei verschiedenen UI-Größen.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';
import { useTextRollen, useIconGroessen } from './useTextRollen';
import { useAbstandRollen } from './useAbstandRollen';
import { useRadiusRollen } from './useRadiusRollen';
import { useButtonRollen } from './useButtonRollen';
import { iconGroesseSkaliert } from '@/lib/stil/textRollen';

// Der Durchreich-Slot nimmt Elemente an; Rohtext muss zuerst den Anzeigeweg nutzen.
function pruefeProviderVertrag() {
  type Kinder = ComponentProps<typeof UiGroesseProvider>['children'];
  const element: Kinder = <Probe />;
  const elemente: Kinder = [<Probe key="probe" />];
  // @ts-expect-error Rohtext ist kein belegtes Element.
  const rohtext: Kinder = '§ 1 BGB';
  // @ts-expect-error Auch Zahlen sind sichtbare Rohtextkinder.
  const zahl: Kinder = 1;
  const slot: ReactElement | ReactElement[] = element;
  return { slot, elemente, rohtext, zahl };
}
void pruefeProviderVertrag;

afterEach(() => vi.unstubAllGlobals());

function Probe() {
  const text = useTextRollen();
  const icons = useIconGroessen();
  const abstand = useAbstandRollen();
  const radius = useRadiusRollen();
  const buttons = useButtonRollen();
  const werte = {
    schrift: text.standardtext.fontSize,
    icon: icons.standard,
    abstand: abstand.standard,
    radius: radius.standard,
    padding: buttons.primaer().padding,
    kompakt: buttons.sekundaerKompakt().padding,
    override: buttons.paddingFaktor(10 / 6, 12 / 16),
    deaktiviert: buttons.primaer(true).cursor,
    sekundärDeaktiviert: buttons.sekundaer(true).opacity,
  };
  return <span>{JSON.stringify(werte)}</span>;
}

describe('UI-Stilskalierung', () => {
  it.each([
    ['klein', 12, 14, 7, 5, '5px 14px', '5px 13px', '9px 11px'],
    ['normal', 13, 16, 8, 6, '6px 16px', '5px 14px', '10px 12px'],
    ['gross', 15, 18, 9, 7, '7px 18px', '6px 16px', '12px 14px'],
  ])(
    'verwendet den bestehenden Provider für %s',
    (groesse, schrift, icon, abstand, radius, padding, kompakt, override) => {
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => (key === 'lexlata.uiGroesse' ? groesse : null),
      });
      const html = renderToStaticMarkup(
        <UiGroesseProvider>
          <Probe />
        </UiGroesseProvider>,
      );
      const inhalt = new DOMParser()
        .parseFromString(html, 'text/html')
        .querySelector('span')!.textContent!;
      expect(JSON.parse(inhalt)).toEqual({
        schrift,
        icon,
        abstand,
        radius,
        padding,
        kompakt,
        override,
        deaktiviert: 'not-allowed',
        sekundärDeaktiviert: 0.4,
      });
    },
  );

  it('rundet lokale Icon-Faktoren genau einmal aus dem Rohwert', () => {
    expect(iconGroesseSkaliert(16, 0.875 * 0.9)).toBe(13);
  });
});
