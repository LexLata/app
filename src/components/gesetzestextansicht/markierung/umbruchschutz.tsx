// umbruchschutz.tsx
// Gemeinsame Gruppenbildung am vollständigen, bereits geschützten Text:
// Blatttext und angehängte Normzitate teilen dekorative/Klickbereiche erst
// innerhalb dieser Gruppen. Alle Startpositionen zählen ursprüngliche UTF-16-Zeichen.
import type { ReactNode } from 'react';
import { teileDarstellungstext, type GeschuetzterDarstellungstext } from './darstellungstext';

// Eine eigene Leerzeichenbox schafft Umbruchstellen an ihren Rändern.
// Deshalb bleiben die durch NBSP verbundenen Wörter in einer nowrap-Gruppe.
export function mitUmbruchschutz(
  text: GeschuetzterDarstellungstext,
  render: (teil: GeschuetzterDarstellungstext, start: number) => ReactNode,
): ReactNode {
  let position = 0;
  return text.text.split(/([^\s\u00a0]+(?:\u00a0+[^\s\u00a0]+)+)/).map((teil, index) => {
    const start = position;
    position += teil.length;
    // Die ungeraden Teile sind die erfassten Wortgruppen; freie NBSP
    // in den übrigen Teilen dürfen keine ganze Passage zusammenbinden.
    return (
      <span key={index} style={index % 2 === 1 ? { whiteSpace: 'nowrap' } : undefined}>
        {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: mitUmbruchschutz übergibt teileDarstellungstext an den Renderer für geschützten Text; markierungsBausteine.test.tsx und textBlatt.auswahl.test.tsx prüfen Gruppen und Positionen. */}
        {render(teileDarstellungstext(text, start, position), start)}
      </span>
    );
  });
}
