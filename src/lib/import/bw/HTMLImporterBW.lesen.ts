// Liest Überschriften, Absätze, Definitionslisten und Inhaltsblöcke aus BW-HTML.
import { normalisiereWS } from '@/lib/utils/leerraum';
import {
  type ImpAbsatz,
  type ImpEintrag,
  extrahiereAbsatznummer,
  tokenize,
} from '@/lib/import/basis/basis.index';

const HEADING_TAGS = ['h4', 'h5', 'h6'] as const;

/** Prüft, ob ein Element ein echter Inhalts-Heading-Stil ist – unterscheidet
 *  die echten Teil/Abschnitt/§-Überschriften von der "Nichtamtliches
 *  Inhaltsverzeichnis"-Überschrift, die keinen Inline-Style trägt (nur die
 *  CSS-Klasse "doc"). */
function istInhaltsUeberschrift(el: Element): boolean {
  return (el.getAttribute('style') ?? '').includes('font-family: Arial');
}

/**
 * Erkennt, ob eine Heading-Bezeichnung eine Norm ist (§, Artikel oder ein
 * Anhang/eine Anlage) – unabhängig davon, auf welchem Heading-Tag sie steht.
 *
 * WICHTIG: Die Bedeutung eines Heading-Tags ist in BW-Landesrecht NICHT
 * dokumentweit konstant. Beispiel GemO: unter "6. ABSCHNITT" ist h5 =
 * Abschnitt und h6 = §; unter "VIERTER TEIL" (ohne weiteren Abschnitt
 * darunter) rutscht § direkt auf h5 – dasselbe Tag hat an verschiedenen
 * Stellen im selben Dokument unterschiedliche Rollen. Eine Tag→Rolle-Zuordnung
 * (auch eine pro-Dokument ermittelte) kann das strukturell nicht auflösen.
 * Die Norm-Erkennung muss daher am Text der Überschrift selbst ansetzen.
 *
 * ANNAHME: "§", "Art."/"Artikel" und "Anhang"/"Anlage" decken die bekannten
 * Fälle ab. Falls weitere Bezeichnungsformen auftauchen, bitte melden.
 */
const NORM_MUSTER = /^(§|§§|Anhang|Anlage|Art(?:ikel)?\.?)(\s|$)/i;

function istNormUeberschrift(bez: string): boolean {
  return NORM_MUSTER.test(bez.trim());
}

/**
 * Ermittelt, welche Heading-Tags im Dokument als Gliederungsebenen
 * (Teil/Abschnitt/Kapitel/...) genutzt werden, in Tag-Reihenfolge
 * (h4 vor h5 vor h6) – als Basis für die Ebenen-Nummerierung. Tags, die
 * NUR für Normen (§/Artikel/Anhang) verwendet werden, tauchen hier nicht
 * auf; ein Tag, das an mancher Stelle Gliederung und an anderer Stelle Norm
 * ist (siehe istNormUeberschrift), zählt trotzdem als Gliederungstag, da es
 * dort echte Gliederungsebenen trägt.
 */
function ermittleGliederungsTags(container: Element): string[] {
  return HEADING_TAGS.filter((tag) =>
    Array.from(container.querySelectorAll(tag)).some(
      (el) => istInhaltsUeberschrift(el) && !istNormUeberschrift(leseHeadingSegmente(el)[0] ?? ''),
    ),
  );
}

// ---------------------------------------------------------------------------
// Text-Hilfsfunktionen (Headings, <p>, Permalink-Filter)
// ---------------------------------------------------------------------------

/** Zerlegt eine Heading-Node an <br>-Trennern in Text-Segmente
 *  (erstes Segment = Bezeichnung, Rest = Titel). Überspringt
 *  Fußnoten-Referenzlinks (<a class="footnotelink">1</a>), die juris.de
 *  direkt in die Überschrift einbettet – sonst landet z.B. bei
 *  "§ 147 Inkrafttreten¹" die Fußnotenziffer "1" im Titeltext
 *  ("Inkrafttreten1"). Die eigentliche Fußnote selbst wird (wie besprochen)
 *  weiterhin nicht importiert, nur ihr Verweis-Link wird hier ignoriert. */
function leseHeadingSegmente(el: Element): string[] {
  const segmente: string[] = [];
  let aktuell = '';
  for (const kind of Array.from(el.childNodes)) {
    if (kind.nodeType === Node.ELEMENT_NODE && (kind as Element).tagName === 'BR') {
      segmente.push(normalisiereWS(aktuell));
      aktuell = '';
    } else if (
      kind.nodeType === Node.ELEMENT_NODE &&
      (kind as Element).classList.contains('footnotelink')
    ) {
      continue;
    } else {
      aktuell += kind.textContent ?? '';
    }
  }
  segmente.push(normalisiereWS(aktuell));
  return segmente.filter(Boolean);
}

