// grundbestandAblauf.test.ts
// Ablauf mit ersetztem Appstart; Arbeitsdaten liegen in einem temporären Ordner.
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fuehreGrundbestandAus } from './grundbestandAblauf';
import { bereiteGrundbestandVor } from './praefixstrukturenArgumente';

let repository: string;
let ausserhalb: string;
const index = (normgeber: string, ...kurztitel: string[]) =>
  `<importindex version="1"><infos><verarbeitungszeit>2026-11-19T00:00:00Z</verarbeitungszeit><normgeber>${normgeber}</normgeber><datenquelle name="Test"/></infos><inhalt>${kurztitel
    .map(
      (t, i) =>
        `<gesetz><langtitel>Gesetz ${i}</langtitel><kurztitel>${t}</kurztitel><abrufkennung>k${i}</abrufkennung></gesetz>`,
    )
    .join('')}</inhalt></importindex>`;
const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
beforeEach(() => {
  repository = mkdtempSync(join(tmpdir(), 'lexlata-grundbestand-ablauf-'));
  ausserhalb = mkdtempSync(join(tmpdir(), 'lexlata-grundbestand-aussen-'));
  const ressourcen = join(repository, 'src-tauri/resources');
  mkdirSync(join(ressourcen, 'importindizes'), { recursive: true });
  mkdirSync(join(ressourcen, 'europa'), { recursive: true });
  writeFileSync(
    join(ressourcen, 'importindizes/de-bund.xml'),
    index('de-bund', 'GG', 'G 10', 'SGB 2', '§12PflAFinV', 'Fehlt', 'ÄndG'),
  );
  writeFileSync(join(ressourcen, 'importindizes/de-bw.xml'), index('de-bw', 'PassG/PAuswG'));
  writeFileSync(
    join(ressourcen, 'europa/europaKuratiert.json'),
    JSON.stringify([{ celex: '32016R0679', kurztitel: 'DSGVO', langtitel: 'Verordnung' }]),
  );
});
afterEach(() => {
  rmSync(repository, { recursive: true, force: true });
  rmSync(ausserhalb, { recursive: true, force: true });
});

/** Dateinamen, wie sie der Entwicklerlauf ablegt (Sonderzeichen prozentkodiert). */
const ablagename: Record<string, string> = {
  GG: 'GG',
  'G 10': 'G 10',
  'SGB 2': 'SGB 2',
  '§12PflAFinV': '§12PflAFinV',
  'PassG/PAuswG': 'PassG%2FPAuswG',
  DSGVO: 'DSGVO',
  // Zerlegte Unicode-Form, wie sie ein Dateisystem liefern kann.
  ÄndG: 'A\u0308ndG',
};
interface Laufverhalten {
  laufcode?: number;
  /** Kurztitel, deren Abruf scheitert: keine neue Datei, Eintrag unter „Fehlgeschlagen“. */
  gescheitert?: string[];
  /** Ohne Bericht endet der Lauf, als hätte er ihn nicht schreiben können. */
  ohneBericht?: boolean;
}
async function grundbestand(
  gesetze: Record<string, string[]>,
  { laufcode = 0, gescheitert = [], ohneBericht = false }: Laufverhalten = {},
) {
  const liste = join(repository, 'liste.xml');
  const element = { 'de-bund': 'bund', 'de-bw': 'bw', eu: 'eu' } as Record<string, string>;
  writeFileSync(
    liste,
    `<grundbestand version="1"><infos><geaendert>2026-11-19T00:00:00Z</geaendert></infos><inhalt>${Object.entries(
      gesetze,
    )
      .map(
        ([ng, titel]) =>
          `<${element[ng]}>${titel.map((t) => `<gesetz>${escape(t)}</gesetz>`).join('')}</${element[ng]}>`,
      )
      .join('')}</inhalt></grundbestand>`,
  );
  const vorbereitung = bereiteGrundbestandVor([liste], repository, '/');
  const laeufe: { normgeber: string; kurztitel: string }[] = [];
  const zeilen: string[] = [];
  const code = await fuehreGrundbestandAus(
    vorbereitung,
    async ({ umgebung }) => {
      const normgeber = String(umgebung.LEXLATA_PRAEFIXLAUF);
      const kurztitel = String(umgebung.LEXLATA_PRAEFIXLAUF_KURZTITEL);
      laeufe.push({ normgeber, kurztitel });
      // Ersetzter Appstart: schreibt das GesetzesXML wie der Quelldateienlauf.
      const ordner = join(
        String(umgebung.LEXLATA_PRAEFIXLAUF_ARBEITSDATEN),
        'gesetzesxml',
        normgeber,
      );
      mkdirSync(ordner, { recursive: true });
      for (const titel of kurztitel.split(','))
        if (ablagename[titel] && !gescheitert.includes(titel))
          writeFileSync(join(ordner, `${ablagename[titel]}.xml`), `<gesetz>${titel}</gesetz>`);
      // Bericht im Format des Entwicklerlaufs (formatiereLaufBericht plus Laufangaben).
      const berichte = join(String(umgebung.LEXLATA_PRAEFIXLAUF_ARBEITSDATEN), 'berichte');
      mkdirSync(berichte, { recursive: true });
      const fehlschlaege = gescheitert.map((t) => `${t}: Netzwerkfehler`).join('\n') || 'Keine.';
      if (!ohneBericht)
        writeFileSync(
          join(
            berichte,
            `fehler-quelldateien-${normgeber}-2026-11-19T00-00-00-000Z-${laeufe.length}.txt`,
          ),
          `Erfolgreich gespeichert: 0 / Teilerfolge: 0 / Fehlgeschlagen: ${gescheitert.length}\n\nTeilerfolge\nKeine.\n\nFehlgeschlagen\n${fehlschlaege}\n\nModus: quelldateien\n`,
        );
      return laufcode;
    },
    (zeile) => zeilen.push(zeile),
  );
  return { code, laeufe, bericht: zeilen.join('\n') };
}
const ausgabe = () => readdirSync(join(repository, 'arbeitsdaten/grundbestand')).sort();

