// @vitest-environment jsdom
// EinstellungenFenster.appUpdates.test.tsx
// Bedienung der Einstellung „Automatisch nach Updates suchen“ im echten Einstellungsfenster.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import EinstellungenFenster from './EinstellungenFenster';
import { wendeEinstellungenXMLAn } from '@/lib/einstellungen/einstellungen.index';

const dom = domTestWurzel();
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

it('bietet „Automatisch nach Updates suchen“ zuletzt unter Allgemein an, standardmäßig an, und speichert das Umschalten', async () => {
  await act(async () => dom.root.render(<EinstellungenFenster />));
  const label = [...dom.host.querySelectorAll('label')].find(
    (element) => element.textContent === 'Automatisch nach Updates suchen',
  );
  expect(label).toBeDefined();
  expect(label?.nextElementSibling).toBeNull();
  expect(label?.closest('#allgemein')).not.toBeNull();
  const checkbox = label?.querySelector('input');
  expect(checkbox?.checked).toBe(true);

  await act(async () => checkbox?.click());
  expect(checkbox?.checked).toBe(false);
  expect(localStorage.getItem('lexlata.appUpdatesAutomatischSuchen')).toBe('false');

  await act(async () => checkbox?.click());
  expect(localStorage.getItem('lexlata.appUpdatesAutomatischSuchen')).toBe('true');
});

it('schaltet nach Import einer Einstellungsdatei ohne das Element wieder ein', async () => {
  localStorage.setItem('lexlata.appUpdatesAutomatischSuchen', 'false');
  await act(async () => dom.root.render(<EinstellungenFenster />));
  const checkbox = () =>
    [...dom.host.querySelectorAll('label')]
      .find((element) => element.textContent === 'Automatisch nach Updates suchen')
      ?.querySelector('input');
  expect(checkbox()?.checked).toBe(false);
  await act(async () =>
    wendeEinstellungenXMLAn(
      '<einstellungen version="1"><farbschema>hell</farbschema></einstellungen>',
    ),
  );
  expect(checkbox()?.checked).toBe(true);
});
