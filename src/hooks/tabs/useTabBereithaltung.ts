// Besitzt die Bereithaltungsbuchhaltung eines Hauptfensters (Aktivierungsreihenfolge, zuletzt
// verlassener Tab, Verlassensreihenfolge verlassener Gesetzesansichten) und wendet die Regel der Bereithaltung bei jedem Tabwechsel und jeder Tabänderung an.
// Gültig ist eine Ansicht nur, solange ihr Tab offen ist und der Fensterbestand für ihre
// Gesetzesreferenz noch genau den Datenstand liefert, mit dem sie gebaut wurde.
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Tab } from '@/lib/domain/appTypes';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import {
  TAB_BEREITHALTUNGSBUDGET,
  bereithaltungskosten,
  bereitzuhaltendeAnsichten,
} from '@/lib/domain/app/tab-bereithaltung/tab-bereithaltung.index';
import {
  beobachteTestweisesBereithaltungsbudget,
  holeTestweisesBereithaltungsbudget,
  meldeSpeicherauskunft,
} from '@/lib/utils/speicherMessung';

interface Ansicht {
  tabId: string;
  referenz: Gesetzesreferenz;
  /** Datenstand des Fensterbestands, mit dem die Ansicht gebaut wurde. */
  datenstand: number;
}
interface Buchhaltung {
  /** Gehaltene aktuelle Ansichten offener Tabs in Aktivierungsreihenfolge, jüngste zuerst. */
  ansichten: Ansicht[];
  /** Gehaltene verlassene Gesetzesansichten nach dem Zeitpunkt des Verlassens, jüngste zuerst. */
  verlassene: Ansicht[];
  aktiverTabId: string | null;
  /** Zuletzt verlassener Tab, solange seine Garantie besteht. */
  garantieTabId: string | null;
  darstellungsSchluessel: string;
}
export interface BereiteAnsicht {
  tab: Tab;
  gesetz: GesetzDarstellung;
  /** Neuaufbauschlüssel: Tab-ID, Gesetzesreferenz und Datenstand. */
  schluessel: string;
  /** Sichtbar: aktuelle Ansicht des aktiven Tabs. */
  aktiv: boolean;
  /** Zeigt das aktuelle Gesetz ihres Tabs; sonst eine verlassene Gesetzesansicht. */
  aktuell: boolean;
}

const identitaet = (a: Ansicht) => `${a.tabId}-${gesetzesreferenzSchluessel(a.referenz)}`;
function gleicheListe(a: Ansicht[], b: Ansicht[]) {
  return (
    a.length === b.length &&
    a.every(
      (x, i) => identitaet(x) === (b[i] && identitaet(b[i])) && x.datenstand === b[i]?.datenstand,
    )
  );
}

/**
 * Kandidaten der Regel in deren Reihenfolge: die aktive Ansicht, dann die verdeckten aktuellen
 * Ansichten offener Tabs in Aktivierungsreihenfolge, dann die verlassenen Gesetzesansichten
 * nach dem Verlassen, jüngste zuerst. Hat ein Tab sein Gesetz gewechselt, wird seine bisherige
 * Ansicht zur jüngsten verlassenen. Nach geänderter Darstellung bleibt nur die aktive Ansicht.
 */
function bildeKandidaten(
  buchhaltung: Buchhaltung,
  aktive: Ansicht | null,
  istAktuell: (a: Ansicht) => boolean,
  darstellungGeaendert: boolean,
): Ansicht[] {
  if (darstellungGeaendert) return aktive ? [aktive] : [];
  const verdeckt = (a: Ansicht) => !aktive || identitaet(a) !== identitaet(aktive);
  const ansichten = buchhaltung.ansichten.filter(verdeckt);
  const verlassene = buchhaltung.verlassene.filter(verdeckt);
  return [
    ...(aktive ? [aktive] : []),
    ...[...ansichten, ...verlassene].filter(istAktuell),
    ...ansichten.filter((a) => !istAktuell(a)),
    ...verlassene.filter((a) => !istAktuell(a)),
  ];
}

