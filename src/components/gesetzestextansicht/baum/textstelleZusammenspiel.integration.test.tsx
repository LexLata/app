// @vitest-environment jsdom
// Derselbe Textbezug läuft durch Auswahl, XML, Anzeige, Hilfsfenster und echte Historienübernahme.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { holeTabGesetzFuerTest } from '@/test/tabs/tabBestandFuerTest';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AbsatzListe } from './baum.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { ermittleAuswahl, textAnTextpfad } from '@/lib/domain/textpfad/textpfad.index';
import { TextBlatt } from './textBlatt';
import { MarkierungCtx } from '@/components/gesetzestextansicht/markierung/markierung.index';
import { ladeHilfsfensterWurzel } from '@/components/hilfsfenster/hilfsfenster.index';
import { useVerweismarkierungUndKommentarHilfsfenster } from '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import {
  hinzufuegenMarkierung,
  fuehreRueckgaengigAus,
  fuehreWiederholenAus,
  ladeMarkierungen,
  pruefeAlleMarkierungen,
  registriereMarkierungsHistorienEmpfang,
  type MarkierungsAktion,
  type MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const wurzeln: Root[] = [];
function neueWurzel() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  return { host, root };
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 0),
  );
  aufbau.bereiteNativeAttrappeVor();
});
afterEach(async () => {
  await aufbau.raeumeTestFensterAuf(wurzeln);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('erhält die gespeicherte UTF-16-Textstelle über Anzeige, Kommentarfenster, bestätigte Bearbeitung und Undo/Redo bis zum Konfliktabgleich', async () => {
  aufbau.native.texte.set(
    aufbau.basis + 'gesetze/TestG_de-bund.xml',
    `<gesetz version="1"><infos><kurztitel>TestG</kurztitel><normgeber>de-bund</normgeber><langtitel>Testgesetz</langtitel></infos><inhalt>
    <norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)"><satz zahl="1"><nummer zahl="1."><litera buchstabe="a)">😀 Wort danach</litera></nummer></satz></absatz></text></norm>
    </inhalt></gesetz>`,
  );
  const [gesetz] = await ladeAlleGesetze();
  const textstelle = structuredClone(aufbau.beispielTextstelle);
  const anzeige = neueWurzel();
  anzeige.host.setAttribute('data-xml-id', 'n1');
  const handler = useVerweismarkierungUndKommentarHilfsfenster({
    ladeGesetz: markierungsEinzelzugriffFuerTest,
    holeTabGesetz: holeTabGesetzFuerTest,
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: null },
    einklappZustandRef: { current: {} },
    markierungenDeaktiviertRef: { current: false },
  });
  const bearbeiten = vi.fn((_xmlId: string, eintrag: MarkierungsEintrag) =>
    handler.handleKommentarBearbeiten(gesetz!, eintrag),
  );
  async function anzeigen(markierungen: MarkierungsEintrag[]) {
    await act(async () =>
      anzeige.root.render(
        <MarkierungCtx.Provider
          value={{ markierungenNachXmlId: new Map(), onKommentarKlick: bearbeiten }}
        >
          <TextBlatt
            text="😀 Wort danach"
            pfad={textstelle.pfad}
            markierungen={markierungen}
            style={{}}
            ausgangsXmlId="n1"
          />
        </MarkierungCtx.Provider>,
      ),
    );
  }
  await anzeigen([]);
  const blatt = anzeige.host.querySelector('[data-leaf]')!;
  aufbau.waehleTextImBlatt(blatt, 'Wort');
  const auswahl = ermittleAuswahl(window.getSelection());
  expect(auswahl).toEqual({ xmlId: 'n1', textstelle, bezugstext: 'Wort' });
  if ('fehler' in auswahl) throw Error('Auswahl fehlgeschlagen');
  const original: MarkierungsEintrag = markierungsEintrag({
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1'),

    kommentarText: 'Vorher',
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: auswahl.textstelle,
      bezugstext: auswahl.bezugstext,
    },
  });
  expect((await hinzufuegenMarkierung(gesetz!, original)).erfolgreich).toBe(true);
  const geladen = await ladeMarkierungen(gesetz!);
  expect(geladen).toEqual([{ ...original, erstellt: expect.any(String) }]);
  window.getSelection()!.removeAllRanges();
  await anzeigen(geladen);
  const symbol = anzeige.host.querySelector('[data-zitatanhang]')!;
  expect(symbol).not.toBeNull();
  expect(anzeige.host.textContent).toBe('😀 Wortⓘ danach');
  await act(async () => {
    symbol.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(() => expect(aufbau.native.kontexte.size).toBe(1));
  });
  expect(bearbeiten).toHaveBeenCalledExactlyOnceWith('n1', geladen[0]);
  const [label, payload] = [...aufbau.native.kontexte.entries()][0]!;
  expect(JSON.parse(payload).bearbeiten.textbezug).toEqual({ textstelle, bezugstext: 'Wort' });
  expect(aufbau.native.invoke).toHaveBeenCalledWith(
    'kommentar_fenster_oeffnen',
    expect.objectContaining({ label }),
  );
  const aktionen: MarkierungsAktion[] = [];
  const abmelden = await registriereMarkierungsHistorienEmpfang((aktion) => aktionen.push(aktion));
  try {
    aufbau.native.label = label;
    const KommentarFenster = await ladeHilfsfensterWurzel(label);
    if (!KommentarFenster) throw Error('Kommentarfenster fehlt');
    const hilfe = neueWurzel();
    await act(async () => hilfe.root.render(<KommentarFenster />));
    expect(hilfe.host.querySelector('textarea')).not.toBeNull();
    const feld = hilfe.host.querySelector('textarea')!;
    expect(feld.value).toBe('Vorher');
    expect(hilfe.host.textContent).toContain('Wort');
    expect(hilfe.host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(
      true,
    );
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        feld,
        'Nachher',
      );
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const fertig = [...hilfe.host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Fertig',
    )!;
    await act(async () => {
      fertig.click();
      await vi.waitFor(() => expect(aufbau.native.schliessen).toHaveBeenCalledOnce());
    });
    expect(aktionen).toHaveLength(1);
    expect(aktionen[0]).not.toHaveProperty('staende');
    expect(aktionen[0]).toMatchObject({
      vorher: { erstellt: geladen[0]?.erstellt },
      nachher: { erstellt: geladen[0]?.erstellt, geaendert: expect.any(String) },
    });
    expect(aktionen[0]).toMatchObject({
      art: 'kommentarBearbeiten',
      vorher: { textstelle, bezugstext: 'Wort' },
      nachher: {
        textstelle,
        bezugstext: 'Wort',
        kommentarText: 'Nachher',
      },
    });
    aufbau.native.label = 'main';
    const nachher = await ladeMarkierungen(gesetz!);
    expect(nachher).toEqual([
      { ...geladen[0], geaendert: expect.any(String), kommentarText: 'Nachher' },
    ]);
    await anzeigen(nachher);
    expect(anzeige.host.querySelector('[data-zitatanhang]')).not.toBeNull();
    await fuehreRueckgaengigAus(aktionen[0]!);
    expect(await ladeMarkierungen(gesetz!)).toEqual(geladen);
    await fuehreWiederholenAus(aktionen[0]!);
    expect(await ladeMarkierungen(gesetz!)).toEqual(nachher);
    await pruefeAlleMarkierungen();
    const konfliktpfad = aufbau.basis + 'markierungskonflikte.xml';
    const konfliktanzahl = () =>
      new DOMParser()
        .parseFromString(aufbau.native.texte.get(konfliktpfad)!, 'application/xml')
        .querySelectorAll('unterstreichung, hervorhebung, kommentar, verweismarkierung').length;
    expect(konfliktanzahl()).toBe(0);
    const gesetzpfad = aufbau.basis + 'gesetze/TestG_de-bund.xml';
    aufbau.native.texte.set(
      gesetzpfad,
      aufbau.native.texte.get(gesetzpfad)!.replace('😀 Wort danach', '😀 Neu! danach'),
    );
    await pruefeAlleMarkierungen();
    expect(konfliktanzahl()).toBe(1);
  } finally {
    abmelden();
  }
});

