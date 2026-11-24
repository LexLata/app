// parseP.ts
// Übersetzt ein einzelnes <P>-Element aus dem Bundesjustizamt-XML
// in einen ImpAbsatz (interne Zwischenstruktur).
// Behandelt verschachtelte DL/DT/DD/LA-Strukturen identisch zur Swift-SAX-Logik.

import { normalisiereWS } from '@/lib/utils/leerraum';
import {
  tokenize,
  type ImpAbsatz,
  type ImpEintrag,
  type ListenZustand,
  extrahiereAbsatznummer,
} from '@/lib/import/basis/basis.index';

/**
 * Übersetzt ein <P>-Element in einen ImpAbsatz.
 * Alle inneren Closures (neuerListenZustand, verarbeiteLAOhneDL,
 * verarbeiteLAMitDLElementKind, verarbeiteLAMitDL, processLAInDD, walkDD,
 * walkDL, schliesseVorDLPendingText, fuegeListeEinOderMerge,
 * verarbeiteDLElement, walkNode, verarbeiteRestOhneVorherigenInhalt,
 * verarbeiteVerbleibendenText) teilen sich denselben Stack-Kontext
 * (listenStack, pendingText, absatz) und bleiben daher absichtlich
 * zusammen – Aufteilung in mehrere, feinere Closures dient hier nur der
 * Reduktion der kognitiven Komplexität pro Funktion, nicht der Trennung
 * des gemeinsamen Zustands.
 */
