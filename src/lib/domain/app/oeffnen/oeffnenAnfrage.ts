// oeffnenAnfrage.ts
// Zerlegung der Suchanfrage und Abgrenzung bekannter Kurztitel.

import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
/** Zerlegte Eingabe; Norm-/Artikelnummer oder Erwägungsgrund und optionale Gesetzesangabe. */
export interface Suchanfrage {
  /** Vollständige Eingabe für die Abgrenzung eines exakten Kurztitels von Normangaben. */
  suchtext?: string;
  normPraefix?: 'paragraph' | 'artikel';
  /**
   * Erster Zahlenteil bei „229 3"-Eingabe (ohne §-Präfix, zwei Zahlen):
   * bezeichnet einen Gliederungsartikel (z.B. „Art. 229").
   * Nur gesetzt wenn KEIN §-Präfix voransteht und zwei Zahlen folgen.
   */
  artikelNummer: string | null;
  normNummer: string | null;
  /** Nummer eines Erwägungsgrunds (z.B. „1" bei Eingabe „e1") – nur gesetzt,
   *  wenn die Eingabe mit „e" direkt gefolgt von einer Zahl beginnt (kein
   *  Leerzeichen dazwischen). Exklusiv zu normNummer/artikelNummer. */
  erwaegungsgrundNummer: string | null;
  gesetzQuery: string;
}

// Anfrage-Parsing

/** Zerlegt die Eingabe ohne Laden, Import, Navigation oder Änderung der Eingabedaten. */
export function parseSuchanfrage(suchtext: string): Suchanfrage {
  return { ...zerlegeSuchanfrage(suchtext), suchtext: suchtext.trim() };
}

function zerlegeSuchanfrage(suchtext: string): Suchanfrage {
  // Artikel-Präfix nur vor einer durch Leerraum getrennten Zahl entfernen:
  // „Art115V“ und „Artikel“ bleiben Gesetzesangaben.
  const artikelPraefix = /^(?:Art\.?|Artikel)\s+(?=\d)/i.test(suchtext.trim());
  const q = suchtext.trim().replace(/^(?:Art\.?|Artikel)\s+(?=\d)/i, '');
  const hatParagraphzeichen = q.startsWith('§');
  const ohneParzeichen = hatParagraphzeichen ? q.slice(1).trim() : q;
  const teile = ohneParzeichen
    .replace(
      /^(\d+)([A-Z])(?=\.?(?:\s|$))/u,
      (_, zahl: string, zusatz: string) => zahl + zusatz.toLowerCase(),
    )
    .replace(/^(\d+[a-z]?)(?=[A-ZÄÖÜ])/u, '$1 ')
    .replace(/^(\d+)(?=[a-zäöü]{2})/u, '$1 ')
    .split(/\s+/)
    .filter(Boolean);
  if (teile.length === 0) {
    return { artikelNummer: null, normNummer: null, erwaegungsgrundNummer: null, gesetzQuery: '' };
  }

  // erstes beweisbar sicher durch die length === 0-Prüfung direkt davor.
  const erstes = teile[0]!;
  const zweites = teile[1] ?? '';

  // Erwägungsgrund-Modus: „e1", „e25 dsgvo" – kein §-Präfix, erstes Teil ist
  // „e" direkt gefolgt von einer Zahl (kein Leerzeichen). Muss vor dem
  // Zahlen-Check greifen, da „e1" selbst nicht mit einer Ziffer beginnt.
  const erwaegungsgrundMatch = !hatParagraphzeichen && /^e(\d+)$/i.exec(erstes);
  if (erwaegungsgrundMatch) {
    return {
      artikelNummer: null,
      normNummer: null,
      // [1] beweisbar sicher: nicht-optionale Capture-Gruppe im Regex oben.
      erwaegungsgrundNummer: erwaegungsgrundMatch[1]!,
      gesetzQuery: teile.slice(1).join(' '),
    };
  }

  // Zwei-Zahlen-Modus: „229 3" oder „229 3 egbgb" – kein §-Präfix,
  // erstes und zweites Teil beginnen beide mit einer Ziffer.
  if (!hatParagraphzeichen && /^\d/.test(erstes) && /^\d/.test(zweites)) {
    return {
      artikelNummer: erstes,
      normNummer: zweites,
      erwaegungsgrundNummer: null,
      gesetzQuery: teile.slice(2).join(' '),
    };
  }

  // Normaler Modus: optionaler §-Präfix, erste Zahl = normNummer.
  if (/^\d/.test(erstes)) {
    return {
      artikelNummer: null,
      normNummer: erstes,
      ...(hatParagraphzeichen
        ? { normPraefix: 'paragraph' as const }
        : artikelPraefix
          ? { normPraefix: 'artikel' as const }
          : {}),
      erwaegungsgrundNummer: null,
      gesetzQuery: teile.slice(1).join(' '),
    };
  }

  return {
    artikelNummer: null,
    normNummer: null,
    erwaegungsgrundNummer: null,
    gesetzQuery: ohneParzeichen,
  };
}

/** Bekannten Kurztitel zuerst abgrenzen; nur der davor stehende Rest ist eine Normangabe.
 * Zahlbeginn im Titel benötigt eine Leerraumgrenze; „1GG“ bleibt als Kurzschreibweise möglich. */
export function anfrageFuerKurztitel(anfrage: Suchanfrage, kurztitel: string): Suchanfrage | null {
  if (anfrage.suchtext === undefined) return null;
  const text = anfrage.suchtext.trim();
  const titel = kurztitel.trim();
  if (!titel) return null;
  // Die Grenze im Original suchen: NFC und NFD können verschieden lang sein.
  const titelVergleich = kurztitelVergleichsform(titel);
  let titelbeginn = -1;
  for (let i = 0; i <= text.length; i++) {
    if (kurztitelVergleichsform(text.slice(i)) === titelVergleich) {
      titelbeginn = i;
      break;
    }
  }
  if (titelbeginn < 0) return null;
  const rest = text.slice(0, titelbeginn);
  if (rest && !/\s$/.test(rest) && !(/^[\p{L}]/u.test(titel) && /\d$/.test(rest))) return null;
  const normanfrage = parseSuchanfrage(rest);
  if (normanfrage.gesetzQuery) return null;
  return { ...normanfrage, suchtext: text, gesetzQuery: titel };
}
