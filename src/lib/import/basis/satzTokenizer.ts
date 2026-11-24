// satzTokenizer.ts
// Übersetzung von SatzTokenizer.swift

// Einzelbuchstaben vor einem Punkt werden kontextabhängig beurteilt (siehe
// istEinzelbuchstabenAbkuerzung): Ketten wie "z. B." oder "m. E." sind
// Abkürzungen, einzelne Großbuchstaben gelten als Initiale ("H. Office"),
// außer nach einer Gliederungsbezeichnung ("Anlage B."); einzelne
// Kleinbuchstaben ("Buchstabe d.") beenden den Satz normal.

const ABKUERZUNGEN = new Set([
  'Abs',
  'Art',
  'Nr',
  'Buchst',
  'Ziff',
  'Rn',
  'Hs',
  'ff',
  'f', // "folgende": eigenständige Einzelbuchstaben-Abkürzung
  'Aufl',
  'Bd',
  'Hrsg',
  'hrsg',
  'ebd',
  'vgl',
  'Vgl',
  'ggf',
  'usw',
  'bzw',
  'usf',
  'etc',
  'evtl',
  'insb',
  'mind',
  'max',
  'sog',
  'str',
  'gem',
  'ggue',
  'Dr',
  'Prof',
  'Hr',
  'Fr',
  'iSd',
  'iSv',
  'iVm',
  'idR',
  // Publikationsorgane (Bundesgesetzblatt u. ä.)
  'BGBl',
  'Bundesgesetzbl',
  'RGBl',
  'GBl',
  'GVBl',
  'ABl',
  'BAnz',
  'GAnz',
  'AmtsBl',
  'Reg',
  'Bl',
  'RegBl', // "Reg.-Bl." bzw. "Reg. Bl." (mit Leerzeichen) oder "RegBl." (ohne)
  'Kap', // Kapitel
]);

function letzteWort(text: string): string {
  const lastSpace = text.lastIndexOf(' ');
  if (lastSpace === -1) return text;
  return text.slice(lastSpace + 1);
}

// Bezeichnungen, nach denen ein einzelner Großbuchstabe eine Gliederungs-
// einheit benennt ("Anlage B.") und daher ein echtes Satzende sein kann.
const GLIEDERUNGSBEZEICHNUNGEN = new Set([
  'Anlage',
  'Anhang',
  'Teil',
  'Abschnitt',
  'Unterabschnitt',
  'Kapitel',
  'Titel',
  'Spalte',
  'Zeile',
  'Tabelle',
  'Liste',
  'Muster',
  'Gruppe',
  'Kategorie',
  'Klasse',
  'Stufe',
  'Typ',
  'Buchstabe',
]);

const EINZELBUCHSTABE_AM_ENDE = /(?:^|[^\p{L}\p{N}])(\p{L})$/u;
const KETTE_RUECKWAERTS = /(?:^|[^\p{L}\p{N}])\p{L}\.[ \u00A0]?\p{L}$/u;
const KETTE_VORWAERTS = /^[ \u00A0\n]*\p{L}\./u;

function bereinigeWort(word: string): string {
  return word.replace(/^[^A-Za-zÄÖÜäöüß0-9]+/, '');
}

/**
 * Prüft, ob der Punkt nach einem einzelnen Buchstaben eine Abkürzung beendet.
 * @param vorText  Text bis einschließlich des Buchstabens (ohne den Punkt)
 * @param nachText Text unmittelbar nach dem Punkt (Ausschnitt genügt)
 */
function istEinzelbuchstabenAbkuerzung(vorText: string, nachText: string): boolean {
  const buchstabe = EINZELBUCHSTABE_AM_ENDE.exec(vorText)?.[1];
  if (buchstabe === undefined) return false;
  if (KETTE_RUECKWAERTS.test(vorText) || KETTE_VORWAERTS.test(nachText)) return true;
  if (buchstabe === buchstabe.toLowerCase()) return false;
  const davor = bereinigeWort(letzteWort(vorText.slice(0, -1).trimEnd()));
  return !GLIEDERUNGSBEZEICHNUNGEN.has(davor);
}

