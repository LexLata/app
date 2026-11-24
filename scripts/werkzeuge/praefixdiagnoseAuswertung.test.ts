// praefixdiagnoseAuswertung.test.ts
// Erklärbare Fallgruppen sowie vollständiger lokaler Bericht ohne Quellenänderung.
import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { untersuchePraefixstruktur, fuehrePraefixdiagnoseAus } from './praefixdiagnoseAuswertung';
import { schreibePraefixstrukturXml } from '@/lib/import/praefixstruktur/praefixstrukturXml';

function xml(bezeichnungen: string[], zusatz = '') {
  return `<gesetz><infos><kurztitel>Test</kurztitel><normgeber>de-bund</normgeber></infos><inhalt>${bezeichnungen.map((b, i) => `<norm id="${i}"><bezeichnung>${b}</bezeichnung></norm>`).join('')}${zusatz}</inhalt></gesetz>`;
}

it.each([
  [[], 'Leerer importierter Inhalt'],
  [['Schlussformel'], 'Aktuell eindeutig'],
  [['§ 1', 'Artikel 1'], 'Aktuell eindeutig'],
  [['§ 1', 'Unbekannt'], 'Paragraphen und sonstige Bezeichnungen'],
  [['Art. 1', 'Unbekannt'], 'Artikel und sonstige Bezeichnungen'],
  [['§ 1', 'Art. 1', 'Unbekannt'], 'Aktuell eindeutig'],
  [['I.', ''], 'Römische Zahlen und sonstige Bezeichnungen'],
  [['§ 1'], 'Aktuell eindeutig'],
] as const)('erklärt %j mit %s', (bezeichnungen, gruppe) => {
  expect(untersuchePraefixstruktur(xml([...bezeichnungen])).gruppe).toBe(gruppe);
});

it.each([
  [[], undefined],
  [['', 'Schlussformel'], 'unbezeichnete-normen'],
  [['Schlussformel'], undefined],
  [['Unbekannt'], 'nur-sonstige-bezeichnungen'],
  [['§ 1', 'Unbekannt'], 'sonstige-bezeichnungen'],
  [['§ 1', 'Artikel 1'], undefined],
  [['I.', 'Artikel 1'], 'gemischte-praefixe'],
  [['I.', 'II.'], undefined],
] as const)('qualifiziert %j mit Diagnosegrund %s', (namen, grund) => {
  expect(untersuchePraefixstruktur(xml([...namen])).diagnosegrund).toBe(grund);
});

it('zählt römische Normbezeichnungen mit derselben Schwelle', () => {
  expect(untersuchePraefixstruktur(xml(['I.', 'II.', 'Schlußformel']))).toMatchObject({
    roemisch: 2,
    gezaehlt: 2,
    praefixstruktur: 'roemisch',
  });
});

it('bewahrt die Belege und zählt weggefallene Normen, aber keine Erwägungsgründe', () => {
  const ergebnis = untersuchePraefixstruktur(
    xml(
      ['§ 1', 'Anlage 1'],
      `
    <norm id="alt" status="weggefallen"><bezeichnung>Artikel 2</bezeichnung></norm>
    <norm id="e" typ="erwaegungsgrund"><bezeichnung>1</bezeichnung></norm>`,
    ),
  );
  expect(ergebnis).toMatchObject({
    gezaehlt: 2,
    paragraphen: 1,
    artikel: 1,
    sonstige: 0,
    ausgeschlossen: 1,
    erwaegungsgruende: 1,
    praefixstruktur: 'artikel-und-paragraphen',
  });
  expect(ergebnis.normen).toContainEqual(
    expect.objectContaining({
      xmlId: 'alt',
      bezeichnung: 'Artikel 2',
      status: 'weggefallen',
      einordnung: 'artikel',
    }),
  );
});

it('berücksichtigt den Vorrang von Gliederungsartikeln und lehnt unlesbare Gesetze ab', () => {
  expect(
    untersuchePraefixstruktur(
      xml([], '<norm id="1" gliederungskennzahl="001"><bezeichnung>Art. 1</bezeichnung></norm>'),
    ),
  ).toMatchObject({ praefixstruktur: 'gliederungsartikel', gruppe: 'Aktuell eindeutig' });
  expect(() => untersuchePraefixstruktur('<falsch/>')).toThrow();
});

it('unterscheidet leeren Inhalt von vorhandenen Überschriften', () => {
  expect(untersuchePraefixstruktur(xml([])).ueberschriften).toEqual([]);
  expect(
    untersuchePraefixstruktur(
      xml([], '<gliederung gliederungskennzahl="001"><bezeichnung>I.</bezeichnung></gliederung>'),
    ).ueberschriften,
  ).toEqual([expect.objectContaining({ bezeichnung: 'I.', xmlId: 'ueberschrift:001' })]);
  expect(
    untersuchePraefixstruktur(
      xml([], '<gliederung gliederungskennzahl="001"><bezeichnung>I.</bezeichnung></gliederung>'),
    ).diagnosegrund,
  ).toBe('nur-ueberschriften');
});

