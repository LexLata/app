// Besitzt den tabweiten Verlauf und bündelt sämtliche Lese- und Schreibzugriffe.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { Tab, TabVerlauf, VerlaufEintrag } from '@/lib/domain/appTypes';
import {
  leererVerlauf,
  verlaufAktivierungMelden,
  verlaufPfeilzustaende,
  verlaufEintragHinzufuegen,
  verlaufSchrittNavigieren,
  verlaufPositionSetzen,
  verlaufSprung,
} from '@/lib/domain/app/tabVerlauf';

export function useVerlaufSteuerung(tabsRef: RefObject<Tab[]>) {
  // Der Verlauf gilt tabweit, auch über Gesetzeswechsel hinweg, nur im Arbeitsspeicher.
  const verlaufRef = useRef<Record<string, TabVerlauf>>({});
  // Nur dieser Besitzer löst den neuen Render für schreibende Zugriffe aus.
  const [, setVerlaufVersion] = useState(0);

  const sichtbar = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function verlaufFristStoppen(tabId: string) {
    if (sichtbar.current !== tabId) return;
    clearTimeout(timer.current);
    timer.current = undefined;
  }
  function fristStarten(tabId: string) {
    verlaufFristStoppen(tabId);
    const verlauf = verlaufRef.current[tabId];
    const aktiv = verlauf?.aktivesElement;
    if (
      sichtbar.current !== tabId ||
      navigationen.current.has(tabId) ||
      !tabsRef.current.some((tab) => tab.id === tabId) ||
      !aktiv ||
      gleich(aktiv, verlauf?.eintraege[verlauf.position])
    )
      return;
    timer.current = setTimeout(() => verlaufHinzufuegen(tabId, aktiv), 60_000);
  }
  function verlaufSichtbarkeit(tabId: string | null) {
    if (sichtbar.current === tabId) return;
    if (sichtbar.current) verlaufFristStoppen(sichtbar.current);
    sichtbar.current = tabId;
    if (tabId) fristStarten(tabId);
  }
  function bestaetigen(tabId: string, neu: TabVerlauf) {
    const vorher = verlaufRef.current[tabId];
    verlaufRef.current[tabId] = neu;
    const a = verlaufPfeilzustaende(vorher);
    const b = verlaufPfeilzustaende(neu);
    if (
      vorher?.eintraege !== neu.eintraege ||
      a.kannZurueck !== b.kannZurueck ||
      a.kannVorwaerts !== b.kannVorwaerts
    )
      setVerlaufVersion((v) => v + 1);
  }
  function verlaufAktivierung(
    tabId: string,
    aktiv: VerlaufEintrag,
    art: 'sprung' | 'schritt' | 'nachfuehrung' | 'vorgegeben',
  ) {
    if (!tabsRef.current.some((tab) => tab.id === tabId)) return;
    aktiv = {
      gesetzesreferenz: {
        normgeber: aktiv.gesetzesreferenz.normgeber,
        kurztitel: aktiv.gesetzesreferenz.kurztitel,
      },
      xmlId: aktiv.xmlId,
    };
    const vorher = verlaufRef.current[tabId] ?? leererVerlauf();
    if ((art === 'vorgegeben' || art === 'sprung') && gleich(vorher.aktivesElement, aktiv)) return;
    verlaufFristStoppen(tabId);
    if (art !== 'vorgegeben') verlaufNavigationEntwerten(tabId);
    // Den Sprung gegen die verlassene Stelle auswerten, bevor das Echo sie ersetzt.
    const vorbereitet = art === 'sprung' ? verlaufSprung(vorher, aktiv) : vorher;
    bestaetigen(
      tabId,
      verlaufAktivierungMelden(vorbereitet, aktiv, art === 'sprung' ? 'vorgegeben' : art),
    );
    if (art !== 'vorgegeben') fristStarten(tabId);
    navigationen.current.get(tabId)?.echo?.();
  }

  // Ausschließlich vorläufige Befehle, kein zweites bestätigtes aktives Element.
  const navigationen = useRef(
    new Map<
      string,
      {
        abbrechen?: () => void;
        echo?: () => void;
        befehl?: object;
        befehle: (() => void)[];
      }
    >(),
  );

  // Bleibt für einen wiederholbaren Fehlversuch auch nach Ende der Reihe bestehen.
  // Jede neue Reihe oder Bedienung entwertet dessen verspäteten Abschluss.
  const generationen = useRef(new Map<string, object>());
  useEffect(() => {
    const reihen = navigationen.current;
    const gueltigeGenerationen = generationen.current;
    return () => {
      clearTimeout(timer.current);
      sichtbar.current = null;
      gueltigeGenerationen.clear();
      const abbrechen = [...reihen.values()].map((lauf) => lauf.abbrechen);
      reihen.clear();
      for (const abbruch of abbrechen) abbruch?.();
    };
  }, []);
  function verlaufNavigationEntwerten(tabId: string) {
    verlaufFristStoppen(tabId);
    entwerteBefehle(tabId);
  }
  /** Ohne laufenden Befehl bleibt die Lesefrist unverändert; nach Abbruch beginnt sie neu. */
  function verlaufBedienung(tabId: string) {
    if (entwerteBefehle(tabId)) fristStarten(tabId);
  }
  function entwerteBefehle(tabId: string): boolean {
    generationen.current.delete(tabId);
    const lauf = navigationen.current.get(tabId);
    navigationen.current.delete(tabId);
    lauf?.abbrechen?.();
    return !!lauf;
  }

  /** Wertet jeden Befehl erst nach dem gültigen Abschluss seines Vorgängers aus. */
  function verlaufNavigieren(
    tabId: string,
    befehl: 'zurueck' | 'vorwaerts' | VerlaufEintrag,
    oeffnen: (ziel: VerlaufEintrag, melden: (erfolg: boolean) => void) => () => void,
  ) {
    if (!tabsRef.current.some((tab) => tab.id === tabId)) return;
    let lauf = navigationen.current.get(tabId);
    const neu = !lauf;
    if (!lauf) {
      lauf = { befehle: [] };
      generationen.current.set(tabId, lauf);
      navigationen.current.set(tabId, lauf);
    }
    const reihe = lauf;
    function ausfuehren() {
      if (navigationen.current.get(tabId) !== reihe) return;
      const kennung = {};
      reihe.befehl = kennung;
      const bisher = verlaufRef.current[tabId];
      const ergebnis =
        typeof befehl === 'string'
          ? verlaufSchrittNavigieren(bisher, befehl)
          : bisher &&
            verlaufPositionSetzen(
              bisher,
              bisher.eintraege.findIndex(
                (e) =>
                  e.xmlId === befehl.xmlId &&
                  istGleichesGesetz(e.gesetzesreferenz, befehl.gesetzesreferenz),
              ),
            );
      function weiter() {
        if (navigationen.current.get(tabId) !== reihe || reihe.befehl !== kennung) return;
        reihe.abbrechen = undefined;
        reihe.echo = undefined;
        reihe.befehle.shift();
        if (reihe.befehle[0]) reihe.befehle[0]();
        else {
          navigationen.current.delete(tabId);
          // Ein Randbefehl bewahrt eine laufende Restfrist. Nach Navigation
          // beginnt für die weiterhin abgewichene Stelle eine volle neue Frist.
          if (timer.current === undefined) fristStarten(tabId);
        }
      }
      if (!ergebnis) {
        weiter();
        return;
      }
      verlaufFristStoppen(tabId);
      const { ziel, verlauf: vorbereitet } = ergebnis;
      let beendet = false;
      let erfolgreichAbgeschlossen = false;
      reihe.abbrechen = oeffnen(ergebnis.ziel, (erfolg) => {
        if (generationen.current.get(tabId) !== reihe || reihe.befehl !== kennung) return;
        // Ein erfolgreicher Abschluss darf nicht erneut übernommen werden.
        if (erfolgreichAbgeschlossen) return;
        if (erfolg && tabsRef.current.some((tab) => tab.id === tabId)) {
          // Ein ausdrücklich wiederholter Fehlversuch hat seine Reihe bereits freigegeben.
          navigationen.current.set(tabId, reihe);
          function abschliessen() {
            const aktiv = verlaufRef.current[tabId]?.aktivesElement;
            if (!gleich(aktiv, ziel)) return;
            bestaetigen(tabId, { ...vorbereitet, aktivesElement: aktiv });
            erfolgreichAbgeschlossen = true;
            reihe.echo = undefined;
            queueMicrotask(weiter);
          }
          reihe.echo = abschliessen;
          // Bereits bestätigte Ziele benötigen keinen weiteren Wechselcallback.
          abschliessen();
        }
        // Öffnungssteuerung darf zunächst ihren laufenden Auftrag bereinigen.
        if (!beendet && !erfolg)
          queueMicrotask(() => {
            if (!reihe.echo) weiter();
          });
        beendet = true;
      });
    }
    reihe.befehle.push(ausfuehren);
    if (neu) ausfuehren();
  }

  /** Liest die verlassene Stelle unmittelbar vor dem Öffnungsecho (A9). */
  function sprung(
    tabId: string,
    ziel: VerlaufEintrag,
    optionen?: { verlasseneStelle: VerlaufEintrag },
  ) {
    if (!tabsRef.current.some((tab) => tab.id === tabId)) return false;
    const bisher = verlaufRef.current[tabId] ?? leererVerlauf();
    const neu = verlaufSprung(bisher, ziel, optionen?.verlasseneStelle);
    verlaufNavigationEntwerten(tabId);
    if (neu === bisher) return false;
    bestaetigen(tabId, neu);
    return true;
  }

  /** Fügt einen Eintrag zum Verlauf eines Tabs hinzu (siehe tabVerlauf.ts). */
  function verlaufHinzufuegen(tabId: string, eintrag: VerlaufEintrag) {
    // Ausstehende Timer dürfen den Zustand geschlossener Tabs nicht neu anlegen.
    if (!tabsRef.current.some((tab) => tab.id === tabId)) return;
    const bisher = verlaufRef.current[tabId] ?? leererVerlauf();
    verlaufSetzen(tabId, verlaufEintragHinzufuegen(bisher, eintrag));
  }

  function verlaufLesen(tabId: string): TabVerlauf | undefined {
    return verlaufRef.current[tabId];
  }

  function verlaufSetzen(tabId: string, verlauf: TabVerlauf) {
    verlaufNavigationEntwerten(tabId);
    verlaufRef.current[tabId] = verlauf;
    setVerlaufVersion((v) => v + 1);
  }

  function verlaufEntfernen(tabId: string) {
    verlaufNavigationEntwerten(tabId);
    delete verlaufRef.current[tabId];
    setVerlaufVersion((v) => v + 1);
  }

  return {
    verlaufAktivierung,
    verlaufSichtbarkeit,
    verlaufFristStoppen,
    verlaufNavigieren,
    verlaufNavigationEntwerten,
    verlaufBedienung,
    verlaufHinzufuegen,
    sprung,
    verlaufLesen,
    verlaufSetzen,
    verlaufEntfernen,
  };
}

function gleich(a: VerlaufEintrag | undefined, b: VerlaufEintrag | undefined) {
  return (
    !!a && !!b && a.xmlId === b.xmlId && istGleichesGesetz(a.gesetzesreferenz, b.gesetzesreferenz)
  );
}