async function zeigeAbsaetze(absaetze: Parameters<typeof AbsatzListe>[0]['absaetze']) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const anzeige = neueWurzel();
  anzeige.host.setAttribute('data-xml-id', 'n1');
  await act(async () =>
    anzeige.root.render(
      <AbsatzListe absaetze={absaetze} schrift={14} satzNeuZeile={true} ausgangsXmlId="n1" />,
    ),
  );
  return anzeige;
}

it.each([undefined, '[2]', '[10]'])(
  'erhält gedruckte Labels über Parser, Darstellung, Auswahl, MarkierungsXML und Rückweg (Unterabsatz %s)',
  async (unterabsatz) => {
    const liste =
      '<satz zahl="1"><nummer zahl="1."><litera buchstabe="a)">Erster Text</litera></nummer><nummer zahl="1."><litera buchstabe="a)">Zweiter Text</litera></nummer></satz>';
    const inhalt =
      unterabsatz === undefined
        ? liste
        : Array.from(
            { length: 10 },
            (_, i) => `<unterabsatz zahl="[${i + 1}]">${liste}</unterabsatz>`,
          ).join('');
    const quellXML = `<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)">${inhalt}</absatz></text></norm></inhalt></gesetz>`;
    aufbau.native.texte.set(aufbau.basis + 'gesetze/TestG_de-bund.xml', quellXML);
    const gesetz = parseGesetzesXML(quellXML)!;
    const element = gesetz.elemente[0]!;
    if (element.typ !== 'norm') throw Error('Norm fehlt');
    const anzeige = await zeigeAbsaetze(element.data.absaetze);
    if (unterabsatz) expect(anzeige.host.textContent).toContain('[10]');
    const blatt = [...anzeige.host.querySelectorAll('[data-leaf]')].find(
      (el) =>
        el.textContent === 'Zweiter Text' &&
        el.getAttribute('data-unterabsatz') === (unterabsatz ?? null),
    )!;
    expect(blatt, anzeige.host.innerHTML).toBeDefined();
    aufbau.waehleTextImBlatt(blatt, 'Text');
    const auswahl = ermittleAuswahl(window.getSelection());
    if ('fehler' in auswahl) throw Error(auswahl.fehler);
    expect(auswahl.textstelle.pfad).toEqual(
      normtextPfad({
        absatz: '(1)',
        ...(unterabsatz ? { unterabsatz } : {}),
        satz: 1,
        eintraege: [
          { ebene: 'nummer', bezeichnung: '1.', wiederholung: 1 },
          { ebene: 'litera', bezeichnung: 'a)' },
        ],
      }),
    );
    expect(
      (
        await hinzufuegenMarkierung(
          gesetz,
          markierungsEintrag({
            typ: 'unterstreichung',
            ausgangsstelle: normAusgangsstelle('§ 1'),

            bezug: {
              typ: 'bezugstext' as const,
              textstelle: auswahl.textstelle,
              bezugstext: auswahl.bezugstext,
            },
          }),
        )
      ).erfolgreich,
    ).toBe(true);
    const xml = [...aufbau.native.texte.entries()].find(([pfad]) =>
      pfad.startsWith(aufbau.basis + 'markierungen/'),
    )![1];
    expect(xml).toContain('<absatz>(1)</absatz>');
    expect(xml).toContain('<nummer wiederholung="1">1.</nummer>');
    expect(xml).toContain('<litera>a)</litera>');
    if (unterabsatz) expect(xml).toContain(`<unterabsatz>${unterabsatz}</unterabsatz>`);
    const [gelesen] = await ladeMarkierungen(gesetz);
    expect(gelesen!.bezug.textstelle).toEqual(auswahl.textstelle);
    expect(textAnTextpfad(element.data, gelesen!.bezug.textstelle!)).toBe('Text');
  },
);

