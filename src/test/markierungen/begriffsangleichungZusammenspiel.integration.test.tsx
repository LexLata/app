import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { geladenesTabGesetz } from '@/test/tabs/tabFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// @vitest-environment jsdom
// Gesamtdurchgang der Begriffsangleichung über echte Fachmodule und zwei
// getrennte Hauptfensterzustände. Nur native I/O-Grenzen sind Attrappen.

import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { AbsatzListe } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import { behandleGesetzeskurzbefehl } from '@/hooks/eingabe/useTastenkuerzel.helpers';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import { exportiere } from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import {
  ladeAlleGesetzeskurzbefehle,
  setzeReservierteTastenkuerzel,
  speichereGesetzeskurzbefehl,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { aktuellerTextAnPfad, ermittleAuswahl } from '@/lib/domain/textpfad/textpfad.index';
import {
  hinzufuegenMarkierung,
  ladeMarkierungen,
  pruefeAlleMarkierungen,
  type MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const fenster = new Map<string, ReturnType<typeof useAppTabs>>();
const wurzeln: Root[] = [];
function Hauptfenster({ name }: { name: string }) {
  fenster.set(name, useAppTabs());
  return null;
}
async function oeffneHauptfenster(name: string) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  await act(async () => root.render(<Hauptfenster name={name} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // JSDOM besitzt keine native Canvasmessung; der echte Renderer nutzt seinen Fallback.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  aufbau.bereiteNativeAttrappeVor();
  setzeReservierteTastenkuerzel([]);
});
afterEach(async () => {
  await aufbau.raeumeTestFensterAuf(wurzeln);
  fenster.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('erhält importiertes Gesetz, ZIP-Kurzbefehl und verschachtelte Textstelle bis zum erneuten Konfliktabgleich im zweiten Hauptfenster', async () => {
  const gesetzXML = `<gesetz version="1"><infos><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><normgeber>de-bund</normgeber></infos><inhalt>
    <norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)"><satz zahl="1">Einleitung
      <nummer zahl="1.">Außen<litera buchstabe="a)">😀 Wort danach</litera></nummer>
    </satz></absatz></text></norm></inhalt></gesetz>`;
  aufbau.native.texte.set('/import/TestG.xml', gesetzXML);
  const importbericht = await importierePfade(['/import/TestG.xml']);
  expect(importbericht.fehler).toEqual([]);
  expect(importbericht.konflikte).toEqual([]);
  expect(importbericht.berichtEintraege).toContainEqual({
    kategorie: 'gesetz',
    aktion: 'neu',
    name: 'TestG',
    quelle: 'TestG.xml',
    meldungen: [],
    abschluss: expect.objectContaining({ abonnieren: expect.any(Function) }),
  });
  const [gesetz] = await ladeAlleGesetze();
  expect(gesetz).toBeDefined();
  expect(gesetz!.normgeber).toBe('de-bund');
  const textstelle = structuredClone(aufbau.beispielTextstelle);
  expect(aktuellerTextAnPfad(gesetz!.elemente[0]!.data, textstelle)).toBe('Wort');
  const kombination = { taste: 't', meta: true, ctrl: false, shift: true, alt: false };
  await speichereGesetzeskurzbefehl(gesetz!, kombination);
  localStorage.setItem('lexlata.markierungenDeaktiviert', 'false');
  expect(await exportiere(new Set(['gesetzeskurzbefehle', 'einstellungen']), {})).toBe(
    'exportiert',
  );
  const [exportpfad, zip] = [...aufbau.native.binaer.entries()][0]!;
  expect(Object.keys(unzipSync(zip))).toEqual(
    expect.arrayContaining([
      'Einstellungen/gesetzeskurzbefehle.xml',
      'Einstellungen/Einstellungen.xml',
    ]),
  );
  aufbau.native.texte.delete(aufbau.basis + 'einstellungen/gesetzeskurzbefehle.xml');
  localStorage.removeItem('lexlata.markierungenDeaktiviert');
  const austauschbericht = await importierePfade([exportpfad]);
  expect(austauschbericht.fehler).toEqual([]);
  expect(austauschbericht.konflikte).toEqual([]);
  expect(localStorage.getItem('lexlata.markierungenDeaktiviert')).toBe('false');

  await oeffneHauptfenster('eins');
  await oeffneHauptfenster('zwei');
  const geladen = await ladeAlleGesetzeskurzbefehle();
  const event = {
    key: 'T',
    code: 'KeyT',
    metaKey: true,
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    preventDefault: vi.fn(),
  };
  let oeffnung: Promise<void> | undefined;
  await act(async () => {
    behandleGesetzeskurzbefehl(
      event,
      { current: geladen },
      { current: alsSuchverzeichniseintraege(await ladeAlleGesetze()) },
      {
        current: (auftrag, modus) => {
          oeffnung = fenster
            .get('zwei')!
            .ladeGesetz(auftrag.gesetzesreferenz)
            .then((ergebnis) => {
              if (ergebnis.status === 'geladen')
                fenster.get('zwei')!.gesetzOeffnen(ergebnis.gesetz, undefined, modus);
            });
          return () => {};
        },
      },
    );
    await oeffnung;
  });
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(fenster.get('eins')!.holeTabGesetz(fenster.get('eins')!.tabs[0])).toBeUndefined();
  const aufgerufen = geladenesTabGesetz(fenster.get('zwei')!, fenster.get('zwei')!.tabs[0]);
  expect(aufgerufen.kurztitel).toBe('TestG');
  expect(aufgerufen.normgeber).toBe('de-bund');

  const host = document.createElement('div');
  host.setAttribute('data-xml-id', 'n1');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  await act(async () =>
    root.render(
      <AbsatzListe
        absaetze={(aufgerufen.elemente[0]!.data as NormDarstellung).absaetze}
        schrift={1}
        satzNeuZeile={true}
        ausgangsXmlId="n1"
      />,
    ),
  );
  expect(host.textContent).toContain('Wort');
  const blatt = [...host.querySelectorAll('[data-leaf]')].find((blatt) =>
    blatt.textContent.includes('Wort'),
  )!;
  aufbau.waehleTextImBlatt(blatt, 'Wort');
  const auswahl = ermittleAuswahl(window.getSelection());
  if ('fehler' in auswahl) throw Error(`Auswahl fehlgeschlagen: ${auswahl.fehler}`);
  expect(auswahl).toEqual({ xmlId: 'n1', textstelle, bezugstext: 'Wort' });
  const markierung: MarkierungsEintrag = markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),

    bezug: {
      typ: 'bezugstext' as const,
      textstelle: auswahl.textstelle,
      bezugstext: auswahl.bezugstext,
    },
  });
  expect((await hinzufuegenMarkierung(aufgerufen, markierung)).erfolgreich).toBe(true);
  const eintraege = await ladeMarkierungen(aufgerufen);
  expect(eintraege).toEqual([{ ...markierung, erstellt: expect.any(String) }]);
  await pruefeAlleMarkierungen();
  const konfliktpfad = aufbau.basis + 'markierungskonflikte.xml';
  const konfliktstand = () =>
    new DOMParser().parseFromString(aufbau.native.texte.get(konfliktpfad)!, 'application/xml');
  expect(konfliktstand().documentElement.getAttribute('pruefstatus')).toBe('aktuell');
  expect(
    konfliktstand().querySelectorAll('unterstreichung, hervorhebung, kommentar, verweismarkierung'),
  ).toHaveLength(0);
  // Negativkontrolle: derselbe Blattpfad mit geändertem Wortlaut muss auffallen.
  const gesetzpfad = [...aufbau.native.texte.keys()].find((pfad) =>
    pfad.startsWith(aufbau.basis + 'gesetze/'),
  )!;
  aufbau.native.texte.set(
    gesetzpfad,
    aufbau.native.texte.get(gesetzpfad)!.replace('😀 Wort danach', '😀 Neu! danach'),
  );
  await pruefeAlleMarkierungen();
  expect(
    konfliktstand().querySelectorAll('unterstreichung, hervorhebung, kommentar, verweismarkierung'),
  ).toHaveLength(1);
  expect(aufbau.native.texte.get(konfliktpfad)).toContain('bezugstext-fehlt-oder-unpassend');
});
