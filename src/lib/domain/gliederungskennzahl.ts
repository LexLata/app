// Gemeinsame Regeln für Gliederungskennzahlen aus nichtleeren Dreier-Ziffernblöcken.

/** Prüft eine vollständige Gliederungskennzahl ohne Leerraum oder Zusatzzeichen. */
export function istGueltigeGliederungskennzahl(text: string): boolean {
  return /^([0-9]{3})+$/.test(text);
}

/** Anzeigeadresse einer Überschrift im eigenen Namensraum. */
export function ueberschriftXmlId(gliederungskennzahl: string): string {
  return `ueberschrift:${gliederungskennzahl}`;
}

/** Ebene einer Gliederungskennzahl: ein Dreierblock je Ebene. */
export function gliederungsebene(text: string): number {
  return text.length / 3;
}

/** Vergibt hierarchische Kennzahlen und hält amtliche Werte für das ganze Gesetz frei. */
export class GliederungskennzahlVergabe {
  private zaehler: number[] = [];
  private readonly reserviert: Set<string>;

  constructor(amtlicheKennzahlen: Iterable<string> = []) {
    this.reserviert = new Set(amtlicheKennzahlen);
  }

  vergib(ebene: number, amtlicheKennzahl?: string): string {
    if (amtlicheKennzahl) {
      this.zaehler = Array.from(amtlicheKennzahl.matchAll(/.{3}/g), (treffer) =>
        Number(treffer[0]),
      );
      this.reserviert.add(amtlicheKennzahl);
      return amtlicheKennzahl;
    }
    while (this.zaehler.length < ebene) this.zaehler.push(0);
    this.zaehler.length = ebene;
    let kennzahl: string;
    do {
      const zahl = (this.zaehler[ebene - 1] ?? 0) + 10;
      if (zahl > 990) throw new Error('Zu viele Gliederungen auf derselben Ebene.');
      this.zaehler[ebene - 1] = zahl;
      kennzahl = this.zaehler.map((zahl) => String(zahl).padStart(3, '0')).join('');
    } while (this.reserviert.has(kennzahl));
    this.reserviert.add(kennzahl);
    return kennzahl;
  }
}
