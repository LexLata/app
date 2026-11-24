// textpfad.rueckwaerts.ts
//
// Ausgelagert aus textpfad.ts (siehe dortiger Kopfkommentar für die
// vollständige Aufteilung). Rückwärts-Gegenstück zu ermittleAuswahl: löst
// einen Textpfad direkt gegen den NormDarstellung-Baum auf (ohne DOM, ohne
// dass die Norm gerendert sein muss) – einzige Verwendung aktuell: die
// Markierungskonflikt-Prüfung (markierungskonfliktPruefung.ts), die eine
// gespeicherte Markierung (bezugstext) mit dem aktuellen Normtext abgleichen
// muss.

import { satzNummer } from './textpfad.satz';
import type { Textpfad, Textstelle } from '@/lib/domain/textpfad/textpfad';
import type {
  NormDarstellung,
  UeberschriftDarstellung,
  SatzDarstellung,
  ListenEintragDarstellung,
} from '@/lib/domain/gesetzTypes';
// schuetzeLeerzeichen MUSS exakt dieselbe Funktion sein wie beim Rendern
// (TextBlatt über geschuetzterBlatttext) – sonst würde textAnTextpfad an
// anderen Zeichen-Positionen zählen als zeichenbereichStart/zeichenbereichEnde es beim
// Erstellen taten. Eine zweite, eigene Kopie dieser Funktion würde genau
// dieses Auseinanderlaufen riskieren. Die Domain→Darstellung-Beziehung ist
// deshalb ausdrücklich auf diese Dateikante begrenzt (dependency-cruiser);
// ESLint erlaubt daraus ausschließlich den benannten Import dieser Funktion.
import { schuetzeLeerzeichen } from '@/lib/domain/basis/textNachbearbeitung';

// Sucht in `eintraege` den Eintrag mit `bezeichnung` an der `wiederholung`-ten
// Stelle (0-basiert) unter Geschwistern mit identischer Bezeichnung – exakt
// dieselbe Zählweise wie wiederholungsIndex in
// satzEintragBausteine.tsx (dort vorwärts: Index → Anzahl
// gleicher Vorgänger; hier rückwärts: gesuchte Anzahl → Index).
function findeMitWiederholung(
  eintraege: ListenEintragDarstellung[],
  bezeichnung: string,
  wiederholung: number,
): ListenEintragDarstellung | undefined {
  let anzahl = 0;
  for (const e of eintraege) {
    if (e.bezeichnung === bezeichnung) {
      if (anzahl === wiederholung) return e;
      anzahl++;
    }
  }
  return undefined;
}

// Findet den durch pfad.eintraege adressierten Aufzählungseintrag: steigt
// die VOLLSTÄNDIGE Kette Schritt für Schritt ab (Wurzel → Blatt), bei jedem
// Schritt gescopt auf die Geschwister GENAU dieser Ebene (untereintraege des
// zuvor gefundenen Eintrags) – ersetzt den früheren Nummer/Litera-Sonderfall
// vollständig, da die Kette jeden Schritt bereits eindeutig enthält (siehe
// Textpfad.eintraege-Kommentar in textpfad.ts).
function findeEintrag(satz: SatzDarstellung, pfad: Textpfad): ListenEintragDarstellung | undefined {
  const kette = pfad.eintraege ?? [];
  let kandidaten: ListenEintragDarstellung[] = satz.eintraege;
  let treffer: ListenEintragDarstellung | undefined;
  for (const schritt of kette) {
    treffer = findeMitWiederholung(kandidaten, schritt.bezeichnung, schritt.wiederholung ?? 0);
    if (!treffer || treffer.ebene !== schritt.ebene) return undefined;
    kandidaten = treffer.untereintraege;
  }
  return treffer;
}

/**
 * (ENTFERNT: findeUebergeordneteNummer. War ein Baum-Rücksuchen für den
 * übergeordneten Nummer-Wert einer litera, nötig weil Textpfad früher nur
 * `nummer`/`litera` als zwei feste Einzelfelder hatte und den Weg dorthin
 * nicht mitführte. Mit Textpfad.eintraege steht die vollständige Kette
 * bereits im Pfad selbst – zitatFormatierung.ts liest den vorletzten
 * Kettenschritt jetzt direkt aus pfad.eintraege statt separat im
 * Normbaum nachzuschlagen.)
 */

// Setzt Haupttext + Fortsetzung exakt wie beim Rendern zu EINEM
// durchgehenden Zeichen-Bereich zusammen (versatz = ursprüngliche UTF-16-Länge,
// siehe SatzZeile/EintragZeile in satzEintragBausteine.tsx)
// und schneidet [start, ende) heraus.
function textAusBlatt(
  haupt: string | undefined,
  fortsetzung: string | undefined,
  start: number,
  ende: number,
): string {
  const h = schuetzeLeerzeichen(haupt ?? '') ?? '';
  const f = schuetzeLeerzeichen(fortsetzung ?? '') ?? '';
  return (h + f).slice(Math.max(0, start), Math.max(0, ende));
}