function istKeinSatzende(vorText: string, nachText: string): boolean {
  return (
    istAbkuerzungOderZahl(letzteWort(vorText)) || istEinzelbuchstabenAbkuerzung(vorText, nachText)
  );
}

function istAbkuerzungOderZahl(word: string): boolean {
  // Führende Satzzeichen (Klammern etc.) abstreifen, damit z.B. "(BGBl" wie
  // "BGBl" und "(6" wie "6" behandelt wird. Ziffern werden NICHT gestrippt,
  // sonst würde z.B. "(6" durch das Stripping leer und wäre danach über den
  // \d+-Test nicht mehr als Zahl erkennbar (das war der eigentliche Bug).
  const bereinigt = bereinigeWort(word);
  if (ABKUERZUNGEN.has(bereinigt)) return true;
  if (bereinigt.length > 0 && /^\d+$/.test(bereinigt)) return true;
  return false;
}

// Kurzer Textausschnitt ab start – genügt für die Vorwärtsprüfung von
// Einzelbuchstaben-Ketten, ohne den Resttext jedes Mal zu kopieren.
function nachAusschnitt(chars: string[], start: number): string {
  return chars.slice(start, start + 8).join('');
}

// Gross- oder Klammer-Start (für Satzgrenzen-Erkennung)
function istSatzanfang(ch: string): boolean {
  return /[A-ZÄÖÜ(]/.test(ch);
}

// Springt von start ab über Leerzeichen (' ') hinweg zum nächsten Zeichen,
// das kein Leerzeichen ist. Bei erlaubeZeilenumbruch=true wird zusätzlich
// '\n' übersprungen (für die Zeilenumbruch-Behandlung), bei erlaubeNbsp=true
// zusätzlich '\u00A0' (geschütztes Leerzeichen). Beide Flags sind unabhängig
// voneinander und default auf false, um an jeder Aufrufstelle explizit zu
// bleiben.
function naechsteNichtLeerstelle(
  chars: string[],
  start: number,
  erlaubeZeilenumbruch: boolean,
  erlaubeNbsp = false,
): number {
  let i = start;
  while (
    i < chars.length &&
    (chars[i] === ' ' ||
      (erlaubeZeilenumbruch && chars[i] === '\n') ||
      (erlaubeNbsp && chars[i] === '\u00A0'))
  ) {
    i++;
  }
  return i;
}

// Wendet die Zeilenumbruch-Prüfung an und liefert den nächsten (current,
// idx)-Zustand – sowohl für den Trennungs- als auch den Nicht-Trennungsfall,
// damit der Aufrufer keine eigene Verzweigung mehr braucht.
function verarbeiteZeilenumbruch(
  chars: string[],
  idx: number,
  current: string,
  saetze: string[],
): { current: string; idx: number } {
  const split = pruefeZeilenumbruchSplit(chars, idx, current);
  if (!split) {
    return { current: current + '\n', idx: idx + 1 };
  }
  if (split.satz) saetze.push(split.satz);
  return { current: '', idx: split.neuerIdx };
}

// Prüft bei einem Zeilenumbruch, ob der bisherige current-Text (current
// schließt den '\n' selbst noch NICHT ein) eine Satzgrenze bildet: er muss
// mit . ! oder ? enden, das vorherige Wort darf keine Abkürzung/Zahl sein,
// und danach muss (übersprungene Leerzeichen/Zeilenumbrüche) ein
// Satzanfang folgen (oder das Textende erreicht sein). Gibt bei Trennung
// den zu übernehmenden Satz (kann null sein bei leerem vorText) und den
// neuen Schleifenindex zurück, sonst null (= keine Trennung, current += '\n').
function pruefeZeilenumbruchSplit(
  chars: string[],
  idx: number,
  current: string,
): { satz: string | null; neuerIdx: number } | null {
  const vorText = current.trimEnd();
  const letztes = vorText.at(-1);
  const endetMitSatzzeichen = letztes === '.' || letztes === '!' || letztes === '?';
  if (!endetMitSatzzeichen || vorText.length === 0) return null;

  if (istKeinSatzende(vorText.slice(0, -1), nachAusschnitt(chars, idx))) return null;

  const naechsterIdx = naechsteNichtLeerstelle(chars, idx + 1, true);
  if (naechsterIdx < chars.length) {
    if (!istSatzanfang(chars[naechsterIdx]!)) return null;
    return { satz: vorText || null, neuerIdx: naechsterIdx };
  }
  return { satz: vorText || null, neuerIdx: idx + 1 };
}

// Prüft bei einem Satzzeichen-Kandidaten (current schließt das Satzzeichen
// bereits ein), ob es eine echte Satzgrenze ist: siehe pruefeZeilenumbruchSplit
// für die analoge Logik, hier zusätzlich mit dem Erfordernis eines
// Leerzeichens/nbsp unmittelbar nach dem Satzzeichen. Das nachfolgende
// Überspringen von Whitespace lässt hier bewusst auch weitere '\u00A0'
// zu (erlaubeNbsp=true), damit z.B. zwei geschützte Leerzeichen in Folge
// die Trennung nicht verhindern. Gibt bei Trennung den zu übernehmenden
// Satz und den neuen Schleifenindex zurück, sonst null.
function pruefeSatzendeKandidat(
  chars: string[],
  idx: number,
  current: string,
): { satz: string | null; neuerIdx: number } | null {
  const nextIdx = idx + 1;
  if (nextIdx >= chars.length) {
    // Letztes Zeichen im Text
    return { satz: current.trim() || null, neuerIdx: idx + 1 };
  }

  const next = chars[nextIdx];
  if (next !== ' ' && next !== '\u00A0') return null;

  if (istKeinSatzende(current.slice(0, -1), nachAusschnitt(chars, nextIdx))) return null;

  const prueIdx = naechsteNichtLeerstelle(chars, nextIdx + 1, false, true);
  if (prueIdx >= chars.length) {
    // Textende
    return { satz: current.trim() || null, neuerIdx: idx + 1 };
  }
  if (!istSatzanfang(chars[prueIdx]!)) return null;

  return {
    satz: current.trim() || null,
    neuerIdx: naechsteNichtLeerstelle(chars, nextIdx, false, true),
  };
}

/**
 * Tokenisiert einen Text in Sätze.
 * Direkte Übersetzung von SatzTokenizer.tokenize(_:) in Swift.
 *
 * @param aktiv  Bei `false` wird die Satztokenisierung übersprungen und der
 *               (getrimmte) Text unverändert als einziger "Satz" zurückgegeben.
 *               Rein diagnostisches Werkzeug, um beim Import zu sehen, was
 *               vor der Tokenisierung tatsächlich ankommt – nicht für den
 *               Normalbetrieb gedacht.
 */
export function tokenize(text: string, aktiv: boolean = true): string[] {
  const bereinigt = text.trim().replace(/ {2,}/g, ' ');
  if (!bereinigt) return [];

  if (!aktiv) return [bereinigt];

  const saetze: string[] = [];
  let current = '';
  const chars = Array.from(bereinigt); // korrekte Unicode-Behandlung
  let idx = 0;

  while (idx < chars.length) {
    const ch = chars[idx]!;

    // --- Zeilenumbruch ---
    if (ch === '\n') {
      const ergebnis = verarbeiteZeilenumbruch(chars, idx, current, saetze);
      current = ergebnis.current;
      idx = ergebnis.idx;
      continue;
    }

    // --- Normales Zeichen ---
    current += ch;

    // --- Satzende-Kandidat: . ! ? ---
    if (ch === '.' || ch === '!' || ch === '?') {
      const ergebnis = pruefeSatzendeKandidat(chars, idx, current);
      if (ergebnis) {
        if (ergebnis.satz) saetze.push(ergebnis.satz);
        current = '';
        idx = ergebnis.neuerIdx;
        continue;
      }
    }

    idx++;
  }

  const rest = current.trim();
  if (rest) saetze.push(rest);

  return saetze;
}
