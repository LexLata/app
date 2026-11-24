// VolltextSucheOverlay.helpers.ts
// Reine Volltextsuch-Logik für VolltextSucheOverlay.tsx (kein React) –
// ausgelagert, damit die Komponente auf die Darstellung fokussiert bleibt
// (gleiches Muster wie OeffnenLogik.ts/OeffnenOverlay.tsx im
// selben Ordner).
//
// Suchlogik:
//   - Groß-/Kleinschreibung wird ignoriert.
//   - Fuzzy: Alle Tokens müssen irgendwo in derselben Norm vorkommen
//     (Teilstring-Match, nicht unbedingt zusammenhängend).
//   - Durchsucht: § Bezeichnung, § Titel, alle Absätze/Sätze/Listeneinträge
//     sowie Texte vorangehender Überschriften.

import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
  SatzDarstellung,
  ListenEintragDarstellung,
} from '@/lib/domain/gesetzTypes';

// ---------------------------------------------------------------------------
// Textextraktion
// ---------------------------------------------------------------------------

function extrahiereListenEintragText(eintrag: ListenEintragDarstellung): string {
  const teile: string[] = [eintrag.text];
  if (eintrag.saetze) {
    for (const s of eintrag.saetze) {
      teile.push(extrahiereSatzText(s));
    }
  }
  if (eintrag.fortsetzung) teile.push(eintrag.fortsetzung);
  for (const unter of eintrag.untereintraege) {
    teile.push(extrahiereListenEintragText(unter));
  }
  return teile.join(' ');
}

function extrahiereSatzText(satz: SatzDarstellung): string {
  const teile: string[] = [satz.text];
  for (const eintrag of satz.eintraege) {
    teile.push(extrahiereListenEintragText(eintrag));
  }
  if (satz.fortsetzung) teile.push(satz.fortsetzung);
  return teile.join(' ');
}

function extrahiereNormText(
  norm: Pick<NormDarstellung, 'titel' | 'absaetze' | 'zusatztexte' | 'fussnoten'>,
): string {
  const teile: string[] = [];
  if (norm.titel) teile.push(norm.titel);
  for (const absatz of norm.absaetze) {
    const saetze =
      absatz.unterabsaetze?.flatMap((unterabsatz) => unterabsatz.saetze) ?? absatz.saetze;
    for (const satz of saetze) {
      teile.push(extrahiereSatzText(satz));
    }
  }
  for (const zusatz of norm.zusatztexte ?? []) teile.push(zusatz.text);
  if (norm.fussnoten) teile.push(norm.fussnoten);
  return teile.join(' ');
}

// ---------------------------------------------------------------------------
// Suchindex
// ---------------------------------------------------------------------------

export interface SuchtextEintrag {
  gesetz: Gesetzesreferenz;
  norm: Pick<NormDarstellung, 'xmlId' | 'bezeichnung' | 'titel'>;
  volltext: string;
}

export interface SuchEintrag {
  /** Das Gesetz, dem diese Norm gehört (nötig für Navigation + Anzeige im Alle-Modus). */
  gesetz: GesetzDarstellung;
  norm: NormDarstellung;
  /** Durchsuchbarer Volltext: Norm-Text + vorangehende Überschriftentexte. */
  volltext: string;
}

/** Baut den Suchindex für ein einzelnes Gesetz. */
export function baueSuchIndexFuerGesetz(gesetz: GesetzDarstellung): SuchEintrag[] {
  const eintraege: SuchEintrag[] = [];
  let aktuelleUeberschriften: string[] = [];

  for (const el of gesetz.elemente) {
    if (el.typ === 'ueberschrift') {
      const text = el.data.titel ? `${el.data.bezeichnung} ${el.data.titel}` : el.data.bezeichnung;
      aktuelleUeberschriften.push(text);
      if (el.data.text) aktuelleUeberschriften.push(extrahiereNormText(el.data.text));
    } else {
      const normText = extrahiereNormText(el.data);
      const volltext = [...aktuelleUeberschriften, normText].join(' ');
      eintraege.push({ gesetz, norm: el.data, volltext });
      // Überschriften nur bis zur ersten Norm in ihrem Abschnitt weiterschleppen.
      aktuelleUeberschriften = [];
    }
  }

  return eintraege;
}

// ---------------------------------------------------------------------------
// Suchlogik
// ---------------------------------------------------------------------------

