// gesetzesXMLNachbereiten.ts
// Baut die Satzstruktur von GesetzesXML-Dateiimporten mit dem bestehenden Importaufbau
// neu auf. Verweise werden anhand ihrer sichtbaren Textposition wieder eingesetzt;
// ihre Zeichen bleiben während der Satzbestimmung vollständig sichtbar.

import {
  type ImpAbsatz,
  type ImpElement,
  type ImpEintrag,
  tokenize,
  baueText,
  entferneBestehendeVerweise,
} from '@/lib/import/basis/basis.index';
import { taggeGesetzesXML } from './gesetzImportAbschluss';
import type { ReferenzKontext } from './referenzKontext';
import type { NachbereitungBeiImport } from '@/lib/einstellungen/einstellungen.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import { leseGesetzInfos } from '@/lib/persistenz/gesetz/gesetz.index';

// Norm-Ebene bei der Serialisierung (siehe gesetzesXMLBauer.ts: baueText-
// Aufrufe verwenden ebenfalls 6 Leerzeichen Einrückung auf dieser Ebene).
const NORM_INDENT = '      ';

/** Bereinigt Fließtext, der bereits eindeutige \n-Zeichen für echte
 *  <zeilenumbruch/>-Elemente enthält (siehe baueElementeAusContainer/
 *  baueEintragAusElement: jeder Textknoten wird dort einzeln vorab per
 *  `.replace(/\s+/g, ' ')` geglättet, sodass verbleibende \n ausschließlich
 *  von <zeilenumbruch/> stammen). Entfernt nur noch Whitespace direkt um
 *  diese \n sowie mehrfache/leere Zeilen – im Unterschied zu normalisiereWS()
 *  bleiben die \n selbst erhalten, statt zu einfachen Leerzeichen
 *  zusammengefasst zu werden. So werden aus <zeilenumbruch/> keine "leeren
 *  Zeilen" oder Einrückungsreste. */
