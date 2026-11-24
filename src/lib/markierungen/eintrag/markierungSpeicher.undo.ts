// Rückgängig/Wiederholen für Markierungen über die gemeinsame Quellkoordination und Einzelaktionen.
// Lesen und Schreiben bleiben in den jeweiligen Speicher-Begleitdateien.
//
// Generischer, erweiterbarer Aktionstyp für die Undo/Redo-Historie: jede
// Markierungs-verändernde Aktion (Hinzufügen, Entfernen, Ersetzen ODER
// Bearbeiten eines Verweises/Kommentars) landet als EIN
// MarkierungsAktion-Objekt auf dem Undo-Stack in useMarkierungen.ts.
// fuehreRueckgaengigAus/fuehreWiederholenAus wissen je Aktionsart, welche
// Persistenz-Funktion in welche Richtung aufzurufen ist – die
// Undo-Stack-Verwaltung selbst (Push/Pop, Fenster-Zustellung) bleibt komplett
// unwissend über diese Details. Künftige Markierungs-Features ergänzen hier
// einfach eine weitere Aktionsart plus einen Fall in beiden
// fuehre…Aus-Funktionen.

// Reiner Typ-/Funktions-Import aus markierungskonfliktPruefung.ts (IO-frei,
// siehe dort) – kein zirkulärer Laufzeit-Import, analog zum bestehenden
// Import in markierungSpeicher.ts.

import { eintraegeSindGleich } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { markierungsBezug } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import type {
  Elementstand,
  MarkierungsEintrag,
  VerweisInhalt,
} from '@/lib/markierungen/eintrag/markierungSpeicher';
import { mitMarkierungsQuelle } from '@/lib/markierungen/eintrag/markierungSpeicher';
import { ladeEintraegeUnterSperre } from '@/lib/markierungen/eintrag/markierungSpeicher.lesen';
import { schreibeEintraege } from '@/lib/markierungen/eintrag/markierungSpeicher.aendern';
import { entferneMarkierung } from '@/lib/markierungen/eintrag/markierungSpeicher.aktionen';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';

/** Rückgängig: entferneMarkierung(eintrag). Wiederholen: hinzufuegenMarkierung(eintrag). */
export interface MarkierungHinzufuegenAktion {
  art: 'hinzufuegen';
  gesetz: Gesetzesreferenz;
  eintrag: MarkierungsEintrag;
}

/** Vollständige Verweis-Bearbeitungswerte für Wiederherstellung ohne neue Zeitstempel. */
export interface VerweisBearbeitenWerte {
  erstellt?: string;
  geaendert?: string;
  verweisinhalt: VerweisInhalt;
  textstelle?: Textstelle;
  bezugstext?: string;
  elementstand?: Elementstand;
}
export interface MarkierungVerweisBearbeitenAktion {
  art: 'verweisBearbeiten';
  gesetz: Gesetzesreferenz;
  ziel: { ausgangsstelle: Ausgangsstelle };
  vorher: VerweisBearbeitenWerte;
  nachher: VerweisBearbeitenWerte;
}

/** Vollständige Kommentar-Bearbeitungswerte für Wiederherstellung ohne neue Zeitstempel. */
export interface KommentarBearbeitenWerte {
  erstellt?: string;
  geaendert?: string;
  elementstand?: Elementstand;
  kommentarText: string;
  textstelle?: Textstelle;
  bezugstext?: string;
}
export interface MarkierungKommentarBearbeitenAktion {
  art: 'kommentarBearbeiten';
  gesetz: Gesetzesreferenz;
  ziel: { ausgangsstelle: Ausgangsstelle };
  vorher: KommentarBearbeitenWerte;
  nachher: KommentarBearbeitenWerte;
}

/** Rückgängig: hinzufuegenMarkierung(eintrag). Wiederholen: entferneMarkierung(eintrag).
 *  Gegenstück zu MarkierungHinzufuegenAktion – für "Markierung löschen" im
 *  Rechtsklick-Kontextmenü (siehe useMarkierungen.ts: handleMarkierungLoeschen). */
export interface MarkierungEntfernenAktion {
  art: 'entfernen';
  gesetz: Gesetzesreferenz;
  eintrag: MarkierungsEintrag;
}

/** Rückgängig: entferneMarkierung(neu, falls vorhanden) + entferneMarkierung
 *  für jedes rest-Stück, dann roheWiederherstellung(entfernt) für jeden
 *  ORIGINAL-Alt-Eintrag. Wiederholen: roheWiederherstellung wieder entfernen,
 *  rest + neu (falls vorhanden) erneut schreiben – siehe
 *  fuehreRueckgaengigAus/fuehreWiederholenAus unten. Entsteht, wenn
 *  hinzufuegenMarkierung dabei bestehende 'unterstreichung'/'hervorhebung'-Einträge
 *  (teilweise) entfernt, mit dem neuen Eintrag zu EINEM größeren Eintrag
 *  zusammengeführt, ODER (Toggle-Aus) ganz ohne neuen Eintrag nur entfernt
 *  hat (siehe Konkurrenz-Regeln in markierungSpeicher.ts) – in allen Fällen
 *  reicht das simple MarkierungHinzufuegenAktion nicht, da mehr als nur ein
 *  Eintrag selbst auf der Platte verändert wurde. */
