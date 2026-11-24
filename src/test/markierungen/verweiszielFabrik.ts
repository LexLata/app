// verweiszielFabrik.ts
// Erhält den konkreten Verweiszielfall beim Aufbau gemeinsamer Testdaten.

import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/markierungen.index';

type Elementstand = Extract<MarkierungsEintrag['bezug'], { typ: 'pauschal' }>['elementstand'];

export function verweisziel<const T extends Verweisziel>(daten: T): T {
  return daten;
}

/** Gemeinsame Fabrik für Normziele mit optionalem gespeichertem Vergleichsmaßstab. */
export function zielnormTestdaten(daten: {
  bezeichnung: string;
  gesetz?: import('@/lib/domain/gesetzTypes').Gesetzesreferenz;
  elementstand?: Elementstand;
  verweistextZeichenbereich?: [number, number];
}): Exclude<Verweisziel, { typ: 'ganzesGesetz' }> {
  const { elementstand, ...kennung } = daten;
  const verweistextZeichenbereich: [number, number] = kennung.verweistextZeichenbereich ?? [0, 1];
  const basis = { ...kennung, verweistextZeichenbereich };
  return elementstand
    ? {
        typ: 'zielnorm',
        ...basis,
        elementstand,
      }
    : { typ: 'zielnormOhneElementstand', ...basis };
}