it('schreibt Tabelle, Belege und Zusammenfassung und meldet fehlende und beschädigte Dateien', async () => {
  const repository = await mkdtemp(join(tmpdir(), 'lexlata-diagnose-'));
  try {
    const listen = join(repository, 'src-tauri/resources/praefixstrukturen');
    const gesetze = join(repository, 'arbeitsdaten/gesetzesxml/de-bund');
    await mkdir(listen, { recursive: true });
    await mkdir(gesetze, { recursive: true });
    const liste = schreibePraefixstrukturXml(
      'de-bund',
      [
        { kurztitel: 'Test', praefixstruktur: 'unklar' },
        { kurztitel: 'Fehlt', praefixstruktur: 'unklar' },
        { kurztitel: 'Kaputt', praefixstruktur: 'unklar' },
        { kurztitel: 'Anders', praefixstruktur: 'unklar' },
        { kurztitel: 'Eindeutig', praefixstruktur: 'unklar' },
        { kurztitel: 'Klar', praefixstruktur: 'paragraph' },
        { kurztitel: 'Leer', ermittlungsstatus: 'leer' },
        { kurztitel: 'Fehler', ermittlungsstatus: 'gescheitert', fehlerart: 'gesetz-laden' },
      ],
      new Date('2026-10-18T00:00:00Z'),
    );
    await writeFile(join(listen, 'de-bund.xml'), liste);
    await writeFile(join(listen, 'de-bw.xml'), schreibePraefixstrukturXml('de-bw', [], new Date()));
    const gesetz = xml(['§ 1', 'Unbekannt; "a"']);
    await writeFile(join(gesetze, '%54est.xml'), gesetz);
    await writeFile(join(gesetze, 'Kaputt.xml'), '<gesetz>');
    await writeFile(join(gesetze, 'Anders.xml'), xml(['§ 1']));
    await writeFile(join(gesetze, 'Eindeutig.xml'), xml(['§ 1']).replace('>Test<', '>Eindeutig<'));
    const { ziel, faelle } = await fuehrePraefixdiagnoseAus(repository);
    expect(ziel).toContain(join(repository, 'arbeitsdaten/berichte/diagnose'));
    expect(faelle).toHaveLength(5);
    expect(faelle.find((f) => f.kurztitel === 'Eindeutig')?.gruppe).toBe('Aktuell eindeutig');
    expect(faelle.find((f) => f.kurztitel === 'Fehlt')?.gruppe).toBe('Dateifehler');
    expect(faelle.find((f) => f.kurztitel === 'Kaputt')?.gruppe).toBe('Dateifehler');
    expect(faelle.find((f) => f.kurztitel === 'Anders')?.gruppe).toBe('Dateifehler');
    const csv = await readFile(join(ziel, 'faelle.csv'), 'utf8');
    expect(csv).toContain('"Unbekannt; ""a"""');
    expect(csv).toContain('"Diagnosegrund"');
    expect(csv).toContain('"sonstige-bezeichnungen"');
    expect(await readFile(join(ziel, 'zusammenfassung.md'), 'utf8')).toContain('Dateifehler');
    const belege = JSON.parse(await readFile(join(ziel, 'belege.json'), 'utf8'));
    expect(belege.faelle).toHaveLength(5);
    expect(belege.bestand[0]).toEqual({
      normgeber: 'de-bund',
      gesamt: 8,
      unklar: 5,
      leer: 1,
      gescheitert: 1,
    });
    expect(await readFile(join(listen, 'de-bund.xml'), 'utf8')).toBe(liste);
    expect(await readFile(join(gesetze, '%54est.xml'), 'utf8')).toBe(gesetz);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});

it('zählt Regel und Nr getrennt und bezeichnet leer als Status statt Präfixstruktur', () => {
  expect(untersuchePraefixstruktur(xml(['Regel 1', 'Nr 1']))).toMatchObject({
    regel: 1,
    nummer: 1,
    gezaehlt: 2,
    praefixstruktur: 'unklar',
    gruppe: 'Regeln und Nummern',
  });
  expect(untersuchePraefixstruktur(xml([]))).toMatchObject({
    ermittlungsstatus: 'leer',
    praefixstruktur: undefined,
    diagnosegrund: undefined,
    gruppe: 'Leerer importierter Inhalt',
  });
});

it.each([
  [['1.', '7a.', '1. bis 6.'], 'arabisch'],
  [['A.', 'B.', 'C.'], 'alphabetisch'],
] as const)('zählt %j in der Diagnose konsistent als %s', (namen, familie) => {
  const befund = untersuchePraefixstruktur(xml([...namen]));
  expect(befund.praefixstruktur).toBe(familie);
  expect(befund[familie]).toBe(3);
  expect(befund.gezaehlt).toBe(3);
  expect(befund.sonstige).toBe(0);
  expect(befund.roemisch).toBe(0);
});
