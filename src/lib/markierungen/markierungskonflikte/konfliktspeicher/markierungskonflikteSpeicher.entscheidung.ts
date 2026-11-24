// markierungskonflikteSpeicher.entscheidung.ts
//
// Reine Entscheidungs-/Diff-Logik, aus fuehrePruefungAus() in
// markierungskonflikteSpeicher.ts herausgelöst (Cognitive-Complexity-Reduktion,
// siehe dortiger Kopfkommentar zur 500-Zeilen-Aufteilung). Bewusst OHNE
// jeden Datei-/AppData-Zugriff – alle Funktionen hier bekommen bereits
// geladene Daten (eintraege, alleGesetze, gespeicherte Konflikte) übergeben und geben
// entweder die neuen gespeicherten Konflikte (oder undefined = löschen) bzw. ein reines
// bool zurück. Das macht sie ohne vi.mock direkt testbar (siehe
// Testkonvention: keine Mocks für dünne I/O-Orchestrierung, stattdessen
// pure Funktionen exportieren).

import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { pruefeMarkierungenEinesGesetzes } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { GespeicherteGesetzKonflikte } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  aktualisiereZielkonflikte,
  erstelleGespeicherteGesetzKonflikte,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

/**
 * Entscheidet die neuen gespeicherten Konflikte für EIN Gesetz aus `betroffene` (Schritt
 * (a) in fuehrePruefungAus – vollständige Neuprüfung). `eintraege` muss
 * bereits geladen sein (ladeEintraege bleibt Sache des Aufrufers, reines
 * I/O). Gibt undefined zurück, wenn der Block gelöscht werden soll (keine
 * Einträge mehr ODER kein Konflikt mehr) – der Aufrufer entscheidet dann
 * zwischen gesetzKonflikte.set/gesetzKonflikte.delete.
 */
export function entscheideEigenerBlock(
  gesetz: Gesetzesreferenz,
  eintraege: MarkierungsEintrag[],
  alleGesetze: GesetzDarstellung[],
  nichtamtlicheTitelVorhanden: Set<string>,
): GespeicherteGesetzKonflikte | undefined {
  if (eintraege.length === 0) return undefined;
  const eigenesGesetz = alleGesetze.find((g) => istGleichesGesetz(g, gesetz));
  const ergebnis = pruefeMarkierungenEinesGesetzes(
    gesetz,
    eigenesGesetz,
    eintraege,
    alleGesetze,
    nichtamtlicheTitelVorhanden,
  );
  if (
    ergebnis.fehlendesGesetz ||
    ergebnis.nichtamtlicheTitelXmlFehlt ||
    ergebnis.eintraege.length > 0
  ) {
    return erstelleGespeicherteGesetzKonflikte(ergebnis);
  }
  return undefined;
}

/**
 * Entscheidet die neuen gespeicherten Konflikte für EIN referenzierendes Gesetz (Schritt
 * (b) in fuehrePruefungAus – gezieltes Patchen, siehe
 * aktualisiereZielkonflikte). Gibt undefined zurück, wenn der Block
 * gelöscht werden soll.
 */
export function entscheidePatchBlock(
  vorher: GespeicherteGesetzKonflikte | undefined,
  eintraege: MarkierungsEintrag[],
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  betroffene: Set<string>,
): GespeicherteGesetzKonflikte | undefined {
  return aktualisiereZielkonflikte(vorher, eintraege, eigenesGesetz, alleGesetze, betroffene);
}

// Baut aus den gespeicherten Konflikten eines Gesetzes die Menge seiner Konflikt-"Signaturen"
// (identitaetsSchluessel + Konfliktart, bei Zielkonflikte zusätzlich das
// Zielgesetz) – dient AUSSCHLIESSLICH dem Zunahme-Vergleich in
// berechneNeueKonflikte unten, keinem anderen Zweck. gesetzFehlt (ganzes Gesetz
// fehlt) bekommt eine feste Pseudo-Signatur, da es dafür keine einzelne
// Markierung/kein identitaetsSchluessel gibt – ebenso nichtamtlicheTitelXmlFehlt (siehe
// markierungskonfliktPruefung.ts: gilt fürs ganze Gesetz, nicht für eine
// einzelne Markierung).
const GESETZ_FEHLT_SIGNATUR = '__gesetz-fehlt__';
const TITELDATEI_FEHLT_SIGNATUR = '__nichtamtliche-titel-fehlen__';

export function signaturenGespeicherterKonflikte(
  konflikte: GespeicherteGesetzKonflikte | undefined,
): Set<string> {
  const signaturen = new Set<string>();
  if (!konflikte) return signaturen;
  // Ein fehlendesGesetz-Block (gesetzFehlt) enthält NUR diesen Konflikt und
  // sonst nichts (siehe Bau gespeicherter Gesetzeskonflikte) – er reicht daher
  // als Kurzschluss, unabhängig davon, ob auch Markierungen fehlen:
  // nichtamtlicheTitelXmlFehlt hat ebenfalls keine Markierungen, wenn es der
  // einzige Konflikt des Gesetzes ist.
  if (konflikte.fehlendesGesetz) {
    signaturen.add(GESETZ_FEHLT_SIGNATUR);
    return signaturen;
  }
  if (konflikte.nichtamtlicheTitelXmlFehlt) signaturen.add(TITELDATEI_FEHLT_SIGNATUR);
  for (const e of konflikte.eintraege) {
    if (e.eigenerKonflikt) signaturen.add(`${e.schluessel}:eigen:${e.eigenerKonflikt}`);
    for (const z of e.zielKonflikte)
      signaturen.add(`${e.schluessel}:ziel:${gesetzesreferenzSchluessel(z.gesetz)}:${z.typ}`);
  }
  return signaturen;
}

/**
 * "Neue Konflikte erkannt?" – bewusst ein reiner Zunahme-Vergleich (siehe
 * Absprache): eine reine Auflösung/Verschiebung bestehender Konflikte (z.B.
 * zielGesetzFehlt → zielNormUnpassend, weil das Zielgesetz jetzt existiert) soll das Fenster
 * NICHT erneut öffnen, nur das Hinzukommen einer bisher nicht vorhandenen
 * Konflikt-Signatur. `gesetzesschluessel` muss vom Aufrufer auf die in diesem Lauf
 * tatsächlich berührten Referenzen (betroffene ∪ referenzierend) eingeschränkt
 * werden – alle anderen Blöcke sind unverändert roh übernommen und daher für
 * den Vergleich irrelevant.
 */
export function berechneNeueKonflikte(
  gesetzesschluessel: Set<string>,
  vorherGesetzKonflikte: ReadonlyMap<string, GespeicherteGesetzKonflikte>,
  nachherGesetzKonflikte: ReadonlyMap<string, GespeicherteGesetzKonflikte>,
): boolean {
  for (const schluessel of gesetzesschluessel) {
    const vorher = signaturenGespeicherterKonflikte(vorherGesetzKonflikte.get(schluessel));
    const nachher = signaturenGespeicherterKonflikte(nachherGesetzKonflikte.get(schluessel));
    for (const s of nachher) {
      if (!vorher.has(s)) return true;
    }
  }
  return false;
}
