// TextAnzeige.tsx
// Transformiert zusammenhängenden Rohtext vor seiner dekorativen Aufteilung.
import type { ReactNode } from 'react';
import {
  schuetzeLeerzeichen,
  schuetzeLeerzeichenZitat,
} from '@/lib/domain/basis/textNachbearbeitung';
import { erzeugeTextAttributElement } from './textanzeige.attribute';
import type { HervorhebungsBereich, TextAnzeigeProps, TextElement } from './textanzeige.types';

function pruefeBereiche(text: string, bereiche: readonly HervorhebungsBereich[]) {
  let ende = 0;
  for (const { von, bis } of bereiche) {
    if (
      !Number.isInteger(von) ||
      !Number.isInteger(bis) ||
      von < ende ||
      bis <= von ||
      bis > text.length
    ) {
      throw new RangeError(
        'Hervorhebungsbereiche müssen geordnet, nicht überlappend und innerhalb des Textes liegen.',
      );
    }
    ende = bis;
  }
}

export function TextAnzeige<E extends TextElement = 'span'>({
  element,
  text,
  modus = 'allgemein',
  hervorhebungen = [],
  hervorhebungStil,
  ...props
}: TextAnzeigeProps<E>) {
  const ursprung = String(text);
  pruefeBereiche(ursprung, hervorhebungen);
  const anzeige =
    modus === 'zitat' ? schuetzeLeerzeichenZitat(ursprung) : schuetzeLeerzeichen(ursprung);
  const traeger = element ?? 'span';
  if (traeger === 'option') {
    if (hervorhebungen.length)
      throw new RangeError('Optiontexte unterstützen keine Hervorhebungen.');
    return erzeugeTextAttributElement(traeger, { ...props, children: anzeige });
  }

  // Die Gruppen entstehen am vollständigen transformierten Text. Erst ihre
  // Inhalte werden dekoriert: ein strong kann die nowrap-Grenze nicht öffnen.
  function dekoriere(von: number, bis: number): ReactNode[] {
    const teile: ReactNode[] = [];
    if (von === bis) return teile;
    let position = von;
    for (const bereich of hervorhebungen) {
      if (bereich.bis <= von) continue;
      if (bereich.von >= bis) break;
      const start = Math.max(von, bereich.von);
      const ende = Math.min(bis, bereich.bis);
      if (position < start) teile.push(anzeige.slice(position, start));
      teile.push(
        <strong key={start} style={hervorhebungStil}>
          {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: TextAnzeige dekoriert einen Ausschnitt des vollständig transformierten Anzeigetexts; TextAnzeige.test.tsx prüft Gruppen und UTF-16-Hervorhebungen. */}
          {anzeige.slice(start, ende)}
        </strong>,
      );
      position = ende;
    }
    if (position < bis) teile.push(anzeige.slice(position, bis));
    return teile;
  }

  const kinder: ReactNode[] = [];
  let position = 0;
  for (const gruppe of anzeige.matchAll(/[^\s\u00a0]+(?:\u00a0+[^\s\u00a0]*)+/g)) {
    const von = gruppe.index;
    const bis = von + gruppe[0].length;
    kinder.push(...dekoriere(position, von));
    kinder.push(
      <span key={`gruppe-${von}`} style={{ whiteSpace: 'nowrap' }}>
        {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: TextAnzeige dekoriert innerhalb der am vollständigen Text ermittelten Schutzgruppe; TextAnzeige.test.tsx prüft gruppenübergreifende Hervorhebungen. */}
        {dekoriere(von, bis)}
      </span>,
    );
    position = bis;
  }
  kinder.push(...dekoriere(position, anzeige.length));
  return erzeugeTextAttributElement(traeger, { ...props, children: kinder });
}
