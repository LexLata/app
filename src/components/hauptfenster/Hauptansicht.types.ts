// Eingaben der Hauptansicht; gemeinsam genutzt von Hauptansicht und einzelner Tabansicht.
import type { ComponentProps } from 'react';
import type { Gesetzestextansicht } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import type { useAppTabs } from '@/hooks/tabs/useAppTabs';
import type { useFensterUebertragung } from '@/hooks/fenster/useFensterUebertragung';
import type { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten.ts';
import type { useEinfuehrungsAblauf } from '@/hooks/einfuehrung/useEinfuehrungsAblauf';
import type { useMarkierungen } from '@/hooks/markierungen/useMarkierungen';
import type { useVerweismarkierungUndKommentarHilfsfenster } from '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster';
import type { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import type { useHauptfensterDarstellung } from '@/hooks/useHauptfensterDarstellung';
import type { useAppAktionen } from '@/hooks/useAppAktionen';
import type { useVerlaufSteuerung } from '@/hooks/tabs/useVerlaufSteuerung';

export interface HauptansichtProps {
  tabsteuerung: Pick<
    ReturnType<typeof useAppTabs>,
    | 'holeTabGesetz'
    | 'holeGeladenes'
    | 'holeDatenstand'
    | 'tabs'
    | 'aktiverTabId'
    | 'tabTitel'
    | 'setAktiverTabId'
    | 'tabSchliessen'
    | 'setTabs'
    | 'erstelleLeerenTab'
    | 'scrollPositionenRef'
    | 'einklappZustandRef'
    | 'verlaufLesen'
    | 'setTabTitel'
  >;
  fensterUebertragung: Pick<
    ReturnType<typeof useFensterUebertragung>,
    'handleTabHerausziehen' | 'handleTabInFensterAufnehmen' | 'fremdVorschauIndexRef'
  >;
  lesezeichenSteuerung: Pick<
    ReturnType<typeof useLesezeichenUndFavoriten>,
    'lesezeichen' | 'lesezeichenGeladen' | 'favoritenVersion'
  >;
  einfuehrung: Pick<
    ReturnType<typeof useEinfuehrungsAblauf>,
    | 'einfuehrungTeilaktion'
    | 'einfuehrungAktiv'
    | 'favoritSpeichernMitEinfuehrung'
    | 'lesezeichenSpeichernMitEinfuehrung'
    | 'meldeEinklappAenderung'
    | 'leistenTauschenEffektiv'
    | 'minimalistischerModusEffektiv'
    | 'einfuehrungErlaubtFuerUI'
    | 'einfuehrungSperrenFuerGesetzestextansicht'
    | 'einfuehrungFavoritErlaubtFuerGesetzestextansicht'
  >;
  markierungen: Pick<
    ReturnType<typeof useMarkierungen>,
    'handleUnterstreichen' | 'handleHervorheben' | 'handleMarkierungLoeschen'
  >;
  hilfsfenster: Pick<
    ReturnType<typeof useVerweismarkierungUndKommentarHilfsfenster>,
    | 'handleVerweismarkierungAnfrage'
    | 'handleVerweismarkierungBearbeiten'
    | 'handleKommentarAnfrage'
    | 'handleKommentarBearbeiten'
  >;
  navigation: Pick<
    ReturnType<typeof useGesetzOeffnen>,
    'handleVerweisKlick' | 'handleLesezeichenOeffnen'
  >;
  darstellung: Pick<
    ReturnType<typeof useHauptfensterDarstellung>,
    | 'textDarstellung'
    | 'markierungenDeaktiviert'
    | 'plattformfremdeUiAnzeigen'
    | 'seitenleistenTastenkuerzel'
  >;
  status: {
    favoritenStatus: Parameters<
      NonNullable<ComponentProps<typeof Gesetzestextansicht>['onFavoritenStatusAendern']>
    >[0];
    klappstufenStatus: Parameters<
      NonNullable<ComponentProps<typeof Gesetzestextansicht>['onKlappstufenStatusAendern']>
    >[0];
    setFavoritenStatus: NonNullable<
      ComponentProps<typeof Gesetzestextansicht>['onFavoritenStatusAendern']
    >;
    setKlappstufenStatus: NonNullable<
      ComponentProps<typeof Gesetzestextansicht>['onKlappstufenStatusAendern']
    >;
  };
  verlaufSchrittUndOeffnen: ReturnType<typeof useAppAktionen>['verlaufSchrittUndOeffnen'];
  verlaufBedienung: ReturnType<typeof useVerlaufSteuerung>['verlaufBedienung'];
  verlaufAktivierung: ReturnType<typeof useVerlaufSteuerung>['verlaufAktivierung'];
  onUebersichtOeffnen: () => void;
  onOeffnenOverlayUmschalten: () => void;
}
