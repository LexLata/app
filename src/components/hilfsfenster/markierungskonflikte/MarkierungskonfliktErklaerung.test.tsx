// @vitest-environment jsdom
// Die Erklärung gilt erst nach Bestätigung als gelesen und lässt sich erneut vormerken.
import '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useEffect } from 'react';
import { beforeEach, expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { MarkierungskonfliktErklaerung } from './MarkierungskonfliktErklaerung';
import { useEinfuehrung } from '@/hooks/einfuehrung/useEinfuehrung';

const dom = domTestWurzel();
let einfuehrung: ReturnType<typeof useEinfuehrung>;
function Probe({ offen = true }: { offen?: boolean }) {
  const ergebnis = useEinfuehrung();
  useEffect(() => {
    einfuehrung = ergebnis;
  });
  return offen ? <MarkierungskonfliktErklaerung /> : null;
}
async function zeige(offen = true) {
  await act(async () => dom.root.render(<Probe offen={offen} />));
}
function knopf(selector = 'button') {
  const element = dom.host.querySelector<HTMLButtonElement>(selector);
  if (!element) throw new Error('Erwarteter Button fehlt');
  return element;
}
beforeEach(() => localStorage.clear());
it('erklärt Markierungskonflikte auch nach unbestätigtem Schließen erneut', async () => {
  await zeige();
  expect(dom.host.querySelector('[role="dialog"]')?.textContent).toContain(
    'Dieses Fenster dient dazu, die Konflikte zu beheben.',
  );
  await zeige(false);
  await zeige();
  expect(dom.host.querySelector('[role="dialog"]')).not.toBeNull();
});
it('merkt die bestätigte Erklärung bis zur erneuten Einführung als gelesen', async () => {
  await zeige();
  await act(async () => knopf().click());
  expect(dom.host.querySelector('[role="dialog"]')).toBeNull();
  await zeige(false);
  await zeige();
  expect(dom.host.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => einfuehrung.neuStarten());
  expect(dom.host.querySelector('[role="dialog"]')).toBeNull();
  await zeige(false);
  await zeige();
  expect(dom.host.querySelector('[role="dialog"]')).not.toBeNull();
});

it('sperrt die Aktionen hinter der Erklärung und hält Tab beim Bestätigen', async () => {
  await act(async () =>
    dom.root.render(
      <MarkierungskonfliktErklaerung>
        <button>Aktion</button>
      </MarkierungskonfliktErklaerung>,
    ),
  );
  const aktion = knopf();
  expect(aktion.closest('[inert]')).not.toBeNull();
  const bestaetigen = knopf('[role="dialog"] button');
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  await act(async () => bestaetigen.dispatchEvent(tab));
  expect(tab.defaultPrevented).toBe(true);
  await act(async () => bestaetigen.click());
  expect(aktion.closest('[inert]')).toBeNull();
});
