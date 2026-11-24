// @vitest-environment jsdom
// Frische Ausgangsquellen, Darstellungsgrenzen und eigene Konflikte über echte Speicher.
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { beforeEach, expect, it } from 'vitest';
import { hinzufuegenMarkierung } from './markierungSpeicher.hinzufuegen';
import { ladeMarkierungen } from './markierungSpeicher.lesen';
import { baueXML } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  loeseAusgangsstelleAuf,
  pruefeEigenenKonflikt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { ausgangsnormKennung, verweisZuXmlId } from '@/lib/domain/norm/norm.index';

function benoetigt<T>(wert: T | undefined | null): T {
  if (wert === undefined || wert === null) throw Error('Benötigter Testwert fehlt');
  return wert;
}
const referenz = { normgeber: 'de-bund', kurztitel: 'G' };
const gesetzpfad = 'gesetze/G_de-bund.xml';
const markierungspfad = 'markierungen/G_de-bund-markierungen.xml';
const norm = (bezeichnung: string, id = 'p', text = 'Dieser Text bleibt.') =>
  `<norm id="${id}"><bezeichnung>${bezeichnung}</bezeichnung><text><absatz><satz>${text}</satz></absatz></text></norm>`;
const xml = (inhalt: string) =>
  `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>G</kurztitel><langtitel>Gesetz</langtitel></infos><inhalt>${inhalt}</inhalt></gesetz>`;
const eintrag = () =>
  markierungsEintrag({
    ausgangsstelle: { typ: 'norm', bezeichnung: 'Präambel' },
    bezug: {
      typ: 'bezugstext',
      textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 0, zeichenbereichEnde: 6 },
      bezugstext: 'Dieser',
    },
  });
