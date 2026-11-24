// App.tsx
// Verbindet Hauptansicht, Tabs, Overlays und Fensteraktionen.
import { useImportindizesBereithalten } from '@/hooks/useImportindizesBereithalten';
import { useFensterVorladen } from '@/hooks/useFensterVorladen';
import { setzeAktiv } from '@/lib/plattform/menu/menu.index';
import { useSuchverzeichnis } from '@/hooks/useSuchverzeichnis';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { geschlosseneTabsMenuStatusSynchronisieren } from '@/lib/persistenz/fenster/fenster.index';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useZuletztAngezeigt } from '@/hooks/useZuletztAngezeigt';
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { BannerHost } from '@/components/hauptfenster/BannerHost';
import type { AktivesOverlay } from '@/lib/domain/appTypes';
import { Hauptansicht } from '@/components/hauptfenster/Hauptansicht';
import { useHauptfensterDarstellung } from '@/hooks/useHauptfensterDarstellung';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useFensterRestore } from '@/hooks/fenster/useFensterRestore';
import { useAppEingabe } from '@/hooks/eingabe/useAppEingabe';

import { empfangeHauptfensterHinweise } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { zeigeAktionsMeldungsBanner } from '@/lib/banner/banner.index';
import { useOeffnenLinkNavigation } from '@/hooks/fenster/useOeffnenLinkNavigation';
import type { SuchOverlayVorbelegung } from '@/lib/domain/appTypes';
import { useInterneNavigation } from '@/hooks/fenster/useInterneNavigation';
import { useTiefenLinks } from '@/hooks/useTiefenLinks.ts';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten.ts';
import { useMarkierungen } from '@/hooks/markierungen/useMarkierungen';
import { useTextauswahl } from '@/hooks/utils/useTextauswahl';
import {
  meldeGesetzOffenStatus,
  registriereMenuZustandAnfrageListener,
} from '@/lib/plattform/menu/menu.index';
import { useVerweismarkierungUndKommentarHilfsfenster } from '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster';
import { useFensterUebertragung } from '@/hooks/fenster/useFensterUebertragung';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';
import { useHintergrundAktualisierung } from '@/hooks/useHintergrundAktualisierung.ts';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useGesetzVerwaltung } from '@/hooks/tabs/useGesetzVerwaltung';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useSeitenleistenStatus } from '@/hooks/useSeitenleistenStatus';
import { useAppAktionen } from '@/hooks/useAppAktionen.ts';
import { useEinfuehrungsAblauf } from '@/hooks/einfuehrung/useEinfuehrungsAblauf';
import { useFensterstartInitialisierung } from '@/hooks/useFensterstartInitialisierung.ts';
import { EinfuehrungsOverlay } from '@/components/einfuehrung/EinfuehrungsOverlay.tsx';
import { LinuxTitelleistenAbfrage } from '@/components/overlays/overlays.index';

