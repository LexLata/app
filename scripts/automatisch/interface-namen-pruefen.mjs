#!/usr/bin/env node
// scripts/automatisch/interface-namen-pruefen.mjs
//
// Ein Modul-Interface (`*.index.ts`) nennt nur außen tatsächlich Genutztes.
// Gemeldet wird jeder exportierte Name (Werte und Typen), den außerhalb des
// Modulordners niemand verwendet, sowie jeder außerhalb nur von Tests genutzte
// Name ohne begründeten Eintrag in der Liste der Testzugänge. Als Nutzung zählen Zugriffe aus Dateien
// außerhalb des Modulordners einschließlich Tests und scripts/: statische
// und dynamische Importe, Namespace- und Modulobjekt-Zugriffe (`modul.name`),
// Destrukturierung von `await import(…)` und `import('…').Typ`. Dateien im
// Modulordner, auch Tests, zählen nicht.
//
// Grundlage ist ein einmal erzeugtes TypeScript-Programm aus tsconfig.json
// und den Dateien unter scripts/. Die Prüfung läuft nur in der Vollprüfung
// (npm run vollpruefen:interface-namen), weil sie mehrere Sekunden braucht.
//
// interface-namen-testzugaenge.json nennt je Interface die nur von Tests
// genutzten Namen mit Begründung (Vertrag und Test). Fehler sind ein fehlender
// Eintrag, eine fehlende Begründung und ein überholter Eintrag (Name regulär
// genutzt, ungenutzt oder nicht mehr vorhanden). Für ungenutzte Namen gibt es
// keine Ausnahme.
//
// Aufruf: node scripts/automatisch/interface-namen-pruefen.mjs              (Prüfung)
//         node scripts/automatisch/interface-namen-pruefen.mjs --nur-tests  (Bericht: Namen,
//         die außerhalb des Modulordners nur Tests nutzen; keine Prüfung)
// Geprüft wird das Projekt im Arbeitsverzeichnis. Exit-Code 1 bei Fehlern.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const TESTZUGAENGE_DATEI = 'scripts/automatisch/interface-namen-testzugaenge.json';
const SKRIPT_ENDUNG = /\.(ts|tsx|mts|mjs|js)$/;
const TEST = /\.test\.(ts|tsx)$|^src\/test\//;

function skriptDateien(ordner) {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner, { withFileTypes: true, recursive: true })
    .filter((eintrag) => eintrag.isFile() && SKRIPT_ENDUNG.test(eintrag.name))
    .map((eintrag) => join(eintrag.parentPath, eintrag.name))
    .filter((pfad) => !pfad.split(sep).includes('node_modules'));
}

