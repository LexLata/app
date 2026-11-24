import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// @vitest-environment jsdom
// Echte Vertragsimporte: DOM-Auswahl bleibt über MarkierungsXML und Neuladen textgleich.

import { pfadAusBlatt } from '@/test/gesetz/textpfadFabrik';
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { readFileSync } from 'node:fs';
import { europaRessourceFixture } from '@/test/import/europaImportFixtures';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AbsatzListe } from './baum.index';
import { blattPfad, ermittleAuswahl, textAnTextpfad } from '@/lib/domain/textpfad/textpfad.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { hinzufuegenMarkierung, ladeMarkierungen } from '@/lib/markierungen/markierungen.index';
import { importiereGesetze } from '@/lib/import/import.index';
import type { GesetzDarstellung, NormDarstellung } from '@/lib/domain/gesetzTypes';
import {
  MarkierungCtx,
  useMarkierungenAnzeige,
  useMarkierungCtxValue,
} from '@/components/gesetzestextansicht/markierung/markierung.index';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';

function GespeicherteAnzeige({
  gesetz,
  norm,
}: {
  gesetz: GesetzDarstellung;
  norm: NormDarstellung;
}) {
  const { markierungenNachXmlId } = useMarkierungenAnzeige(gesetz);
  const value = useMarkierungCtxValue({ markierungenNachXmlId });
  return (
    <MarkierungCtx.Provider value={value}>
      <AbsatzListe
        absaetze={norm.absaetze}
        markierungen={markierungenNachXmlId.get(norm.xmlId) ?? []}
        schrift={14}
        satzNeuZeile={true}
        ausgangsXmlId={norm.xmlId}
      />
    </MarkierungCtx.Provider>
  );
}