export function useTabBereithaltung({
  aktiverTabId,
  tabs,
  holeGeladenes,
  holeDatenstand,
  darstellungsSchluessel,
}: {
  aktiverTabId: string | null;
  tabs: Tab[];
  /** Fensterbestand: geladenes Gesetz zur Referenz. */
  holeGeladenes: (referenz: Gesetzesreferenz) => GesetzDarstellung | undefined;
  /** Fensterbestand: Datenstand des geladenen Gesetzes zur Referenz. */
  holeDatenstand: (referenz: Gesetzesreferenz) => number | undefined;
  /** Ändert sich mit jeder Darstellungseinstellung; verdeckte Ansichten werden dann verworfen. */
  darstellungsSchluessel: string;
}): BereiteAnsicht[] {
  // Messmodus: bereithaltungsbudget(n) übersteuert die Vorgabe testweise; sonst stets die Vorgabe.
  const budget =
    useSyncExternalStore(
      beobachteTestweisesBereithaltungsbudget,
      holeTestweisesBereithaltungsbudget,
    ) ?? TAB_BEREITHALTUNGSBUDGET;
  const [buchhaltung, setBuchhaltung] = useState<Buchhaltung>({
    ansichten: [],
    verlassene: [],
    aktiverTabId: null,
    garantieTabId: null,
    darstellungsSchluessel,
  });
  const darstellungGeaendert = buchhaltung.darstellungsSchluessel !== darstellungsSchluessel;
  const tabVon = (ansicht: Ansicht) => tabs.find((t) => t.id === ansicht.tabId);
  const istAktuell = (ansicht: Ansicht) => {
    const referenz = tabVon(ansicht)?.gesetzesreferenz;
    return !!referenz && istGleichesGesetz(referenz, ansicht.referenz);
  };
  // Gültig: Tab offen (bei aktuellen Ansichten mit geladenem Gesetz) und der Fensterbestand
  // liefert für die Referenz noch denselben Datenstand; Metadatenänderungen lassen ihn gleich.
  const gueltig = (ansicht: Ansicht) => {
    const tab = tabVon(ansicht);
    if (!tab || (istAktuell(ansicht) && tab.ladezustand !== 'geladen')) return false;
    return holeDatenstand(ansicht.referenz) === ansicht.datenstand;
  };
  const aktiverTab = tabs.find((t) => t.id === aktiverTabId);
  const aktiveReferenz =
    aktiverTab?.ladezustand === 'geladen' ? aktiverTab.gesetzesreferenz : undefined;
  const aktiverDatenstand = aktiveReferenz && holeDatenstand(aktiveReferenz);
  const aktive =
    aktiverTabId && aktiveReferenz && aktiverDatenstand !== undefined
      ? { tabId: aktiverTabId, referenz: aktiveReferenz, datenstand: aktiverDatenstand }
      : null;
  // Beim Tabwechsel wird der unmittelbar verlassene Tab Garantiekandidat; beim Start keiner.
  const garantieKandidat =
    buchhaltung.aktiverTabId !== aktiverTabId
      ? buchhaltung.aktiverTabId
      : buchhaltung.garantieTabId;
  const kandidaten = bildeKandidaten(buchhaltung, aktive, istAktuell, darstellungGeaendert);
  const eingaben = kandidaten.map((a) => ({
    ansicht: a,
    tabId: a.tabId,
    gesetzesreferenz: gesetzesreferenzSchluessel(a.referenz),
    art: a === aktive || istAktuell(a) ? ('tab' as const) : ('verlassen' as const),
    gueltig: gueltig(a),
    kosten: bereithaltungskosten(holeGeladenes(a.referenz)),
  }));
  const auswahl = bereitzuhaltendeAnsichten({
    ansichten: eingaben,
    aktiverTabId,
    garantieTabId: garantieKandidat,
    budget,
  });
  const naechste = eingaben.filter((e) => auswahl.includes(e));
  // Messmodus: Auskunft über Budget und gehaltene Ansichten; speicherbericht() fragt sie erst
  // beim Abruf ab. Neu angemeldet je Commit, damit sie den zuletzt angewandten Stand zeigt.
  useEffect(() =>
    meldeSpeicherauskunft({
      art: 'bereithaltung',
      liefere: () => ({
        budget,
        vorgabe: TAB_BEREITHALTUNGSBUDGET,
        ansichten: naechste.flatMap((e) => {
          const gesetz = holeGeladenes(e.ansicht.referenz);
          return gesetz ? [{ gesetz, kosten: e.kosten }] : [];
        }),
      }),
    }),
  );
  const ansichten = naechste.filter((e) => e.art === 'tab').map((e) => e.ansicht);
  const verlassene = naechste.filter((e) => e.art === 'verlassen').map((e) => e.ansicht);
  // Eine entfallene Garantie lebt nicht wieder auf und geht an keinen älteren Tab über.
  const garantieTabId = ansichten.some((a) => a.tabId === garantieKandidat)
    ? garantieKandidat
    : null;
  if (
    darstellungGeaendert ||
    buchhaltung.aktiverTabId !== aktiverTabId ||
    buchhaltung.garantieTabId !== garantieTabId ||
    !gleicheListe(ansichten, buchhaltung.ansichten) ||
    !gleicheListe(verlassene, buchhaltung.verlassene)
  )
    setBuchhaltung({ ansichten, verlassene, aktiverTabId, garantieTabId, darstellungsSchluessel });
  return tabs.flatMap((tab) =>
    naechste
      .filter((e) => e.tabId === tab.id)
      .flatMap(({ ansicht, art }) => {
        // Gültige Ansichten haben stets ein geladenes Gesetz; es trägt aktuelle Metadaten.
        const gesetz = holeGeladenes(ansicht.referenz);
        if (!gesetz) return [];
        const aktuell = art === 'tab';
        return [
          {
            tab,
            gesetz,
            schluessel: `${identitaet(ansicht)}-${ansicht.datenstand}`,
            aktiv: aktuell && tab.id === aktiverTabId,
            aktuell,
          },
        ];
      }),
  );
}
