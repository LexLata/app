// bezeichnungZuId.ts
// Berechnet aus dem Bezeichnungstext einer Norm bzw. eines Gliederungsartikels
// (z.B. "§ 434", "§§ 3 bis 6", "Art. 229", "Anhang 1") die stabile id fürs
// GesetzesXML-Attribut `id`. Ersetzt die frühere Übernahme der
// Bundesjustizamt-doknr, die beim BW-HTML-Import nicht existierte (siehe
// HTMLImporterBW.ts, das dafür bislang künstliche "BW_..."-Werte erzeugt hat).
//
// Zwei getrennte Verantwortlichkeiten:
//   - berechneId: reine, deterministische Textableitung, kein Kollisionswissen.
//   - IdVergabe:  hält die innerhalb EINES Gesetzes bereits vergebenen ids fest
//                 und hängt bei Kollision einen Suffix an. Wird pro
//                 baueGesetzesXML-Aufruf neu instanziiert (siehe gesetzesXMLBauer.ts).

const PARAGRAPH_PRAEFIX = /^§§?\s*/;
const ARTIKEL_PRAEFIX = /^Art(?:ikel)?\.?\s*/i;

/** Erste Zahl(+Buchstaben)-Gruppe am Anfang des Rests, z.B.
 *  "3a bis 6" → "3a", "229" → "229". Null, wenn der Rest nicht mit einer
 *  Ziffer beginnt (dann greift der Anhang/Anlage-Fallback in berechneId). */
function ersteNummer(rest: string): string | null {
  const match = rest.trim().match(/^(\d+[a-zA-Z]*)/);
  return match ? match[1]! : null;
}

/**
 * Berechnet die id für EIN Element.
 * @param bezeichnung      Rohtext, z.B. "§ 434", "§§ 3 bis 6", "Art. 229", "Anhang 1"
 * @param artikelKontextstelle  id des zuletzt gesehenen Gliederungsartikels – nur
 *                          für §§ innerhalb von Gliederungsartikel-Gesetzen
 *                          (z.B. EGBGB) relevant, dort "Art 229 § 2" → "229-2".
 */
export function berechneId(bezeichnung: string, artikelKontextstelle?: string): string {
  const trimmed = bezeichnung.trim();

  const paragraphMatch = trimmed.match(PARAGRAPH_PRAEFIX);
  if (paragraphMatch) {
    const nr = ersteNummer(trimmed.slice(paragraphMatch[0].length));
    if (nr) return artikelKontextstelle ? `${artikelKontextstelle}-${nr}` : nr;
  }

  const artikelMatch = trimmed.match(ARTIKEL_PRAEFIX);
  if (artikelMatch) {
    const nr = ersteNummer(trimmed.slice(artikelMatch[0].length));
    if (nr) return nr;
  }

  // Fallback (z.B. "Anhang 1", "Anlage 3"): kompletter Text ohne Leerzeichen.
  return trimmed.replace(/\s+/g, '');
}

/**
 * Kollisionen sind nur innerhalb eines Gesetzes relevant (die Auflösung in
 * normAufloesung.ts sucht immer nur innerhalb von gesetz.elemente), daher
 * genügt eine pro Gesetz-Import neu angelegte Instanz.
 */
export class IdVergabe {
  private vergeben = new Set<string>();

  vergib(bezeichnung: string, artikelKontextstelle?: string): string {
    const basis = berechneId(bezeichnung, artikelKontextstelle);
    let id = basis;
    let suffix = 2;
    while (this.vergeben.has(id)) {
      id = `${basis}_${suffix}`;
      suffix++;
    }
    if (id !== basis) {
      console.warn(
        `[bezeichnungZuId] Kollision bei id "${basis}" (Bezeichnung "${bezeichnung}") – verwende "${id}" stattdessen.`,
      );
    }
    this.vergeben.add(id);
    return id;
  }
}
