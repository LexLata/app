// xmlSerialisierung.ts
// Baut aus der ImpAbsatz-Zwischenstruktur den GesetzesXML-String-Anteil
// (text/absatz/satz/nummer/litera-Elemente).

import {
  type ImpAbsatz,
  type ImpElement,
  type ImpEintrag,
  type SatzXML,
  esc,
  escSatz,
  tagUndAttr,
} from '@/lib/import/basis/importTextstruktur';
import { tokenize } from '@/lib/import/basis/satzTokenizer';

// ---------------------------------------------------------------------------
// Listeneintrag → XML
// ---------------------------------------------------------------------------

export function baueEintrag(e: ImpEintrag, indent: string): string[] {
  const [tag, attr] = tagUndAttr(e.bezeichnung);
  const i2 = indent + '  ';
  const hatDL = e.untereintraege.length > 0;

  const vorText = e.texteVor
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n');
  const nachText = e.texteNach
    .map((t) => t.trim())
    .filter(Boolean)
    .join('\n');

  if (!hatDL) {
    // Ohne Unterliste gibt es keine strukturelle Trennung mehr zwischen
    // "Text vor der Liste" und "Text nach der Liste" – beides wird als ein
    // zusammenhängender Text behandelt. texteNach kann hier trotzdem
    // nicht-leer sein (z.B. wenn juris.de ein Listenelement ohne Unterliste
    // auf zwei aufeinanderfolgende <dd> aufteilt, siehe HTMLImporterBW.ts:
    // ergaenzeEintragMitDD) – wurde vorher fälschlich stillschweigend
    // verworfen.
    const kompletterText = [vorText, nachText].filter(Boolean).join('\n');
    if (!kompletterText) {
      return [`${indent}<${tag} ${attr}="${esc(e.bezeichnung)}"/>`];
    }
    // Sätze tokenisieren: bei mehreren Sätzen explizite <satz>-Elemente schreiben
    const saetze = tokenize(kompletterText);
    if (saetze.length <= 1) {
      return [
        `${indent}<${tag} ${attr}="${esc(e.bezeichnung)}">${escSatz(kompletterText)}</${tag}>`,
      ];
    }
    const lines: string[] = [`${indent}<${tag} ${attr}="${esc(e.bezeichnung)}">`];
    saetze.forEach((s, i) => lines.push(`${i2}<satz zahl="${i + 1}">${escSatz(s)}</satz>`));
    lines.push(`${indent}</${tag}>`);
    return lines;
  }

  // Mit Unterliste: vorText/nachText werden AKTUELL bewusst NICHT durch
  // tokenize() satztokenisiert (anders als im !hatDL-Zweig oben) – auch
  // wenn sie mehrere Sätze enthalten, bleiben sie ein roher Textblock ohne
  // <satz>-Elemente.
  //
  // Grund für das Zurückstellen (siehe Absprache): gesetzesXMLParser.ts
  // (parseListenEintrag(), Zeile ~232ff.) erkennt Mehrfach-Sätze nur, wenn
  // ALLE Kinder eines <nummer>/<litera>-Elements <satz> sind
  // (nurSatzKinder-Prüfung). Sobald zusätzlich eine Unterliste UND ein
  // <zeilenumbruch/> dazwischenstehen, greift der andere Parser-Zweig, der
  // explizit "Einzelsatz" annimmt und den gesamten Text unabhängig von der
  // Satzanzahl zu einem einzigen String zusammenfasst – die Satzgrenzen
  // gingen dort verloren (getestet, inkl. unbereinigter XML-Whitespace-
  // Reste). Ein sauberer Fix müsste also NICHT NUR hier ansetzen, sondern
  // auch parseListenEintrag() (und darauf aufbauend vermutlich
  // satzEintragBausteine.tsx sowie
  // textpfad.rueckwaerts.ts) erweitern – deutlich größerer,
  // cross-cutting Eingriff. Zurückgestellt, bis ein echter Fall im Gesetz
  // auftritt.
  const lines: string[] = [];
  const oeffner = `${indent}<${tag} ${attr}="${esc(e.bezeichnung)}">`;
  lines.push(vorText ? `${oeffner}${escSatz(vorText)}` : oeffner);
  for (const sub of e.untereintraege) lines.push(...baueEintrag(sub, i2));
  if (nachText) lines.push(`${i2}<zeilenumbruch/>${escSatz(nachText)}`);
  lines.push(`${indent}</${tag}>`);
  return lines;
}