export interface MarkierungErsetzenAktion {
  art: 'ersetzen';
  gesetz: Gesetzesreferenz;
  /** Der tatsächlich geschriebene (ggf. zusammengeführte) neue Eintrag.
   *  Fehlt beim reinen Toggle-Aus (Auswahl war bereits vollständig
   *  gleichartig markiert, siehe hinzufuegenMarkierung). */
  neu?: MarkierungsEintrag;
  /** Die tatsächlich geschriebenen Rest-Stücke (Split-Ergebnis der
   *  Alt-Einträge, die nur TEILWEISE entfernt wurden – leer, wenn alle
   *  Alt-Einträge vollständig im neuen Bereich aufgingen). */
  rest: MarkierungsEintrag[];
  /** Alt-Einträge, die dabei entfernt wurden – deren VOLLSTÄNDIGER,
   *  UNVERÄNDERTER Vorher-Zustand (nicht nur der entfernte Teil). */
  entfernt: MarkierungsEintrag[];
  /** Nur in der Fenster-Historie: nach einem Fehler offene Einzelschritte
   *  fortsetzen. Wird bei Abschluss entfernt und nicht auf Platte gespeichert. */
  fortschritt?: {
    richtung: 'rueckgaengig' | 'wiederholen';
    naechsterSchritt: number;
    erfolgreich: boolean;
  };
}

export type MarkierungsAktion =
  | MarkierungHinzufuegenAktion
  | MarkierungEntfernenAktion
  | MarkierungErsetzenAktion
  | MarkierungVerweisBearbeitenAktion
  | MarkierungKommentarBearbeitenAktion;

/** Fügt `eintrag` OHNE jede Konkurrenz-/Konfliktprüfung hinzu (Gegenstück zur
 *  öffentlichen, konfliktauflösenden hinzufuegenMarkierung in
 *  markierungSpeicher.ts) – nur für Undo/Redo gebraucht (siehe
 *  fuehreRueckgaengigAus/fuehreWiederholenAus unten): dort wird ein Zustand
 *  REPLIZIERT, der bereits einmal gültig auf der Platte stand, eine erneute
 *  Konfliktauflösung wäre hier unpassend (kein Banner beim stillen
 *  Rückgängigmachen/Wiederholen). */
async function wiederherstellenEintrag(
  gesetz: Gesetzesreferenz,
  eintrag: MarkierungsEintrag,
): Promise<boolean> {
  return mitMarkierungsQuelle(gesetz, async (token, vorgang, geaendert) => {
    const bisherige = await ladeEintraegeUnterSperre(gesetz, token, vorgang, geaendert);
    await schreibeEintraege(gesetz, [...bisherige, eintrag], token, vorgang);
    // Zentraler Trigger, analog zu entferneMarkierung/aktualisiereZielnorm/
    // aktualisiereKommentar in markierungSpeicher.ts: prüft GENAU diesen einen
    // wiederhergestellten Eintrag neu gegen markierungskonflikte.xml. Deckt damit
    // Undo einer Löschung (der Eintrag hatte ggf. vorher einen Konflikt, der
    // beim Löschen entfernt wurde – siehe entferneMarkierung) UND Redo eines
    // Hinzufügens ab, ohne dass eine Unterscheidung nötig ist, WORÜBER der
    // Eintrag zurückkam (kein Flag auf dem Undo-Stack-Eintrag nötig).
    geaendert(identitaetsSchluessel(eintrag));
    return true;
  });
}

/** Führt Ersetzen in der jeweiligen Richtung aus. Jeder Einzelschritt
 *  bleibt separat gesperrt. Bei einem geworfenen Fehler bleiben Fortschritt
 *  und bisheriges Gesamtergebnis an der Historienaktion erhalten; ein erneuter
 *  Versuch wiederholt nur die offenen Schritte. Nicht gefundene Einträge
 *  zählen weiterhin als Misserfolg, ohne die übrigen Schritte abzubrechen. */
async function fuehreErsetzenAus(
  aktion: MarkierungErsetzenAktion,
  richtung: 'rueckgaengig' | 'wiederholen',
): Promise<boolean> {
  const { gesetz, neu, rest, entfernt } = aktion;
  const neueEintraege = neu ? [...rest, neu] : rest;
  // Rückgängig entfernt zuerst neu, dann die Rest-Stücke wie bisher.
  const zuEntfernen = richtung === 'rueckgaengig' ? [...(neu ? [neu] : []), ...rest] : entfernt;
  const zuWiederherstellen = richtung === 'rueckgaengig' ? entfernt : neueEintraege;
  const schritte = [
    ...zuEntfernen.map((eintrag) => () => entferneMarkierung(gesetz, eintrag)),
    ...zuWiederherstellen.map((eintrag) => () => wiederherstellenEintrag(gesetz, eintrag)),
  ];
  if (aktion.fortschritt?.richtung !== richtung) {
    aktion.fortschritt = { richtung, naechsterSchritt: 0, erfolgreich: true };
  }
  const fortschritt = aktion.fortschritt;
  for (const schritt of schritte.slice(fortschritt.naechsterSchritt)) {
    if (!(await schritt())) fortschritt.erfolgreich = false;
    fortschritt.naechsterSchritt += 1;
  }
  delete aktion.fortschritt;
  return fortschritt.erfolgreich;
}

