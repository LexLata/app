import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// Prüft Elementstände über Berechnung, Bearbeitung, Konfliktprüfung und XML-Rundlauf.

import { describe, expect, it, vi } from 'vitest';
import type { NormDarstellung, UeberschriftDarstellung } from '@/lib/domain/gesetzTypes';
import { ausgangsstelle, elementstand } from '@/test/markierungen/elementstandFabrik';
import { berechneElementstand } from '@/lib/domain/gesetzDarstellungAuswertung';
import { baueTextbezugUndElementstand } from './verweismarkierungAktionen.persistieren';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  findeElementZuBezeichnung,
  pruefeEigenenKonflikt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { baueXML, parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  erwaegungsgrundAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

const norm: NormDarstellung = normaleNorm({
  id: 'n',
  xmlId: 'n',
  bezeichnung: '§ 1',
  titel: 'Titel',
  absaetze: [],
});
const ueberschrift: UeberschriftDarstellung = {
  id: 'u',
  xmlId: 'u',
  bezeichnung: 'Teil',
  titel: 'Titel',
  gliederungskennzahl: '010',
  ebene: 1,
};
const faelle = [
  { name: 'Norm', element: norm, stelle: ausgangsstelle() },
  {
    name: 'Erwägungsgrund',
    element: { ...norm, bezeichnung: 'E1', art: 'erwaegungsgrund' as const, titel: undefined },
    stelle: ausgangsstelle({ ausgangsstelle: erwaegungsgrundAusgangsstelle('E1') }),
  },
  {
    name: 'Überschrift',
    element: ueberschrift,
    stelle: ausgangsstelle({ ausgangsstelle: ueberschriftAusgangsstelle('010') }),
  },
];

describe.each(faelle)('Elementstand auf $name', ({ element, stelle }) => {
  const gesetz = gesetzDarstellung({
    elemente: [
      'absaetze' in element
        ? { typ: 'norm', data: element }
        : { typ: 'ueberschrift', data: element },
    ],
  });
  it.each(['kommentar', 'verweismarkierung'] as const)(
    'speichert einen pauschalen %s mit aktuellem Stand',
    (typ) => {
      const bezug = baueTextbezugUndElementstand(
        {
          gesetz,
          ausgangsstelle: stelle.ausgangsstelle,
        },
        false,
        [gesetz],
        {
          findeElementZuBezeichnung,
          aktuellerTextAnPfad: () => undefined,
          berechneElementstand,
        },
      );
      const eintrag: MarkierungsEintrag = markierungsEintrag({
        typ,
        ...stelle,
        bezug: { typ: 'pauschal' as const, elementstand: bezug.elementstand! },
        ...(typ === 'kommentar'
          ? { kommentarText: 'Kommentar' }
          : { verweisinhalt: { verweistext: 'Abs. 3', verweisziele: [] } }),
      });
      const gelesen = parseEintraege(baueXML(gesetz, [eintrag]));
      expect(gelesen.befunde).toEqual([]);
      expect(gelesen.eintraege[0]?.bezug.elementstand).toEqual(berechneElementstand(element));
    },
  );
  it('bestätigt beim ausschließlichen Überarbeiten des Kommentartexts die aktuelle Ausgangsstelle', () => {
    const alt: MarkierungsEintrag = markierungsEintrag({
      typ: 'kommentar',
      ...stelle,
      kommentarText: 'Alt',
      bezug: {
        typ: 'pauschal' as const,
        elementstand: elementstand({ titel: 'Früher', textlaenge: 999 }),
      },
    });
    expect(pruefeEigenenKonflikt(alt, gesetz)).toBe('pauschalerBezugUnpassend');
    const bezug = baueTextbezugUndElementstand(
      {
        gesetz,
        ausgangsstelle: stelle.ausgangsstelle,

        bearbeiten: { kommentarText: 'Alt', vorher: { ...alt, kommentarText: 'Alt' } },
      },
      false,
      [gesetz],
      {
        findeElementZuBezeichnung,
        aktuellerTextAnPfad: () => undefined,
        berechneElementstand,
      },
    );
    const neu = markierungsEintrag({
      ...alt,
      kommentarText: 'Neu',
      bezug: { typ: 'pauschal' as const, elementstand: bezug.elementstand! },
    });
    expect(pruefeEigenenKonflikt(neu, gesetz)).toBeUndefined();
    expect(pruefeEigenenKonflikt(neu, gesetzDarstellung())).toBe('pauschalerBezugFehlt');
  });
});

// Die Umwandlungsprüfung verwendet den echten XML-Speicher; nur Datei- und Ereignisgrenzen sind ersetzt.
import {
  aendereEintraege,
  ladeEintraege,
  aktualisiereKommentar,
  aktualisiereZielnorm,
} from '@/lib/markierungen/eintrag/eintrag.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import type { mitDateiSperre } from '@/lib/persistenz/kern/kern.index';
const dateien = new Map<string, string>();
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: async () => 'umwandlung',
  schliessePruefpflichtigeQuelleAb: async () => true,
  mitGesetzDateiSperre: (
    _ref: unknown,
    _ordner: string,
    _suffix: string,
    aktion: Parameters<typeof mitDateiSperre>[1],
  ) => aktion('token'),
  sicherstelleOrdner: async () => undefined,
  appDatenExistiert: async () => true,
  appDatenLesen: async (pfad: string) => dateien.get(pfad) ?? null,
  sichereBeiUngueltigemInhalt: async (_pfad: string, inhalt: string | null) =>
    inhalt === null ? { status: 'fehlt' } : { status: 'gueltig', inhalt },
  nutzerdatenSchreiben: async (pfad: string, inhalt: string) => {
    dateien.set(pfad, inhalt);
  },
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...dateien.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenExistiert: async (pfad: string) => dateien.has(pfad),
}));
it.each(['norm', 'ueberschrift'] as const)(
  'wandelt Kommentare und Verweismarkierungen an %s vollständig zwischen beiden Bezügen um',
  async (art) => {
    const { gesetzDarstellung } = await import('@/test/gesetz/gesetzFabriken');
    const { ueberschriftAusgangsstelle } = await import('@/test/markierungen/ausgangsstelleFabrik');
    const { bereichPfad } = await import('@/test/gesetz/textpfadFabrik');
    const { baueTextbezugUndElementstand } =
      await import('./verweismarkierungAktionen.persistieren');
    const { findeElementZuBezeichnung } =
      await import('@/lib/markierungen/gemeinsam/gemeinsam.index');
    const { berechneElementstand } = await import('@/lib/domain/gesetzDarstellungAuswertung');
    const { aktuellerTextAnPfad } = await import('@/lib/domain/textpfad/textpfad.index');
    const element =
      art === 'norm'
        ? {
            typ: 'norm' as const,
            data: normaleNorm({
              id: 'n',
              xmlId: 'n',
              bezeichnung: '§ 1',
              titel: 'Frischer Titel',
              absaetze: [],
            }),
          }
        : {
            typ: 'ueberschrift' as const,
            data: {
              id: 'u',
              xmlId: 'u',
              bezeichnung: 'Teil',
              titel: 'Frischer Titel',
              gliederungskennzahl: '010',
              ebene: 1,
            },
          };
    const gesetz = gesetzDarstellung({ elemente: [element] });
    const stelle = art === 'norm' ? normAusgangsstelle('§ 1') : ueberschriftAusgangsstelle('010');
    const textstelle = {
      pfad: bereichPfad('amtlicherTitel'),
      zeichenbereichStart: 0,
      zeichenbereichEnde: 8,
    };
    for (const typ of ['kommentar', 'verweismarkierung'] as const) {
      const alt = markierungsEintrag({
        typ,
        ausgangsstelle: stelle,
        bezug: { typ: 'pauschal', elementstand: { titel: 'Veraltet', textlaenge: 999 } },
      });
      await aendereEintraege(gesetz, () => ({
        art: 'geaendert',
        eintraege: [alt],
        ergebnis: undefined,
      }));
      const kontext = {
        gesetz,
        ausgangsstelle: stelle,
        auswahl: { textstelle, bezugstext: 'veraltet' },
      };
      const domain = { findeElementZuBezeichnung, aktuellerTextAnPfad, berechneElementstand };
      const text = baueTextbezugUndElementstand(kontext, true, [gesetz], domain);
      if (alt.typ === 'kommentar')
        await aktualisiereKommentar(gesetz, alt, alt.kommentarText, {
          ...text.neuerTextbezug,
          elementstand: text.elementstand,
        });
      else if (alt.typ === 'verweismarkierung')
        await aktualisiereZielnorm(
          gesetz,
          alt,
          alt.verweisinhalt,
          text.neuerTextbezug,
          text.elementstand,
        );
      const [mitText] = await ladeEintraege(gesetz);
      expect(mitText?.bezug).toEqual({ typ: 'bezugstext', textstelle, bezugstext: 'Frischer' });
      const pauschal = baueTextbezugUndElementstand(kontext, false, [gesetz], domain);
      if (mitText?.typ === 'kommentar')
        await aktualisiereKommentar(gesetz, mitText, mitText.kommentarText, {
          ...pauschal.neuerTextbezug,
          elementstand: pauschal.elementstand,
        });
      else if (mitText?.typ === 'verweismarkierung')
        await aktualisiereZielnorm(
          gesetz,
          mitText,
          mitText.verweisinhalt,
          pauschal.neuerTextbezug,
          pauschal.elementstand,
        );
      const [ohneText] = await ladeEintraege(gesetz);
      expect(ohneText?.bezug).toEqual({
        typ: 'pauschal',
        elementstand: berechneElementstand(element.data),
      });
    }
  },
);
