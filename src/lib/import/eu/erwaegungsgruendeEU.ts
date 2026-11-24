// erwaegungsgruendeEU.ts
// Zentrale Entscheidung und reine Extraktion der ergänzenden Erwägungsgründe.
import type { ImportFehler } from '@/lib/import/importVertrag.types';
import type { EuFassung } from '@/lib/domain/euFassungsvertrag';
import type { GesammelteNorm } from '@/lib/import/basis/basis.index';
import { extrahiereFormexZip } from './formexZip';
import { leseErwaegungsgruende } from './formexParser';
/** Der Bestand ändert den Bedarf nicht; er bestimmt erst die App-Fehlerbehandlung. */
export function brauchtEuOriginal(
  fassung: EuFassung,
  konsolidiert: boolean,
  normen: GesammelteNorm[],
): boolean {
  return (
    fassung === 'konsolidiert-mit-erwaegungsgruenden' &&
    konsolidiert &&
    !normen.some((norm) => norm.type === 'gliederung' && norm.bez === 'Erwägungsgründe')
  );
}
/** Liest nur die Ergänzung, ohne Anforderungen an weitere Normen des Originals. */
export function extrahiereEuErwaegungsgruende(
  zip: Uint8Array,
): { normen: GesammelteNorm[] } | { fehler: ImportFehler } {
  const archiv = extrahiereFormexZip(zip);
  if ('fehler' in archiv)
    return { fehler: { grund: archiv.grund ?? 'entpacken', meldung: archiv.fehler } };
  const doc = new DOMParser().parseFromString(archiv.hauptdatei, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length)
    return { fehler: { grund: 'format' as const, meldung: 'Ungültiges Formex-Original.' } };
  return { normen: leseErwaegungsgruende(doc) };
}
