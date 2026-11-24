// oklchFallbacksGenerieren.ts
//
// MANUELL aufzurufen (kein automatischer CI-/tsc-Schritt, analog zu
// menuIdsAbgleichen.ts):
//
//   npx tsx scripts/werkzeuge/oklchFallbacksGenerieren.ts
//
// Berechnet die statischen Hex-/rgba()-Werte im
// "@supports not (color: oklch(0% 0 0))"-Fallback-Block in src/index.css neu
// – aus genau denselben OKLCH-Quelldefinitionen, aus denen dieser Block
// ursprünglich von Hand abgeleitet wurde (das manuelle Nachziehen bei
// Änderungen übernimmt jetzt dieses Skript, siehe Kopfkommentar dort).
// Betrifft NUR die zwei Fallback-Blöcke selbst (Hell/Dunkel); die
// oklch()-Definitionen weiter oben in index.css sind die alleinige Quelle
// der Wahrheit und werden hier nur gelesen, nie verändert.
//
// Bewusst KEIN generischer CSS-/var()/calc()-Parser: index.css hat für genau
// die hier relevanten Variablen eine feste, bekannte Struktur (siehe
// FORMELN unten). Ändert sich diese Struktur grundlegend (neue Variablen,
// andere Referenzen), muss dieses Skript entsprechend nachgezogen werden –
// das ist ein bewusster Trade-off (siehe Absprache), keine Generik-Lücke,
// die man "eigentlich" hätte schließen sollen.
//
// Deckt identisch zum bestehenden Fallback-Block NUR "blau" ab (die
// [data-*]-Paletten-Overrides greifen ohne OKLCH-Unterstützung ohnehin nicht,
// siehe Kommentar in index.css).

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { converter, formatHex } from 'culori';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSS_PFAD = join(__dirname, '..', '..', 'src', 'index.css');

const nachRgb = converter('rgb');

/** Wandelt ein OKLCH-Tripel (L in Prozent, C, H in Grad) in einen
 *  #rrggbb-Hex-String um (sRGB, Standard-Gamut-Clipping von culori). */
function oklchZuHex(l: number, c: number, h: number): string {
  const rgb = nachRgb({ mode: 'oklch', l: l / 100, c, h });
  if (!rgb) throw new Error(`OKLCH (${l}% ${c} ${h}) konnte nicht konvertiert werden`);
  return formatHex(rgb);
}

/** Wandelt ein OKLCH-Tripel + Alpha (0–100) in einen rgba(...)-String um,
 *  passend zum bestehenden Format im Fallback-Block (z. B.
 *  "rgba(0, 0, 0, 0.12)"). */
