// Kontrolliert Schutzregel-Unterdrückungen anhand einer unabhängigen Rohprüfung.
// Der Bericht ist ein Prüfergebnis; Gründe werden zusätzlich durch Tests und Review geprüft.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { relative } from 'node:path';
import tseslint from 'typescript-eslint';
import { ESLint } from 'eslint';

const REGEL = 'lexlata/textanzeige-verbindlich';

/** Genau eine tatsächlich unterdrückte Ausgabe je begründeter next-line-Ausnahme. */
export function kontrolliereAusnahmen(code, roh) {
  const ausnahmen = [];
  const fehler = [];
  const beanspruchteZeilen = new Map();
  const { ast } = tseslint.parser.parseForESLint(code, {
    filePath: roh.filePath,
    comment: true,
    loc: true,
    range: true,
    ecmaFeatures: { jsx: true },
  });
  for (const kommentar of ast.comments) {
    const text = kommentar.value.trim();
    const direktive = /^(eslint-(?:disable(?:-next-line|-line)?|enable)|eslint)\b(.*)$/s.exec(text);
    if (!direktive) continue;
    // Standard-ESLint-Syntax: erstes mit Leerraum getrenntes -- (auch ---)
    // beginnt die Begründung; Regelbezeichnungen dürfen in Anführungszeichen stehen.
    const trennung = /\s-{2,}\s/u.exec(direktive[2]);
    const regeln = trennung ? direktive[2].slice(0, trennung.index) : direktive[2];
    const begruendung = trennung
      ? direktive[2].slice(trennung.index + trennung[0].length).trim()
      : '';
    const namen = regeln
      .split(',')
      .map((name) => name.trim().replace(/^(['"]?)(.*)\1$/su, '$2'))
      .filter(Boolean);
    // Keine rule-list: eine globale Unterdrückung würde auch diese Regel treffen.
    if (
      namen.length > 0 &&
      !namen.some((name) => name === REGEL || name.startsWith(`${REGEL} `)) &&
      !(direktive[1] === 'eslint' && regeln.includes(REGEL))
    )
      continue;
    const stelle = `${roh.filePath}:${kommentar.loc.start.line}:${kommentar.loc.start.column + 1}`;
    const fehlerVorher = fehler.length;
    const ausnahme = {
      datei: roh.filePath,
      zeile: kommentar.loc.start.line,
      spalte: kommentar.loc.start.column + 1,
      begruendung,
    };
    ausnahmen.push(ausnahme);
    if (direktive[1] !== 'eslint-disable-next-line') {
      fehler.push(`${stelle}: Schutzregel-Ausnahme nur für die nächste Zeile erlaubt.`);
    }
    if (namen.length !== 1 || namen[0] !== REGEL) {
      fehler.push(`${stelle}: Ausnahme muss ausschließlich die Schutzregel nennen.`);
    }
    if (!/^(Bereits geschützt|Keine Textanzeige|Reines Symbol):\s*\S.+/s.test(begruendung)) {
      fehler.push(`${stelle}: Begründung mit zulässigem Grund und konkreter Stelle fehlt.`);
    }
    const zielzeile = kommentar.loc.end.line + 1;
    if (beanspruchteZeilen.has(zielzeile)) {
      beanspruchteZeilen.get(zielzeile).gueltig = false;
      fehler.push(`${stelle}: Ausgabe wird mehrfach ausgenommen.`);
    }
    beanspruchteZeilen.set(zielzeile, ausnahme);
    const meldungen = roh.messages.filter((m) => m.ruleId === REGEL && m.line === zielzeile);
    if (meldungen.length === 0) fehler.push(`${stelle}: Leere oder veraltete Ausnahme.`);
    ausnahme.zielzeile = zielzeile;
    if (meldungen.length > 1) fehler.push(`${stelle}: Ausnahme verdeckt mehrere Textausgaben.`);
    ausnahme.gueltig = fehler.length === fehlerVorher;
  }
  return {
    ausnahmen,
    fehler: fehler.map((meldung) => `${meldung} Siehe docs/doku/umbruchschutz.md`),
  };
}

/** Dieselbe Produktionsgrenze wie in eslint.config.js; auch absolute Auditpfade möglich. */
export function istProduktionsdatei(pfad) {
  const lokal = relative(process.cwd(), pfad).replaceAll('\\', '/');
  return /^src\/.*\.(ts|tsx)$/.test(lokal) && !/\.test\.|^src\/test\//.test(lokal);
}

/** Unabhängiger Rohbefund aus der regulären Konfiguration, auch bei deaktivierter Regel. */
export async function pruefeAusnahmedateien(dateien) {
  if (dateien.length === 0) return { ausnahmen: [], fehler: [] };
  const eslint = new ESLint({
    overrideConfig: { rules: { [REGEL]: 'error' } },
    allowInlineConfig: false,
  });
  const ergebnisse = await eslint.lintFiles(dateien);
  const ausnahmen = [];
  const fehler = [];
  for (const roh of ergebnisse) {
    if (roh.fatalErrorCount)
      throw new Error(
        `Rohprüfung fehlgeschlagen: ${roh.filePath}. Siehe docs/doku/umbruchschutz.md`,
      );
    const code = await readFile(roh.filePath, 'utf8');
    const kontrolle = kontrolliereAusnahmen(code, roh);
    ausnahmen.push(...kontrolle.ausnahmen);
    fehler.push(...kontrolle.fehler);
  }
  return { ausnahmen, fehler };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const git = (args) =>
      execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
    const dateien = [
      ...new Set([
        ...git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
        ...git(['ls-files', '--others', '--exclude-standard']),
      ]),
    ].filter(istProduktionsdatei);
    const { fehler } = await pruefeAusnahmedateien(dateien);
    for (const meldung of fehler) console.error(meldung);
    process.exitCode = fehler.length > 0 ? 1 : 0;
  } catch (fehler) {
    console.error(fehler, 'Siehe docs/doku/umbruchschutz.md');
    process.exitCode = 2;
  }
}
