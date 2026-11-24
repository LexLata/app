// Echte Hauptansicht und Speicheranschlüsse für Einführungsnachweise.
import { schreibeSpeicherbareNorm } from '@/lib/domain/aktives-element/aktives-element.index';
import {
  FavoritSchnellaktion,
  Favoritenleiste,
  Lesezeichenleiste,
  Schnellaktionen,
} from '@/components/seitenleisten/seitenleisten.index';
import { BannerHost } from '@/components/hauptfenster/BannerHost';
import { useSeitenleistenTastenkuerzel } from '@/hooks/einstellungen/useSeitenleistenTastenkuerzel';
import { useLeistenTauschen } from '@/hooks/einstellungen/useLeistenTauschen';
import { useSeitenleistenStatus } from '@/hooks/useSeitenleistenStatus';
import { HauptansichtFixture } from '@/test/hauptfenster/HauptansichtFixture';
import { EinfuehrungsOverlay } from '@/components/einfuehrung/EinfuehrungsOverlay';
import { useEffect, useState } from 'react';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { useEinfuehrungsAblauf } from '@/hooks/einfuehrung/useEinfuehrungsAblauf';
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import { appOverlayHostFixture } from '@/test/hauptfenster/appOverlayHostFixture';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { AktivesOverlay } from '@/lib/domain/appTypes';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';
export function EinfuehrungBedienungProbe({
  gesetz,
  nachfuehrungTest,
  hauptansichtTest,
  onStand,
  onAnsicht,
}: {
  gesetz: GesetzDarstellung;
  nachfuehrungTest: boolean;
  hauptansichtTest: boolean;
  onStand: (
    tabs: ReturnType<typeof useAppTabs>,
    einfuehrung: ReturnType<typeof useEinfuehrungsAblauf>,
  ) => void;
  onAnsicht: (id: string | undefined, anzahl: number) => void;
}) {
  const { seitenleistenTastenkuerzel } = useSeitenleistenTastenkuerzel();
  const tabsteuerung = useAppTabs();
  const { leistenTauschen } = useLeistenTauschen();
  const [overlay, aendereOverlay] = useState<AktivesOverlay | null>(null);
  const navigation = useGesetzOeffnen({
    ...gesetzOeffnenFixture(tabsteuerung, [gesetz]),

    ladeGesetz: einzelzugriffFuerTest(async () => ({
      liste: [gesetz],
      befunde: [],
      ordnerLesbar: true,
    })),
  });
  const speicher = useLesezeichenUndFavoriten(tabsteuerung);
  const { favoritenStatus, setFavoritenStatus } = useSeitenleistenStatus(true);
  const [klappstufenStatus, setKlappstufenStatus] = useState({
    zuklappen: () => {},
    aufklappen: () => {},
    kannZuklappen: true,
    kannAufklappen: false,
  });
  const aktuellerTab = tabsteuerung.tabs.find((t) => t.id === tabsteuerung.aktiverTabId);
  const ablauf = useEinfuehrungsAblauf({
    ...tabsteuerung,
    aktivesOverlay: overlay,
    favoritenStatus,
    tabZustand: tabsteuerung.holeTabGesetz(aktuellerTab)!
      ? tabsteuerung.einklappZustandRef.current[
          aktuellerTab!.id +
            '-' +
            gesetzesreferenzSchluessel(tabsteuerung.holeTabGesetz(aktuellerTab)!)
        ]
      : undefined,
    handleFavoritSpeichern: speicher.handleFavoritSpeichern,
    handleLesezeichenSpeichern: speicher.handleLesezeichenSpeichern,
    elementOeffnen: navigation.elementOeffnen,
    leistenTauschen,
    minimalistischerModus: false,
  });
  const tab = tabsteuerung.tabs.find((t) => t.id === tabsteuerung.aktiverTabId);
  useEffect(() => {
    onStand(tabsteuerung, ablauf);
  }, [tabsteuerung, ablauf, onStand]);
  return (
    <>
      {hauptansichtTest ? (
        <HauptansichtFixture
          seitenleistenTastenkuerzel={seitenleistenTastenkuerzel}
          tabsteuerung={tabsteuerung}
          navigation={navigation}
          lesezeichen={speicher}
          einfuehrung={ablauf}
          markierungenDeaktiviert={false}
          setFavoritenStatus={setFavoritenStatus}
          status={{ favoritenStatus, setFavoritenStatus, klappstufenStatus, setKlappstufenStatus }}
          onOeffnenOverlayUmschalten={() => aendereOverlay('oeffnen')}
          verlaufSchrittUndOeffnen={() => {}}
          verlaufAktivierung={() => {}}
          verlaufBedienung={() => {}}
        />
      ) : (
        <>
          <Lesezeichenleiste
            eintraege={[]}
            onKlick={() => {}}
            seitenleistenTastenkuerzel={false}
            seite="links"
            schnellaktionenAnzahl={5}
            schnellaktionen={
              <Schnellaktionen
                gesetzOffen={true}
                favoritenleisteSichtbar={false}
                onFavoritKlick={ablauf.favoritSpeichernMitEinfuehrung}
                lesezeichen={[]}
                onLesezeichenKlick={ablauf.lesezeichenSpeichernMitEinfuehrung}
                kannZuklappen={true}
                kannAufklappen={true}
                onZuklappenKlick={klappstufenStatus.zuklappen}
                onAufklappenKlick={klappstufenStatus.aufklappen}
                onSucheKlick={() => aendereOverlay('oeffnen')}
                einfuehrungErlaubt={ablauf.einfuehrungErlaubtFuerUI}
              />
            }
          />
          <Favoritenleiste
            gesetz={gesetz}
            eintraege={favoritenStatus.favoritenEintraege}
            onKlick={favoritenStatus.favoritAufrufen}
            seite="rechts"
            schnellaktionenAnzahl={1}
            schnellaktionen={
              <FavoritSchnellaktion
                onFavoritKlick={ablauf.favoritSpeichernMitEinfuehrung}
                einfuehrungFavoritErlaubt={ablauf.einfuehrungFavoritErlaubtFuerGesetzestextansicht}
                einfuehrungAktiv={ablauf.einfuehrungAktiv}
              />
            }
          />
          <Gesetzestextansicht
            onSpeicherbareNormAendern={schreibeSpeicherbareNorm}
            key={String(nachfuehrungTest)}
            gesetz={gesetz}
            initialAktivesElementId="p"
            initialNorm={nachfuehrungTest ? undefined : tab?.initialNorm}
            markierungenDeaktiviert
            favoritenVersion={speicher.favoritenVersion}
            einfuehrungSperren={ablauf.einfuehrungSperrenFuerGesetzestextansicht}
            onKlappstufenStatusAendern={setKlappstufenStatus}
            onFavoritenStatusAendern={setFavoritenStatus}
            onEinklappZustandChange={(u, n, id) => {
              onAnsicht(id ?? undefined, u.size + n.size);
              if (hauptansichtTest) ablauf.meldeEinklappAenderung(u.size + n.size);
              if (tabsteuerung.aktiverTabId)
                tabsteuerung.einklappZustandRef.current[
                  tabsteuerung.aktiverTabId + '-' + gesetzesreferenzSchluessel(gesetz)
                ] = { ueberschriften: u, normen: n, aktivesElementId: id };
            }}
          />
        </>
      )}
      {hauptansichtTest && ablauf.einfuehrungAktiv && (
        <EinfuehrungsOverlay
          teilaktion={ablauf.einfuehrungTeilaktion}
          fertig={ablauf.einfuehrungFertig}
          appName={ablauf.einfuehrungAppName}
          istAktuellFavorit={favoritenStatus.istAktuellFavorit}
          onUeberspringen={ablauf.einfuehrungBeenden}
          onFertig={ablauf.einfuehrungBeenden}
        />
      )}
      <BannerHost />
      <AppOverlayHost
        einfuehrungTeilaktion={ablauf.einfuehrungTeilaktionFuerSuche}
        onKeineVerbindung={ablauf.onKeineVerbindung}
        {...appOverlayHostFixture({
          aktivesOverlay: overlay,
          gesetze: [gesetz],
          aktiverTab: tab ?? null,
          onSchliessen: () => aendereOverlay(null),
          onOeffnenNavigation: ablauf.onOeffnenNavigation,
          elementOeffnen: ablauf.elementOeffnenFuerSuche,
          gesetzesreferenzOeffnen: navigation.gesetzesreferenzOeffnen,
        })}
      />
    </>
  );
}