function bereinigeFliesstext(text: string): string {
  return text
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Ergebnis der Klassifizierung eines einzelnen Kindknotens innerhalb von
 *  baueEintragAusElement(): entweder ein rekursiv aufgebauter Untereintrag
 *  (<nummer>/<litera>-Kind) oder ein Textfragment (inkl. <zeilenumbruch/>
 *  als '\n' sowie unbekannte Inline-Elemente als geglätteter Texttext). */
type EintragsKindErgebnis =
  | { art: 'untereintrag'; eintrag: ImpEintrag }
  | { art: 'text'; text: string }
  | { art: 'ignorieren' };

/** Klassifiziert einen einzelnen Kindknoten von baueEintragAusElement() –
 *  reine Fallunterscheidung ohne Seiteneffekte, ausgelagert um die
 *  Verzweigungstiefe der aufrufenden Schleife gering zu halten. */
function klassifiziereEintragsKind(child: ChildNode): EintragsKindErgebnis {
  if (child.nodeType === Node.ELEMENT_NODE) {
    const childEl = child as Element;
    const childTag = childEl.tagName.toLowerCase();
    if (childTag === 'nummer' || childTag === 'litera') {
      return { art: 'untereintrag', eintrag: baueEintragAusElement(childEl) };
    }
    if (childTag === 'zeilenumbruch') {
      return { art: 'text', text: '\n' };
    }
    // Unbekannte Inline-Elemente: Texttext übernehmen (Whitespace inkl.
    // etwaiger Pretty-Print-Zeilenumbrüche innerhalb des Knotens glätten –
    // ein <zeilenumbruch/> wird ausschließlich über den obigen Zweig
    // repräsentiert, nie über rohe \n in Texttext)
    return { art: 'text', text: (childEl.textContent ?? '').replace(/\s+/g, ' ') };
  }
  if (child.nodeType === Node.TEXT_NODE) {
    return { art: 'text', text: (child.textContent ?? '').replace(/\s+/g, ' ') };
  }
  return { art: 'ignorieren' };
}

/** Baut einen ImpEintrag aus einem <litera>- oder <nummer>-Element
 *  (rekursiv für verschachtelte Unterlisten). Analog zu parseP.ts
 *  (processLAInDD/walkDD), aber vereinfacht: unser Quellformat trägt
 *  Bezeichnung + Text direkt am Element (kein DT/DD-Split). */
function baueEintragAusElement(el: Element): ImpEintrag {
  const tag = el.tagName.toLowerCase();
  const bezeichnung =
    (tag === 'nummer' ? el.getAttribute('zahl') : el.getAttribute('buchstabe')) ?? '-';

  let textVor = '';
  let textNach = '';
  let pastListe = false;
  const untereintraege: ImpEintrag[] = [];

  for (const child of Array.from(el.childNodes)) {
    const ergebnis = klassifiziereEintragsKind(child);
    if (ergebnis.art === 'untereintrag') {
      pastListe = true;
      untereintraege.push(ergebnis.eintrag);
    } else if (ergebnis.art === 'text') {
      if (!pastListe) textVor += ergebnis.text;
      else textNach += ergebnis.text;
    }
  }

  const vor = bereinigeFliesstext(textVor);
  const nach = bereinigeFliesstext(textNach);

  return {
    bezeichnung,
    texteVor: vor ? [vor] : [],
    untereintraege,
    unterlistenTyp: 'other',
    texteNach: nach ? [nach] : [],
  };
}

/** Sammelt ab kinder[startIndex] eine zusammenhängende Folge von
 *  <litera>/<nummer>-Geschwistern zu einer Liste ein (siehe
 *  baueElementeAusContainer(): konsekutive <litera>/<nummer>-Kinder bilden
 *  ein gemeinsames 'liste'-Element). Whitespace-only Textknoten zwischen den
 *  Einträgen (reine Pretty-Print-Einrückung) werden übersprungen, ohne die
 *  Sammlung abzubrechen; echter Text oder ein anderes Element beendet die
 *  Liste. Ausgelagert aus baueElementeAusContainer(), um dessen
 *  Verschachtelungstiefe (While-in-While) gering zu halten. */
function sammleListenEintraege(
  kinder: ChildNode[],
  startIndex: number,
): { eintraege: ImpEintrag[]; naechsterIndex: number } {
  const eintraege: ImpEintrag[] = [];
  let i = startIndex;
  while (i < kinder.length) {
    // Schleifen-Invariante: i < kinder.length (while-Bedingung) – cur ist
    // daher immer definiert.
    const cur = kinder[i]!;
    if (cur.nodeType === Node.TEXT_NODE) {
      if (!(cur.textContent ?? '').trim()) {
        i++;
        continue;
      }
      break; // echter Text zwischen Einträgen: Liste ist beendet
    }
    if (cur.nodeType !== Node.ELEMENT_NODE) break;
    const curTag = (cur as Element).tagName.toLowerCase();
    if (curTag !== 'litera' && curTag !== 'nummer') break;
    eintraege.push(baueEintragAusElement(cur as Element));
    i++;
  }
  return { eintraege, naechsterIndex: i };
}

/** Baut die ImpElement[]-Sequenz eines <absatz>- oder <text>-Containers:
 *  Text/<zeilenumbruch/> werden zu 'texte'-Elementen (per tokenize() in
 *  Sätze zerlegt), konsekutive <litera>/<nummer>-Geschwister zu einem
 *  'liste'-Element, ein <unterabsatz>-Kind zu einem Marker gefolgt von
 *  dessen eigenem (rekursiv aufgebautem) Text – passend zu der Marker-
 *  getrennten Gruppierung, die baueSaetzeEinesAbsatzes() (xmlSerialisierung.ts)
 *  erwartet, um die Satz-Zählung pro Unterabsatz neu zu starten. */
function baueElementeAusContainer(container: Element): ImpElement[] {
  const elemente: ImpElement[] = [];
  let pendingText = '';

  function flushText(): void {
    const text = bereinigeFliesstext(pendingText);
    pendingText = '';
    if (!text) return;
    const saetze = tokenize(text);
    if (saetze.length > 0) elemente.push({ type: 'texte', saetze });
  }

  const kinder = Array.from(container.childNodes);
  let i = 0;
  while (i < kinder.length) {
    // Schleifen-Invariante: i < kinder.length (while-Bedingung) – node ist
    // daher immer definiert.
    const node = kinder[i]!;

    if (node.nodeType === Node.TEXT_NODE) {
      // Whitespace inkl. etwaiger Pretty-Print-Zeilenumbrüche innerhalb
      // dieses Textknotens glätten – ein <zeilenumbruch/> wird ausschließlich
      // über das eigene Element unten repräsentiert, nie über rohe \n in
      // Texttext (sonst wären beide nach dem Zusammenfügen nicht mehr
      // unterscheidbar).
      pendingText += (node.textContent ?? '').replace(/\s+/g, ' ');
      i++;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      i++;
      continue;
    }

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'zeilenumbruch') {
      pendingText += '\n';
      i++;
      continue;
    }

    if (tag === 'unterabsatz') {
      flushText();
      elemente.push({ type: 'unterabsatz' });
      // Eigenen Text des Unterabsatzes rekursiv aufbauen – deckt sowohl
      // die (bei "fertigen" XMLs wahrscheinlichere) Form <unterabsatz
      // zahl="n">Rohtext …</unterabsatz> als auch verschachtelte Listen
      // innerhalb des Unterabsatzes ab. Bei einem rein flachen, leeren
      // <unterabsatz/>-Geschwister (Marker ohne eigenen Text) liefert
      // dies einfach keine zusätzlichen Elemente.
      elemente.push(...baueElementeAusContainer(el));
      i++;
      continue;
    }

    if (tag === 'litera' || tag === 'nummer') {
      flushText();
      // Whitespace-only Textknoten zwischen Listeneinträgen (reine
      // Pretty-Print-Einrückung im Quell-XML) werden dabei übersprungen,
      // ohne die Listensammlung abzubrechen – sonst würde daraus eine Folge
      // von Einzellisten statt einer gemeinsamen Liste.
      const { eintraege, naechsterIndex } = sammleListenEintraege(kinder, i);
      elemente.push({ type: 'liste', eintraege });
      i = naechsterIndex;
      continue;
    }

    // Unbekannte Inline-Elemente: Texttext übernehmen (Whitespace glätten,
    // siehe Kommentar oben bei TEXT_NODE)
    pendingText += (el.textContent ?? '').replace(/\s+/g, ' ');
    i++;
  }

  flushText();
  return elemente;
}

