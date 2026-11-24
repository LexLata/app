// Sichert die vereinbarten Tauri-Rechte, engen Scopes und Weiterleitungsprüfung.
// Grenzen: Nur direkte Aufrufe werden erkannt, keine internen Bibliotheksaufrufe
// (z. B. onCloseRequested → destroy). Ersetzt nicht die manuelle Plattformprüfung.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// null bedeutet: lokaler Helfer, Konstruktor oder eigener Rust-Command ohne ACL.
const moduleTabelle: Record<string, Record<string, string | null>> = {
  '@tauri-apps/api/core': {
    invoke: null,
    isTauri: null,
    // Resource.close nutzt core:resources:allow-close, enthalten in core:default.
    close: 'core:default',
  },
  '@tauri-apps/api/app': { getName: 'core:default', getVersion: 'core:default' },
  '@tauri-apps/api/path': Object.fromEntries(
    ['join', 'localDataDir', 'resolveResource', 'downloadDir', 'dirname'].map((name) => [
      name,
      'core:default',
    ]),
  ),
  '@tauri-apps/api/event': {
    UnlistenFn: null,
    EventCallback: null,
    listen: 'core:default',
    emit: 'core:default',
    emitTo: 'core:default',
  },
  '@tauri-apps/api/menu': { new: 'core:default', popup: 'core:default' },
  '@tauri-apps/api/dpi': {
    LogicalSize: null,
    PhysicalSize: null,
    LogicalPosition: null,
    PhysicalPosition: null,
    toLogical: null,
  },
  '@tauri-apps/api/webview': {
    listen: 'core:default',
    getCurrentWebview: null,
    onDragDropEvent: 'core:default',
  },
  '@tauri-apps/api/window': {
    getCurrentWindow: null,
    preventDefault: null,
    getAllWindows: null,
    ...Object.fromEntries(
      [
        'minimize',
        'toggleMaximize',
        'setFocus',
        'setDecorations',
        'close',
        'destroy',
        'show',
        'hide',
        'center',
        'setSize',
        'setTitle',
        'setPosition',
        'maximize',
        'unmaximize',
        'startDragging',
        'setCursorIcon',
      ].map((name) => [
        name,
        `core:window:allow-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      ]),
    ),
    // Diese Getter gehören laut eingebundener Tauri-Version zu core:window:default,
    // das core:default enthält. Ereignisabonnements laufen über core:event.
    ...Object.fromEntries(
      [
        'currentMonitor',
        'isMaximized',
        'isFullscreen',
        'innerSize',
        'outerSize',
        'scaleFactor',
        'outerPosition',
        'isFocused',
        'onResized',
        'onMoved',
        'onCloseRequested',
        'onDragDropEvent',
      ].map((name) => [name, 'core:default']),
    ),
  },
  '@tauri-apps/plugin-fs': Object.fromEntries(
    ['readFile', 'writeFile', 'writeTextFile', 'readTextFile', 'readDir', 'exists', 'mkdir'].map(
      (name) => [
        name,
        `fs:allow-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      ],
    ),
  ),
  '@tauri-apps/plugin-http': { fetch: 'http:allow-fetch' },
  '@tauri-apps/plugin-dialog': {
    open: 'dialog:default',
    save: 'dialog:default',
    message: 'dialog:default',
    confirm: 'dialog:default',
  },
  '@tauri-apps/plugin-deep-link': { getCurrent: 'deep-link:default' },
  '@tauri-apps/plugin-os': { platform: null },
};

type Permission =
  string | { identifier: string; allow?: Array<{ path?: string; url?: string }>; deny?: unknown[] };
const lesen = (pfad: string) => JSON.parse(readFileSync(resolve(pfad), 'utf8'));
const permissions: Permission[] = lesen('src-tauri/capabilities/default.json').permissions;
const identifier = (permission: Permission) =>
  typeof permission === 'string' ? permission : permission.identifier;
const ids = permissions.map(identifier);
const fsScopes: Record<string, string[]> = {
  'fs:allow-read-text-file': [
    '$LOCALDATA/LexLata/**',
    '$RESOURCE/resources/europa/**',
    '$RESOURCE/resources/importindizes/**',
    '$RESOURCE/resources/praefixstrukturen/de-bund.xml',
    '$RESOURCE/resources/praefixstrukturen/de-bw.xml',
    '$RESOURCE/resources/nichtamtliche-titel/**',
  ],
  'fs:allow-read-dir': [
    '$LOCALDATA/LexLata/**',
    '$RESOURCE/resources/europa',
    '$RESOURCE/resources/europa/**',
    '$RESOURCE/resources/nichtamtliche-titel/**',
  ],
  'fs:allow-exists': [
    '$LOCALDATA/LexLata/**',
    '$RESOURCE/resources/praefixstrukturen/de-bund.xml',
    '$RESOURCE/resources/praefixstrukturen/de-bw.xml',
  ],
  'fs:allow-mkdir': ['$LOCALDATA/LexLata/**'],
};

function importModul(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : undefined;
  }
  if (ts.isImportTypeNode(node)) {
    return ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)
      ? node.argument.literal.text
      : undefined;
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    const argument = node.arguments[0];
    return argument && ts.isStringLiteral(argument) ? argument.text : undefined;
  }
}

