// @vitest-environment jsdom
// Alle zulässigen Präambelbezüge durch echte Speicher, XML und sichtbaren Anzeige-Hook.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AbsatzListe } from './baum.index';
import {
  MarkierungCtx,
  useMarkierungenAnzeige,
  useMarkierungCtxValue,
} from '@/components/gesetzestextansicht/markierung/markierung.index';
import {
  KommentarSuperscript,
  VerweisSuperscript,
} from '@/components/gesetzestextansicht/markierung/markierung.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import {
  hinzufuegenMarkierung,
  ladeMarkierungen,
  type MarkierungsEintrag,
} from '@/lib/markierungen/markierungen.index';
import {
  pruefeAlleMarkierungen,
  ladeMarkierungskonflikteFuerAnzeige,
} from '@/lib/markierungen/markierungen.index';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { importierePfade } from '@/test/import/dateiImportTesthilfe';
import { DateiImportOverlay } from '@/components/overlays/overlays.index';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';

function Anzeige({ gesetz }: { gesetz: GesetzDarstellung }) {
  const { markierungenNachXmlId } = useMarkierungenAnzeige(gesetz);
  const value = useMarkierungCtxValue({ markierungenNachXmlId });
  const element = gesetz.elemente[0];
  if (element?.typ !== 'norm') throw Error('Präambel fehlt');
  const norm = element.data;
  const markierungen = markierungenNachXmlId.get(norm.xmlId) ?? [];
  return (
    <MarkierungCtx.Provider value={value}>
      <AbsatzListe
        absaetze={norm.absaetze}
        markierungen={markierungen}
        schrift={14}
        satzNeuZeile={true}
        ausgangsXmlId={norm.xmlId}
      />
      <KommentarSuperscript markierungen={markierungen} ausgangsXmlId={norm.xmlId} />
      <VerweisSuperscript markierungen={markierungen} ausgangsXmlId={norm.xmlId} />
    </MarkierungCtx.Provider>
  );
}
const wurzeln: Root[] = [];
async function pruefeAnzeige(
  gesetz: GesetzDarstellung,
  typ: MarkierungsEintrag['typ'],
  erwarteterText: string,
) {
  await pruefeAlleMarkierungen(() => {});
  expect((await ladeMarkierungskonflikteFuerAnzeige(() => {})).gesetze).toEqual([]);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  await act(async () => root.render(<Anzeige gesetz={gesetz} />));
  await vi.waitFor(async () => {
    await act(async () => {
      if (typ === 'unterstreichung')
        expect(host.querySelector('[style*="text-decoration: underline"]')?.textContent).toBe(
          erwarteterText,
        );
      if (typ === 'hervorhebung')
        expect(host.querySelector('[style*="background"]')?.textContent).toBe(erwarteterText);
      if (typ === 'kommentar') expect(host.textContent).toContain('ⓘ');
      if (typ === 'verweismarkierung')
        expect(host.textContent?.replaceAll('\u00a0', ' ')).toContain('§ 1');
    });
  });
}
beforeEach(() => {
  aufbau.bereiteNativeAttrappeVor();
  alleBannerSchliessen();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  aufbau.native.texte.set(
    aufbau.basis + 'gesetze/G_de-bund.xml',
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel><langtitel>Gesetz</langtitel></infos><inhalt><norm id="p"><bezeichnung>Präambel</bezeichnung><text><absatz><satz>Dieser Text bleibt.</satz></absatz></text></norm><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz><satz>Ziel.</satz></absatz></text></norm></inhalt></gesetz>',
  );
});
afterEach(async () => {
  await aufbau.raeumeTestFensterAuf(wurzeln);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
for (const typ of ['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'] as const) {
  for (const pauschal of typ === 'kommentar' || typ === 'verweismarkierung'
    ? [false, true]
    : [false]) {
    it(`${typ}, ${pauschal ? 'pauschal' : 'Textbezug'}: nach Speichern frisch geladen sichtbar und konfliktfrei`, async () => {
      const [gesetz] = await ladeAlleGesetze();
      if (!gesetz) throw Error('Gesetz fehlt');
      const element = gesetz.elemente[0];
      if (!element) throw Error('Präambel fehlt');
      const kennung = ausgangsnormKennung(gesetz, element);
      if (!kennung) throw Error('Kennung fehlt');
      const eintrag = markierungsEintrag({
        typ,
        ausgangsstelle: kennung,
        bezug: pauschal
          ? { typ: 'pauschal', elementstand: { textlaenge: 0 } }
          : {
              typ: 'bezugstext',
              textstelle: {
                pfad: { typ: 'normtext' },
                zeichenbereichStart: 0,
                zeichenbereichEnde: 6,
              },
              bezugstext: 'Dieser',
            },
        kommentarText: 'Kommentar zur Präambel',
        verweisinhalt: {
          verweistext: '§ 1',
          verweisziele: [
            verweisziel({
              typ: 'zielnormOhneElementstand',
              bezeichnung: '§ 1',

              gesetz: { normgeber: 'de-bund', kurztitel: 'G' },
              verweistextZeichenbereich: [0, 3],
            }),
          ],
        },
      });
      expect((await hinzufuegenMarkierung(gesetz, eintrag)).erfolgreich).toBe(true);
      const [frisch] = await ladeAlleGesetze();
      if (!frisch) throw Error('Gesetz fehlt');
      const [geladen] = await ladeMarkierungen(frisch);
      expect(geladen?.typ).toBe(typ);
      expect(geladen?.ausgangsstelle).toEqual(kennung);
      if (!geladen) throw Error('Markierung fehlt');
      await pruefeAnzeige(frisch, typ, 'Dieser');
    });
  }
}

it('übernimmt die Präambel per Dateiimport und nach echter Overlayentscheidung erneut sichtbar und konfliktfrei', async () => {
  const gesetzPfad = aufbau.basis + 'gesetze/G_de-bund.xml';
  const quellPfad = '/import/Praeambelgesetz.xml';
  const gesetzXML = aufbau.native.texte.get(gesetzPfad);
  if (!gesetzXML) throw Error('GesetzesXML fehlt');
  aufbau.native.texte.delete(gesetzPfad);
  aufbau.native.texte.set(quellPfad, gesetzXML);
  const gesetzImport = await importierePfade([quellPfad]);
  expect(gesetzImport.fehler).toEqual([]);
  expect(gesetzImport.konflikte).toEqual([]);
  expect(gesetzImport.berichtEintraege).toEqual([
    expect.objectContaining({ kategorie: 'gesetz', aktion: 'neu', quelle: 'Praeambelgesetz.xml' }),
  ]);
  expect(aufbau.native.texte.get(gesetzPfad)).toBeDefined();
  const [gesetz] = await ladeAlleGesetze();
  if (!gesetz?.elemente[0]) throw Error('Importiertes Gesetz fehlt');
  const kennung = ausgangsnormKennung(gesetz, gesetz.elemente[0]);
  if (!kennung) throw Error('Präambelkennung fehlt');
  const eintrag = markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: kennung,
    bezug: {
      typ: 'bezugstext',
      textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 0, zeichenbereichEnde: 6 },
      bezugstext: 'Dieser',
    },
  });
  expect((await hinzufuegenMarkierung(gesetz, eintrag)).erfolgreich).toBe(true);
  const markierungsPfad = aufbau.basis + 'markierungen/G_de-bund-markierungen.xml';
  const gespeichert = aufbau.native.texte.get(markierungsPfad);
  if (!gespeichert) throw Error('Gespeichertes MarkierungsXML fehlt');
  expect(gespeichert).toContain('Präambel');

  async function frischPruefen(erwarteterText: string) {
    const [frisch] = await ladeAlleGesetze();
    if (!frisch) throw Error('Frisch geladenes Gesetz fehlt');
    expect(frisch).not.toBe(gesetz);
    expect((await ladeMarkierungen(frisch)).map((m) => m.ausgangsstelle)).toEqual([kennung]);
    await pruefeAnzeige(frisch, 'unterstreichung', erwarteterText);
  }
  await frischPruefen('Dieser');

  // Eine andere Textspanne sorgt für einen echten Dateiimportkonflikt.
  const importXML = gespeichert
    .replace('start="0" ende="6"', 'start="7" ende="11"')
    .replace('<bezugstext>Dieser</bezugstext>', '<bezugstext>Text</bezugstext>');
  expect(importXML).not.toBe(gespeichert);
  aufbau.native.texte.set('/import/Praeambelmarkierungen.xml', importXML);
  const markierungsImport = await importierePfade(['/import/Praeambelmarkierungen.xml']);
  expect(markierungsImport.fehler).toEqual([]);
  expect(markierungsImport.konflikte).toEqual([
    expect.objectContaining({ art: 'markierung', quelle: 'Praeambelmarkierungen.xml' }),
  ]);
  expect(aufbau.native.texte.get(markierungsPfad)).toBe(gespeichert);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  wurzeln.push(root);
  await act(async () =>
    root.render(
      <DateiImportOverlay
        zustand={{ art: 'fertig', ergebnis: markierungsImport }}
        onSchliessen={() => {}}
        onNeuLaden={async () => {}}
      />,
    ),
  );
  expect(host.textContent).toContain('Praeambelmarkierungen.xml');
  const ersetzen = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Ersetzen');
  if (!ersetzen) throw Error('Echte Ersetzen-Aktion fehlt');
  await act(async () => ersetzen.click());
  await vi.waitFor(() => expect(host.textContent).not.toContain('Importkonflikte'));
  // Im Bericht steht der Kurztitel, nicht die Herkunftsdatei.
  expect(host.textContent).not.toContain('Praeambelmarkierungen.xml');
  expect(host.textContent).toContain('G ersetzt');
  expect(aufbau.native.texte.get(markierungsPfad)).toContain('<bezugstext>Text</bezugstext>');
  await frischPruefen('Text');
  expect(getSnapshot()).toEqual([]);
});