const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: http.fetch }));
const wurzeln: Root[] = [];
beforeEach(() => {
  aufbau.bereiteNativeAttrappeVor();
  for (const resource of ['importindizes/eu.xml', 'europa/europaKuratiert.json']) {
    aufbau.native.texte.set(`/ressourcen/resources/${resource}`, europaRessourceFixture(resource));
  }
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(async () => {
  await aufbau.raeumeTestFensterAuf(wurzeln);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
for (const vertrag of [
  { titel: 'AEUV', kennung: 'E', zwischen: '294' },
  { titel: 'EUV', kennung: 'M', zwischen: '48' },
]) {
  for (const ziel of [
    'Zwischenüberschrift',
    'zweiter Präambelabsatz',
    'zweiter Unterabsatz',
  ] as const) {
    it(`${vertrag.titel}: ${ziel} über Auswahl → MarkierungsXML → Neuladen`, async () => {
      const celex = `02016${vertrag.kennung}/TXT-20250315`;
      http.fetch.mockImplementation(async (url: string) =>
        url.includes('/sparql?')
          ? Response.json({
              results: { bindings: [{ kons: { value: celex }, datum: { value: '2025-03-15' } }] },
            })
          : new Response(
              new Uint8Array(
                readFileSync(
                  `src/lib/import/eu/testdaten/formex/02016${vertrag.kennung}%2FTXT-20250315.fmx4`,
                ),
              ),
              { headers: { 'content-type': 'application/zip' } },
            ),
      );
      const importErgebnis = await importiereGesetze(
        [
          {
            kurztitel: vertrag.titel,
            abrufkennung: `12016${vertrag.kennung}/TXT`,
          },
        ],
        'eu',
        undefined,
        () => {},
      );
      expect(importErgebnis.fehlgeschlagene).toEqual([]);
      expect(importErgebnis.erfolgreiche).toHaveLength(1);
      const [gesetz] = await ladeAlleGesetze();
      if (!gesetz) throw new Error('Importiertes Gesetz fehlt');
      const normen = gesetz.elemente.filter((e) => e.typ === 'norm').map((e) => e.data);
      const norm = normen.find((n) =>
        ziel === 'Zwischenüberschrift'
          ? n.xmlId === vertrag.zwischen
          : ziel === 'zweiter Präambelabsatz'
            ? n.bezeichnung === 'Präambel'
            : n.absaetze.some((a) => a.unterabsaetze?.some((u) => u.bezeichnung === '[2]')),
      )!;
      expect(norm).toBeDefined();
      const host = document.createElement('div');
      host.setAttribute('data-xml-id', norm.xmlId);
      document.body.append(host);
      const root = createRoot(host);
      wurzeln.push(root);
      await act(async () =>
        root.render(
          <AbsatzListe
            absaetze={norm.absaetze}
            schrift={14}
            satzNeuZeile={true}
            ausgangsXmlId={norm.xmlId}
          />,
        ),
      );
      const zwischenIndex = norm.absaetze.findIndex((a) => a.zwischenueberschrift);
      const blatt = [...host.querySelectorAll('[data-leaf]')].find((el) => {
        const pfad = pfadAusBlatt(blattPfad(el));
        return ziel === 'Zwischenüberschrift'
          ? el.textContent === norm.absaetze[zwischenIndex]!.saetze.map((s) => s.text).join('')
          : ziel === 'zweiter Präambelabsatz'
            ? pfad.absatzWiederholung === 1
            : pfad.unterabsatz === '[2]';
      })!;
      expect(blatt, host.innerHTML).toBeDefined();
      if (ziel === 'Zwischenüberschrift') {
        expect(zwischenIndex).toBeGreaterThanOrEqual(0);
        expect(norm.absaetze[zwischenIndex]!.saetze.map((s) => s.text).join('')).toBe(
          blatt.textContent,
        );
      }
      const bezugstext = blatt.textContent.trim().split(/\s+/).slice(0, 2).join(' ');
      aufbau.waehleTextImBlatt(blatt, bezugstext);
      const auswahl = ermittleAuswahl(window.getSelection());
      if ('fehler' in auswahl) throw Error(auswahl.fehler);
      expect(auswahl.bezugstext).toBe(bezugstext);
      const kennung = ausgangsnormKennung(gesetz, { typ: 'norm', data: norm });
      if (!kennung) throw new Error('Ausgangskennung fehlt');
      const eintrag = markierungsEintrag({
        typ: 'unterstreichung',
        ausgangsstelle: kennung,
        bezug: { typ: 'bezugstext', textstelle: auswahl.textstelle, bezugstext },
      });
      const anlage = await hinzufuegenMarkierung(gesetz, eintrag);
      expect(anlage.erfolgreich).toBe(true);
      expect(
        [...aufbau.native.texte.keys()].some((pfad) =>
          pfad.startsWith(aufbau.basis + 'markierungen/'),
        ),
      ).toBe(true);
      const [xmlMarkierung] = await ladeMarkierungen(gesetz);
      expect(xmlMarkierung!.bezug.textstelle).toEqual(auswahl.textstelle);
      const [neuGeladen] = await ladeAlleGesetze();
      if (!neuGeladen) throw new Error('Frisch geladenes Gesetz fehlt');
      const [markierung] = await ladeMarkierungen(neuGeladen!);
      const neueNorm = neuGeladen!.elemente.find(
        (e) => e.typ === 'norm' && e.data.xmlId === norm.xmlId,
      )!;
      if (neueNorm.typ !== 'norm') throw Error('Norm fehlt');
      expect(markierung).toEqual(xmlMarkierung);
      expect(textAnTextpfad(neueNorm.data, markierung!.bezug.textstelle!)).toBe(bezugstext);
      await act(async () =>
        root.render(<GespeicherteAnzeige gesetz={neuGeladen} norm={neueNorm.data} />),
      );
      await vi.waitFor(async () => {
        await act(async () => {
          const unterstrichen = host.querySelector('[style*="text-decoration: underline"]');
          expect(unterstrichen?.textContent?.replaceAll('\u00a0', ' ')).toBe(bezugstext);
        });
      });
      const neuesBlatt = [...host.querySelectorAll('[data-leaf]')].find(
        (el) =>
          JSON.stringify(pfadAusBlatt(blattPfad(el))) ===
          JSON.stringify(markierung!.bezug.textstelle!.pfad),
      )!;
      window.getSelection()!.removeAllRanges();
      aufbau.waehleTextImBlatt(neuesBlatt, bezugstext);
      expect(ermittleAuswahl(window.getSelection())).toEqual(auswahl);
    }, 30_000);
  }
}