it('erhält zwei gleich bezeichnete Absätze und unveränderte Unterabsatzadressen über DOM und XML', async () => {
  const quellXML =
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)"><unterabsatz zahl="[2]">Alpha</unterabsatz></absatz><absatz zahl="(1)"><unterabsatz zahl="[2]">Beta</unterabsatz></absatz></text></norm></inhalt></gesetz>';
  aufbau.native.texte.set(aufbau.basis + 'gesetze/TestG_de-bund.xml', quellXML);
  const gesetz = parseGesetzesXML(quellXML);
  if (!gesetz) throw Error('Gesetz fehlt');
  const element = gesetz.elemente[0];
  if (!element) throw Error('Element fehlt');
  if (element.typ !== 'norm') throw Error('Norm fehlt');
  const anzeige = await zeigeAbsaetze(element.data.absaetze);
  for (const [index, text] of ['Alpha', 'Beta'].entries()) {
    const blatt = [...anzeige.host.querySelectorAll('[data-leaf]')].find(
      (el) => el.textContent === text,
    );
    if (!blatt) throw Error('Blatt fehlt');
    window.getSelection()?.removeAllRanges();
    aufbau.waehleTextImBlatt(blatt, text);
    const auswahl = ermittleAuswahl(window.getSelection());
    if ('fehler' in auswahl) throw Error(auswahl.fehler);
    expect(auswahl.textstelle.pfad).toEqual(
      normtextPfad({
        absatz: '(1)',
        ...(index ? { absatzWiederholung: index } : {}),
        unterabsatz: '[2]',
      }),
    );
    expect(
      (
        await hinzufuegenMarkierung(
          gesetz,
          markierungsEintrag({
            typ: 'unterstreichung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: { typ: 'bezugstext' as const, textstelle: auswahl.textstelle, bezugstext: text },
          }),
        )
      ).erfolgreich,
    ).toBe(true);
  }
  const datei = [...aufbau.native.texte.entries()].find(([pfad]) =>
    pfad.startsWith(aufbau.basis + 'markierungen/'),
  );
  if (!datei) throw Error('Markierungsdatei fehlt');
  const xml = datei[1];
  expect(xml).toContain('<absatz wiederholung="1">(1)</absatz>');
  const textstellen = (await ladeMarkierungen(gesetz)).map((eintrag) => {
    if (!eintrag.bezug.textstelle) throw Error('Textbezug fehlt');
    return eintrag.bezug.textstelle;
  });
  expect(textstellen.map((textstelle) => textstelle.pfad.absatzWiederholung ?? 0)).toEqual([0, 1]);
  expect(textstellen.map((textstelle) => textstelle.pfad.unterabsatz)).toEqual(['[2]', '[2]']);
  expect(textstellen.map((textstelle) => textAnTextpfad(element.data, textstelle))).toEqual([
    'Alpha',
    'Beta',
  ]);
});
