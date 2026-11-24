// @vitest-environment jsdom
// Prüft Bereithaltung und Verwerfen über die öffentliche Hook-Schnittstelle.
import { act, useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import type { Tab } from '@/lib/domain/appTypes';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { TAB_BEREITHALTUNGSBUDGET } from '@/lib/domain/app/tab-bereithaltung/tab-bereithaltung.index';
import { richteMesskonsoleEin } from '@/lib/utils/speicherMessung';
import { useTabBereithaltung } from './useTabBereithaltung';
const dom = domTestWurzel();
let gehalten: ReturnType<typeof useTabBereithaltung>;
// Ersetzter Fensterbestand: jedes neu eingesetzte Gesetzobjekt gilt als neuer Datenstand,
// auch nach dem Entladen erneut geladene Gesetze.
let bestand: Record<string, GesetzDarstellung | undefined>;
const datenstaende = new WeakMap<GesetzDarstellung, number>();
let naechsterDatenstand = 0;
function datenstandVon(gesetz: GesetzDarstellung | undefined) {
  if (!gesetz) return undefined;
  if (!datenstaende.has(gesetz)) datenstaende.set(gesetz, ++naechsterDatenstand);
  return datenstaende.get(gesetz);
}
function Probe({
  aktiv,
  offen,
  darstellung,
}: {
  aktiv: string;
  offen: string[];
  darstellung: string;
}) {
  // Eintrag `a` zeigt im Tab a das Gesetz a, Eintrag `a=X` das Gesetz X.
  const tabs: Tab[] = offen.map((eintrag) => {
    const [id = '', kurztitel = id] = eintrag.split('=');
    return { id, gesetzesreferenz: { normgeber: 'de-bund', kurztitel }, ladezustand: 'geladen' };
  });
  const auswahl = useTabBereithaltung({
    aktiverTabId: aktiv,
    tabs,
    holeGeladenes: (referenz) => bestand[referenz.kurztitel],
    holeDatenstand: (referenz) => datenstandVon(bestand[referenz.kurztitel]),
    darstellungsSchluessel: darstellung,
  });
  useLayoutEffect(() => {
    gehalten = auswahl;
  });
  return null;
}
/** Ohne Budget gilt die Vorgabe; sonst das testweise Budget des Messmodus. */
async function anzeigen(
  aktiv: string,
  offen = ['a', 'b', 'c'],
  darstellung = 'd1',
  budget?: number,
) {
  await act(async () => {
    if (budget === undefined) globalThis.bereithaltungsbudget?.();
    else globalThis.bereithaltungsbudget?.(budget);
    dom.root.render(<Probe aktiv={aktiv} offen={offen} darstellung={darstellung} />);
  });
}
/** Gesetz mit der angegebenen Elementzahl als Bereithaltungskosten. */
function gesetzMitElementen(kurztitel: string, anzahl: number) {
  return gesetzDarstellung({
    kurztitel,
    elemente: Array.from({ length: anzahl }, (_, i) => ({
      typ: 'norm' as const,
      data: normaleNorm({
        id: `${kurztitel}${i}`,
        xmlId: `p${i}`,
        bezeichnung: `§ ${i}`,
        absaetze: [],
      }),
    })),
  });
}
// Die Rückgabe folgt der Tabreihenfolge; geprüft wird die Menge.
const ids = () => gehalten.map((ansicht) => ansicht.tab.id).sort();
/** Gehaltene Ansichten als `Tab:Gesetz`. */
const ansichten = () => gehalten.map((a) => `${a.tab.id}:${a.gesetz.kurztitel}`).sort();
const schluessel = (id: string, kurztitel = id) =>
  gehalten.find((a) => a.tab.id === id && a.gesetz.kurztitel === kurztitel)?.schluessel;
beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  afterEach(() => {
    globalThis.bereithaltungsbudget?.();
    Reflect.deleteProperty(globalThis, 'speicherbericht');
    Reflect.deleteProperty(globalThis, 'bereithaltungsbudget');
    vi.restoreAllMocks();
  });
  richteMesskonsoleEin();
  bestand = Object.fromEntries(
    ['a', 'b', 'c'].map((id) => [id, gesetzDarstellung({ kurztitel: id })]),
  );
});
it('hält bei ausreichendem Budget alle bereits benutzten offenen Tabs ohne Tab-Vorbereitung', async () => {
  await anzeigen('a');
  expect(ids()).toEqual(['a']);
  await anzeigen('b');
  expect(ids()).toEqual(['a', 'b']);
  await anzeigen('a');
  expect(ids()).toEqual(['a', 'b']);
  await anzeigen('c');
  expect(ids()).toEqual(['a', 'b', 'c']);
});
it('hält bei kleinerem Budget weniger gleich große Ansichten', async () => {
  for (const id of ['a', 'b', 'c', 'd']) bestand[id] = gesetzMitElementen(id, 10);
  const offen = ['a', 'b', 'c', 'd'];
  for (const id of offen) await anzeigen(id, offen, 'd1', 20);
  expect(ids()).toEqual(['b', 'c', 'd']);
  await anzeigen('d', offen, 'd1', 10);
  expect(ids()).toEqual(['c', 'd']);
  await anzeigen('d', offen, 'd1', 0);
  expect(ids()).toEqual(['c', 'd']);
});
it('hält den zuletzt verlassenen Tab auch über dem Budget und verliert die Garantie endgültig mit seiner Ansicht', async () => {
  bestand.a = gesetzMitElementen('a', 5);
  bestand.b = gesetzMitElementen('b', 100);
  bestand.c = gesetzMitElementen('c', 5);
  await anzeigen('a', undefined, 'd1', 10);
  await anzeigen('b', undefined, 'd1', 10);
  await anzeigen('c', undefined, 'd1', 10);
  expect(ids()).toEqual(['b', 'c']);
  const fassung = bestand.b;
  bestand.b = undefined;
  await anzeigen('c', undefined, 'd1', 10);
  expect(ids()).toEqual(['c']);
  bestand.b = fassung && { ...fassung };
  await anzeigen('c', undefined, 'd1', 10);
  expect(ids()).toEqual(['c']);
});
it('vererbt die Garantie eines übertragenen Tabs nicht an einen älteren Tab', async () => {
  for (const id of ['a', 'b', 'c']) bestand[id] = gesetzMitElementen(id, 5);
  await anzeigen('a', undefined, 'd1', 10);
  await anzeigen('b', undefined, 'd1', 10);
  await anzeigen('c', undefined, 'd1', 10);
  // b garantiert (5), a regulär im Restbudget (5).
  expect(ids()).toEqual(['a', 'b', 'c']);
  // Übertragen entfernt b aus diesem Fenster; a bleibt nur regulär im Budget.
  await anzeigen('c', ['a', 'c'], 'd1', 10);
  expect(ids()).toEqual(['a', 'c']);
  await anzeigen('c', ['a', 'c'], 'd1', 0);
  expect(ids()).toEqual(['c']);
});
it('begründet beim Start keine Garantie', async () => {
  bestand.a = gesetzMitElementen('a', 100);
  await anzeigen('a', undefined, 'd1', 0);
  expect(ids()).toEqual(['a']);
});
it('bereitet einen erst später geladenen Tab nicht vor und berücksichtigt ihn nach Benutzung regulär', async () => {
  bestand.b = undefined;
  await anzeigen('a');
  await anzeigen('b');
  await anzeigen('c');
  bestand.b = gesetzDarstellung({ kurztitel: 'b' });
  await anzeigen('c');
  expect(ids()).toEqual(['a', 'c']);
  await anzeigen('b');
  await anzeigen('c');
  expect(ids()).toEqual(['a', 'b', 'c']);
});
it('erhält die Auswahl beim Umordnen und entfernt geschlossene Tabs ohne Ersatz', async () => {
  await anzeigen('a');
  await anzeigen('b');
  await anzeigen('b', ['c', 'b', 'a']);
  expect(ids()).toEqual(['a', 'b']);
  await anzeigen('b', ['c', 'b']);
  expect(ids()).toEqual(['b']);
  await anzeigen('b');
  expect(ids()).toEqual(['b']);
});
it('verwirft eine verdeckte Ansicht bei ausgetauschtem Datenstand und baut sie im Verdeckten nicht neu', async () => {
  await anzeigen('a');
  await anzeigen('b');
  const schluesselB = schluessel('b');
  bestand.a = gesetzDarstellung({ kurztitel: 'a' });
  await anzeigen('b');
  expect(ids()).toEqual(['b']);
  expect(schluessel('b')).toBe(schluesselB);
  await anzeigen('a');
  expect(ids()).toEqual(['a', 'b']);
});
it('gibt der aktiven Ansicht bei ausgetauschtem Datenstand einen neuen Schlüssel', async () => {
  await anzeigen('a');
  const vorher = schluessel('a');
  bestand.a = gesetzDarstellung({ kurztitel: 'a' });
  await anzeigen('a');
  expect(ids()).toEqual(['a']);
  expect(schluessel('a')).not.toBe(vorher);
});
it('verwirft eine entladene Ansicht endgültig, auch wenn das Gesetz später wieder geladen ist', async () => {
  await anzeigen('a');
  await anzeigen('b');
  const fassung = bestand.a;
  bestand.a = undefined;
  await anzeigen('b');
  expect(ids()).toEqual(['b']);
  bestand.a = fassung && { ...fassung };
  await anzeigen('b');
  expect(ids()).toEqual(['b']);
});
it('verwirft bei geänderter Darstellung alle verdeckten Ansichten, nicht die aktive', async () => {
  await anzeigen('a');
  await anzeigen('b');
  const schluesselB = schluessel('b');
  await anzeigen('b', undefined, 'd2');
  expect(ids()).toEqual(['b']);
  expect(schluessel('b')).toBe(schluesselB);
  await anzeigen('a', undefined, 'd2');
  expect(ids()).toEqual(['a', 'b']);
});

