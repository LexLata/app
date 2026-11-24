// Kopiert Tab-Sitzungen zwischen Fenstern und entfernt die Quelle erst nach Übernahmebestätigung.
import { tabUebertragungAbholen } from '@/lib/plattform/fensterUebergabe';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import {
  hoereImEigenenFenster,
  sendeAnFenster,
} from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { useEffect, useEffectEvent, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { TabUebertragung } from '@/lib/domain/appTypes';
import { fensterVordergrundHolen } from '@/lib/plattform/tauriHelpers';
import {
  bestaetigeTabUebertragung,
  istTabUebertragungAbgelaufen,
} from '@/lib/plattform/tabUebertragungBestaetigung';

interface UseFensterUebertragungParams {
  tabFuerUebertragungKopieren: (tabId: string) => TabUebertragung | null;
  tabUebertragungAbschliessen: (tabId: string) => boolean;
  fensterSchliessen: () => Promise<void>;
  tabAusUebertragungUebernehmen: (
    uebertragung: TabUebertragung,
    anhaengen?: boolean,
    index?: number,
  ) => Promise<boolean>;
}
interface AusstehendeUebertragung {
  tabId: string;
  zielLabel: string;
  payload: string;
  quellzustand: string;
  timer: ReturnType<typeof setTimeout>;
  abschluss: Promise<void>;
  abschliessen: () => void;
}
const BESTAETIGUNGSFRIST_MS = 30_000;

export function useFensterUebertragung({
  tabFuerUebertragungKopieren,
  tabUebertragungAbschliessen,
  fensterSchliessen,
  tabAusUebertragungUebernehmen,
}: UseFensterUebertragungParams) {
  const fremdVorschauIndexRef = useRef<number | null>(null);
  // Nur laufende Transportbestätigungen, keine zweite Quelle des Tabzustands.
  const ausstehend = useRef(new Map<string, AusstehendeUebertragung>());
  const anmeldungBereit = useRef<Promise<void>>(Promise.resolve());

  async function verwerfeAblage(vorgang: AusstehendeUebertragung) {
    await rufeBefehl('tab_uebertragung_verwerfen', {
      label: vorgang.zielLabel,
      payload: vorgang.payload,
    });
  }

  const uebertragungAufnehmen = useEffectEvent(async () => {
    const index = fremdVorschauIndexRef.current;
    let uebertragung: TabUebertragung | null = null;
    let uebernommen = false;
    try {
      uebertragung = await tabUebertragungAbholen();
      if (!uebertragung) return;
      if (!istTabUebertragungAbgelaufen(uebertragung)) {
        uebernommen = await tabAusUebertragungUebernehmen(uebertragung, true, index ?? undefined);
      }
    } catch (fehler) {
      console.error('Eingehende Tab-Übertragung konnte nicht übernommen werden:', fehler);
    }
    if (uebertragung) {
      try {
        await bestaetigeTabUebertragung(uebertragung, uebernommen);
      } catch (fehler) {
        console.error(
          'Tab-Übernahme konnte nicht bestätigt werden; Quelltab bleibt erhalten:',
          fehler,
        );
      }
    }
  });
  const bestaetigungAufnehmen = useEffectEvent(async (kennung: string, uebernommen: boolean) => {
    const vorgang = ausstehend.current.get(kennung);
    if (!vorgang) return;
    clearTimeout(vorgang.timer);
    ausstehend.current.delete(kennung);
    if (!uebernommen) {
      vorgang.abschliessen();
      return;
    }
    try {
      if (JSON.stringify(tabFuerUebertragungKopieren(vorgang.tabId)) !== vorgang.quellzustand) {
        console.error(
          'Quelltab wurde während der Übertragung verändert; beide Ansichten bleiben erhalten:',
          vorgang.tabId,
        );
        return;
      }
      // Auch tabsRef wird vor close() bereinigt, damit der umgezogene Tab nicht
      // zusätzlich in den Stapel geschlossener Tabs geschrieben wird.
      if (tabUebertragungAbschliessen(vorgang.tabId)) await fensterSchliessen();
    } finally {
      vorgang.abschliessen();
    }
  });
  useEffect(() => {
    const eingang = hoereImEigenenFenster('tab-uebertragung-eingefuegt', () =>
      uebertragungAufnehmen(),
    );
    const bestaetigung = hoereImEigenenFenster('tab-uebertragung-bestaetigt', ({ payload }) => {
      void bestaetigungAufnehmen(payload.kennung, payload.uebernommen).catch(console.error);
    });
    anmeldungBereit.current = Promise.all([eingang.bereit, bestaetigung.bereit]).then(() => {});
    void anmeldungBereit.current.catch(console.error);
    const laufende = ausstehend.current;
    return () => {
      eingang.abmelden();
      bestaetigung.abmelden();
      for (const vorgang of laufende.values()) {
        clearTimeout(vorgang.timer);
        vorgang.abschliessen();
        void verwerfeAblage(vorgang).catch(console.error);
      }
      laufende.clear();
    };
  }, []);

  async function uebertrageTab(tabId: string, zielLabel: string, neuesFenster: boolean) {
    const laufend = [...ausstehend.current.values()].find((vorgang) => vorgang.tabId === tabId);
    if (laufend) return laufend.abschluss;
    const kopie = tabFuerUebertragungKopieren(tabId);
    if (!kopie) return;
    const kennung = crypto.randomUUID();
    const uebertragung: TabUebertragung = {
      ...kopie,
      transport: {
        kennung,
        quellLabel: getCurrentWindow().label,
        gueltigBis: Date.now() + BESTAETIGUNGSFRIST_MS,
      },
    };
    let abschliessen!: () => void;
    const abschluss = new Promise<void>((resolve) => {
      abschliessen = resolve;
    });
    const vorgang: AusstehendeUebertragung = {
      abschluss,
      abschliessen,
      tabId,
      zielLabel,
      payload: JSON.stringify(uebertragung),
      quellzustand: JSON.stringify(kopie),
      timer: setTimeout(() => {
        ausstehend.current.delete(kennung);
        vorgang.abschliessen();
        console.error('Tab-Übertragung wurde nicht bestätigt; Quelltab bleibt erhalten:', {
          tabId,
          zielLabel,
        });
        void verwerfeAblage(vorgang).catch(console.error);
      }, BESTAETIGUNGSFRIST_MS),
    };
    ausstehend.current.set(kennung, vorgang);
    void (async () => {
      try {
        await anmeldungBereit.current;
        if (!ausstehend.current.has(kennung)) return;
        await rufeBefehl('tab_uebertragung_ablegen', {
          label: zielLabel,
          payload: vorgang.payload,
        });
        if (!ausstehend.current.has(kennung)) {
          await verwerfeAblage(vorgang);
          return;
        }
        if (neuesFenster) {
          await rufeBefehl('fenster_oeffnen_mit_label', { label: zielLabel, geometrie: null });
        } else {
          await fensterVordergrundHolen(zielLabel);
          if (!ausstehend.current.has(kennung)) return;
          await sendeAnFenster(zielLabel, 'tab-uebertragung-eingefuegt', undefined);
        }
      } catch (fehler) {
        clearTimeout(vorgang.timer);
        ausstehend.current.delete(kennung);
        vorgang.abschliessen();
        await verwerfeAblage(vorgang).catch(console.error);
        console.error('Tab konnte nicht übertragen werden; Quelltab bleibt erhalten:', fehler);
      }
    })();
    // Öffentliche Zusage: erst nach Übernahme, Ablehnung, Fehler, Frist oder Abbau.
    await vorgang.abschluss;
  }
  async function handleTabHerausziehen(tabId: string) {
    await uebertrageTab(tabId, 'fenster-' + crypto.randomUUID().replace(/-/g, ''), true);
  }
  async function handleTabInFensterAufnehmen(tabId: string, zielLabel: string) {
    await uebertrageTab(tabId, zielLabel, false);
  }
  return { fremdVorschauIndexRef, handleTabHerausziehen, handleTabInFensterAufnehmen };
}
