// Gemeinsame passive Anschlüsse für Integrationstests mit echter Hauptansicht.
import type { ComponentProps } from 'react';
import { useSeitenleistenStatus } from '@/hooks/useSeitenleistenStatus';
import { Hauptansicht } from '@/components/hauptfenster/Hauptansicht';
import type { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
const nichts = async () => {};
type Anschluesse = Pick<
  ComponentProps<typeof Hauptansicht>,
  | 'tabsteuerung'
  | 'verlaufSchrittUndOeffnen'
  | 'verlaufAktivierung'
  | 'verlaufBedienung'
  | 'navigation'
>;
export function HauptansichtFixture({
  lesezeichen,
  setFavoritenStatus,
  setKlappstufenStatus = nichts,
  einfuehrung,
  status,
  onOeffnenOverlayUmschalten,
  markierungenDeaktiviert = true,
  minimalistischerModus = true,
  leistenTauschen = false,
  seitenleistenTastenkuerzel = false,
  ...anschluesse
}: Anschluesse & {
  markierungenDeaktiviert?: boolean;
  minimalistischerModus?: boolean;
  leistenTauschen?: boolean;
  seitenleistenTastenkuerzel?: boolean;
  einfuehrung?: ComponentProps<typeof Hauptansicht>['einfuehrung'];
  status?: ComponentProps<typeof Hauptansicht>['status'];
  onOeffnenOverlayUmschalten?: () => void;
  lesezeichen: ReturnType<typeof useLesezeichenUndFavoriten>;
  setFavoritenStatus: ComponentProps<typeof Hauptansicht>['status']['setFavoritenStatus'];
  setKlappstufenStatus?: ComponentProps<typeof Hauptansicht>['status']['setKlappstufenStatus'];
}) {
  const eigenerStatus = useSeitenleistenStatus(true);
  return (
    <Hauptansicht
      fensterUebertragung={{
        handleTabHerausziehen: nichts,
        handleTabInFensterAufnehmen: nichts,
        fremdVorschauIndexRef: { current: null },
      }}
      lesezeichenSteuerung={lesezeichen}
      einfuehrung={
        einfuehrung ?? {
          einfuehrungTeilaktion: 0,
          einfuehrungAktiv: false,
          favoritSpeichernMitEinfuehrung: async () => {
            await lesezeichen.handleFavoritSpeichern();
          },
          lesezeichenSpeichernMitEinfuehrung: async () => {
            await lesezeichen.handleLesezeichenSpeichern();
          },
          meldeEinklappAenderung: nichts,
          leistenTauschenEffektiv: leistenTauschen,
          minimalistischerModusEffektiv: minimalistischerModus,
          einfuehrungErlaubtFuerUI: undefined,
          einfuehrungSperrenFuerGesetzestextansicht: undefined,
          einfuehrungFavoritErlaubtFuerGesetzestextansicht: true,
        }
      }
      markierungen={{
        handleUnterstreichen: nichts,
        handleHervorheben: nichts,
        handleMarkierungLoeschen: nichts,
      }}
      hilfsfenster={{
        handleVerweismarkierungAnfrage: nichts,
        handleVerweismarkierungBearbeiten: nichts,
        handleKommentarAnfrage: nichts,
        handleKommentarBearbeiten: nichts,
      }}
      darstellung={{
        seitenleistenTastenkuerzel,
        markierungenDeaktiviert,
        plattformfremdeUiAnzeigen: false,
        textDarstellung: {
          schriftgroesse: 16,
          leistenSchriftgroesse: 12,
          schriftart: 'sans',
          zeilenabstand: 1.6,
          satzNeuZeile: true,
          blocksatz: false,
          silbentrennung: false,
          randbreite: 'normal',
          strukturKontextLeisteGroesse: 'normal',
          lesbareZeilenlaenge: true,
          lesbareZeilenlaengeBreite: 'normal',
        },
      }}
      status={
        status ?? {
          favoritenStatus: eigenerStatus.favoritenStatus,
          klappstufenStatus: {
            aufklappen: nichts,
            zuklappen: nichts,
            kannAufklappen: false,
            kannZuklappen: true,
          },
          setFavoritenStatus: (s) => {
            eigenerStatus.setFavoritenStatus(s);
            setFavoritenStatus(s);
          },
          setKlappstufenStatus,
        }
      }
      onUebersichtOeffnen={nichts}
      onOeffnenOverlayUmschalten={onOeffnenOverlayUmschalten ?? nichts}
      {...anschluesse}
    />
  );
}