/** Macht `aktion` rückgängig. `false` = Stelle nicht mehr auffindbar (z.B.
 *  Datei zwischenzeitlich extern geändert) – Aufrufer verwirft die Aktion
 *  dann still (siehe useMarkierungen.ts), analog zum Best-effort-Umgang in
 *  markierungSpeicher.ts. */
export async function fuehreRueckgaengigAus(aktion: MarkierungsAktion): Promise<boolean> {
  switch (aktion.art) {
    case 'hinzufuegen':
      return entferneMarkierung(aktion.gesetz, aktion.eintrag);
    case 'entfernen':
      return wiederherstellenEintrag(aktion.gesetz, aktion.eintrag);
    case 'ersetzen':
      return fuehreErsetzenAus(aktion, 'rueckgaengig');
    case 'kommentarBearbeiten':
    case 'verweisBearbeiten':
      return stelleBearbeitungWiederHer(
        aktion.gesetz,
        eintragAusBearbeitungsWerten(aktion, 'nachher'),
        eintragAusBearbeitungsWerten(aktion, 'vorher'),
      );
  }
}

/** Wiederholt eine zuvor rückgängig gemachte `aktion`. */
export async function fuehreWiederholenAus(aktion: MarkierungsAktion): Promise<boolean> {
  switch (aktion.art) {
    case 'hinzufuegen':
      return wiederherstellenEintrag(aktion.gesetz, aktion.eintrag);
    case 'entfernen':
      return entferneMarkierung(aktion.gesetz, aktion.eintrag);
    case 'ersetzen':
      return fuehreErsetzenAus(aktion, 'wiederholen');
    case 'kommentarBearbeiten':
    case 'verweisBearbeiten':
      return stelleBearbeitungWiederHer(
        aktion.gesetz,
        eintragAusBearbeitungsWerten(aktion, 'vorher'),
        eintragAusBearbeitungsWerten(aktion, 'nachher'),
      );
  }
}

/** Die Historie repliziert den tatsächlich gespeicherten Stand einschließlich seiner Zeitfelder. */
async function stelleBearbeitungWiederHer(
  gesetz: Gesetzesreferenz,
  ziel: MarkierungsEintrag,
  stand: MarkierungsEintrag,
): Promise<boolean> {
  return mitMarkierungsQuelle(gesetz, async (token, vorgang, geaendert) => {
    const eintraege = await ladeEintraegeUnterSperre(gesetz, token, vorgang, geaendert);
    const index = eintraege.findIndex(
      (e) => identitaetsSchluessel(e) === identitaetsSchluessel(ziel),
    );
    if (index < 0) return false;
    const bisher = eintraege[index];
    if (
      bisher &&
      bisher.erstellt === stand.erstellt &&
      bisher.geaendert === stand.geaendert &&
      eintraegeSindGleich(gesetz, [bisher], [stand])
    )
      return true;
    eintraege[index] = stand;
    await schreibeEintraege(gesetz, eintraege, token, vorgang);
    geaendert(identitaetsSchluessel(stand));
    return true;
  });
}

/** Ein einziger Historienstand enthält Bezug, Inhalt und seine ursprünglichen Zeitfelder. */
function eintragAusBearbeitungsWerten(
  aktion: MarkierungKommentarBearbeitenAktion | MarkierungVerweisBearbeitenAktion,
  richtung: 'vorher' | 'nachher',
): MarkierungsEintrag {
  const werte = aktion[richtung];
  const basis = {
    ausgangsstelle: aktion.ziel.ausgangsstelle,
    bezug: markierungsBezug(werte),
    erstellt: werte.erstellt,
    geaendert: werte.geaendert,
  };
  return aktion.art === 'kommentarBearbeiten'
    ? { ...basis, typ: 'kommentar', kommentarText: aktion[richtung].kommentarText }
    : { ...basis, typ: 'verweismarkierung', verweisinhalt: aktion[richtung].verweisinhalt };
}

/** Übernimmt die tatsächlichen Speicherangaben in die bestehenden Historienfelder. */
export function gemeinsameBearbeitungsWerte(eintrag: MarkierungsEintrag) {
  return {
    erstellt: eintrag.erstellt,
    geaendert: eintrag.geaendert,
    textstelle: eintrag.bezug.textstelle,
    bezugstext: eintrag.bezug.bezugstext,
    elementstand: eintrag.bezug.elementstand,
  };
}
