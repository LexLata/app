// Aktualisiert Gesetzesansichten und überträgt den Tab-Sitzungszustand zwischen Fenstern.
import { pruefeGesetzExistenz } from '@/lib/persistenz/gesetz/gesetz.index';
import { istTabUebertragungAbgelaufen } from '@/lib/plattform/tabUebertragungBestaetigung';
import type { GesetzLeseErgebnis } from '@/lib/persistenz/gesetz/gesetz.index';
import { tabAusUebertragungsdaten } from '@/lib/domain/app/tabGesetzUebergang';
import { gleicheGesetzesdatenAb } from '@/lib/gesetz-laden/gesetz-laden.index';
import { verlaufOhneAktivierung } from '@/lib/domain/app/tabVerlauf';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  gesetzesreferenzSchluessel,
  istGleichesGesetz,
  findeGesetz,
} from '@/lib/domain/gesetzesreferenz';
import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { EinklappZustand, ScrollPosition, Tab, TabVerlauf } from '@/lib/domain/appTypes';
import type { TabUebertragung } from '@/lib/domain/appTypes';
import { xmlIdZuSprungZiel } from '@/lib/domain/norm/norm.index';
import { ladeAktivierungXmlId } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';

export function useTabAktualisierungUndUebertragung({
  holeTabGesetz,
  ladeGesetz,
  uebernehmeTabGesetz,
  tabsRef,
  setTabs,
  setAktiverTabId,
  scrollPositionenRef,
  einklappZustandRef,
  verlaufLesen,
  verlaufSetzen,
  verlaufEntfernen,
  setTabTitel,
  entferneTabAusListe,
}: {
  ladeGesetz: (referenz: Gesetzesreferenz) => Promise<GesetzLeseErgebnis>;
  holeTabGesetz: (tab: Tab | null | undefined) => GesetzDarstellung | undefined;
  uebernehmeTabGesetz: (tab: Tab, gesetz: GesetzDarstellung) => Tab;
  tabsRef: RefObject<Tab[]>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setAktiverTabId: Dispatch<SetStateAction<string | null>>;
  scrollPositionenRef: RefObject<Record<string, ScrollPosition>>;
  einklappZustandRef: RefObject<Record<string, EinklappZustand>>;
  verlaufLesen: (tabId: string) => TabVerlauf | undefined;
  verlaufSetzen: (tabId: string, verlauf: TabVerlauf) => void;
  verlaufEntfernen: (tabId: string) => void;
  setTabTitel: Dispatch<SetStateAction<Record<string, string>>>;
  entferneTabAusListe: (prev: Tab[], tabId: string) => Tab[];
}) {
  const aktiv = useRef(false);
  useEffect(() => {
    aktiv.current = true;
    return () => {
      aktiv.current = false;
    };
  }, []);

  /**
   * Erneuert nur tatsächlich abweichende Gesetzesdaten. Bereits aktuelle Tabs
   * behalten ihre Laufzeit-IDs und ihren gesamten Ansichtszustand. Bei Änderungen
   * wird der Sitzungs-Zustand gelöscht und per reloadVersion neu aufgebaut.
   */
  function aktualisiereTabs(
    liste: GesetzDarstellung[],
    aktualisierteReferenzen: Gesetzesreferenz[],
    uebernehmen: boolean,
  ) {
    if (aktualisierteReferenzen.length === 0) return;
    // Vor dem Austausch aus jeder eigenen Ansicht sichern. Nicht erst im
    // State-Updater lesen/löschen: React darf diesen erneut ausführen; dabei
    // müssen die bereits gesicherten stabilen Stellen unverändert bleiben.
    const aktualisierungen = new Map<string, { gesetz: GesetzDarstellung; initialNorm?: string }>();
    for (const tab of tabsRef.current) {
      const referenz = tab.gesetzesreferenz;
      const bisherigesGesetz = holeTabGesetz(tab);
      if (
        !referenz ||
        !bisherigesGesetz ||
        !aktualisierteReferenzen.some((ref) => istGleichesGesetz(ref, referenz))
      )
        continue;
      const frischesGesetz = findeGesetz(liste, referenz);
      if (!frischesGesetz) continue;
      // Reine Metadatenänderungen bauen keine Ansicht neu.
      if (!gleicheGesetzesdatenAb(bisherigesGesetz, frischesGesetz).fachlichGeaendert) continue;
      const key = tab.id + '-' + gesetzesreferenzSchluessel(referenz);
      const aktivesElementId = einklappZustandRef.current[key]?.aktivesElementId;
      const bisherigesElement = bisherigesGesetz.elemente.find(
        (el) => el.data.id === aktivesElementId,
      );
      const tabXmlId = bisherigesElement?.data.xmlId;
      const gueltigeTabXmlId =
        tabXmlId && xmlIdZuSprungZiel(frischesGesetz.elemente, tabXmlId) ? tabXmlId : undefined;

      // initialNorm ist ein noch ausstehender Sprungauftrag; App.tsx entfernt
      // ihn nach Ausführung. Er behält Vorrang. Sonst gilt die eigene aktive
      // Stelle, erst bei deren Fehlen die gespeicherte Gesetzesaktivierung.
      // Keine Zuordnung über Bezeichnungen zu einer vermeintlichen Ersatznorm.
      aktualisierungen.set(tab.id, {
        gesetz: frischesGesetz,
        initialNorm:
          tab.initialNorm ?? gueltigeTabXmlId ?? ladeAktivierungXmlId(frischesGesetz) ?? undefined,
      });
      delete scrollPositionenRef.current[key];
      delete einklappZustandRef.current[key];
    }
    setTabs((prev) =>
      prev.map((tab) => {
        const aktualisierung = aktualisierungen.get(tab.id);
        if (!aktualisierung) return tab;
        return {
          ...tab,
          ...(uebernehmen ? uebernehmeTabGesetz(tab, aktualisierung.gesetz) : {}),
          initialNorm: aktualisierung.initialNorm,
          reloadVersion: (tab.reloadVersion ?? 0) + 1,
        };
      }),
    );
  }

  function gesetzeAktualisierenInTabs(liste: GesetzDarstellung[], referenzen: Gesetzesreferenz[]) {
    aktualisiereTabs(liste, referenzen, true);
  }

  function bereiteBestandsaustauschVor(gesetz: GesetzDarstellung) {
    // Der Bestand tauscht erst nach unserer Sicherung; keine reentrante Übernahme.
    aktualisiereTabs([gesetz], [gesetz], false);
  }

  /**
   * Wie gesetzeAktualisierenInTabs, aber für Aktualisierungen OHNE
   * Inhaltsänderung (nur der verarbeitungszeit-Tag wurde aufgefrischt, siehe
   * gesetzImportGemeinsam.ts: Kategorie 'unveraendert'): ergänzt am bestehenden
   * Gesetzobjekt nur verarbeitungszeit und löst KEINEN Remount aus
   * (reloadVersion bleibt unverändert) und löscht weder Scroll- noch
   * Einklapp-Zustand – die Scrollposition eines offenen Gesetzes bleibt
   * dadurch erhalten, während z.B. das GesetzInfoOverlay sofort den neuen
   * Prüfzeitpunkt anzeigt.
   */
  function gesetzInfoInTabsPatchen(liste: GesetzDarstellung[], referenzen: Gesetzesreferenz[]) {
    if (referenzen.length === 0) return;
    setTabs((prev) =>
      prev.map((tab) => {
        const referenz = tab.gesetzesreferenz;
        const bisherigesGesetz = holeTabGesetz(tab);
        if (
          !referenz ||
          !bisherigesGesetz ||
          !referenzen.some((ref) => istGleichesGesetz(ref, referenz))
        )
          return tab;
        const frischesGesetz = findeGesetz(liste, referenz);
        if (!frischesGesetz) return tab;
        // Bewusst NUR verarbeitungszeit auf dem BESTEHENDEN bisherigesGesetz patchen statt
        // es komplett durch frischesGesetz zu ersetzen: liste kann aus einem
        // anderen Parse-Lauf stammen als das, was gerade im Tab gemountet ist
        // (z.B. wenn zwischenzeitlich ein gesetze-geaendert-Reload aus einem
        // anderen Fenster lief, siehe useGesetzVerwaltung.ts) – dessen
        // elemente-Array hätte dann andere Laufzeit-ids als das im Tab aktive.
        // So bleibt die elemente-Referenz garantiert exakt dieselbe.
        return {
          ...tab,
          ...uebernehmeTabGesetz(tab, {
            ...bisherigesGesetz,
            verarbeitungszeit: frischesGesetz.verarbeitungszeit,
          }),
        };
      }),
    );
  }

  /** Kopiert den Sitzungszustand für den Transport; die Quelle bleibt bis zur Bestätigung erhalten. */
  function tabFuerUebertragungKopieren(tabId: string): TabUebertragung | null {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return null;

    const referenz = tab.gesetzesreferenz;
    const bisherigesGesetz = holeTabGesetz(tab);
    const key = referenz ? tabId + '-' + gesetzesreferenzSchluessel(referenz) : null;
    const scrollPosition = bisherigesGesetz && key ? scrollPositionenRef.current[key] : undefined;
    const einklappZustand = key ? einklappZustandRef.current[key] : undefined;

    // id→xmlId-Übersetzung: siehe appTypes.ts (TabUebertragung.einklappZustand) –
    // die `id`-Felder der Elemente sind pro Parse-Lauf zufällig neu und dürfen
    // das Fenster nicht überqueren, xmlId ist stabil.
    let einklappZustandXmlId: TabUebertragung['einklappZustand'];
    if (einklappZustand && bisherigesGesetz) {
      const idZuXmlId = new Map<string, string>();
      for (const el of bisherigesGesetz.elemente) idZuXmlId.set(el.data.id, el.data.xmlId);
      einklappZustandXmlId = {
        ueberschriftenXmlId: Array.from(einklappZustand.ueberschriften)
          .map((id) => idZuXmlId.get(id))
          .filter((d): d is string => !!d),
        normenXmlId: Array.from(einklappZustand.normen)
          .map((id) => idZuXmlId.get(id))
          .filter((d): d is string => !!d),
        aktivesElementXmlId: einklappZustand.aktivesElementId
          ? (idZuXmlId.get(einklappZustand.aktivesElementId) ?? null)
          : null,
      };
    }

    const verlauf = bisherigesGesetz ? verlaufLesen(tabId) : undefined;
    const uebertragung: TabUebertragung = {
      gesetzesreferenz: tab.gesetzesreferenz,
      initialNorm: bisherigesGesetz ? tab.initialNorm : undefined,
      scrollPosition,
      einklappZustand: einklappZustandXmlId,
      verlauf: verlauf ? verlaufOhneAktivierung(verlauf) : undefined,
    };

    return uebertragung;
  }

  /** Erst nach bestätigter Zielübernahme entfernen; sofort auch für Fensterschließen sichtbar. */
  function tabUebertragungAbschliessen(tabId: string): boolean {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab) return false;
    const warLetzterTab = tabsRef.current.length === 1;
    const referenz = tab.gesetzesreferenz;
    const key = referenz ? tabId + '-' + gesetzesreferenzSchluessel(referenz) : null;
    verlaufEntfernen(tabId);
    const verbleibende = entferneTabAusListe(tabsRef.current, tabId);
    tabsRef.current = verbleibende;
    setTabs(verbleibende);
    setTabTitel((prev) => {
      const n = { ...prev };
      delete n[tabId];
      return n;
    });
    if (key) delete scrollPositionenRef.current[key];
    if (key) delete einklappZustandRef.current[key];
    return warLetzterTab;
  }

  /** Prüft die Datei frisch; die Transportbestätigung wartet nicht auf den Text. */
  async function tabAusUebertragungUebernehmen(
    uebertragung: TabUebertragung,
    anhaengen = false,
    index?: number,
  ): Promise<boolean> {
    const referenz = uebertragung.gesetzesreferenz;
    if (referenz && (await pruefeGesetzExistenz(referenz)) !== 'vorhanden') return false;
    if (!aktiv.current) return false;
    if (istTabUebertragungAbgelaufen(uebertragung)) return false;
    const tabId = crypto.randomUUID();
    const neuerTab = {
      ...tabAusUebertragungsdaten(tabId, uebertragung),
      ausstehendeAnsicht: referenz
        ? {
            scrollPosition: uebertragung.scrollPosition,
            einklappZustand: uebertragung.einklappZustand,
            verlauf: uebertragung.verlauf,
          }
        : undefined,
    };
    if (anhaengen) {
      setTabs((prev) => {
        const einfuegePos =
          index !== undefined ? Math.min(Math.max(index, 0), prev.length) : prev.length;
        const neu = [...prev];
        neu.splice(einfuegePos, 0, neuerTab);
        return neu;
      });
    } else setTabs([neuerTab]);
    setAktiverTabId(tabId);
    if (referenz) void ladeUebertragenenTab(neuerTab);
    return true;
  }

  async function ladeUebertragenenTab(tab: Tab) {
    if (!tab.gesetzesreferenz) return;
    const ergebnis = await ladeGesetz(tab.gesetzesreferenz);
    // Navigation oder Schließen gewinnt vor dem verspäteten Ladeabschluss.
    const aktuell = tabsRef.current.find((t) => t.id === tab.id);
    if (!aktiv.current || !aktuell || aktuell.ausstehendeAnsicht !== tab.ausstehendeAnsicht) return;
    if (ergebnis.status !== 'geladen') {
      setTabs((prev) =>
        prev.map((t) => (t === aktuell ? { ...t, ladezustand: ergebnis.status } : t)),
      );
      return;
    }
    uebernehmeAusstehendeAnsichten(ergebnis.gesetz);
  }

  function uebernehmeAusstehendeAnsichten(gesetz: GesetzDarstellung) {
    for (const aktuell of tabsRef.current) {
      if (
        !aktuell.ausstehendeAnsicht ||
        !aktuell.gesetzesreferenz ||
        !istGleichesGesetz(aktuell.gesetzesreferenz, gesetz)
      )
        continue;
      const tab = aktuell;
      const ansicht = aktuell.ausstehendeAnsicht;
      const key = tab.id + '-' + gesetzesreferenzSchluessel(gesetz);
      if (ansicht?.scrollPosition) scrollPositionenRef.current[key] = ansicht.scrollPosition;
      if (ansicht?.einklappZustand) {
        const klappen = ansicht.einklappZustand;
        const xmlIdZuId = new Map(gesetz.elemente.map((el) => [el.data.xmlId, el.data.id]));
        einklappZustandRef.current[key] = {
          ueberschriften: new Set(
            klappen.ueberschriftenXmlId
              .map((id) => xmlIdZuId.get(id))
              .filter((id): id is string => !!id),
          ),
          normen: new Set(
            klappen.normenXmlId.map((id) => xmlIdZuId.get(id)).filter((id): id is string => !!id),
          ),
          aktivesElementId: klappen.aktivesElementXmlId
            ? (xmlIdZuId.get(klappen.aktivesElementXmlId) ?? null)
            : null,
        };
      }
      if (ansicht?.verlauf) verlaufSetzen(tab.id, verlaufOhneAktivierung(ansicht.verlauf));
      // Erst nach sämtlichen Ansichtsrefs darf der Text im Render sichtbar werden.
      setTabs((prev) =>
        prev.map((t) =>
          t === aktuell ? { ...t, ladezustand: 'geladen', ausstehendeAnsicht: undefined } : t,
        ),
      );
    }
  }

  return {
    uebernehmeAusstehendeAnsichten,
    bereiteBestandsaustauschVor,
    gesetzeAktualisierenInTabs,
    gesetzInfoInTabsPatchen,
    tabFuerUebertragungKopieren,
    tabUebertragungAbschliessen,
    tabAusUebertragungUebernehmen,
  };
}
