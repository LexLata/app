// normStrukturPruefung.ts
// Gemeinsame Strukturprüfung und Gliederungsartikelzuordnung von Normen.
//
// Prüft, ob eine Norm einen Absatz/Satz/Nummer/litera mit einer bestimmten
// Bezeichnung enthält – wird ausschließlich für die Auflösung mehrdeutiger
// Kommagrenzen in Freitext-Normzitaten gebraucht (siehe zitatParser.ts:
// AmbiguerPunkt, VerweismarkierungFenster.tsx). Arbeitet auf dem bereits geladenen
// GesetzDarstellung-Modell (Darstellungs-Pipeline), NICHT auf rohem XML –
// konsistent mit der Zwei-Stufen-Architektur des Projekts (nur die
// Import-Pipeline liest rohes XML).
//
// HIERARCHISCHE Prüfung: ist im Zitat-Text bereits ein übergeordneter
// Absatz-/Satz-/Nummer-Wert genannt (siehe ZusatzKontext, aus
// AmbiguerPunkt.absatzKontext/satzKontext/nummerKontext), wird NUR innerhalb
// dieser Ebene gesucht (z.B. "434 III 2 Nr 1, 4" → prüft, ob Absatz 3 Satz 2
// eine Nr. 4 hat, NICHT ob irgendwo in der Norm eine Nr. 4 vorkommt). Ist der
// genannte Absatz/Satz in der Norm nicht auffindbar, gilt die Prüfung als
// NICHT erfüllt (false) – es wird bewusst NICHT auf eine normweite Suche
// zurückgefallen, da das die Scoping-Absicht unterlaufen würde. Fehlt der
// Kontext dagegen komplett (kein Absatz/Satz zuvor im Zitat genannt), bleibt
// es bei der bisherigen normweit-flachen Suche (Rückwärtskompatibilität für
// Zitate ohne Absatz-Angabe, z.B. "434 Nr 1, 4" ohne "III").

import type {
  DarstellungsElement,
  AbsatzDarstellung,
  NormDarstellung,
  SatzDarstellung,
  ListenEintragDarstellung,
  UnterabsatzDarstellung,
  ZusatzArt,
} from '@/lib/domain/gesetzTypes';

/** Hierarchischer Kontext für die Existenzprüfung (siehe Kopfkommentar) –
 *  entspricht AmbiguerPunkt.absatzKontext/unterabsatzKontext/satzKontext/
 *  nummerKontext. */
export interface ZusatzKontext {
  absatz?: string;
  unterabsatz?: string;
  satz?: string;
  nummer?: string;
}

function sammleAlleSaetzeAusEintraegen(
  eintraege: ListenEintragDarstellung[],
  ziel: SatzDarstellung[],
): void {
  for (const e of eintraege) {
    if (e.saetze) {
      ziel.push(...e.saetze);
      for (const s of e.saetze) sammleAlleSaetzeAusEintraegen(s.eintraege, ziel);
    }
    // Stryker disable next-line ConditionalExpression,EqualityOperator: Rekursion
    // auf ein leeres untereintraege-Array ist ein No-Op (for-Schleife läuft
    // dann einfach nicht durch) – der Guard-Wert ändert das Ergebnis nie,
    // echt äquivalent.
    if (e.untereintraege.length > 0) sammleAlleSaetzeAusEintraegen(e.untereintraege, ziel);
  }
}

function sammleAlleSaetze(norm: NormDarstellung): SatzDarstellung[] {
  // Stryker disable next-line ArrayDeclaration: alle wird nur über .some()/
  // .find() mit striktem Vergleich konsumiert – ein zusätzliches Fremdelement
  // (z.B. ein String) matcht nie einen echten Vergleich, daher aus Sicht der
  // Blackbox-Tests unkillbar ohne interne Helper unnötig zu exportieren.
  const alle: SatzDarstellung[] = [];
  for (const a of norm.absaetze) alle.push(...alleSaetzeEinesAbsatzes(a));
  return alle;
}

