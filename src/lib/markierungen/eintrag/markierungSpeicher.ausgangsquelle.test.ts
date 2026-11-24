// @vitest-environment jsdom
// Anlegen prüft und berechnet Ausgangsdaten erst unter den gemeinsamen Quellsperren.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { beforeEach, expect, it } from 'vitest';
import { hinzufuegenMarkierung } from './markierungSpeicher.hinzufuegen';
import { baueXML } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { ladeMarkierungen } from './markierungSpeicher.lesen';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { berechneElementstand } from '@/lib/domain/gesetzDarstellungAuswertung';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
const gesetz = { normgeber: 'de-bund', kurztitel: 'BGB' };
const gesetzpfad = 'gesetze/BGB_de-bund.xml';
const markierungspfad = 'markierungen/BGB_de-bund-markierungen.xml';
const titelpfad = 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
const gesetzXML = (text: string, titel = '') =>
  `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>BGB</langtitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung>${titel ? `<titel>${titel}</titel>` : ''}<text><absatz><satz>${text}</satz></absatz></text></norm></inhalt></gesetz>`;
beforeEach(() => {
  aufbau.bereiteNativeAttrappeVor();
  aufbau.native.texte.set(aufbau.basis + gesetzpfad, gesetzXML('Alter Text'));
});
it.each(['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'] as const)(
  'lehnt %s ab, wenn die Quelle während des Wartens auf die Schreibsperre verschwindet',
  async (typ) => {
    const nativ = aufbau.native.invoke.getMockImplementation();
    if (!nativ) throw new Error('Native Testgrenze fehlt.');
    aufbau.native.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'datei_sperre_erwerben' && args?.relativerPfad === markierungspfad)
        aufbau.native.texte.delete(aufbau.basis + gesetzpfad);
      return nativ(befehl, args);
    });
    const ergebnis = await hinzufuegenMarkierung(gesetz, markierungsEintrag({ typ }));
    expect(ergebnis).toEqual({
      erfolgreich: false,
      ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig',
    });
    expect(aufbau.native.texte.has(aufbau.basis + markierungspfad)).toBe(false);
    expect(aufbau.native.invoke.mock.calls.filter(([b]) => b === 'atomar_datei_schreiben')).toEqual(
      [],
    );
  },
);
it('speichert den frischen Bezugstext und verwendet ihn auch für die Historie', async () => {
  const eintrag = markierungsEintrag({
    typ: 'unterstreichung',
    bezug: {
      typ: 'bezugstext',
      textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 0, zeichenbereichEnde: 5 },
      bezugstext: 'Alter',
    },
  });
  aufbau.native.texte.set(aufbau.basis + gesetzpfad, gesetzXML('Neuer Text'));
  const ergebnis = await hinzufuegenMarkierung(gesetz, eintrag);
  expect(ergebnis.erfolgreich).toBe(true);
  expect((await ladeMarkierungen(gesetz))[0]?.bezug.bezugstext).toBe('Neuer');
  expect(ergebnis.aktion).toMatchObject({ eintrag: { bezug: { bezugstext: 'Neuer' } } });
});
it('berechnet den Elementstand frisch und lässt nichtamtliche Titel daraus heraus', async () => {
  const xml = gesetzXML('Neuer Text', 'Amtlicher Titel');
  aufbau.native.texte.set(aufbau.basis + gesetzpfad, xml);
  aufbau.native.texte.set(
    aufbau.basis + titelpfad,
    'beschädigt; bei amtlichem Bezug nicht benötigt',
  );
  const eintrag = markierungsEintrag({
    typ: 'kommentar',
    bezug: { typ: 'pauschal', elementstand: { textlaenge: 1, titel: 'Alter Titel' } },
  });
  expect((await hinzufuegenMarkierung(gesetz, eintrag)).erfolgreich).toBe(true);
  const norm = parseGesetzesXML(xml)?.elemente[0];
  if (!norm) throw Error('Testnorm fehlt');
  expect((await ladeMarkierungen(gesetz))[0]?.bezug.elementstand).toEqual(
    berechneElementstand(norm.data),
  );
});
it('liest nichtamtlichen Bezugstext unter der zusätzlichen Titelquellensperre frisch', async () => {
  aufbau.native.texte.set(
    aufbau.basis + titelpfad,
    '<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Neuer Titel</titel></norm></inhalt></nichtamtlicheTitel>',
  );
  const eintrag = markierungsEintrag({
    typ: 'hervorhebung',
    bezug: {
      typ: 'bezugstext',
      textstelle: {
        pfad: { typ: 'bereich', bereich: 'nichtamtlicherTitel' },
        zeichenbereichStart: 0,
        zeichenbereichEnde: 5,
      },
      bezugstext: 'Alter',
    },
  });
  expect((await hinzufuegenMarkierung(gesetz, eintrag)).erfolgreich).toBe(true);
  expect((await ladeMarkierungen(gesetz))[0]?.bezug.bezugstext).toBe('Neuer');
  expect(aufbau.native.invoke.mock.calls).toContainEqual([
    'datei_sperre_erwerben',
    expect.objectContaining({ relativerPfad: titelpfad }),
  ]);
});
it('wirft bei beschädigter benötigter Titelquelle und schreibt nichts', async () => {
  aufbau.native.texte.set(aufbau.basis + titelpfad, 'defekt');
  const eintrag = markierungsEintrag({
    typ: 'hervorhebung',
    bezug: {
      typ: 'bezugstext',
      textstelle: {
        pfad: { typ: 'bereich', bereich: 'nichtamtlicherTitel' },
        zeichenbereichStart: 0,
        zeichenbereichEnde: 5,
      },
      bezugstext: 'Alter',
    },
  });
  await expect(hinzufuegenMarkierung(gesetz, eintrag)).rejects.toThrow();
  expect(aufbau.native.texte.has(aufbau.basis + markierungspfad)).toBe(false);
});

it.each(['kombinieren', 'splitten'] as const)(
  'berechnet beim %s den neuen Bereich aus der geschützten frischen Quelle',
  async (weg) => {
    aufbau.native.texte.set(aufbau.basis + gesetzpfad, gesetzXML('Neuer Text'));
    const alt = markierungsEintrag({
      typ: 'unterstreichung',
      bezug: {
        typ: 'bezugstext',
        textstelle: {
          pfad: { typ: 'normtext' },
          zeichenbereichStart: 0,
          zeichenbereichEnde: weg === 'kombinieren' ? 5 : 10,
        },
        bezugstext: weg === 'kombinieren' ? 'Alter' : 'Alter Text',
      },
    });
    aufbau.native.texte.set(aufbau.basis + markierungspfad, baueXML(gesetz, [alt]));
    const neu = markierungsEintrag({
      typ: 'unterstreichung',
      bezug: {
        typ: 'bezugstext',
        textstelle: {
          pfad: { typ: 'normtext' },
          zeichenbereichStart: weg === 'kombinieren' ? 4 : 5,
          zeichenbereichEnde: weg === 'kombinieren' ? 10 : 6,
        },
        bezugstext: 'veraltet',
      },
    });
    const ergebnis = await hinzufuegenMarkierung(gesetz, neu);
    expect(ergebnis.erfolgreich).toBe(true);
    expect((await ladeMarkierungen(gesetz)).map((e) => e.bezug.bezugstext)).toEqual(
      weg === 'kombinieren' ? ['Neuer Text'] : ['Neuer', 'Text'],
    );
  },
);