/** Baut ImpAbsatz[] aus einem <text>-Element: ein Absatz pro <absatz
 *  zahl="…">-Kind, oder – falls keine <absatz>-Kinder vorhanden sind
 *  (einfache Normen ohne Absatzgliederung) – ein einzelner unnummerierter
 *  Absatz aus dem <text> selbst. */
function baueAbsaetzeAusText(textEl: Element): ImpAbsatz[] {
  const absatzEls = Array.from(textEl.children).filter((c) => c.tagName.toLowerCase() === 'absatz');

  if (absatzEls.length === 0) {
    return [{ elemente: baueElementeAusContainer(textEl) }];
  }

  return absatzEls.map((absatzEl) => ({
    absatzgrenzeErhalten: !absatzEl.hasAttribute('zahl') || undefined,
    zwischenueberschrift: absatzEl.getAttribute('typ') === 'zwischenueberschrift' || undefined,
    nummer: absatzEl.getAttribute('zahl') ?? undefined,
    elemente:
      absatzEl.getAttribute('typ') === 'zwischenueberschrift'
        ? [{ type: 'texte', saetze: [absatzEl.textContent ?? ''] }]
        : baueElementeAusContainer(absatzEl),
  }));
}

/** Positionen zählen sichtbare Nicht-Whitespace-Zeichen. Einrückungen des
 * Neuaufbaus verändern dadurch keine Zuordnung; der Tokenizer sieht echten Text. */
function textPositionen(root: Element): Array<{ knoten: Text; start: number; ende: number }> {
  const positionen: Array<{ knoten: Text; start: number; ende: number }> = [];
  let position = 0;
  function besuche(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const start = position;
      position += (node.textContent ?? '').replace(/\s/g, '').length;
      positionen.push({ knoten: node as Text, start, ende: position });
    } else {
      Array.from(node.childNodes).forEach(besuche);
    }
  }
  besuche(root);
  return positionen;
}

