// Kontrolliert React-Textblätter und sichtbare Attribute anhand aufgelöster Bindungen.
// Noch nicht global aktiviert. Native und imperative Ausgaben werden ebenfalls geprüft.
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const wurzel = path.resolve(__dirname, '..');
const oeffentlicheAnzeige = path.join(wurzel, 'src/components/textanzeige/textanzeige.index.ts');
const reactDeklaration = kanonisch(
  path.join(path.dirname(require.resolve('@types/react/package.json')), 'index.d.ts'),
);
const nativeHelfer = new Set([
  'nativeBestaetigung',
  'nativeMeldung',
  'nativeDateiOeffnen',
  'nativeDateiSpeichern',
  'nativeMenuEintrag',
  'nativeIconMenuEintrag',
  'nativeUntermenue',
  'nativesMarkierungsfensterOeffnen',
  'nativenFenstertitelSetzen',
]);
const befehlsDateien = new Set(
  ['aufruf.ts', 'tauri-befehle.index.ts'].map((datei) =>
    kanonisch(path.join(wurzel, 'src/lib/plattform/tauri-befehle', datei)),
  ),
);
const nativeDatei = path.join(wurzel, 'src/lib/plattform/tauriHelpers.ts');
const nativeModule = new Map([
  [
    'dialog',
    kanonisch(path.join(wurzel, 'node_modules/@tauri-apps/plugin-dialog/dist-js/index.d.ts')),
  ],
  ...['menu', 'core', 'window'].map((name) => [
    name,
    kanonisch(path.join(wurzel, `node_modules/@tauri-apps/api/${name}.d.ts`)),
  ]),
]);
const domMethoden = new Set([
  'createTextNode',
  'insertAdjacentText',
  'insertAdjacentHTML',
  'write',
  'writeln',
  'fillText',
  'strokeText',
  'setTitle',
]);
const domTextfelder = new Set(['textContent', 'innerText', 'innerHTML', 'outerHTML']);
const attribute = new Set(['title', 'placeholder', 'aria-label', 'alt']);
const symbole = new Set([
  '×',
  '…',
  '•',
  '→',
  '←',
  '↑',
  '↓',
  '−',
  '+',
  '–',
  '—',
  '↗',
  '✓',
  '✕',
  '☰',
]);
const huellen = new Set([
  'TSAsExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'ChainExpression',
]);

