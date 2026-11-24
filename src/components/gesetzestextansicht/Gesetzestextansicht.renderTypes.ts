// Gesetzestextansicht.renderTypes.ts
// Schmales DOM-Renderangebot der Virtualisierung ohne deren Instanz.
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
/** Rein darstellungsbezogene Zeile; enthält keine Virtualizer-Instanz. */
interface VirtuelleTextZeile {
  readonly index: number;
  readonly key: string | number;
  readonly start: number;
  readonly size: number;
  readonly element: DarstellungsElement;
}

/** Gemeinsamer Rendervertrag, bei Umsetzung in Gesetzestextansicht.renderTypes.ts.
 * Das Messcallback bindet gerenderte Zeilen an die interne Virtualisierung. */
export interface VirtuelleTextListe {
  readonly zeilen: readonly VirtuelleTextZeile[];
  readonly gesamtHoehe: number;
  readonly maxTextBreite: number | 'none';
  messeZeile(this: void, element: Element | null): void;
}
