// Der Entwicklerlauf (Präfixlauf) darf nur im Entwicklungsbau existieren: native
// Befehle, Rust-Modul und dessen Verwendung hängen an debug_assertions, der
// Start im Frontend an import.meta.env.DEV. Geprüft werden die Quelltexte, nicht
// die Build-Ausgabe.
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const lib = readFileSync('src-tauri/src/lib.rs', 'utf8');
const commands = readFileSync('src-tauri/src/commands.rs', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');

const ATTRIBUT = /#\[cfg\(([^\]]*)\)\]\s*$/;

/** Ende der mit `{` an Position `start` beginnenden Klammer (naiv, ohne Zeichenketten). */
function blockEnde(quelle: string, start: number): number {
  let tiefe = 0;
  for (let i = start; i < quelle.length; i++) {
    if (quelle[i] === '{') tiefe++;
    else if (quelle[i] === '}' && --tiefe === 0) return i;
  }
  return quelle.length;
}

/** Handlerlisteneinträge zum Präfixlauf ohne debug_assertions-Attribut. */
function ungebundeneHandlerEintraege(rust: string): string[] {
  return [...rust.matchAll(/tauri::generate_handler!\s*\[((?:#\[[^\]]*\]|[^\]])*)\]/g)].flatMap(
    (liste) =>
      [...(liste[1] ?? '').matchAll(/((?:#\[[^\]]*\]\s*)*)([\w:]+)\s*(?:,|$)/g)]
        .filter(([, , pfad]) => pfad?.includes('praefixlauf'))
        .filter(([, attribute]) => !attribute?.includes('debug_assertions'))
        .map(([, , pfad]) => pfad ?? ''),
  );
}

/** Rust-Verwendungen von `praefixlauf` außerhalb der Handlerlisten, die nicht
 *  in einem Element mit debug_assertions-Attribut stehen. */
function ungebundeneRustVerwendungen(rust: string): number[] {
  const ohneListen = rust.replace(/tauri::generate_handler!\s*\[((?:#\[[^\]]*\]|[^\]])*)\]/g, (m) =>
    ' '.repeat(m.length),
  );
  const geschuetzt: [number, number][] = [];
  for (const attr of ohneListen.matchAll(/#\[cfg\(([^\]]*)\)\]/g)) {
    if (!attr[1]?.includes('debug_assertions')) continue;
    const nach = attr.index + attr[0].length;
    const semikolon = ohneListen.indexOf(';', nach);
    const klammer = ohneListen.indexOf('{', nach);
    const ende =
      klammer !== -1 && (semikolon === -1 || klammer < semikolon)
        ? blockEnde(ohneListen, klammer)
        : semikolon;
    geschuetzt.push([nach, ende]);
  }
  return [...ohneListen.matchAll(/praefixlauf/g)]
    .map((m) => m.index)
    .filter((pos) => !ohneListen.slice(0, pos).split('\n').at(-1)?.trimStart().startsWith('//'))
    .filter((pos) => !geschuetzt.some(([a, b]) => a <= pos && pos <= b));
}

function modulGebunden(rust: string): boolean {
  const vor = rust.split(/\n[^\n]*\bmod praefixlauf;/)[0];
  return vor !== rust && (ATTRIBUT.exec(vor ?? '')?.[1] ?? '').includes('debug_assertions');
}

/** Bezeichner und Importpfade zum Präfixlauf in main.tsx außerhalb von `if (import.meta.env.DEV)`. */
function ungebundeneFrontendVerwendungen(quelle: string): string[] {
  const ast = ts.createSourceFile('main.tsx', quelle, ts.ScriptTarget.Latest, true);
  const funde: string[] = [];
  const imDevZweig = (knoten: ts.Node): boolean => {
    for (let k: ts.Node = knoten; k.parent; k = k.parent) {
      const p = k.parent;
      if (
        ts.isIfStatement(p) &&
        p.thenStatement === k &&
        p.expression.getText(ast) === 'import.meta.env.DEV'
      )
        return true;
    }
    return false;
  };
  const besuche = (knoten: ts.Node) => {
    const text = ts.isIdentifier(knoten) || ts.isStringLiteral(knoten) ? knoten.text : undefined;
    if (text && /praefixlauf/i.test(text) && !imDevZweig(knoten)) funde.push(text);
    ts.forEachChild(knoten, besuche);
  };
  besuche(ast);
  return funde;
}

describe('Entwicklerlauf nur im Entwicklungsbau', () => {
  it('registriert jeden Präfixlauf-Befehl nur unter debug_assertions', () => {
    expect(lib).toContain('praefixlauf_auftrag');
    expect(ungebundeneHandlerEintraege(lib)).toEqual([]);
  });

  it('meldet einen Präfixlauf-Befehl ohne debug_assertions-Attribut', () => {
    const probe = lib.replace(
      /#\[cfg\(debug_assertions\)\]\s*(commands::praefixlauf::praefixlauf_auftrag)/,
      '$1',
    );
    expect(ungebundeneHandlerEintraege(probe)).toEqual([
      'commands::praefixlauf::praefixlauf_auftrag',
    ]);
  });

  it('übersetzt das Rust-Modul praefixlauf nur unter debug_assertions', () => {
    expect(modulGebunden(commands)).toBe(true);
    expect(
      modulGebunden(
        commands.replace(/#\[cfg\([^\]]*\)\]\s*\n(\s*pub\(crate\) mod praefixlauf;)/, '$1'),
      ),
    ).toBe(false);
  });

  it('verwendet das Rust-Modul praefixlauf in lib.rs nur unter debug_assertions', () => {
    expect(lib).toContain('praefixlauf::konfiguriere_hintergrundausfuehrung');
    expect(ungebundeneRustVerwendungen(lib)).toEqual([]);
    const probe = lib.replace(
      /#\[cfg\(all\(desktop, debug_assertions\)\)\]\s*(let kontext = \{\s*let mut kontext = kontext;\s*commands::praefixlauf)/,
      '$1',
    );
    expect(probe).not.toBe(lib);
    expect(ungebundeneRustVerwendungen(probe)).toHaveLength(1);
  });

  it('startet den Entwicklerlauf im Frontend nur hinter import.meta.env.DEV', () => {
    expect(main).toMatch(/holePraefixlaufAuftrag/);
    expect(ungebundeneFrontendVerwendungen(main)).toEqual([]);
    const probe = main.replace('if (import.meta.env.DEV) {', 'if (true) {');
    expect(probe).not.toBe(main);
    expect(ungebundeneFrontendVerwendungen(probe)).not.toEqual([]);
  });
});
