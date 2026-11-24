// normgeber-literale.test.ts
// Sichert die Registerbindung von Normgebern und Importindex-Kategorien im Produktivcode.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const literale = new Set([
  'Bund' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */,
  'BW' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */,
  'EU' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */,
  'Europarat' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */,
  'bund',
  'bw',
  'eu',
  'europarat',
  'de-bund',
  'de-bw',
]);

function dateien(ordner: string): string[] {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((eintrag) => {
    const pfad = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) return eintrag.name === 'test' ? [] : dateien(pfad);
    return /\.tsx?$/.test(pfad) && !/\.test\.tsx?$/.test(pfad) ? [pfad] : [];
  });
}

it('bindet bekannte Normgeber und Kategorien außerhalb des Registers an Registerkonstanten', () => {
  const treffer: string[] = [];
  for (const pfad of dateien('src')) {
    if (pfad === join('src', 'lib', 'domain', 'normgeber.ts')) continue;
    const quelltext = readFileSync(pfad, 'utf8');
    const baum = ts.createSourceFile(pfad, quelltext, ts.ScriptTarget.Latest, true);
    const besuche = (knoten: ts.Node) => {
      const kategorieSchluessel =
        ts.isIdentifier(knoten) &&
        (ts.isPropertyAssignment(knoten.parent) ||
          ts.isPropertySignature(knoten.parent) ||
          ts.isPropertyAccessExpression(knoten.parent)) &&
        knoten.parent.name === knoten;
      if ((ts.isStringLiteralLike(knoten) || kategorieSchluessel) && literale.has(knoten.text)) {
        // Reiner Anzeigename im Ladehinweis; ausschließlich dieses Literal ist ausgenommen.
        const anzeige =
          pfad === join('src', 'lib', 'gesetz-laden', 'gesetzLadeMeldungen.ts') &&
          knoten.text ===
            'Bund' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */ &&
          ts.isConditionalExpression(knoten.parent) &&
          knoten.parent.whenTrue === knoten &&
          knoten.parent.whenFalse.getText(baum) === "'Landesrecht BW'";
        if (!anzeige) {
          const zeile = baum.getLineAndCharacterOfPosition(knoten.getStart()).line + 1;
          treffer.push(`${pfad}:${zeile}: ${knoten.getText(baum)}`);
        }
      }
      ts.forEachChild(knoten, besuche);
    };
    besuche(baum);
  }
  expect(treffer).toEqual([]);
});

function alleDatendateien(ordner: string): string[] {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((e) => {
    const pfad = join(ordner, e.name);
    return e.isDirectory()
      ? alleDatendateien(pfad)
      : /\.(?:tsx?|mjs|rs|xml|json|snap|md)$/.test(pfad)
        ? [pfad]
        : [];
  });
}