/** Alle Sätze EINES Absatzes (inkl. Unterabsätze und in Listeneinträgen
 *  verschachtelter Sätze) – Basis für die auf einen Absatz gescopte Suche. */
function alleSaetzeEinesAbsatzes(absatz: AbsatzDarstellung): SatzDarstellung[] {
  const alle: SatzDarstellung[] = [...absatz.saetze];
  sammleAlleSaetzeAusEintraegen(
    absatz.saetze.flatMap((s) => s.eintraege),
    alle,
  );
  for (const u of absatz.unterabsaetze ?? []) {
    alle.push(...u.saetze);
    sammleAlleSaetzeAusEintraegen(
      u.saetze.flatMap((s) => s.eintraege),
      alle,
    );
  }
  return alle;
}

function sammleAlleEintraege(
  eintraege: ListenEintragDarstellung[],
  ziel: ListenEintragDarstellung[],
): void {
  for (const e of eintraege) {
    ziel.push(e);
    if (e.saetze) for (const s of e.saetze) sammleAlleEintraege(s.eintraege, ziel);
    // Stryker disable next-line ConditionalExpression,EqualityOperator: Rekursion
    // auf ein leeres untereintraege-Array ist ein No-Op – der Guard-Wert
    // ändert das Ergebnis nie, echt äquivalent (siehe gleiches Muster in
    // sammleAlleSaetzeAusEintraegen oben).
    if (e.untereintraege.length > 0) sammleAlleEintraege(e.untereintraege, ziel);
  }
}

function alleEintraegeEinerNorm(norm: NormDarstellung): ListenEintragDarstellung[] {
  // Stryker disable next-line ArrayDeclaration: siehe Begründung bei
  // sammleAlleSaetze oben – Array wird nur über .some()/.find() konsumiert.
  const alle: ListenEintragDarstellung[] = [];
  for (const a of norm.absaetze) alle.push(...alleEintraegeEinesAbsatzes(a));
  return alle;
}

/** Alle Listeneinträge EINES Absatzes (über alle seine Sätze/Unterabsätze
 *  hinweg) – Basis für die auf einen Absatz gescopte Nummer-/Litera-Suche. */
function alleEintraegeEinesAbsatzes(absatz: AbsatzDarstellung): ListenEintragDarstellung[] {
  // Stryker disable next-line ArrayDeclaration: siehe Begründung bei
  // sammleAlleSaetze oben.
  const alle: ListenEintragDarstellung[] = [];
  sammleAlleEintraege(
    absatz.saetze.flatMap((s) => s.eintraege),
    alle,
  );
  for (const u of absatz.unterabsaetze ?? [])
    sammleAlleEintraege(
      u.saetze.flatMap((s) => s.eintraege),
      alle,
    );
  return alle;
}

/** Alle Listeneinträge EINES Satzes (inkl. dessen verschachtelter
 *  Unter-Einträge) – Basis für die auf einen Satz gescopte Nummer-Suche. */
function alleEintraegeEinesSatzes(satz: SatzDarstellung): ListenEintragDarstellung[] {
  // Stryker disable next-line ArrayDeclaration: siehe Begründung bei
  // sammleAlleSaetze oben.
  const alle: ListenEintragDarstellung[] = [];
  sammleAlleEintraege(satz.eintraege, alle);
  return alle;
}

/** Vollständige Nummer einer Absatz- oder Listenbezeichnung, etwa
 * (1ab) oder 1abc. Datenbezeichnungen erlauben beliebig lange
 * Kleinbuchstabenläufe, unabhängig von den engeren Eingabezahlenregeln.
 * Angrenzende Buchstaben oder Ziffern verhindern eine Teilbestätigung. */
function fuehrendeZahl(text: string | undefined): string | undefined {
  return text?.match(/(?<![A-Za-z0-9])\d+[a-z]*(?![A-Za-z0-9])/)?.[0];
}

