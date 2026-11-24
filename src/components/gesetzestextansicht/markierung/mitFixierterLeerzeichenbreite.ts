// mitFixierterLeerzeichenbreite.ts
// Erhält geschützte Leerzeichen, Textpositionen und Unterstreichungsabstände.

import { createElement, type CSSProperties, type ReactNode } from 'react';
import { mitUmbruchschutz } from './umbruchschutz';
import { teileDarstellungstext, type GeschuetzterDarstellungstext } from './darstellungstext';

// ---------------------------------------------------------------------------
// Geschütztes Leerzeichen ↔ Blocksatz
// ---------------------------------------------------------------------------
// Siehe ausführliche Begründung ursprünglich in textBlatt.tsx
// (Kopfkommentar dort, Abschnitt "Geschütztes Leerzeichen ↔ Blocksatz").
//
// EXPORTIERT (nicht nur intern gebraucht): baum/textBlatt.tsx
// braucht dieselbe Funktion an 4 weiteren Stellen, die nicht über
// VerweisAnzeige laufen. baum/ darf bereits einseitig aus markierung.index
// importieren (siehe Kopfkommentar dort) – der Import von dort ist damit
// zyklusfrei und einer Duplizierung dieser 25-Zeilen-Funktion vorzuziehen.
function textMitErhaltenenAbstaenden(
  text: GeschuetzterDarstellungstext,
  deko: CSSProperties,
): ReactNode {
  if (deko.textDecoration !== 'underline') return text.text;
  let position = 0;
  return text.text.split(/( {2,}|\t+)/).map((inhalt, index) => {
    const teil = teileDarstellungstext(text, position, position + inhalt.length);
    position += inhalt.length;
    return /^[ \t]{2,}$|^\t+$/.test(teil.text)
      ? // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: teil.text stammt aus teileDarstellungstext; markierungsBausteine.test.tsx prüft Zeichen und Abstände.
        createElement('span', { key: index, style: { whiteSpaceCollapse: 'preserve' } }, teil.text)
      : teil.text;
  });
}

export function mitFixierterLeerzeichenbreite(
  text: GeschuetzterDarstellungstext,
  deko?: CSSProperties,
): ReactNode {
  if (!text.text.includes('\u00a0')) return mitLeerzeichenboxen(text, deko);
  return mitUmbruchschutz(text, (teil) => mitLeerzeichenboxen(teil, deko));
}

export function mitLeerzeichenboxen(
  text: GeschuetzterDarstellungstext,
  deko?: CSSProperties,
): ReactNode {
  // Bei pre-wrap bleiben normale Wortzwischenräume am Zeilenende hängen und
  // werden mit unterstrichen. Für Unterstreichungen lässt der Browser diese
  // Räume kollabieren; explizite Zeilenumbrüche und geschützte Räume bleiben.
  // text-wrap wird dabei geerbt, insbesondere nowrap bei Normbezeichnungen.
  // DOM-Text und damit alle gespeicherten Zeichenpositionen bleiben identisch.
  if (deko?.textDecoration === 'underline') {
    deko = { ...deko, whiteSpaceCollapse: 'preserve-breaks' };
  }
  if (!text.text.includes('\u00A0')) {
    return deko
      ? // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: textMitErhaltenenAbstaenden erhält GeschuetzterDarstellungstext; markierungsBausteine.test.tsx prüft Abstände.
        createElement('span', { style: deko }, textMitErhaltenenAbstaenden(text, deko))
      : text.text;
  }
  const teile = text.text.split('\u00A0');
  const ergebnis: ReactNode[] = [];
  let position = 0;
  teile.forEach((inhalt, i) => {
    const teil = teileDarstellungstext(text, position, position + inhalt.length);
    position += inhalt.length;
    if (teil.text) {
      ergebnis.push(
        deko
          ? createElement(
              'span',
              { key: `t${i}`, style: deko },
              // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: teil stammt aus teileDarstellungstext; markierungsBausteine.test.tsx prüft Dekoration.
              textMitErhaltenenAbstaenden(teil, deko),
            )
          : teil.text,
      );
    }
    if (i < teile.length - 1) {
      ergebnis.push(
        createElement(
          'span',
          { key: `n${i}`, style: { ...deko, display: 'inline-block' } },
          '\u00A0',
        ),
      );
      position += 1;
    }
  });
  return ergebnis;
}