// ---------------------------------------------------------------------------
// ImpElement-Liste → SatzXML-Datensätze
// ---------------------------------------------------------------------------

// Prüft, ob der letzte result-Eintrag eine offene Liste ohne abschließenden
// Punkt ist, die den ERSTEN Satz von saetze als "fortsetzung" aufnehmen kann
// (z.B. "worden sind." nach einer Liste). Bei Erfolg wird letzter.fortsetzung
// gesetzt und alle WEITEREN Sätze werden direkt als eigenständige Einträge
// an result angehängt (mutiert result in-place, wie der Rest dieser Datei –
// siehe z.B. gruppiereAbsaetze). Gibt zurück, ob die Fortsetzung angewendet
// wurde (dann hat der Aufrufer elem bereits vollständig verarbeitet).
function versucheAlsFortsetzung(result: SatzXML[], saetze: string[]): boolean {
  if (result.length === 0) return false;
  // result.length > 0 wurde soeben geprüft.
  const letzter = result[result.length - 1]!;
  if (letzter.eintraege === undefined || letzter.fortsetzung !== undefined) return false;

  const letzterEintrag = letzter.eintraege[letzter.eintraege.length - 1];
  const _texteVor = letzterEintrag?.texteVor;
  const lastChar =
    _texteVor && _texteVor.length > 0
      ? _texteVor[_texteVor.length - 1]!.trimEnd().slice(-1)
      : undefined;
  if (!lastChar || lastChar === '.') return false;

  // Nur den ersten Satz als Abschluss der Liste verwenden (z.B. "worden sind."),
  // alle weiteren Sätze als eigenständige Satz-Einträge anhängen.
  // saetze ist nicht-leer: 'texte'-Elemente werden ausschließlich mit
  // saetze.length > 0 erzeugt (siehe parseP.ts).
  letzter.fortsetzung = saetze[0]!;
  for (let k = 1; k < saetze.length; k++) {
    result.push({ text: saetze[k]! });
  }
  return true;
}

// Hängt die Sätze eines 'texte'-Elements an result an. Ist der LETZTE Satz
// unmittelbar von einer 'liste' gefolgt, wird diese ihm als eintraege
// zugeordnet (statt als eigener leerer Eintrag zu erscheinen) und gilt als
// konsumiert – der Rückgabewert zeigt das dem Aufrufer an, damit dieser den
// Schleifenindex entsprechend weiterschaltet.
function verarbeiteTexteSaetze(
  saetze: string[],
  naechstesElem: ImpElement | undefined,
  result: SatzXML[],
): { listeKonsumiert: boolean } {
  let listeKonsumiert = false;
  saetze.forEach((satz, j) => {
    const istLetzter = j === saetze.length - 1;
    if (istLetzter && naechstesElem?.type === 'liste') {
      result.push({ text: satz, eintraege: naechstesElem.eintraege });
      listeKonsumiert = true;
    } else {
      result.push({ text: satz });
    }
  });
  return { listeKonsumiert };
}

/**
 * Flacht ImpElement-Liste in SatzXML-Datensätze um.
 * Direkte Übersetzung von flattenElemente() in Swift.
 */