beforeEach(() => {
  aufbau.bereiteNativeAttrappeVor();
  aufbau.native.texte.set(aufbau.basis + gesetzpfad, xml(norm('Präambel')));
});
it.each([
  ['entfernt', norm('§ 1')],
  ['umbenannt', norm('Eingangsformel')],
  ['verdoppelt', norm('Präambel') + norm('Präambel', 'q')],
  ['doppelte XML-ID', norm('Präambel') + norm('§ 1')],
  ['fehlende Kennung', norm('')],
  ['fehlende XML-ID', norm('Präambel', '')],
  ['beschädigte Kennung', norm('Präambel |')],
  ['ungültiger Pfad', norm('Präambel').replace('<absatz>', '<absatz zahl="(2)">')],
])(
  'schreibt bei zwischenzeitlicher Änderung (%s) nichts und erhält den Bestand',
  async (_, inhalt) => {
    const bestand = baueXML(referenz, [
      markierungsEintrag({ typ: 'kommentar', kommentarText: 'Bestand' }),
    ]);
    aufbau.native.texte.set(aufbau.basis + markierungspfad, bestand);
    const nativ = benoetigt(aufbau.native.invoke.getMockImplementation());
    aufbau.native.invoke.mockImplementation(async (befehl, args) => {
      if (befehl === 'datei_sperre_erwerben' && args?.relativerPfad === markierungspfad)
        aufbau.native.texte.set(aufbau.basis + gesetzpfad, xml(inhalt));
      return nativ(befehl, args);
    });
    expect(await hinzufuegenMarkierung(referenz, eintrag())).toMatchObject({ erfolgreich: false });
    expect(aufbau.native.texte.get(aufbau.basis + markierungspfad)).toBe(bestand);
    expect(aufbau.native.invoke.mock.calls.filter(([b]) => b === 'atomar_datei_schreiben')).toEqual(
      [],
    );
  },
);
it('speichert frischen Bezugstext erst nach Sperrerwerb und vor Freigabe aller Quellen', async () => {
  const nativ = benoetigt(aufbau.native.invoke.getMockImplementation());
  const gehalten = new Set<string>();
  const tokens = new Map<unknown, string>();
  aufbau.native.invoke.mockImplementation(async (befehl, args) => {
    if (befehl === 'datei_sperre_erwerben') {
      const token = await nativ(befehl, args);
      const pfad = String(args?.relativerPfad);
      gehalten.add(pfad);
      tokens.set(token, pfad);
      if (pfad === markierungspfad)
        aufbau.native.texte.set(
          aufbau.basis + gesetzpfad,
          xml(norm('Präambel', 'p', 'Frisch bleibt.')),
        );
      return token;
    }
    if (befehl === 'atomar_datei_schreiben')
      expect([...gehalten]).toEqual(expect.arrayContaining([gesetzpfad, markierungspfad]));
    if (befehl === 'datei_sperre_freigeben') gehalten.delete(benoetigt(tokens.get(args?.token)));
    return nativ(befehl, args);
  });
  expect((await hinzufuegenMarkierung(referenz, eintrag())).erfolgreich).toBe(true);
  expect((await ladeMarkierungen(referenz))[0]?.bezug.bezugstext).toBe('Frisch');
  expect(gehalten.size).toBe(0);
});
it.each([
  ['Text geändert', norm('Präambel', 'p', 'Anders bleibt.'), 'bezugstextFehltOderUnpassend'],
  [
    'umbenannt neben textgleichem Element',
    norm('Präambel neu') + norm('Formel', 'q'),
    'bezugstextFehltOderUnpassend',
  ],
  [
    'mehrdeutig mit identischem Text',
    norm('Präambel') + norm('Präambel', 'q'),
    'bezugstextFehltOderUnpassend',
  ],
])('erhält nach dem Speichern den eigenen Konflikt: %s', async (_, inhalt, konflikt) => {
  expect((await hinzufuegenMarkierung(referenz, eintrag())).erfolgreich).toBe(true);
  const [geladen] = await ladeMarkierungen(referenz);
  const gesetz = benoetigt(parseGesetzesXML(xml(inhalt)));
  expect(pruefeEigenenKonflikt(benoetigt(geladen), gesetz)).toBe(konflikt);
});
it('erhält bei gleicher Kennung den pauschalen Elementstandkonflikt', async () => {
  const kommentar = markierungsEintrag({
    typ: 'kommentar',
    ausgangsstelle: eintrag().ausgangsstelle,
  });
  expect((await hinzufuegenMarkierung(referenz, kommentar)).erfolgreich).toBe(true);
  const [geladen] = await ladeMarkierungen(referenz);
  expect(
    pruefeEigenenKonflikt(
      benoetigt(geladen),
      benoetigt(parseGesetzesXML(xml(norm('Präambel', 'p', 'Andere Länge')))),
    ),
  ).toBe('pauschalerBezugUnpassend');
});
it('unterscheidet eigenen Artikeltext von tatsächlichem Artikelkontext und erweitert keine Verweisziele', async () => {
  const quelle = xml(
    norm('Art. I § 1', 'eigen') +
      norm('Präambel') +
      norm('§ 1.2', 'punkt') +
      norm('Art. I', 'roemisch'),
  );
  aufbau.native.texte.set(aufbau.basis + gesetzpfad, quelle);
  const gesetz = benoetigt(parseGesetzesXML(quelle));
  for (const el of gesetz.elemente) {
    const kennung = ausgangsnormKennung(gesetz, el);
    if (!kennung) throw Error('Kennung fehlt');
    expect(loeseAusgangsstelleAuf(gesetz, kennung).element).toBe(el.data);
    expect(
      (
        await hinzufuegenMarkierung(
          referenz,
          markierungsEintrag({ typ: 'kommentar', ausgangsstelle: kennung }),
        )
      ).erfolgreich,
    ).toBe(true);
  }
  expect(loeseAusgangsstelleAuf(gesetz, { typ: 'norm', bezeichnung: 'Art. I § 1' }).element).toBe(
    gesetz.elemente[0]?.data,
  );
  for (const [bezeichnung, praefix] of [
    ['Präambel', ''],
    ['1.2', '§'],
    ['I', 'Art.'],
  ])
    expect(verweisZuXmlId(gesetz, `${benoetigt(praefix)} ${benoetigt(bezeichnung)}`)).toBeNull();
});
it.each(['E1'])('weist nicht verlustfrei darstellbare Normkennung %s zurück', (bezeichnung) => {
  const gesetz = benoetigt(parseGesetzesXML(xml(norm(bezeichnung))));
  expect(ausgangsnormKennung(gesetz, benoetigt(gesetz.elemente[0]))).toBeNull();
});

it.each(['§', 'Anhang'])(
  'erhält die volle nicht reservierte Bezeichnung %s E1 beim Speichern',
  async (praefix) => {
    aufbau.native.texte.set(aufbau.basis + gesetzpfad, xml(norm(`${praefix} E1`)));
    const bestand = baueXML(referenz, [
      markierungsEintrag({ typ: 'kommentar', kommentarText: 'Bestand' }),
    ]);
    aufbau.native.texte.set(aufbau.basis + markierungspfad, bestand);
    const ergebnis = await hinzufuegenMarkierung(
      referenz,
      markierungsEintrag({
        typ: 'kommentar',
        ausgangsstelle: normAusgangsstelle([praefix, 'E1'].filter(Boolean).join(' ')),
      }),
    );
    expect(ergebnis.erfolgreich).toBe(true);
    expect(
      (await ladeMarkierungen(referenz)).some(
        (e) => e.ausgangsstelle.typ === 'norm' && e.ausgangsstelle.bezeichnung === `${praefix} E1`,
      ),
    ).toBe(true);
  },
);