/** Setzt die originalen Verweise zurück, ohne Textsuchtreffer mit identischem
 * Wortlaut zu verwechseln. Nicht darstellbare übergreifende Inline-Strukturen
 * werden defensiv unverändert übernommen statt ihre Ziele zu verlieren. */
function erhalteVerweise(original: Element, aufgebaut: Element): boolean {
  const vorher = textPositionen(original);
  const nachher = textPositionen(aufgebaut);
  if (
    vorher.map((p) => p.knoten.textContent?.replace(/\s/g, '')).join('') !==
    nachher.map((p) => p.knoten.textContent?.replace(/\s/g, '')).join('')
  )
    return false;
  const verweise = Array.from(original.querySelectorAll('verweis')).map((el) => {
    const kinder = vorher.filter((p) => el.contains(p.knoten));
    return { el, start: kinder[0]?.start, ende: kinder.at(-1)?.ende };
  });
  // Rechts nach links: die Positionen der noch zu ersetzenden Texte bleiben gültig.
  for (const verweis of verweise.reverse()) {
    const { start, ende } = verweis;
    if (start === undefined || ende === undefined || start === ende) return false;
    const ziel = nachher.find((p) => p.start <= start && p.ende >= ende);
    if (!ziel) return false;
    const text = ziel.knoten.textContent ?? '';
    const offsets = Array.from(text.matchAll(/\S/g), (m) => m.index);
    const von = offsets[start - ziel.start];
    const bis = offsets[ende - ziel.start - 1];
    if (von === undefined || bis === undefined) return false;
    const parent = ziel.knoten.parentNode;
    if (!parent) return false;
    const folgend = ziel.knoten.nextSibling;
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: Nachbereitung verändert ausschließlich getrennt geparstes GesetzesXML für die Serialisierung; gesetzesXMLNachbereiten.test.ts prüft Originaltext, Verweise und Satz-Hüllen.
    ziel.knoten.textContent = text.slice(0, von);
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: Nachbereitung verändert ausschließlich getrennt geparstes GesetzesXML für die Serialisierung; gesetzesXMLNachbereiten.test.ts prüft Originaltext, Verweise und Satz-Hüllen.
    parent.insertBefore(aufgebaut.ownerDocument.importNode(verweis.el, true), folgend);
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: Nachbereitung verändert ausschließlich getrennt geparstes GesetzesXML für die Serialisierung; gesetzesXMLNachbereiten.test.ts prüft Originaltext, Verweise und Satz-Hüllen.
    const restText = aufgebaut.ownerDocument.createTextNode(text.slice(bis + 1));
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: Nachbereitung verändert ausschließlich getrennt geparstes GesetzesXML für die Serialisierung; gesetzesXMLNachbereiten.test.ts prüft Originaltext, Verweise und Satz-Hüllen.
    parent.insertBefore(restText, folgend);
  }
  return true;
}

/** Unbekannte Elemente bleiben erhalten; nur bekannte Satz-Hüllen entfernen. */
function textOhneSatzHuellen(textEl: Element): Element | undefined {
  const erlaubteTags = new Set([
    'absatz',
    'unterabsatz',
    'satz',
    'nummer',
    'litera',
    'zeilenumbruch',
    'verweis',
  ]);
  if (Array.from(textEl.querySelectorAll('*')).some((el) => !erlaubteTags.has(el.tagName)))
    return undefined;
  const rohText = textEl.cloneNode(true) as Element;
  for (const satz of Array.from(rohText.querySelectorAll('satz')).reverse()) {
    const parent = satz.parentNode;
    if (!parent) continue;
    for (const child of Array.from(satz.childNodes)) {
      // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: Nachbereitung verändert ausschließlich getrennt geparstes GesetzesXML für die Serialisierung; gesetzesXMLNachbereiten.test.ts prüft Originaltext, Verweise und Satz-Hüllen.
      parent.insertBefore(child, satz);
    }
    parent.removeChild(satz);
  }
  return rohText;
}

