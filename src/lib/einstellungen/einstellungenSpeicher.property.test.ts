// einstellungenSpeicher.property.test.ts
//
// Property-Tests für den Export/Import-Rundtrip (baueEinstellungenXML ->
// wendeEinstellungenXMLAn) sowie für einstellungenOhneVerarbeitungszeit – analog zum Muster in
// dateiImport.einfach.test.ts (Property: <verarbeitungszeit>-Tag-Inhalt darf
// beliebig sein, ohne die Klassifizierung zu beeinflussen).
//
// Der Schreiber maskiert auch Sonderzeichen in Einstellungswerten; der
// Leser dekodiert sie genau einmal. Jeder Rundtrip prüft das XML strikt.

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import {
  baueEinstellungenXML,
  einstellungenOhneVerarbeitungszeit,
  wendeEinstellungenXMLAn,
} from './einstellungenSpeicher';
import { FARBSCHEMA_KEY } from '@/lib/einstellungen/speicherschluessel';
import { APP_AKZENTFARBE_KEY } from '@/lib/einstellungen/speicherschluessel';
import { SCHRIFT_KEY } from '@/lib/einstellungen/speicherschluessel';
import { MARKIERUNGEN_DEAKTIVIERT_KEY } from '@/lib/einstellungen/speicherschluessel';

function localStorageMock(): Storage {
  const speicher = new Map<string, string>();
  return {
    getItem: (key: string) => speicher.get(key) ?? null,
    setItem: (key: string, wert: string) => void speicher.set(key, wert),
    removeItem: (key: string) => void speicher.delete(key),
    clear: () => speicher.clear(),
    key: (i: number) => Array.from(speicher.keys())[i] ?? null,
    get length() {
      return speicher.size;
    },
  } as Storage;
}

beforeEach(() => {
  globalThis.localStorage = localStorageMock();
});

const sichererWert = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !/[<>]/.test(s));
const einstellungsWert = fc.oneof(
  fc.string({ minLength: 1, maxLength: 20 }),
  fc
    .array(fc.constantFrom('&', '<', '>', '"', "'", '&amp;', '&lt;', 'Ä'), {
      minLength: 1,
      maxLength: 10,
    })
    .map((teile) => teile.join('')),
);

describe('Property: baueEinstellungenXML/wendeEinstellungenXMLAn-Rundtrip', () => {
  it('stellt für beliebige gesetzte Werte auf einer Auswahl exportierbarer Keys denselben Zustand wieder her', () => {
    fc.assert(
      fc.property(
        fc.record({
          farbschema: fc.option(einstellungsWert, { nil: undefined }),
          appAkzentfarbe: fc.option(einstellungsWert, { nil: undefined }),
          schrift: fc.option(einstellungsWert, { nil: undefined }),
        }),
        ({ farbschema, appAkzentfarbe, schrift }) => {
          localStorage.clear();
          if (farbschema !== undefined) localStorage.setItem(FARBSCHEMA_KEY, farbschema);
          if (appAkzentfarbe !== undefined)
            localStorage.setItem(APP_AKZENTFARBE_KEY, appAkzentfarbe);
          if (schrift !== undefined) localStorage.setItem(SCHRIFT_KEY, schrift);

          const xml = baueEinstellungenXML();
          pruefeXmlWohlgeformtheit(xml);
          localStorage.clear();
          wendeEinstellungenXMLAn(xml);

          expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe(farbschema ?? null);
          expect(localStorage.getItem(APP_AKZENTFARBE_KEY)).toBe(appAkzentfarbe ?? null);
          expect(localStorage.getItem(SCHRIFT_KEY)).toBe(schrift ?? null);
        },
      ),
    );
  });

  it('ein vorher gesetzter, in der importierten XML fehlender Key wird für beliebige Ausgangswerte entfernt (echtes "Ersetzen")', () => {
    fc.assert(
      fc.property(sichererWert, (alterWert) => {
        localStorage.clear();
        localStorage.setItem(MARKIERUNGEN_DEAKTIVIERT_KEY, alterWert);

        wendeEinstellungenXMLAn('<einstellungen></einstellungen>');

        expect(localStorage.getItem(MARKIERUNGEN_DEAKTIVIERT_KEY)).toBeNull();
      }),
    );
  });
});

describe('Property: einstellungenOhneVerarbeitungszeit ist unabhängig vom verarbeitungszeit-Tag-Inhalt', () => {
  it('liefert für beliebige verarbeitungszeit-Werte bei sonst identischem Inhalt dasselbe Ergebnis', () => {
    fc.assert(
      fc.property(sichererWert, sichererWert, (wertA, wertB) => {
        const restXml =
          '<einstellungen>\n    XXX\n    <farbschema>dunkel</farbschema>\n</einstellungen>';
        // Replacer als Funktion (nicht als String!) übergeben: bei einem
        // String-Replacement interpretiert JS "$`"/"$'"/"$&" im
        // Ersetzungstext speziell – von fc.string() erzeugbare Werte wie
        // "$`" würden die Ersetzung sonst verfälschen (Test-Bug, keine
        // Eigenschaft von einstellungenOhneVerarbeitungszeit selbst).
        const xmlA = restXml.replace(
          'XXX',
          () => `<verarbeitungszeit>${wertA}</verarbeitungszeit>`,
        );
        const xmlB = restXml.replace(
          'XXX',
          () => `<verarbeitungszeit>${wertB}</verarbeitungszeit>`,
        );

        expect(einstellungenOhneVerarbeitungszeit(xmlA)).toBe(
          einstellungenOhneVerarbeitungszeit(xmlB),
        );
      }),
    );
  });
});
