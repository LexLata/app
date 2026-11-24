// Listener zuerst, Bereitschaft nach angewendeten Starttabs.
// Native Aufträge bleiben bis zur erfolgreichen/fachlichen Bearbeitung erhalten.
import { ueberschriftXmlId } from '@/lib/domain/gliederungskennzahl';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { useEffect, useRef, useState } from 'react';
import { beiSuchverzeichnisVorbereitung } from '@/lib/gesetz-laden/gesetz-laden.index';

import type { OeffnenLinkZiel } from '@/lib/domain/app/tiefenLink';
import type { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import type { useOeffnenLinkNavigation } from './useOeffnenLinkNavigation';
import type { ElementOeffnenParams, Navigationsziel, Tab } from '@/lib/domain/appTypes';
import { type InternerNavigationsauftrag } from '@/lib/domain/app/interneNavigation';
import { hoereImEigenenFenster } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';

interface Uebergabe {
  kennung: number;
  auftrag: InternerNavigationsauftrag | OeffnenLinkZiel;
  neuesFenster: boolean;
}
interface Optionen {
  oeffnenLinkAusfuehren?: ReturnType<typeof useOeffnenLinkNavigation>;
  startAbgeschlossen: boolean;
  tabsRef: React.RefObject<Tab[]>;
  aktiverTabIdRef: React.RefObject<string | null>;
  elementOeffnen: (params: ElementOeffnenParams) => void;
  gesetzesreferenzOeffnen: (
    ...args: Parameters<ReturnType<typeof useGesetzOeffnen>['gesetzesreferenzOeffnen']>
  ) => void | (() => void);
}
export async function oeffneInternesZiel(auftrag: InternerNavigationsauftrag): Promise<void> {
  await rufeBefehl('interne_navigation_senden', { auftrag });
}

export function useInterneNavigation(optionen: Optionen) {
  const aktuell = useRef(optionen);
  // Erst der angewendete React-Stand macht neue Tabs und Ladeabschlüsse gültig.
  useEffect(() => {
    aktuell.current = optionen;
  });
  const [listenerBereit, setListenerBereit] = useState<string | null>(null);
  const sitzung = useRef<{ aktiv: boolean; anmeldung: string } | null>(null);
  const kette = useRef(Promise.resolve());
  const bearbeitet = useRef<number | null>(null);
  const anstossen = useRef<() => void>(() => {});

  useEffect(() => {
    const empfaenger = { aktiv: true, anmeldung: crypto.randomUUID(), benachrichtigungen: 0 };
    sitzung.current = empfaenger;
    const lesen = () => rufeBefehl('interne_navigation_lesen', { anmeldung: empfaenger.anmeldung });
    const bestaetigen = (kennung: number) =>
      rufeBefehl('interne_navigation_bestaetigen', { anmeldung: empfaenger.anmeldung, kennung });
    let bearbeitungLaeuft = false;
    let nachAbgleichWiederholen = false;
    let oeffnenAbbrechen: (() => void) | undefined;
    let oeffnendeKennung: number | undefined;
    async function oeffnen(
      ziel: ElementOeffnenParams | Navigationsziel,
      uebergabe: Uebergabe,
    ): Promise<boolean> {
      const { tabsRef, aktiverTabIdRef, elementOeffnen } = aktuell.current;
      const aktiv = tabsRef.current.find((t) => t.id === aktiverTabIdRef.current);
      const modus = uebergabe.neuesFenster
        ? aktiv?.gesetzesreferenz
          ? 'immer-neu'
          : 'aktiver-tab'
        : undefined;
      if ('gesetzesreferenz' in ziel) {
        oeffnendeKennung = uebergabe.kennung;
        const erledigt = await new Promise<boolean>((resolve) => {
          const abbrechen = aktuell.current.gesetzesreferenzOeffnen(
            ziel,
            modus,
            undefined,
            (erfolg, grund) => {
              if (grund === 'nicht-lesbar') {
                resolve(false);
                return;
              }
              resolve(erfolg || grund === 'normziel' || grund === 'fehlt');
            },
          );
          oeffnenAbbrechen = () => {
            if (typeof abbrechen === 'function') abbrechen();
            resolve(false);
          };
        });
        oeffnenAbbrechen = undefined;
        oeffnendeKennung = undefined;
        if (!erledigt) return false;
      } else elementOeffnen({ ...ziel, modus });
      bearbeitet.current = uebergabe.kennung;
      return true;
    }
    async function bearbeiteZiel(uebergabe: Uebergabe, istAktuell: () => Promise<boolean>) {
      if ('type' in uebergabe.auftrag) {
        const ausfuehren = aktuell.current.oeffnenLinkAusfuehren;
        if (!ausfuehren) return false;
        const erledigt = await ausfuehren(uebergabe.auftrag, istAktuell, (ziel) =>
          oeffnen(ziel, uebergabe),
        );
        if (!erledigt) return false;
        bearbeitet.current = uebergabe.kennung;
      } else {
        if (!(await istAktuell())) return false;
        const auftrag = uebergabe.auftrag;
        const erledigt = await oeffnen(
          {
            gesetzesreferenz: auftrag.gesetz,
            nurInstalliert: true,
            ...(auftrag.ziel.type === 'norm'
              ? { bezeichnung: auftrag.ziel.bezeichnung }
              : { xmlId: ueberschriftXmlId(auftrag.ziel.gliederungskennzahl) }),
          },
          uebergabe,
        );
        if (!erledigt) return false;
        bearbeitet.current = uebergabe.kennung;
      }
      return true;
    }
    async function uebernehmen(uebergabe: Uebergabe): Promise<boolean> {
      if ('type' in uebergabe.auftrag && !aktuell.current.oeffnenLinkAusfuehren) return false;
      if (bearbeitet.current === uebergabe.kennung) {
        await bestaetigen(uebergabe.kennung);
        return true;
      }
      async function istAktuell() {
        while (empfaenger.aktiv) {
          const benachrichtigungen = empfaenger.benachrichtigungen;
          const letzte = await lesen();
          if (!empfaenger.aktiv) return false;
          // Auch eine doppelte Benachrichtigung macht die laufende Antwort
          // unsicher. Erst der neu gelesene native Stand entscheidet über Ablösung.
          if (benachrichtigungen !== empfaenger.benachrichtigungen) continue;
          return letzte?.kennung === uebergabe.kennung;
        }
        return false;
      }
      // Anzeigen verwendet nativ ausschließlich die aktuelle Fokusabsicht.
      // Auch nach seinem Abschluss muss die Kennung noch gültig sein.
      if (!(await istAktuell())) return true;
      await rufeBefehl('interne_navigation_anzeigen', {
        anmeldung: empfaenger.anmeldung,
        kennung: uebergabe.kennung,
      });
      if (!(await istAktuell())) return true;
      if (!(await bearbeiteZiel(uebergabe, istAktuell))) return !(await istAktuell());
      if (!empfaenger.aktiv) return false;
      if (!(await istAktuell())) return true;
      await bestaetigen(uebergabe.kennung);
      return true;
    }
    async function abarbeiten() {
      if (!aktuell.current.startAbgeschlossen) return;
      bearbeitungLaeuft = true;
      try {
        while (empfaenger.aktiv) {
          const uebergabe = await lesen();
          if (!empfaenger.aktiv || !uebergabe) return;
          if (!(await uebernehmen(uebergabe))) return;
        }
      } finally {
        bearbeitungLaeuft = false;
        if (nachAbgleichWiederholen) {
          nachAbgleichWiederholen = false;
          planen();
        }
      }
    }
    function planen() {
      kette.current = kette.current.then(abarbeiten).catch((fehler: unknown) => {
        if (empfaenger.aktiv)
          console.error('Interner Navigationsauftrag konnte nicht verarbeitet werden:', fehler);
      });
    }
    anstossen.current = planen;
    const abgleichAbmelden = beiSuchverzeichnisVorbereitung((abschluss) => {
      if (
        !empfaenger.aktiv ||
        !abschluss?.abgeglichen ||
        abschluss.eintraege.some((e) => e.status === 'nicht-lesbar')
      )
        return;
      // Ein erfolgreicher Abgleich kann den letzten fehlgeschlagenen Öffnungsabschluss
      // überholen. Der Wiederholungsanstoß darf währenddessen nicht verloren gehen.
      if (bearbeitungLaeuft) nachAbgleichWiederholen = true;
      else planen();
    });
    const listener = hoereImEigenenFenster('interne-navigation-vorhanden', () => {
      if (!empfaenger.aktiv) return;
      empfaenger.benachrichtigungen++;
      if (oeffnendeKennung === undefined) {
        planen();
        return;
      }
      void lesen()
        .then((letzte) => {
          if (!empfaenger.aktiv) return;
          if (oeffnendeKennung !== undefined && letzte?.kennung !== oeffnendeKennung)
            oeffnenAbbrechen?.();
          planen();
        })
        .catch(console.error);
    });
    void listener.bereit
      .then(() => {
        if (empfaenger.aktiv) setListenerBereit(empfaenger.anmeldung);
      })
      .catch((fehler: unknown) =>
        console.error('Interner Navigationslistener konnte nicht angemeldet werden:', fehler),
      );
    return () => {
      empfaenger.aktiv = false;
      oeffnenAbbrechen?.();
      listener.abmelden();
      abgleichAbmelden();
      void rufeBefehl('interne_navigation_abmelden', { anmeldung: empfaenger.anmeldung }).catch(
        console.error,
      );
    };
  }, []);
  useEffect(() => {
    const empfaenger = sitzung.current;
    if (!empfaenger || listenerBereit !== empfaenger.anmeldung || !optionen.startAbgeschlossen)
      return;
    let aktiv = true;
    // bereit liefert denselben gespeicherten Stand wie lesen; unmittelbar
    // danach lesen schließt auch die Ablage zwischen beiden Aufrufen ein.
    void rufeBefehl('interne_navigation_bereit', {
      anmeldung: empfaenger.anmeldung,
      bereit: true,
    })
      .then(() => {
        if (aktiv && empfaenger.aktiv) anstossen.current();
      })
      .catch(console.error);
    return () => {
      aktiv = false;
    };
  }, [listenerBereit, optionen.startAbgeschlossen]);
}
