// laufMeldung.ts
// Unterscheidet sichtbare Ergebnisse und flüchtigen Fortschritt von Diagnosedetails.
export type LaufMeldung = { art: 'ergebnis' | 'status'; text: string };
export type LaufFortschritt = {
  erfolgreich: number;
  teilerfolge: number;
  fehlgeschlagen: number;
  uebersprungen: number;
  aktiv: number;
};
export interface LaufAusgabe {
  ausgabe(zeile: string): void | Promise<void>;
  melde?: (meldung: LaufMeldung) => void | Promise<void>;
}
export function meldeLaufErgebnis(umgebung: LaufAusgabe, text: string) {
  return umgebung.melde ? umgebung.melde({ art: 'ergebnis', text }) : umgebung.ausgabe(text);
}
export function meldeLaufFortschritt(umgebung: LaufAusgabe, vorabFehler = 0) {
  return (stand: LaufFortschritt) => {
    const fehlgeschlagen = stand.fehlgeschlagen + vorabFehler;
    const abgeschlossen = stand.erfolgreich + stand.teilerfolge + fehlgeschlagen;
    const mitZusatz = stand.teilerfolge > 0 || stand.uebersprungen > 0;
    const ergebniszahlen = mitZusatz
      ? `Erfolge: ${stand.erfolgreich} · Fehler: ${fehlgeschlagen}`
      : `erfolgreich: ${stand.erfolgreich} · fehlgeschlagen: ${fehlgeschlagen}`;
    void umgebung.melde?.({
      art: 'status',
      text:
        `Abgeschlossen: ${abgeschlossen} · ${ergebniszahlen} · aktiv: ${stand.aktiv}` +
        (stand.teilerfolge ? ` · Teilerfolge: ${stand.teilerfolge}` : '') +
        (stand.uebersprungen ? ` · übersprungen: ${stand.uebersprungen}` : ''),
    });
  };
}
