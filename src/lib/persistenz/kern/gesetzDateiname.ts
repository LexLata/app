// Umkehrbare, plattformübergreifende Dateinamen für Gesetzesreferenzen.
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import { liesPflichtNormgeber } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

export const GESETZE_ORDNER = 'gesetze';
export const MARKIERUNGEN_ORDNER = 'markierungen';
export const FAVORITEN_ORDNER = 'favoriten';
export const NICHTAMTLICHE_TITEL_ORDNER = 'nichtamtliche-titel';

export const LESEZEICHEN_DATEINAME = 'lesezeichen.xml';
export const GESETZESKURZBEFEHLE_DATEINAME = 'gesetzeskurzbefehle.xml';

export const MARKIERUNGEN_SUFFIX = '-markierungen.xml';
export const FAVORITEN_SUFFIX = '-favoriten.xml';
export const NICHTAMTLICHE_TITEL_SUFFIX = '-nichtamtliche-titel.xml';

function pruefeReferenz(ref: Gesetzesreferenz): void {
  if (!ref.kurztitel) throw new Error('Der Kurztitel darf nicht leer sein.');
  liesPflichtNormgeber(ref.normgeber);
}

function kodiereKurztitel(kurztitel: string): string {
  // Die ausdrücklich vereinbarten Steuerzeichen müssen ebenfalls kodiert werden.
  return kurztitel.replace(
    // eslint-disable-next-line no-control-regex -- Windows verbietet U+0000 bis U+001F im Dateinamen; die Zeichenklasse kodiert genau diese Steuerzeichen umkehrbar.
    /[%<>:"/\\|?*\u0000-\u001f]|[. ](?=[. ]*$)/g,
    (zeichen) => `%${zeichen.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  );
}

function sichereWindowsName(name: string): string {
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name)) {
    return `%${name.charCodeAt(0).toString(16).toUpperCase()}${name.slice(1)}`;
  }
  return name;
}

/** Dateibasis = Schreibweise der Gesetzesreferenz im Dateinamen, keine Identität. */
export function dateiBasis(ref: Gesetzesreferenz): string {
  pruefeReferenz(ref);
  return kodierteDateiBasis(ref);
}

/** Vergleichsform: Kurztitel kleinschreiben, Normgeber exakt erhalten. */
export function normalisierteDateiBasis(ref: Gesetzesreferenz): string {
  pruefeReferenz(ref);
  return kodierteDateiBasis({
    kurztitel: kurztitelVergleichsform(ref.kurztitel),
    normgeber: ref.normgeber,
  });
}

function kodierteDateiBasis(ref: Gesetzesreferenz): string {
  return sichereWindowsName(`${kodiereKurztitel(ref.kurztitel)}_${ref.normgeber}`);
}

/** Liest ausschließlich gültige, umkehrbar kodierte Dateibasen. */
export function referenzAusDateiBasis(basis: string): Gesetzesreferenz | null {
  const trenner = basis.lastIndexOf('_');
  if (trenner <= 0) return null;
  const suffix = basis.slice(trenner + 1);
  try {
    const ref: Gesetzesreferenz = {
      kurztitel: decodeURIComponent(basis.slice(0, trenner)),
      normgeber: suffix,
    };
    // Hexziffern dürfen unabhängig von ihrer Schreibweise kodiert sein.
    const normalisiert = basis.replace(/%[\da-f]{2}/gi, (code) => code.toUpperCase());
    return dateiBasis(ref) === normalisiert ? ref : null;
  } catch {
    return null;
  }
}

/** Plattformübergreifender XML-Dateiname des Kurztitels ohne Normgeber-Suffix. */
export function kurztitelDateiname(kurztitel: string): string {
  if (!kurztitel) throw new Error('Der Kurztitel darf nicht leer sein.');
  return sichereWindowsName(`${kodiereKurztitel(kurztitel)}.xml`);
}

/** Berechnet den Ressourcenpfad; die Verfügbarkeit prüft der Leser. */
export function nichtamtlicheTitelRessourcenPfad(ref: Gesetzesreferenz): string {
  pruefeReferenz(ref);
  const titel = kurztitelDateiname(ref.kurztitel);
  return `resources/${NICHTAMTLICHE_TITEL_ORDNER}/${ref.normgeber}/${titel}`;
}
