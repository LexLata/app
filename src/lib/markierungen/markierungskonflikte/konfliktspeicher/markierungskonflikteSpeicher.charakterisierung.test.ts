// markierungskonflikteSpeicher.charakterisierung.test.ts
//
// Charakterisierung von MarkierungskonflikteXML über den Dateizugriff:
// Lese- und Schreibergebnis (byte-genau) für Rundlauf, neu gebaute und
// gezielt aktualisierte Gesetzesblöcke. Nur der Abschnitt „Zugriff auf
// Gesetzesblöcke“ folgt dem jeweiligen Interface von markierungs-xml; die
// Erwartungen halten das Format unabhängig davon fest.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { gesetzDarstellung, gesetzesreferenz, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { zielnormTestdaten } from '@/test/markierungen/verweiszielFabrik';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type {
  GesetzKonflikte,
  MarkierungsEintrag,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';

const appDatenSpeicher = new Map<string, string>();

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenExistiert: vi.fn((pfad: string) => Promise.resolve(appDatenSpeicher.has(pfad))),
  appDatenLesen: vi.fn((pfad: string) => {
    const inhalt = appDatenSpeicher.get(pfad);
    if (inhalt === undefined) return Promise.reject(new Error('Datei nicht gefunden'));
    return Promise.resolve(inhalt);
  }),
  appDatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(() => Promise.resolve()) }));

import {
  ladePruefstand,
  schreibeGesetzKonflikte,
} from './markierungskonflikteSpeicher.dateiZugriff';

// ---------------------------------------------------------------------------
// Zugriff auf Gesetzesblöcke (folgt dem Interface von markierungs-xml)
// ---------------------------------------------------------------------------
import type { GespeicherteGesetzKonflikte } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  aktualisiereEinzelneMarkierung,
  aktualisiereZielkonflikte,
  erstelleGespeicherteGesetzKonflikte,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

type Block = GespeicherteGesetzKonflikte;
const baue = (konflikte: GesetzKonflikte): Block => erstelleGespeicherteGesetzKonflikte(konflikte);
const fachlich = (block: Block) => ({
  gesetz: block.gesetz,
  fehlendesGesetz: block.fehlendesGesetz,
  nichtamtlicheTitelXmlFehlt: block.nichtamtlicheTitelXmlFehlt,
  eintraege: [...block.eintraege],
});
const aktualisiereReferenzierend = aktualisiereZielkonflikte;
const aktualisiereEigen = aktualisiereEinzelneMarkierung;
// ---------------------------------------------------------------------------

const DATEI = 'markierungskonflikte.xml';
const BGB = gesetzesreferenz({ kurztitel: 'BGB' });
const STGB = gesetzesreferenz({ kurztitel: 'StGB' });

const GESPEICHERT = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<markierungskonflikte pruefstatus="aktuell" version="1" erweitert="a &amp; b">',
  '    <zusatz art="x"><kind/></zusatz>',
  '    <gesetz kurztitel="ZPO" normgeber="de-bund"><konflikt typ="gesetz-fehlt" /></gesetz>',
  '    <gesetz kurztitel="Ärzte &amp; Co" normgeber="de-bw">',
  '        <unbekannt wert="1"/>',
  '        <konflikt typ="nichtamtliche-titel-xml-fehlt"/>',
  '    </gesetz>',
  '    <gesetz kurztitel="ohne Normgeber"><konflikt typ="gesetz-fehlt"/></gesetz>',
  '    <gesetz kurztitel="BGB" normgeber="de-bund">',
  '        <kommentar>',
  '            <konflikt typ="pauschaler-bezug-fehlt"/>',
  '            <konflikt typ="ziel-gesetz-fehlt" gesetz="StGB" normgeber="de-bund"/>',
  '            <bezeichnung>§ 1</bezeichnung>',
  '            <kommentartext>Notiz &lt;1&gt;</kommentartext>',
  '        </kommentar>',
  '    </gesetz>',
  '    <gesetz kurztitel="AO" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>',
  '</markierungskonflikte>',
].join('\n');

