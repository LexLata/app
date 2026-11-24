#!/usr/bin/env node
// typzusagen-pruefen.mjs
// Zählt Typzusagen im Syntaxbaum. Die Repository-Baseline begrenzt Produktion je
// Datei und Tests insgesamt; Rückgänge müssen festgehalten werden.
// --aktualisieren senkt ausschließlich, --uebertrage alt neu [neu2 …] verteilt
// vorhandenes Budget bei Verschiebungen. Begründete neue Ausnahmen werden bewusst
// in der Baseline eingetragen; automatische Erhöhungen sind ausgeschlossen.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const BASELINE = 'scripts/automatisch/typzusagen-baseline.json';
const KATEGORIEN = ['nichtNull', 'cast', 'doppelCast'];
const nullwerte = () => ({ nichtNull: 0, cast: 0, doppelCast: 0 });
const istTest = (pfad) => /\.test\.tsx?$/.test(pfad) || pfad.startsWith('src/test/');
const summe = (eintraege) =>
  eintraege.reduce((sum, eintrag) => {
    for (const k of KATEGORIEN) sum[k] += eintrag[k];
    return sum;
  }, nullwerte());
const hatZusagen = (zahlen) => KATEGORIEN.some((k) => zahlen[k] > 0);
const entklammere = (knoten) => {
  while (ts.isParenthesizedExpression(knoten)) knoten = knoten.expression;
  return knoten;
};
const istCast = (knoten) => ts.isAsExpression(knoten) || ts.isTypeAssertionExpression(knoten);
const istConst = (knoten) =>
  ts.isTypeReferenceNode(knoten.type) && knoten.type.typeName.getText() === 'const';

