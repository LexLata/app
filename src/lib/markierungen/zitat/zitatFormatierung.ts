// zitatFormatierung.ts
//
// Formatiert einen Textpfad (siehe textpfad.ts) zusammen mit der
// Norm-Bezeichnung und der Gesetz-Kurztitel zu einem menschenlesbaren
// Zitat-String, z.B. "§ 433 Abs. 1 S. 1 Nr. 1a BGB" – einzige Verwendung:
// "Zitat kopieren" in der Auswahlleiste (siehe
// auswahlleiste.tsx/useZitatKopieren.ts).
//
// Gehört neben dem zitatParser.ts (Text → Struktur) zum Zitat-Submodul:
// Formatierung ist die umgekehrte Richtung (Struktur → Text). Das
// Textpfad-Modul liefert ausschließlich den strukturellen Pfadvertrag.
//
// Reihenfolge der Bausteine folgt der üblichen juristischen Zitierweise:
// Norm-Bezeichnung → Absatz → Unterabsatz → Satz → Eintrags-Kette
// (Nummer/Litera, siehe unten) → Satz-in-Eintrag → Gesetz-Kurztitel
// (siehe Absprache: Gesetz wird IMMER angehängt).
//
// Sonderregel "römische Absatzzahl ohne folgendes 'S.'" (Absprache, Punkt
// 5.3.2): gilt NUR, wenn die Satzzahl UNMITTELBAR auf die römische
// Absatzzahl folgt (kein Unterabsatz dazwischen) – siehe satzOhneWort unten,
// wird von einem zwischengeschalteten Unterabsatz zurückgesetzt.

import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import type { TextpfadEintrag } from '@/lib/domain/gesetzTypes';
import { zahlZuRoemisch } from '@/lib/utils/roemischeZahlen';

export interface ZitatEinstellungenWerte {
  /** Option 1: "Abs." statt "Absatz" usw. */
  abkuerzungenAktiv: boolean;
  /** Option 2 (nur bei abkuerzungenAktiv relevant): "Abs" statt "Abs.". */
  ohnePunkt: boolean;
  /** Option 3 (nur bei abkuerzungenAktiv relevant): Absatzzahl als "I"/"Ia" statt "1"/"1a". */
  roemischeAbsaetze: boolean;
}

// Absatz-/Nummer-/Litera-Rohwerte tragen im Laufzeitmodell noch ihre
// Klammern/Satzzeichen ("(1)", "1.", "a)") – für ein Zitat wollen wir nur den
// nackten Wert ("1", "1a").
function bereinigt(roh: string): string {
  return roh.replace(/^\(|\)$/g, '').replace(/[.)]+$/, '');
}

// "1" → "I", "1a" → "Ia". Unerwartetes Format (kein führendes Ziffern-Segment,
// sollte bei Absatz-Bezeichnungen strukturell nicht vorkommen) wird
// unverändert durchgereicht statt einen Fehler zu werfen (Best-effort, analog
// zum sonstigen Umgang bei Markierungen im Projekt).
function zuRoemischGemischt(roh: string): string {
  const treffer = roh.match(/^(\d+)([a-zA-Z]*)$/);
  if (!treffer) return roh;
  const [, ziffern, buchstabe] = treffer;
  return zahlZuRoemisch(Number(ziffern)) + buchstabe;
}

// Wählt je nach Einstellungen "Abs."/"Absatz" (und ohne Punkt: "Abs") – als
// eigene Top-Level-Funktion statt Closure in formatiereZitat, damit deren
// Cognitive Complexity nicht durch die verschachtelte Funktionsdefinition
// zusätzlich steigt.
function wortFuer(einstellungen: ZitatEinstellungenWerte, kurz: string, lang: string): string {
  if (!einstellungen.abkuerzungenAktiv) return lang;
  // Stryker disable next-line Regex: äquivalent geprüft (Mutant entfernt den
  // $-Anker, sodass der ERSTE statt der LETZTE Punkt entfernt würde) – `kurz`
  // ist in dieser Datei immer eines der festen Literale 'Abs.'/'UAbs.'/'S.'/
  // 'Nr.'/'lit.', die je genau einen Punkt (am Ende) enthalten. Erster und
  // letzter Punkt fallen für diese geschlossene Menge an Aufrufstellen immer
  // zusammen.
  return einstellungen.ohnePunkt ? kurz.replace(/\.$/, '') : kurz;
}

// Absatz-/Unterabsatz-/Satz-Bausteine (in dieser Reihenfolge, siehe
// Kopfkommentar). Behandelt zugleich die Sonderregel "römische Absatzzahl
// ohne folgendes 'S.'" (Absprache Punkt 5.3.2).
function absatzUnterabsatzSatzBausteine(
  pfad: Textpfad,
  einstellungen: ZitatEinstellungenWerte,
): string[] {
  const teile: string[] = [];
  // true, solange direkt zuvor NUR eine (ggf. römische) Absatzzahl ohne
  // dazwischenliegenden Unterabsatz stand – steuert, ob vor einer Satzzahl
  // "S."/"Satz" weggelassen werden darf.
  let satzOhneWort = false;

  if (pfad.absatz !== undefined) {
    const roh = bereinigt(pfad.absatz);
    if (einstellungen.abkuerzungenAktiv && einstellungen.roemischeAbsaetze) {
      teile.push(zuRoemischGemischt(roh));
      satzOhneWort = true;
    } else {
      teile.push(`${wortFuer(einstellungen, 'Abs.', 'Absatz')} ${roh}`);
    }
  }

  if (pfad.unterabsatz !== undefined) {
    teile.push(
      `${wortFuer(einstellungen, 'UAbs.', 'Unterabsatz')} ${pfad.unterabsatz.replace(/^\[|\]$/g, '')}`,
    );
    satzOhneWort = false;
  }

  if (pfad.satz !== undefined) {
    teile.push(
      satzOhneWort ? String(pfad.satz) : `${wortFuer(einstellungen, 'S.', 'Satz')} ${pfad.satz}`,
    );
  }

  return teile;
}