/** Führender Buchstabe einer Eintrags-Bezeichnung ("c)") – für litera.
 *  Parameter bewusst `string` (nicht optional): der einzige Aufrufer übergibt
 *  ListenEintragDarstellung.bezeichnung, welches laut Typ nie undefined ist
 *  (anders als AbsatzDarstellung.bezeichnung bei fuehrendeZahl oben, das für
 *  unnummerierte Absätze echt optional ist). */
function fuehrenderBuchstabe(text: string): string | undefined {
  // Stryker disable next-line OptionalChaining: sobald match(...) null
  // liefert, propagiert der Optional-Chaining-Kurzschluss laut JS-Spec durch
  // die gesamte restliche Kette – das nachfolgende ?. vor toLowerCase()
  // ändert das Ergebnis nie, echt äquivalent.
  return text.match(/[a-zA-Z]+/)?.[0]?.toLowerCase();
}

function absatzMitWert(norm: NormDarstellung, wert: string): AbsatzDarstellung | undefined {
  return norm.absaetze.find((a) => fuehrendeZahl(a.bezeichnung) === wert);
}

/** Unterabsatz mit gegebener Bezeichnung innerhalb eines Absatzes.
 *  Der Zitatparser liefert den Wert ohne eckige Klammern; nur für die
 *  Auflösung werden die Klammern der gespeicherten Bezeichnung entfernt. */
function unterabsatzMitWert(
  absatz: AbsatzDarstellung,
  wert: string,
): UnterabsatzDarstellung | undefined {
  return absatz.unterabsaetze?.find((u) => u.bezeichnung.replace(/^\[|\]$/g, '') === wert);
}

/** Alle Sätze EINES Unterabsatzes (inkl. in Listeneinträgen verschachtelter
 *  Sätze) – analog zu alleSaetzeEinesAbsatzes, aber für die auf einen
 *  Unterabsatz gescopte Suche (Satz-Zählung beginnt pro Unterabsatz neu bei
 *  1, siehe AbsatzDarstellung.unterabsaetze-Kommentar). */
function alleSaetzeEinesUnterabsatzes(unterabsatz: UnterabsatzDarstellung): SatzDarstellung[] {
  const alle: SatzDarstellung[] = [...unterabsatz.saetze];
  sammleAlleSaetzeAusEintraegen(
    unterabsatz.saetze.flatMap((s) => s.eintraege),
    alle,
  );
  return alle;
}

/** Alle Listeneinträge EINES Unterabsatzes – Basis für die auf einen
 *  Unterabsatz gescopte Nummer-/Litera-Suche. */
function alleEintraegeEinesUnterabsatzes(
  unterabsatz: UnterabsatzDarstellung,
): ListenEintragDarstellung[] {
  const alle: ListenEintragDarstellung[] = [];
  sammleAlleEintraege(
    unterabsatz.saetze.flatMap((s) => s.eintraege),
    alle,
  );
  return alle;
}

function satzMitWert(saetze: SatzDarstellung[], wert: string): SatzDarstellung | undefined {
  // Stryker disable next-line ConditionalExpression: ohne den "!== undefined"-
  // Teil unterscheidet sich das Ergebnis nur, wenn wert === "undefined" wäre
  // (String(undefined) === "undefined") – kommt bei echten, aus Zitat-Text
  // geparsten Werten nie vor, praktisch äquivalent.
  return saetze.find((s) => s.zahl !== undefined && String(s.zahl) === wert);
}

function eintragMitNummer(
  eintraege: ListenEintragDarstellung[],
  wert: string,
): ListenEintragDarstellung | undefined {
  return eintraege.find((e) => fuehrendeZahl(e.bezeichnung) === wert);
}

/**
 * Ermittelt die für 'nummer'/'litera' relevanten Listeneinträge, gescopt auf
 * den übergebenen Absatz-/Satz-Kontext (siehe Kopfkommentar). `undefined` als
 * Rückgabe bedeutet: der genannte Absatz bzw. Satz existiert in der Norm
 * NICHT – die Prüfung muss dann fehlschlagen (false), statt normweit zu
 * suchen.
 */