/** Zählt Syntaxknoten; beim Doppel-Cast bleibt die innere Zusicherung ungezählt. */
export function zaehleTypzusagen(pfad, text) {
  const quelle = ts.createSourceFile(
    pfad,
    text,
    ts.ScriptTarget.Latest,
    true,
    pfad.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const zahlen = nullwerte();
  const ausgelassen = new Set();
  function besuche(knoten) {
    if (ts.isNonNullExpression(knoten)) zahlen.nichtNull++;
    if (istCast(knoten) && !istConst(knoten) && !ausgelassen.has(knoten)) {
      const innen = entklammere(knoten.expression);
      if (istCast(innen) && innen.type.kind === ts.SyntaxKind.UnknownKeyword) {
        zahlen.doppelCast++;
        ausgelassen.add(innen);
      } else zahlen.cast++;
    }
    ts.forEachChild(knoten, besuche);
  }
  besuche(quelle);
  return zahlen;
}

function gruppiere(dateien) {
  return {
    produktion: Object.fromEntries(
      dateien.filter((d) => !istTest(d.pfad)).map(({ pfad, ...zahlen }) => [pfad, zahlen]),
    ),
    tests: summe(dateien.filter((d) => istTest(d.pfad))),
  };
}

/** Prüft Form und exakte Obergrenzen; liefert alle Befunde und Fortschrittszahlen. */
export function pruefeTypzusagen(dateien, baseline) {
  const ist = gruppiere(dateien);
  const fehler = [];
  const pruefeWerte = (name, werte) => {
    for (const k of KATEGORIEN)
      if (!Number.isInteger(werte?.[k]) || werte[k] < 0)
        fehler.push(`${name}: ${k} braucht eine nichtnegative ganze Zahl.`);
    if (
      werte &&
      Object.hasOwn(werte, 'begruendung') &&
      (typeof werte.begruendung !== 'string' || werte.begruendung.trim() === '')
    )
      fehler.push(`${name}: konkrete Begründung erforderlich.`);
  };
  pruefeWerte('Tests', baseline.tests);
  for (const [pfad, maximum] of Object.entries(baseline.produktion)) {
    pruefeWerte(pfad, maximum);
    if (!pfad.startsWith('src/') || pfad.includes('\\') || !/\.tsx?$/.test(pfad) || istTest(pfad))
      fehler.push(`${pfad}: ungültiger Produktionspfad; nur / verwenden.`);
    if (!Object.hasOwn(ist.produktion, pfad))
      fehler.push(
        `${pfad}: Datei gelöscht; --uebertrage <alt> <neu> nutzen oder Eintrag entfernen.`,
      );
    else if (!hatZusagen(ist.produktion[pfad]))
      fehler.push(`${pfad}: keine Typzusagen; --aktualisieren entfernt den Eintrag.`);
  }
  function vergleiche(name, zahlen, maximum) {
    for (const k of KATEGORIEN) {
      if (zahlen[k] > maximum[k])
        fehler.push(
          `${name}: ${k} Ist ${zahlen[k]}, Höchstwert ${maximum[k]}; Erhöhung braucht eigenen Eintrag mit konkreter Begründung.`,
        );
      if (zahlen[k] < maximum[k])
        fehler.push(
          `${name}: ${k} Ist ${zahlen[k]}, Höchstwert ${maximum[k]}; --aktualisieren ausführen.`,
        );
    }
  }
  for (const [pfad, zahlen] of Object.entries(ist.produktion)) {
    const maximum = baseline.produktion[pfad];
    if (maximum) vergleiche(pfad, zahlen, maximum);
    else if (hatZusagen(zahlen))
      fehler.push(
        `${pfad}: neue Datei mit Typzusagen; begründeten Eintrag anlegen oder --uebertrage <alt> <neu> nutzen.`,
      );
  }
  vergleiche('Tests', ist.tests, baseline.tests);
  const ausgabe = [
    ['Produktion', summe(Object.values(ist.produktion)), summe(Object.values(baseline.produktion))],
    ['Tests', ist.tests, baseline.tests],
  ]
    .map(
      ([name, zahlen, maximum]) =>
        `${name}: ${KATEGORIEN.map((k) => `${k} ${zahlen[k]} (Differenz ${zahlen[k] - maximum[k]})`).join(', ')}`,
    )
    .join('\n');
  return { fehler, ausgabe };
}

/** Senkt bekannte Werte, fügt niemals Budget hinzu. */
export function aktualisiereBaseline(dateien, baseline) {
  const ist = gruppiere(dateien);
  const neu = structuredClone(baseline);
  for (const [pfad, maximum] of Object.entries(neu.produktion)) {
    if (!ist.produktion[pfad] || !hatZusagen(ist.produktion[pfad])) delete neu.produktion[pfad];
    else for (const k of KATEGORIEN) maximum[k] = Math.min(maximum[k], ist.produktion[pfad][k]);
  }
  for (const k of KATEGORIEN) neu.tests[k] = Math.min(neu.tests[k], ist.tests[k]);
  return neu;
}

/** Überträgt ausschließlich ein vorhandenes Budget auf vorhandene Nachfolger. */
export function uebertrageBaseline(dateien, baseline, alt, nachfolger) {
  const ist = gruppiere(dateien);
  const maximum = baseline.produktion[alt];
  if (
    !maximum ||
    Object.hasOwn(ist.produktion, alt) ||
    !nachfolger.length ||
    new Set(nachfolger).size !== nachfolger.length
  )
    throw new Error('Übertragung braucht einen entfernten Alteintrag und eindeutige Nachfolger.');
  for (const pfad of nachfolger)
    if (!ist.produktion[pfad] || baseline.produktion[pfad])
      throw new Error(`${pfad}: Nachfolger fehlt oder hat bereits eine Baseline.`);
  const gesamt = summe(nachfolger.map((pfad) => ist.produktion[pfad]));
  for (const k of KATEGORIEN)
    if (gesamt[k] > maximum[k])
      throw new Error(
        `${alt}: ${k} der Nachfolger ${gesamt[k]} übersteigt Höchstwert ${maximum[k]}.`,
      );
  const neu = structuredClone(baseline);
  delete neu.produktion[alt];
  for (const pfad of nachfolger)
    if (hatZusagen(ist.produktion[pfad]))
      neu.produktion[pfad] = {
        ...ist.produktion[pfad],
        ...(maximum.begruendung ? { begruendung: maximum.begruendung } : {}),
      };
  return neu;
}

function liesDateien(ordner) {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((eintrag) => {
    const pfad = `${ordner}/${eintrag.name}`;
    if (eintrag.isDirectory()) return liesDateien(pfad);
    return /\.tsx?$/.test(pfad)
      ? [{ pfad, ...zaehleTypzusagen(pfad, readFileSync(pfad, 'utf8')) }]
      : [];
  });
}
function main() {
  process.chdir(fileURLToPath(new URL('../..', import.meta.url)));
  const dateien = liesDateien('src');
  let baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const vorher = structuredClone(baseline);
  const argumente = process.argv.slice(2);
  if (argumente[0] === '--aktualisieren' && argumente.length === 1)
    baseline = aktualisiereBaseline(dateien, baseline);
  else if (argumente[0] === '--uebertrage' && argumente.length >= 3)
    baseline = uebertrageBaseline(dateien, baseline, argumente[1], argumente.slice(2));
  else if (argumente.length)
    throw new Error(
      'Aufruf: ohne Optionen, --aktualisieren oder --uebertrage <alt> <neu> [<neu2> …]',
    );
  if (JSON.stringify(vorher) !== JSON.stringify(baseline)) {
    writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
    for (const pfad of new Set([
      ...Object.keys(vorher.produktion),
      ...Object.keys(baseline.produktion),
    ]))
      if (JSON.stringify(vorher.produktion[pfad]) !== JSON.stringify(baseline.produktion[pfad]))
        console.log(`Baseline geändert: ${pfad}`);
    if (JSON.stringify(vorher.tests) !== JSON.stringify(baseline.tests))
      console.log('Baseline geändert: Tests');
  }
  const ergebnis = pruefeTypzusagen(dateien, baseline);
  console.log(ergebnis.ausgabe);
  for (const meldung of ergebnis.fehler) console.error(`Typzusagen: ${meldung}`);
  if (ergebnis.fehler.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (fehler) {
    console.error(`Typzusagen: ${fehler.message}`);
    process.exitCode = 1;
  }
}
