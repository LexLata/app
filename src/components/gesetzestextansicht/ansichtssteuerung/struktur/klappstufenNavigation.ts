// klappstufenNavigation.ts
// Reine Regeln für vier Klappstufen: vollständiger Text; Normzeilen ohne Normtext;
// nur überschriftartige Köpfe; nur die obersten Köpfe. Enthält außerdem
// Sichtbarkeit, Zielstufe, Fokuswechsel und strukturelles Ankerziel.
// DOM-Korrekturen und geometrische Offsets liegen im Scrollmodul.

import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';

// Die vier Idealzustände (siehe Dateikopf von useStrukturZustand.ts).
export type Stufe = 1 | 2 | 3 | 4;

// ⌘→/⌘← (siehe Dateikopf von useStrukturZustand.ts).
export type Richtung = 'rechts' | 'links';

// Reines Klapp-Ergebnis (ohne aktivesElementId, anders als das App-weite
// EinklappZustand in appTypes.ts, das den Tab-Zustand inkl. aktivesElementId meint) –
// hier nur das Zwischenergebnis der Stufen-Konstruktion.
export interface StufenKollaps {
  ueberschriften: ReadonlySet<string>;
  normen: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// Stufen-Konstruktion: baut den exakten Soll-Zustand einer Stufe rein aus
// der Dokument-Struktur (elemente), unabhängig vom aktuellen Zustand.
// ---------------------------------------------------------------------------

// Direkter Eltern-Container jedes Elements, der selbst wieder ein
// Überschrift-artiges Element ist ("hat dieser Container ein
// Überschrift-artiges Kind?") – die Grundlage für Stufe 3: ein Container
// OHNE Überschrift-artiges Kind wird eingeklappt (zeigt nur Normzeilen
// darunter, die bei Stufe 3 nicht sichtbar sein sollen), ein Container MIT
// Überschrift-artigem Kind muss aufgeklappt bleiben, damit dieses Kind
// selbst sichtbar ist (siehe Art-3/Art-4-Beispiel im Dateikopf).
function ermittleHatUeberschriftArtigesKind(
  elemente: DarstellungsElement[],
  ueberschriftartigArr: boolean[],
  elternIndizes: (number | null)[],
): boolean[] {
  const ergebnis = new Array<boolean>(elemente.length).fill(false);
  for (let i = 0; i < elemente.length; i++) {
    if (!ueberschriftartigArr[i]) continue;
    // elternIndizes[i] beweisbar sicher: elternIndizes hat dieselbe Länge wie
    // elemente (siehe ermittleElternIndizes), i < elemente.length garantiert
    // durch die Schleifen-Invariante.
    const elternIndex = elternIndizes[i]!;
    if (elternIndex !== null) ergebnis[elternIndex] = true;
  }
  return ergebnis;
}

function baueZustandFuerStufe(
  elemente: DarstellungsElement[],
  ueberschriftartigArr: boolean[],
  elternIndizes: (number | null)[],
  stufe: Stufe,
): StufenKollaps {
  const ueberschriften = new Set<string>();
  const normen = new Set<string>();

  if (stufe === 1) return { ueberschriften, normen };

  // Stufe 2/3/4 gemeinsam: jede Norm (die NICHT
  // Überschrift-artig ist) bekommt ihren Normtext versteckt. Bei Stufe 2
  // bleibt es dabei (alle Container bleiben aufgeklappt, siehe unten);
  // bei Stufe 3/4 ist das zusätzlich Teil von "Normzeile verstecken".
  elemente.forEach((el, i) => {
    if (el.typ === 'norm' && !ueberschriftartigArr[i]) normen.add(el.data.id);
  });
  if (stufe === 2) return { ueberschriften, normen };

  if (stufe === 4) {
    // Alles zuklappen: JEDER Überschrift-artige Container wird eingeklappt
    // (auch solche mit Überschrift-artigem Kind, anders als bei Stufe 3) –
    // übrig bleiben nur die obersten Überschriften, deren eigene Zeile per
    // Definition nie durch Einklappen ausgeblendet wird, nur was darunter
    // liegt.
    elemente.forEach((el, i) => {
      if (!ueberschriftartigArr[i]) return;
      if (el.typ === 'ueberschrift') ueberschriften.add(el.data.id);
      else normen.add(el.data.id);
    });
    return { ueberschriften, normen };
  }

  // Stufe 3: nur Container OHNE Überschrift-artiges Kind werden
  // eingeklappt (siehe ermittleHatUeberschriftArtigesKind).
  const hatUeberschriftArtigesKind = ermittleHatUeberschriftArtigesKind(
    elemente,
    ueberschriftartigArr,
    elternIndizes,
  );
  elemente.forEach((el, i) => {
    if (!ueberschriftartigArr[i]) return;
    if (hatUeberschriftArtigesKind[i]) return;
    if (el.typ === 'ueberschrift') ueberschriften.add(el.data.id);
    else normen.add(el.data.id);
  });
  return { ueberschriften, normen };
}

export function baueAlleStufenZustaende(
  elemente: DarstellungsElement[],
  ueberschriftartigArr: boolean[],
  elternIndizes: (number | null)[],
): Record<Stufe, StufenKollaps> {
  return {
    1: baueZustandFuerStufe(elemente, ueberschriftartigArr, elternIndizes, 1),
    2: baueZustandFuerStufe(elemente, ueberschriftartigArr, elternIndizes, 2),
    3: baueZustandFuerStufe(elemente, ueberschriftartigArr, elternIndizes, 3),
    4: baueZustandFuerStufe(elemente, ueberschriftartigArr, elternIndizes, 4),
  };
}

function setsGleich(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

// Liefert die Stufe, der der AKTUELLE Zustand exakt entspricht – oder null
// bei einem Mischzustand. Wird nur noch von ⌘→ (ermittleZielStufeRechts)
// gebraucht; ⌘← verwendet stattdessen den strukturellen Teilmengen-Test
// (istTeilmengeVon, siehe Dateikopf) und braucht hierfür keinen exakten
// Treffer.
export function ermittleAktuelleStufe(
  alleStufen: Record<Stufe, StufenKollaps>,
  aktuell: StufenKollaps,
): Stufe | null {
  for (const stufe of [1, 2, 3, 4] as const) {
    const soll = alleStufen[stufe];
    if (
      setsGleich(soll.ueberschriften, aktuell.ueberschriften) &&
      setsGleich(soll.normen, aktuell.normen)
    ) {
      return stufe;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sichtbarkeits-Klassifikation – wird nur noch von ⌘→ (im Mischzustand-Fall,
// siehe Dateikopf) gebraucht, um zu entscheiden, in welche Richtung der
// nächste canonical state liegt. ⌘← verwendet stattdessen den strukturellen
// Teilmengen-Test (istTeilmengeVon), siehe Dateikopf für die Begründung.
// ---------------------------------------------------------------------------

export function klassifiziereSichtbarkeit(
  elemente: DarstellungsElement[],
  ueberschriftartigArr: boolean[],
  sichtbareIds: Set<string>,
  eingeklappteNormen: ReadonlySet<string>,
): { contentSichtbarAny: boolean; titelSichtbarAny: boolean } {
  let contentSichtbarAny = false;
  let titelSichtbarAny = false;
  for (let i = 0; i < elemente.length; i++) {
    if (ueberschriftartigArr[i]) continue;
    // el beweisbar sicher durch die Schleifen-Invariante (i < elemente.length).
    const el = elemente[i]!;
    if (el.typ !== 'norm') continue;
    if (!sichtbareIds.has(el.data.id)) continue;
    titelSichtbarAny = true;
    if (!eingeklappteNormen.has(el.data.id)) {
      contentSichtbarAny = true;
      break; // beide Antworten stehen damit bereits fest
    }
  }
  return { contentSichtbarAny, titelSichtbarAny };
}

// ⌘→ (siehe Dateikopf): exakter Treffer auf Stufe N → eine Ebene tiefer
// (N-1, mindestens 1). Mischzustand → anhand der Sichtbarkeit Richtung 1
// bestimmen.
export function ermittleZielStufeRechts(
  aktuelleStufe: Stufe | null,
  contentSichtbarAny: boolean,
  titelSichtbarAny: boolean,
): Stufe {
  if (aktuelleStufe !== null) {
    return aktuelleStufe === 1 ? 1 : ((aktuelleStufe - 1) as Stufe);
  }
  if (contentSichtbarAny) return 1;
  if (titelSichtbarAny) return 2;
  return 3;
}

// Teilmengen-Test: ist jedes Element aus "teilmenge" (Überschriften UND Normen)
// auch im aktuellen Zustand "menge" enthalten? Grundlage der strukturellen
// ⌘←-Zielstufen-Ermittlung (siehe Dateikopf für die Begründung, warum dies
// hier statt einer Sichtbarkeits-Prüfung oder eines exakten Stufen-Treffers
// verwendet wird).
export function istTeilmengeVon(teilmenge: StufenKollaps, menge: StufenKollaps): boolean {
  for (const id of teilmenge.ueberschriften) if (!menge.ueberschriften.has(id)) return false;
  for (const id of teilmenge.normen) if (!menge.normen.has(id)) return false;
  return true;
}

// ⌘← (siehe Dateikopf): rein struktureller Teilmengen-Test statt
// Sichtbarkeits-Prüfung oder exaktem Stufen-Treffer. Ziel ist die kleinste
// Stufe ∈ {2,3,4}, deren Soll-Zustand (alleStufen[N]) noch nicht
// vollständig im aktuellen Zustand enthalten ist – die drei Prüfungen
// entsprechen direkt den drei Fällen aus dem Auftrag:
//   1. Ist Stufe 2 (alle Norminhalte versteckt) noch nicht vollständig
//      erreicht? → Ziel 2 ("alle Normtexte zuklappen").
//   2. Sonst: ist Stufe 3 (zusätzlich alle Blatt-Überschriften eingeklappt)
//      noch nicht vollständig erreicht? → Ziel 3 ("alle Normzeilen
//      verstecken").
//   3. Sonst: Ziel 4 ("alles einklappen").
export function ermittleZielStufeLinks(
  aktuellerZustand: StufenKollaps,
  alleStufen: Record<Stufe, StufenKollaps>,
): Stufe {
  if (!istTeilmengeVon(alleStufen[2], aktuellerZustand)) return 2;
  if (!istTeilmengeVon(alleStufen[3], aktuellerZustand)) return 3;
  return 4;
}

// Neues aktivesElementId für ⌘← (siehe Dateikopf, Fokus-Verhalten). ⌘→ braucht das
// nicht – dort bleibt aktivesElementId immer unverändert.
export function neuesAktivesElementLinks(
  zielStufe: Stufe,
  aktivesElementId: string | null,
  elemente: DarstellungsElement[],
  ueberschriftartigArr: boolean[],
  elternIndizes: (number | null)[],
): string | null {
  if (aktivesElementId === null) return null;
  let idx = elemente.findIndex((el) => el.data.id === aktivesElementId);
  if (idx === -1) return aktivesElementId;

  // Ist eine Norm aktiv und wird mindestens bis Stufe 3 zugeklappt,
  // wechselt der Fokus IMMER zur Elternüberschrift – unabhängig davon, ob
  // die Norm selbst (z. B. der "Art-4-Fall", siehe Dateikopf) als
  // Zeile sichtbar bleibt.
  if (zielStufe >= 3 && !ueberschriftartigArr[idx]) {
    // elternIndizes[idx] beweisbar sicher: idx stammt aus findIndex über
    // dasselbe elemente-Array (elternIndizes hat dieselbe Länge, siehe
    // ermittleElternIndizes).
    const elternIndex = elternIndizes[idx]!;
    if (elternIndex === null) return aktivesElementId; // kein Vorfahre (Gesetz ohne Gliederung)
    idx = elternIndex;
  }

  // Stufe 4: von dort (bzw. von einer bereits aktiven Überschrift) bis zur
  // obersten Überschriftenebene weiterspringen (Ur-Elternüberschrift) –
  // Stufe 4 zeigt ausschließlich diese.
  if (zielStufe === 4) {
    // elternIndizes[idx] beweisbar sicher: ermittleElternIndizes liefert nur
    // gültige Indizes innerhalb desselben Arrays oder null; idx bleibt daher
    // in jeder Iteration ein gültiger Index.
    while (elternIndizes[idx]! !== null) {
      idx = elternIndizes[idx] as number;
    }
  }

  // elemente[idx] beweisbar sicher (siehe Kommentare oben).
  return elemente[idx]!.data.id;
}

// Wandert von idx aus entlang der Elternkette (elternIndizes) und liefert
// den Index des ersten Vorfahren, der selbst Überschrift-artig UND im neuen
// (ueberschriften/normen)-Zustand kollabiert ist – oder null, wenn kein solcher
// Vorfahre existiert. Ausgelagert aus ermittleSichtbarenVorfahren (siehe
// dort für den Gesamtkontext), damit die äußere Funktion nur noch die
// Iteration über mehrere Vorfahren-Ebenen (Stufe-4-Fall) verantwortet.
function findeVerdeckendenVorfahren(
  idx: number,
  neueUeberschriften: ReadonlySet<string>,
  neueNormen: ReadonlySet<string>,
  elemente: DarstellungsElement[],
  ueberschriftartigArr: boolean[],
  elternIndizes: (number | null)[],
): number | null {
  // elternIndizes[idx] beweisbar sicher: idx ist stets ein gültiger Index
  // in elemente/elternIndizes (siehe Kommentare an den anderen Fundstellen
  // in dieser Datei).
  let p = elternIndizes[idx]!;
  while (p !== null) {
    if (ueberschriftartigArr[p]) {
      // elemente[p] beweisbar sicher: p stammt aus elternIndizes, das nur
      // gültige Indizes innerhalb desselben Arrays liefert.
      const el = elemente[p]!;
      const kollabiert =
        el.typ === 'ueberschrift' ? neueUeberschriften.has(el.data.id) : neueNormen.has(el.data.id);
      if (kollabiert) return p;
    }
    p = elternIndizes[p]!;
  }
  return null;
}

// Scroll-Anker für ⌘← (siehe Dateikopf, "Scroll-Anker statt aktivesElementId"):
// bleibt die Zeile an startIdx unter dem NEUEN (ueberschriften, normen)-Zustand
// sichtbar, wird startIdx unverändert zurückgegeben. Sonst wird entlang der
// Elternkette (elternIndizes) zum nächsten Vorfahren gewandert, der selbst
// Überschrift-artig UND in der neuen Kollaps-Menge enthalten ist – dessen
// eigene Zeile bleibt laut berechneVisibleElemente
// (strukturAuswertung.ts) immer sichtbar, unabhängig vom eigenen
// Kollaps-Status (nur seine Kinder werden durch ihn verdeckt). Iterativ,
// nicht nur ein Schritt: bei einem Sprung zu Stufe 4 können mehrere
// Vorfahren-Ebenen gleichzeitig neu eingeklappt werden – erst der Vorfahre,
// dessen EIGENE Vorfahrenkette frei von einer neuen Verdeckung ist, ist
// tatsächlich sichtbar (das "(Ur-)Elternelement" aus dem Auftrag).
function ermittleSichtbarenVorfahren(
  startIdx: number,
  neueUeberschriften: ReadonlySet<string>,
  neueNormen: ReadonlySet<string>,
  elemente: DarstellungsElement[],
  ueberschriftartigArr: boolean[],
  elternIndizes: (number | null)[],
): number {
  let idx = startIdx;
  // Obergrenze gegen (eigentlich unmögliche) Zyklen/Endlosschleifen – die
  // Elternkette ist endlich (Baumtiefe), diese Zahl liegt sicher darüber.
  for (let schritt = 0; schritt < elemente.length; schritt++) {
    const verdeckendeVorfahrIdx = findeVerdeckendenVorfahren(
      idx,
      neueUeberschriften,
      neueNormen,
      elemente,
      ueberschriftartigArr,
      elternIndizes,
    );
    if (verdeckendeVorfahrIdx === null) return idx;
    idx = verdeckendeVorfahrIdx;
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Anwendung der Zielstufe auf den aktuellen Zustand (siehe Dateikopf von
// useStrukturZustand.ts, "⌘← vereinigt, ⌘→ ersetzt") – extrahiert aus
// behandeln() dort (Cognitive-Complexity-Reduktion).
// ---------------------------------------------------------------------------

// ⌘← vereinigt den Soll-Zustand der Zielstufe mit dem AKTUELLEN Zustand
// (niemals aufklappen); ⌘→ ersetzt blank durch den Soll-Zustand (siehe
// Dateikopf für die Begründung, warum das für ⌘→ nachweislich sicher ist).
export function baueEingeklappteMengenFuerZielstufe(
  richtung: Richtung,
  zielStufe: Stufe,
  alleStufen: Record<Stufe, StufenKollaps>,
  aktuell: StufenKollaps,
): StufenKollaps {
  if (richtung === 'rechts') {
    return {
      ueberschriften: alleStufen[zielStufe].ueberschriften,
      normen: alleStufen[zielStufe].normen,
    };
  }
  const ueberschriften = new Set(aktuell.ueberschriften);
  for (const id of alleStufen[zielStufe].ueberschriften) ueberschriften.add(id);
  const normen = new Set(aktuell.normen);
  for (const id of alleStufen[zielStufe].normen) normen.add(id);
  return { ueberschriften, normen };
}

// Scrollziel-Ermittlung für den Anker (siehe Dateikopf von
// useStrukturZustand.ts, "Scroll-Anker statt aktivesElementId") – extrahiert
// aus behandeln() dort. Die reale Bildschirmposition VOR der Änderung
// (ankerRectTopVorherRef, DOM-Zugriff) wird bewusst NICHT hier gemessen: sie
// hat keinen Einfluss auf zielId/zielOffset und bleibt daher als reiner
// DOM-Seiteneffekt im Hook selbst.
export function ermittleZielFuerAnker(
  ankerElementAlt: DarstellungsElement | undefined,
  ankerOffsetAlt: number,
  richtung: Richtung,
  volleListe: DarstellungsElement[],
  neueUeberschriften: ReadonlySet<string>,
  neueNormen: ReadonlySet<string>,
  ueberschriftartigArr: boolean[],
  elternIndizes: (number | null)[],
): { zielId: string | null; zielOffset: number } {
  if (ankerElementAlt == null) return { zielId: null, zielOffset: 0 };

  let ankerVolleListeIdx = volleListe.findIndex((el) => el.data.id === ankerElementAlt.data.id);
  if (ankerVolleListeIdx === -1) return { zielId: null, zielOffset: 0 };

  // Nur ⌘← kann die Ankerzeile durch neues Einklappen verdecken (⌘← klappt
  // nur auf, siehe Dateikopf von useStrukturZustand.ts) – dann auf den
  // nächsten sichtbaren Vorfahren umbiegen.
  if (richtung === 'links') {
    ankerVolleListeIdx = ermittleSichtbarenVorfahren(
      ankerVolleListeIdx,
      neueUeberschriften,
      neueNormen,
      volleListe,
      ueberschriftartigArr,
      elternIndizes,
    );
  }
  // ankerVolleListeIdx ist hier stets ein gültiger Index in volleListe:
  // entweder der findIndex-Treffer (!== -1 oben geprüft) oder der
  // Rückgabewert von ermittleSichtbarenVorfahren, der laut dessen Vertrag
  // ebenfalls immer ein gültiger Index in elemente (hier volleListe) ist.
  const zielElement = volleListe[ankerVolleListeIdx]!;
  const zielOffset =
    ankerElementAlt.data.id === zielElement.data.id
      ? ankerOffsetAlt
      : // Auf einen Vorfahren umgebogen: dessen Zeile war vorher gar nicht
        // die oberste sichtbare, ein übernommenes Offset ergäbe keinen Sinn
        // – stattdessen an dessen Oberkante (Offset 0) ausrichten.
        0;
  return { zielId: zielElement.data.id, zielOffset };
}
