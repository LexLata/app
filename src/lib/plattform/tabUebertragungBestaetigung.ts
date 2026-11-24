// Bestätigung gilt für dieselbe flüchtige Übertragung in App-Start und bestehendem Fenster.
import type { TabUebertragung } from '@/lib/domain/appTypes';
import { sendeAnFenster } from './fensterkommunikation/fensterkommunikation.index';

export function istTabUebertragungAbgelaufen(uebertragung: TabUebertragung): boolean {
  return !!uebertragung.transport && Date.now() >= uebertragung.transport.gueltigBis;
}

export async function bestaetigeTabUebertragung(
  uebertragung: TabUebertragung,
  uebernommen: boolean,
): Promise<void> {
  if (!uebertragung.transport) return;
  await sendeAnFenster(uebertragung.transport.quellLabel, 'tab-uebertragung-bestaetigt', {
    kennung: uebertragung.transport.kennung,
    uebernommen,
  });
}