function eintraegeImKontext(
  norm: NormDarstellung,
  kontext: ZusatzKontext | undefined,
): ListenEintragDarstellung[] | undefined {
  if (kontext?.absatz === undefined) return alleEintraegeEinerNorm(norm);
  const absatz = absatzMitWert(norm, kontext.absatz);
  if (!absatz) return undefined;
  if (kontext.unterabsatz !== undefined) {
    const unterabsatz = unterabsatzMitWert(absatz, kontext.unterabsatz);
    if (!unterabsatz) return undefined;
    if (kontext.satz === undefined) return alleEintraegeEinesUnterabsatzes(unterabsatz);
    const satz = satzMitWert(alleSaetzeEinesUnterabsatzes(unterabsatz), kontext.satz);
    if (!satz) return undefined;
    return alleEintraegeEinesSatzes(satz);
  }
  if (kontext.satz === undefined) return alleEintraegeEinesAbsatzes(absatz);
  const satz = satzMitWert(alleSaetzeEinesAbsatzes(absatz), kontext.satz);
  if (!satz) return undefined;
  return alleEintraegeEinesSatzes(satz);
}

// Absatz ist die oberste Ebene – kein Kontext möglich/nötig.
function pruefeAbsatz(norm: NormDarstellung, wert: string): boolean {
  return norm.absaetze.some((a) => fuehrendeZahl(a.bezeichnung) === wert);
}

// Wie 'satz': ohne Absatz-Kontext normweit-flach (irgendein Absatz mit
// passendem Unterabsatz), mit Kontext gescopt auf den genannten Absatz.
function pruefeUnterabsatz(
  norm: NormDarstellung,
  wert: string,
  kontext: ZusatzKontext | undefined,
): boolean {
  if (kontext?.absatz === undefined)
    return norm.absaetze.some((a) => unterabsatzMitWert(a, wert) !== undefined);
  const absatz = absatzMitWert(norm, kontext.absatz);
  if (!absatz) return false;
  return unterabsatzMitWert(absatz, wert) !== undefined;
}

function pruefeSatz(
  norm: NormDarstellung,
  wert: string,
  kontext: ZusatzKontext | undefined,
): boolean {
  if (kontext?.absatz === undefined)
    return sammleAlleSaetze(norm).some((s) => s.zahl !== undefined && String(s.zahl) === wert);
  const absatz = absatzMitWert(norm, kontext.absatz);
  if (!absatz) return false;
  if (kontext.unterabsatz !== undefined) {
    const unterabsatz = unterabsatzMitWert(absatz, kontext.unterabsatz);
    if (!unterabsatz) return false;
    return alleSaetzeEinesUnterabsatzes(unterabsatz).some(
      (s) => s.zahl !== undefined && String(s.zahl) === wert,
    );
  }
  return alleSaetzeEinesAbsatzes(absatz).some(
    (s) => s.zahl !== undefined && String(s.zahl) === wert,
  );
}

function pruefeNummer(
  norm: NormDarstellung,
  wert: string,
  kontext: ZusatzKontext | undefined,
): boolean {
  const eintraege = eintraegeImKontext(norm, kontext);
  if (!eintraege) return false;
  return eintraege.some((e) => fuehrendeZahl(e.bezeichnung) === wert);
}

// Litera zusätzlich auf eine bestimmte Nummer gescopt (z.B. "Nr 1 lit a, b" →
// prüft, ob Nr. 1 ein lit. b hat), falls im Zitat genannt.
function pruefeLitera(
  norm: NormDarstellung,
  wert: string,
  kontext: ZusatzKontext | undefined,
): boolean {
  let eintraege = eintraegeImKontext(norm, kontext);
  if (!eintraege) return false;
  if (kontext?.nummer !== undefined) {
    const nummerEintrag = eintragMitNummer(eintraege, kontext.nummer);
    if (!nummerEintrag) return false;
    const tiefer: ListenEintragDarstellung[] = [...nummerEintrag.untereintraege];
    if (nummerEintrag.saetze)
      for (const s of nummerEintrag.saetze) sammleAlleEintraege(s.eintraege, tiefer);
    eintraege = tiefer;
  }
  return eintraege.some((e) => fuehrenderBuchstabe(e.bezeichnung) === wert.toLowerCase());
}

