// Kapselt die tabgebundenen Rückmeldungen und die Verdeckung der Gesetzestextansicht
// (aktuelle Ansicht eines Tabs oder verlassene Gesetzesansicht).
import { schreibeSpeicherbareNorm } from '@/lib/domain/aktives-element/aktives-element.index';
import { Activity } from 'react';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { Tab } from '@/lib/domain/appTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { speichereAktivierung } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';
import { istErlaubt, type EinfuehrungsAktion } from '@/lib/domain/einfuehrung/einfuehrung.index';
import {
  RANDBREITE_WERTE,
  STRUKTURKONTEXTLEISTE_GROESSE_WERTE,
  LESBARE_ZEILENLAENGE_BREITE_WERTE,
} from '@/lib/stil/gesetzTextDarstellung';
import type { HauptansichtProps } from './Hauptansicht.types';

export function TabAnsicht({
  props,
  tab,
  gesetz,
  aktiv,
  aktuell,
}: {
  props: HauptansichtProps;
  tab: Tab;
  gesetz: GesetzDarstellung;
  /** Sichtbar: aktuelle Ansicht des aktiven Tabs. */
  aktiv: boolean;
  /** Zeigt das aktuelle Gesetz des Tabs; verlassene Gesetzesansichten übernehmen keine Ziele. */
  aktuell: boolean;
}) {
  const { scrollPositionenRef, einklappZustandRef, setTabs, setTabTitel } = props.tabsteuerung;
  const tabGesetzKey = tab.id + '-' + gesetzesreferenzSchluessel(gesetz);
  const tabZustand = einklappZustandRef.current[tabGesetzKey];
  const { favoritenVersion } = props.lesezeichenSteuerung;
  const {
    einfuehrungAktiv,
    meldeEinklappAenderung,
    minimalistischerModusEffektiv,
    einfuehrungSperrenFuerGesetzestextansicht,
  } = props.einfuehrung;
  const erlaubt = (aktion: EinfuehrungsAktion) =>
    !einfuehrungAktiv || istErlaubt(props.einfuehrung.einfuehrungTeilaktion, aktion);
  const { handleUnterstreichen, handleHervorheben, handleMarkierungLoeschen } = props.markierungen;
  const {
    handleVerweismarkierungAnfrage,
    handleVerweismarkierungBearbeiten,
    handleKommentarAnfrage,
    handleKommentarBearbeiten,
  } = props.hilfsfenster;
  const { handleVerweisKlick } = props.navigation;
  const { textDarstellung, markierungenDeaktiviert, seitenleistenTastenkuerzel } =
    props.darstellung;
  const {
    schriftgroesse,
    schriftart,
    zeilenabstand,
    satzNeuZeile,
    blocksatz,
    silbentrennung,
    randbreite,
    strukturKontextLeisteGroesse,
    lesbareZeilenlaenge,
    lesbareZeilenlaengeBreite,
  } = textDarstellung;
  const { favoritenStatus, setFavoritenStatus, setKlappstufenStatus } = props.status;
  const { verlaufAktivierung } = props;
  return (
    <Activity mode={aktiv ? 'visible' : 'hidden'}>
      <Gesetzestextansicht
        gesetz={gesetz}
        seitenleistenTastenkuerzel={seitenleistenTastenkuerzel}
        initialNorm={aktuell ? tab.initialNorm : undefined}
        initialScrollIndex={scrollPositionenRef.current[tabGesetzKey]?.index}
        initialScrollOffsetInItem={scrollPositionenRef.current[tabGesetzKey]?.offset}
        onScrollIndexChange={(index, offset) => {
          scrollPositionenRef.current[tabGesetzKey] = { index, offset };
        }}
        onInitialNormScrolled={(ziel) => {
          // Nur das ausgeführte Ziel und nur, solange der Tab noch dieses Gesetz zeigt.
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tab.id &&
              t.initialNorm === ziel &&
              t.gesetzesreferenz &&
              istGleichesGesetz(t.gesetzesreferenz, gesetz)
                ? { ...t, initialNorm: undefined }
                : t,
            ),
          );
        }}
        initialEingeklappteUeberschriften={tabZustand?.ueberschriften}
        initialEingeklappteNormen={tabZustand?.normen}
        initialAktivesElementId={tabZustand?.aktivesElementId ?? null}
        onBedienung={() => props.verlaufBedienung(tab.id)}
        onAktivierung={({ xmlId, art }) =>
          verlaufAktivierung(
            tab.id,
            {
              gesetzesreferenz: gesetz,
              xmlId,
            },
            art,
          )
        }
        onEinklappZustandChange={(ueberschriften, normen, aktivesElementId) => {
          einklappZustandRef.current[tabGesetzKey] = {
            ueberschriften,
            normen,
            aktivesElementId,
          };
          meldeEinklappAenderung(ueberschriften.size + normen.size);
          if (!aktivesElementId) return;
          const el = gesetz.elemente.find((e) => e.data.id === aktivesElementId);
          if (!el) return;
          speichereAktivierung(gesetz, el);
        }}
        schriftgroesse={schriftgroesse}
        schriftart={schriftart}
        zeilenabstand={zeilenabstand}
        satzNeuZeile={satzNeuZeile}
        blocksatz={blocksatz}
        silbentrennungAktiviert={silbentrennung}
        randInline={RANDBREITE_WERTE[randbreite]}
        strukturKontextLeisteGroesse={
          STRUKTURKONTEXTLEISTE_GROESSE_WERTE[strukturKontextLeisteGroesse]
        }
        lesbareZeilenlaenge={lesbareZeilenlaenge}
        maxTextSpalteBreite={LESBARE_ZEILENLAENGE_BREITE_WERTE[lesbareZeilenlaengeBreite]}
        markierungenDeaktiviert={markierungenDeaktiviert || einfuehrungAktiv}
        favoritenVersion={favoritenVersion}
        seitenleistenFavoriten={favoritenStatus.favoritenEintraege}
        lesezeichenGeladen={props.lesezeichenSteuerung.lesezeichenGeladen}
        onTabBezeichnung={(bez) =>
          setTabTitel((prev) =>
            prev[tab.id] === (bez ?? '') ? prev : { ...prev, [tab.id]: bez ?? '' },
          )
        }
        onVerweisKlick={(...args) => {
          if (erlaubt('verweis-aufrufen')) void handleVerweisKlick(...args);
        }}
        onVerweisBearbeiten={(_ausgangsXmlId, eintrag) => {
          void handleVerweismarkierungBearbeiten(gesetz, eintrag);
        }}
        onKommentarKlick={(_ausgangsXmlId, eintrag) => {
          void handleKommentarBearbeiten(gesetz, eintrag);
        }}
        onMarkierungLoeschen={(_ausgangsXmlId, eintrag) => {
          void handleMarkierungLoeschen(gesetz, eintrag);
        }}
        onUnterstreichen={handleUnterstreichen}
        onHervorheben={handleHervorheben}
        onVerweismarkierungAnfrage={handleVerweismarkierungAnfrage}
        onKommentarAnfrage={handleKommentarAnfrage}
        minimalistischerModus={minimalistischerModusEffektiv}
        onSpeicherbareNormAendern={schreibeSpeicherbareNorm}
        onFavoritenStatusAendern={setFavoritenStatus}
        onKlappstufenStatusAendern={setKlappstufenStatus}
        einfuehrungSperren={einfuehrungSperrenFuerGesetzestextansicht}
      />
    </Activity>
  );
}