/** Liest den Text eines <p>-Elements, wandelt <br> in Zeilenumbrüche um.
 *  Die Zeilenumbrüche werden von normalisiereWS() anschließend wieder zu
 *  einfachen Leerzeichen zusammengefasst (kein <zeilenumbruch/> im Fließtext
 *  vorgesehen) – das ist unverändertes Verhalten. */
function lesePText(p: Element): string {
  let text = '';
  for (const kind of Array.from(p.childNodes)) {
    if (kind.nodeType === Node.TEXT_NODE) {
      text += kind.textContent ?? '';
    } else if (kind.nodeType === Node.ELEMENT_NODE) {
      const tag = (kind as Element).tagName;
      if (tag === 'BR') text += '\n';
      else text += kind.textContent ?? '';
    }
  }
  return normalisiereWS(text);
}

/** Erkennt einen <p>, der ausschließlich aus dem juris.de-Permalink
 *  ("zur Einzelansicht §N") besteht – ein einzelnes <a class="doclink">
 *  als einziges Kind, kein sonstiger Text davor/danach. */
function istReinerPermalinkAbsatz(p: Element): boolean {
  if (p.children.length !== 1) return false;
  const kind = p.children[0]!;
  if (kind.tagName !== 'A' || !kind.classList.contains('doclink')) return false;
  const textAusserhalbLink = normalisiereWS(
    Array.from(p.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join(''),
  );
  return textAusserhalbLink === '';
}

/** Baut aus einem <p>-Text einen ImpAbsatz (Absatznummer-Präfix wird
 *  erkannt, Satztokenisierung erfolgt hier – identisch zur BJA-Pipeline). */
function baueAbsatzAusText(text: string, satztokenisierungAktiv: boolean): ImpAbsatz | null {
  let rest = text;
  let nummer: string | undefined;
  const ex = extrahiereAbsatznummer(rest);
  if (ex) {
    nummer = ex[0];
    rest = normalisiereWS(ex[1]);
  }

  const saetze = tokenize(rest, satztokenisierungAktiv);
  if (saetze.length === 0) return null;

  return { nummer, elemente: [{ type: 'texte', saetze }] };
}

// ---------------------------------------------------------------------------
// <dl>/<dt>/<dd> → ImpEintrag[] (Aufzählungslisten)
// ---------------------------------------------------------------------------

/**
 * Liest eine <dl> in eine Liste von ImpEintrag um. Struktur bei
 * landesrecht-bw.de: <dt>Bezeichnung</dt><dd>Inhalt</dd> paarweise
 * (Bezeichnung optional – bei unnummerierten Aufzählungen fehlt <dt> ganz).
 * Ein <dd> kann selbst wieder <p>-Text gefolgt von einer verschachtelten
 * <dl> (Unterliste) gefolgt von weiterem <p>-Text enthalten (siehe z.B.
 * § 13 Nr. 1 im FeiertG: Text vor der a)/b)/c)-Unterliste). Das entspricht
 * strukturell exakt dem <LA>-mit-eingebettetem-<DL>-Fall in
 * bund/parseP.ts (dort texteVor/texteNach genannt) – nur ohne <LA>-Wrapper.
 *
 * juris-Eigenheit (bestätigt an § 6 Abs. 3 FTG): Braucht ein Listenelement
 * eine Unterliste, wird dafür manchmal statt EINES <dd> mit zwei Kindern ein
 * ZWEITES, direkt folgendes <dd> ohne eigenes <dt> erzeugt:
 *   <dt>2.</dt><dd><p>Einleitungstext</p></dd><dd><dl>a) b) ...</dl></dd><dt>3.</dt>...
 * Ein <dd> ohne unmittelbar vorangehendes <dt> ist daher – aber NUR wenn die
 * <dl> überhaupt <dt>-Elemente enthält – als Fortsetzung des vorherigen
 * Eintrags zu lesen, nicht als eigenständiger Eintrag. Bei rein
 * unnummerierten Aufzählungen (kein <dt> in der ganzen <dl>, z.B. § 1
 * Feiertage) hat dagegen JEDES <dd> kein vorangehendes <dt> und bleibt
 * trotzdem ein eigener Eintrag – dort greift diese Sonderregel nicht.
 */
function leseDLBW(dl: Element): ImpEintrag[] {
  const kinder = Array.from(dl.children);
  const hatUeberhauptDT = kinder.some((k) => k.tagName.toLowerCase() === 'dt');

  const eintraege: ImpEintrag[] = [];
  let currentDT = '';
  let vorherigesWarDT = false;

  for (const kind of kinder) {
    const tag = kind.tagName.toLowerCase();
    if (tag === 'dt') {
      currentDT = normalisiereWS(kind.textContent ?? '');
      vorherigesWarDT = true;
    } else if (tag === 'dd') {
      if (hatUeberhauptDT && !vorherigesWarDT && eintraege.length > 0) {
        ergaenzeEintragMitDD(eintraege[eintraege.length - 1]!, kind);
      } else {
        eintraege.push(leseDDBW(kind, currentDT));
      }
      currentDT = '';
      vorherigesWarDT = false;
    }
  }

  return eintraege;
}

/** Ergänzt einen bereits erzeugten ImpEintrag um den Inhalt eines
 *  "nachgeschobenen" <dd> ohne eigenes <dt> (siehe Kommentar an leseDLBW). */
function ergaenzeEintragMitDD(eintrag: ImpEintrag, dd: Element): void {
  for (const kind of Array.from(dd.children)) {
    const tag = kind.tagName.toLowerCase();
    if (tag === 'p') {
      if (istReinerPermalinkAbsatz(kind)) continue;
      const text = lesePText(kind);
      if (!text) continue;
      eintrag.texteNach.push(text);
    } else if (tag === 'dl') {
      eintrag.untereintraege = [...eintrag.untereintraege, ...leseDLBW(kind)];
    }
  }
}

function leseDDBW(dd: Element, bezeichnung: string): ImpEintrag {
  const texteVor: string[] = [];
  const texteNach: string[] = [];
  let untereintraege: ImpEintrag[] = [];
  let hatInneresDL = false;

  for (const kind of Array.from(dd.children)) {
    const tag = kind.tagName.toLowerCase();
    if (tag === 'p') {
      if (istReinerPermalinkAbsatz(kind)) continue;
      const text = lesePText(kind);
      if (!text) continue;
      if (hatInneresDL) texteNach.push(text);
      else texteVor.push(text);
    } else if (tag === 'dl') {
      untereintraege = leseDLBW(kind);
      hatInneresDL = true;
    }
  }

  return {
    bezeichnung: bezeichnung || '-',
    texteVor,
    untereintraege,
    unterlistenTyp: 'other',
    texteNach,
  };
}

// ---------------------------------------------------------------------------
// Container strukturell in Blöcke zerlegen (Heading / <p> / <dl>)
// ---------------------------------------------------------------------------

export interface Block {
  kind: 'heading' | 'p' | 'dl';
  el: Element;
  tag?: string; // nur bei kind === 'heading' gesetzt
}

/**
 * Läuft den Inhaltsbereich rekursiv ab und sammelt Heading-, <p>- und
 * <dl>-Elemente in Dokumentreihenfolge ein. Ersetzt die frühere flache
 * querySelectorAll('h4, h5, h6, p')-Suche, die jedes <p> unabhängig von
 * seiner Verschachtelung einsammelte – auch die <p>-Elemente innerhalb einer
 * <dl><dd>, die eigentlich Listeneinträge sind, keine eigenständigen
 * Absätze. Eine <dl> wird hier NICHT weiter aufgeklappt (leseDLBW übernimmt
 * ihren gesamten Inhalt inkl. verschachtelter <dl> separat).
 */
function sammleBloecke(root: Element): Block[] {
  const bloecke: Block[] = [];

  function walk(el: Element): void {
    for (const kind of Array.from(el.children)) {
      const tag = kind.tagName.toLowerCase();
      if (tag === 'table') continue; // Tabellen bewusst nicht aufgelöst (siehe Datei-Kopf)
      if (kind.classList.contains('footnoteDL')) continue; // Fußnotenapparat, kein Normtext-Inhalt
      if (tag === 'h4' || tag === 'h5' || tag === 'h6') {
        bloecke.push({ kind: 'heading', el: kind, tag });
        continue;
      }
      if (tag === 'p') {
        bloecke.push({ kind: 'p', el: kind });
        continue;
      }
      if (tag === 'dl') {
        bloecke.push({ kind: 'dl', el: kind });
        continue; // Inhalt wird separat von leseDLBW konsumiert
      }
      walk(kind); // sonstige Container (div, a, ...) durchwandern
    }
  }

  walk(root);
  return bloecke;
}

export {
  istInhaltsUeberschrift,
  istNormUeberschrift,
  ermittleGliederungsTags,
  leseHeadingSegmente,
  lesePText,
  istReinerPermalinkAbsatz,
  baueAbsatzAusText,
  leseDLBW,
  sammleBloecke,
};
