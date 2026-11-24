// interface-durchreichen.cjs
// Ein Modul-Interface (`*.index.ts`) bietet jeden Namen unter seinem eigenen
// Namen an und gibt nur Namen aus dem eigenen Modulordner weiter
// (Submodule eingeschlossen). Gemeldet werden `export { x as y }`
// (außer `default as X`) und Weitergaben aus Dateien außerhalb des
// Modulordners, auch über einen vorher importierten Namen – einschließlich
// `export const y = x` und `export type Y = X` ohne eigene Logik.
const path = require('node:path');
const projektwurzel = path.resolve(__dirname, '..');

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      umbenannt:
        'Das Interface bietet „{{lokal}}“ unter anderem Namen („{{name}}“) an. Den Namen in der Quelldatei festlegen.',
      vonAussen:
        'Das Interface reicht „{{quelle}}“ von außerhalb des Modulordners durch. Den Namen beim besitzenden Modul importieren.',
    },
  },
  create(context) {
    const datei = context.filename;
    if (!datei.endsWith('.index.ts')) return {};
    const modulordner = path.dirname(datei);

    function istAusserhalb(quelle) {
      let ziel;
      if (quelle.startsWith('@/')) ziel = path.resolve(projektwurzel, 'src', quelle.slice(2));
      else if (quelle.startsWith('.')) ziel = path.resolve(modulordner, quelle);
      else return true;
      return !ziel.startsWith(modulordner + path.sep);
    }
    const name = (knoten) => knoten.name ?? knoten.value;
    const importeVonAussen = new Map();

    function pruefeSpezifizierer(spezifizierer) {
      const lokal = name(spezifizierer.local);
      const exportiert = name(spezifizierer.exported);
      if (lokal !== exportiert && lokal !== 'default') {
        context.report({
          node: spezifizierer,
          messageId: 'umbenannt',
          data: { lokal, name: exportiert },
        });
      }
    }

    // Bloße Zuweisung eines importierten Namens ist eine Weitergabe unter neuem Namen.
    function pruefeDeklaration(deklaration) {
      const verweise = [];
      if (deklaration?.type === 'VariableDeclaration') {
        for (const d of deklaration.declarations)
          if (d.init?.type === 'Identifier') verweise.push(d.init);
      } else if (
        deklaration?.type === 'TSTypeAliasDeclaration' &&
        deklaration.typeAnnotation.type === 'TSTypeReference' &&
        deklaration.typeAnnotation.typeName.type === 'Identifier' &&
        !deklaration.typeAnnotation.typeArguments
      ) {
        verweise.push(deklaration.typeAnnotation.typeName);
      }
      for (const verweis of verweise) {
        const quelle = importeVonAussen.get(verweis.name);
        if (quelle !== undefined) {
          context.report({ node: verweis, messageId: 'vonAussen', data: { quelle } });
        }
      }
    }

    return {
      ImportDeclaration(node) {
        if (!istAusserhalb(node.source.value)) return;
        for (const s of node.specifiers) importeVonAussen.set(s.local.name, node.source.value);
      },
      ExportAllDeclaration(node) {
        if (istAusserhalb(node.source.value)) {
          context.report({ node, messageId: 'vonAussen', data: { quelle: node.source.value } });
        }
      },
      ExportNamedDeclaration(node) {
        pruefeDeklaration(node.declaration);
        for (const s of node.specifiers) pruefeSpezifizierer(s);
        if (node.source) {
          if (istAusserhalb(node.source.value)) {
            context.report({ node, messageId: 'vonAussen', data: { quelle: node.source.value } });
          }
          return;
        }
        for (const s of node.specifiers) {
          const quelle = importeVonAussen.get(name(s.local));
          if (quelle !== undefined) {
            context.report({ node: s, messageId: 'vonAussen', data: { quelle } });
          }
        }
      },
    };
  },
};