export function parseP(p: Element): ImpAbsatz | null {
  const absatz: ImpAbsatz = { elemente: [] };
  const listenStack: ListenZustand[] = [];
  let pendingText = '';

  function neuerListenZustand(typ: string): ListenZustand {
    return {
      typ,
      eintraege: [],
      currentDT: '',
      currentLATexteVor: [],
      currentLATexteNach: [],
      currentUntereintraege: [],
      currentUnterlistenTyp: 'other',
      hatInneresDL: false,
    };
  }

  /** LA ohne eingebettetes <DL>: gesamter Text → texteVor oder texteNach,
   *  je nachdem ob im selben DD bereits eine DL-haltige LA verarbeitet wurde. */
  function verarbeiteLAOhneDL(la: Element, stackIdx: number): void {
    let text = '';
    for (const child of Array.from(la.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent ?? '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName.toUpperCase();
        if (tag === 'BR' || tag === 'ZEILENUMBRUCH') text += '\n';
      }
    }
    const laText = normalisiereWS(text);
    if (!laText) return;
    // stackIdx kommt von walkDD als n = listenStack.length - 1 (direkt
    // nach Leer-Prüfung) und bleibt über den Aufruf hinweg gültig.
    if (listenStack[stackIdx]!.hatInneresDL) {
      listenStack[stackIdx]!.currentLATexteNach.push(laText);
    } else {
      listenStack[stackIdx]!.currentLATexteVor.push(laText);
    }
  }

  /** Verarbeitet ein einzelnes Element-Kind von <LA> im "hat eingebettetes
   *  <DL>"-Zweig: entweder das <DL> selbst (schaltet pastDL auf true,
   *  übernimmt untereintraege direkt in listenStack) oder ein
   *  <BR>/<ZEILENUMBRUCH> (liefert '\n' als Textdelta). Der zurückgegebene
   *  Text wird vom Aufrufer je nach (aktualisiertem) pastDL vor oder nach
   *  dem DL einsortiert – beim DL-Zweig ist das Textdelta bewusst leer,
   *  daher ist die Einsortierung dort ohne Belang. */
  function verarbeiteLAMitDLElementKind(
    el: Element,
    stackIdx: number,
    pastDLBisher: boolean,
  ): { pastDL: boolean; text: string } {
    const tag = el.tagName.toUpperCase();
    if (tag === 'DL') {
      listenStack.push(neuerListenZustand(el.getAttribute('Type') ?? 'other'));
      walkDL(el);
      const sub = listenStack.pop()!;
      listenStack[stackIdx]!.currentUntereintraege = sub.eintraege;
      listenStack[stackIdx]!.currentUnterlistenTyp = sub.typ;
      listenStack[stackIdx]!.hatInneresDL = true;
      return { pastDL: true, text: '' };
    }
    if (tag === 'BR' || tag === 'ZEILENUMBRUCH') {
      return { pastDL: pastDLBisher, text: '\n' };
    }
    return { pastDL: pastDLBisher, text: '' };
  }

  /** LA mit eingebettetem <DL>: Text vor DL → texteVor, DL → untereintraege,
   *  Text nach DL → texteNach. */
  function verarbeiteLAMitDL(la: Element, stackIdx: number): void {
    let textBefore = '';
    let textAfter = '';
    let pastDL = false;

    for (const child of Array.from(la.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!pastDL) textBefore += child.textContent ?? '';
        else textAfter += child.textContent ?? '';
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const ergebnis = verarbeiteLAMitDLElementKind(child as Element, stackIdx, pastDL);
      pastDL = ergebnis.pastDL;
      if (!pastDL) textBefore += ergebnis.text;
      else textAfter += ergebnis.text;
    }

    const vor = normalisiereWS(textBefore);
    if (vor) listenStack[stackIdx]!.currentLATexteVor.push(vor);
    const nach = normalisiereWS(textAfter);
    if (nach) listenStack[stackIdx]!.currentLATexteNach.push(nach);
  }

  /**
   * Verarbeitet ein einzelnes <LA>-Element im Kontext von walkDD.
   * Entspricht schliesseLA() + inLA-Flag-Logik aus der Swift SAX-Version.
   */
  function processLAInDD(la: Element, stackIdx: number): void {
    const hasDL = Array.from(la.childNodes).some(
      (c) => c.nodeType === Node.ELEMENT_NODE && (c as Element).tagName.toUpperCase() === 'DL',
    );
    if (hasDL) verarbeiteLAMitDL(la, stackIdx);
    else verarbeiteLAOhneDL(la, stackIdx);
  }

  /** Verarbeitet ein DD-Element auf dem Stack */
  function walkDD(dd: Element): void {
    if (listenStack.length === 0) return;
    // n = listenStack.length - 1 direkt nach der Leer-Prüfung oben; bleibt
    // über die gesamte Funktion gültig (push/pop-Paare unten sind balanciert).
    const n = listenStack.length - 1;

    // DD-Zustand zurücksetzen
    listenStack[n]!.currentLATexteVor = [];
    listenStack[n]!.currentLATexteNach = [];
    listenStack[n]!.currentUntereintraege = [];
    listenStack[n]!.currentUnterlistenTyp = 'other';
    listenStack[n]!.hatInneresDL = false;

    for (const child of Array.from(dd.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();

      if (tag === 'LA') {
        // LA ggf. mit eingebettetem <DL> verarbeiten
        processLAInDD(el, n);
      } else if (tag === 'DL') {
        // <DL> als direktes Kind von <DD> (ohne LA-Wrapper)
        listenStack.push(neuerListenZustand(el.getAttribute('Type') ?? 'other'));
        walkDL(el);
        const sub = listenStack.pop()!;
        listenStack[n]!.currentUntereintraege = sub.eintraege;
        listenStack[n]!.currentUnterlistenTyp = sub.typ;
        listenStack[n]!.hatInneresDL = true;
      }
    }

    // Eintrag abschließen
    const eintrag: ImpEintrag = {
      bezeichnung: listenStack[n]!.currentDT || '-',
      texteVor: [...listenStack[n]!.currentLATexteVor],
      untereintraege: [...listenStack[n]!.currentUntereintraege],
      unterlistenTyp: listenStack[n]!.currentUnterlistenTyp,
      texteNach: [...listenStack[n]!.currentLATexteNach],
    };
    listenStack[n]!.eintraege.push(eintrag);

    // DD-Zustand für nächsten Eintrag zurücksetzen
    listenStack[n]!.currentDT = '';
    listenStack[n]!.currentLATexteVor = [];
    listenStack[n]!.currentLATexteNach = [];
    listenStack[n]!.currentUntereintraege = [];
    listenStack[n]!.currentUnterlistenTyp = 'other';
    listenStack[n]!.hatInneresDL = false;
  }

  function walkDL(dl: Element): void {
    for (const child of Array.from(dl.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      if (tag === 'DT') {
        if (listenStack.length > 0) {
          listenStack[listenStack.length - 1]!.currentDT = el.textContent?.trim() ?? '';
        }
      } else if (tag === 'DD') {
        walkDD(el);
      }
    }
  }

  /** Schließt den bisher gesammelten pendingText VOR einer top-level-<DL> ab
   *  (inkl. Absatznummer-Extraktion) und hängt ihn als texte-Element an. */
  function schliesseVorDLPendingText(): void {
    let text = normalisiereWS(pendingText);
    if (absatz.nummer === undefined) {
      const ex = extrahiereAbsatznummer(text);
      if (ex) {
        absatz.nummer = ex[0];
        text = normalisiereWS(ex[1]);
      }
    }
    if (text) {
      const saetze = tokenize(text);
      if (saetze.length > 0) absatz.elemente.push({ type: 'texte', saetze });
    }
    pendingText = '';
  }

  /** Zwei aufeinanderfolgende top-level <DL>-Elemente (z.B. Art 73 GG)
   *  gehören zur selben Liste – Einträge zusammenführen statt neuen Eintrag
   *  zu erzeugen. */
  function fuegeListeEinOderMerge(eintraege: ImpEintrag[]): void {
    const letztes = absatz.elemente[absatz.elemente.length - 1];
    if (letztes && letztes.type === 'liste') {
      (letztes as { type: 'liste'; eintraege: ImpEintrag[] }).eintraege.push(...eintraege);
    } else {
      absatz.elemente.push({ type: 'liste', eintraege });
    }
  }

  /** Verarbeitet ein <DL>-Element im Kontext von walkNode (top-level oder
   *  verschachtelt). */
  function verarbeiteDLElement(el: Element): void {
    // Vor dem push ermittelt, bleibt aber auch nach dem korrespondierenden
    // pop unten gültig, da push/pop hier immer balanciert sind.
    const aufObersterEbene = listenStack.length === 0;
    if (aufObersterEbene) schliesseVorDLPendingText();

    listenStack.push(neuerListenZustand(el.getAttribute('Type') ?? 'other'));
    walkDL(el);
    const zustand = listenStack.pop()!;

    if (aufObersterEbene) {
      fuegeListeEinOderMerge(zustand.eintraege);
    } else {
      const n = listenStack.length - 1;
      listenStack[n]!.currentUntereintraege = zustand.eintraege;
      listenStack[n]!.currentUnterlistenTyp = zustand.typ;
      listenStack[n]!.hatInneresDL = true;
    }
  }

  /** Hauptschleife: Child-Nodes von P */
  function walkNode(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      // Text außerhalb von DL geht in pendingText
      if (listenStack.length === 0) {
        pendingText += node.textContent ?? '';
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as Element;
    const tag = el.tagName.toUpperCase();

    if (tag === 'BR' || tag === 'ZEILENUMBRUCH') {
      if (listenStack.length === 0) pendingText += '\n';
      return;
    }

    if (tag === 'DL') {
      verarbeiteDLElement(el);
      return;
    }

    // Sonstige Elemente: Kinder durchwandern
    for (const child of Array.from(el.childNodes)) walkNode(child);
  }

  /** Fall "noch kein Inhalt in absatz.elemente UND noch keine absatz.nummer
   *  gesetzt" innerhalb von verarbeiteVerbleibendenText(): versucht zuerst
   *  eine führende Absatznummer aus dem Rest zu extrahieren. */
  function verarbeiteRestOhneVorherigenInhalt(rest: string): void {
    const ex = extrahiereAbsatznummer(rest);
    if (ex) {
      absatz.nummer = ex[0];
      const restText = normalisiereWS(ex[1]);
      const saetze = tokenize(restText);
      if (saetze.length > 0) absatz.elemente.push({ type: 'texte', saetze });
      return;
    }
    const saetze = tokenize(rest);
    if (saetze.length > 0) absatz.elemente.push({ type: 'texte', saetze });
  }

  /** Verbleibenden pendingText NACH der letzten top-level-<DL> abschließen
   *  (bzw. den gesamten Text, falls es gar keine DL gab). */
  function verarbeiteVerbleibendenText(): void {
    const rest = normalisiereWS(pendingText);
    if (!rest) return;
    const hatInhalt = absatz.elemente.length > 0;
    if (!hatInhalt && absatz.nummer === undefined) {
      verarbeiteRestOhneVorherigenInhalt(rest);
      return;
    }
    const saetze = tokenize(rest);
    if (saetze.length > 0) {
      if (hatInhalt) absatz.elemente.push({ type: 'texte', saetze });
      else absatz.elemente.unshift({ type: 'texte', saetze });
    }
  }

  // P-Kinder verarbeiten
  for (const child of Array.from(p.childNodes)) walkNode(child);

  verarbeiteVerbleibendenText();

  if (absatz.elemente.length === 0) return null;
  return absatz;
}
