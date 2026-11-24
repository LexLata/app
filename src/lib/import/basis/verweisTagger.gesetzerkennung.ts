// Ordnet Kurz- und Langtitel in Verweistexten bekannten Gesetzen zu.
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
export interface GesetzesreferenzMitLangtitel extends Gesetzesreferenz {
  kurztitel: string; // z.B. "BGB"
  langtitel: string; // z.B. "Bürgerliches Gesetzbuch"
}

// ---------------------------------------------------------------------------
// Wort normalisieren: Kasus-/Flexionsendungen entfernen
// ---------------------------------------------------------------------------

function normalisiere(wort: string): string {
  const s = wort.toLowerCase();
  // Suffixe absteigend nach Länge prüfen, damit "-em" vor "-e" kommt
  for (const suffix of ['em', 'en', 'er', 'es', 'e', 's']) {
    // Mindestlänge der Basis: 4 Zeichen (verhindert "de" aus "des" usw.)
    if (s.endsWith(suffix) && s.length - suffix.length >= 4) {
      return s.slice(0, s.length - suffix.length);
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// Gesetzesnamen im Anschlusstext erkennen
// ---------------------------------------------------------------------------

// Einleitende Partikel, die häufig vor dem Gesetztitel stehen
const PARTIKEL_RE = /^(?:des|der|die|das|dem|den|vom|im|nach|zum|zur)\s+/i;

// Erste Wörter, die für den Ein-Kandidat-Fallback (Schritt 3 in erkenneLaw)
// zu generisch sind, weil sie in vielen Gesetzestiteln vorkommen und dort
// nichts über das gemeinte Gesetz aussagen (normalisiert, lowercase).
const GENERISCHE_ERSTE_WOERTER = new Set(['gesetz', 'verordnung']);

// Vorberechnete Lookup-Strukturen für erkenneLaw, einmal pro taggeVerweise()-
// Aufruf aus GesetzesreferenzMitLangtitel[] gebaut (siehe baueGesetzLookup). Das vermeidet
// einen linearen Scan über die komplette Gesetzesliste pro einzelnem
// Verweismarkierung-Treffer – bei mehreren tausend Treffern pro Gesetz und
// mehreren tausend Einträgen im Importindex (Bundesrecht) macht das einen
// spürbaren Unterschied.
export interface GesetzLookup {
  referenzen: Map<string, GesetzesreferenzMitLangtitel>;
  // Direkttreffer auf Kurztitel (normalisiert, lowercase) → Original-Kurztitel
  direkt: Map<string, string>;
  // Langtitel-Wortlisten (normalisiert), gebucketet nach erstem Wort, damit
  // pro Verweis nur die Kandidaten mit passendem ersten Wort verglichen
  // werden statt aller Einträge
  langtitelNachErstemWort: Map<string, { woerter: string[]; kurztitel: string }[]>;
}

export function baueGesetzLookup(gesetze: GesetzesreferenzMitLangtitel[]): GesetzLookup {
  const referenzen = new Map<string, GesetzesreferenzMitLangtitel>();
  const direkt = new Map<string, string>();
  const langtitelNachErstemWort = new Map<string, { woerter: string[]; kurztitel: string }[]>();

  for (const g of gesetze) {
    const kurztitelKey = kurztitelVergleichsform(g.kurztitel);
    if (!direkt.has(kurztitelKey)) {
      direkt.set(kurztitelKey, g.kurztitel);
      referenzen.set(kurztitelKey, g);
    }

    const woerter = g.langtitel.split(/\s+/).filter(Boolean).map(normalisiere);
    if (woerter.length === 0) continue;
    const ersterSchluessel = woerter[0]!;
    const eintrag = { woerter, kurztitel: g.kurztitel };
    const bucket = langtitelNachErstemWort.get(ersterSchluessel);
    if (bucket) bucket.push(eintrag);
    else langtitelNachErstemWort.set(ersterSchluessel, [eintrag]);
  }

  return { direkt, langtitelNachErstemWort, referenzen };
}

// Liest bis zu 8 Wörter aus dem (bereits von führenden Leerzeichen/Partikeln
// befreiten) Anschlusstext ein, abschließende Satzzeichen je Wort
// abgeschnitten. Reine Tokenisierung – kein Abgleich mit lookup.
function leseFuehrendeWorte(text: string): string[] {
  const roheWorte: string[] = [];
  for (const m of text.matchAll(/\S+/g)) {
    roheWorte.push(m[0].replace(/[.,;:!?)]+$/, ''));
    if (roheWorte.length >= 8) break;
  }
  return roheWorte;
}

// Langtitel-Treffer mit normalisiertem Präfixvergleich: unter allen
// Kandidaten mit passendem ersten Wort denjenigen mit der längsten
// Wort-für-Wort-Übereinstimmung wählen. Gültig, sobald alle im Text
// VORHANDENEN Wörter übereinstimmen – der Langtitel darf im Text abgekürzt
// sein (z.B. "des Grundgesetzes" statt "des Grundgesetzes für die
// Bundesrepublik Deutschland").
function sucheLangtitelTreffer(
  kandidat: string[],
  kandidaten: { woerter: string[]; kurztitel: string }[],
): string | null {
  let bestesTreffer: { kurztitel: string; laenge: number } | null = null;

  for (const { woerter: titelWorte, kurztitel } of kandidaten) {
    let treffer = 0;
    for (let i = 0; i < Math.min(titelWorte.length, kandidat.length); i++) {
      if (titelWorte[i] === kandidat[i]) treffer++;
      else break;
    }
    if (treffer === kandidat.length && treffer > 0) {
      if (!bestesTreffer || treffer > bestesTreffer.laenge) {
        bestesTreffer = { kurztitel, laenge: treffer };
      }
    }
  }

  return bestesTreffer?.kurztitel ?? null;
}

export function erkenneLaw(nachText: string, lookup: GesetzLookup): string | null {
  // Führende Leerzeichen / geschütztes Leerzeichen überspringen
  let text = nachText.replace(/^[\s\u00A0]+/, '');
  // Einleitenden Partikel entfernen ("des Bürgerlichen Gesetzbuchs" → "Bürgerlichen…")
  text = text.replace(PARTIKEL_RE, '');

  const roheWorte = leseFuehrendeWorte(text);
  if (roheWorte.length === 0) return null;

  // 1. Direkttreffer auf Kurztitel (erstes Wort, case-insensitiv)
  //    Bsp: "BGB" im Text trifft sofort.
  const erstesWort = kurztitelVergleichsform(roheWorte[0]!);
  const direktTreffer = lookup.direkt.get(erstesWort);
  if (direktTreffer) return direktTreffer;

  // 2. Langtitel-Treffer mit normalisiertem Wortvergleich
  //    Bsp: "Bürgerlichen Gesetzbuchs" trifft "Bürgerliches Gesetzbuch"
  const kandidat = roheWorte.map(normalisiere);
  const kandidaten = lookup.langtitelNachErstemWort.get(kandidat[0]!);
  if (!kandidaten) return null;

  const langtitelTreffer = sucheLangtitelTreffer(kandidat, kandidaten);
  if (langtitelTreffer) return langtitelTreffer;

  // 3. Fallback: Wenn kein präziser Treffer gefunden wurde, aber genau EIN
  //    Gesetz mit passendem ersten Wort im Importindex existiert und dieses erste
  //    Wort nicht generisch ist (z.B. "Grundgesetz" als einziger Kandidat für
  //    "grundgesetz"), wird dieses eine Gesetz als Treffer gewertet. Bei
  //    mehreren Kandidaten oder generischem ersten Wort wird nicht geraten.
  if (kandidaten.length === 1 && !GENERISCHE_ERSTE_WOERTER.has(kandidat[0]!)) {
    return kandidaten[0]!.kurztitel;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Verweise in einem Text-Node ersetzen
// ---------------------------------------------------------------------------