/**
 * Prüft, ob `norm` einen Absatz/Satz/Nummer/litera mit der Bezeichnung
 * `wert` enthält (siehe ZusatzArt in zitatParser.ts). `kontext` schränkt die
 * Suche hierarchisch ein (siehe Kopfkommentar) – ohne `kontext` verhält sich
 * die Prüfung wie bisher normweit-flach.
 */
export function pruefeZusatzangabe(
  norm: NormDarstellung,
  art: ZusatzArt,
  wert: string,
  kontext?: ZusatzKontext,
): boolean {
  switch (art) {
    case 'absatz':
      return pruefeAbsatz(norm, wert);
    case 'unterabsatz':
      return pruefeUnterabsatz(norm, wert, kontext);
    case 'satz':
      return pruefeSatz(norm, wert, kontext);
    case 'nummer':
      return pruefeNummer(norm, wert, kontext);
    case 'litera':
      return pruefeLitera(norm, wert, kontext);
  }
}

/**
 * Wie pruefeZusatzangabe, prüft zusätzlich aber, ob der Kandidat SELBST eine
 * Kette weiterer Abs/S/Nr/lit-Angaben enthält (siehe
 * AmbiguerPunkt.verfeinerung in zitatParser.ts, z.B. "434 Abs 1, 2 Abs 3" →
 * prüft nicht nur "hat § 434 einen Abs. 2", sondern zusätzlich "hat Abs. 2
 * einen Abs. 3" – hier strukturell unmöglich, siehe VERFEINERUNGS_EBENE im
 * Parser, der solche Ketten in dem Fall gar nicht erst erzeugt). Jede
 * geprüfte Ebene wird für den nächsten Schritt in den Kontext übernommen.
 */
export function pruefeZusatzangabeMitKette(
  norm: NormDarstellung,
  art: ZusatzArt,
  wert: string,
  kontext: ZusatzKontext | undefined,
  kette: Array<{ art: ZusatzArt; wert: string }>,
): boolean {
  if (!pruefeZusatzangabe(norm, art, wert, kontext)) return false;
  if (kette.length === 0) return true;
  const kontextTiefer: ZusatzKontext = { ...kontext };
  if (art === 'absatz') kontextTiefer.absatz = wert;
  else if (art === 'unterabsatz') kontextTiefer.unterabsatz = wert;
  else if (art === 'satz') kontextTiefer.satz = wert;
  else if (art === 'nummer') kontextTiefer.nummer = wert;
  const [naechsteEbene, ...rest] = kette;
  // naechsteEbene beweisbar sicher: kette.length === 0 wurde oben bereits
  // behandelt, hier ist mindestens ein Element vorhanden.
  return pruefeZusatzangabeMitKette(
    norm,
    naechsteEbene!.art,
    naechsteEbene!.wert,
    kontextTiefer,
    rest,
  );
}

/** Findet den übergeordneten Gliederungsartikel der konkreten Norm. */
export function findeUebergeordnetenArtikel(
  elemente: DarstellungsElement[],
  normKennung: string | NormDarstellung,
): NormDarstellung | null {
  let letzterArtikel: NormDarstellung | null = null;
  for (const el of elemente) {
    // Stryker disable next-line ConditionalExpression: äquivalent –
    // gliederungsEbene existiert nur auf NormDarstellung, bei einer
    // Überschrift ist der Zugriff strukturell immer undefined, der Typ-Check
    // ist also redundant zur Feld-Existenz (mutant 265).
    if (el.typ === 'norm' && el.data.art === 'gliederungsartikel') {
      letzterArtikel = el.data;
    } else if (
      el.typ === 'norm' &&
      (typeof normKennung === 'string' ? el.data.xmlId === normKennung : el.data === normKennung)
    ) {
      return letzterArtikel;
    }
  }
  return null;
}
