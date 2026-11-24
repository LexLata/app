// titelvergleichAblauf.test.ts
// Titelvergleich: Verhalten beider Richtungen an echten Dateien in einem Wegwerfordner.
import { afterEach, beforeEach, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { titelvergleichHin, titelvergleichZurueck } from './titelvergleichAblauf';

let ordner = '';
beforeEach(() => {
  ordner = mkdtempSync(join(tmpdir(), 'titelvergleich-'));
});
afterEach(() => rmSync(ordner, { recursive: true, force: true }));

function xml(normen: [string, string][], normgeber = 'de-bund', kurztitel = 'HGB'): string {
  const zeilen = normen.map(
    ([b, t]) => `<norm><bezeichnung>${b}</bezeichnung><titel>${t}</titel></norm>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<nichtamtlicheTitel version="1">
  <infos>
    <gesetz normgeber="${normgeber}">${kurztitel}</gesetz>
    <geaendert>2026-08-01T00:00:00Z</geaendert>
  </infos>
  <inhalt>${zeilen.join('\n')}</inhalt>
</nichtamtlicheTitel>`;
}

function schreibe(name: string, inhalt: string): string {
  const pfad = join(ordner, name);
  writeFileSync(pfad, inhalt);
  return pfad;
}

it('stellt abweichende Titel mit // gegenüber, gleiche nur einmal; erster Pfad links', () => {
  const ich = schreibe(
    'ich.xml',
    xml([
      ['§ 1', 'Istkaufmann; Handelsgewerbe'],
      ['§ 2', 'Kannkaufmann'],
    ]),
  );
  const beck = schreibe(
    'beck.xml',
    xml([
      ['§ 1', 'Istkaufmann'],
      ['§ 2', 'Kannkaufmann'],
    ]),
  );
  const ausgabe = titelvergleichHin(ich, beck);
  expect(ausgabe).toBe(join(ordner, 'HGB vergleich.md'));
  expect(readFileSync(ausgabe, 'utf8')).toBe(
    '# HGB (de-bund)\n[§ 1] Istkaufmann; Handelsgewerbe//Istkaufmann\n[§ 2] Kannkaufmann\n',
  );
});

it('übernimmt Normen, die nur in einer Datei stehen, mit leerer Gegenseite an ihrer Stelle', () => {
  const a = schreibe(
    'a.xml',
    xml([
      ['§ 1', 'Eins'],
      ['§ 3', 'Drei'],
    ]),
  );
  const b = schreibe(
    'b.xml',
    xml([
      ['§ 0', 'Null'],
      ['§ 1', 'Eins'],
      ['§ 2', 'Zwei'],
      ['§ 3', 'Drei'],
    ]),
  );
  const text = readFileSync(titelvergleichHin(a, b), 'utf8');
  expect(text).toBe('# HGB (de-bund)\n[§ 0] //Null\n[§ 1] Eins\n[§ 2] //Zwei\n[§ 3] Drei\n');
});

it('maskiert nichts doppelt: Sonderzeichen aus der XML erscheinen im Klartext', () => {
  const a = schreibe('a.xml', xml([['§ 1', 'A &amp; B &lt;C&gt;']]));
  const b = schreibe('b.xml', xml([['§ 1', 'A &amp; B &lt;C&gt;']]));
  expect(readFileSync(titelvergleichHin(a, b), 'utf8')).toBe('# HGB (de-bund)\n[§ 1] A & B <C>\n');
});

it('bricht ab, wenn die md-Datei schon existiert', () => {
  const a = schreibe('a.xml', xml([['§ 1', 'x']]));
  const b = schreibe('b.xml', xml([['§ 1', 'y']]));
  schreibe('HGB vergleich.md', 'meine Arbeit');
  expect(() => titelvergleichHin(a, b)).toThrow(/existiert bereits/);
  expect(readFileSync(join(ordner, 'HGB vergleich.md'), 'utf8')).toBe('meine Arbeit');
});

it('bricht ab bei verschiedenen Gesetzen', () => {
  const a = schreibe('a.xml', xml([['§ 1', 'x']]));
  const b = schreibe('b.xml', xml([['§ 1', 'x']], 'de-bund', 'BGB'));
  const c = schreibe('c.xml', xml([['§ 1', 'x']], 'de-bw', 'HGB'));
  expect(() => titelvergleichHin(a, b)).toThrow(/Verschiedene Gesetze/);
  expect(() => titelvergleichHin(a, c)).toThrow(/Verschiedene Gesetze/);
});

it('bricht ab bei Dateien im alten Format ohne gesetz-Element', () => {
  const alt = schreibe(
    'alt.xml',
    '<nichtamtlicheTitel><infos><kurztitel>HGB</kurztitel></infos><inhalt/></nichtamtlicheTitel>',
  );
  const neu = schreibe('neu.xml', xml([['§ 1', 'x']]));
  expect(() => titelvergleichHin(alt, neu)).toThrow(/gesetz/);
});

it('bricht ab, wenn ein Titel selbst // enthält', () => {
  const a = schreibe('a.xml', xml([['§ 1', 'http://x']]));
  const b = schreibe('b.xml', xml([['§ 1', 'y']]));
  expect(() => titelvergleichHin(a, b)).toThrow(/§ 1/);
});

it('wandelt die bearbeitete md-Datei in eine vollständige XML mit aktueller Zeit zurück', () => {
  const md = schreibe(
    'HGB vergleich.md',
    '# HGB (de-bund)\n[§ 1] Istkaufmann; Handelsgewerbe\n\n[§ 2] A & B <C>\n[§ 3]\n',
  );
  const ausgabe = titelvergleichZurueck(md, new Date('2026-11-20T10:30:45.123Z'));
  expect(ausgabe).toBe(join(ordner, 'HGB vergleich.xml'));
  expect(readFileSync(ausgabe, 'utf8')).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<nichtamtlicheTitel version="1">
    <infos>
        <gesetz normgeber="de-bund">HGB</gesetz>
        <geaendert>2026-11-20T10:30:45Z</geaendert>
    </infos>
    <inhalt>
        <norm><bezeichnung>§ 1</bezeichnung><titel>Istkaufmann; Handelsgewerbe</titel></norm>
        <norm><bezeichnung>§ 2</bezeichnung><titel>A &amp; B &lt;C&gt;</titel></norm>
        <norm><bezeichnung>§ 3</bezeichnung><titel></titel></norm>
    </inhalt>
</nichtamtlicheTitel>
`);
});

it('liest Kurztitel mit Klammern aus der Überschrift', () => {
  const md = schreibe('x.md', '# EUV (Lissabon) (eu)\n[Art. 1] T\n');
  const text = readFileSync(titelvergleichZurueck(md), 'utf8');
  expect(text).toContain('<gesetz normgeber="eu">EUV (Lissabon)</gesetz>');
});

it('bricht beim Zurückwandeln ab und nennt alle Zeilen mit noch offenem //', () => {
  const md = schreibe('x.md', '# HGB (de-bund)\n[§ 1] A//B\n[§ 2] fertig\n[§ 3] C//D\n');
  expect(() => titelvergleichZurueck(md)).toThrow(/Zeile 2, 4/);
  expect(existsSync(join(ordner, 'x.xml'))).toBe(false);
});

it('bricht beim Zurückwandeln ab, wenn die XML schon existiert', () => {
  const md = schreibe('x.md', '# HGB (de-bund)\n[§ 1] A\n');
  schreibe('x.xml', 'alt');
  expect(() => titelvergleichZurueck(md)).toThrow(/existiert bereits/);
  expect(readFileSync(join(ordner, 'x.xml'), 'utf8')).toBe('alt');
});

it.each([
  ['ohne Überschrift', '[§ 1] A\n'],
  ['mit ungültigem Normgeber', '# HGB (De Bund)\n[§ 1] A\n'],
  ['mit unlesbarer Zeile', '# HGB (de-bund)\n§ 1 A\n'],
])('bricht beim Zurückwandeln ab %s', (_name, inhalt) => {
  const md = schreibe('x.md', inhalt);
  expect(() => titelvergleichZurueck(md)).toThrow();
});

it('Hin und zurück erhält Bezeichnungen und Titel (bei gleichen Titeln)', () => {
  const a = schreibe('a.xml', xml([['§ 1', 'Eins &amp; Zwei']]));
  const b = schreibe('b.xml', xml([['§ 1', 'Eins &amp; Zwei']]));
  const md = titelvergleichHin(a, b);
  const neu = readFileSync(titelvergleichZurueck(md), 'utf8');
  expect(neu).toContain(
    '<norm><bezeichnung>§ 1</bezeichnung><titel>Eins &amp; Zwei</titel></norm>',
  );
});