function erzeugeProgramm(wurzel) {
  const konfigPfad = join(wurzel, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(konfigPfad, ts.sys.readFile);
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  const { options, fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, wurzel);
  return ts.createProgram({
    rootNames: [...fileNames, ...skriptDateien(join(wurzel, 'scripts'))],
    options: { ...options, allowJs: true, checkJs: false, noEmit: true },
  });
}

/**
 * Ermittelt für jedes Interface und jeden exportierten Namen, wie er
 * außerhalb des Modulordners genutzt wird: 'keine', 'nurTests' oder 'genutzt'.
 * @returns {{ interface: string, name: string, nutzung: 'keine'|'nurTests'|'genutzt' }[]}
 */
export function ermittleInterfaceNutzung(wurzel) {
  const programm = erzeugeProgramm(wurzel);
  const pruefer = programm.getTypeChecker();
  // TypeScript nennt Dateien plattformunabhängig mit '/'.
  const wurzelpfad = wurzel.split(sep).join('/').replace(/\/$/, '') + '/';
  const projektpfad = (datei) =>
    datei.startsWith(wurzelpfad) ? datei.slice(wurzelpfad.length) : datei;
  const eigeneDateien = programm
    .getSourceFiles()
    .filter((datei) => !datei.isDeclarationFile && !datei.fileName.includes('/node_modules/'));

  // Je Interface: Modulsymbol, Modulordner, Exportsymbol → Name, Nutzung je Name.
  const interfaces = new Map();
  const exportsymbole = new Map();
  for (const datei of eigeneDateien) {
    if (!datei.fileName.endsWith('.index.ts')) continue;
    const modul = pruefer.getSymbolAtLocation(datei);
    if (!modul) continue;
    const eintrag = {
      pfad: projektpfad(datei.fileName),
      ordner: datei.fileName.slice(0, datei.fileName.lastIndexOf('/') + 1),
      nutzung: new Map(),
    };
    interfaces.set(modul, eintrag);
    for (const symbol of pruefer.getExportsOfModule(modul)) {
      eintrag.nutzung.set(symbol.name, 'keine');
      if (!exportsymbole.has(symbol)) exportsymbole.set(symbol, []);
      exportsymbole.get(symbol).push({ eintrag, name: symbol.name });
    }
  }

  const modulDerDatei = new Map(
    [...interfaces.keys()].map((modul) => [modul.valueDeclaration?.fileName, modul]),
  );
  function interfaceModul(symbol) {
    if (!symbol) return undefined;
    const ziel = symbol.flags & ts.SymbolFlags.Alias ? pruefer.getAliasedSymbol(symbol) : symbol;
    return interfaces.has(ziel) ? ziel : undefined;
  }
  function modulAusSpezifizierer(knoten, quelldatei) {
    if (!ts.isStringLiteralLike(knoten)) return undefined;
    const aufgeloest = ts.resolveModuleName(
      knoten.text,
      quelldatei.fileName,
      programm.getCompilerOptions(),
      ts.sys,
    ).resolvedModule;
    return aufgeloest && modulDerDatei.get(aufgeloest.resolvedFileName);
  }

  for (const quelldatei of eigeneDateien) {
    const istTest = TEST.test(projektpfad(quelldatei.fileName));
    const vermerke = (eintrag, name) => {
      if (quelldatei.fileName.startsWith(eintrag.ordner)) return;
      const bisher = eintrag.nutzung.get(name);
      if (bisher === undefined || bisher === 'genutzt') return;
      eintrag.nutzung.set(name, istTest ? 'nurTests' : 'genutzt');
    };
    const vermerkeImModul = (modul, name) => {
      const eintrag = modul && interfaces.get(modul);
      if (eintrag) vermerke(eintrag, name);
    };

    const besuche = (knoten) => {
      if (ts.isIdentifier(knoten)) {
        // Import- und Exportbindungen folgen der Aliaskette bis zum Interface-Namen.
        let symbol = pruefer.getSymbolAtLocation(knoten);
        const gesehen = new Set();
        while (symbol && !gesehen.has(symbol)) {
          gesehen.add(symbol);
          for (const { eintrag, name } of exportsymbole.get(symbol) ?? []) vermerke(eintrag, name);
          if (!(symbol.flags & ts.SymbolFlags.Alias)) break;
          symbol = pruefer.getImmediateAliasedSymbol(symbol);
        }
      } else if (ts.isPropertyAccessExpression(knoten)) {
        // modul.name auf Namespace-Importen und dynamisch geladenen Modulobjekten.
        const typ = pruefer.getTypeAtLocation(knoten.expression);
        vermerkeImModul(interfaceModul(typ.getSymbol()), knoten.name.text);
      } else if (ts.isQualifiedName(knoten)) {
        vermerkeImModul(
          interfaceModul(pruefer.getSymbolAtLocation(knoten.left)),
          knoten.right.text,
        );
      } else if (ts.isObjectBindingPattern(knoten)) {
        // const { name } = await import('…')
        const modul = interfaceModul(pruefer.getTypeAtLocation(knoten).getSymbol());
        for (const element of knoten.elements) {
          const name = element.propertyName ?? element.name;
          if (ts.isIdentifier(name)) vermerkeImModul(modul, name.text);
        }
      } else if (ts.isImportTypeNode(knoten) && knoten.qualifier) {
        // import('…').Typ
        const argument = knoten.argument;
        const modul =
          ts.isLiteralTypeNode(argument) && modulAusSpezifizierer(argument.literal, quelldatei);
        let links = knoten.qualifier;
        while (ts.isQualifiedName(links)) links = links.left;
        if (modul) vermerkeImModul(modul, links.text);
      }
      ts.forEachChild(knoten, besuche);
    };
    besuche(quelldatei);
  }

  return [...interfaces.values()]
    .flatMap(({ pfad, nutzung }) =>
      [...nutzung].map(([name, art]) => ({ interface: pfad, name, nutzung: art })),
    )
    .sort((a, b) => a.interface.localeCompare(b.interface) || a.name.localeCompare(b.name));
}

/**
 * Liest die Liste der Testzugänge; wirft bei ungültiger Form.
 * Form: { "testzugaenge": [{ "interface": Pfad, "namen": { Name: Begründung } }] }
 */
export function liesTestzugaenge(text) {
  const liste = JSON.parse(text)?.testzugaenge;
  const istNamensobjekt = (namen) =>
    typeof namen === 'object' &&
    namen !== null &&
    !Array.isArray(namen) &&
    Object.values(namen).every((begruendung) => typeof begruendung === 'string');
  if (
    !Array.isArray(liste) ||
    !liste.every((e) => typeof e?.interface === 'string' && istNamensobjekt(e.namen))
  ) {
    throw new Error(
      `${TESTZUGAENGE_DATEI}: erwartet { "testzugaenge": [{ "interface": Pfad, "namen": { Name: Begründung } }] }.`,
    );
  }
  return liste;
}

/**
 * Prüft die Interface-Namen gegen die Liste der Testzugänge: Ungenutzte Namen
 * sind immer Fehler; nur von Tests genutzte Namen brauchen einen Eintrag mit
 * Begründung; Einträge für andere oder fehlende Namen sind überholt.
 */
export function pruefeInterfaceNamen({ nutzung, testzugaenge }) {
  const fehler = [];
  const vorhanden = new Map(nutzung.map((n) => [`${n.interface}\0${n.name}`, n.nutzung]));
  const eingetragen = new Set();
  const gesehen = new Set();
  for (const { interface: pfad, namen } of testzugaenge) {
    if (gesehen.has(pfad)) fehler.push(`${pfad}: steht doppelt in ${TESTZUGAENGE_DATEI}.`);
    gesehen.add(pfad);
    for (const [name, begruendung] of Object.entries(namen)) {
      const art = vorhanden.get(`${pfad}\0${name}`);
      if (art !== 'nurTests') {
        const grund =
          art === undefined
            ? 'wird nicht (mehr) exportiert'
            : art === 'genutzt'
              ? 'wird außerhalb des Modulordners regulär genutzt'
              : 'wird außerhalb des Modulordners nicht genutzt';
        fehler.push(
          `Eintrag überholt: ${pfad}: ${name} ${grund}. Eintrag aus ${TESTZUGAENGE_DATEI} entfernen.`,
        );
        continue;
      }
      eingetragen.add(`${pfad}\0${name}`);
      if (begruendung.trim() === '') {
        fehler.push(
          `${pfad}: ${name} steht ohne Begründung in ${TESTZUGAENGE_DATEI}. Vertrag und Test nennen.`,
        );
      }
    }
  }
  for (const { interface: pfad, name, nutzung: art } of nutzung) {
    if (art === 'keine') {
      fehler.push(
        `${pfad}: ungenutzt: ${name} – außerhalb des Modulordners nirgends verwendet. Export entfernen oder den Namen außen nutzen.`,
      );
    } else if (art === 'nurTests' && !eingetragen.has(`${pfad}\0${name}`)) {
      fehler.push(
        `${pfad}: nur von Tests genutzt: ${name} – ohne Eintrag in ${TESTZUGAENGE_DATEI}. Prüft der Test einen vereinbarten Vertrag, Eintrag mit Begründung samt Test anlegen; sonst Namen aus dem Interface entfernen.`,
      );
    }
  }
  return fehler;
}

function main() {
  const wurzel = process.cwd();
  const nutzung = ermittleInterfaceNutzung(wurzel);
  if (process.argv.slice(2).includes('--nur-tests')) {
    const nurTests = nutzung.filter((n) => n.nutzung === 'nurTests');
    console.log(
      `Interface-Namen, die außerhalb des Modulordners nur Tests nutzen (${nurTests.length}):`,
    );
    for (const { interface: pfad, name } of nurTests) console.log(`  ${pfad}: ${name}`);
    return;
  }
  const testzugaenge = liesTestzugaenge(readFileSync(join(wurzel, TESTZUGAENGE_DATEI), 'utf8'));
  const fehler = pruefeInterfaceNamen({ nutzung, testzugaenge });
  if (fehler.length > 0) {
    for (const meldung of fehler) console.error(`Interface-Namen: ${meldung}`);
    console.error(`\nInterface-Namen: ${fehler.length} Fehler.`);
    process.exitCode = 1;
    return;
  }
  const interfaces = new Set(nutzung.map((n) => n.interface)).size;
  console.log(
    `Interface-Namen: ${nutzung.length} Namen in ${interfaces} Interfaces geprüft, ${testzugaenge.reduce((s, a) => s + Object.keys(a.namen).length, 0)} Testzugänge, keine Verstöße.`,
  );
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (istHauptmodul) main();
