// ausfertigungsdatum.ts
// Eindeutige Quelldaten als vollständiges oder verkürztes ISO-Datum.
import { datumAusKalendertag } from '@/lib/utils/datumFormat';

const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export function normalisiereAusfertigungsdatum(text: string): string | undefined {
  const original = text.trim();
  if (!original) return undefined;
  // Die XSD-Datentypen date, gYearMonth und gYear schließen Jahr null aus.
  if (/^(?!0000)\d{4}$/.test(original)) return original;
  const iso = /^((?!0000)\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(original);
  if (iso)
    return datumAusKalendertag(Number(iso[1]), Number(iso[2]), Number(iso[3] ?? 1))
      ? original
      : undefined;
  const monatsangabe = /^(\p{L}+) ((?!0000)\d{4})$/u.exec(original);
  if (monatsangabe) {
    const monat = MONATE.indexOf(monatsangabe[1] ?? '') + 1;
    return monat ? `${monatsangabe[2]}-${String(monat).padStart(2, '0')}` : undefined;
  }
  const ausgeschrieben = /^(\d{1,2})\. (\p{L}+) ((?!0000)\d{4})$/u.exec(original);
  const numerisch = /^(\d{1,2})\.(\d{1,2})\.((?!0000)\d{4})$/.exec(original);
  const treffer = ausgeschrieben ?? numerisch;
  if (!treffer) return undefined;
  const tag = Number(treffer[1]);
  const monat = ausgeschrieben ? MONATE.indexOf(treffer[2]!) + 1 : Number(treffer[2]);
  const jahr = Number(treffer[3]);
  if (!datumAusKalendertag(jahr, monat, tag)) return undefined;
  return `${treffer[3]}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}
