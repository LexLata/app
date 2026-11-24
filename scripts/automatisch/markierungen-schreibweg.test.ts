// markierungen-schreibweg.test.ts
// Sichert, dass Markierungsdateien nur über die prüfende Schreibfunktion geschrieben werden.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const ordner = join('src', 'lib', 'markierungen');
const schreibfunktion = join(ordner, 'eintrag', 'markierungSpeicher.schreiben.ts');

function dateien(pfad: string): string[] {
  return readdirSync(pfad, { withFileTypes: true }).flatMap((eintrag) => {
    const kind = join(pfad, eintrag.name);
    if (eintrag.isDirectory()) return dateien(kind);
    return /\.tsx?$/.test(kind) && !/\.test\.tsx?$/.test(kind) ? [kind] : [];
  });
}

it('ruft nutzerdatenSchreiben im Markierungsmodul nur in der prüfenden Schreibfunktion auf', () => {
  const treffer: string[] = [];
  for (const pfad of dateien(ordner)) {
    const baum = ts.createSourceFile(
      pfad,
      readFileSync(pfad, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const besuche = (knoten: ts.Node) => {
      if (ts.isIdentifier(knoten) && knoten.text === 'nutzerdatenSchreiben') {
        const zeile = baum.getLineAndCharacterOfPosition(knoten.getStart()).line + 1;
        treffer.push(`${pfad}:${zeile}`);
      }
      ts.forEachChild(knoten, besuche);
    };
    besuche(baum);
  }
  expect(treffer.filter((t) => !t.startsWith(`${schreibfunktion}:`))).toEqual([]);
  expect(treffer.some((t) => t.startsWith(`${schreibfunktion}:`))).toBe(true);
});