export function tokenisiere(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function normMatchtTokens(volltext: string, tokens: string[]): boolean {
  const lower = volltext.toLowerCase();
  return tokens.every((token) => lower.includes(token));
}

// ---------------------------------------------------------------------------
// Kontextausschnitt mit Highlighting
// ---------------------------------------------------------------------------

export interface KontextSegment {
  text: string;
  hervorgehoben: boolean;
}

// Extrahiert aus extrahiereKontext (Cognitive-Complexity-Reduktion): sammelt
// ALLE Vorkommen ALLER Tokens im (bereits kleingeschriebenen) Snippet als
// [von, bis)-Bereiche, unsortiert und ggf. überlappend – Sortierung/
// Zusammenführung übernimmt verschmelzeUeberlappendeBereiche.
function sammleTokenBereiche(snippetLower: string, tokens: string[]): [number, number][] {
  const bereiche: [number, number][] = [];
  for (const token of tokens) {
    let pos = 0;
    while (pos < snippetLower.length) {
      const idx = snippetLower.indexOf(token, pos);
      if (idx === -1) break;
      bereiche.push([idx, idx + token.length]);
      pos = idx + token.length;
    }
  }
  return bereiche;
}

// Extrahiert aus extrahiereKontext: sortiert die Bereiche nach Start-Position
// und führt überlappende/direkt aneinandergrenzende Bereiche zu einem
// zusammenhängenden Hervorhebungs-Bereich zusammen (z. B. zwei sich
// überschneidende Token-Treffer ergeben EIN <strong>-Segment statt zwei
// verschachtelten).
function verschmelzeUeberlappendeBereiche(bereiche: [number, number][]): [number, number][] {
  const sortiert = [...bereiche].sort((a, b) => a[0] - b[0]);
  const zusammengefasst: [number, number][] = [];
  for (const [von, bis] of sortiert) {
    const letzter =
      zusammengefasst.length > 0 ? zusammengefasst[zusammengefasst.length - 1]! : undefined;
    if (letzter && von <= letzter[1]) {
      letzter[1] = Math.max(letzter[1], bis);
    } else {
      zusammengefasst.push([von, bis]);
    }
  }
  return zusammengefasst;
}

// Extrahiert aus extrahiereKontext: baut aus dem Snippet + den bereits
// zusammengeführten Hervorhebungs-Bereichen die finale Segmentliste,
// inklusive Ellipsen ('…') am Anfang/Ende, falls das Snippet abgeschnitten
// wurde.
function baueKontextSegmente(
  snippet: string,
  start: number,
  ende: number,
  volltextLaenge: number,
  zusammengefasst: [number, number][],
): KontextSegment[] {
  const segmente: KontextSegment[] = [];
  if (start > 0) segmente.push({ text: '…', hervorgehoben: false });

  let cursor = 0;
  for (const [von, bis] of zusammengefasst) {
    if (cursor < von) segmente.push({ text: snippet.slice(cursor, von), hervorgehoben: false });
    segmente.push({ text: snippet.slice(von, bis), hervorgehoben: true });
    cursor = bis;
  }
  if (cursor < snippet.length) segmente.push({ text: snippet.slice(cursor), hervorgehoben: false });
  if (ende < volltextLaenge) segmente.push({ text: '…', hervorgehoben: false });

  return segmente;
}

/**
 * Gibt den Ausschnitt rund um den ersten Treffer als Segmentliste zurück.
 * Im Ausschnitt werden ALLE Vorkommen ALLER Tokens fett hervorgehoben.
 */
export function extrahiereKontext(
  volltext: string,
  tokens: string[],
  fenster = 90,
): KontextSegment[] {
  const lower = volltext.toLowerCase();

  // Frühesten Treffer ermitteln, um das Snippet-Fenster zu zentrieren
  let erstePos = -1;
  let erstesTokenLen = 0;
  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx !== -1 && (erstePos === -1 || idx < erstePos)) {
      erstePos = idx;
      erstesTokenLen = token.length;
    }
  }

  if (erstePos === -1) {
    const snippet = volltext.slice(0, fenster * 2);
    return [{ text: snippet + (volltext.length > fenster * 2 ? '…' : ''), hervorgehoben: false }];
  }

  const start = Math.max(0, erstePos - fenster);
  const ende = Math.min(volltext.length, erstePos + erstesTokenLen + fenster);
  const snippet = volltext.slice(start, ende);
  const snippetLower = lower.slice(start, ende);

  const bereiche = sammleTokenBereiche(snippetLower, tokens);
  const zusammengefasst = verschmelzeUeberlappendeBereiche(bereiche);
  return baueKontextSegmente(snippet, start, ende, volltext.length, zusammengefasst);
}