/**
 * Rekonstruiert den aktuellen Text zum strukturellen Pfad und Zeichenbereich
 * [zeichenbereichStart, zeichenbereichEnde) aus der passenden NormDarstellung, ohne DOM.
 * Der Aufrufer ordnet die Norm zu; eine XML-ID ist nicht Teil des Textpfads.
 * Zeichenpositionen müssen aus der Gesetzestextdarstellung stammen: Haupttext
 * und Fortsetzung werden mit derselben Leerzeichenbehandlung zusammengesetzt.
 * Auch Sätze innerhalb von Listeneinträgen werden über satzInEintrag aufgelöst.
 *
 * Fehlende Absätze, Unterabsätze, Sätze oder Einträge liefern undefined.
 * Jeder Kettenschritt zählt Geschwister gleicher Bezeichnung unabhängig von
 * ihrer Art; erst der adressierte Eintrag wird auf die gespeicherte ebene
 * geprüft. Eine andere Art liefert undefined, ohne auf andere Einträge
 * auszuweichen. Das gilt auch bei unverändertem Text als Konfliktsignal.
 * Zeichenbereiche werden mit slice ausgeschnitten; außerhalb des Textes
 * liegende Grenzen können einen kürzeren oder leeren Text ergeben.
 */
export function textAnTextpfad(norm: NormDarstellung, textstelle: Textstelle): string | undefined {
  const { pfad, zeichenbereichStart, zeichenbereichEnde } = textstelle;
  if (pfad.bereich === 'amtlicherTitel' || pfad.bereich === 'nichtamtlicherTitel')
    return (norm.titel ?? '').slice(zeichenbereichStart, zeichenbereichEnde);

  const absatz = norm.absaetze.filter(
    (a) => (a.bezeichnung ?? undefined) === (pfad.absatz ?? undefined),
  )[pfad.absatzWiederholung ?? 0];
  if (!absatz) return undefined;

  let saetze: SatzDarstellung[];
  if (absatz.unterabsaetze) {
    const ua = absatz.unterabsaetze.find((u) => u.bezeichnung === pfad.unterabsatz);
    if (!ua) return undefined;
    saetze = ua.saetze;
  } else {
    saetze = absatz.saetze;
  }

  const satz = saetze.find((s) => satzNummer(s.zahl) === satzNummer(pfad.satz));
  if (!satz) return undefined;

  // Kein Aufzählungseintrag adressiert: der äußere Satz selbst ist das Blatt.
  if (!pfad.eintraege || pfad.eintraege.length === 0) {
    return textAusBlatt(satz.text, satz.fortsetzung, zeichenbereichStart, zeichenbereichEnde);
  }

  const eintrag = findeEintrag(satz, pfad);
  if (!eintrag) return undefined;

  // Satz innerhalb eines Aufzählungseintrags (z.B. "Nr. 1 Satz 2").
  if (eintrag.saetze) {
    const innererSatz = eintrag.saetze.find(
      (s) => satzNummer(s.zahl) === satzNummer(pfad.satzInEintrag),
    );
    if (!innererSatz) return undefined;
    return textAusBlatt(
      innererSatz.text,
      innererSatz.fortsetzung,
      zeichenbereichStart,
      zeichenbereichEnde,
    );
  }

  if (satzNummer(pfad.satzInEintrag) !== 1) return undefined;
  return textAusBlatt(eintrag.text, eintrag.fortsetzung, zeichenbereichStart, zeichenbereichEnde);
}

/**
 * Löst die Bereiche Titel und Bezeichnung für Normen und Überschriften auf.
 * Erwartet das vom Aufrufer zugeordnete Element und Zeichenpositionen aus der
 * Darstellung. Pfade im Normtext brauchen eine NormDarstellung mit Absätzen;
 * bei einer Überschrift oder strukturell nicht auflösbarem Pfad folgt undefined.
 * Für Normtext gelten Artprüfung und Zeichenzählung von textAnTextpfad;
 * Titel und Bezeichnung werden unmittelbar mit slice ausgeschnitten.
 */
export function aktuellerTextAnPfad(
  element: NormDarstellung | UeberschriftDarstellung,
  textstelle: Textstelle,
): string | undefined {
  const { pfad, zeichenbereichStart, zeichenbereichEnde } = textstelle;
  // Bezeichnungs-Feld: wie `titel` GENERISCH für Norm UND Überschrift (beide
  // haben `bezeichnung`) – daher hier geprüft, bevor auf Norm-only
  // textAnTextpfad() verzweigt wird (siehe dortiger Funktionskommentar).
  if (pfad.bereich === 'bezeichnung')
    return element.bezeichnung.slice(zeichenbereichStart, zeichenbereichEnde);
  if (pfad.bereich === 'amtlicherTitel' || pfad.bereich === 'nichtamtlicherTitel')
    return (element.titel ?? '').slice(zeichenbereichStart, zeichenbereichEnde);
  if (!('absaetze' in element)) return undefined;
  return textAnTextpfad(element, textstelle);
}