export default function App() {
  useEffect(() => {
    // Alle Meldungen einer Hilfsfensteraktion ergeben ein Vorgangsergebnis.
    const empfang = empfangeHauptfensterHinweise((hinweis) => {
      zeigeAktionsMeldungsBanner(
        hinweis.meldungen?.length ? hinweis.meldungen : [{ text: hinweis.text, typ: hinweis.typ }],
      );
    });
    void empfang.bereit.catch((fehler) => {
      console.error('Hauptfenster-Hinweisempfang konnte nicht angemeldet werden:', fehler);
    });
    return empfang.abmelden;
  }, []);

  const {
    holeTabGesetz,
    uebernehmeTabGesetz,
    tabs,
    setTabs,
    aktiverTabId,
    setAktiverTabId,
    tabTitel,
    setTabTitel,
    tabsRef,
    aktiverTabIdRef,
    scrollPositionenRef,
    einklappZustandRef,
    verlaufLesen,
    verlaufSetzen,
    ladeGesetz,
    vorladen,
    gesetzOeffnen,
    holeGeladenes,
    holeDatenstand,
    erstelleLeerenTab,
    tabSchliessen,
    gesetzeTabsSchliessen,
    sprung,
    verlaufHinzufuegen,
    verlaufAktivierung,
    verlaufBedienung,
    verlaufFristStoppen,
    verlaufNavigieren,
    gesetzInfoInTabsPatchen,
    tabFuerUebertragungKopieren,
    tabUebertragungAbschliessen,
    tabAusUebertragungUebernehmen,
  } = useAppTabs();

  const [aktivesOverlay, setAktivesOverlay] = useState<AktivesOverlay | null>(null);
  const uebersichtExportAktionRef = useRef<(() => void) | null>(null);
  const uebersichtExportAktionAnmelden = useCallback((aktion: (() => void) | null) => {
    uebersichtExportAktionRef.current = aktion;
  }, []);
  const [oeffnenOverlayInitial, setOeffnenOverlayInitial] = useState<SuchOverlayVorbelegung>('');
  const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
  const setNormalenSuchtext: React.Dispatch<React.SetStateAction<string>> = (text) =>
    setOeffnenOverlayInitial((vorher) =>
      typeof text === 'function'
        ? text(typeof vorher === 'string' ? vorher : vorher.suchtext)
        : text,
    );

  const {
    gesetzeskurzbefehle,
    ladeGesetzeNachDateiImport,
    gleicheGesetzeAb,
    handleLoeschen,
    handleExportieren,
    handleGesetzeskurzbefehleGeaendert,
  } = useGesetzVerwaltung({ gesetzeTabsSchliessen });

  const {
    markierungenDeaktiviertRef,
    minimalistischerModus,
    istLinux,
    linuxTitelleistenPraeferenz,
    linuxTitelleistenPraeferenzAendern,
    leistenTauschen,
    ...darstellung
  } = useHauptfensterDarstellung();
  const { textDarstellung } = darstellung;

  const fensterRestore = useFensterRestore(
    tabs,
    aktiverTabId,
    tabsRef,
    aktiverTabIdRef,
    verlaufLesen,
    verlaufSetzen,
    uebernehmeTabGesetz,
  );

  const {
    handleFavoritSpeichern,
    handleLesezeichenSpeichern,
    handleAlleLesezeichenEntfernen,
    ...lesezeichenSteuerung
  } = useLesezeichenUndFavoriten({ holeTabGesetz, tabsRef, aktiverTabIdRef, einklappZustandRef });

  const { handleMarkierungRueckgaengig, handleMarkierungWiederholen, ...markierungen } =
    useMarkierungen({ holeTabGesetz, tabsRef, aktiverTabIdRef, markierungenDeaktiviertRef });
  const { handleUnterstreichen, handleHervorheben } = markierungen;
  const hilfsfenster = useVerweismarkierungUndKommentarHilfsfenster({
    ladeGesetz,
    holeTabGesetz,
    tabsRef,
    aktiverTabIdRef,
    einklappZustandRef,
    markierungenDeaktiviertRef,
  });
  const { handleVerweismarkierungAnfrage, handleKommentarAnfrage } = hilfsfenster;

  const fensterUebertragung = useFensterUebertragung({
    fensterSchliessen: fensterRestore.fensterSchliessen,
    tabFuerUebertragungKopieren,
    tabUebertragungAbschliessen,
    tabAusUebertragungUebernehmen,
  });

  const {
    elementOeffnen,
    handleVerweisKlick,
    handleLesezeichenOeffnen,
    gesetzesreferenzOeffnen,
    tabWiederherstellen,
  } = useGesetzOeffnen({
    holeTabGesetz,
    ladeGesetz,
    gesetzOeffnen,
    erstelleLeerenTab,
    tabs,
    tabsRef,
    aktiverTabIdRef,
    sprung,
    verlaufHinzufuegen,
    verlaufSetzen,
    verlaufFristStoppen,
  });

  const {
    gesetzInfoAktualisieren,
    handleExportOeffnen,
    tabOderFensterSchliessen,
    fensterSchliessen,
    tabWiederherstellenAktuell,
    verlaufSchrittUndOeffnen,
    handleDateiImportStart,
    handleDateiImportSchliessen,
    handleDateiImportAnfrage,
  } = useAppAktionen({
    uebersichtExportAktionRef,
    tabsRef,
    aktiverTabIdRef,
    tabSchliessen,
    tabWiederherstellen,
    fensterSchliessen: fensterRestore.fensterSchliessen,
    verlaufNavigieren,
    gesetzesreferenzOeffnen,
    gesetzInfoInTabsPatchen,
    aktivesOverlay,
    setAktivesOverlay,
  });

  const { leseAppStartZiel, oeffneTiefenLinkZiel } = useTiefenLinks({
    gesetzesreferenzOeffnen,
    elementOeffnen,
    oeffnenLinkEmpfangen: (auftrag, beimAppStart) =>
      rufeBefehl('oeffnen_link_navigation_senden', { auftrag, beimAppStart }),
  });
  const oeffnenLinkAusfuehren = useOeffnenLinkNavigation({
    importindexVorbereitungRef,
    zeigeSuchfehler: (zustand) => {
      setOeffnenOverlayInitial(zustand);
      setAktivesOverlay('oeffnen');
    },
  });

  const { startAbgeschlossen, startaufgabenBereit } = useFensterstartInitialisierung({
    importindexVorbereitungRef,
    ladeGesetz,
    tabAusUebertragungUebernehmen,
    tabWiederherstellen,
    setTabs,
    setAktiverTabId,
    fensterRestore,
    leseAppStartZiel,
    oeffneTiefenLinkZiel,
  });
  // Gespeicherte Gesetzesliste schon nach dem Anzeigen des Fensters, nicht erst
  // nach dem Laden aller Starttabs; der Abgleich aktualisiert sie danach.
  const { eintraege, wirdVorbereitet, wirdAktualisiert } = useSuchverzeichnis(
    startaufgabenBereit || fensterRestore.fensterSichtbar,
  );
  const importindizesBereit = useImportindizesBereithalten(
    startAbgeschlossen,
    importindexVorbereitungRef,
  );
  useFensterVorladen(startAbgeschlossen, importindizesBereit, vorladen);
  useEffect(() => {
    setzeAktiv('gesetze-aktualisieren', eintraege.length > 0);
  }, [eintraege]);
  const suchverzeichniseintraege = eintraege.filter((eintrag) => eintrag.status === 'in-ordnung');

  const gesetzaktualisierungErsterDurchlaufBeendet = useHintergrundAktualisierung({
    gesetze: suchverzeichniseintraege,
    startAbgeschlossen,
    bestandAbgeglichen: !wirdVorbereitet,
    onInfoAktualisiert: gesetzInfoAktualisieren,
  });
  // Die automatische Updateprüfung ist die letzte Startaufgabe dieses Fensters.
  useAppUpdate({
    startAbgeschlossen,
    gesetzaktualisierungBeendet: gesetzaktualisierungErsterDurchlaufBeendet,
  });

  useInterneNavigation({
    gesetzesreferenzOeffnen,
    oeffnenLinkAusfuehren,
    startAbgeschlossen,
    tabsRef,
    aktiverTabIdRef,
    elementOeffnen,
  });

  // Einführung und Eingabeaktionen benötigen den aktiven Tab samt Klappzustand.
  const aktiverTab = tabs.find((t) => t.id === aktiverTabId) ?? null;
  const aktivesGesetz = holeTabGesetz(aktiverTab);
  useZuletztAngezeigt(aktivesGesetz ?? null);
  const tabZustand =
    aktiverTab && aktivesGesetz
      ? einklappZustandRef.current[aktiverTab.id + '-' + gesetzesreferenzSchluessel(aktivesGesetz)]
      : undefined;

  // Meldet den offenen Gesetzestext über die fokusfeste Menüzustand-Synchronisierung.
  useEffect(() => {
    meldeGesetzOffenStatus(!!aktivesGesetz);
  }, [aktivesGesetz]);

  useTextauswahl();

  // Beantwortet Menüanfragen beim Fensterfokus mit dem aktuellen Stapelstatus.
  useEffect(
    () => registriereMenuZustandAnfrageListener(geschlosseneTabsMenuStatusSynchronisieren),
    [],
  );

  const gesetzOffen = !!aktivesGesetz;
  const { favoritenStatus, setFavoritenStatus, klappstufenStatus, setKlappstufenStatus } =
    useSeitenleistenStatus(gesetzOffen);

  const einfuehrung = useEinfuehrungsAblauf({
    holeTabGesetz,
    tabsRef,
    aktiverTabIdRef,
    einklappZustandRef,
    favoritenStatus,
    tabZustand,
    aktivesOverlay,
    handleFavoritSpeichern,
    handleLesezeichenSpeichern,
    elementOeffnen,
    minimalistischerModus,
    leistenTauschen,
  });
  const {
    einfuehrungTeilaktionFuerSuche,
    onKeineVerbindung,
    keineVerbindung,
    einfuehrungAktiv,
    einfuehrungTeilaktion,
    einfuehrungFertig,
    einfuehrungAppName,
    einfuehrungBeenden,
    einfuehrungNeuStarten,
    favoritSpeichernMitEinfuehrung,
    lesezeichenSpeichernMitEinfuehrung,
    elementOeffnenFuerSuche,
    onOeffnenNavigation,
    minimalistischerModusEffektiv,
  } = einfuehrung;

  useAppEingabe({
    seitenleistenTastenkuerzel: darstellung.seitenleistenTastenkuerzel,
    tabsRef,
    aktiverTabIdRef,
    gesetzeskurzbefehle,
    gesetze: suchverzeichniseintraege,
    gesetzesreferenzOeffnen,
    elementOeffnen,
    erstelleLeerenTab,
    setAktiverTabId,
    setAktivesOverlay,
    setOeffnenOverlayInitial: setNormalenSuchtext,
    tabOderFensterSchliessen,
    fensterSchliessen,
    handleExportOeffnen,
    handleFavoritSpeichern: favoritSpeichernMitEinfuehrung,
    handleLesezeichenSpeichern: lesezeichenSpeichernMitEinfuehrung,
    handleAlleLesezeichenEntfernen,
    handleUnterstreichen,
    handleHervorheben,
    handleVerweismarkierungAnfrage,
    handleKommentarAnfrage,
    handleMarkierungRueckgaengig,
    handleMarkierungWiederholen,
    lesezeichenEintraege: lesezeichenSteuerung.lesezeichen,
    handleLesezeichenOeffnen,
    verlaufSchrittUndOeffnen,
    tabWiederherstellen: tabWiederherstellenAktuell,
    handleDateiImportAnfrage,
    handleZuklappen: klappstufenStatus.zuklappen,
    handleAufklappen: klappstufenStatus.aufklappen,
    einfuehrungAktiv,
    einfuehrungTeilaktion,
    einfuehrungNeuStarten,
  });

  return (
    <UiGroesseProvider>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100vw',
          background: 'var(--bg-haupt)',
          color: 'var(--text-primaer)',
          fontFamily: 'var(--schrift)',
          overflow: 'hidden',
        }}
      >
        <Hauptansicht
          tabsteuerung={{
            holeTabGesetz,
            holeGeladenes,
            holeDatenstand,
            tabs,
            aktiverTabId,
            tabTitel,
            setAktiverTabId,
            tabSchliessen,
            setTabs,
            erstelleLeerenTab,
            scrollPositionenRef,
            einklappZustandRef,
            verlaufLesen,
            setTabTitel,
          }}
          fensterUebertragung={fensterUebertragung}
          lesezeichenSteuerung={lesezeichenSteuerung}
          einfuehrung={einfuehrung}
          markierungen={markierungen}
          hilfsfenster={hilfsfenster}
          navigation={{ handleVerweisKlick, handleLesezeichenOeffnen }}
          darstellung={darstellung}
          status={{
            favoritenStatus,
            klappstufenStatus,
            setFavoritenStatus,
            setKlappstufenStatus,
          }}
          verlaufSchrittUndOeffnen={verlaufSchrittUndOeffnen}
          verlaufAktivierung={verlaufAktivierung}
          verlaufBedienung={verlaufBedienung}
          onUebersichtOeffnen={() => setAktivesOverlay('uebersicht')}
          onOeffnenOverlayUmschalten={() => {
            setOeffnenOverlayInitial('');
            setAktivesOverlay((v) => (v === 'oeffnen' ? null : 'oeffnen'));
          }}
        />

        <AppOverlayHost
          einklappZustandRef={einklappZustandRef}
          einfuehrungTeilaktion={einfuehrungTeilaktionFuerSuche}
          onKeineVerbindung={onKeineVerbindung}
          textDarstellung={textDarstellung}
          aktivesOverlay={aktivesOverlay}
          onSchliessen={() => {
            setAktivesOverlay(null);
            setOeffnenOverlayInitial('');
          }}
          ladeGesetz={ladeGesetz}
          suchverzeichniseintraege={eintraege}
          suchverzeichnisWirdVorbereitet={wirdVorbereitet}
          suchverzeichnisWirdAktualisiert={wirdAktualisiert}
          aktiverTab={aktiverTab}
          aktivesGesetz={aktivesGesetz}
          gesetzeskurzbefehle={gesetzeskurzbefehle}
          oeffnenOverlayInitial={oeffnenOverlayInitial}
          verlaufNavigieren={verlaufNavigieren}
          verlauf={aktiverTab ? verlaufLesen(aktiverTab.id) : undefined}
          elementOeffnen={elementOeffnenFuerSuche}
          gesetzesreferenzOeffnen={gesetzesreferenzOeffnen}
          minimalistischerModus={minimalistischerModusEffektiv}
          onVolltextModusWechseln={setAktivesOverlay}
          onOeffnenNavigation={onOeffnenNavigation}
          onLoeschen={handleLoeschen}
          onExportieren={handleExportieren}
          onUebersichtExportAktionAnmelden={uebersichtExportAktionAnmelden}
          onDateienAbgelegt={handleDateiImportStart}
          onGesetzeskurzbefehleGeaendert={handleGesetzeskurzbefehleGeaendert}
          onNeuLadenNachImport={gleicheGesetzeAb}
          onNeuLadenNachDateiImport={ladeGesetzeNachDateiImport}
          onInfoAktualisiert={gesetzInfoAktualisieren}
          onDateiImportSchliessen={handleDateiImportSchliessen}
        />

        {istLinux && linuxTitelleistenPraeferenz === null ? (
          <LinuxTitelleistenAbfrage onAuswahl={linuxTitelleistenPraeferenzAendern} />
        ) : null}

        {einfuehrungAktiv ? (
          <EinfuehrungsOverlay
            keineVerbindung={keineVerbindung}
            teilaktion={einfuehrungTeilaktion}
            fertig={einfuehrungFertig}
            appName={einfuehrungAppName}
            istAktuellFavorit={favoritenStatus.istAktuellFavorit}
            onUeberspringen={einfuehrungBeenden}
            onFertig={einfuehrungBeenden}
          />
        ) : null}

        <BannerHost />
      </div>
    </UiGroesseProvider>
  );
}
