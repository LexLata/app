// Ergebnisverträge des Zitatparsers; reine Typen ohne Auflösungslogik.
// Ablauf und Verantwortlichkeiten stehen im Kopf von zitatParser.ts.

import type { ZusatzArt } from '@/lib/markierungen/zitat/zitatParser.tokenizer';

export interface RohNormZitat {
  /** Rohe Kurztitel-Eingabe (Groß-/Kleinschreibung wie eingegeben, siehe
   *  Auflösung in verweismarkierungAktionen.zitatAufloesung.ts) – undefined = Ausgangsgesetz. */
  gesetzRoh?: string;
  /** Nächste ausdrückliche Gesetzesangabe vor einem Semikolon. Nur prüfen,
   * wenn die Norm ohne eigene Gesetzesangabe im Ausgangsgesetz fehlt.
   * Die Textposition übernimmt die bindende Auswahl dieser Gesetzesangabe. */
  spaetereGesetzesangabe?: { gesetzRoh: string; textStart: number };
  /** Rohe Normzahl, ggf. zweiteilig (Gliederungsartikel-Binnenparagraph,
   *  z.B. "229 2" für "Art. 229 § 2"), Leerzeichen-getrennt im Eingabetext. */
  normzahlRoh: string;
  /** Ausdrückliche Normpräfixe, kanonisch als Einzelpräfixe; auch bei
   * Zahlenketten fortgeführt. Ohne Symbol bleibt die Familie offen.
   * Bei „Art. 229 6“ ist nur das tatsächlich genannte Artikelpräfix enthalten;
   * die exakte Auflösung prüft den Binnenparagraphen anhand des Gesetzes. */
  praefix?: string[];
  /** Geordnete Deutungen einer bloßen Folgenummer unter einem
   * Gliederungsartikel: zuerst Binnenparagraph, danach eigenständiger Artikel.
   * Vorläufige Kandidaten; keine zusätzliche gespeicherte Zustandsquelle. */
  normKandidaten?: Array<{ normzahlRoh: string; praefix: string[] }>;
  /** Wie im Zitat-Text tatsächlich geschrieben (inkl. Symbol, falls direkt
   *  davor eines stand, z.B. "Art. 9999" oder nur "281" bei einer
   *  komma-getrennten Folgenorm) – für präzise Fehlermeldungen beim
   *  Auflösen (siehe verweismarkierungAktionen.zitatAufloesung.ts: "Art. 9999 existiert nicht in
   *  BGB" statt einer generischen Meldung). */
  anzeigeText: string;
  /** Position dieses Zitats innerhalb des rohen Eingabetexts – kachelt
   *  lückenlos mit den Nachbar-Einträgen (erster Start = 0, letztes Ende =
   *  text.length), siehe Kommentar in markierungSpeicher.ts:
   *  Verweisziel.verweistextZeichenbereich. */
  textStart: number;
  textEnde: number;
  /**
   * true = dieser Textbereich ist reine Zusatzinformation OHNE erkennbaren
   * Normbezug (z.B. alleinstehendes/eingeschobenes "Abs. 3", "S. 2", "III")
   * – erzeugt kein Verweisziel. normzahlRoh/anzeigeText bleiben in
   * diesem Fall leer und werden nicht ausgewertet; verweismarkierungAktionen.zitatAufloesung.ts
   * überspringt für solche Einträge jede Auflösung/Existenzprüfung.
   */
  ohneZiel?: boolean;
  /** Verweis auf ein ganzes Gesetz, etwa „GG“: gesetzRoh ist gesetzt,
   * normzahlRoh bleibt leer. Keine Existenzprüfung einer konkreten Norm.
   * Öffnen des gesamten Gesetzes durch den Aufrufer. Der interne Feldname
   * bezeichnet keinen fehlenden Bezugstext einer Markierung. */
  ganzesGesetz?: boolean;
}

/**
 * Mehrdeutige Kommagrenze nach Abs/S/Nr/lit unter einem §-/Art.-Singular oder
 * ohne Symbol (siehe Ablaufkommentar in zitatParser.ts): `index` ist der
 * bereits als eigenständige Norm angelegte KANDIDAT – löst der Aufrufer die
 * Prüfung POSITIV auf (die Norm
 * an `vorherigerIndex` hat tatsächlich ein `art` mit Bezeichnung `wert`),
 * verwirft er den Kandidaten wieder (aus dem zitate-Array entfernen) und
 * lässt `vorherigerIndex` dessen Textbereich stattdessen mit übernehmen.
 */
export interface AmbiguerPunkt {
  index: number;
  vorherigerIndex: number;
  art: ZusatzArt;
  wert: string;
  /**
   * Zum Zeitpunkt der Mehrdeutigkeit bereits etablierte übergeordnete
   * Kontext-Werte (siehe ZusatzKontext in normStrukturPruefung.ts) – für die
   * hierarchische statt normweit-flachen Existenzprüfung. `absatzKontext`
   * ist nur gesetzt, wenn `art` NICHT selbst 'absatz' ist (Absatz ist die
   * oberste Ebene, braucht keinen eigenen Kontext); `satzKontext` nur bei
   * 'nummer'/'litera'; `nummerKontext` nur bei 'litera'. Undefined bedeutet
   * jeweils "kein Absatz/Unterabsatz/Satz/Nr. zuvor im Zitat genannt" – die
   * Prüfung fällt dann auf die normweite Suche zurück (siehe
   * pruefeZusatzangabe). `unterabsatzKontext` ist wie `satzKontext` nur bei
   * 'satz'/'nummer'/'litera' gesetzt (Unterabsatz liegt zwischen Absatz und
   * Satz, siehe VERFEINERUNGS_EBENE in zitatParser.helpers.ts).
   */
  absatzKontext?: string;
  unterabsatzKontext?: string;
  satzKontext?: string;
  nummerKontext?: string;
  /**
   * Weitere Abs/S/Nr/lit-Angaben, die DIREKT (vor dem nächsten Komma) auf den
   * Kandidatenwert selbst folgen und ihn damit präzisieren (z.B. "434 Abs 1,
   * 2 Abs 3" → Kette [{art:'absatz', wert:'3'}] für den Kandidaten "2").
   * Ist eine Kette vorhanden, genügt die Prüfung von `wert` allein nicht
   * mehr – es muss zusätzlich geprüft werden, ob der Kandidat SELBST diese
   * Kette enthält (siehe pruefeZusatzangabeMitKette in
   * normStrukturPruefung.ts). Strukturell unmögliche Ketten (z.B. Absatz
   * gefolgt von Absatz – Absätze haben keine Absätze) führen bereits beim
   * Parsen dazu, dass gar kein AmbiguerPunkt entsteht, siehe
   * VERFEINERUNGS_EBENE in zitatParser.helpers.ts.
   */
  verfeinerung?: Array<{ art: ZusatzArt; wert: string }>;
}

export interface ZitatParseErgebnis {
  zitate: RohNormZitat[];
  ambiguitaeten: AmbiguerPunkt[];
}