it.each([false, true])(
  'erhält Artikelkontext auch bei vertauschten Artikelgruppen (vertauscht: %s)',
  async (vertauscht) => {
    const gruppen = ['I', 'II'].map(
      (zahl, index) =>
        norm(`Art. ${zahl}`, `a${zahl}`).replace(
          '<norm ',
          `<norm gliederungskennzahl="00${index + 1}" `,
        ) + norm('§ 1', `p${zahl}`),
    );
    if (vertauscht) gruppen.reverse();
    aufbau.native.texte.set(aufbau.basis + gesetzpfad, xml(gruppen.join('')));
    const gesetz = benoetigt(parseGesetzesXML(xml(gruppen.join(''))));
    for (const zahl of ['I', 'II']) {
      const ausgangsstelle: Ausgangsstelle = normAusgangsstelle(`Art. ${zahl} § 1`);
      expect(loeseAusgangsstelleAuf(gesetz, ausgangsstelle).element?.xmlId).toBe(`p${zahl}`);
      expect(
        (
          await hinzufuegenMarkierung(
            referenz,
            markierungsEintrag({ typ: 'kommentar', ausgangsstelle, kommentarText: zahl }),
          )
        ).erfolgreich,
      ).toBe(true);
    }
    expect(await ladeMarkierungen(referenz)).toHaveLength(2);
  },
);
it.each([false, true])(
  'trennt Präfix, Sammelkennung und konkurrierende Einzelzahl im Speicher (vertauscht: %s)',
  async (vertauscht) => {
    const normen = [
      norm('§ 1', 'paragraf'),
      norm('Art. 1', 'artikel'),
      norm('§§ 3 bis 6', 'sammel').replace('<norm ', '<norm status="weggefallen" '),
      norm('§ 6', 'einzel'),
    ];
    if (vertauscht) normen.reverse();
    aufbau.native.texte.set(aufbau.basis + gesetzpfad, xml(normen.join('')));
    const gesetz = benoetigt(parseGesetzesXML(xml(normen.join(''))));
    for (const [bezeichnung, praefix, id] of [
      ['1', '§', 'paragraf'],
      ['1', 'Art.', 'artikel'],
      ['6', '§§ 3 bis', 'sammel'],
    ]) {
      const ausgangsstelle: Ausgangsstelle = normAusgangsstelle(
        [benoetigt(praefix), benoetigt(bezeichnung)].filter(Boolean).join(' '),
      );
      expect(loeseAusgangsstelleAuf(gesetz, ausgangsstelle).element?.xmlId).toBe(id);
      expect(
        (
          await hinzufuegenMarkierung(
            referenz,
            markierungsEintrag({ typ: 'kommentar', ausgangsstelle }),
          )
        ).erfolgreich,
      ).toBe(true);
    }
    for (const bezeichnung of ['6']) {
      const bestand = aufbau.native.texte.get(aufbau.basis + markierungspfad);
      expect(
        (
          await hinzufuegenMarkierung(
            referenz,
            markierungsEintrag({
              typ: 'kommentar',
              ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
            }),
          )
        ).erfolgreich,
      ).toBe(false);
      expect(aufbau.native.texte.get(aufbau.basis + markierungspfad)).toBe(bestand);
    }
  },
);
it('hält gleiche Kurztitel verschiedener Normgeber beim frischen Speichern getrennt', async () => {
  aufbau.native.texte.set(
    aufbau.basis + 'gesetze/G_de-bw.xml',
    xml(norm('Präambel', 'p', 'Landesrecht.')).replace(
      '<normgeber>de-bund</normgeber>',
      '<normgeber>de-bw</normgeber>',
    ),
  );
  expect((await hinzufuegenMarkierung(referenz, eintrag())).erfolgreich).toBe(true);
  expect(
    (await hinzufuegenMarkierung({ ...referenz, normgeber: 'de-bw' }, eintrag())).erfolgreich,
  ).toBe(true);
  expect((await ladeMarkierungen(referenz))[0]?.bezug.bezugstext).toBe('Dieser');
  expect((await ladeMarkierungen({ ...referenz, normgeber: 'de-bw' }))[0]?.bezug.bezugstext).toBe(
    'Landes',
  );
});

it.each([false, true])(
  'rät bei gleicher XML-ID in verschiedenen Artikelkontexten keinen ersten Treffer (vertauscht: %s)',
  async (vertauscht) => {
    const gruppen = ['I', 'II'].map(
      (zahl, index) =>
        norm(`Art. ${zahl}`, `a${zahl}`).replace(
          '<norm ',
          `<norm gliederungskennzahl="00${index + 1}" `,
        ) + norm('§ 1', 'gleich'),
    );
    if (vertauscht) gruppen.reverse();
    const inhalt = xml(gruppen.join(''));
    aufbau.native.texte.set(aufbau.basis + gesetzpfad, inhalt);
    const gesetz = benoetigt(parseGesetzesXML(inhalt));
    for (const zahl of ['I', 'II']) {
      const ausgangsstelle: Ausgangsstelle = normAusgangsstelle(`Art. ${zahl} § 1`);
      expect(loeseAusgangsstelleAuf(gesetz, ausgangsstelle)).toEqual({
        element: undefined,
        anzahlTreffer: 2,
      });
      expect(
        (
          await hinzufuegenMarkierung(
            referenz,
            markierungsEintrag({ typ: 'kommentar', ausgangsstelle }),
          )
        ).erfolgreich,
      ).toBe(false);
    }
    expect(aufbau.native.texte.has(aufbau.basis + markierungspfad)).toBe(false);
  },
);
