// @vitest-environment jsdom
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
// Echte Suchoberfläche mit Öffnungssteuerung, Tabs und Anzeigeerfassung.
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, useRef, useState } from 'react';
import { assert, beforeEach, expect, it } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useZuletztAngezeigt } from '@/hooks/useZuletztAngezeigt';
import { useOeffnenLinkNavigation } from '@/hooks/fenster/useOeffnenLinkNavigation';
import {
  merkeAnzeige,
  ladeAnzeigezeitpunkte,
} from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { OeffnenOverlay } from './OeffnenOverlay';
import { suchtrefferOeffnenFuerTest } from '@/test/suchverzeichnis/suchtrefferOeffnenFuerTest';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
const dom = domTestWurzel();
const gesetze = ['GG', 'GVG', 'GmbHG', 'StGB', 'ZVG', 'ZPO'].map((kurztitel) =>
  gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel === 'ZPO' ? 'Zivilprozessordnung' : kurztitel,
    elemente: [],
  }),
);
function Probe() {
  const tabs = useAppTabs();
  const [suche, setSuche] = useState(false);
  const navigation = useGesetzOeffnen({
    ...gesetzOeffnenFixture(tabs, gesetze),

    ladeGesetz: einzelzugriffFuerTest(async () => ({
      liste: gesetze,
      befunde: [],
      ordnerLesbar: true,
    })),
  });
  const aktiv = tabs.holeTabGesetz(tabs.tabs.find((t) => t.id === tabs.aktiverTabId)) ?? null;
  useZuletztAngezeigt(aktiv);
  const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
  const oeffnenLink = useOeffnenLinkNavigation({
    importindexVorbereitungRef,
    zeigeSuchfehler: () => {},
  });

  return (
    <>
      <button onClick={() => setSuche(true)}>Suche öffnen</button>
      <button
        onClick={() =>
          void oeffnenLink(
            { type: 'oeffnen', suchtext: 'g' },

            async () => true,
            (ziel) => {
              if ('gesetzesreferenz' in ziel) navigation.gesetzesreferenzOeffnen(ziel);
              else navigation.elementOeffnen(ziel);
            },
          )
        }
      >
        Öffnen-Link
      </button>
      <output>{aktiv?.kurztitel}</output>
      {suche && (
        <OeffnenOverlay
          gesetze={gesetze}
          aktivesGesetz={aktiv}
          onSchliessen={() => setSuche(false)}
          onGesetzOeffnen={(gesetz) => navigation.elementOeffnen({ gesetz })}
          onNeuenTabOeffnen={(gesetz) => navigation.elementOeffnen({ gesetz, modus: 'immer-neu' })}
          onInstalliertOeffnen={suchtrefferOeffnenFuerTest(
            gesetze,
            (gesetz) => navigation.elementOeffnen({ gesetz }),
            (gesetz) => navigation.elementOeffnen({ gesetz, modus: 'immer-neu' }),
          )}
        />
      )}
    </>
  );
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  setzeSuchverzeichnisTestdaten(gesetze);
  localStorage.clear();
  document.body.append(dom.host);
  Element.prototype.scrollIntoView = () => {};
});
async function klicken(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (b) => b.textContent === text,
  );
  assert(button);
  await act(async () => button.click());
}
async function eingeben(text: string) {
  const input = document.querySelector('input');
  const setzen = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  assert(input);
  assert(setzen);
  await act(async () => {
    setzen.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function holeGesetz(kurztitel: string) {
  const gesetz = gesetze.find((g) => g.kurztitel === kurztitel);
  assert(gesetz);
  return gesetz;
}
const zeilen = () =>
  Array.from(document.querySelectorAll('[data-idx]')).map(
    (e) => gesetze.find((g) => e.textContent?.startsWith(g.kurztitel))?.kurztitel,
  );
it('ordnet echte Zeilen und liest nach Öffnung über echte Hooks beim erneuten Suchen den neuen Stand', async () => {
  for (const k of ['GG', 'StGB', 'ZVG', 'ZPO']) merkeAnzeige(holeGesetz(k));
  await act(async () => dom.root.render(<Probe />));
  await klicken('Suche öffnen');
  expect(zeilen()).toEqual(['ZPO', 'ZVG', 'StGB', 'GG', 'GVG', 'GmbHG']);
  await eingeben('g');
  expect(zeilen()).toEqual(['GG', 'GmbHG', 'GVG', 'ZVG', 'StGB', 'ZPO']);
  const zeile = document.querySelectorAll<HTMLElement>('[data-idx]')[2];
  assert(zeile);
  await act(async () => zeile.click());
  expect(document.querySelector('output')?.textContent).toBe('GVG');
  expect(ladeAnzeigezeitpunkte().has(gesetzesreferenzSchluessel(holeGesetz('GVG')))).toBe(true);
  await klicken('Suche öffnen');
  expect(zeilen()[0]).toBe('GVG');
  await eingeben('g');
  expect(zeilen()).toEqual(['GVG', 'GG', 'GmbHG', 'ZVG', 'StGB', 'ZPO']);
});
it('öffnet per echtem Öffnen-Link mit und ohne gefüllten Speicher denselben alphabetischen Treffer', async () => {
  await act(async () => dom.root.render(<Probe />));
  await klicken('Öffnen-Link');
  expect(document.querySelector('output')?.textContent).toBe('GG');
  merkeAnzeige(holeGesetz('GVG'));
  await klicken('Öffnen-Link');
  expect(document.querySelector('output')?.textContent).toBe('GG');
});
