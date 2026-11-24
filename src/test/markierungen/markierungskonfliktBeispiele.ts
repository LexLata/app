// Liest die Originaldateien und hält die über öffentliche Typen sichtbaren Konfliktarten fest.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  AnzeigeKonfliktEintrag,
  AnzeigeGesetzKonflikte,
} from '@/lib/markierungen/markierungen.index';
export const konfliktBeispielReihenfolge = [
  'mkh-gesetz.xml',
  'mkn-gesetz.xml',
  'mkh-nichtamtliche-titel.xml',
  'mkh-markierungen.xml',
  'mkn-markierungen.xml',
  'mkf-markierungen.xml',
];
const konfliktBeispielOrdner = resolve('docs/doku/testdaten');
export const leseKonfliktBeispiel = (name: string) =>
  readFileSync(resolve(konfliktBeispielOrdner, name), 'utf8');

export const beispielEigeneKonflikte: Record<
  NonNullable<AnzeigeKonfliktEintrag['eigenerKonflikt']>,
  true
> = {
  bezugstextFehltOderUnpassend: true,
  pauschalerBezugFehlt: true,
  pauschalerBezugUnpassend: true,
};
export const beispielZielkonflikte: Record<
  AnzeigeKonfliktEintrag['zielKonflikte'][number]['typ'],
  true
> = {
  zielGesetzFehlt: true,
  zielNormFehlt: true,
  zielNormUnpassend: true,
};
export const beispielGesetzesweiteKonflikte: Record<
  Exclude<keyof AnzeigeGesetzKonflikte, 'gesetz' | 'eintraege'>,
  true
> = {
  fehlendesGesetz: true,
  nichtamtlicheTitelXmlFehlt: true,
};

/** Die Doku-Matrix wird im direkten Beispieltest mit allen Originalmarkierungen abgeglichen. */
export function leseKonfliktMatrix() {
  return readFileSync(resolve('docs/doku/markierungskonflikte.md'), 'utf8')
    .split('\n')
    .filter((z) => /^\| MK[HNF]-\d+/.test(z))
    .map((z) => z.split('|').map((spalte) => spalte.trim()));
}
