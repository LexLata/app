// gliederungsebenenErmittler.ts
// Ermittelt Überschriftenebenen anhand von Bezeichnungen und Nummern
// für die Quellenkonvertierung, etwa KAPITEL IV und Abschnitt I.

import { gliederungsebene } from '@/lib/domain/gliederungskennzahl';

interface StackEntry {
  name: string;
  nummer: string;
}

/**
 * Ebene aus gliederungskennzahl berechnen.
 * Gliederungskennzahl besteht aus Gruppen à 3 Stellen: "010" = Ebene 1, "010010" = Ebene 2 usw.
 *
 * Nur von der Import-Pipeline genutzt (XMLImporterBund.ts). Die Blocklänge und Ebene folgen der gemeinsamen
 * Domänenregel; die Importgrenze behält ihre bisherigen Fallbacks bei.
 */
export function ebeneAusGliederungskennzahl(gliederungskennzahl: string): number {
  const trimmed = gliederungskennzahl.trim();
  if (!trimmed) return 1;
  return Math.max(1, Math.floor(gliederungsebene(trimmed)));
}

/**
 * Erkennt die Gliederungsebene anhand der gliederungsbez-Bezeichnungen.
 * Wird als Fallback verwendet wenn keine gliederungskennzahl vorhanden ist.
 */
export class GliederungsebenenErmittler {
  private stack: StackEntry[] = [];

  reset(): void {
    this.stack = [];
  }

  ermittleEbene(bezeichnung: string): number {
    const { name, nummer } = this.parseBezeichnung(bezeichnung);

    // Letzten Index mit gleichem Namen suchen
    let gefunden = -1;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      // Schleifen-Invariante: 0 <= i < stack.length.
      if (this.stack[i]!.name === name) {
        gefunden = i;
        break;
      }
    }

    if (gefunden !== -1) {
      // gefunden wurde oben nur auf einen gültigen Stack-Index gesetzt.
      const vorherige = this.stack[gefunden]!.nummer;
      if (this.vergleiche(nummer, vorherige) >= 0) {
        // Gleiche Ebene: Stack zurückrollen und aktualisieren
        this.stack = this.stack.slice(0, gefunden + 1);
        this.stack[gefunden]!.nummer = nummer;
      } else {
        // Selber Name, niedrigere Nummer → neue tiefere Ebene
        this.stack.push({ name, nummer });
      }
    } else {
      // Neuer Name → tiefere Ebene
      this.stack.push({ name, nummer });
    }

    return this.stack.length;
  }

  private parseBezeichnung(bez: string): { name: string; nummer: string } {
    const parts = bez.trim().split(' ');
    if (parts.length < 2) return { name: bez, nummer: '' };
    // "ERSTER TEIL"-Schema (Ordnungswort ZUERST, Kategorie-Name danach) –
    // genau umgekehrt zum Standardschema "KAPITEL IV" (Name zuerst, Zahl
    // danach). Beobachtet im AEUV: ERSTER/ZWEITER/…/SIEBTER TEIL. Nur bei
    // genau zwei Wörtern geprüft, da dieses Schema bisher ausschließlich in
    // dieser Form auftritt.
    if (parts.length === 2 && this.ordinalWortZuZahl(parts[0]!) !== null) {
      return { name: parts[1]!, nummer: parts[0]! };
    }
    const nummer = parts[parts.length - 1]!;
    const name = parts.slice(0, -1).join(' ');
    return { name, nummer };
  }

  /** Wandelt ein ausgeschriebenes deutsches Ordnungswort (z.B. "ERSTER",
   *  "ZWÖLFTER") in seinen Zahlenwert um, oder gibt null zurück falls s kein
   *  bekanntes Ordnungswort ist. Nötig, weil "ERSTER" < "ZWEITER" sonst per
   *  localeCompare alphabetisch verglichen würde (falsch: "ERSTER" > "ZWEITER"
   *  alphabetisch, aber 1 < 2 numerisch), analog zu roemischZuZahl. Bisher bis
   *  ZWANZIGSTER (20) abgedeckt – EU-Verträge sind bislang maximal in
   *  SIEBTER TEIL gegliedert, die Reserve deckt ähnliche Fälle in anderen
   *  konsolidierten Verträgen ab. Bei Bedarf hier erweitern. */
  private ordinalWortZuZahl(s: string): number | null {
    const ordinalWoerter: Record<string, number> = {
      ERSTER: 1,
      ZWEITER: 2,
      DRITTER: 3,
      VIERTER: 4,
      FÜNFTER: 5,
      SECHSTER: 6,
      SIEBTER: 7,
      ACHTER: 8,
      NEUNTER: 9,
      ZEHNTER: 10,
      ELFTER: 11,
      ZWÖLFTER: 12,
      DREIZEHNTER: 13,
      VIERZEHNTER: 14,
      FÜNFZEHNTER: 15,
      SECHZEHNTER: 16,
      SIEBZEHNTER: 17,
      ACHTZEHNTER: 18,
      NEUNZEHNTER: 19,
      ZWANZIGSTER: 20,
    };
    return ordinalWoerter[s.toUpperCase()] ?? null;
  }

  private parseNummer(s: string): [number, string] {
    let numStr = '';
    let alphaStr = '';
    let zahlFertig = false;
    for (const ch of s) {
      if (/\d/.test(ch) && !zahlFertig) {
        numStr += ch;
      } else {
        zahlFertig = true;
        alphaStr += ch;
      }
    }
    return [parseInt(numStr) || 0, alphaStr];
  }

  /** Wandelt eine römische Zahl (z.B. "XIV") in ihren Wert um, oder gibt
   *  null zurück falls s keine gültige römische Zahl ist. Nötig, weil der
   *  alphabetische Teil sonst per localeCompare verglichen würde – das
   *  ordnet z.B. "XL" (40) fälschlich NACH "L" (50) ein, da 'X' > 'L'
   *  alphabetisch, aber 40 < 50 numerisch ist. */
  private roemischZuZahl(s: string): number | null {
    if (!s || !/^[IVXLCDM]+$/i.test(s)) return null;
    const werte: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    const upper = s.toUpperCase();
    let summe = 0;
    for (let i = 0; i < upper.length; i++) {
      // Schleifen-Invariante: i < upper.length – upper[i] ist daher immer definiert.
      // Regex-Prüfung oben (^[IVXLCDM]+$) stellt sicher, dass jedes Zeichen
      // in werte enthalten ist – der Lookup ist daher immer erfolgreich.
      const aktuell = werte[upper[i]!]!;
      // upper[i+1] fehlt am Stringende – naechster bleibt dann bewusst
      // undefined (unveränderte Semantik: "kein nächstes Zeichen").
      const zeichenNaechster = i + 1 < upper.length ? upper[i + 1]! : undefined;
      const naechster = zeichenNaechster !== undefined ? werte[zeichenNaechster] : undefined;
      summe += naechster && aktuell < naechster ? -aktuell : aktuell;
    }
    return summe;
  }

  private vergleiche(a: string, b: string): number {
    const [numA, alphaA] = this.parseNummer(a);
    const [numB, alphaB] = this.parseNummer(b);
    if (numA !== numB) return numA - numB;
    const ordA = this.ordinalWortZuZahl(alphaA);
    const ordB = this.ordinalWortZuZahl(alphaB);
    if (ordA !== null && ordB !== null) return ordA - ordB;
    const roemA = this.roemischZuZahl(alphaA);
    const roemB = this.roemischZuZahl(alphaB);
    if (roemA !== null && roemB !== null) return roemA - roemB;
    return alphaA.localeCompare(alphaB);
  }
}