/** Baut nur Normtexte neu auf; Satz-Hüllen werden auf einer Arbeitskopie
 * entfernt. Nicht unterstützte Strukturen bleiben unverändert; der Dateiimport
 * übernimmt Meldungen über übersprungene Normen in seinen Importbericht. */
export function tokenisiereGesetzesXML(
  xmlString: string,
  meldeFehler?: (meldung: string) => void,
): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  if (doc.querySelector('parsererror')) return xmlString;

  const normEls = Array.from(doc.querySelectorAll('norm'));

  for (const normEl of normEls) {
    const textEl = Array.from(normEl.children).find((c) => c.tagName.toLowerCase() === 'text');
    if (!textEl) continue;

    function meldeSatzaufbauFehler(grund: string): void {
      const bezeichnung = Array.from(normEl.children)
        .find((el) => el.tagName === 'bezeichnung')
        ?.textContent?.trim();
      const norm = bezeichnung || normEl.getAttribute('id') || 'Norm ohne Bezeichnung';
      meldeFehler?.(
        `${norm}: Satzaufbau nicht möglich (${grund}). Die Satzstruktur der Norm bleibt unverändert.`,
      );
    }

    const rohText = textOhneSatzHuellen(textEl);
    if (!rohText) {
      meldeSatzaufbauFehler('nicht unterstützte Textstruktur');
      continue;
    }
    const absaetze = baueAbsaetzeAusText(rohText);
    const neueZeilen = baueText(absaetze, NORM_INDENT);
    if (neueZeilen.length === 0) continue;

    const neuesTextDoc = parser.parseFromString(
      `<root>${neueZeilen.join('\n')}</root>`,
      'application/xml',
    );
    if (neuesTextDoc.querySelector('parsererror')) {
      meldeSatzaufbauFehler('neu aufgebauter Text ist kein gültiges XML');
      continue;
    }

    const neuesTextEl = neuesTextDoc.documentElement.firstElementChild;
    if (!neuesTextEl || !erhalteVerweise(textEl, neuesTextEl)) {
      meldeSatzaufbauFehler('Text oder vorhandene Verweise können nicht sicher übernommen werden');
      continue;
    }

    const importiertesEl = doc.importNode(neuesTextEl, true);
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: Nachbereitung verändert ausschließlich getrennt geparstes GesetzesXML für die Serialisierung; gesetzesXMLNachbereiten.test.ts prüft Originaltext, Verweise und Satz-Hüllen.
    normEl.replaceChild(importiertesEl, textEl);
  }

  return new XMLSerializer().serializeToString(doc);
}

/** Die beiden Schritte sind unabhängig; im kombinierten Modus kommt der
 * Satzaufbau nach Entfernen der alten Verweis-Hüllen vor dem Verweistagging.
 * Nur Sätze erhält hingegen vorhandene Verweise. Ohne lesbare GesetzInfos bleibt das
 * Zwischenergebnis erhalten. Der Dateiimport reicht den gewählten Modus durch. */
export async function nachbereiteGesetzesXML(
  xmlString: string,
  kontext?: ReferenzKontext,
  modus: NachbereitungBeiImport = 'saetze-und-verweise',
  meldeFehler?: (meldung: string) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string> {
  if (modus === 'aus') return xmlString;
  const rohXML =
    modus === 'saetze-und-verweise' ? entferneBestehendeVerweise(xmlString) : xmlString;
  const meldeSatzaufbauFehler = (text: string) => {
    meldeFehler?.(text);
    if (meldungEmpfangen) {
      meldePersistenzBefund(
        { text, typ: 'warnung', art: 'fehler', anlass: 'lesen', aenderungsstand: 'keine' },
        meldungEmpfangen,
      );
    }
  };
  const tokenisiert =
    modus === 'verweise' ? rohXML : tokenisiereGesetzesXML(rohXML, meldeSatzaufbauFehler);
  if (modus === 'saetze') return tokenisiert;
  const infos = leseGesetzInfos(tokenisiert);
  if (!infos) return tokenisiert;

  return taggeGesetzesXML(tokenisiert, infos.kurztitel, infos.normgeber, kontext, meldungEmpfangen);
}
