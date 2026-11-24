// laufBericht.ts
// Gemeinsame Zusammenfassung und getrennte Gesetzfehlerabschnitte aller Entwicklerläufe.
export interface LaufBericht {
  gespeichert: number;
  teilerfolge: { kurztitel: string; meldung: string }[];
  fehlgeschlagen: { kurztitel: string; meldung: string }[];
  zusatzzeilen?: string[];
}

export function formatiereLaufZusammenfassung(bericht: LaufBericht): string {
  return `Erfolgreich gespeichert: ${bericht.gespeichert} / Teilerfolge: ${bericht.teilerfolge.length} / Fehlgeschlagen: ${bericht.fehlgeschlagen.length}`;
}

export function formatiereLaufBericht(bericht: LaufBericht): string {
  const abschnitt = (titel: string, eintraege: LaufBericht['fehlgeschlagen']) =>
    `${titel}\n${eintraege.length ? eintraege.map((e) => `${e.kurztitel}: ${e.meldung}`).join('\n') : 'Keine.'}`;
  return (
    [
      [formatiereLaufZusammenfassung(bericht), ...(bericht.zusatzzeilen ?? [])].join('\n'),
      abschnitt('Teilerfolge', bericht.teilerfolge),
      abschnitt('Fehlgeschlagen', bericht.fehlgeschlagen),
    ].join('\n\n') + '\n'
  );
}