function norm(xmlId: string, bezeichnung: string, textLaenge = 0) {
  return normaleNorm({
    id: `id-${xmlId}`,
    xmlId,
    bezeichnung,
    absaetze:
      textLaenge > 0
        ? [
            {
              id: `abs-${xmlId}`,
              bezeichnung: '(1)',
              saetze: [{ id: `s-${xmlId}`, zahl: 1, text: 'x'.repeat(textLaenge), eintraege: [] }],
            },
          ]
        : [],
  });
}

function gesetz(kurztitel: string, normen: ReturnType<typeof norm>[]): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente: normen.map((n) => ({ typ: 'norm' as const, data: n })),
  });
}

const kommentar: MarkierungsEintrag = markierungsEintrag({
  bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
  typ: 'kommentar',
  ausgangsstelle: normAusgangsstelle('§ 1'),
  kommentarText: 'Notiz <1>',
});

const verweis: MarkierungsEintrag = markierungsEintrag({
  bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
  typ: 'verweismarkierung',
  ausgangsstelle: normAusgangsstelle('§ 2'),
  verweisinhalt: {
    verweistext: '§ 9 StGB',
    verweisziele: [
      zielnormTestdaten({ bezeichnung: '9', gesetz: STGB, elementstand: { textlaenge: 5 } }),
    ],
  },
});

const NEU: GesetzKonflikte = {
  gesetz: { kurztitel: 'A & B', normgeber: 'de-bw' },
  nichtamtlicheTitelXmlFehlt: true,
  eintraege: [
    {
      ausgangsstelle: normAusgangsstelle('§ 2'),
      markierungstyp: 'verweismarkierung',
      eigenerKonflikt: 'pauschalerBezugUnpassend',
      zielKonflikte: [
        { gesetz: { kurztitel: 'PolG', normgeber: 'de-bw' }, typ: 'zielNormUnpassend' },
        { gesetz: { kurztitel: 'PolG', normgeber: 'de-bw' }, typ: 'zielNormFehlt' },
      ],
      verweistext: '§§ 7, 8 "PolG"',
    },
    {
      ausgangsstelle: normAusgangsstelle('§ 1'),
      markierungstyp: 'unterstreichung',
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 3, zeichenbereichEnde: 7 },
    },
  ],
};

beforeEach(() => {
  appDatenSpeicher.clear();
});

async function schreibeUndLies(
  gesetzKonflikte: Map<string, Block>,
  erweiterungen?: Awaited<ReturnType<typeof ladePruefstand>>['erweiterungen'],
): Promise<string> {
  await schreibeGesetzKonflikte(gesetzKonflikte, undefined, {
    pruefstatus: 'ausstehend',
    erweiterungen,
  });
  return appDatenSpeicher.get(DATEI) ?? '';
}

