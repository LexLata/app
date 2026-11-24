// kurztitel-vergleich.test.ts
// Teilschutz: Kurztitel dürfen in nutzernahen Ausdrücken nicht nur kleingeschrieben werden.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

function dateien(pfad: string): string[] {
  return readdirSync(pfad, { withFileTypes: true }).flatMap((e) => {
    const ziel = join(pfad, e.name);
    return e.isDirectory()
      ? dateien(ziel)
      : /\.tsx?$/.test(ziel) && !/\.test\.tsx?$/.test(ziel)
        ? [ziel]
        : [];
  });
}
function fundstellen(text: string): string[] {
  const baum = ts.createSourceFile('test.tsx', text, ts.ScriptTarget.Latest, true);
  const treffer: string[] = [];
  const besuche = (knoten: ts.Node) => {
    if (
      ts.isCallExpression(knoten) &&
      ts.isPropertyAccessExpression(knoten.expression) &&
      knoten.expression.name.text === 'toLowerCase' &&
      /kurztitel/i.test(knoten.expression.expression.getText(baum))
    )
      treffer.push(knoten.getText(baum));
    ts.forEachChild(knoten, besuche);
  };
  besuche(baum);
  return treffer;
}
it('verwendet für nutzernahe Kurztitel die zentrale Vergleichsform', () => {
  const pfade = [
    'src/lib/domain',
    'src/lib/persistenz',
    'src/components',
    'src/hooks',
    'src/lib/import/dispatch',
    'src/lib/import/importabschluss',
  ].flatMap(dateien);
  pfade.push(
    'src/lib/import/importindex/importindexSuche.ts',
    ...dateien('src/lib/import/basis').filter((p) => /verweisTagger/.test(p)),
  );
  expect(
    pfade
      .filter((p) => !p.endsWith('/kurztitelVergleich.ts'))
      .flatMap((p) => fundstellen(readFileSync(p, 'utf8')).map((t) => `${p}: ${t}`)),
  ).toEqual([]);
});
it('erkennt neu eingefügte Kurztitelvergleiche auch über Zeilenumbrüche', () => {
  expect(fundstellen('gesetz.kurztitel.trim()\n.toLowerCase()')).toHaveLength(1);
  expect(fundstellen('kurztitelVergleichsform(gesetz.kurztitel)')).toEqual([]);
});