function aufrufName(
  node: ts.CallExpression | ts.NewExpression,
  declaration: ts.SignatureDeclaration,
): string {
  if ('name' in declaration && declaration.name && ts.isIdentifier(declaration.name))
    return declaration.name.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  if (ts.isConstructorDeclaration(declaration)) return declaration.parent.name?.text ?? '';
  if (ts.isTypeAliasDeclaration(declaration.parent)) return declaration.parent.name.text;
  return '';
}

function aufrufPermission(
  node: ts.Node,
  checker: ts.TypeChecker,
  hatFensterbezug: boolean,
): string | null | undefined {
  if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) return;
  const declaration = checker.getResolvedSignature(node)?.declaration;
  if (!declaration) return;
  const pfad = declaration.getSourceFile().fileName.replaceAll('\\', '/');
  const match = pfad.match(/node_modules\/(@tauri-apps\/[^/]+)\/(?:dist-js\/)?([^/]+)\.d\.ts$/);
  if (!match) return;
  const modul = match[1] + (match[2] !== 'index' ? `/${match[2]}` : '');
  if (modul === '@tauri-apps/api/window' && !hatFensterbezug) return;
  const name = aufrufName(node, declaration);
  const tabelle = moduleTabelle[modul];
  const hinweis = `${node.getSourceFile().fileName}: Aufruf-/Permission-Tabelle um ${modul}.${name} ergänzen`;
  expect(tabelle, hinweis).toBeDefined();
  expect(Object.hasOwn(tabelle ?? {}, name), hinweis).toBe(true);
  return tabelle?.[name];
}

function direkteAufrufe(): Set<string> {
  const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const genutzt = new Set<string>();
  for (const datei of program.getSourceFiles()) {
    const pfad = datei.fileName.replaceAll('\\', '/');
    if (!pfad.startsWith(resolve('src').replaceAll('\\', '/') + '/') || /\.test\.[^.]+$/.test(pfad))
      continue;
    let hatFensterbezug = false;
    const importePruefen = (node: ts.Node) => {
      const modul = importModul(node);
      if (modul?.startsWith('@tauri-apps/')) {
        expect(
          Object.hasOwn(moduleTabelle, modul),
          `${datei.fileName}: Neues Tauri-Modul ${modul}; bitte die Aufruf-/Permission-Tabelle ergänzen.`,
        ).toBe(true);
      }
      if (modul === '@tauri-apps/api/window' || modul?.match(/\/tauriHelpers(?:\.ts)?$/))
        hatFensterbezug = true;
      ts.forEachChild(node, importePruefen);
    };
    importePruefen(datei);
    const aufrufePruefen = (node: ts.Node) => {
      const permission = aufrufPermission(node, checker, hatFensterbezug);
      if (permission) genutzt.add(permission);
      ts.forEachChild(node, aufrufePruefen);
    };
    aufrufePruefen(datei);
  }
  return genutzt;
}

describe('Tauri-Capability', () => {
  it('verbietet breite und doppelte Rechte und hält die vereinbarten Scopes ein', () => {
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['core:default', 'http:default', 'dialog:default', 'deep-link:default'])
      expect(ids).toContain(id);
    for (const permission of permissions) {
      const id = identifier(permission);
      expect(id).not.toMatch(
        /^fs:allow-app-|^opener:|^(fs:default|fs:scope|os:default|core:event:default)$/,
      );
      if (id === 'fs:allow-write-file' || id === 'fs:allow-write-text-file')
        expect(typeof permission).toBe('string');
      if (fsScopes[id] || id === 'http:allow-fetch')
        expect(typeof permission, `Enger Scope erforderlich: ${id}`).toBe('object');
      if (typeof permission === 'string') continue;
      if (id.startsWith('fs:')) {
        expect(permission.allow, `Vereinbarter fs-Scope: ${id}`).toEqual(
          fsScopes[id]?.map((path) => ({ path })),
        );
        expect(JSON.stringify(permission)).not.toMatch(
          /\$(APPDATA|HOME|DOWNLOAD|DESKTOP|DOCUMENT)/,
        );
      }
      if (id === 'http:allow-fetch') {
        expect(permission.allow?.map(({ url }) => url)).toEqual([
          'https://www.gesetze-im-internet.de/:kuerzel/xml.zip',
          'https://www.gesetze-im-internet.de/Teilliste_*.html',
          'https://www.landesrecht-bw.de/*',
          'https://publications.europa.eu/**',
        ]);
      }
    }
  });

  it('deckt direkte Aufrufe ab und enthält keine ungenutzten expliziten Rechte', () => {
    const genutzt = direkteAufrufe();
    for (const id of genutzt)
      expect(ids, `Permission für direkten Aufruf fehlt: ${id}`).toContain(id);
    const ausnahmen = ['core:default', 'http:default', 'dialog:default', 'deep-link:default'];
    for (const id of ids)
      if (!ausnahmen.includes(id))
        expect(genutzt, `Permission ohne direkten Aufrufer: ${id}`).toContain(id);
  }, 30_000);

  it('prüft auch jedes HTTP-Weiterleitungsziel', () => {
    expect(lesen('src-tauri/tauri.conf.json').plugins?.http?.scopeRedirects).toBe(true);
  });
});
