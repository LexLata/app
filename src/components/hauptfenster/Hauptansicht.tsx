// Zeigt Tableiste, Lesezeichen und Gesetzestext; verbindet sie mit bestehenden App-Aktionen.
import { TabAnsicht } from './GesetzestextansichtHuelle';
import { useTabBereithaltung, type BereiteAnsicht } from '@/hooks/tabs/useTabBereithaltung';
import type { Tab } from '@/lib/domain/appTypes';
import { Seitenleistenanordnung } from '@/components/seitenleisten/seitenleisten.index';
import { verlaufPfeilzustaende } from '@/lib/domain/app/tabVerlauf';
import { useEffect } from 'react';
import { messeSichtbareDarstellung } from '@/lib/utils/perfMessung';
import { Tableiste } from '@/components/tableiste/Tableiste';
import { Willkommensansicht } from '@/components/hauptfenster/Willkommensansicht';
import { istErlaubt, type EinfuehrungsAktion } from '@/lib/domain/einfuehrung/einfuehrung.index';
import type { HauptansichtProps } from './Hauptansicht.types';

export function Hauptansicht(props: HauptansichtProps) {
  const teilaktion = props.einfuehrung.einfuehrungTeilaktion;
  const erlaubt = (aktion: EinfuehrungsAktion) =>
    !props.einfuehrung.einfuehrungAktiv || istErlaubt(teilaktion, aktion);
  const {
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
    verlaufLesen,
  } = props.tabsteuerung;
  const { handleTabHerausziehen, handleTabInFensterAufnehmen, fremdVorschauIndexRef } =
    props.fensterUebertragung;
  const { lesezeichen } = props.lesezeichenSteuerung;
  const {
    einfuehrungAktiv,
    favoritSpeichernMitEinfuehrung,
    lesezeichenSpeichernMitEinfuehrung,
    minimalistischerModusEffektiv,
    leistenTauschenEffektiv,
    einfuehrungErlaubtFuerUI,
    einfuehrungFavoritErlaubtFuerGesetzestextansicht,
  } = props.einfuehrung;
  const { handleLesezeichenOeffnen } = props.navigation;
  const { textDarstellung, plattformfremdeUiAnzeigen, seitenleistenTastenkuerzel } =
    props.darstellung;
  const { leistenSchriftgroesse } = textDarstellung;
  const { favoritenStatus, klappstufenStatus } = props.status;
  const { verlaufSchrittUndOeffnen, onUebersichtOeffnen, onOeffnenOverlayUmschalten } = props;
  const aktiverTab = tabs.find((t) => t.id === aktiverTabId) ?? null;
  const aktivesGesetz = holeTabGesetz(aktiverTab);
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
  const bereiteAnsichten: BereiteAnsicht[] = useTabBereithaltung({
    aktiverTabId,
    tabs,
    holeGeladenes,
    holeDatenstand,
    // Alle Einstellungen, die Satz und Höhen der Gesetzestextansicht bestimmen.
    darstellungsSchluessel: JSON.stringify([
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
      minimalistischerModusEffektiv,
    ]),
  });
  const gesetzOffen = !!aktivesGesetz;
  useEffect(() => {
    if (!import.meta.env.DEV || gesetzOffen || aktiverTab?.ladezustand === 'ladend') return;
    return messeSichtbareDarstellung(() => 'Tab ohne geladene Gesetzestextansicht');
  }, [aktiverTabId, aktiverTab?.ladezustand, gesetzOffen]);
  // Der Verlauf besitzt keinen zusätzlichen State in der Hauptansicht.
  // Änderungen lösen über useVerlaufSteuerung einen neuen Render aus.
  const aktiverVerlauf = aktiverTab ? verlaufLesen(aktiverTab.id) : undefined;
  const { kannZurueck: kannVerlaufZurueck, kannVorwaerts: kannVerlaufVorwaerts } =
    verlaufPfeilzustaende(aktiverVerlauf);

  return (
    <>
      <Tableiste
        tabs={tabs}
        aktiverTabId={aktiverTabId}
        tabTitel={tabTitel}
        onTabAktivieren={setAktiverTabId}
        onTabSchliessen={tabSchliessen}
        onTabsNeuAnordnen={setTabs}
        onUebersichtOeffnen={onUebersichtOeffnen}
        onNeuenTabOeffnen={erstelleLeerenTab}
        einfuehrungGesperrt={!erlaubt('tab-leiste')}
        uebersichtDeaktiviert={einfuehrungAktiv}
        plattformfremdeUiAnzeigen={plattformfremdeUiAnzeigen}
        onTabHerausziehen={handleTabHerausziehen}
        onTabInFensterAufnehmen={handleTabInFensterAufnehmen}
        fremdVorschauIndexRef={fremdVorschauIndexRef}
        minimalistischerModus={minimalistischerModusEffektiv}
        kannVerlaufZurueck={kannVerlaufZurueck && !einfuehrungAktiv}
        kannVerlaufVorwaerts={kannVerlaufVorwaerts && !einfuehrungAktiv}
        onVerlaufZurueck={() => verlaufSchrittUndOeffnen('zurueck')}
        onVerlaufVorwaerts={() => verlaufSchrittUndOeffnen('vorwaerts')}
      />

      <Seitenleistenanordnung
        leistenTauschen={leistenTauschenEffektiv}
        minimal={minimalistischerModusEffektiv}
        lesezeichen={{
          eintraege: lesezeichen,
          onKlick: (...args) => {
            if (erlaubt('lesezeichen-aufrufen')) void handleLesezeichenOeffnen(...args);
          },
          fontGroesse: leistenSchriftgroesse,
          seitenleistenTastenkuerzel: seitenleistenTastenkuerzel,
        }}
        favoriten={{
          gesetz: aktivesGesetz ?? null,
          eintraege: gesetzOffen ? favoritenStatus.favoritenEintraege : [],
          onKlick: (xmlId) => {
            if (erlaubt('favorit-aufrufen')) favoritenStatus.favoritAufrufen(xmlId);
          },
          fontGroesse: leistenSchriftgroesse,
          seitenleistenTastenkuerzel: seitenleistenTastenkuerzel,
        }}
        schnellaktionen={{
          gesetzOffen,
          lesezeichen,
          favoritenleisteSichtbar: favoritenStatus.favoritenleisteSichtbar,
          onFavoritKlick: favoritSpeichernMitEinfuehrung,
          onLesezeichenKlick: lesezeichenSpeichernMitEinfuehrung,
          kannZuklappen: klappstufenStatus.kannZuklappen,
          onZuklappenKlick: klappstufenStatus.zuklappen,
          kannAufklappen: klappstufenStatus.kannAufklappen,
          onAufklappenKlick: klappstufenStatus.aufklappen,
          onSucheKlick: onOeffnenOverlayUmschalten,
          einfuehrungErlaubt: einfuehrungErlaubtFuerUI,
        }}
        einfuehrungAktiv={einfuehrungAktiv}
        einfuehrungFavoritErlaubt={einfuehrungFavoritErlaubtFuerGesetzestextansicht}
      >
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {bereiteAnsichten.map((ansicht) => (
            <TabAnsicht
              key={ansicht.schluessel}
              props={props}
              tab={ansicht.tab}
              gesetz={ansicht.gesetz}
              aktiv={ansicht.aktiv}
              aktuell={ansicht.aktuell}
            />
          ))}
          {!aktivesGesetz &&
            (aktiverTab?.gesetzesreferenz &&
            aktiverTab.ladezustand !== 'fehlt' &&
            aktiverTab.ladezustand !== 'nicht-lesbar' ? (
              <Willkommensansicht wirdGeladen />
            ) : (
              <Willkommensansicht
                titel={ladefehlerTitel(aktiverTab?.gesetzesreferenz && aktiverTab.ladezustand)}
                onOeffnenOverlayOeffnen={() => {
                  if (!einfuehrungAktiv) onOeffnenOverlayUmschalten();
                }}
              />
            ))}
        </div>
      </Seitenleistenanordnung>
    </>
  );
}

/** Titel der Willkommensansicht für einen Tab, dessen Gesetz nicht geladen werden kann. */
function ladefehlerTitel(ladezustand: Tab['ladezustand'] | undefined): string | undefined {
  if (ladezustand === 'fehlt') return 'Gesetz nicht mehr vorhanden';
  if (ladezustand === 'nicht-lesbar') return 'Gesetz konnte nicht geladen werden';
  return undefined;
}
