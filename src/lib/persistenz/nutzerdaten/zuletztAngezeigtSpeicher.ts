// Gemeinsame lokale Anzeigezeitpunkte; jeder Zugriff liest den aktuellen Fensterstand.
import type { Anzeigezeitpunkte } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  gesetzesreferenzSchluessel,
  istGesetzesreferenzSchluessel,
} from '@/lib/domain/gesetzesreferenz';
import {
  istRecord,
  ladeJSON,
  ohneObjectPrototype,
  speichereJSON,
} from '@/lib/persistenz/kern/kern.index';

const STORAGE_KEY = 'lexlata.zuletztAngezeigt';

export function ladeAnzeigezeitpunkte(): Anzeigezeitpunkte {
  const daten = ladeJSON(STORAGE_KEY, {}, istRecord);
  const gueltig = ohneObjectPrototype<number>({});
  for (const [schluessel, zeitpunkt] of Object.entries(daten)) {
    if (
      istGesetzesreferenzSchluessel(schluessel) &&
      typeof zeitpunkt === 'number' &&
      Number.isFinite(zeitpunkt) &&
      zeitpunkt > 0
    ) {
      gueltig[schluessel] = zeitpunkt;
    }
  }
  return new Map(Object.entries(gueltig));
}

export function merkeAnzeige(gesetz: Gesetzesreferenz): void {
  const zeitpunkte = new Map(ladeAnzeigezeitpunkte());
  const schluessel = gesetzesreferenzSchluessel(gesetz);
  let juengsterZeitpunkt = Math.max(0, ...zeitpunkte.values());
  if (zeitpunkte.get(schluessel) === juengsterZeitpunkt) return;
  if (juengsterZeitpunkt + 1 <= juengsterZeitpunkt) {
    // Große Werte verdichten, ohne Rangfolge oder Gleichrangigkeit zu ändern.
    const raenge = new Map(
      [...new Set(zeitpunkte.values())].sort((a, b) => a - b).map((wert, i) => [wert, i + 1]),
    );
    for (const [key, wert] of zeitpunkte) zeitpunkte.set(key, raenge.get(wert) ?? wert);
    juengsterZeitpunkt = raenge.size;
  }
  zeitpunkte.set(schluessel, Math.max(Date.now(), juengsterZeitpunkt + 1));
  const juengste = [...zeitpunkte].sort((a, b) => b[1] - a[1]).slice(0, 100);
  speichereJSON(STORAGE_KEY, Object.fromEntries(juengste));
}