// Eintrags-Kette (Nummer/Litera, beliebig tief): läuft die VOLLSTÄNDIGE Kette
// generisch durch, statt (wie früher) genau einen Nummer- und einen
// Litera-Fall zu unterscheiden. Regel "Nr. 1a" statt "Nr. 1 lit. a"
// (Absprache Punkt 6): eine litera, die im Pfad DIREKT auf eine nummer folgt,
// wird mit deren Token verschmolzen statt als eigenes "lit."-Token angehängt.
// Weitere, tiefer verschachtelte literas (z.B. "aa)" unter "a)") verschmelzen
// NICHT zusätzlich – dafür gibt es keine etablierte Zitierkonvention im
// Projekt, sie werden als eigene "lit."-Token angehängt (konservative, aber
// eindeutige Wahl).
function eintraegeBausteine(
  eintraege: readonly TextpfadEintrag[],
  einstellungen: ZitatEinstellungenWerte,
): string[] {
  const teile: string[] = [];
  // Stryker disable next-line EqualityOperator: äquivalent geprüft (Mutant
  // `i <= eintraege.length` erlaubt eine zusätzliche Schleifen-Runde mit
  // i === eintraege.length; `eintraege[i]` liefert dort undefined, was der
  // Guard direkt darunter ohne jeden weiteren Effekt abfängt).
  for (let i = 0; i < eintraege.length; i++) {
    const schritt = eintraege[i];
    // Durch die Schleifen-Invariante (i < eintraege.length) beweisbar
    // sicher – die Prüfung dient nur der Typ-Absicherung unter
    // noUncheckedIndexedAccess.
    // Stryker disable next-line ConditionalExpression: äquivalent geprüft –
    // eintraege ist ein regulär (nicht sparse) befülltes TextpfadEintrag[],
    // schritt ist an dieser Stelle nie tatsächlich undefined; ein
    // erzwungenes `if (false)` hätte daher nie einen Effekt.
    if (schritt === undefined) continue;
    const bez = bereinigt(schritt.bezeichnung);
    if (schritt.ebene === 'litera' && eintraege[i - 1]?.ebene === 'nummer') {
      teile[teile.length - 1] = `${teile[teile.length - 1]}${bez}`;
    } else if (schritt.ebene === 'nummer') {
      teile.push(`${wortFuer(einstellungen, 'Nr.', 'Nummer')} ${bez}`);
    } else {
      teile.push(`${wortFuer(einstellungen, 'lit.', 'litera')} ${bez}`);
    }
  }
  return teile;
}

/**
 * Formatiert `pfad` (bereits ggf. per groessterGemeinsamerPfad reduziert,
 * siehe textpfad.ts) zu einem vollständigen Zitat-String.
 *
 * `pfad.eintraege` enthält die VOLLSTÄNDIGE Kette (Nr./Litera, beliebig
 * tief) bereits von der Wurzel bis zum Blatt (siehe Textpfad.eintraege) –
 * anders als früher muss die zu einer litera gehörende Nummer hier nicht
 * mehr separat nachgeschlagen werden (ENTFERNT: findeUebergeordneteNummer-
 * Aufruf beim Aufrufer), sie steht bereits als vorheriger Kettenschritt fest.
 */
export function formatiereZitat(
  normBezeichnung: string,
  gesetzKurztitel: string,
  pfad: Textpfad,
  einstellungen: ZitatEinstellungenWerte,
): string {
  const teile: string[] = [normBezeichnung];

  const fundstelle = formatiereFundstelle(pfad, einstellungen);
  if (fundstelle) teile.push(fundstelle);

  teile.push(gesetzKurztitel);
  return teile.join(' ');
}

/** Formatiert nur die strukturelle Fundstelle ohne Norm und Gesetz. */
export function formatiereFundstelle(
  pfad: Textpfad,
  einstellungen: ZitatEinstellungenWerte,
): string {
  const teile: string[] = [];
  // Titel/Bezeichnungsfeld sind atomar (siehe groessterGemeinsamerPfad) –
  // keine weitere Verfeinerung, das Zitat bleibt bei der reinen Norm-Bezeichnung.
  if (!pfad.bereich) {
    teile.push(...absatzUnterabsatzSatzBausteine(pfad, einstellungen));
    teile.push(...eintraegeBausteine(pfad.eintraege ?? [], einstellungen));

    // Satz INNERHALB eines Aufzählungseintrags ("Nr. 1 Satz 2") – folgt immer
    // auf Nummer/Litera, nie unmittelbar auf eine römische Absatzzahl, daher
    // hier immer mit Wort.
    if (pfad.satzInEintrag !== undefined) {
      teile.push(`${wortFuer(einstellungen, 'S.', 'Satz')} ${pfad.satzInEintrag}`);
    }
  }

  return teile.join(' ');
}
