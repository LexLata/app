// Reiner Parser für den begrenzten Datenschutzhinweis. Liefert Textknoten statt HTML;
// unbekannte Syntax wird abgelehnt, damit Änderungen der Textquelle sichtbar scheitern.
type Inline =
  { art: 'text' | 'code'; inhalt: string } | { art: 'fett' | 'kursiv'; inhalt: Inline[] };
type Block =
  | { art: 'ueberschrift'; ebene: number; inhalt: Inline[] }
  | { art: 'absatz'; inhalt: Inline[] }
  | { art: 'liste'; eintraege: Inline[][] }
  | { art: 'tabelle'; kopf: Inline[][]; zeilen: Inline[][][] };

function nichtUnterstuetzt(): never {
  throw new Error('Nicht unterstützte oder beschädigte Markdown-Syntax.');
}

function inlineFormat(quelle: string, position: number): { knoten: Inline; ende: number } | null {
  const rest = quelle.slice(position);
  const marker = rest.startsWith('`')
    ? '`'
    : rest.startsWith('**')
      ? '**'
      : /^[*_]/.test(rest)
        ? rest[0]!
        : null;
  if (!marker) {
    if (/^(?:[<>]|!\[|\[[^\]]*\](?:\(|\[|:)|~~|\\)/.test(rest)) nichtUnterstuetzt();
    return null;
  }
  const ende = quelle.indexOf(marker, position + marker.length);
  if (ende <= position + marker.length) nichtUnterstuetzt();
  const inhalt = quelle.slice(position + marker.length, ende);
  const knoten: Inline =
    marker === '`'
      ? { art: 'code', inhalt }
      : { art: marker === '**' ? 'fett' : 'kursiv', inhalt: parseInline(inhalt) };
  return { knoten, ende: ende + marker.length };
}

function parseInline(quelle: string): Inline[] {
  const knoten: Inline[] = [];
  let position = 0;
  let text = '';
  const textAbschliessen = () => {
    if (text) knoten.push({ art: 'text', inhalt: text });
    text = '';
  };
  while (position < quelle.length) {
    const format = inlineFormat(quelle, position);
    if (format) {
      textAbschliessen();
      knoten.push(format.knoten);
      position = format.ende;
    } else {
      text += quelle[position];
      position++;
    }
  }
  textAbschliessen();
  return knoten;
}

function pruefeZeile(zeile: string, listenFortsetzung = false): void {
  if (
    /^\s*(?:>|\d+[.)]\s|```|~~~|#{7,}(?:\s|$)|(?:[-*_]\s*){3,}$|=+$)/.test(zeile) ||
    /^\s+[-+*]\s/.test(zeile) ||
    /^[+*]\s/.test(zeile) ||
    (!listenFortsetzung && /^(?: {4}|\t)/.test(zeile))
  )
    nichtUnterstuetzt();
}

function tabellenZellen(zeile: string): string[] {
  const inhalt = zeile.trim();
  if (!inhalt.startsWith('|') || !inhalt.endsWith('|')) nichtUnterstuetzt();
  return inhalt
    .slice(1, -1)
    .split('|')
    .map((zelle) => zelle.trim());
}

function parseTabelle(zeilen: string[], start: number): { block: Block; ende: number } {
  const kopf = tabellenZellen(zeilen[start]!);
  const trennzellen = tabellenZellen(zeilen[start + 1] ?? '');
  if (
    trennzellen.length !== kopf.length ||
    !trennzellen.every((zelle) => /^:?-{3,}:?$/.test(zelle))
  ) {
    nichtUnterstuetzt();
  }
  const daten: Inline[][][] = [];
  let ende = start + 2;
  while (ende < zeilen.length && zeilen[ende]!.trim().startsWith('|')) {
    const zellen = tabellenZellen(zeilen[ende]!);
    if (zellen.length !== kopf.length) nichtUnterstuetzt();
    daten.push(zellen.map(parseInline));
    ende++;
  }
  return { block: { art: 'tabelle', kopf: kopf.map(parseInline), zeilen: daten }, ende };
}

function parseListe(zeilen: string[], start: number): { block: Block; ende: number } {
  const eintraege: Inline[][] = [];
  let ende = start;
  while (ende < zeilen.length && zeilen[ende]!.startsWith('- ')) {
    let inhalt = zeilen[ende]!.slice(2).trim();
    ende++;
    while (ende < zeilen.length && /^\s+\S/.test(zeilen[ende]!)) {
      pruefeZeile(zeilen[ende]!, true);
      inhalt += ' ' + zeilen[ende]!.trim();
      ende++;
    }
    eintraege.push(parseInline(inhalt));
  }
  return { block: { art: 'liste', eintraege }, ende };
}

/** Einzige öffentliche Operation; ohne I/O, Zustand oder HTML-Verarbeitung. */
export function parseMiniMarkdown(quelle: string): Block[] {
  const ohneKommentare = quelle.replace(/<!--[\s\S]*?-->/g, '');
  if (ohneKommentare.includes('<!--') || ohneKommentare.includes('-->')) nichtUnterstuetzt();
  const zeilen = ohneKommentare.replace(/\r\n?/g, '\n').split('\n');
  const bloecke: Block[] = [];
  let position = 0;
  while (position < zeilen.length) {
    const zeile = zeilen[position]!;
    if (!zeile.trim()) {
      position++;
      continue;
    }
    pruefeZeile(zeile);
    const ueberschrift = /^(#{1,6})\s+(.+)$/.exec(zeile);
    if (ueberschrift) {
      bloecke.push({
        art: 'ueberschrift',
        ebene: ueberschrift[1]!.length,
        inhalt: parseInline(ueberschrift[2]!.trim()),
      });
      position++;
    } else if (zeile.startsWith('- ') || zeile.trim().startsWith('|')) {
      const ergebnis = zeile.startsWith('- ')
        ? parseListe(zeilen, position)
        : parseTabelle(zeilen, position);
      bloecke.push(ergebnis.block);
      position = ergebnis.ende;
    } else {
      const absatz: string[] = [];
      do {
        pruefeZeile(zeilen[position]!);
        absatz.push(zeilen[position]!.trim());
        position++;
      } while (
        position < zeilen.length &&
        zeilen[position]!.trim() &&
        !/^(?:#{1,6}\s|- |\|)/.test(zeilen[position]!)
      );
      bloecke.push({ art: 'absatz', inhalt: parseInline(absatz.join(' ')) });
    }
  }
  return bloecke;
}
