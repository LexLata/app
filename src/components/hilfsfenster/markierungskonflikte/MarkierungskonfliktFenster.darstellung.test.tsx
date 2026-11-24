// @vitest-environment jsdom
// Sichtbare Konfliktgruppen und ihre Auswahl durch echte Klicks.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import '@/test/markierungen/markierungskonfliktListenStilMocks';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { GesetzZeile } from './KonfliktListe';
import type { Auswahl } from './MarkierungskonfliktFenster.helpers';
import type { AnzeigeKonfliktEintrag } from '@/lib/markierungen/markierungen.index';
import { oeffneInternesZiel } from '@/hooks/fenster/useInterneNavigation';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

vi.mock('@/hooks/fenster/useInterneNavigation', () => ({
  oeffneInternesZiel: vi.fn(async () => {}),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
const basis: AnzeigeKonfliktEintrag = {
  schluessel: 'm',
  ausgangsstelle: normAusgangsstelle('§ 1'),
  bezeichnungAnzeige: '§ 1',
  markierungstyp: 'verweismarkierung',
  verweistext: 'Art. 10, 5, 999 GG',
  zielKonflikte: [
    {
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      typ: 'zielNormUnpassend',
      bezeichnungenAnzeige: [{ bezeichnung: 'Art. 10', befund: 'unpassend' }],
    },
    {
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      typ: 'zielNormFehlt',
      bezeichnungenAnzeige: [
        { bezeichnung: 'Art. 5', befund: 'nichtEindeutig' },
        { bezeichnung: 'Art. 999', befund: 'fehlt' },
      ],
    },
  ],
};
const host = document.createElement('div');
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
  vi.clearAllMocks();
});
function Fenster({
  eintrag = basis,
  fehlt = false,
  titelFehlt = false,
}: {
  eintrag?: AnzeigeKonfliktEintrag;
  fehlt?: boolean;
  titelFehlt?: boolean;
}) {
  const [auswahl, waehle] = useState<Auswahl | null>(null);
  const [offen, klappe] = useState(true);
  return (
    <GesetzZeile
      gesetz={{
        gesetz,
        eintraege: [eintrag],
        fehlendesGesetz: fehlt ? true : undefined,
        nichtamtlicheTitelXmlFehlt: titelFehlt ? true : undefined,
      }}
      aufgeklappt={offen}
      ausgewaehlt={auswahl}
      onAuswaehlen={waehle}
      onAufgeklapptAendern={(_, wert) => klappe(wert)}
    />
  );
}
async function zeige(props: Parameters<typeof Fenster>[0] = {}) {
  await act(async () => root.render(<Fenster {...props} />));
}
async function klick(el: Element) {
  await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
function text(el: Element) {
  return el.textContent?.replaceAll('\u00a0', ' ');
}
it('zeigt Kopf und drei stets sichtbare Bulletzeilen; jede wählt ihre eigene Erläuterung und navigiert', async () => {
  await zeige();
  const kopf = [...host.querySelectorAll('div')].find(
    (el) => text(el) === '§ 1: Verweis „Art. 10, 5, 999 GG“:',
  )!;
  expect(kopf).toBeDefined();
  await klick(kopf);
  expect(oeffneInternesZiel).not.toHaveBeenCalled();
  const punkte = [...host.querySelectorAll('li')];
  expect(punkte.map(text)).toEqual([
    '•Art. 10 GG: Zielnorm verändert',
    '•Art. 5 GG: Zielnorm nicht eindeutig',
    '•Art. 999 GG: Zielnorm fehlt',
  ]);
  for (const punkt of punkte) {
    await klick(punkt.querySelector('[title]')!.parentElement!);
    expect(text(punkt)).toContain(
      punkt.querySelector('[title]')!.getAttribute('title')!.replaceAll('\u00a0', ' '),
    );
  }
  expect(oeffneInternesZiel).toHaveBeenCalledTimes(3);
});
it('zeigt bei genau einem Konflikt eine Vorschau ohne Kopf oder Bulletliste', async () => {
  await zeige({ eintrag: { ...basis, zielKonflikte: [basis.zielKonflikte[0]!] } });
  expect(text(host)).toContain('§ 1: Verweis auf Art. 10 GG: Zielnorm verändert');
  expect(host.querySelector('li')).toBeNull();
  await klick(host.querySelector('[title]')!.parentElement!);
  expect(oeffneInternesZiel).toHaveBeenCalledTimes(1);
});
it('dreht den Aufklapppfeil und zeigt keinen Konflikttooltip am Gesetz', async () => {
  await zeige();
  const pfeil = host.querySelector('[aria-expanded]')!;
  expect(pfeil.getAttribute('aria-expanded')).toBe('true');
  expect(pfeil.querySelector('[style*="rotate(90deg)"]')).not.toBeNull();
  expect(host.querySelector('[title="Konflikte anzeigen"]')).toBeNull();
  await klick(pfeil);
  expect(pfeil.getAttribute('aria-expanded')).toBe('false');
  expect(pfeil.querySelector('[style*="rotate(0deg)"]')).not.toBeNull();
});
it('zeigt fehlendes Gesetz und nichtamtliche Titel mit den vereinbarten Erläuterungen', async () => {
  await zeige({ fehlt: true });
  expect(text(host)).toContain('BGB: Gesetz nicht auf dem Gerät');
  expect(host.querySelector('[aria-expanded]')).toBeNull();
  await klick(host.querySelector('[title]')!.parentElement!);
  expect(text(host)).toContain(
    'BGB ist nicht auf diesem Gerät. Markierungen dazu können erst nach einem Import geprüft werden.',
  );
  await zeige({ titelFehlt: true });
  const titel = [...host.querySelectorAll('[title]')].find((el) =>
    el.getAttribute('title')?.startsWith('Die Datei'),
  )!;
  expect(text(host)).toContain('Nichtamtliche Titel nicht auf dem Gerät');
  await klick(titel.parentElement!);
  expect(text(host)).toContain(
    'Die Datei mit den nichtamtlichen Titeln zu diesem Gesetz ist nicht auf diesem Gerät. Markierungen nichtamtlicher Titel können deshalb nicht geprüft werden.',
  );
  expect(text(host)).not.toContain('Sammlung');
});

it('ordnet Ausgangsstelle und zwei Zielgesetze unter einer gekürzten Kopfzeile; Rückfall ohne Wortlaut', async () => {
  const wortlaut = 'Art. 10 GG und ein sehr langer vollständiger Verweis auf § 1 ZVG';
  const eintrag: AnzeigeKonfliktEintrag = {
    ...basis,
    verweistext: wortlaut,
    bezugstext: 'alter Bezug',
    eigenerKonflikt: 'bezugstextFehltOderUnpassend',
    zielKonflikte: [
      basis.zielKonflikte[0]!,
      {
        gesetz: gesetzesreferenz({ kurztitel: 'ZVG' }),
        typ: 'zielGesetzFehlt',
        bezeichnungenAnzeige: [],
      },
    ],
  };
  await zeige({ eintrag });
  expect(text(host)).toContain('§ 1: Verweis „Art. 10 GG und ein sehr langer…“:');
  const punkte = [...host.querySelectorAll('li')];
  expect(punkte.map(text)).toEqual([
    '•Bezugstext „alter Bezug“ verändert',
    '•Art. 10 GG: Zielnorm verändert',
    '•ZVG: Gesetz nicht auf dem Gerät',
  ]);
  for (const punkt of punkte) {
    await klick(punkt.querySelector('[title]')!.parentElement!);
    expect(text(punkt)).toContain(
      punkt.querySelector('[title]')!.getAttribute('title')!.replaceAll('\u00a0', ' '),
    );
  }
  expect(text(punkte[2]!)).toContain(wortlaut);
  await zeige({ eintrag: { ...eintrag, verweistext: undefined } });
  expect(text(host)).toContain('§ 1: Verweis:');
});

it('wählt über den Listenpunkt die zugehörige Erläuterung und wechselt anschließend die Auswahl', async () => {
  await zeige();
  const [ersteZeile, zweiteZeile] = host.querySelectorAll('li');
  if (!ersteZeile || !zweiteZeile) throw new Error('Zwei Konfliktzeilen erwartet.');
  const ersteErlaeuterung = ersteZeile.querySelector('[title]')?.getAttribute('title');
  const zweiteErlaeuterung = zweiteZeile.querySelector('[title]')?.getAttribute('title');
  if (!ersteErlaeuterung || !zweiteErlaeuterung)
    throw new Error('Erläuterungen für beide Konfliktzeilen erwartet.');
  const ersterPunkt = [...ersteZeile.querySelectorAll('span')].find((el) => el.textContent === '•');
  const zweiterPunkt = [...zweiteZeile.querySelectorAll('span')].find(
    (el) => el.textContent === '•',
  );
  if (!ersterPunkt || !zweiterPunkt) throw new Error('Sichtbare Listenpunkte erwartet.');
  await klick(ersterPunkt);
  expect(ersteZeile.textContent).toContain(ersteErlaeuterung);
  await klick(zweiterPunkt);
  expect(ersteZeile.textContent).not.toContain(ersteErlaeuterung);
  expect(zweiteZeile.textContent).toContain(zweiteErlaeuterung);
  expect(oeffneInternesZiel).toHaveBeenCalledTimes(2);
  expect(oeffneInternesZiel).toHaveBeenLastCalledWith({
    gesetz,
    ziel: { type: 'norm', bezeichnung: '§ 1' },
  });
});
