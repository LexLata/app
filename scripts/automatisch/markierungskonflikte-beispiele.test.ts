import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { baueAnzeigeEintrag } from '@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige';
import {
  pruefeNichtamtlicheTitelXML,
  wendeNichtamtlicheTitelAn,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
// Prüft importierbare Konfliktbeispiele gegen Formate, Prüfung und sichtbare Zeilentexte.
import {
  beispielEigeneKonflikte as eigene,
  beispielZielkonflikte as ziele,
  beispielGesetzesweiteKonflikte as gesetzesweit,
} from '@/test/markierungen/markierungskonfliktBeispiele';
import { erstelleGespeicherteGesetzKonflikte } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  pruefeMarkierungenEinesGesetzes,
  identitaetsSchluessel,
} from '@/lib/markierungen/gemeinsam/markierungskonfliktPruefung';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { pruefeSchema } from './schema-hilfe';
import { verarbeiteGesetzDatei } from '@/lib/import/dispatch/gesetzDateiVerarbeitung';

import { erkenneDateiFormat } from '@/lib/import-export/datei-import/formatErkennung';
import { parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

import { zeilenVonEintrag } from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import { verweisKopfzeile } from '@/components/hilfsfenster/markierungskonflikte/konfliktTexte';

const ordner = new URL('../../docs/doku/testdaten/', import.meta.url);
const lesen = (name: string) => readFileSync(new URL(name, ordner), 'utf8');
const referenz = (kurztitel: string) => ({ kurztitel, normgeber: 'de-bund' });

function pruefeZielzeichenbereiche(xml: string) {
  for (const eintrag of parseEintraege(xml).eintraege) {
    const inhalt = eintrag.verweisinhalt;
    if (!inhalt) continue;
    for (const ziel of inhalt.verweisziele) {
      const [start, ende] = ziel.verweistextZeichenbereich;
      if (ziel.typ === 'ganzesGesetz') continue;
      const bezeichnung = ziel.bezeichnung;
      expect(inhalt.verweistext.slice(start, ende)).toBe(
        `${bezeichnung} ${ziel.gesetz!.kurztitel}`,
      );
    }
  }
}

it('importiert sechs gültige XML-Formate ohne GesetzesXML für MKF', async () => {
  const beispieldateien = [
    'mkf-markierungen.xml',
    'mkh-gesetz.xml',
    'mkh-markierungen.xml',
    'mkh-nichtamtliche-titel.xml',
    'mkn-gesetz.xml',
    'mkn-markierungen.xml',
  ];
  const vorhanden = readdirSync(ordner);
  expect(vorhanden).toEqual(expect.arrayContaining(beispieldateien));
  expect(vorhanden).not.toContain('mkf-gesetz.xml');
  expect(vorhanden).not.toContain('mkn-nichtamtliche-titel.xml');
  for (const name of beispieldateien) {
    const xml = lesen(name);
    const schema = name.includes('nichtamtliche')
      ? 'nichtamtliche-titel'
      : name.includes('markierungen')
        ? 'markierungen'
        : 'gesetz';
    const format =
      schema === 'gesetz'
        ? 'kanonisch-xml'
        : schema === 'markierungen'
          ? 'markierung-xml'
          : 'nichtamtlicheTitel-xml';
    expect(erkenneDateiFormat(xml, name), name).toBe(format);
    const ergebnis = await pruefeSchema(schema, xml);
    expect(ergebnis.valid, `${name}: ${JSON.stringify(ergebnis.errors)}`).toBe(true);
    if (schema === 'gesetz') {
      const verarbeitet = await verarbeiteGesetzDatei('kanonisch-xml', xml, {
        nachbereitungBeiImport: 'aus',
      });
      expect(verarbeitet).toMatchObject({ getaggtesXML: xml });
    } else if (schema === 'markierungen') {
      pruefeZielzeichenbereiche(xml);
    }
  }
});

it('zeigt alle statischen Konfliktarten, Bereiche und Anzeigevarianten gleichzeitig', () => {
  const matrix = ladeKonfliktBeispiele();
  for (const gruppe of matrix) {
    expect(gruppe.live).toHaveLength(gruppe.k === 'MKH' ? 69 : 1);
    expect(new Set(gruppe.live.map(identitaetsSchluessel)).size).toBe(gruppe.live.length);
  }
  expect(matrix[1]!.befund.nichtamtlicheTitelXmlFehlt).toBe(true);
  expect(matrix[1]!.zeilen).toEqual([]);
  expect(matrix[2]!.befund.fehlendesGesetz).toBe(true);
  const haupt = matrix[0]!;
  expect(haupt.anzeigen).toHaveLength(63);
  expect(haupt.zeilen).toHaveLength(68);
  expect(haupt.anzeigen.some((e) => bezeichnungAusgangsstelle(e.ausgangsstelle) === '§ 90')).toBe(
    false,
  );
  const arten = new Set(haupt.zeilen.map((z) => z.zeilenart));
  expect(arten).toEqual(
    new Set([
      'bezugstextFehltOderUnpassend',
      'pauschalerBezugFehlt',
      'pauschalerBezugUnpassend',
      'ausgangsstelleNichtEindeutig',
      'zielGesetzFehlt',
      'zielNormUnpassend',
      'zielNormNichtEindeutig',
      'zielNormFehlt',
    ]),
  );
  for (const typ of ['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung']) {
    for (const bereich of [undefined, 'amtlicherTitel', 'nichtamtlicherTitel', 'bezeichnung'])
      expect(
        haupt.anzeigen.some(
          (e) =>
            !(e.ausgangsstelle.typ === 'ueberschrift') &&
            e.markierungstyp === typ &&
            e.bereich === bereich,
        ),
      ).toBe(true);
    for (const bereich of ['amtlicherTitel', 'bezeichnung'])
      expect(
        haupt.anzeigen.some(
          (e) =>
            e.ausgangsstelle.typ === 'ueberschrift' &&
            e.markierungstyp === typ &&
            e.bereich === bereich,
        ),
      ).toBe(true);
  }
  expect(new Set(haupt.anzeigen.map((e) => e.nichtamtlicherTitelGrund).filter(Boolean))).toEqual(
    new Set(['normWeggefallen', 'normHatAmtlichenTitel', 'normNichtImGesetz']),
  );
  const texte = haupt.zeilen.map((z) => z.vorschau + '\n' + z.erlaeuterung).join('\n');
  for (const text of [
    'Zielnorm verändert',
    'Zielnormen verändert',
    'Zielnorm nicht eindeutig',
    'Zielnormen nicht eindeutig',
    'Zielnorm fehlt',
    'Zielnormen fehlen',
    'Art. 229 § 2',
    'Teil 101',
    'Abs. 1 S. 1',
    'Abs. 1 UAbs. 1 S. 1 Nr. 1a lit. aa',
    'Abs. 2 S. 1 Nr. 3a S. 2',
    'Überschrift:',
  ])
    expect(texte, text).toContain(text);
  expect(
    zeilenVonEintrag(
      haupt.anzeigen.find((e) => bezeichnungAusgangsstelle(e.ausgangsstelle) === '§ 40')!,
    ),
  ).toHaveLength(1);
  const langwort = haupt.anzeigen.find(
    (e) => bezeichnungAusgangsstelle(e.ausgangsstelle) === '§ 91',
  )!;
  expect(zeilenVonEintrag(langwort)[0]!.vorschau).toContain(
    `${langwort.bezugstext!.slice(0, 30)}…`,
  );
  const kombination = haupt.anzeigen.find(
    (e) => bezeichnungAusgangsstelle(e.ausgangsstelle) === '§ 86',
  )!;
  expect(zeilenVonEintrag(kombination)).toHaveLength(5);
  expect(verweisKopfzeile(kombination)).toContain('…');
  expect(
    haupt.zeilen.some(
      (z) =>
        z.vorschau.includes('…') && z.erlaeuterung.includes('mehreren Wörtern für die Kürzung'),
    ),
  ).toBe(true);
});

it('enthält pauschale Überschriften, Erwägungsgrund und die drei konfliktfreien Verweiskontrollen', () => {
  const live = parseEintraege(lesen('mkh-markierungen.xml'), referenz('MKH')).eintraege;
  for (const kennzahl of ['400', '401', '402'])
    for (const typ of ['kommentar', 'verweismarkierung'])
      expect(
        live.some(
          (m) =>
            m.ausgangsstelle.typ === 'ueberschrift' &&
            m.ausgangsstelle.gliederungskennzahl === kennzahl &&
            m.typ === typ &&
            m.bezug.typ === 'pauschal',
        ),
      ).toBe(true);
  expect(live.some((m) => m.ausgangsstelle.typ === 'erwaegungsgrund')).toBe(true);
  expect(
    live.some((m) => m.ausgangsstelle.typ === 'norm' && m.ausgangsstelle.bezeichnung === '5'),
  ).toBe(true);
  const kontrollen = live.filter(
    (m) =>
      m.typ === 'verweismarkierung' &&
      m.ausgangsstelle.typ === 'norm' &&
      m.ausgangsstelle.bezeichnung === '§ 94',
  );
  expect(kontrollen).toHaveLength(3);
});

it('gleicht Beispielabdeckung erschöpfend mit den Modell- und Anzeigearten ab', () => {
  const matrix = ladeKonfliktBeispiele();
  const eintraege = matrix.flatMap((m) => m.befund.eintraege);
  expect(new Set(eintraege.map((e) => e.eigenerKonflikt).filter(Boolean))).toEqual(
    new Set(Object.keys(eigene)),
  );
  expect(new Set(eintraege.flatMap((e) => e.zielKonflikte.map((z) => z.typ)))).toEqual(
    new Set(Object.keys(ziele)),
  );
  for (const feld of Object.keys(gesetzesweit))
    expect(
      matrix.some((m) => Object.entries(m.befund).some(([k, v]) => k === feld && v === true)),
    ).toBe(true);
});

it('hält jede dokumentierte Matrixzeile an die echte Konfliktprüfung gebunden', () => {
  const doku = readFileSync(
    new URL('../../docs/doku/markierungskonflikte.md', import.meta.url),
    'utf8',
  );
  const zeilen = doku.split('\n').filter((z) => /^\| MK[HNF]-\d+/.test(z));
  const matrix = ladeKonfliktBeispiele();
  expect(zeilen).toHaveLength(matrix.reduce((n, g) => n + g.live.length, 0));
  for (const gruppe of matrix)
    for (const [index, markierung] of gruppe.live.entries())
      pruefeDokumentiertenFall(gruppe, markierung, index, zeilen);
});

function pruefeDokumentiertenFall(
  gruppe: ReturnType<typeof ladeKonfliktBeispiele>[number],
  markierung: ReturnType<typeof ladeKonfliktBeispiele>[number]['live'][number],
  index: number,
  zeilen: string[],
) {
  const id = `${gruppe.k}-${String(index + 1).padStart(2, '0')}`;
  const row = zeilen.find((z) => z.split('|')[1]?.trim() === id);
  expect(row, id).toBeDefined();
  const spalten = row!.split('|').map((s) => s.trim());
  expect(spalten[3]).toContain(markierung.typ);
  const key = identitaetsSchluessel(markierung);
  const befund = erstelleGespeicherteGesetzKonflikte(gruppe.befund).eintraege.find(
    (e) => e.schluessel === key,
  );
  const anzeige = gruppe.anzeigen.find((e) => e.schluessel === key);
  const gesetzesweit = gruppe.befund.fehlendesGesetz
    ? ['gesetzFehlt']
    : gruppe.befund.nichtamtlicheTitelXmlFehlt
      ? ['nichtamtlicheTitelXmlFehlt']
      : [];
  const fachlich = [
    ...gesetzesweit,
    ...(befund?.eigenerKonflikt ? [befund.eigenerKonflikt] : []),
    ...(befund?.zielKonflikte.map((z) => z.typ) ?? []),
  ];
  const sichtbar = [
    ...gesetzesweit,
    ...(anzeige ? zeilenVonEintrag(anzeige).map((z) => z.zeilenart) : []),
  ];
  expect(new Set(spalten[5]?.split('; ')), id).toEqual(
    new Set(fachlich.length ? fachlich : ['kein Konflikt']),
  );
  expect(new Set(spalten[6]?.split('; ')), id).toEqual(
    new Set(sichtbar.length ? sichtbar : ['keine Zeile']),
  );
}

function ladeKonfliktBeispiele() {
  const gesetze = ['mkh', 'mkn'].map((k) => {
    const gesetz = parseGesetzesXML(lesen(`${k}-gesetz.xml`));
    if (!gesetz) throw new Error(`Ungültiges Beispielgesetz ${k}`);
    return gesetz;
  });
  const titel = pruefeNichtamtlicheTitelXML(lesen('mkh-nichtamtliche-titel.xml'), referenz('MKH'));
  if (titel.status !== 'gueltig') throw new Error('Ungültige Beispieltitel');
  const hauptgesetz = gesetze[0];
  if (!hauptgesetz) throw new Error('Hauptgesetz fehlt');
  wendeNichtamtlicheTitelAn(hauptgesetz, titel.titel);
  const titelVorhanden = new Set([gesetzesreferenzSchluessel(referenz('MKH'))]);
  return ['MKH', 'MKN', 'MKF'].map((k) => {
    const gesetzReferenz = referenz(k);
    const gelesen = parseEintraege(lesen(`${k.toLowerCase()}-markierungen.xml`), gesetzReferenz);
    if (gelesen.befunde.length) throw new Error(`Befunde im Beispiel ${k}`);
    const live = gelesen.eintraege;
    const gesetz = gesetze.find((g) => g.kurztitel === k);
    const befund = pruefeMarkierungenEinesGesetzes(
      gesetzReferenz,
      gesetz,
      live,
      gesetze,
      titelVorhanden,
    );
    const map = new Map(live.map((m) => [identitaetsSchluessel(m), m]));
    const anzeigen = erstelleGespeicherteGesetzKonflikte(befund).eintraege.map((e) => {
      const anzeige = baueAnzeigeEintrag(e, map, gesetz, gesetze);
      if (!anzeige) throw new Error('Beispielkonflikt ging beim Anzeigen verloren');
      return anzeige;
    });
    return {
      k,
      live,
      befund,
      anzeigen,
      zeilen: anzeigen.flatMap(zeilenVonEintrag),
    };
  });
}
