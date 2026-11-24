// @vitest-environment jsdom
// Zusatztexte bleiben sichtbar und von Auswahladressen, Austausch und Konflikten getrennt.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AbsatzListe } from './baum.index';
import { NormBlock } from './normBlock';
import {
  TextDarstellungsRahmen,
  useTextDarstellungsModell,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { ermittleAuswahl } from '@/lib/domain/textpfad/textpfad.index';
import { istUebertragenesElement } from '@/lib/domain/elementPruefung';
import { normWeggefallen } from '@/lib/domain/gesetzDarstellungAuswertung';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { exportiere } from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import {
  hinzufuegenMarkierung,
  ladeMarkierungen,
  pruefeAlleMarkierungen,
} from '@/lib/markierungen/markierungen.index';

const wurzeln: Root[] = [];
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  aufbau.bereiteNativeAttrappeVor();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(async () => {
  await aufbau.raeumeTestFensterAuf(wurzeln);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function gesetz(block: string) {
  return `<gesetz version="1"><infos><kurztitel>TestG</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>A</absatz>${block}<absatz>B</absatz></text></norm></inhalt></gesetz>`;
}
async function anzeigen(block: string) {
  const g = parseGesetzesXML(gesetz(block));
  if (!g) throw Error('Gesetz fehlt');
  const e = g.elemente[0];
  if (!e) throw Error('Norm fehlt');
  if (e.typ !== 'norm') throw Error('Norm fehlt');
  const host = document.createElement('div');
  document.body.append(host);
  host.setAttribute('data-xml-id', 'n1');
  const root = createRoot(host);
  wurzeln.push(root);
  await act(async () =>
    root.render(
      <AbsatzListe
        absaetze={e.data.absaetze}
        zusatztexte={e.data.zusatztexte}
        schrift={14}
        satzNeuZeile={true}
        ausgangsXmlId="n1"
      />,
    ),
  );
  return { host, root, g, norm: e.data };
}

it('zeigt Zusatztext in Dokumentreihenfolge und bietet für seine Auswahl keine Textstelle an', async () => {
  const { host } = await anzeigen('<tabelle>x   y</tabelle>');
  expect(host.textContent).toBe('Ax yB');
  const zusatz = [...host.querySelectorAll('div')].find((el) => el.textContent === 'x y');
  if (!zusatz) throw Error('Zusatztext fehlt');
  expect(zusatz.querySelector('[data-leaf]')).toBeNull();
  const range = document.createRange();
  range.selectNodeContents(zusatz);
  const auswahl = window.getSelection();
  if (!auswahl) throw Error('Auswahl fehlt');
  auswahl.removeAllRanges();
  auswahl.addRange(range);
  expect(ermittleAuswahl(window.getSelection())).toHaveProperty('fehler');
});

function findeTextknoten(host: HTMLElement, inhalt: string): Node {
  const text = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  while (text.nextNode()) {
    if (text.currentNode.textContent === inhalt) return text.currentNode;
  }
  throw Error(`Textknoten fehlt: ${inhalt}`);
}

it.each(['Absatz davor', 'Absatz danach'])(
  'sperrt die gemeinsame Auswahl von Zusatztext und %s in beiden Auswahlrichtungen',
  async (seite) => {
    const { host } = await anzeigen('<tabelle>x y</tabelle>');
    const absatz = findeTextknoten(host, seite === 'Absatz davor' ? 'A' : 'B');
    const zusatz = findeTextknoten(host, 'x y');
    const start = seite === 'Absatz davor' ? absatz : zusatz;
    const ende = seite === 'Absatz davor' ? zusatz : absatz;
    const auswahl = window.getSelection();
    if (!auswahl) throw Error('Auswahl fehlt');
    for (const rueckwaerts of [false, true]) {
      auswahl.setBaseAndExtent(
        rueckwaerts ? ende : start,
        rueckwaerts ? 1 : 0,
        rueckwaerts ? start : ende,
        rueckwaerts ? 0 : 1,
      );
      expect(ermittleAuswahl(auswahl)).toEqual({ fehler: 'ueberspannt-mehrere' });
    }
  },
);

it('erlaubt Absatztext neben einer nur leer berührten Zusatztexthülle', async () => {
  const { host } = await anzeigen('<tabelle>x y</tabelle>');
  const zusatz = findeTextknoten(host, 'x y');
  const auswahl = window.getSelection();
  if (!auswahl) throw Error('Auswahl fehlt');
  auswahl.setBaseAndExtent(findeTextknoten(host, 'A'), 0, zusatz, 0);
  expect(ermittleAuswahl(auswahl)).toMatchObject({ xmlId: 'n1', bezugstext: 'A' });
  auswahl.setBaseAndExtent(zusatz, 3, findeTextknoten(host, 'B'), 1);
  expect(ermittleAuswahl(auswahl)).toMatchObject({ xmlId: 'n1', bezugstext: 'B' });
});

it('erkennt eine Änderung ausschließlich im Zusatztext als Konflikt eines pauschalen Kommentars', async () => {
  const { g } = await anzeigen('<tabelle>x y</tabelle>');
  const pfad = aufbau.basis + 'gesetze/TestG_de-bund.xml';
  aufbau.native.texte.set(pfad, gesetz('<tabelle>x y</tabelle>'));
  const ergebnis = await hinzufuegenMarkierung(
    g,
    markierungsEintrag({ typ: 'kommentar', kommentarText: 'Gilt für die ganze Norm' }),
  );
  expect(ergebnis.erfolgreich).toBe(true);
  // Zwei Absatzzeichen plus drei rohe Zeichen im Zusatztext; keine Layoutabstände.
  expect((await ladeMarkierungen(g))[0]?.bezug.elementstand).toEqual({ textlaenge: 5 });
  await pruefeAlleMarkierungen();
  const konfliktPfad = aufbau.basis + 'markierungskonflikte.xml';
  expect(aufbau.native.texte.get(konfliktPfad) ?? '').not.toContain('<konflikt ');
  // Erkennt eine spätere strukturierte Darstellung desselben Inhalts nicht als Änderung.
  aufbau.native.texte.set(pfad, gesetz('<absatz>x y</absatz>'));
  await pruefeAlleMarkierungen();
  expect(aufbau.native.texte.get(konfliktPfad) ?? '').not.toContain('<konflikt ');
  aufbau.native.texte.set(pfad, gesetz('<tabelle>x y länger</tabelle>'));
  await pruefeAlleMarkierungen();
  expect(aufbau.native.texte.get(konfliktPfad)).toContain(
    '<konflikt typ="pauschaler-bezug-unpassend"',
  );
});

it('erhält die Textstelle des folgenden Absatzes über Export, Import und Konfliktprüfung', async () => {
  const stellen = [];
  for (const block of ['', '<tabelle>x y</tabelle>']) {
    const { host, g } = await anzeigen(block);
    const blatt = [...host.querySelectorAll('[data-leaf]')].find((el) => el.textContent === 'B');
    if (!blatt) throw Error('Textblatt fehlt');
    aufbau.waehleTextImBlatt(blatt, 'B');
    const auswahl = ermittleAuswahl(window.getSelection());
    if ('fehler' in auswahl) throw Error(auswahl.fehler);
    stellen.push(auswahl.textstelle);
    if (!block) continue;
    aufbau.native.texte.set(aufbau.basis + 'gesetze/TestG_de-bund.xml', gesetz(block));
    const ergebnis = await hinzufuegenMarkierung(
      g,
      markierungsEintrag({
        typ: 'unterstreichung',
        ausgangsstelle: normAusgangsstelle('§ 1'),
        bezug: { typ: 'bezugstext', textstelle: auswahl.textstelle, bezugstext: 'B' },
      }),
    );
    expect(ergebnis.erfolgreich).toBe(true);
    expect(await exportiere(new Set(['alleMarkierungen', 'alleGesetze']), {})).toBe('exportiert');
    const [pfad] = [...aufbau.native.binaer.keys()];
    for (const datei of [...aufbau.native.texte.keys()])
      if (datei.includes('/markierungen/')) aufbau.native.texte.delete(datei);
    if (!pfad) throw Error('Exportdatei fehlt');
    const bericht = await importierePfade([pfad]);
    expect(bericht.konflikte).toHaveLength(0);
    const markierungen = await ladeMarkierungen({ kurztitel: 'TestG', normgeber: 'de-bund' });
    expect(markierungen[0]?.bezug.textstelle).toEqual(auswahl.textstelle);
    await pruefeAlleMarkierungen();
    const konflikte = [...aufbau.native.texte.entries()].filter(([p]) =>
      p.endsWith('markierungskonflikte.xml'),
    );
    expect(konflikte.every(([, xml]) => !xml.includes('<konflikt '))).toBe(true);
  }
  expect(stellen[0]).toEqual(stellen[1]);
});

it('prüft die optionale Zusatztextliste und verdeckt Zusatztext weggefallener Normen nicht', async () => {
  const { norm } = await anzeigen('<tabelle>x y</tabelle>');
  expect(istUebertragenesElement(norm)).toBe(true);
  for (const zusatztexte of [
    null,
    {},
    [{ text: 1, nachAbsatz: 1 }],
    [{ text: 'x', nachAbsatz: -1 }],
    [{ text: 'x', nachAbsatz: 3 }],
    [{ text: 'x', nachAbsatz: 0.5 }],
  ]) {
    expect(istUebertragenesElement({ ...norm, zusatztexte })).toBe(false);
  }
  expect(
    normWeggefallen({
      ...norm,
      status: 'weggefallen',
      absaetze: [],
      zusatztexte: [{ nachAbsatz: 0, text: 'x y' }],
    }),
  ).toBe(false);
});

function NormAnzeige({ norm }: { norm: NormDarstellung }) {
  const modell = useTextDarstellungsModell({});
  return (
    <TextDarstellungsRahmen modell={modell}>
      <NormBlock norm={norm} schrift={14} satzNeuZeile={true} />
    </TextDarstellungsRahmen>
  );
}
it('zeigt Zusatztext einer weggefallenen Norm in der Normansicht', async () => {
  const { host, root, norm } = await anzeigen('<tabelle>x y</tabelle>');
  const weg: NormDarstellung = {
    ...norm,
    status: 'weggefallen',
    absaetze: [],
    zusatztexte: [{ text: 'Zusatz bleibt sichtbar', nachAbsatz: 0 }],
  };
  await act(async () => root.render(<NormAnzeige norm={weg} />));
  expect(host.textContent).toContain('Zusatz bleibt sichtbar');
});

it('erhält die Anzahl und Breite der Bezeichnungsspalten und zeigt mehrere Blöcke in Quellenreihenfolge', async () => {
  const spalten = [];
  for (const block of ['', '<kasten>Vorne</kasten><kasten>Noch davor</kasten>']) {
    const g = parseGesetzesXML(
      gesetz(block ? '<tabelle>Mitte</tabelle><kasten>Danach</kasten>' : '')
        .replace('<absatz>A</absatz>', `${block}<absatz zahl="(1)">A</absatz>`)
        .replace('<absatz>B</absatz>', '<absatz zahl="(2)">B</absatz>'),
    );
    const e = g?.elemente[0];
    if (e?.typ !== 'norm') throw Error('Norm fehlt');
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    wurzeln.push(root);
    await act(async () => root.render(<NormAnzeige norm={e.data} />));
    const nummern = [...host.querySelectorAll<HTMLElement>('span')].filter(
      (el) => el.style.minWidth && ['(1)', '(2)'].includes(el.textContent ?? ''),
    );
    spalten.push(nummern.map((el) => [el.textContent, el.style.minWidth]));
    const text = host.textContent ?? '';
    if (block) {
      expect(text.indexOf('A')).toBeLessThan(text.indexOf('Mitte'));
      expect(text.indexOf('Mitte')).toBeLessThan(text.indexOf('Danach'));
      expect(text.indexOf('Danach')).toBeLessThan(text.indexOf('B'));
      expect(text.indexOf('Vorne')).toBeLessThan(text.indexOf('Noch davor'));
      expect(text.indexOf('Noch davor')).toBeLessThan(text.indexOf('A'));
    }
  }
  expect(spalten[0]).toHaveLength(2);
  expect(spalten[0]).toEqual(spalten[1]);
});
