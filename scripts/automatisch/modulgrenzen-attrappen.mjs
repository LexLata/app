#!/usr/bin/env node
// scripts/automatisch/modulgrenzen-attrappen.mjs
//
// Modulgrenzen gelten auch für Attrappen. Ein Test darf auf das Innere des
// eigenen Moduls zugreifen, auf ein fremdes Modul nur über dessen Interface
// (<modul>.index.ts). Geprüft werden in Testdateien (src/**/*.test.ts[x]),
// Testhilfen (src/test/**) und allen Skripten unter scripts/** die Ziele von
// vi.mock, vi.doMock, vi.importActual, vi.importMock und dynamischem import(),
// auch bei umbenanntem vi (import { vi as v }) und über vitest.vi. Das Ziel von
// importOriginal in vi.mock(pfad, async (importOriginal) => …) ist der Pfad
// von vi.mock. Ziele ohne festes Zeichenkettenliteral (Variable, Template mit
// Platzhaltern) sind nicht prüfbar und werden selbst gemeldet. Zielpfade werden
// vor der Prüfung normalisiert (z. B. @/lib/../lib/x).
// Gewöhnliche Importe prüft dependency-cruiser (npm run pruefen:modulgrenzen).
//
// Moduldefinitionen und abgestimmte Direktimporte stammen aus
// scripts/automatisch/modulgrenzen.cjs (MODULE, DIREKTIMPORTE); es gibt keine
// eigene Liste. Die Logik entspricht der dortigen Basisregel: Für jedes Modul
// gilt, dass eine Datei außerhalb des Modulordners nur das Interface erreicht,
// es sei denn, die Kante steht in DIREKTIMPORTE. Ein äußeres Modul erreicht ein
// Submodul daher ebenfalls nur über dessen Interface. Dateien außerhalb jedes
// Modulordners sind frei. Ein Moduleintrag mit `attrappeVonAussen` (Grund)
// erlaubt sein Interface als Attrappenziel (vi.mock, vi.doMock, vi.importMock)
// von überall; gewöhnliche Importe, vi.importActual und import() bleiben davon
// unberührt.
//
// Aufruf: node scripts/automatisch/modulgrenzen-attrappen.mjs
//         (Projekt im Arbeitsverzeichnis; Exit-Code 1 bei Funden)

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, posix, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const MODULGRENZEN_DATEI = 'scripts/automatisch/modulgrenzen.cjs';
const VI_AUFRUFE = new Set(['mock', 'doMock', 'importActual', 'importMock']);
const ENDUNGEN = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];

const ATTRAPPEN_ARTEN = new Set(['vi.mock', 'vi.doMock', 'vi.importMock']);

export function istGepruefteDatei(pfad) {
  return (
    /^src\/.*\.test\.tsx?$/.test(pfad) ||
    /^src\/test\/.*\.tsx?$/.test(pfad) ||
    (/^scripts\/.*\.(ts|tsx|mts|js|jsx|mjs|cjs)$/.test(pfad) && !pfad.endsWith('.d.ts'))
  );
}

/** Lokale Namen von vi und vom Namensraum vitest aus den Importen von 'vitest'. */
function vitestNamen(quelle) {
  const vi = new Set(['vi']);
  const namensraeume = new Set();
  for (const anweisung of quelle.statements) {
    if (!ts.isImportDeclaration(anweisung)) continue;
    if (!ts.isStringLiteral(anweisung.moduleSpecifier)) continue;
    if (anweisung.moduleSpecifier.text !== 'vitest') continue;
    const bindungen = anweisung.importClause?.namedBindings;
    if (!bindungen) continue;
    if (ts.isNamespaceImport(bindungen)) namensraeume.add(bindungen.name.text);
    else
      for (const element of bindungen.elements)
        if ((element.propertyName ?? element.name).text === 'vi') vi.add(element.name.text);
  }
  return { vi, namensraeume };
}

