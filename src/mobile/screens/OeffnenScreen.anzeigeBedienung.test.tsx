// @vitest-environment jsdom
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
// Mobile Suche über echte Eingabe, Trefferberechnung und Trefferzeilen.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { assert, beforeEach, expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { merkeAnzeige } from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { OeffnenScreen } from './OeffnenScreen';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';
const dom = domTestWurzel();
const gesetze = ['GG', 'GVG', 'GmbHG', 'StGB', 'ZVG', 'ZPO'].map((kurztitel) =>
  gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel === 'ZPO' ? 'Zivilprozessordnung' : kurztitel,
    elemente: [],
  }),
);
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  setzeSuchverzeichnisTestdaten(gesetze);
  localStorage.clear();
});
async function starten() {
  for (const k of ['GG', 'StGB', 'ZVG', 'ZPO']) {
    const gesetz = gesetze.find((g) => g.kurztitel === k);
    assert(gesetz);
    merkeAnzeige(gesetz);
  }
  await einhaengen();
}
async function einhaengen() {
  await act(async () =>
    dom.root.render(
      <OeffnenScreen
        zuletztGezeigtesGesetz={null}
        onGesetzGewaehlt={() => {}}
        onGesetzImportiert={async () => {}}
        customTastaturAktiv={false}
        onReferenzGewaehlt={(referenz, xmlId) =>
          suchtrefferOeffnenFuerTest(
            gesetze,
            () => {},
            () => {},
          )(referenz, xmlId, false)
        }
      />,
    ),
  );
}
const zeilen = () =>
  Array.from(dom.host.querySelectorAll('[data-idx]')).map(
    (e) => gesetze.find((g) => e.textContent?.startsWith(g.kurztitel))?.kurztitel,
  );
async function eingeben(text: string) {
  const input = dom.host.querySelector('input');
  const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  assert(input);
  assert(setzen);
  await act(async () => {
    setzen.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
it('ordnet bei Eingabe g nach Stufe und innerhalb der Stufe nach letzter Anzeige', async () => {
  await starten();
  await eingeben('g');
  expect(zeilen()).toEqual(['GG', 'GmbHG', 'GVG', 'ZVG', 'StGB', 'ZPO']);
});
it('zeigt bei leerer Eingabe zuletzt angezeigte Gesetze zuerst und liest beim neuen Einhängen neu', async () => {
  await starten();
  expect(zeilen()).toEqual(['ZPO', 'ZVG', 'StGB', 'GG', 'GVG', 'GmbHG']);
  const gvg = gesetze.find((g) => g.kurztitel === 'GVG');
  assert(gvg);
  merkeAnzeige(gvg);
  await eingeben('g');
  expect(zeilen()).toEqual(['GG', 'GmbHG', 'GVG', 'ZVG', 'StGB', 'ZPO']);
  await act(async () => dom.root.render(null));
  await einhaengen();
  expect(zeilen()).toEqual(['GVG', 'ZPO', 'ZVG', 'StGB', 'GG', 'GmbHG']);
});