function oklchZuRgba(l: number, c: number, h: number, alphaProzent: number): string {
  const hex = oklchZuHex(l, c, h);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Alpha wie im Original auf 2 Nachkommastellen normalisiert, ohne
  // überflüssige Nullen (0.12 statt 0.1200).
  const alpha = Number((alphaProzent / 100).toFixed(4)).toString();
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------- Globale, themenunabhängige Konstanten (:root oben in index.css) ----------
// Enthält jetzt auch die gemeinsamen Deltas (--delta-*) und Alpha-Werte
// (--trenner-ebene-alpha etc.) – seit der Grauton-/Lightness-Vereinheitlichung
// (Absprache) sind bg-*/text-*/l-strong/l-pale keine Pro-Theme-Literale mehr,
// sondern werden aus den Theme-Ankern (s.u.) + diesen globalen Deltas
// berechnet, genau wie in index.css selbst.

function leseGlobaleZahl(css: string, name: string): number {
  // Nur EINMAL im Dokument erwartet, im allerersten ":root{...}"-Block –
  // als einfache "--name: 12.34;" bzw. "--name: 12.34%;"-Deklaration.
  const treffer = css.match(new RegExp(`--${name}:\\s*([\\d.]+)%?\\s*;`));
  if (!treffer) throw new Error(`Globale Variable --${name} nicht gefunden`);
  return Number(treffer[1]);
}

interface ThemeAnker {
  lBgHaupt: number;
  lTextPrimaer: number;
  lAccent: number;
  rahmenBasis: number;
  lRahmen: number;
  richtungAbstufung: number;
  /** --delta-bg-panel: global 4.18 (Dunkel), in Hell auf 0 überschrieben
   *  (siehe Kommentar in index.css) – daher pro Theme statt global gelesen. */
  deltaBgPanel: number;
  /** Literal im Hell-Block, "var(--bg-haupt)" im Dunkel-Block (siehe
   *  Kommentar in index.css) – hier bereits als fertige Zahl aufgelöst. */
  tastaturHintergrundBg: number;
  hervorhebenKaestchenBg: number;
  strukturkontextleisteSchattenAlpha: number;
}

/** Extrahiert den Inhalt eines ":root[data-farbschema='...']{ ... }"-Blocks
 *  als reinen Text (für die nachfolgenden Einzel-Regexe). */
function leseFarbschemaBlock(css: string, schema: 'hell' | 'dunkel'): string {
  const start = css.indexOf(`:root[data-farbschema='${schema}']`);
  if (start === -1) throw new Error(`Block :root[data-farbschema='${schema}'] nicht gefunden`);
  const klammerStart = css.indexOf('{', start);
  const klammerEnde = css.indexOf('\n}', klammerStart);
  if (klammerStart === -1 || klammerEnde === -1) {
    throw new Error(`Block-Grenzen für data-farbschema='${schema}' nicht gefunden`);
  }
  return css.slice(klammerStart, klammerEnde);
}

function lesePercentVar(block: string, name: string): number {
  const treffer = block.match(new RegExp(`--${name}:\\s*([\\d.-]+)%\\s*;`));
  if (!treffer) throw new Error(`--${name} nicht im Block gefunden`);
  return Number(treffer[1]);
}

function leseZahlVar(block: string, name: string): number {
  const treffer = block.match(new RegExp(`--${name}:\\s*(-?[\\d.]+)\\s*;`));
  if (!treffer) throw new Error(`--${name} nicht im Block gefunden`);
  return Number(treffer[1]);
}

function leseThemeAnker(
  css: string,
  schema: 'hell' | 'dunkel',
  deltaBgPanelGlobal: number,
): ThemeAnker {
  const block = leseFarbschemaBlock(css, schema);

  // --tastatur-hintergrund-bg: Hell hat ein Literal, Dunkel referenziert
  // var(--bg-haupt) – bg-haupt selbst brauchen wir dafür schon aufgelöst,
  // daher lBgHaupt zuerst lesen.
  const lBgHaupt = lesePercentVar(block, 'l-bg-haupt');
  const bgHaupt = lBgHaupt; // --bg-haupt: oklch(var(--l-bg-haupt) 0 0), 1:1

  let tastaturHintergrundBg: number;
  if (/--tastatur-hintergrund-bg:\s*var\(--bg-haupt\)/.test(block)) {
    tastaturHintergrundBg = bgHaupt;
  } else {
    const treffer = block.match(/--tastatur-hintergrund-bg:\s*oklch\(([\d.]+)%\s+0\s+0\s*\)/);
    if (!treffer) throw new Error(`--tastatur-hintergrund-bg nicht auflösbar im Block '${schema}'`);
    tastaturHintergrundBg = Number(treffer[1]);
  }

  // --delta-bg-panel wird nur in Hell lokal überschrieben (0%) – in Dunkel
  // gilt der globale Wert, dort steht im Block keine eigene Deklaration.
  const deltaBgPanelTreffer = block.match(/--delta-bg-panel:\s*([\d.]+)%\s*;/);
  const deltaBgPanel = deltaBgPanelTreffer ? Number(deltaBgPanelTreffer[1]) : deltaBgPanelGlobal;

  const kaestchen = block.match(/--hervorheben-kaestchen-bg:\s*oklch\(([\d.]+)%/);
  if (!kaestchen) throw new Error(`--hervorheben-kaestchen-bg fehlt in '${schema}'`);

  return {
    lBgHaupt,
    lTextPrimaer: lesePercentVar(block, 'l-text-primaer'),
    lAccent: lesePercentVar(block, 'l-accent'),
    rahmenBasis: lesePercentVar(block, 'rahmen-basis'),
    lRahmen: lesePercentVar(block, 'l-rahmen'),
    richtungAbstufung: leseZahlVar(block, 'richtung-abstufung'),
    deltaBgPanel,
    tastaturHintergrundBg,
    hervorhebenKaestchenBg: Number(kaestchen[1]),
    strukturkontextleisteSchattenAlpha: lesePercentVar(
      block,
      'strukturkontextleiste-schatten-alpha',
    ),
  };
}

interface ThemeWerte {
  bgHaupt: number;
  bgLeiste: number;
  bgPanel: number;
  bgEingabe: number;
  hover: number;
  textPrimaer: number;
  textSekundaer: number;
  symbolGedaempft: number;
  rahmenBasis: number;
  lRahmen: number;
  tastaturHintergrundBg: number;
  hervorhebenKaestchenBg: number;
  strukturkontextleisteSchattenAlpha: number;
  lAccent: number;
  lStrong: number;
  lPale: number;
}

/** Wendet dieselben Formeln an wie index.css selbst (siehe dortiger
 *  Kommentar "Aus den Theme-Ankern + globalen Deltas abgeleitet"): Anker
 *  (pro Theme) + globale Deltas + Vorzeichen (--richtung-abstufung) ergeben
 *  die abgeleiteten Grau-/Lightness-Stufen. */
function leiteThemeWerteAb(
  a: ThemeAnker,
  d: {
    deltaBgLeiste: number;
    deltaBgEingabe: number;
    deltaTextSekundaer: number;
    deltaSymbolGedaempft: number;
    deltaLStrong: number;
    deltaLPale: number;
  },
): ThemeWerte {
  const r = a.richtungAbstufung;
  const bgEingabe = a.lBgHaupt + r * d.deltaBgEingabe;
  return {
    bgHaupt: a.lBgHaupt,
    bgLeiste: a.lBgHaupt + r * d.deltaBgLeiste,
    bgPanel: a.lBgHaupt + r * a.deltaBgPanel,
    bgEingabe,
    hover: bgEingabe, // --hover: var(--bg-eingabe)
    textPrimaer: a.lTextPrimaer,
    textSekundaer: a.lTextPrimaer - r * d.deltaTextSekundaer,
    symbolGedaempft: a.lTextPrimaer - r * d.deltaSymbolGedaempft,
    rahmenBasis: a.rahmenBasis,
    lRahmen: a.lRahmen,
    tastaturHintergrundBg: a.tastaturHintergrundBg,
    hervorhebenKaestchenBg: a.hervorhebenKaestchenBg,
    strukturkontextleisteSchattenAlpha: a.strukturkontextleisteSchattenAlpha,
    lAccent: a.lAccent,
    lStrong: a.lAccent + r * d.deltaLStrong,
    lPale: a.lAccent - r * d.deltaLPale,
  };
}

// ---------- Hauptlauf ----------

const css = readFileSync(CSS_PFAD, 'utf-8');

const globaleKonstanten = {
  hRed: leseGlobaleZahl(css, 'h-red'),
  hPurple: leseGlobaleZahl(css, 'h-purple'),
  hBlue: leseGlobaleZahl(css, 'h-blue'),
  cRed: leseGlobaleZahl(css, 'c-red'),
  cPurple: leseGlobaleZahl(css, 'c-purple'),
  cBlue: leseGlobaleZahl(css, 'c-blue'),
  chromaBlassFaktor: leseGlobaleZahl(css, 'chroma-blass-faktor'),
  lButton: leseGlobaleZahl(css, 'l-button'),
  trennerEbeneAlpha: leseGlobaleZahl(css, 'trenner-ebene-alpha'),
};

const deltas = {
  deltaBgLeiste: leseGlobaleZahl(css, 'delta-bg-leiste'),
  deltaBgEingabe: leseGlobaleZahl(css, 'delta-bg-eingabe'),
  deltaTextSekundaer: leseGlobaleZahl(css, 'delta-text-sekundaer'),
  deltaSymbolGedaempft: leseGlobaleZahl(css, 'delta-symbol-gedaempft'),
  deltaLStrong: leseGlobaleZahl(css, 'delta-l-strong'),
  deltaLPale: leseGlobaleZahl(css, 'delta-l-pale'),
};
const deltaBgPanelGlobal = leseGlobaleZahl(css, 'delta-bg-panel');

const ankerHell = leseThemeAnker(css, 'hell', deltaBgPanelGlobal);
const ankerDunkel = leseThemeAnker(css, 'dunkel', deltaBgPanelGlobal);

const hell = leiteThemeWerteAb(ankerHell, deltas);
const dunkel = leiteThemeWerteAb(ankerDunkel, deltas);

/** Berechnet alle Fallback-Werte für ein Theme. Die FORMELN hier bilden 1:1
 *  die Definitionen weiter unten in index.css ab (--akzent, --akzent-blass,
 *  --akzent-warnung, --ueberschrift-rot(-blass), --aktiv-element(-blass),
 *  --aktiv-ueberschrift(-blass), --markierungsfarbe(-blass),
 *  --akzent-einheitlich) – siehe Kopfkommentar zu diesem Skript. */
function berechneFallbackWerte(t: ThemeWerte) {
  const g = globaleKonstanten;
  return {
    bgHaupt: oklchZuHex(t.bgHaupt, 0, 0),
    bgLeiste: oklchZuHex(t.bgLeiste, 0, 0),
    bgPanel: oklchZuHex(t.bgPanel, 0, 0),
    bgEingabe: oklchZuHex(t.bgEingabe, 0, 0),
    hover: oklchZuHex(t.hover, 0, 0),
    textPrimaer: oklchZuHex(t.textPrimaer, 0, 0),
    textSekundaer: oklchZuHex(t.textSekundaer, 0, 0),
    symbolGedaempft: oklchZuHex(t.symbolGedaempft, 0, 0),
    hervorhebenKaestchenBg: oklchZuHex(t.hervorhebenKaestchenBg, 0, 0),
    strukturkontextleisteSchatten: oklchZuRgba(0, 0, 0, t.strukturkontextleisteSchattenAlpha),
    rahmen: oklchZuHex(t.lRahmen, 0, 0),
    trennerEbene: oklchZuRgba(t.rahmenBasis, 0, 0, g.trennerEbeneAlpha),
    tastaturHintergrundBg: oklchZuHex(t.tastaturHintergrundBg, 0, 0),
    akzent: oklchZuHex(t.lAccent, g.cBlue, g.hBlue),
    akzentBlass: oklchZuHex(t.lPale, g.cBlue * g.chromaBlassFaktor, g.hBlue),
    akzentEinheitlich: oklchZuHex(g.lButton, g.cBlue, g.hBlue),
    akzentWarnung: oklchZuHex(t.lStrong, g.cRed, g.hRed),
    ueberschriftRot: oklchZuHex(t.lStrong, g.cRed, g.hRed),
    ueberschriftRotBlass: oklchZuHex(t.lPale, g.cRed * g.chromaBlassFaktor, g.hRed),
    aktivElement: oklchZuHex(t.lAccent, g.cBlue, g.hBlue),
    aktivElementBlass: oklchZuHex(t.lPale, g.cBlue * g.chromaBlassFaktor, g.hBlue),
    aktivUeberschrift: oklchZuHex(t.lAccent, g.cPurple, g.hPurple),
    aktivUeberschriftBlass: oklchZuHex(t.lPale, g.cPurple * g.chromaBlassFaktor, g.hPurple),
    markierungsfarbe: oklchZuHex(t.lAccent, g.cBlue, g.hBlue),
    markierungsfarbeBlass: oklchZuHex(t.lPale, g.cBlue * g.chromaBlassFaktor, g.hBlue),
    // --auswahl-text: oklch(100% 0 0) – fixes Weiß, theme-unabhängig (siehe
    // index.css), daher hier ohne Bezug zu t/g berechnet.
    auswahlText: oklchZuHex(100, 0, 0),
    // --auswahl-text-sekundaer: color-mix(in oklch, var(--auswahl-text) 75%,
    // transparent) – da --auswahl-text fixes Weiß ist, entspricht das einem
    // festen rgba(255,255,255,0.75), unabhängig von Theme/Blau.
    auswahlTextSekundaer: oklchZuRgba(100, 0, 0, 75),
    // --textauswahl-bg: color-mix(in oklch, var(--akzent) 30%, transparent) –
    // --akzent ist hier Blau (t.lAccent/g.cBlue/g.hBlue), analog zu akzent
    // oben, nur mit 30% statt voller Deckkraft.
    textauswahlBg: oklchZuRgba(t.lAccent, g.cBlue, g.hBlue, 30),
    // --hervorheben-bg: color-mix(in oklch, var(--markierungsfarbe) 45%,
    // transparent) – --markierungsfarbe ist hier ebenfalls Blau (identische
    // Formel wie --akzent, s.o.), nur mit 45% statt voller Deckkraft.
    hervorhebenBg: oklchZuRgba(t.lAccent, g.cBlue, g.hBlue, 45),
  };
}

const werteHell = berechneFallbackWerte(hell);
const werteDunkel = berechneFallbackWerte(dunkel);

/** Ersetzt "--name: <alterWert>;" durch "--name: <neuerWert>;" innerhalb
 *  eines Blockausschnitts. Wirft, wenn die Variable dort nicht gefunden
 *  wird (verhindert stilles Nichtstun bei künftigen Strukturänderungen). */
function setzeWert(block: string, name: string, neuerWert: string): string {
  const regex = new RegExp(`(--${name}:\\s*)[^;]+(;)`);
  if (!regex.test(block)) {
    throw new Error(`--${name} nicht im Zielblock gefunden – Skript/CSS nicht mehr synchron?`);
  }
  return block.replace(regex, `$1${neuerWert}$2`);
}

function wendeAlleWerteAn(
  block: string,
  w: ReturnType<typeof berechneFallbackWerte>,
  mitTastatur: boolean,
): string {
  let ergebnis = block;
  ergebnis = setzeWert(ergebnis, 'bg-haupt', w.bgHaupt);
  ergebnis = setzeWert(ergebnis, 'bg-leiste', w.bgLeiste);
  ergebnis = setzeWert(ergebnis, 'bg-panel', w.bgPanel);
  ergebnis = setzeWert(ergebnis, 'bg-eingabe', w.bgEingabe);
  ergebnis = setzeWert(ergebnis, 'hover', w.hover);
  ergebnis = setzeWert(ergebnis, 'text-primaer', w.textPrimaer);
  ergebnis = setzeWert(ergebnis, 'text-sekundaer', w.textSekundaer);
  ergebnis = setzeWert(ergebnis, 'symbol-gedaempft', w.symbolGedaempft);
  ergebnis = setzeWert(ergebnis, 'hervorheben-kaestchen-bg', w.hervorhebenKaestchenBg);
  ergebnis = setzeWert(ergebnis, 'strukturkontextleiste-schatten', w.strukturkontextleisteSchatten);
  ergebnis = setzeWert(ergebnis, 'rahmen', w.rahmen);
  ergebnis = setzeWert(ergebnis, 'trenner-ebene', w.trennerEbene);
  if (mitTastatur) {
    ergebnis = setzeWert(ergebnis, 'tastatur-hintergrund-bg', w.tastaturHintergrundBg);
  }
  ergebnis = setzeWert(ergebnis, 'akzent-warnung', w.akzentWarnung);
  ergebnis = setzeWert(ergebnis, 'akzent-einheitlich', w.akzentEinheitlich);
  ergebnis = setzeWert(ergebnis, 'akzent-blass', w.akzentBlass);
  ergebnis = setzeWert(ergebnis, 'akzent', w.akzent);
  ergebnis = setzeWert(ergebnis, 'ueberschrift-rot-blass', w.ueberschriftRotBlass);
  ergebnis = setzeWert(ergebnis, 'ueberschrift-rot', w.ueberschriftRot);
  ergebnis = setzeWert(ergebnis, 'aktiv-element-blass', w.aktivElementBlass);
  ergebnis = setzeWert(ergebnis, 'aktiv-element', w.aktivElement);
  ergebnis = setzeWert(ergebnis, 'aktiv-ueberschrift-blass', w.aktivUeberschriftBlass);
  ergebnis = setzeWert(ergebnis, 'aktiv-ueberschrift', w.aktivUeberschrift);
  ergebnis = setzeWert(ergebnis, 'markierungsfarbe-blass', w.markierungsfarbeBlass);
  ergebnis = setzeWert(ergebnis, 'markierungsfarbe', w.markierungsfarbe);
  ergebnis = setzeWert(ergebnis, 'auswahl-text-sekundaer', w.auswahlTextSekundaer);
  ergebnis = setzeWert(ergebnis, 'auswahl-text', w.auswahlText);
  ergebnis = setzeWert(ergebnis, 'textauswahl-bg', w.textauswahlBg);
  ergebnis = setzeWert(ergebnis, 'hervorheben-bg', w.hervorhebenBg);
  return ergebnis;
}

// ---------- Fallback-Abschnitt in zwei Blöcken ersetzen ----------
// @supports enthält seit der Media-Query-Bereinigung (data-farbschema wird
// von index.html jetzt IMMER gesetzt, siehe dortiger Kommentar) nur noch die
// zwei :root[data-farbschema=…]-Blöcke, keinen @media-Zweig mehr.

const supportsStart = css.indexOf('@supports not (color: oklch(0% 0 0))');
const supportsEndeSuchStart = css.indexOf('\n}\n\n/* ---------- Reset ---------- */');
if (supportsStart === -1 || supportsEndeSuchStart === -1) {
  throw new Error(
    '@supports-Fallback-Block nicht gefunden – Skript nicht mehr synchron zu index.css?',
  );
}
const supportsEnde = supportsEndeSuchStart + '\n}'.length;

let supportsBlock = css.slice(supportsStart, supportsEnde);

// Die zwei Teilblöcke innerhalb des @supports-Blocks am jeweiligen
// Selektor-Header erkennen und einzeln ersetzen (verhindert, dass ein
// Ersetzungs-Treffer versehentlich den falschen der beiden Blöcke trifft).
function ersetzeTeilblock(
  ganzerBlock: string,
  headerRegex: RegExp,
  werte: ReturnType<typeof berechneFallbackWerte>,
): string {
  const headerTreffer = ganzerBlock.match(headerRegex);
  if (!headerTreffer || headerTreffer.index === undefined) {
    throw new Error(`Teilblock-Header ${headerRegex} nicht gefunden`);
  }
  const klammerStart = ganzerBlock.indexOf('{', headerTreffer.index);
  const klammerEnde = ganzerBlock.indexOf('\n  }', klammerStart);
  if (klammerEnde === -1) {
    throw new Error(`Block-Ende für ${headerRegex} nicht gefunden`);
  }
  const teil = ganzerBlock.slice(klammerStart, klammerEnde);
  const neuerTeil = wendeAlleWerteAn(teil, werte, true); // beide Blöcke enthalten --tastatur-hintergrund-bg
  return ganzerBlock.slice(0, klammerStart) + neuerTeil + ganzerBlock.slice(klammerEnde);
}

supportsBlock = ersetzeTeilblock(supportsBlock, /:root\[data-farbschema='hell'\]\s*{/, werteHell);
supportsBlock = ersetzeTeilblock(
  supportsBlock,
  /:root\[data-farbschema='dunkel'\]\s*{/,
  werteDunkel,
);

const neuesCss = css.slice(0, supportsStart) + supportsBlock + css.slice(supportsEnde);

if (neuesCss === css) {
  console.log('Keine Änderungen – Fallback-Werte sind bereits aktuell.');
} else {
  writeFileSync(CSS_PFAD, neuesCss, 'utf-8');
  console.log(
    'src/index.css aktualisiert: Fallback-Werte neu aus den OKLCH-Definitionen berechnet.',
  );
}