it('P2-A2: startet je Normgeber einen Lauf und hinterlässt nach kleinerer Liste nur deren Dateien', async () => {
  const erster = await grundbestand({
    'de-bund': ['gg'],
    'de-bw': ['PassG/PAuswG'],
    eu: ['DSGVO'],
  });
  expect(erster.code).toBe(0);
  expect(erster.laeufe).toEqual([
    { normgeber: 'de-bund', kurztitel: 'GG' },
    { normgeber: 'de-bw', kurztitel: 'PassG/PAuswG' },
    { normgeber: 'eu', kurztitel: 'DSGVO' },
  ]);
  expect(ausgabe()).toEqual(['DSGVO_eu.xml', 'GG_de-bund.xml', 'PassG%2FPAuswG_de-bw.xml']);
  expect(readFileSync(join(repository, 'arbeitsdaten/grundbestand/GG_de-bund.xml'), 'utf8')).toBe(
    '<gesetz>GG</gesetz>',
  );
  expect(erster.bericht).toContain('de-bund: 1 kopiert, 0 gescheitert, 0 ohne Datei');

  const zweiter = await grundbestand({ 'de-bw': ['PassG/PAuswG'] });
  expect(zweiter.laeufe.map((l) => l.normgeber)).toEqual(['de-bw']);
  expect(ausgabe()).toEqual(['PassG%2FPAuswG_de-bw.xml']);
});

it('P2-A4: ein Gesetz ohne Datei bricht nicht ab, fehlt in der Ausgabe und steht im Bericht', async () => {
  const { code, bericht } = await grundbestand({ 'de-bund': ['GG', 'Fehlt'] });
  expect(code).toBe(0);
  expect(ausgabe()).toEqual(['GG_de-bund.xml']);
  expect(bericht).toContain('de-bund: 1 kopiert, 0 gescheitert, 1 ohne Datei');
  expect(bericht).toContain('ohne Datei: Fehlt (de-bund)');
});

it('P2-A4: ein Lauf mit Fehlercode beendet den Ablauf mit Fehlercode vor weiteren Läufen', async () => {
  const { code, laeufe, bericht } = await grundbestand(
    { 'de-bund': ['GG'], eu: ['DSGVO'] },
    { laufcode: 1 },
  );
  expect(code).toBe(1);
  expect(laeufe.map((l) => l.normgeber)).toEqual(['de-bund']);
  expect(bericht).toContain('abgebrochen');
  expect(existsSync(join(repository, 'arbeitsdaten/grundbestand'))).toBe(false);
});