/** Liefert den Namen des vi-Aufrufs (mock, doMock, …) oder undefined. */
function viAufruf(aufruf, { vi, namensraeume }) {
  if (!ts.isPropertyAccessExpression(aufruf) || !VI_AUFRUFE.has(aufruf.name.text)) return undefined;
  const ziel = aufruf.expression;
  const istVi =
    (ts.isIdentifier(ziel) && vi.has(ziel.text)) ||
    (ts.isPropertyAccessExpression(ziel) &&
      ziel.name.text === 'vi' &&
      ts.isIdentifier(ziel.expression) &&
      namensraeume.has(ziel.expression.text));
  return istVi ? aufruf.name.text : undefined;
}

const istImportAufruf = (knoten) =>
  knoten && ts.isCallExpression(knoten) && knoten.expression.kind === ts.SyntaxKind.ImportKeyword;

/**
 * Liefert die Attrappen- und dynamischen Importziele eines Quelltexts. Ziele
 * ohne festes Zeichenkettenliteral erscheinen mit `fest: false`; ihr `ziel`
 * ist der Quelltext des Arguments.
 * @returns {{art: string, ziel: string, zeile: number, fest: boolean}[]}
 */
export function findeAttrappenziele(quelltext, dateiname = 'datei.test.ts') {
  const quelle = ts.createSourceFile(dateiname, quelltext, ts.ScriptTarget.Latest, true);
  const namen = vitestNamen(quelle);
  const funde = [];
  const vermerke = (art, knoten, aufrufknoten) => {
    const ort = knoten ?? aufrufknoten;
    const zeile = quelle.getLineAndCharacterOfPosition(ort.getStart()).line + 1;
    if (knoten && ts.isStringLiteralLike(knoten))
      funde.push({ art, ziel: knoten.text, zeile, fest: true });
    else funde.push({ art, ziel: knoten ? knoten.getText() : '', zeile, fest: false });
  };
  const besuche = (knoten) => {
    if (ts.isCallExpression(knoten)) {
      if (istImportAufruf(knoten)) vermerke('import()', knoten.arguments[0], knoten);
      else {
        const name = viAufruf(knoten.expression, namen);
        if (name) {
          const argument = knoten.arguments[0];
          // vi.mock(import('…')) ist eine Attrappe mit dem Ziel des import().
          const ziel = istImportAufruf(argument) ? argument.arguments[0] : argument;
          vermerke(`vi.${name}`, ziel, knoten);
          if (istImportAufruf(argument)) {
            knoten.arguments.slice(1).forEach(besuche);
            return;
          }
        }
      }
    }
    ts.forEachChild(knoten, besuche);
  };
  besuche(quelle);
  return funde;
}

/**
 * Löst einen Spezifizierer wie im Projekt auf (Alias @/, relativ, mit oder
 * ohne Endung, Ordner mit index). Externe Pakete liefern undefined.
 * Nicht vorhandene Ziele bleiben als normalisierter Pfad erhalten.
 */
export function loeseAuf(spezifizierer, von, gibtEs) {
  let basis;
  if (spezifizierer.startsWith('@/')) basis = posix.normalize(`src/${spezifizierer.slice(2)}`);
  else if (spezifizierer.startsWith('.'))
    basis = posix.normalize(posix.join(posix.dirname(von), spezifizierer));
  else return undefined;
  const kandidaten = [
    basis,
    ...ENDUNGEN.map((e) => basis + e),
    ...ENDUNGEN.map((e) => `${basis}/index${e}`),
  ];
  return kandidaten.find(gibtEs) ?? basis;
}

/**
 * Prüft eine Kante von → nach gegen alle Modulgrenzen.
 * @returns {string | undefined} Pfad des verletzten Moduls
 */
export function verletztesModul(von, nach, module, direktimporte, { attrappe = false } = {}) {
  const interfaceVon = (pfad) => `${pfad}/${pfad.split('/').pop()}.index.ts`;
  const freieInterfaces = module
    .filter((m) => m.attrappeVonAussen)
    .map((m) => interfaceVon(m.pfad));
  if (attrappe && freieInterfaces.includes(nach)) return undefined;
  for (const { pfad } of module) {
    if (!nach.startsWith(`${pfad}/`) || von.startsWith(`${pfad}/`)) continue;
    if (nach === interfaceVon(pfad)) continue;
    if (direktimporte.some((d) => d.von === von && d.nach === nach)) continue;
    return pfad;
  }
  return undefined;
}

