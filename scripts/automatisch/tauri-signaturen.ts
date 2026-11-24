// Begrenzter Quelltextleser für Tauri-Verträge; unbekannte Formen sind Befunde.
// Eigene Strukturen werden nach Modul, Befehl und Position zugeordnet, ohne Feldvergleich.
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

type Signatur = {
  modul: string;
  name: string;
  argumente: Record<string, string>;
  ergebnis: string;
};
type Struktur = {
  modul: string;
  befehl: string;
  position: string;
  rust: string;
  typescript: string;
};

// Bewusst gepflegte Vertragszuordnung, keine Aussage über Felder oder Wertebedeutung.
// Gleichnamige Auftrag-/Uebergabe-Typen der Module bleiben getrennt.
const strukturen: Struktur[] = [
  {
    modul: 'fenster/menu_sync.rs',
    befehl: 'menu_normstatus_melden',
    position: 'status',
    rust: 'MenueNormstatus',
    typescript: 'MenueNormstatus',
  },
  ...['startaufgaben_anmelden', 'startaufgaben_lesen', 'startaufgaben_abschliessen'].map(
    (befehl) => ({
      modul: 'commands/startaufgaben.rs',
      befehl,
      position: 'ergebnis',
      rust: 'Auftrag',
      typescript: 'StartaufgabenAuftrag',
    }),
  ),
  {
    modul: 'commands/app_update/update_befehle.rs',
    befehl: 'app_update_zustand',
    position: 'ergebnis',
    rust: 'AppUpdateMeldung',
    typescript: 'AppUpdateMeldung',
  },
  {
    modul: 'commands/app_update/update_befehle.rs',
    befehl: 'app_update_pruefen',
    position: 'anlass',
    rust: 'Anlass',
    typescript: 'AppUpdateAnlass',
  },
  {
    modul: 'commands/app_update/update_befehle.rs',
    befehl: 'app_update_pruefen',
    position: 'ergebnis',
    rust: 'Pruefergebnis',
    typescript: 'AppUpdatePruefergebnis',
  },
  {
    modul: 'commands/app_update/update_befehle.rs',
    befehl: 'app_update_installieren',
    position: 'ergebnis',
    rust: 'Installationsergebnis',
    typescript: 'AppUpdateInstallationsergebnis',
  },
  {
    modul: 'commands/datei_io/dateistempel.rs',
    befehl: 'gesetz_dateistempel_lesen',
    position: 'ergebnis',
    rust: 'Gesetzdatei',
    typescript: 'GesetzdateiStempel',
  },
  {
    modul: 'fenster/ziehvorschau.rs',
    befehl: 'ziehvorschau_oeffnen',
    position: 'aussehen',
    rust: 'Aussehen',
    typescript: 'ZiehvorschauAussehen',
  },
  {
    modul: 'commands/praefixlauf.rs',
    befehl: 'praefixlauf_ausgabe',
    position: 'art',
    rust: 'Ausgabeart',
    typescript: 'Ausgabeart',
  },
  {
    modul: 'commands/praefixlauf/arbeitsdateien.rs',
    befehl: 'praefixlauf_dateistand',
    position: 'ergebnis',
    rust: 'Dateistand',
    typescript: 'Dateistand',
  },
  ...[
    'arbeitsdatei_lesen',
    'arbeitsdatei_schreiben',
    'archiv_lesen',
    'archiv_schreiben',
    'arbeitsdatei_loeschen',
  ].map((name) => ({
    modul: 'commands/praefixlauf/arbeitsdateien.rs',
    befehl: `praefixlauf_${name}`,
    position: 'art',
    rust: 'Dateiart',
    typescript: 'Dateiart',
  })),
  {
    modul: 'commands/datei_io.rs',
    befehl: 'archiviere_beschaedigte_datei',
    position: 'ergebnis',
    rust: 'ArchivierungsErgebnis',
    typescript: 'ArchivErgebnis',
  },
  ...[
    'abfragen',
    'abbrechen',
    'quelle_abschliessen',
    'fehler',
    'teilpruefung_abschliessen',
    'vollbedarf',
    'vollpruefung_abschliessen',
  ].map((name) => ({
    modul: 'commands/datei_sperre/befehle.rs',
    befehl: `pruefvorgang_${name}`,
    position: 'ergebnis',
    rust: 'VorgangsStand',
    typescript: 'VorgangsStand',
  })),
  {
    modul: 'fenster/hauptfenster.rs',
    befehl: 'fenster_oeffnen_mit_label',
    position: 'geometrie',
    rust: 'FensterGeometrie',
    typescript: 'FensterGeometrie',
  },
  {
    modul: 'fenster.rs',
    befehl: 'fenster_alle_positionen',
    position: 'ergebnis',
    rust: 'FensterPosition',
    typescript: 'FensterPosition',
  },
  {
    modul: 'fenster/erscheinungsbild.rs',
    befehl: 'fenster_farbschema_anwenden',
    position: 'farbschema',
    rust: 'Farbschema',
    typescript: 'Farbschema',
  },
  {
    modul: 'fenster/navigation.rs',
    befehl: 'interne_navigation_senden',
    position: 'auftrag',
    rust: 'Auftrag',
    typescript: 'InternerNavigationsauftrag',
  },
  {
    modul: 'fenster/navigation.rs',
    befehl: 'oeffnen_link_navigation_senden',
    position: 'auftrag',
    rust: 'Auftrag',
    typescript: 'OeffnenLinkZiel',
  },
  ...['bereit', 'lesen'].map((name) => ({
    modul: 'fenster/navigation.rs',
    befehl: `interne_navigation_${name}`,
    position: 'ergebnis',
    rust: 'Uebergabe',
    typescript: 'NavigationsUebergabe',
  })),
  // Gewachsener Hinweisbestand: eigene Typen, ausdrücklich getrennt von Navigation.
  {
    modul: 'fenster/hinweise.rs',
    befehl: 'hauptfenster_hinweis_senden',
    position: 'hinweis',
    rust: 'Hinweis',
    typescript: 'Hinweis',
  },
  {
    modul: 'fenster/hinweise.rs',
    befehl: 'hauptfenster_hinweise_lesen',
    position: 'ergebnis',
    rust: 'Uebergabe',
    typescript: 'HinweisUebergabe',
  },
  {
    modul: 'commands/praefixlauf.rs',
    befehl: 'praefixlauf_auftrag',
    position: 'ergebnis',
    rust: 'Auftrag',
    typescript: 'PraefixlaufAuftrag',
  },
];
const einfacheTypen: Record<string, string> = {
  String: 'string',
  '&str': 'string',
  bool: 'boolean',
  '()': 'void',
  i8: 'number',
  i16: 'number',
  i32: 'number',
  i64: 'number',
  i128: 'number',
  isize: 'number',
  u8: 'number',
  u16: 'number',
  u32: 'number',
  u64: 'number',
  u128: 'number',
  usize: 'number',
  f32: 'number',
  f64: 'number',
};
const kompakt = (text: string) => text.replace(/\s+/g, '');

