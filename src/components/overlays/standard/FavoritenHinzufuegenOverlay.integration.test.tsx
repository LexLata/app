// @vitest-environment jsdom
// FavoritenHinzufuegenOverlay.integration.test.tsx
// Prüft lose Eingaben über die reale Oberfläche bis zur geschriebenen Favoritendatei.
import { nativeAttrappeZuruecksetzen, io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { act } from 'react';
import { assert, beforeEach, expect, it } from 'vitest';
import { FavoritenHinzufuegenOverlay } from './FavoritenHinzufuegenOverlay';
import { ladeFavoriten } from '@/lib/persistenz/nutzerdaten/favoritenSpeicher';
const dom = domTestWurzel();
beforeEach(() => nativeAttrappeZuruecksetzen());
it('speichert aufgelöste volle Bezeichnungen und erkennt erneute lose und volle Eingaben', async () => {
  const gesetz = gesetzMitNormen(['§ 433', '§ 1', 'Anhang 1'], {
    kurztitel: 'BGB',
    langtitel: 'Bürgerliches Gesetzbuch',
  });
  await act(async () =>
    dom.root.render(<FavoritenHinzufuegenOverlay gesetz={gesetz} onSchliessen={() => {}} />),
  );
  async function eingeben(text: string) {
    const feld = dom.host.querySelector('textarea');
    assert(feld);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      assert(setter);
      setter.call(feld, text);
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const button = [...dom.host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Favoriten hinzufügen',
    );
    assert(button);
    await act(async () => button.click());
  }
  await eingeben('433 1');
  expect(dom.host.textContent).toContain('2 Favoriten hinzugefügt.');
  expect(await ladeFavoriten(gesetz)).toEqual(['§ 1', '§ 433']);
  expect(
    [...io.dateien.values()].some((xml) => xml.includes('<bezeichnung>§ 433</bezeichnung>')),
  ).toBe(true);
  for (const eingabe of ['433', '§ 433']) {
    await eingeben(eingabe);
    expect(dom.host.textContent).toContain('Alle Normen waren bereits als Favoriten gespeichert.');
    expect(await ladeFavoriten(gesetz)).toEqual(['§ 1', '§ 433']);
  }
});