export function flattenElemente(elems: ImpElement[]): SatzXML[] {
  const result: SatzXML[] = [];
  let i = 0;
  while (i < elems.length) {
    // Schleifen-Invariante: i < elems.length (Bedingung der while-Schleife) –
    // elem ist daher immer definiert.
    const elem = elems[i]!;
    if (elem.type === 'texte') {
      if (versucheAlsFortsetzung(result, elem.saetze)) {
        i++;
        continue;
      }
      const { listeKonsumiert } = verarbeiteTexteSaetze(elem.saetze, elems[i + 1], result);
      if (listeKonsumiert) i++; // Liste konsumieren
    } else if (elem.type === 'liste') {
      // Reine Liste ohne vorangehenden Text
      result.push({ text: '', eintraege: elem.eintraege });
    } else {
      // elem.type === 'unterabsatz'
      result.push({ text: '', istUnterabsatzMarker: true });
    }
    i++;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Satz → XML (Inline- und Block-Varianten)
// ---------------------------------------------------------------------------

export function baueSatzInline(s: SatzXML, tag: string, attrStr: string, indent: string): string[] {
  const i2 = indent + '  ';
  if (!s.eintraege) {
    return [`${indent}<${tag}${attrStr}>${escSatz(s.text)}</${tag}>`];
  }
  const lines = [`${indent}<${tag}${attrStr}>${escSatz(s.text)}`];
  for (const e of s.eintraege) lines.push(...baueEintrag(e, i2));
  if (s.fortsetzung) lines.push(escSatz(s.fortsetzung));
  lines.push(`${indent}</${tag}>`);
  return lines;
}

export function baueSatzBlock(s: SatzXML, zahl: number, indent: string): string[] {
  const i2 = indent + '  ';
  if (!s.eintraege) {
    return [`${indent}<satz zahl="${zahl}">${escSatz(s.text)}</satz>`];
  }
  const lines = [`${indent}<satz zahl="${zahl}">${escSatz(s.text)}`];
  for (const e of s.eintraege) lines.push(...baueEintrag(e, i2));
  if (s.fortsetzung) lines.push(escSatz(s.fortsetzung));
  lines.push(`${indent}</satz>`);
  return lines;
}

// ---------------------------------------------------------------------------
// Absatz-Gruppierung und Text-Ausgabe
// ---------------------------------------------------------------------------

/**
 * Baut die <satz>-Kindelemente eines <absatz> (bzw. <text>). "Satz" ist
 * eine zitierfähige Untereinheit – ohne Unterabsätze zählt sie fortlaufend
 * innerhalb des Absatzes (Satz 1, Satz 2, …), WIE BISHER. Enthält der Absatz
 * jedoch Unterabsatz-Marker (siehe importTextstruktur.ts), ist "Satz" richtigerweise
 * eine Untereinheit des jeweiligen Unterabsatzes (zitiert z.B. als
 * "Art. 6 Abs. 1 UAbs. 2 Satz 1 EUV") – die Zählung muss daher pro
 * Unterabsatz bei 1 neu beginnen, statt über die Unterabsatz-Grenze hinweg
 * fortzulaufen. Die Marker selbst werden dafür zu echten umschließenden
 * <unterabsatz zahl="[n]">-Elementen (statt eines flachen <unterabsatz/>-
 * Geschwisters), damit diese Zählung sauber lokal bleibt.
 */
function baueSaetzeEinesAbsatzes(saetze: SatzXML[], indent: string): string[] {
  const hatUnterabsaetze = saetze.some((s) => s.istUnterabsatzMarker);

  if (!hatUnterabsaetze) {
    const lines: string[] = [];
    let zahl = 0;
    saetze.forEach((s) => {
      zahl++;
      lines.push(...baueSatzBlock(s, zahl, indent));
    });
    return lines;
  }

  // Marker-getrennte Gruppen bilden: alles vor dem ersten Marker ist
  // Unterabsatz 1, alles zwischen Marker n und n+1 ist Unterabsatz n+1 usw.
  const gruppen: SatzXML[][] = [[]];
  for (const s of saetze) {
    if (s.istUnterabsatzMarker) {
      gruppen.push([]);
      continue;
    }
    // gruppen startet als [[]] und wird nie geleert (nur gepusht) – Index
    // daher immer gültig.
    gruppen[gruppen.length - 1]!.push(s);
  }

  const i2 = indent + '  ';
  const lines: string[] = [];
  let unterabsatzNr = 0;
  for (const gruppe of gruppen) {
    if (gruppe.length === 0) continue; // sollte nicht vorkommen, defensiv
    unterabsatzNr++;
    const zahlAttr = ` zahl="[${unterabsatzNr}]"`;
    if (gruppe.length === 1) {
      // Wie beim einsätzigen Absatz (z.B. Absatz (3) ohne Unterabsätze):
      // ein einzelner Satz braucht keinen eigenen <satz>-Wrapper, der Text
      // steht direkt im <unterabsatz>. gruppe[0] ist sicher: gruppe.length === 1.
      lines.push(...baueSatzInline(gruppe[0]!, 'unterabsatz', zahlAttr, indent));
      continue;
    }
    lines.push(`${indent}<unterabsatz${zahlAttr}>`);
    let zahl = 0;
    gruppe.forEach((s) => {
      zahl++;
      lines.push(...baueSatzBlock(s, zahl, i2));
    });
    lines.push(`${indent}</unterabsatz>`);
  }
  return lines;
}

export function gruppiereAbsaetze(abs: ImpAbsatz[]): ImpAbsatz[] {
  const result: ImpAbsatz[] = [];
  for (const a of abs) {
    if (a.absatzgrenzeErhalten) {
      result.push({ ...a });
    } else if (a.zwischenueberschrift) {
      result.push({ ...a, nummer: undefined });
    } else if (a.nummer !== undefined) {
      result.push({ nummer: a.nummer, elemente: a.elemente });
    } else if (
      result.length > 0 &&
      !result[result.length - 1]!.zwischenueberschrift &&
      !result[result.length - 1]!.absatzgrenzeErhalten
    ) {
      // result.length > 0 wurde soeben geprüft.
      const letzterEintrag = result[result.length - 1]!;
      letzterEintrag.elemente = [...letzterEintrag.elemente, ...a.elemente];
    } else {
      result.push({ nummer: undefined, elemente: a.elemente });
    }
  }
  return result;
}

// Baut die Zeilen EINES <absatz>-Elements (mit optionalem zahl-Attribut) für
// eine bereits geflachte Satzliste. Kurzform ohne <satz>-Wrapper bei genau
// einem Satz, auch mit Liste und Fortsetzung; sonst voller Block mit
// baueSaetzeEinesAbsatzes.
// Identisch für nummerierte und unnummerierte Absätze – der einzige
// Unterschied ist das zahlAttr (leer bei unnummeriert).
function baueAbsatzZeilen(saetze: SatzXML[], zahlAttr: string, indent: string): string[] {
  if (saetze.length === 1) {
    return baueSatzInline(saetze[0]!, 'absatz', zahlAttr, indent);
  }
  const i2 = indent + '  ';
  return [
    `${indent}<absatz${zahlAttr}>`,
    ...baueSaetzeEinesAbsatzes(saetze, i2),
    `${indent}</absatz>`,
  ];
}

export function baueText(absaetze: ImpAbsatz[], indent: string): string[] {
  const gruppen = gruppiereAbsaetze(absaetze);
  if (gruppen.length === 0) return [];

  const i2 = indent + '  ';

  // Einzelne unnummerierte Gruppe
  if (
    gruppen.length === 1 &&
    gruppen[0]!.nummer === undefined &&
    !gruppen[0]!.zwischenueberschrift &&
    !gruppen[0]!.absatzgrenzeErhalten
  ) {
    const saetze = flattenElemente(gruppen[0]!.elemente);
    if (saetze.length === 0) return [];
    if (saetze.length === 1) {
      return baueSatzInline(saetze[0]!, 'text', '', indent);
    }
    return [`${indent}<text>`, ...baueSaetzeEinesAbsatzes(saetze, i2), `${indent}</text>`];
  }

  // Mehrere Gruppen (nummerierte Absätze)
  const lines = [`${indent}<text>`];
  for (const gruppe of gruppen) {
    if (gruppe.zwischenueberschrift) {
      const text = gruppe.elemente
        .flatMap((el) => (el.type === 'texte' ? el.saetze : []))
        .join(' ');
      lines.push(`${i2}<absatz typ="zwischenueberschrift">${escSatz(text)}</absatz>`);
      continue;
    }
    const saetze = flattenElemente(gruppe.elemente);
    if (saetze.length === 0) continue;
    const zahlAttr = gruppe.nummer !== undefined ? ` zahl="${esc(gruppe.nummer)}"` : '';
    lines.push(...baueAbsatzZeilen(saetze, zahlAttr, i2));
  }
  lines.push(`${indent}</text>`);
  return lines;
}