// Trennt nur außerhalb verschachtelter Generics, Klammern und Objektformen.
function teile(text: string, trenner: string): string[] {
  let tiefe = 0;
  let start = 0;
  const ergebnis: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const zeichen = text[i] ?? '';
    if ('<({['.includes(zeichen)) tiefe++;
    if ('>)}]'.includes(zeichen)) tiefe--;
    if (zeichen === trenner && tiefe === 0) {
      ergebnis.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return [...ergebnis, text.slice(start).trim()].filter(Boolean);
}

function expandiereUebertragungen(quelle: string): string {
  const makro = /macro_rules!\s+uebertragungs_speicher\s*\{([\s\S]*?)\n\}/;
  const vorlage = quelle.match(makro)?.[1];
  if (!vorlage) return quelle;
  return quelle
    .replace(makro, '')
    .replace(/uebertragungs_speicher!\s*\(([\s\S]*?)\);/g, (_, inhalt: string) => {
      const namen = teile(inhalt, ',');
      if (namen.length !== 3) throw new Error('Unbekannte uebertragungs_speicher!-Form');
      // Die Signaturen werden aus dem tatsächlichen Makrokörper gelesen.
      return vorlage.replace(/\$(struct_name|ablegen_fn|abholen_fn)/g, (_, name: string) => {
        const index = ['struct_name', 'ablegen_fn', 'abholen_fn'].indexOf(name);
        return namen[index] ?? '';
      });
    });
}

function rustArgumente(parametertext: string, modul: string): Record<string, string> {
  const argumente: Record<string, string> = {};
  for (const parameter of teile(parametertext, ',')) {
    const trennung = parameter.indexOf(':');
    if (trennung < 0) throw new Error(`${modul}: unbekannter Parameter ${parameter}`);
    const typ = kompakt(parameter.slice(trennung + 1));
    if (/^(?:tauri::)?(?:AppHandle|Window|WebviewWindow|Webview|State)(?:<|$)/.test(typ)) continue;
    const name = parameter
      .slice(0, trennung)
      .trim()
      .replace(/_([a-z])/g, (_, b: string) => b.toUpperCase());
    argumente[name] = typ;
  }
  return argumente;
}

// Liest alle Rust-Dateien unter `wurzel` rekursiv; Schlüssel ist der relative Pfad
// mit `/` (z. B. `commands/datei_io.rs`), wie ihn `strukturen` als `modul` nennt.
export function leseRustQuellen(wurzel: string): Record<string, string> {
  const dateien = readdirSync(wurzel, { recursive: true, withFileTypes: true })
    .filter((eintrag) => eintrag.isFile() && eintrag.name.endsWith('.rs'))
    .map((eintrag) => join(eintrag.parentPath, eintrag.name))
    .sort();
  return Object.fromEntries(
    dateien.map((pfad) => [
      relative(wurzel, pfad).split(sep).join('/'),
      readFileSync(pfad, 'utf8'),
    ]),
  );
}

function rustSignaturen(dateien: Record<string, string>): Map<string, Signatur> {
  const ergebnis = new Map<string, Signatur>();
  for (const [modul, roh] of Object.entries(dateien)) {
    const quelle = expandiereUebertragungen(roh.replace(/\/\/[^\n]*/g, ''));
    const muster =
      /#\[tauri::command([^\]]*)\]\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)(?:<[^\n]*?>)?\s*\(([^)]*)\)\s*(?:->\s*([^{}]+))?\s*\{/g;
    const treffer = [...quelle.matchAll(muster)];
    if (treffer.length !== [...quelle.matchAll(/#\[tauri::command\b/g)].length)
      throw new Error(`${modul}: nicht unterstützte Befehlssignatur`);
    for (const m of treffer) {
      if (m[1]?.trim()) throw new Error(`${modul}: unbekannte tauri::command-Option ${m[1]}`);
      const name = m[2] ?? '';
      const argumente = rustArgumente(m[3] ?? '', modul);
      const signatur = { modul, name, argumente, ergebnis: kompakt(m[4]?.trim() ?? '()') };
      const alt = ergebnis.get(name);
      const vergleich = (s: Signatur) =>
        JSON.stringify([Object.entries(s.argumente).sort(), s.ergebnis]);
      if (alt && vergleich(alt) !== vergleich(signatur))
        throw new Error(`${name}: abweichende Plattformsignaturen`);
      ergebnis.set(name, signatur);
    }
  }
  return ergebnis;
}

function tsVerzeichnis(quelle: string) {
  const ast = ts.createSourceFile('befehle.ts', quelle, ts.ScriptTarget.Latest, true);
  const aliase = new Map<string, ts.TypeNode>();
  let verzeichnis: ts.InterfaceDeclaration | undefined;
  for (const s of ast.statements) {
    if (ts.isTypeAliasDeclaration(s)) aliase.set(s.name.text, s.type);
    if (ts.isInterfaceDeclaration(s) && s.name.text === 'Befehlsverzeichnis') verzeichnis = s;
  }
  if (!verzeichnis?.members.length) throw new Error('Befehlsverzeichnis fehlt oder ist leer');
  function aufloesen(node: ts.TypeNode, stop?: string, besucht = new Set<string>()): ts.TypeNode {
    if (ts.isParenthesizedTypeNode(node)) return aufloesen(node.type, stop, besucht);
    if (!ts.isTypeReferenceNode(node)) return node;
    const name = node.typeName.getText(ast);
    if (name === stop) return node;
    const alias = aliase.get(name);
    if (!alias) return node;
    if (besucht.has(name)) throw new Error(`Zyklischer Typalias ${name}`);
    return aufloesen(alias, stop, new Set([...besucht, name]));
  }
  function felder(node: ts.TypeNode): ts.PropertySignature[] {
    const typ = aufloesen(node);
    if (ts.isIntersectionTypeNode(typ)) return typ.types.flatMap((t) => felder(t));
    if (ts.isTypeReferenceNode(typ) && kompakt(typ.getText(ast)) === 'Record<string,never>')
      return [];
    if (!ts.isTypeLiteralNode(typ)) throw new Error(`Unbekannte Argumentform ${typ.getText(ast)}`);
    return typ.members.map((m) => {
      if (!ts.isPropertySignature(m) || !m.type) throw new Error('Unbekanntes Verzeichnisfeld');
      return m;
    });
  }
  return { ast, verzeichnis, aufloesen, felder };
}

type TsSeite = ReturnType<typeof tsVerzeichnis>;
type TypPruefung = (
  rustTyp: string,
  node: ts.TypeNode,
  signatur: Signatur,
  position: string,
) => void;

function nullUnionInhalt(typ: ts.TypeNode, ast: ts.SourceFile): ts.TypeNode {
  if (!ts.isUnionTypeNode(typ)) throw new Error('Erwartet T | null');
  const ohneNull = typ.types.filter((t) => t.getText(ast) !== 'null');
  const inhalt = ohneNull[0];
  if (!inhalt || ohneNull.length !== 1 || typ.types.length !== 2)
    throw new Error('Erwartet genau T | null');
  return inhalt;
}

function erzeugeTypPruefung({ ast, aufloesen }: TsSeite): TypPruefung {
  const pruefeTyp: TypPruefung = (rustTyp, node, signatur, position) => {
    const struktur = strukturen.find(
      (s) =>
        s.modul === signatur.modul &&
        s.befehl === signatur.name &&
        s.position === position &&
        s.rust === rustTyp,
    );
    const typ = aufloesen(node, struktur?.typescript);
    const generisch = rustTyp.match(/^(Result|Option|Vec)<(.*)>$/);
    if (generisch) {
      const parameter = teile(generisch[2] ?? '', ',');
      if (parameter.length !== (generisch[1] === 'Result' ? 2 : 1))
        throw new Error(`Unbekannte Generic-Argumente ${rustTyp}`);
      const [innerer, fehler] = parameter;
      if (!innerer) throw new Error(`Leerer Rust-Typ ${rustTyp}`);
      const innererTyp = huellenInhalt(generisch[1] ?? '', fehler, node, typ, ast);
      return pruefeTyp(innerer, innererTyp, signatur, position);
    }
    const erwartet = einfacheTypen[rustTyp] ?? struktur?.typescript;
    if (!erwartet)
      throw new Error(`Nicht zugeordneter Rust-Typ ${signatur.modul}::${rustTyp} (${position})`);
    if (kompakt(typ.getText(ast)) !== erwartet)
      throw new Error(`${rustTyp}: erwartet ${erwartet}, erhalten ${typ.getText(ast)}`);
  };
  return pruefeTyp;
}

function huellenInhalt(
  huelle: string,
  fehler: string | undefined,
  node: ts.TypeNode,
  typ: ts.TypeNode,
  ast: ts.SourceFile,
): ts.TypeNode {
  if (huelle === 'Result') {
    if (fehler !== 'String') throw new Error('Unbekannter Result-Fehlertyp');
    return node;
  }
  if (huelle === 'Vec') {
    if (!ts.isArrayTypeNode(typ)) throw new Error(`Erwartet Liste, erhalten ${typ.getText(ast)}`);
    return typ.elementType;
  }
  return nullUnionInhalt(typ, ast);
}

function pruefeArgument(
  argument: ts.PropertySignature,
  signatur: Signatur,
  seite: TsSeite,
  pruefeTyp: TypPruefung,
): void {
  const position = argument.name.getText(seite.ast);
  const rustTyp = signatur.argumente[position] ?? '';
  const optional = rustTyp.match(/^Option<(.*)>$/)?.[1];
  if (Boolean(argument.questionToken) !== Boolean(optional))
    throw new Error(`${position}: Pflicht/optional weicht ab`);
  if (!argument.type) throw new Error(`${position}: Typ fehlt`);
  const typ = seite.aufloesen(argument.type);
  // Option-Argumente können in Tauri fehlen oder ausdrücklich null sein.
  const inhalt =
    optional && ts.isUnionTypeNode(typ) && typ.types.some((t) => t.getText(seite.ast) === 'null')
      ? nullUnionInhalt(typ, seite.ast)
      : argument.type;
  pruefeTyp(optional ?? rustTyp, inhalt, signatur, position);
}

function pruefeBefehl(
  eintrag: ts.PropertySignature,
  signatur: Signatur,
  seite: TsSeite,
  pruefeTyp: TypPruefung,
): void {
  if (!eintrag.type) throw new Error('Befehlstyp fehlt');
  const vertrag = seite.felder(eintrag.type);
  const argumente = vertrag.find((f) => f.name.getText(seite.ast) === 'argumente')?.type;
  const ergebnis = vertrag.find((f) => f.name.getText(seite.ast) === 'ergebnis')?.type;
  if (!argumente || !ergebnis) throw new Error('Argumente/Ergebnis fehlen');
  const tsArgumente = seite.felder(argumente);
  const namen = tsArgumente.map((f) => f.name.getText(seite.ast));
  if (JSON.stringify([...namen].sort()) !== JSON.stringify(Object.keys(signatur.argumente).sort()))
    throw new Error(
      `Argumentnamen: TS ${namen.join(', ')} / Rust ${Object.keys(signatur.argumente).join(', ')}`,
    );
  for (const argument of tsArgumente) pruefeArgument(argument, signatur, seite, pruefeTyp);
  pruefeTyp(signatur.ergebnis, ergebnis, signatur, 'ergebnis');
}

export function vergleicheSignaturen(quelle: string, dateien: Record<string, string>): string[] {
  const befunde: string[] = [];
  try {
    const rust = rustSignaturen(dateien);
    const seite = tsVerzeichnis(quelle);
    const pruefeTyp = erzeugeTypPruefung(seite);
    for (const eintrag of seite.verzeichnis.members) {
      if (!ts.isPropertySignature(eintrag)) throw new Error('Unbekannter Befehlseintrag');
      const name = eintrag.name.getText(seite.ast);
      try {
        const signatur = rust.get(name);
        if (!signatur) throw new Error('Rust-Signatur fehlt');
        pruefeBefehl(eintrag, signatur, seite, pruefeTyp);
      } catch (fehler) {
        befunde.push(`${name}: ${String(fehler)}`);
      }
    }
  } catch (fehler) {
    befunde.push(String(fehler));
  }
  return befunde;
}
