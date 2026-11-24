// @vitest-environment jsdom
// Echtes Fenster samt Kontextfassade, Hooks und Speicherung; nur native APIs sind ersetzt.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  ladeMarkierungen,
  registriereMarkierungsHistorienEmpfang,
} from '@/lib/markierungen/markierungen.index';
import VerweismarkierungFenster from './VerweismarkierungFenster';
const dom = domTestWurzel();
const quelle = { kurztitel: 'BGB', normgeber: 'de-bund' };
const xml =
  '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>BGB</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm></inhalt></gesetz>';
beforeEach(() => {
  aufbau.bereiteNativeAttrappeVor();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
it('speichert vom ungeladenen BGB in die ungeladene StPO und lässt unbeteiligte Dateien unberührt', async () => {
  const nativ = aufbau.native;
  nativ.kontexte.set(
    'main',
    JSON.stringify({
      gesetz: quelle,
      openerLabel: 'main',
      ausgangsstelle: normAusgangsstelle('§ 1'),
    }),
  );
  nativ.texte.set(aufbau.basis + 'gesetze/BGB_de-bund.xml', xml);
  const zielXML = xml.replaceAll('BGB', 'StPO');
  nativ.texte.set(aufbau.basis + 'gesetze/StPO_de-bund.xml', zielXML);
  nativ.texte.set(aufbau.basis + 'gesetze/Fremd_de-bund.xml', 'defekt');
  const gesetz = parseGesetzesXML(zielXML);
  if (!gesetz) throw Error('Zielgesetz der Testeingabe fehlt');
  nativ.texte.set(
    aufbau.basis + 'cache/suchverzeichnis.json',
    JSON.stringify({
      version: 1,
      abgeglichen: true,
      eintraege: alsSuchverzeichniseintraege([gesetz]),
    }),
  );
  const lesen = vi.spyOn(nativ.texte, 'get');
  let aktionen = 0;
  const abmelden = await registriereMarkierungsHistorienEmpfang(() => {
    aktionen++;
  });
  try {
    await act(async () => dom.root.render(<VerweismarkierungFenster />));
    const feld = dom.host.querySelector('textarea');
    const wertSetzen = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (!feld || !wertSetzen) throw Error('Verweisformular fehlt');
    await act(async () => {
      wertSetzen.call(feld, '§ 1 StPO');
      feld.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const fertig = [...dom.host.querySelectorAll('button')].find(
      (button) => button.textContent === 'Fertig',
    );
    if (!fertig) throw Error('Speicherknopf fehlt');
    await act(async () => fertig.click());
    await vi.waitFor(() => expect(nativ.schliessen).toHaveBeenCalledOnce());
    expect((await ladeMarkierungen(quelle))[0]?.verweisinhalt?.verweisziele).toEqual([
      expect.objectContaining({
        gesetz: { kurztitel: 'StPO', normgeber: 'de-bund' },
        bezeichnung: '§ 1',
      }),
    ]);
    expect(aktionen).toBe(1);
    expect(
      lesen.mock.calls.some(([pfad]) => pfad === aufbau.basis + 'gesetze/Fremd_de-bund.xml'),
    ).toBe(false);
    expect(nativ.texte.get(aufbau.basis + 'gesetze/Fremd_de-bund.xml')).toBe('defekt');
    expect(
      nativ.invoke.mock.calls.some(
        ([befehl, args]) =>
          befehl === 'archiviere_beschaedigte_datei' &&
          args?.relativerPfad === 'gesetze/Fremd_de-bund.xml',
      ),
    ).toBe(false);
  } finally {
    abmelden();
  }
});