function dateienUnter(wurzel, ordner) {
  const voll = join(wurzel, ordner);
  if (!existsSync(voll)) return [];
  return readdirSync(voll, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => relative(wurzel, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter((p) => !p.includes('/node_modules/'));
}

/** Alle Funde im Projekt unter wurzel. */
export function pruefeAttrappen(wurzel, { module, direktimporte } = ladeModulgrenzen(wurzel)) {
  const gibtEs = (p) => existsSync(join(wurzel, p)) && statSync(join(wurzel, p)).isFile();
  const funde = [];
  const dateien = [...dateienUnter(wurzel, 'src'), ...dateienUnter(wurzel, 'scripts')];
  for (const datei of dateien.filter(istGepruefteDatei).sort()) {
    for (const f of findeAttrappenziele(readFileSync(join(wurzel, datei), 'utf8'), datei)) {
      if (!f.fest) {
        funde.push({
          datei,
          zeile: f.zeile,
          art: f.art,
          ziel: f.ziel,
          nach: undefined,
          modul: undefined,
        });
        continue;
      }
      const nach = loeseAuf(f.ziel, datei, gibtEs);
      if (!nach) continue;
      const attrappe = ATTRAPPEN_ARTEN.has(f.art);
      const modul = verletztesModul(datei, nach, module, direktimporte, { attrappe });
      if (modul) funde.push({ datei, zeile: f.zeile, art: f.art, ziel: f.ziel, nach, modul });
    }
  }
  return funde;
}

function ladeModulgrenzen(wurzel) {
  const require = createRequire(join(wurzel, 'package.json'));
  const { MODULE, DIREKTIMPORTE } = require(join(wurzel, MODULGRENZEN_DATEI));
  return { module: MODULE, direktimporte: DIREKTIMPORTE };
}

export function formatiereFund(f) {
  if (!f.modul)
    return `${f.datei}:${f.zeile}  ${f.art}(${f.ziel}) hat kein festes Zeichenkettenliteral als Ziel; die Modulgrenze ist so nicht prüfbar`;
  const name = f.modul.split('/').pop();
  return `${f.datei}:${f.zeile}  ${f.art}('${f.ziel}') greift ins Innere von ${f.modul}; erlaubt ist ${f.modul}/${name}.index.ts`;
}

export const ERKLAERUNG = `
Regel: Ein Test darf auf das Innere des eigenen Moduls zugreifen, auf ein
fremdes Modul nur über dessen Interface (<modul>.index.ts). Das gilt wie für
gewöhnliche Importe auch für Ziele von vi.mock, vi.doMock, vi.importActual,
vi.importMock, importOriginal und dynamischem import(). Ziele müssen feste
Zeichenkettenliterale sein. Ein äußeres Modul erreicht ein
Submodul ebenfalls nur über dessen Interface. Module und abgestimmte
Direktimporte stehen in ${MODULGRENZEN_DATEI}.

Zulässige Lösungen:
  1. Das Interface des fremden Moduls als Attrappe ersetzen statt seiner
     inneren Datei.
  2. Das fremde Modul echt laufen lassen und nur externe Abhängigkeiten
     (Dateisystem, Tauri, Uhr, Netz) ersetzen.
  3. Den Test in das fachlich zuständige Modul verschieben, wenn er dessen
     Inneres prüft.
  Ändert eine Umstellung das Geprüfte oder kostet sie Abdeckung, nicht
  anpassen, sondern dem Nutzer melden.

Unzulässig sind Umgehungen: keine Bestandsliste, keine Ausnahme in
DIREKTIMPORTE ohne vorherige Abstimmung mit dem Nutzer, kein Name im
Interface nur für Tests ohne begründeten Testzugang
(interface-namen-testzugaenge.json), kein Umweg über berechnete Pfade.`;

function main() {
  const funde = pruefeAttrappen(process.cwd());
  if (funde.length === 0) {
    console.log('Modulgrenzen für Attrappen: keine Funde.');
    return;
  }
  for (const f of funde) console.error(`Modulgrenzen für Attrappen: ${formatiereFund(f)}`);
  console.error(ERKLAERUNG);
  console.error(`\nModulgrenzen für Attrappen: ${funde.length} Funde.`);
  process.exitCode = 1;
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (istHauptmodul) main();
