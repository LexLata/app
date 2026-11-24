// useGesetzOeffnen.ts
// Einziger Weg für sofortige Gesetzesöffnungen (Verweisklick, Öffnen-Overlay,
// Lesezeichen, interne Navigation, Verlaufsnavigation, ⇧⌘T): erst das Gesetz
// laden bzw. importieren, dann gesetzOeffnen im gewählten Modus, Sprung zum
// Ziel, Verlaufseintrag und Rückmeldung. Bis zum Erfolg bleibt jeder Tab
// unverändert; ein Fehler zeigt ausschließlich ein Banner.
//
// Je Fenster läuft höchstens eine Öffnung; eine neuere Öffnung gewinnt (E3). Eine
// abgelöste Öffnung lässt ihren Import zu Ende laufen, zeigt ihn aber nicht an.
// Ausgenommen ist die Tabwiederherstellung beim Fensterstart (eigener Lauf).
import type { useAppTabs } from './useAppTabs';
import { TIEFENLINK_ZIEL_HINWEIS } from '@/lib/domain/app/tiefenLink';
import { importFehlertext, normziel, oeffnungsziel } from './oeffnungsziel';
import type { VerweisKlickziel } from '@/lib/darstellung/darstellung.index';
import { useEffect, useRef, type RefObject } from 'react';
import type {
  Tab,
  ElementOeffnenParams,
  OeffnenModus,
  Navigationsziel,
  TabVerlauf,
} from '@/lib/domain/appTypes';
import { istGleichesGesetz, gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { zeigeBanner, bannerAktualisieren, bannerSchliessen } from '@/lib/banner/banner.index';
import { importiereGesetzesreferenz } from '@/lib/import/import.index';
import { geschlossenenTabPoppen } from '@/lib/persistenz/fenster/fenster.index';

type Oeffnungsfehler = 'nicht-lesbar' | 'fehlt' | 'normziel' | 'abgebrochen';
type AbschlussMelden = (erfolg: boolean, grund?: Oeffnungsfehler) => void;
type Tabsteuerung = ReturnType<typeof useAppTabs>;

/** Angaben einer sofortigen Öffnung, wie sie auch „Erneut versuchen“ erneut startet. */
interface Oeffnungsangabe {
  ziel: Navigationsziel;
  modus?: OeffnenModus;
  /** Ausdrücklicher Ausgangstab; sonst der beim Start aktive Tab. */
  ausgangsTabId?: string;
  melden?: AbschlussMelden;
  /** Nach erfolgreichem Öffnen, z. B. Verlauf eines wiedergeöffneten Tabs setzen. */
  nachOeffnen?: (tabId: string) => void;
  /** Tabwiederherstellung beim Fensterstart: weder abgelöst noch ablösend (kein E3). */
  ausserhalbE3?: true;
}

interface Oeffnung extends Oeffnungsangabe {
  angabe: Oeffnungsangabe;
  aktivBeiStart: string | null;
  /** Ausgangstab war beim Start ohne Gesetz. */
  ausgangLeerBeiStart: boolean;
  bannerId?: string;
}

interface WiederholbaresFehlerbanner {
  bannerId: string;
  /** Ausgangstab einer Öffnung im selben Tab; entfällt er, schließt das Banner. */
  gebundenerTabId?: string;
}

type Ladeergebnis =
  { gesetz: GesetzDarstellung } | { fehler: string; wiederholbar: boolean } | 'abgelöst';

interface UseGesetzOeffnenParams {
  ladeGesetz: Tabsteuerung['ladeGesetz'];
  gesetzOeffnen: Tabsteuerung['gesetzOeffnen'];
  holeTabGesetz: Tabsteuerung['holeTabGesetz'];
  erstelleLeerenTab: Tabsteuerung['erstelleLeerenTab'];
  /** Gerenderter Tabstand; Änderungen schließen gegenstandslose Fehlerbanner. */
  tabs: Tab[];
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  sprung: Tabsteuerung['sprung'];
  verlaufHinzufuegen: Tabsteuerung['verlaufHinzufuegen'];
  verlaufSetzen: (tabId: string, verlauf: TabVerlauf) => void;
  verlaufFristStoppen: (tabId: string) => void;
}

/** Modi, die an den Ausgangstab gebunden sind („selber Tab“). */
function bindetAusgangstab(modus: OeffnenModus | undefined): boolean {
  return modus === 'aktiver-tab' || modus === 'immer-aktiver-tab';
}

function gleicheAngabe(a: Oeffnungsangabe, b: Oeffnungsangabe): boolean {
  return (
    !a.melden &&
    !b.melden &&
    !a.nachOeffnen &&
    !b.nachOeffnen &&
    a.modus === b.modus &&
    a.ausgangsTabId === b.ausgangsTabId &&
    JSON.stringify(a.ziel) === JSON.stringify(b.ziel)
  );
}

export function useGesetzOeffnen({
  ladeGesetz,
  gesetzOeffnen,
  holeTabGesetz,
  erstelleLeerenTab,
  tabs,
  tabsRef,
  aktiverTabIdRef,
  sprung,
  verlaufHinzufuegen,
  verlaufSetzen,
  verlaufFristStoppen,
}: UseGesetzOeffnenParams) {
  // Ausschließlich Laufzeitkoordination dieser Fensterinstanz, kein Tabzustand.
  const laufendeOeffnung = useRef<Oeffnung | null>(null);
  // Eigener Lauf der Startwiederherstellung, unberührt von E3.
  const startwiederherstellung = useRef<Oeffnung | null>(null);
  const wiederholbaresFehlerbanner = useRef<WiederholbaresFehlerbanner | undefined>(undefined);
  const importe = useRef(new Map<string, ReturnType<typeof importiereGesetzesreferenz>>());

  // Ausgangstab geschlossen oder in ein anderes Fenster gezogen: Das Banner einer
  // Öffnung im selben Tab hat kein Ziel mehr; das einer Öffnung in neuem Tab bleibt.
  useEffect(() => {
    const banner = wiederholbaresFehlerbanner.current;
    if (!banner?.gebundenerTabId || tabs.some((tab) => tab.id === banner.gebundenerTabId)) return;
    bannerSchliessen(banner.bannerId);
    wiederholbaresFehlerbanner.current = undefined;
  }, [tabs]);

  useEffect(() => {
    const laeufe = [laufendeOeffnung, startwiederherstellung];
    return () => {
      for (const lauf of laeufe) {
        const oeffnung = lauf.current;
        lauf.current = null;
        if (oeffnung?.bannerId) bannerSchliessen(oeffnung.bannerId);
        oeffnung?.melden?.(false, 'abgebrochen');
      }
    };
  }, []);

  const tabVorhanden = (tabId: string | null | undefined) =>
    !!tabId && tabsRef.current.some((tab) => tab.id === tabId);
  const tabLeer = (tabId: string | null | undefined) =>
    !!tabId && tabsRef.current.some((tab) => tab.id === tabId && !tab.gesetzesreferenz);

  /** Beendet die laufende Öffnung ohne Anzeige; ihr Import läuft weiter. */
  function laufendeOeffnungBeenden() {
    const oeffnung = laufendeOeffnung.current;
    laufendeOeffnung.current = null;
    if (!oeffnung) return;
    if (oeffnung.bannerId) bannerSchliessen(oeffnung.bannerId);
    oeffnung.melden?.(false, 'abgebrochen');
  }

  /** Eine neuere Öffnung ersetzt laufende Öffnung und offene Wiederholung. */
  function vorherigeOeffnungAbloesen() {
    laufendeOeffnungBeenden();
    if (wiederholbaresFehlerbanner.current)
      bannerSchliessen(wiederholbaresFehlerbanner.current.bannerId);
    wiederholbaresFehlerbanner.current = undefined;
  }

  function geteilterImport(referenz: Gesetzesreferenz) {
    const schluessel = gesetzesreferenzSchluessel(referenz);
    const vorhanden = importe.current.get(schluessel);
    if (vorhanden) return vorhanden;
    const lauf = importiereGesetzesreferenz(referenz);
    importe.current.set(schluessel, lauf);
    // Beide Fehlerwege räumen auf; kein unbeobachtetes finally-Promise.
    void lauf.then(
      () => importe.current.delete(schluessel),
      () => importe.current.delete(schluessel),
    );
    return lauf;
  }

  function oeffnungStarten(angabe: Oeffnungsangabe): () => void {
    const lauf = angabe.ausserhalbE3 ? startwiederherstellung : laufendeOeffnung;
    const laufend = laufendeOeffnung.current;
    // Mehrfachklick auf dasselbe Ziel: die laufende Öffnung genügt.
    if (!angabe.ausserhalbE3 && laufend && gleicheAngabe(laufend.angabe, angabe)) return () => {};
    if (!angabe.ausserhalbE3) vorherigeOeffnungAbloesen();
    const ausgangsTabId = angabe.ausgangsTabId ?? aktiverTabIdRef.current ?? undefined;
    if (angabe.ausgangsTabId && bindetAusgangstab(angabe.modus) && !tabVorhanden(ausgangsTabId)) {
      angabe.melden?.(false, 'abgebrochen');
      return () => {};
    }
    const oeffnung: Oeffnung = {
      ...angabe,
      ausgangsTabId,
      angabe,
      aktivBeiStart: aktiverTabIdRef.current,
      ausgangLeerBeiStart: tabLeer(ausgangsTabId),
    };
    lauf.current = oeffnung;
    void ausfuehren(oeffnung, lauf);
    return () => {
      if (laufendeOeffnung.current === oeffnung) laufendeOeffnungBeenden();
    };
  }

  async function ausfuehren(oeffnung: Oeffnung, lauf: RefObject<Oeffnung | null>) {
    const aktuell = () => lauf.current === oeffnung;
    let ergebnis: Ladeergebnis;
    try {
      ergebnis = await ladeZielgesetz(oeffnung, aktuell);
    } catch (fehler) {
      console.error('Gesetz konnte nicht geöffnet werden:', fehler);
      ergebnis = {
        fehler: 'Das Gesetz konnte nicht geladen oder importiert werden.',
        wiederholbar: true,
      };
    }
    if (ergebnis === 'abgelöst' || !aktuell()) return;
    lauf.current = null;
    if ('fehler' in ergebnis) fehlerAnzeigen(oeffnung, ergebnis.fehler, ergebnis.wiederholbar);
    else abschliessen(oeffnung, ergebnis.gesetz);
  }

  async function ladeZielgesetz(oeffnung: Oeffnung, aktuell: () => boolean): Promise<Ladeergebnis> {
    const { ziel } = oeffnung;
    const unzuverlaessig = {
      fehler: 'Das Gesetz konnte nicht verlässlich geladen werden.',
      wiederholbar: true,
    };
    const vorhanden = await ladeGesetz(ziel.gesetzesreferenz);
    if (!aktuell()) return 'abgelöst';
    if (vorhanden.status === 'geladen') return { gesetz: vorhanden.gesetz };
    if (vorhanden.status === 'nicht-lesbar') return unzuverlaessig;
    if (ziel.nurInstalliert) return { fehler: 'Gesetz nicht mehr vorhanden.', wiederholbar: false };

    oeffnung.bannerId = zeigeBanner({
      art: 'vorgangsfortschritt',
      text: `${ziel.gesetzesreferenz.kurztitel} wird importiert …`,
    });
    bannerAktualisieren(oeffnung.bannerId, { laedt: true });
    const importiert = await geteilterImport(ziel.gesetzesreferenz);
    if (!aktuell()) return 'abgelöst';
    if (
      importiert.bestandspruefung.status === 'nicht-lesbar' ||
      importiert.ladeabschluss.status === 'nicht-lesbar'
    )
      return unzuverlaessig;
    if (importiert.art === 'fehler')
      return {
        fehler: importFehlertext(ziel, importiert.fehler.grund),
        wiederholbar: importiert.fehler.grund !== 'nichtVerfuegbar',
      };
    const geladen = await ladeGesetz(ziel.gesetzesreferenz);
    if (!aktuell()) return 'abgelöst';
    if (geladen.status === 'geladen' && istGleichesGesetz(importiert.gesetz, ziel.gesetzesreferenz))
      return { gesetz: geladen.gesetz };
    return { fehler: 'Das angeforderte Gesetz konnte nicht geladen werden.', wiederholbar: true };
  }

  function fehlerAnzeigen(oeffnung: Oeffnung, text: string, wiederholbar: boolean) {
    const bannerId = oeffnung.bannerId ?? zeigeBanner({ art: 'vorgangsfortschritt', text });
    bannerAktualisieren(bannerId, {
      text,
      typ: 'warnung',
      laedt: false,
      aktion: wiederholbar
        ? {
            label: 'Erneut versuchen',
            onClick: () => {
              // Nur das noch offene Banner startet genau eine neue Öffnung.
              if (wiederholbaresFehlerbanner.current?.bannerId !== bannerId) return;
              // Gebunden an den ursprünglichen Ausgangstab, nicht an den jetzt aktiven.
              // Die Wiederholung ist eine Öffnung des Nutzers und unterliegt E3.
              oeffnungStarten({
                ...oeffnung.angabe,
                ausgangsTabId: oeffnung.ausgangsTabId,
                ausserhalbE3: undefined,
              });
            },
          }
        : null,
    });
    if (wiederholbar)
      wiederholbaresFehlerbanner.current = {
        bannerId,
        gebundenerTabId: bindetAusgangstab(oeffnung.modus) ? oeffnung.ausgangsTabId : undefined,
      };
    oeffnung.melden?.(false, wiederholbar ? 'nicht-lesbar' : 'fehlt');
  }

  function abschliessen(oeffnung: Oeffnung, gesetz: GesetzDarstellung) {
    const { ziel, ausgangsTabId } = oeffnung;
    if (oeffnung.bannerId) bannerSchliessen(oeffnung.bannerId);
    const ausgangVorhanden = tabVorhanden(ausgangsTabId);
    // Hat die Startwiederherstellung oder eine gleichzeitige Öffnung den beim
    // Start leeren Ausgangstab inzwischen belegt, bleibt dieser Inhalt erhalten;
    // das Ziel kommt in einem neuen Tab hinzu.
    const ausgangInzwischenBelegt =
      ausgangVorhanden && oeffnung.ausgangLeerBeiStart && !tabLeer(ausgangsTabId);
    const modus =
      bindetAusgangstab(oeffnung.modus) && ausgangInzwischenBelegt ? 'immer-neu' : oeffnung.modus;
    // Ausgangstab geschlossen oder in ein anderes Fenster gezogen: „selber Tab“
    // öffnet nichts, ein neuer Tab entsteht trotzdem in diesem Fenster.
    if (bindetAusgangstab(modus) && !ausgangVorhanden) {
      oeffnung.melden?.(false, 'abgebrochen');
      return;
    }
    const xmlId = oeffnungsziel(gesetz, ziel);
    // Ein bloßer Tabwechsel während des Ladens wird nicht überschrieben; ein an
    // einen nicht aktiven Ausgangstab gebundenes Ziel wird dort ohne Aktivierung geöffnet.
    const aktivieren =
      (aktiverTabIdRef.current === oeffnung.aktivBeiStart ||
        !tabVorhanden(oeffnung.aktivBeiStart)) &&
      (!bindetAusgangstab(modus) || oeffnung.aktivBeiStart === ausgangsTabId);
    let startelement: string | undefined;
    const tabId = gesetzOeffnen(
      gesetz,
      xmlId ?? undefined,
      modus,
      (id) => {
        startelement = id;
      },
      {
        ausgangsTabId: ausgangVorhanden ? ausgangsTabId : undefined,
        aktivieren,
        verlaufNavigation: !!oeffnung.melden,
      },
    );
    oeffnung.nachOeffnen?.(tabId);
    schreibeSprung(oeffnung, tabId, startelement);
    oeffnung.melden?.(xmlId !== null, xmlId === null ? 'normziel' : undefined);
    if (xmlId === null) normHinweis(ziel.tiefenlink);
  }

  function normHinweis(tiefenlink?: true) {
    const hinweis = zeigeBanner({
      art: 'bedienhinweis',
      text: tiefenlink ? TIEFENLINK_ZIEL_HINWEIS : 'Norm nicht gefunden.',
      typ: 'warnung',
    });
    bannerAktualisieren(hinweis, { laedt: false });
  }

  function schreibeSprung(oeffnung: Oeffnung, tabId: string, startelement?: string) {
    const { ziel, ausgangsTabId } = oeffnung;
    // Bloße Aktivierung eines vorhandenen Tabs ohne Ziel ist kein Sprung.
    if (ziel.ohneVerlauf || !startelement) return;
    const eintrag = { gesetzesreferenz: ziel.gesetzesreferenz, xmlId: startelement };
    const ausgang = ziel.ausgangsVerlaufEintrag;
    const getrennterAusgangstab = !!ausgangsTabId && ausgangsTabId !== tabId;
    // A7: Bei getrennten Tabs ausschließlich die Ausgangsnorm im Quelltab
    // eintragen, keinesfalls dessen oder des Zieltabs abweichende aktive Stelle.
    const verlasseneStelle = ausgang && (getrennterAusgangstab ? eintrag : ausgang);
    const gesprungen = sprung(tabId, eintrag, verlasseneStelle ? { verlasseneStelle } : undefined);
    if (!gesprungen || !ausgang || !ausgangsTabId || !getrennterAusgangstab) return;
    const ausgangstab = tabsRef.current.find((t) => t.id === ausgangsTabId);
    if (
      ausgangstab?.gesetzesreferenz &&
      istGleichesGesetz(ausgangstab.gesetzesreferenz, ausgang.gesetzesreferenz)
    )
      // Der Ausgangstab wird nicht aktiviert. Auch seine bereits aktive
      // Ausgangsnorm muss eingetragen werden; dies ist kein Sprung auf sie.
      verlaufHinzufuegen(ausgangsTabId, ausgang);
  }

  function sofortOeffnen(
    ziel: Navigationsziel,
    modus?: OeffnenModus,
    ausgangsTabId?: string,
    melden?: AbschlussMelden,
  ): () => void {
    return oeffnungStarten({
      ziel: {
        ...ziel,
        gesetzesreferenz: {
          kurztitel: ziel.gesetzesreferenz.kurztitel,
          normgeber: ziel.gesetzesreferenz.normgeber,
        },
      },
      modus,
      ausgangsTabId,
      melden,
    });
  }

  function elementOeffnen(params: ElementOeffnenParams): void {
    const { gesetz, bezeichnung, xmlId, modus, ohneVerlauf } = params;
    vorherigeOeffnungAbloesen();
    const ziel = { gesetzesreferenz: gesetz, bezeichnung, xmlId };
    const normXmlId = normziel(gesetz, ziel);
    if (normXmlId === null) {
      zeigeBanner({ art: 'bedienhinweis', text: 'Norm nicht gefunden.', typ: 'warnung' });
    }
    let startelement: string | undefined;
    const tabId = gesetzOeffnen(gesetz, normXmlId ?? undefined, modus, (id) => {
      startelement = id;
    });
    verlaufFristStoppen(tabId);
    if (!ohneVerlauf && startelement)
      sprung(tabId, {
        gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
        xmlId: startelement,
      });
    // Bereits gelieferte Darstellungsdaten stammen aus einem abgeschlossenen
    // Ladevorgang; der gemeinsame Bestand liefert denselben Einzelzugriff.
    void ladeGesetz(gesetz).catch(console.error);
  }

  function handleVerweisKlick(
    ausgangsXmlId: string,
    zielnorm: VerweisKlickziel,
    neuerTab: boolean,
  ): void {
    const tab = tabsRef.current.find((t) => t.id === aktiverTabIdRef.current);
    const tabGesetz = holeTabGesetz(tab);
    if (!tab || !tabGesetz) return;
    const referenz =
      (zielnorm.typ === 'getaggterVerweis' ? zielnorm.zielgesetz : zielnorm.gesetz) ?? tabGesetz;
    sofortOeffnen(
      {
        gesetzesreferenz: { kurztitel: referenz.kurztitel, normgeber: referenz.normgeber },
        ...(zielnorm.typ === 'ganzesGesetz'
          ? {}
          : {
              bezeichnung:
                zielnorm.typ === 'getaggterVerweis'
                  ? zielnorm.zielBezeichnung
                  : zielnorm.bezeichnung,
            }),
        ausgangsVerlaufEintrag: {
          gesetzesreferenz: { kurztitel: tabGesetz.kurztitel, normgeber: tabGesetz.normgeber },
          xmlId: ausgangsXmlId,
        },
      },
      neuerTab ? 'immer-neu' : 'aktiver-tab',
      tab.id,
    );
  }

  function handleLesezeichenOeffnen(bezeichnung: string, referenz: Gesetzesreferenz) {
    sofortOeffnen(
      {
        gesetzesreferenz: { kurztitel: referenz.kurztitel, normgeber: referenz.normgeber },
        bezeichnung,
        lesezeichen: true,
      },
      'aktiver-tab',
    );
  }

  /** ⇧⌘T: verbraucht den Stapel einmal; Tab und Verlauf entstehen erst nach
   * erfolgreichem Laden. Beim Fensterstart (Menüanfrage ohne offenes Fenster)
   * darf sie den leeren aktiven Tab befüllen und läuft außerhalb von E3: Eine
   * gleichzeitige interne Navigation oder ein Tiefenlink öffnet zusätzlich. */
  function tabWiederherstellen(optionen?: { beimFensterstart?: boolean }): void {
    const beimFensterstart = !!optionen?.beimFensterstart;
    const geschlossener = geschlossenenTabPoppen();
    if (!geschlossener) {
      if (!beimFensterstart) vorherigeOeffnungAbloesen();
      erstelleLeerenTab();
      return;
    }
    const { verlauf, gesetzesreferenz } = geschlossener;
    const ziel = verlauf.eintraege[verlauf.position];
    const xmlId =
      ziel && istGleichesGesetz(ziel.gesetzesreferenz, gesetzesreferenz) ? ziel.xmlId : undefined;
    const leerenAktivTabErsetzen = beimFensterstart && tabLeer(aktiverTabIdRef.current);
    oeffnungStarten({
      ausserhalbE3: beimFensterstart || undefined,
      ziel: {
        gesetzesreferenz: {
          kurztitel: gesetzesreferenz.kurztitel,
          normgeber: gesetzesreferenz.normgeber,
        },
        xmlId,
        ohneVerlauf: true,
      },
      modus: leerenAktivTabErsetzen ? 'immer-aktiver-tab' : 'immer-neu',
      nachOeffnen: (tabId) => verlaufSetzen(tabId, verlauf),
    });
  }

  return {
    elementOeffnen,
    gesetzesreferenzOeffnen: sofortOeffnen,
    handleVerweisKlick,
    handleLesezeichenOeffnen,
    tabWiederherstellen,
  };
}