function findeAltwerte(pfad: string, text: string): string[] {
  const treffer: string[] = [];
  const alt = new Set([
    'Bund' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */,
    'BW' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */,
    'EU' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */,
    'Europarat' /* normgeber-waechter: Konkrete Vergleichsmetadaten des Wächters. */,
  ]);
  const baum = /\.(?:tsx?|mjs)$/.test(pfad)
    ? ts.createSourceFile(pfad, text, ts.ScriptTarget.Latest, true)
    : undefined;
  const melde = (position: number, wert: string, ende?: number) => {
    // Nur ein direkt nach dem Literal stehender Kommentar befreit diese Datenstelle.
    // Keine Suche in umschließenden Aufrufen, Anweisungen oder Callback-Blöcken.
    const zeilenende = text.indexOf('\n', ende ?? position);
    const danach = text.slice(ende ?? position, zeilenende < 0 ? text.length : zeilenende);
    if (
      ende !== undefined &&
      (/^[\t ]*\/\* normgeber-(?:negativ|anzeige|link|waechter):[^*]+\*\//.test(danach) ||
        /^[\t ,;\])}]*\/\/ normgeber-(?:negativ|anzeige|link|waechter):/.test(danach))
    )
      return;
    const zeile = text.slice(0, position).split('\n').length;
    treffer.push(`${pfad}:${zeile}: ${wert}`);
  };
  const altwertInhalt =
    /(?:_(?:Bund|BW|EU|Europarat)(?=\.xml| (?:Markierungen|Favoriten|nichtamtliche Titel))|<normgeber>\s*(?:Bund|BW|EU|Europarat)\s*<\/normgeber>|normgeber["']?\s*[:=]\s*["'](?:Bund|BW|EU|Europarat)["'])/;
  if (!baum) for (const m of text.matchAll(new RegExp(altwertInhalt, 'g'))) melde(m.index, m[0]);
  if (baum) {
    const besuche = (knoten: ts.Node) => {
      if (
        (ts.isStringLiteralLike(knoten) || ts.isTemplateLiteralToken(knoten)) &&
        (alt.has(knoten.text) ||
          altwertInhalt.test(knoten.text) ||
          /_(?:Bund|BW|EU|Europarat)(?:$|\.xml| (?:Markierungen|Favoriten|nichtamtliche Titel))/.test(
            knoten.text,
          ) ||
          /^\["(?:Bund|BW|EU|Europarat)"/.test(knoten.text))
      ) {
        let datenstelle: ts.Node = knoten;
        if (ts.isTemplateLiteralToken(knoten) && !ts.isNoSubstitutionTemplateLiteral(knoten)) {
          while (!ts.isTemplateExpression(datenstelle) && datenstelle.parent)
            datenstelle = datenstelle.parent;
        }
        melde(knoten.getStart(), knoten.text, datenstelle.getEnd());
      }
      ts.forEachChild(knoten, besuche);
    };
    besuche(baum);
  }
  return treffer;
}
it('verwendet Altwerte nur in einzeln dokumentierten Negativfällen oder Anzeigenamen', () => {
  const treffer = ['src', 'scripts', 'src-tauri/resources', 'src-tauri/src', 'docs/doku/testdaten']
    .flatMap(alleDatendateien)
    .flatMap((pfad) => findeAltwerte(pfad, readFileSync(pfad, 'utf8')));
  expect(treffer).toEqual([]);
}, 10_000);

it('bindet Freistellungen an die konkrete Datenstelle und meldet weitere Altwerte im selben Callback und Block', () => {
  const altwert = 'B' + 'und';
  const quelle = [
    'describe("Block", () => {',
    '  it.each([',
    `    '${altwert}', // normgeber-negativ: konkreter Eingabefall.`,
    '  ])("Fall", () => {',
    `    const negativ = { normgeber: '${altwert}' }; // normgeber-negativ: konkreter Datenfall.`,
    `    if (Date.now() < 0) return { normgeber: '${altwert}' };`,
    `    return { normgeber: '${altwert}' };`,
    '  });',
    `  const positiv = { normgeber: '${altwert}' };`,
    '});',
  ].join('\n');
  const fundzeilen = findeAltwerte('beispiel.test.ts', quelle).map((t) => Number(t.split(':')[1]));
  expect(new Set(fundzeilen)).toEqual(new Set([6, 7, 9]));
});

it('befreit bei zwei Werten in einer Zeile nur das unmittelbar markierte Literal', () => {
  const wert = 'B' + 'und';
  const quelle = `const negativ = '${wert}' /* normgeber-negativ: einzelner Datenwert. */, positiv = '${wert}';`;
  expect(findeAltwerte('beispiel.test.ts', quelle)).toEqual([`beispiel.test.ts:1: ${wert}`]);
});

it('erfasst Altwerte auch in XML-Templatebestandteilen mit Interpolation', () => {
  const wert = 'B' + 'und';
  const quelle = 'const xml = `<gesetz><normgeber>' + wert + '</normgeber>${inhalt}</gesetz>`;';
  expect(findeAltwerte('beispiel.test.ts', quelle)).toHaveLength(1);
  expect(
    findeAltwerte('beispiel.test.ts', quelle + ' // normgeber-negativ: diese XML-Testdatei.'),
  ).toEqual([]);
});