describe('Verlauf-Bereithaltung', () => {
  it('hält die verlassene Gesetzesansicht und verwendet sie beim Rücksprung wieder', async () => {
    bestand.X = gesetzDarstellung({ kurztitel: 'X' });
    await anzeigen('a', ['a', 'b']);
    const schluesselA = schluessel('a');
    await anzeigen('a', ['a=X', 'b']);
    expect(ansichten()).toEqual(['a:X', 'a:a']);
    expect(gehalten.find((a) => a.gesetz.kurztitel === 'a')?.aktiv).toBe(false);
    expect(gehalten.find((a) => a.gesetz.kurztitel === 'X')?.aktiv).toBe(true);
    await anzeigen('a', ['a', 'b']);
    expect(ansichten()).toEqual(['a:X', 'a:a']);
    expect(schluessel('a')).toBe(schluesselA);
  });
  it('begründet durch den Gesetzeswechsel im selben Tab keine Garantie', async () => {
    bestand.a = gesetzMitElementen('a', 5);
    bestand.X = gesetzMitElementen('X', 5);
    await anzeigen('a', ['a'], 'd1', 0);
    await anzeigen('a', ['a=X'], 'd1', 0);
    expect(ansichten()).toEqual(['a:X']);
  });
  it('hält verlassene Ansichten erst nach offenen Tabs, jüngste zuerst', async () => {
    for (const name of ['a', 'b', 'X', 'Y', 'Z']) bestand[name] = gesetzMitElementen(name, 10);
    await anzeigen('b', ['a', 'b'], 'd1', 30);
    await anzeigen('a', ['a', 'b'], 'd1', 30);
    await anzeigen('a', ['a=X', 'b'], 'd1', 30);
    await anzeigen('a', ['a=Y', 'b'], 'd1', 30);
    await anzeigen('a', ['a=Z', 'b'], 'd1', 30);
    expect(ansichten()).toEqual(['a:Y', 'a:Z', 'a:X', 'b:b'].sort());
    await anzeigen('a', ['a=Z', 'b'], 'd1', 20);
    expect(ansichten()).toEqual(['a:Y', 'a:Z', 'b:b']);
  });
  it('verwirft verlassene Ansichten beim Schließen des Tabs', async () => {
    bestand.X = gesetzDarstellung({ kurztitel: 'X' });
    await anzeigen('b', ['a', 'b']);
    await anzeigen('a', ['a', 'b']);
    await anzeigen('a', ['a=X', 'b']);
    await anzeigen('b', ['b']);
    expect(ansichten()).toEqual(['b:b']);
  });
  it('verwirft nur die verlassene Ansicht eines ausgetauschten oder entladenen Gesetzes', async () => {
    bestand.X = gesetzDarstellung({ kurztitel: 'X' });
    await anzeigen('a', ['a']);
    await anzeigen('a', ['a=X']);
    const schluesselX = schluessel('a', 'X');
    bestand.X = gesetzDarstellung({ kurztitel: 'X' });
    await anzeigen('a', ['a=X']);
    expect(ansichten()).toEqual(['a:X', 'a:a']);
    bestand.a = gesetzDarstellung({ kurztitel: 'a' });
    await anzeigen('a', ['a=X']);
    expect(ansichten()).toEqual(['a:X']);
    expect(schluessel('a', 'X')).not.toBe(schluesselX);
    await anzeigen('a', ['a']);
    await anzeigen('a', ['a=X']);
    bestand.a = undefined;
    await anzeigen('a', ['a=X']);
    expect(ansichten()).toEqual(['a:X']);
  });
});

it('wendet das in der Konsole gesetzte Budget an und kehrt beim Zurücksetzen sofort zur Vorgabe zurück', async () => {
  expect(TAB_BEREITHALTUNGSBUDGET).toBe(12000);
  const offen = ['a', 'b', 'c', 'd'];
  // Je 7.000 Elemente: Die Vorgabe 12.000 deckt nur den garantierten Tab c, nicht auch b.
  for (const id of offen) bestand[id] = gesetzMitElementen(id, 7000);
  for (const id of offen) await anzeigen(id, offen);
  expect(ids()).toEqual(['c', 'd']);
  // 21.000 deckt c, b und a mit zusammen 21.000.
  for (const id of offen) await anzeigen(id, offen, 'd1', 21000);
  expect(ids()).toEqual(['a', 'b', 'c', 'd']);
  await act(async () => globalThis.bereithaltungsbudget?.());
  expect(ids()).toEqual(['c', 'd']);
});
