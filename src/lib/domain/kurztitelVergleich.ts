// kurztitelVergleich.ts
// Vergleich gelesener Kurztiteleingaben; gespeicherte Gesetzesidentitäten bleiben unverändert.
import { normgeberAnzeigename } from './normgeber';

/** Alphabetische Listenreihenfolge: Kurztitel (deutsch, schreibungsunabhängig), dann angezeigter Normgeber. */
export function vergleicheNachKurztitelUndNormgeber(
  a: { kurztitel: string; normgeber: string },
  b: { kurztitel: string; normgeber: string },
): number {
  return (
    kurztitelVergleichsform(a.kurztitel).localeCompare(
      kurztitelVergleichsform(b.kurztitel),
      'de',
    ) || normgeberAnzeigename(a.normgeber).localeCompare(normgeberAnzeigename(b.normgeber), 'de')
  );
}

/** Unicode- und schreibungsunabhängige Form; das Original bleibt unverändert. */
export function kurztitelVergleichsform(text: string): string {
  return text.normalize('NFC').toLowerCase();
}

/** Gemeinsame Vergleichsform für Kurztitelsuche und Eingabeauswahl. */
export function normalisiereKurztitelSuchform(text: string): string {
  return kurztitelVergleichsform(text).trim().replace(/\s+/g, ' ');
}

/** Exakte Schreibweise hat Vorrang vor Whitespace-Vereinheitlichung auf beiden Seiten. */
export function vergleicheKurztitel(
  eingabe: string,
  vorhanden: string,
): 'exakt' | 'whitespace' | undefined {
  const eingabeKlein = kurztitelVergleichsform(eingabe);
  const vorhandenKlein = kurztitelVergleichsform(vorhanden);
  if (eingabeKlein === vorhandenKlein) return 'exakt';
  return normalisiereKurztitelSuchform(eingabe) === normalisiereKurztitelSuchform(vorhanden)
    ? 'whitespace'
    : undefined;
}

/** Originalform zuerst; ein Schlusspunkt entfällt nur in einem späteren Suchversuch. */
export function kurztitelSuchformen(eingabe: string): readonly string[] {
  return eingabe.endsWith('.') ? [eingabe, eingabe.slice(0, -1)] : [eingabe];
}