function entpacke(node) {
  while (node && huellen.has(node.type)) node = node.expression;
  return node;
}
function eigenschaft(node) {
  return node.computed ? node.property.value : node.property.name;
}
function schluessel(node) {
  return node.computed ? node.key.value : (node.key.name ?? node.key.value);
}
function kanonisch(datei) {
  return fs.existsSync(datei) ? fs.realpathSync(datei) : path.resolve(datei);
}
function optionen(datei) {
  const config = ts.findConfigFile(path.dirname(datei), ts.sys.fileExists);
  if (!config) return { moduleResolution: ts.ModuleResolutionKind.Bundler };
  const gelesen = ts.readConfigFile(config, ts.sys.readFile);
  if (gelesen.error) throw new Error(`Textanzeige-Regel: tsconfig unlesbar: ${config}`);
  const ergebnis = ts.parseJsonConfigFileContent(gelesen.config, ts.sys, path.dirname(config));
  if (ergebnis.errors.length) throw new Error(`Textanzeige-Regel: tsconfig ungültig: ${config}`);
  return ergebnis.options;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Sichtbaren Text ausschließlich über geprüfte Anzeigewege ausgeben.' },
    schema: [],
    messages: {
      text: 'Sichtbaren Text über TextAnzeige aus textanzeige.index ausgeben; unklare dynamische Textblätter sind nicht freigegeben. Siehe docs/doku/umbruchschutz.md.',
      attribut:
        'Sichtbare Textattribute über TextAnzeige oder TextAttributElement aus textanzeige.index übergeben. Siehe docs/doku/umbruchschutz.md.',
      nativ:
        'Native Textanzeige über die geprüften Übergaben aus tauriHelpers ausgeben. Siehe docs/doku/umbruchschutz.md.',
      dom: 'Direkte sichtbare DOM- oder Canvas-Textausgabe benötigt einen geprüften Anzeigeweg. Siehe docs/doku/umbruchschutz.md.',
      spread:
        'Unklare Ausgabe-Props: sichtbare Textattribute und Textkinder müssen einen geprüften Anzeigeweg verwenden. Siehe docs/doku/umbruchschutz.md.',
    },
  },
  create(context) {
    const quelle = context.sourceCode;
    const datei = path.resolve(context.filename);
    const compilerOptionen = optionen(datei);
    const module = new Map();
    function modul(pfad) {
      if (!module.has(pfad)) {
        const aufgeloest = ts.resolveModuleName(
          pfad,
          datei,
          compilerOptionen,
          ts.sys,
        ).resolvedModule;
        module.set(pfad, aufgeloest ? kanonisch(aufgeloest.resolvedFileName) : undefined);
      }
      return module.get(pfad);
    }
    function variable(node) {
      let scope = quelle.getScope(node);
      while (scope) {
        const gefunden = scope.set.get(node.name);
        if (gefunden) return gefunden;
        scope = scope.upper;
      }
      return undefined;
    }
    function konstante(node) {
      const binding = variable(node);
      const def = binding?.defs[0];
      if (binding?.defs.length !== 1 || def?.type !== 'Variable') return undefined;
      if (def.parent.kind !== 'const' || binding.references.some((r) => r.isWrite() && !r.init))
        return undefined;
      return def.node;
    }
    // Nur lokale, nicht exportierte Funktionen mit vollständig bekannten direkten
    // Aufrufen liefern einen Parameterbeweis. Typangaben sind keine Aufrufer.
    function parameterArgumente(node) {
      const def = variable(node)?.defs[0];
      if (def?.type !== 'Parameter' || variable(node).references.some((ref) => ref.isWrite()))
        return undefined;
      const funktion = def.node;
      if (
        funktion.type !== 'FunctionDeclaration' ||
        !funktion.id ||
        funktion.parent.type === 'ExportNamedDeclaration' ||
        funktion.parent.type === 'ExportDefaultDeclaration'
      )
        return undefined;
      const index = funktion.params.indexOf(def.name);
      const binding = variable(funktion.id);
      if (index < 0 || !binding?.references.length) return undefined;
      const argumente = [];
      for (const ref of binding.references) {
        const call = ref.identifier.parent;
        if (
          call.type !== 'CallExpression' ||
          call.callee !== ref.identifier ||
          call.arguments.some((a) => a.type === 'SpreadElement') ||
          !call.arguments[index]
        )
          return undefined;
        // Rekursive unveränderte Weitergabe erzeugt keine neue Herkunft.
        const arg = entpacke(call.arguments[index]);
        if (arg.type === 'Identifier' && variable(arg) === variable(node)) continue;
        argumente.push(call.arguments[index]);
      }
      return argumente.length ? argumente : undefined;
    }
    function weitergereichteHerkunft(node, besucht) {
      const argumente = parameterArgumente(node);
      if (!argumente) return undefined;
      const herkuenfte = argumente.map((arg) => herkunft(arg, besucht, true));
      const erste = herkuenfte[0];
      return erste &&
        [...nativeModule.values()].includes(erste.pfad) &&
        herkuenfte.every((h) => h?.pfad === erste.pfad && h?.name === erste.name)
        ? erste
        : undefined;
    }
    // Ein gemeinsamer Herkunftsweg für JSX-Namen, React-Factories und später native APIs.
    // Namen allein sind nie vertrauenswürdig. Überschattete Parameter haben eigene Bindungen.
    function herkunft(node, besucht = new Set(), wertbeweis = false) {
      node = entpacke(node);
      if (!node || besucht.has(node)) return undefined;
      besucht = new Set(besucht).add(node);
      if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
        const def = variable(node)?.defs[0];
        if (def?.type === 'ImportBinding') {
          if (wertbeweis && (def.parent.importKind === 'type' || def.node.importKind === 'type'))
            return undefined;
          const pfad = modul(def.parent.source.value);
          const spec = def.node;
          const name =
            spec.type === 'ImportNamespaceSpecifier'
              ? '*'
              : spec.type === 'ImportDefaultSpecifier'
                ? 'default'
                : (spec.imported.name ?? spec.imported.value);
          return pfad ? { pfad, name } : undefined;
        }
        if (def?.type === 'Parameter') {
          const weitergabe = weitergereichteHerkunft(node, besucht);
          if (weitergabe) return weitergabe;
        }
        // Zur Diagnose können API-Typen einen verdächtigen Aufruf benennen.
        // Eine Freigabe verlangt dagegen echte Werte und belegte Weitergabe.
        const annotation = wertbeweis ? undefined : typVonVariable(node);
        const typ = annotation?.type === 'TSTypeQuery' ? annotation.exprName : annotation;
        if (typ?.type === 'Identifier') {
          const h = herkunft(typ, besucht, wertbeweis);
          if (h) return h;
        }
        if (typ?.type === 'TSQualifiedName') {
          const basis = herkunft(typ.left, besucht, wertbeweis);
          if (basis) return { pfad: basis.pfad, name: typ.right.name };
        }
        if (
          typ?.type === 'TSImportType' &&
          typ.source?.type === 'Literal' &&
          typ.qualifier?.type === 'Identifier'
        ) {
          const pfad = modul(typ.source.value);
          if (pfad) return { pfad, name: typ.qualifier.name };
        }
        const deklaration = konstante(node);
        if (!deklaration) return undefined;
        if (deklaration.id.type === 'Identifier')
          return herkunft(deklaration.init, besucht, wertbeweis);
        if (deklaration.id.type === 'ObjectPattern') {
          const prop = deklaration.id.properties.find(
            (p) => p.type === 'Property' && p.value === def.name,
          );
          const basis = herkunft(deklaration.init, besucht, wertbeweis);
          if (prop && basis && ['*', 'default'].includes(basis.name))
            return { pfad: basis.pfad, name: schluessel(prop) };
        }
      }
      if (node.type === 'MemberExpression' || node.type === 'JSXMemberExpression') {
        const basis = herkunft(node.object, besucht, wertbeweis);
        if (basis) {
          return {
            pfad: basis.pfad,
            name:
              (['*', 'default'].includes(basis.name) ? '' : `${basis.name}.`) +
              (node.type === 'JSXMemberExpression' ? node.property.name : eigenschaft(node)),
          };
        }
      }
      if (node.type === 'CallExpression') {
        const basis = herkunft(node.callee, besucht, wertbeweis);
        if (
          basis?.pfad === nativeModule.get('window') &&
          ['getCurrentWindow', 'Window.getByLabel'].includes(basis.name)
        )
          return { pfad: basis.pfad, name: 'Window' };
      }
      if (node.type === 'AwaitExpression') return herkunft(node.argument, besucht, wertbeweis);
      if (node.type === 'ImportExpression' && node.source.type === 'Literal') {
        const pfad = modul(node.source.value);
        if (pfad) return { pfad, name: '*' };
      }
      return undefined;
    }
    function methodenName(node, besucht = new Set()) {
      node = entpacke(node);
      if (!node || besucht.has(node)) return undefined;
      besucht = new Set(besucht).add(node);
      if (node.type === 'MemberExpression') return eigenschaft(node);
      if (node.type === 'Identifier') {
        const importDef = variable(node)?.defs[0];
        if (importDef?.type === 'ImportBinding' && importDef.node.type === 'ImportSpecifier')
          return importDef.node.imported.name ?? importDef.node.imported.value;
        const def = konstante(node);
        if (def?.id.type === 'Identifier') return methodenName(def.init, besucht);
        if (def?.id.type === 'ObjectPattern') {
          const prop = def.id.properties.find(
            (p) => p.type === 'Property' && p.value === variable(node)?.defs[0]?.name,
          );
          return prop && schluessel(prop);
        }
        return node.name;
      }
      return undefined;
    }
    function attributwerte(node, besucht = new Set()) {
      node = entpacke(node);
      if (!node || besucht.has(node)) return undefined;
      besucht = new Set(besucht).add(node);
      const wert = statisch(node);
      if (typeof wert === 'string') return [wert];
      if (node.type !== 'Identifier') return undefined;
      const args = parameterArgumente(node);
      if (!args) return undefined;
      const werte = args.map((a) => attributwerte(a, besucht));
      return werte.every(Boolean) ? werte.flat() : undefined;
    }
    const nichttextBefehle = new Map([
      ['neues_fenster_anfordern', []],
      ['markierungskonflikte_fenster_oeffnen', []],
      ['kommentar_kontext_ablegen', ['label', 'payload']],
      ['verweismarkierung_kontext_ablegen', ['label', 'payload']],
      ['lade_landesrecht_uebersichtsseite', ['dokId']],
      ['lade_landesrecht_dokumentseite', ['url']],
      ...[
        'abfragen',
        'abbrechen',
        'quelle_abschliessen',
        'fehler',
        'teilpruefung_abschliessen',
        'vollbedarf',
        'vollpruefung_abschliessen',
      ].map((a) => [`pruefvorgang_${a}`, ['konfliktToken', 'vorgaenge']]),
    ]);
    function globalerName(node, name) {
      return node?.type === 'Identifier' && node.name === name && !variable(node)?.defs.length;
    }
    function browserWindow(node, besucht = new Set()) {
      node = entpacke(node);
      if (!node || besucht.has(node)) return false;
      if (globalerName(node, 'window')) return true;
      besucht = new Set(besucht).add(node);
      const def = node.type === 'Identifier' && konstante(node);
      return (
        def?.id.type === 'Identifier' &&
        variable(node).references.every((ref) => {
          if (ref.init) return true;
          const p = ref.identifier.parent;
          return (
            p.type === 'MemberExpression' &&
            p.object === ref.identifier &&
            eigenschaft(p) === 'open' &&
            p.parent.type === 'CallExpression' &&
            p.parent.callee === p
          );
        }) &&
        browserWindow(def.init, besucht)
      );
    }
    function lokaleFunktion(node) {
      node = entpacke(node);
      if (node?.type !== 'Identifier') return undefined;
      const def = variable(node)?.defs[0];
      if (def?.type === 'FunctionName')
        return variable(node).references.some((ref) => ref.isWrite()) ? undefined : def.node;
      const init = konstante(node)?.init;
      return ['ArrowFunctionExpression', 'FunctionExpression'].includes(init?.type)
        ? init
        : undefined;
    }
    function rueckgaben(funktion) {
      if (funktion.body.type !== 'BlockStatement') return [funktion.body];
      const result = [];
      function suche(node) {
        if (
          node !== funktion.body &&
          ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(
            node.type,
          )
        )
          return;
        if (node.type === 'ReturnStatement') result.push(node.argument);
        for (const key of quelle.visitorKeys[node.type] ?? []) {
          const value = node[key];
          if (Array.isArray(value)) value.forEach((n) => n && suche(n));
          else if (value?.type) suche(value);
        }
      }
      suche(funktion.body);
      // Fehlende Rückgabe ist kein Elementbeweis. Kleine lokale Builder enden
      // ausdrücklich mit Return; weitere Pfade werden konservativ abgelehnt.
      if (funktion.body.body.at(-1)?.type !== 'ReturnStatement') return [];
      return result;
    }
    function nichttextInvoke(node) {
      // Nur der lokal statische Befehl und seine ausdrücklich bekannten
      // Datenfelder begründen Nichtanzeige; dynamische Befehle benötigen Review.
      const befehl = statisch(node.arguments[0]);
      const werte = typeof befehl === 'string' ? [befehl] : undefined;
      if (!werte?.length || !werte.every((w) => nichttextBefehle.has(w))) return false;
      if (!node.arguments[1]) return true;
      const props = objekt(node.arguments[1]);
      return (
        !!props &&
        props.properties.every(
          (p) =>
            p.type === 'Property' &&
            !p.computed &&
            werte.every((w) => nichttextBefehle.get(w).includes(schluessel(p))),
        )
      );
    }
    function pruefeNative(node) {
      const ursprung = herkunft(node.callee);
      if (
        node.callee.type === 'MemberExpression' &&
        eigenschaft(node.callee) === 'open' &&
        browserWindow(node.callee.object)
      )
        return true;
      let art;
      if (
        ursprung?.pfad === nativeModule.get('dialog') &&
        ['confirm', 'message', 'open', 'save'].includes(ursprung.name)
      )
        art = ursprung.name;
      if (
        ursprung?.pfad === nativeModule.get('menu') &&
        [
          'MenuItem.new',
          'IconMenuItem.new',
          'Submenu.new',
          'Menu.new',
          'PredefinedMenuItem.new',
        ].includes(ursprung.name)
      )
        art = ursprung.name;
      if (ursprung?.pfad === nativeModule.get('window') && ursprung.name === 'Window.setTitle')
        art = ursprung.name;
      if (
        (ursprung?.pfad === nativeModule.get('core') && ursprung.name === 'invoke') ||
        (befehlsDateien.has(ursprung?.pfad) && ursprung.name === 'rufeBefehl')
      ) {
        const wert = herkunft(node.callee, new Set(), true);
        if (!(
          (wert?.pfad === nativeModule.get('core') && wert.name === 'invoke') ||
          (befehlsDateien.has(wert?.pfad) && wert.name === 'rufeBefehl')
        )) {
          context.report({ node, messageId: 'nativ' });
          return true;
        }
        if (nichttextInvoke(node)) return true;
        const befehl = statisch(node.arguments[0]);
        if (
          befehl === undefined ||
          nichttextBefehle.has(befehl) ||
          ['kommentar_fenster_oeffnen', 'verweismarkierung_fenster_oeffnen'].includes(befehl)
        )
          art = 'invoke';
      }
      if (art === 'Menu.new' || art === 'PredefinedMenuItem.new') {
        const text = propAusObjekt(node.arguments[0], 'text');
        const items = propAusObjekt(node.arguments[0], 'items');
        if (!text && items === undefined && objekt(node.arguments[0])) return true;
      }
      if (art) {
        context.report({ node, messageId: 'nativ' });
        return true;
      }
      const name = methodenName(node.callee);
      if (!ursprung && ['confirm', 'message', 'open', 'save', 'invoke'].includes(name)) {
        context.report({ node, messageId: 'nativ' });
        return true;
      }
      if (
        (nativeHelfer.has(name) || nativeHelfer.has(ursprung?.name)) &&
        !(
          herkunft(node.callee, new Set(), true)?.pfad === kanonisch(nativeDatei) &&
          nativeHelfer.has(herkunft(node.callee, new Set(), true)?.name)
        )
      )
        context.report({ node, messageId: 'nativ' });
      return false;
    }
    function pruefeDOM(node) {
      const name = methodenName(node.callee);
      if (
        [
          'appendChild',
          'insertBefore',
          'replaceChild',
          'append',
          'prepend',
          'replaceChildren',
        ].includes(name) &&
        node.arguments.length
      )
        context.report({ node, messageId: 'dom' });
      else if (name === 'setAttribute' || name === 'setAttributeNS') {
        const namen = attributwerte(node.arguments[name === 'setAttributeNS' ? 1 : 0]);
        if (!namen || namen.some((n) => attribute.has(n)))
          context.report({ node, messageId: 'dom' });
      } else if (domMethoden.has(name)) context.report({ node, messageId: 'dom' });
    }
    function istReact(node, name) {
      const ursprung = herkunft(node);
      return ursprung?.name === name && ursprung.pfad === reactDeklaration;
    }
    function anzeigeArt(node) {
      const ursprung = herkunft(node, new Set(), true);
      if (ursprung?.pfad !== kanonisch(oeffentlicheAnzeige)) return undefined;
      return ['TextAnzeige', 'TextAttributElement'].includes(ursprung.name)
        ? ursprung.name
        : undefined;
    }
    function statisch(node, besucht = new Set()) {
      node = entpacke(node);
      if (!node || besucht.has(node)) return undefined;
      if (node.type === 'Literal') return node.value;
      if (node.type === 'Identifier') {
        const def = konstante(node);
        if (def?.id.type === 'Identifier') return statisch(def.init, new Set(besucht).add(node));
      }
      return undefined;
    }
    function typVonVariable(node) {
      const def = variable(node)?.defs[0];
      if (!def) return undefined;
      if (def.name.typeAnnotation) return def.name.typeAnnotation.typeAnnotation;
      const prop = def.name.parent;
      const muster = prop?.parent;
      if (prop?.type === 'Property' && muster?.type === 'ObjectPattern') {
        let typ = muster.typeAnnotation?.typeAnnotation;
        // Lokale, abgeschlossene Propsdeklarationen enthalten denselben
        // Elementvertrag wie ein Inline-Typ. Herkunft von ReactElement
        // wird anschließend wie bisher am tatsächlichen Import geprüft.
        const besucht = new Set();
        while (typ?.type === 'TSTypeReference' && !besucht.has(typ)) {
          besucht.add(typ);
          const deklaration = variable(typ.typeName)?.defs[0]?.node;
          if (deklaration?.type === 'TSTypeAliasDeclaration') typ = deklaration.typeAnnotation;
          else if (
            deklaration?.type === 'TSInterfaceDeclaration' &&
            !deklaration.extends.length &&
            deklaration.body.body.every((m) => m.type === 'TSPropertySignature')
          )
            typ = { type: 'TSTypeLiteral', members: deklaration.body.body };
          else return undefined;
        }
        if (typ?.type === 'TSIntersectionType') {
          // Ein ausdrücklich deklarierter Elementslot im Schnitt bleibt
          // verbindlich; unbekannte geerbte Props werden dadurch nicht freigegeben.
          typ = typ.types.find(
            (t) =>
              t.type === 'TSTypeLiteral' &&
              t.members.some(
                (m) => m.type === 'TSPropertySignature' && schluessel(m) === prop.key.name,
              ),
          );
        }
        if (typ?.type === 'TSTypeLiteral') {
          return typ.members.find(
            (m) => m.type === 'TSPropertySignature' && schluessel(m) === prop.key.name,
          )?.typeAnnotation?.typeAnnotation;
        }
      }
      return undefined;
    }
    function elementTyp(typ) {
      if (!typ) return false;
      if (typ.type === 'TSArrayType') return elementTyp(typ.elementType);
      if (typ.type === 'TSUnionType')
        return typ.types.every(
          (t) =>
            elementTyp(t) ||
            t.type === 'TSNullKeyword' ||
            t.type === 'TSUndefinedKeyword' ||
            t.type === 'TSBooleanKeyword',
        );
      if (typ.type === 'TSTypeReference') {
        if (typ.typeName.type === 'Identifier') return istReact(typ.typeName, 'ReactElement');
        if (typ.typeName.type === 'TSQualifiedName') {
          const basis = herkunft(typ.typeName.left);
          return (
            basis &&
            ['default', '*'].includes(basis.name) &&
            istReact(typ.typeName.left, basis.name) &&
            typ.typeName.right.name === 'ReactElement'
          );
        }
      }
      return false;
    }
    function istBoolean(node) {
      node = entpacke(node);
      return (
        (node?.type === 'Literal' && typeof node.value === 'boolean') ||
        (node?.type === 'UnaryExpression' && node.operator === '!') ||
        (node?.type === 'BinaryExpression' &&
          ['===', '!==', '==', '!=', '<', '>', '<=', '>=', 'in', 'instanceof'].includes(
            node.operator,
          )) ||
        (node?.type === 'Identifier' && typVonVariable(node)?.type === 'TSBooleanKeyword')
      );
    }
    // Importierte Deklarationen werden nur für kleine, konkrete Strukturbeweise
    // gelesen. Ein ReactNode-Typ oder ein frei gewählter Name gibt nichts frei.
    const importAsts = new Map();
    function importAst(h) {
      if (!h || !fs.existsSync(h.pfad)) return undefined;
      if (!importAsts.has(h.pfad))
        importAsts.set(
          h.pfad,
          ts.createSourceFile(
            h.pfad,
            fs.readFileSync(h.pfad, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
          ),
        );
      return importAsts.get(h.pfad);
    }
    // Folgt unbenannten Weitergaben eines Modul-Interfaces (`export { X } from`).
    function importierteDeklaration(h, art, tiefe = 0) {
      const ast = importAst(h);
      const eigen = ast?.statements.find(
        (n) =>
          art(n) &&
          n.name?.text === h.name &&
          n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword),
      );
      if (eigen || !ast || tiefe > 3) return eigen;
      for (const n of ast.statements) {
        if (
          !ts.isExportDeclaration(n) ||
          !n.moduleSpecifier ||
          !n.exportClause ||
          !ts.isNamedExports(n.exportClause) ||
          !n.exportClause.elements.some((e) => !e.propertyName && e.name.text === h.name)
        )
          continue;
        const ziel = ts.resolveModuleName(n.moduleSpecifier.text, h.pfad, compilerOptionen, ts.sys)
          .resolvedModule?.resolvedFileName;
        if (ziel)
          return importierteDeklaration({ pfad: kanonisch(ziel), name: h.name }, art, tiefe + 1);
      }
      return undefined;
    }
    function eigenschaftsTyp(typ, name) {
      if (typ?.type === 'TSTypeReference') {
        const def = variable(typ.typeName)?.defs[0];
        if (def?.node?.type === 'TSInterfaceDeclaration') typ = def.node.body;
        else if (def?.node?.type === 'TSTypeAliasDeclaration') typ = def.node.typeAnnotation;
        else {
          const h = herkunft(typ.typeName);
          const n = importierteDeklaration(h, ts.isInterfaceDeclaration);
          const prop = n?.members.find((m) => ts.isPropertySignature(m) && m.name?.text === name);
          // Nur string/boolean als &&-Bedingung: deren falsche Werte sind
          // unsichtbar (leer/false/undefined), anders als die Zahl 0.
          if (prop?.type?.kind === ts.SyntaxKind.StringKeyword) return { type: 'TSStringKeyword' };
          if (prop?.type?.kind === ts.SyntaxKind.BooleanKeyword)
            return { type: 'TSBooleanKeyword' };
          return undefined;
        }
      }
      const members = typ?.type === 'TSInterfaceBody' ? typ.body : typ?.members;
      return members?.find((m) => m.type === 'TSPropertySignature' && schluessel(m) === name)
        ?.typeAnnotation?.typeAnnotation;
    }
    function bedingungsTyp(node) {
      node = entpacke(node);
      if (node?.type === 'Identifier') return typVonVariable(node);
      if (node?.type === 'MemberExpression')
        return eigenschaftsTyp(bedingungsTyp(node.object), eigenschaft(node));
      return undefined;
    }
    function unsichtbarFalsch(node) {
      node = entpacke(node);
      if (node?.type === 'LogicalExpression')
        return unsichtbarFalsch(node.left) && unsichtbarFalsch(node.right);
      if (node?.type === 'ConditionalExpression')
        return unsichtbarFalsch(node.consequent) && unsichtbarFalsch(node.alternate);
      const typ = bedingungsTyp(node);
      function sicher(t) {
        return (
          !!t &&
          (['TSStringKeyword', 'TSBooleanKeyword', 'TSUndefinedKeyword', 'TSNullKeyword'].includes(
            t.type,
          ) ||
            (t.type === 'TSUnionType' && t.types.every(sicher)))
        );
      }
      return (
        istBoolean(node) ||
        sicher(typ) ||
        (node?.type === 'Literal' && (typeof node.value === 'string' || node.value === null))
      );
    }
    function importierteArrayTiefe(h) {
      const ast = importAst(h);
      if (!ast) return 0;
      let deklaration;
      for (const n of ast.statements) {
        if (
          !ts.isVariableStatement(n) ||
          !(n.declarationList.flags & ts.NodeFlags.Const) ||
          !n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        )
          continue;
        deklaration = n.declarationList.declarations.find(
          (d) => ts.isIdentifier(d.name) && d.name.text === h.name,
        );
        if (deklaration) break;
      }
      if (!deklaration) return 0;
      let offen = false;
      function referenzen(n) {
        if (n === deklaration) return;
        if (ts.isIdentifier(n) && n.text === h.name) offen = true;
        ts.forEachChild(n, referenzen);
      }
      referenzen(ast);
      function tiefe(n) {
        if (!n || !ts.isArrayLiteralExpression(n)) return 0;
        if (
          !n.elements.every(
            (e) =>
              ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isArrayLiteralExpression(e),
          )
        )
          return 0;
        return 1 + (n.elements.length ? Math.min(...n.elements.map(tiefe)) : 0);
      }
      return offen ? 0 : tiefe(deklaration.initializer);
    }
    function arrayUnveraendert(node, besucht = new Set(), nurLesen = false) {
      const binding = variable(node);
      if (!binding || besucht.has(binding)) return false;
      besucht = new Set(besucht).add(binding);
      return binding.references.every((ref) => {
        if (ref.init) return true;
        let p = ref.identifier.parent;
        if (
          p.type === 'VariableDeclarator' &&
          p.init === ref.identifier &&
          p.id.type === 'Identifier'
        )
          return !!konstante(p.id) && arrayUnveraendert(p.id, besucht, nurLesen);
        if (p.type === 'CallExpression') {
          const fn = lokaleFunktion(p.callee);
          const index = p.arguments.indexOf(ref.identifier);
          const param = fn?.params[index];
          return !!param && param.type === 'Identifier' && arrayUnveraendert(param, besucht, true);
        }
        let member;
        while (p.type === 'MemberExpression') {
          member = p;
          p = p.parent;
        }
        if (
          ['AssignmentExpression', 'UpdateExpression'].includes(p.type) ||
          (p.type === 'UnaryExpression' && p.operator === 'delete')
        )
          return false;
        if (p.type === 'CallExpression')
          return (
            !!member &&
            p.callee === member &&
            ['map', 'filter', 'slice'].includes(eigenschaft(member))
          );
        // Ein Lesebeweis darf den Parameter weder zurückgeben noch in einem
        // Objekt verstecken. Gelesene einzelne Eigenschaften sind zulässig.
        return !nurLesen || !!member;
      });
    }
    function arrayTiefe(node, besucht = new Set()) {
      node = entpacke(node);
      if (!node || besucht.has(node)) return 0;
      besucht = new Set(besucht).add(node);
      if (node.type === 'ArrayExpression')
        return (
          1 +
          (node.elements.length ? Math.min(...node.elements.map((e) => arrayTiefe(e, besucht))) : 0)
        );
      if (node.type !== 'Identifier' || !arrayUnveraendert(node)) return 0;
      const typ = typVonVariable(node);
      function typTiefe(t) {
        if (t?.type === 'TSTypeOperator' && t.operator === 'readonly')
          return typTiefe(t.typeAnnotation);
        return t?.type === 'TSArrayType' ? 1 + typTiefe(t.elementType) : 0;
      }
      if (typTiefe(typ)) return typTiefe(typ);
      const def = konstante(node);
      if (def?.id.type === 'Identifier') return arrayTiefe(def.init, besucht);
      const parameter = variable(node)?.defs[0];
      const fn = parameter?.node;
      const call = fn?.parent;
      if (
        parameter?.type === 'Parameter' &&
        fn.params[0] === parameter.name &&
        call?.type === 'CallExpression' &&
        call.callee.type === 'MemberExpression' &&
        eigenschaft(call.callee) === 'map'
      )
        return Math.max(0, arrayTiefe(call.callee.object, besucht) - 1);
      if (parameter?.type === 'ImportBinding') return importierteArrayTiefe(herkunft(node));
      return 0;
    }
    function istArray(node, besucht = new Set()) {
      return arrayTiefe(node, besucht) > 0;
    }
    function reineRueckgabe(callback, besucht) {
      if (
        !['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(
          callback?.type,
        ) ||
        callback.async ||
        callback.generator ||
        besucht.has(callback)
      )
        return false;
      besucht = new Set(besucht).add(callback);
      const returns = rueckgaben(callback);
      return returns.length > 0 && returns.every((r) => element(r, besucht));
    }
    function element(node, besucht = new Set()) {
      node = entpacke(node);
      if (!node || besucht.has(node)) return false;
      besucht = new Set(besucht).add(node);
      if (['JSXElement', 'JSXFragment'].includes(node.type)) return true;
      if (node.type === 'Literal')
        return (
          node.value === null ||
          typeof node.value === 'boolean' ||
          (typeof node.value === 'string' &&
            (node.value.trim() === '' || symbole.has(node.value.trim())))
        );
      if (node.type === 'Identifier') {
        const binding = variable(node);
        if (node.name === 'undefined' && !binding?.defs.length) return true;
        if (typVonVariable(node)?.type === 'TSBooleanKeyword') return true;
        if (
          elementTyp(typVonVariable(node)) &&
          (typVonVariable(node)?.type !== 'TSArrayType' || unveraendert(node)) &&
          !binding.references.some((r) => r.isWrite() && !r.init)
        )
          return true;
        const def = konstante(node);
        return def?.id.type === 'Identifier' && unveraendert(node) && element(def.init, besucht);
      }
      if (node.type === 'ArrayExpression')
        return node.elements.every((e) => e && element(e, besucht));
      if (node.type === 'ConditionalExpression')
        return element(node.consequent, besucht) && element(node.alternate, besucht);
      if (node.type === 'LogicalExpression') {
        if (node.operator === '&&')
          return unsichtbarFalsch(node.left) && element(node.right, besucht);
        return element(node.left, besucht) && element(node.right, besucht);
      }
      if (node.type === 'CallExpression') {
        if (istReact(node.callee, 'createElement')) return true; // CallExpression-Visitor kontrolliert sein Blatt.
        const fn = lokaleFunktion(node.callee);
        if (fn && reineRueckgabe(fn, besucht)) return true;
        return (
          node.callee.type === 'MemberExpression' &&
          eigenschaft(node.callee) === 'map' &&
          istArray(node.callee.object) &&
          node.arguments.length === 1 &&
          reineRueckgabe(node.arguments[0], besucht)
        );
      }
      return false;
    }
    function pruefeText(node) {
      if (!element(node)) context.report({ node, messageId: 'text' });
    }
    function eingabewert(elementName, typ) {
      return (
        elementName === 'textarea' ||
        (elementName === 'input' &&
          (typ === undefined ||
            (typeof typ === 'string' && !['button', 'submit', 'reset'].includes(typ))))
      );
    }
    function pruefeProp(name, wert, traeger, typ, geschuetzt) {
      if (name === 'children') {
        pruefeText(wert);
      } else if (name === 'dangerouslySetInnerHTML')
        context.report({ node: wert, messageId: 'text' });
      else if (attribute.has(name) && !geschuetzt)
        context.report({ node: wert, messageId: 'attribut' });
      else if (
        ['value', 'defaultValue'].includes(name) &&
        (traeger === 'input' || traeger === 'textarea' || (geschuetzt && traeger === undefined)) &&
        !eingabewert(traeger, typ)
      )
        pruefeText(wert);
    }
    function unveraendert(node) {
      const binding = variable(node);
      return binding?.references.every((ref) => {
        if (ref.init) return true;
        let verwendung = ref.identifier.parent;
        if (verwendung.type === 'VariableDeclarator' && verwendung.init === ref.identifier)
          return false;
        if (verwendung.type === 'CallExpression') {
          return (
            istReact(verwendung.callee, 'createElement') &&
            verwendung.arguments[1] === ref.identifier
          );
        }
        while (verwendung.type === 'MemberExpression') verwendung = verwendung.parent;
        if (['AssignmentExpression', 'UpdateExpression'].includes(verwendung.type)) return false;
        if (verwendung.type === 'UnaryExpression' && verwendung.operator === 'delete') return false;
        if (verwendung.type === 'CallExpression') {
          return (
            verwendung.callee.type === 'MemberExpression' &&
            eigenschaft(verwendung.callee) === 'map'
          );
        }
        return true;
      });
    }
    function objekt(node, besucht = new Set()) {
      node = entpacke(node);
      if (!node || besucht.has(node)) return undefined;
      if (node.type === 'ObjectExpression') return node;
      if (node.type === 'Identifier') {
        const def = konstante(node);
        if (def?.id.type === 'Identifier' && unveraendert(node))
          return objekt(def.init, new Set(besucht).add(node));
      }
      return undefined;
    }
    function pruefeObjekt(node, traeger, typ, geschuetzt, besucht = new Set()) {
      if (
        statisch(node) === null ||
        (node?.type === 'Identifier' && node.name === 'undefined' && !variable(node)?.defs.length)
      )
        return;
      // Restprops eines nativen Selects dürfen sichtbare Attribute enthalten:
      // Der Attributweg schützt sie. Die beiden möglichen Textausgaben müssen
      // durch echte Destrukturierung entfernt sein, unabhängig vom Propstyp.
      if (geschuetzt && traeger === 'select' && node?.type === 'Identifier' && unveraendert(node)) {
        const rest = variable(node)?.defs[0]?.name?.parent;
        const muster = rest?.parent;
        if (rest?.type === 'RestElement' && muster?.type === 'ObjectPattern') {
          const entfernt = new Set(
            muster.properties.filter((p) => p.type === 'Property' && !p.computed).map(schluessel),
          );
          if (entfernt.has('children') && entfernt.has('dangerouslySetInnerHTML')) return;
        }
      }
      const props = objekt(node);
      if (!props || besucht.has(props)) {
        context.report({ node, messageId: 'spread' });
        return;
      }
      besucht = new Set(besucht).add(props);
      for (const prop of props.properties) {
        if (prop.type === 'SpreadElement')
          pruefeObjekt(prop.argument, traeger, typ, geschuetzt, besucht);
        else {
          const name = schluessel(prop);
          if (typeof name !== 'string') context.report({ node: prop, messageId: 'spread' });
          else pruefeProp(name, prop.value, traeger, typ, geschuetzt);
        }
      }
    }
    // Ausbreitungen wirken wie normale Props; spätere Werte überschreiben frühere.
    function propAusObjekt(node, name, besucht = new Set()) {
      if (statisch(node) === null) return undefined;
      const props = objekt(node);
      if (!props || besucht.has(props)) return null;
      besucht = new Set(besucht).add(props);
      let wert;
      for (const prop of props.properties) {
        if (prop.type === 'SpreadElement') {
          const ergebnis = propAusObjekt(prop.argument, name, besucht);
          if (ergebnis !== undefined) wert = ergebnis;
        } else if (schluessel(prop) === name) wert = prop.value;
        else if (schluessel(prop) === undefined) wert = null;
      }
      return wert;
    }
    function jsxProp(node, name) {
      let wert;
      for (const attr of node.attributes) {
        if (attr.type === 'JSXSpreadAttribute') {
          const ergebnis = propAusObjekt(attr.argument, name);
          if (ergebnis !== undefined) wert = ergebnis;
        } else if (attr.name.name === name) wert = jsxWert(attr);
      }
      return wert;
    }
    function jsxWert(attr) {
      return attr?.value?.type === 'JSXExpressionContainer' ? attr.value.expression : attr?.value;
    }
    function jsxTraeger(node, art) {
      if (art) {
        const elementProp = jsxProp(node, 'element');
        return elementProp === undefined && art === 'TextAnzeige' ? 'span' : statisch(elementProp);
      }
      return node.name.type === 'JSXIdentifier' ? node.name.name : undefined;
    }
    return {
      JSXText(node) {
        if (node.value.trim() && !symbole.has(node.value.trim()))
          context.report({ node, messageId: 'text' });
      },
      JSXExpressionContainer(node) {
        if (
          ['JSXElement', 'JSXFragment'].includes(node.parent.type) &&
          node.expression.type !== 'JSXEmptyExpression'
        )
          pruefeText(node.expression);
      },
      JSXSpreadChild(node) {
        pruefeText(node.expression);
      },
      JSXOpeningElement(node) {
        const art = anzeigeArt(node.name);
        const traeger = jsxTraeger(node, art);
        const typeProp = jsxProp(node, 'type');
        const typ = typeProp === undefined ? undefined : (statisch(typeProp) ?? null);
        for (const attr of node.attributes) {
          if (attr.type === 'JSXSpreadAttribute')
            pruefeObjekt(attr.argument, traeger, typ, art, new Set());
          else {
            const wert = jsxWert(attr);
            if (wert) pruefeProp(attr.name.name, wert, traeger, typ, !!art);
          }
        }
      },
      AssignmentExpression(node) {
        const links = entpacke(node.left);
        if (links?.type === 'MemberExpression' && domTextfelder.has(eigenschaft(links)))
          context.report({ node, messageId: 'dom' });
      },
      CallExpression(node) {
        if (!istReact(node.callee, 'createElement')) {
          if (!pruefeNative(node)) pruefeDOM(node);
          return;
        }
        const [traegerNode, props, ...kinder] = node.arguments;
        const art = anzeigeArt(traegerNode);
        const propWert = (name) => propAusObjekt(props, name);
        const elementProp = propWert('element');
        const traeger = art
          ? elementProp === undefined && art === 'TextAnzeige'
            ? 'span'
            : statisch(elementProp)
          : statisch(traegerNode);
        const typeProp = propWert('type');
        const typ = typeProp === undefined ? undefined : (statisch(typeProp) ?? null);
        if (props) pruefeObjekt(props, traeger, typ, art, new Set());
        for (const kind of kinder) pruefeText(kind);
      },
    };
  },
};
