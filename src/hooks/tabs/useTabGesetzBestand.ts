// Bindet Lebensdauer und Tabschutz an den alleinigen Fensterbestand.
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Tab } from '@/lib/domain/appTypes';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { useGeladeneGesetze } from './useGeladeneGesetze';
type Bestand = ReturnType<typeof erzeugeGeladeneGesetze>;

export function useTabGesetzBestand(tabsRef: RefObject<Tab[]>) {
  const bestandRef = useRef<Bestand | null>(null);
  const aktuelleTabs = useRef(tabsRef);
  // Nur Buchhaltung der bereits gemeldeten Schutzmeldungen; maßgeblich bleibt tabsRef.
  const gemeldeteTabs = useRef(new Map<string, Gesetzesreferenz>());
  const [bereitschaft] = useState(() => {
    let fertig = () => {};
    const warten = new Promise<void>((resolve) => {
      fertig = resolve;
    });
    return { warten, fertig };
  });
  const synchronisiereTabs = useCallback(() => {
    const bestand = bestandRef.current;
    if (!bestand) return;
    const neu = new Map<string, Gesetzesreferenz>();
    for (const tab of aktuelleTabs.current.current) {
      if (!tab.gesetzesreferenz) continue;
      neu.set(tab.id, tab.gesetzesreferenz);
      const alt = gemeldeteTabs.current.get(tab.id);
      if (!alt || !istGleichesGesetz(alt, tab.gesetzesreferenz))
        bestand.meldeOffenenTab(tab.gesetzesreferenz);
    }
    for (const [id, alt] of gemeldeteTabs.current) {
      const referenz = neu.get(id);
      if (!referenz || !istGleichesGesetz(alt, referenz)) bestand.meldeGeschlossenenTab(alt);
    }
    gemeldeteTabs.current = neu;
  }, []);
  const beiLebensdauer = useCallback(
    (bestand: Bestand | null) => {
      bestandRef.current = bestand;
      gemeldeteTabs.current = new Map();
      synchronisiereTabs();
      // Auch Unmount löst das Mountwarten auf; kein wartender Aufrufer bleibt zurück.
      bereitschaft.fertig();
    },
    [bereitschaft, synchronisiereTabs],
  );
  const bestand = useGeladeneGesetze(undefined, beiLebensdauer);
  useEffect(() => {
    aktuelleTabs.current = tabsRef;
    synchronisiereTabs();
  });

  const ladeGesetz = useCallback(
    async (...[referenz, melden, optionen]: Parameters<Bestand['ladeGesetz']>) => {
      await bereitschaft.warten;
      const bestand = bestandRef.current;
      if (!bestand) return { status: 'nicht-lesbar' as const, befunde: [] };
      return bestand.ladeGesetz(referenz, melden, optionen);
    },
    [bereitschaft],
  );

  const vorladen = useCallback(
    async (referenzen: readonly Gesetzesreferenz[]) => {
      await bereitschaft.warten;
      await bestandRef.current?.vorladen(referenzen);
    },
    [bereitschaft],
  );

  return {
    bestand,
    vorladen,
    bestandRef,
    synchronisiereTabs,
    ladeGesetz,
    holeGeladenes: (ref: Gesetzesreferenz) => bestandRef.current?.holeGeladenes(ref),
  };
}
