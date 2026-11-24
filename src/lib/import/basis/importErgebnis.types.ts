// importErgebnis.types.ts
//
// Reine Datenform für das Ergebnis eines Einzel-Quellen-Imports (Bund,
// BW, EU) – kein Logikbezug zu bund/. Verschoben aus
// bund/XMLImporterBund.ts (Vorab-Fix 1, siehe import-submodul-plan.md
// Abschnitt 1), da bw/ und eu/ zuvor nur diesen Typ aus bund/
// brauchten, sonst nichts – ein reiner Typ-Umweg ohne Logikbezug.

export type ImportErgebnis =
  | {
      xmlString: string;
      kurztitel?: string;
      langtitel?: string;
      aenderungsvermerk?: string;
      fehler?: never;
    }
  | {
      fehler: string;
      xmlString?: never;
      kurztitel?: never;
      langtitel?: never;
      aenderungsvermerk?: never;
    };