it('P2-A5: Sonderzeichen ergeben den Dateinamen des Entwicklerlaufs plus Normgeber', async () => {
  const { code } = await grundbestand({
    'de-bund': ['g 10', 'SGB 2', '§12pflafinv'],
    'de-bw': ['passg/pauswg'],
  });
  expect(code).toBe(0);
  expect(ausgabe()).toEqual(
    [
      'G 10_de-bund.xml',
      'SGB 2_de-bund.xml',
      '§12PflAFinV_de-bund.xml',
      'PassG%2FPAuswG_de-bw.xml',
    ].sort(),
  );
  for (const name of ausgabe()) expect(name).not.toMatch(/[<>:"/\\|?*]/);
});

it('P2-A7: Verknüpfungen im Ausgabeordner werden entfernt, ihr Ziel bleibt erhalten', async () => {
  writeFileSync(join(ausserhalb, 'fremd.xml'), 'fremd');
  mkdirSync(join(ausserhalb, 'ordner'));
  writeFileSync(join(ausserhalb, 'ordner/innen.xml'), 'innen');
  const ziel = join(repository, 'arbeitsdaten/grundbestand');
  mkdirSync(ziel, { recursive: true });
  symlinkSync(join(ausserhalb, 'fremd.xml'), join(ziel, 'datei-link.xml'));
  symlinkSync(join(ausserhalb, 'ordner'), join(ziel, 'ordner-link'), 'junction');
  expect((await grundbestand({ 'de-bund': ['GG'] })).code).toBe(0);
  expect(ausgabe()).toEqual(['GG_de-bund.xml']);
  expect(readFileSync(join(ausserhalb, 'fremd.xml'), 'utf8')).toBe('fremd');
  expect(readFileSync(join(ausserhalb, 'ordner/innen.xml'), 'utf8')).toBe('innen');
});

it('P2-A7: ist der Ausgabeordner selbst eine Verknüpfung, bricht der Ablauf ohne Löschen ab', async () => {
  writeFileSync(join(ausserhalb, 'fremd.xml'), 'fremd');
  mkdirSync(join(repository, 'arbeitsdaten'), { recursive: true });
  symlinkSync(ausserhalb, join(repository, 'arbeitsdaten/grundbestand'), 'junction');
  const { code, bericht } = await grundbestand({ 'de-bund': ['GG'] });
  expect(code).toBe(1);
  expect(bericht).toContain('kein echter Ordner');
  expect(readdirSync(ausserhalb)).toEqual(['fremd.xml']);
});

it('P2-A4: scheitert der Abruf bei vorhandener alter Datei, wird sie nicht kopiert und als gescheitert berichtet', async () => {
  const alt = join(repository, 'arbeitsdaten/gesetzesxml/de-bund');
  mkdirSync(alt, { recursive: true });
  writeFileSync(join(alt, 'G 10.xml'), '<gesetz>alt</gesetz>');
  // Ein älterer Bericht desselben Normgebers zählt nicht für diesen Lauf.
  mkdirSync(join(repository, 'arbeitsdaten/berichte'), { recursive: true });
  writeFileSync(
    join(repository, 'arbeitsdaten/berichte/fehler-quelldateien-de-bund-alt-0.txt'),
    'Fehlgeschlagen\nGG: alt\n',
  );
  const { code, bericht } = await grundbestand(
    { 'de-bund': ['GG', 'G 10'] },
    { gescheitert: ['G 10'] },
  );
  expect(code).toBe(0);
  expect(ausgabe()).toEqual(['GG_de-bund.xml']);
  expect(bericht).toContain('de-bund: 1 kopiert, 1 gescheitert, 0 ohne Datei');
  expect(bericht).toContain('gescheitert: G 10 (de-bund)');
  expect(bericht).toMatch(/--kurztitel .*--neu/);
});

it('P2-A4: Gesetze ohne Datei erhalten einen Hinweis zum weiteren Vorgehen', async () => {
  const { bericht } = await grundbestand({ 'de-bund': ['GG', 'Fehlt'] });
  expect(bericht).toMatch(/Hinweis:.*npm run (quelldateien|gesetzesxml)/);
});

it('P2-A4: fehlt der Bericht eines Laufs, bricht der Ablauf mit Fehlercode ab', async () => {
  const { code, bericht } = await grundbestand({ 'de-bund': ['GG'] }, { ohneBericht: true });
  expect(code).toBe(1);
  expect(bericht).toContain('keinen Bericht');
  expect(existsSync(join(repository, 'arbeitsdaten/grundbestand'))).toBe(false);
});

it('P2-A5: Kurztitel werden unabhängig von der Unicode-Normalform zugeordnet', async () => {
  const { code } = await grundbestand({ 'de-bund': ['ändg'] });
  expect(code).toBe(0);
  expect(ausgabe()).toEqual(['A\u0308ndG_de-bund.xml']);
});

it('P2-A4: ein gescheiterter Kurztitel in anderer Normalform wird erkannt', async () => {
  const alt = join(repository, 'arbeitsdaten/gesetzesxml/de-bund');
  mkdirSync(alt, { recursive: true });
  writeFileSync(join(alt, 'A\u0308ndG.xml'), '<gesetz>alt</gesetz>');
  const { bericht } = await grundbestand({ 'de-bund': ['ÄndG'] }, { gescheitert: ['A\u0308ndG'] });
  expect(ausgabe()).toEqual([]);
  expect(bericht).toContain('gescheitert: ÄndG (de-bund)');
});