describe('Charakterisierung MarkierungskonflikteXML', () => {
  it('liest Status, Gesetzesreferenzen und fachliche Konflikte unverändert', async () => {
    appDatenSpeicher.set(DATEI, GESPEICHERT);
    const stand = await ladePruefstand();
    expect(stand.pruefstatus).toBe('aktuell');
    expect(stand.vollpruefungErforderlich).toBe(false);
    expect([...stand.gesetzKonflikte.keys()]).toEqual([
      gesetzesreferenzSchluessel({ kurztitel: 'ZPO', normgeber: 'de-bund' }),
      gesetzesreferenzSchluessel({ kurztitel: 'Ärzte & Co', normgeber: 'de-bw' }),
      gesetzesreferenzSchluessel(BGB),
      gesetzesreferenzSchluessel({ kurztitel: 'AO', normgeber: 'de-bund' }),
    ]);
    expect([...stand.gesetzKonflikte.values()].map(fachlich)).toEqual([
      {
        gesetz: { kurztitel: 'ZPO', normgeber: 'de-bund' },
        fehlendesGesetz: true,
        nichtamtlicheTitelXmlFehlt: false,
        eintraege: [],
      },
      {
        gesetz: { kurztitel: 'Ärzte & Co', normgeber: 'de-bw' },
        fehlendesGesetz: false,
        nichtamtlicheTitelXmlFehlt: true,
        eintraege: [],
      },
      {
        gesetz: BGB,
        fehlendesGesetz: false,
        nichtamtlicheTitelXmlFehlt: false,
        eintraege: [
          {
            ausgangsstelle: normAusgangsstelle('§ 1'),
            markierungstyp: 'kommentar',
            bereich: undefined,
            eigenerKonflikt: 'pauschalerBezugFehlt',
            zielKonflikte: [{ gesetz: STGB, typ: 'zielGesetzFehlt' }],
            schluessel: identitaetsSchluessel(kommentar),
          },
        ],
      },
      {
        gesetz: { kurztitel: 'AO', normgeber: 'de-bund' },
        fehlendesGesetz: true,
        nichtamtlicheTitelXmlFehlt: false,
        eintraege: [],
      },
    ]);
  });

  it('schreibt einen unveränderten Stand byte-gleich zurück (Rundlauf)', async () => {
    appDatenSpeicher.set(DATEI, GESPEICHERT);
    const stand = await ladePruefstand();
    expect(await schreibeUndLies(stand.gesetzKonflikte, stand.erweiterungen)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<markierungskonflikte version="1" pruefstatus="ausstehend" erweitert="a &amp; b">',
        '<gesetz kurztitel="AO" normgeber="de-bund"><konflikt typ="gesetz-fehlt" /></gesetz>',
        '<gesetz kurztitel="Ärzte &amp; Co" normgeber="de-bw">',
        '        <unbekannt wert="1" />',
        '        <konflikt typ="nichtamtliche-titel-xml-fehlt" />',
        '    </gesetz>',
        '<gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <kommentar>',
        '            <konflikt typ="pauschaler-bezug-fehlt" />',
        '            <konflikt typ="ziel-gesetz-fehlt" gesetz="StGB" normgeber="de-bund" />',
        '            <bezeichnung>§ 1</bezeichnung>',
        '            <kommentartext>Notiz &lt;1&gt;</kommentartext>',
        '        </kommentar>',
        '    </gesetz>',
        '<gesetz kurztitel="ZPO" normgeber="de-bund"><konflikt typ="gesetz-fehlt" /></gesetz>',
        '<zusatz art="x"><kind /></zusatz>',
        '</markierungskonflikte>',
      ].join('\n'),
    );
    // Das zurückgeschriebene Ergebnis liest sich wieder genauso.
    const erneut = await ladePruefstand();
    const fachlichJeGesetz = (gesetzKonflikte: Map<string, Block>) =>
      Object.fromEntries(
        [...gesetzKonflikte].map(([schluessel, block]) => [schluessel, fachlich(block)]),
      );
    expect(fachlichJeGesetz(erneut.gesetzKonflikte)).toEqual(
      fachlichJeGesetz(stand.gesetzKonflikte),
    );
    expect(erneut.erweiterungen).toEqual(stand.erweiterungen);
  });

  it('schreibt einen neu gebauten Gesetzesblock byte-genau und sortiert ihn ein', async () => {
    appDatenSpeicher.set(DATEI, GESPEICHERT);
    const stand = await ladePruefstand();
    stand.gesetzKonflikte.set(gesetzesreferenzSchluessel(NEU.gesetz), baue(NEU));
    stand.gesetzKonflikte.delete(gesetzesreferenzSchluessel(BGB));
    stand.gesetzKonflikte.set(
      gesetzesreferenzSchluessel({ kurztitel: 'ZPO', normgeber: 'de-bund' }),
      baue({
        gesetz: { kurztitel: 'ZPO', normgeber: 'de-bund' },
        fehlendesGesetz: true,
        eintraege: [],
      }),
    );
    expect(await schreibeUndLies(stand.gesetzKonflikte)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<markierungskonflikte version="1" pruefstatus="ausstehend">',
        '    <gesetz kurztitel="A &amp; B" normgeber="de-bw">',
        '        <konflikt typ="nichtamtliche-titel-xml-fehlt"/>',
        '        <unterstreichung>',
        '            <konflikt typ="bezugstext-fehlt-oder-unpassend"/>',
        '            <bezeichnung>§ 1</bezeichnung>',
        '            <textstelle>',
        '                <zeichenbereich start="3" ende="7"/>',
        '            </textstelle>',
        '        </unterstreichung>',
        '        <verweismarkierung>',
        '            <konflikt typ="pauschaler-bezug-unpassend"/>',
        '            <konflikt typ="ziel-norm-unpassend" gesetz="PolG" normgeber="de-bw"/>',
        '            <konflikt typ="ziel-norm-fehlt" gesetz="PolG" normgeber="de-bw"/>',
        '            <bezeichnung>§ 2</bezeichnung>',
        '            <verweistext>§§ 7, 8 &quot;PolG&quot;</verweistext>',
        '        </verweismarkierung>',
        '    </gesetz>',
        '<gesetz kurztitel="AO" normgeber="de-bund"><konflikt typ="gesetz-fehlt" /></gesetz>',
        '<gesetz kurztitel="Ärzte &amp; Co" normgeber="de-bw">',
        '        <unbekannt wert="1" />',
        '        <konflikt typ="nichtamtliche-titel-xml-fehlt" />',
        '    </gesetz>',
        '    <gesetz kurztitel="ZPO" normgeber="de-bund">',
        '        <konflikt typ="gesetz-fehlt"/>',
        '    </gesetz>',
        '</markierungskonflikte>',
      ].join('\n'),
    );
  });

  it('aktualisiert Zielkonflikte und einzelne Markierungen am gespeicherten Block byte-genau', async () => {
    appDatenSpeicher.set(DATEI, GESPEICHERT);
    const stand = await ladePruefstand();
    const vorher = stand.gesetzKonflikte.get(gesetzesreferenzSchluessel(BGB));
    const bgb = gesetz('BGB', [norm('p1', '§ 1'), norm('p2', '§ 2')]);
    const stgb = gesetz('StGB', [norm('p9', '§ 9', 5)]);

    // Zielkonflikt zu StGB entfällt (Zielgesetz jetzt vorhanden), der eigene
    // Konflikt bleibt; die neue Verweismarkierung erhält keinen Zielkonflikt.
    const referenzierend = aktualisiereReferenzierend(
      vorher,
      [kommentar, verweis],
      bgb,
      [bgb, stgb],
      new Set([gesetzesreferenzSchluessel(STGB)]),
    );
    // Die Verweismarkierung wird einzeln neu geprüft; Zielgesetz fehlt.
    const einzeln = aktualisiereEigen(
      referenzierend,
      BGB,
      identitaetsSchluessel(verweis),
      [kommentar, verweis],
      bgb,
      [bgb],
      new Set([gesetzesreferenzSchluessel(BGB)]),
      false,
    );
    if (!referenzierend || !einzeln) throw new Error('Aktualisierung ergab keinen Block.');
    stand.gesetzKonflikte.set(gesetzesreferenzSchluessel(BGB), referenzierend);
    expect(
      await schreibeUndLies(new Map([[gesetzesreferenzSchluessel(BGB), referenzierend]])),
    ).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<markierungskonflikte version="1" pruefstatus="ausstehend">',
        '    <gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <kommentar>',
        '            <konflikt typ="pauschaler-bezug-fehlt"/>',
        '            <bezeichnung>§ 1</bezeichnung>',
        '            <kommentartext>Notiz &lt;1&gt;</kommentartext>',
        '        </kommentar>',
        '    </gesetz>',
        '</markierungskonflikte>',
      ].join('\n'),
    );
    expect(await schreibeUndLies(new Map([[gesetzesreferenzSchluessel(BGB), einzeln]]))).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<markierungskonflikte version="1" pruefstatus="ausstehend">',
        '    <gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <kommentar>',
        '            <konflikt typ="pauschaler-bezug-fehlt"/>',
        '            <bezeichnung>§ 1</bezeichnung>',
        '            <kommentartext>Notiz &lt;1&gt;</kommentartext>',
        '        </kommentar>',
        '        <verweismarkierung>',
        '            <konflikt typ="ziel-gesetz-fehlt" gesetz="StGB" normgeber="de-bund"/>',
        '            <bezeichnung>§ 2</bezeichnung>',
        '            <verweistext>§ 9 StGB</verweistext>',
        '        </verweismarkierung>',
        '    </gesetz>',
        '</markierungskonflikte>',
      ].join('\n'),
    );
    // Ohne verbleibenden Konflikt entfällt der Block.
    expect(
      aktualisiereEigen(
        undefined,
        BGB,
        identitaetsSchluessel(verweis),
        [verweis],
        bgb,
        [bgb, stgb],
        new Set([gesetzesreferenzSchluessel(BGB)]),
        false,
      ),
    ).toBeUndefined();
  });
});
