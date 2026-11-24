// OverlayHost.tsx
//
// Rendert das aktive App-Overlay und verdrahtet seine Aktionen. Der Hook für
// die Alle-Gesetze-Volltextsuche lebt hier unabhängig vom kurzlebigen Overlay:
// Sein fensterlokaler Suchtext bleibt beim Schließen der Suche erhalten.
//
// Einstellungen ('einstellungen' als AktivesOverlay-Wert existiert seit der
// Umstellung auf ein eigenes Fenster nicht mehr) läuft komplett separat:
// eigenes Tauri-Fenster statt Overlay, siehe EinstellungenFenster.tsx
// (Fenster-Erzeugung: fenster/hilfsfenster.rs: einstellungen_fenster_oeffnen,
// Öffnen-Trigger: tauriHelpers.ts: einstellungenFensterOeffnen()).

import type { Suchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import type { RefObject } from 'react';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { EinklappZustand } from '@/lib/domain/appTypes';
import { istErlaubt } from '@/lib/domain/einfuehrung/einfuehrung.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import {
  useVolltextSuchtext,
  Gesetzesuebersicht,
  AktualisierenOverlay,
  GesetzInfoOverlay,
  OeffnenOverlay,
  VolltextSucheOverlay,
  FavoritenHinzufuegenOverlay,
  VerlaufOverlay,
  ExportOverlay,
  DateiImportOverlay,
  ImportindexOverlay,
  DatenschutzOverlay,
  UeberOverlay,
  TastenkuerzelOverlay,
} from '@/components/overlays/overlays.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type {
  AktivesOverlay,
  ElementOeffnenParams,
  SuchOverlayVorbelegung,
  Tab,
  TabVerlauf,
} from '@/lib/domain/appTypes';
import { leererVerlauf } from '@/lib/domain/app/tabVerlauf';
import type { Gesetzeskurzbefehl } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { useDateiImportZustand } from '@/lib/import-export/import-export.index';

import type { GesetzestextansichtProps } from '@/components/gesetzestextansicht/gesetzestextansicht.index';

interface AppOverlayHostProps {
  textDarstellung: Pick<GesetzestextansichtProps, 'schriftart' | 'zeilenabstand' | 'blocksatz'> &
    Required<Pick<GesetzestextansichtProps, 'satzNeuZeile'>> & {
      schriftgroesse: number;
      silbentrennung: boolean;
    };
  aktivesOverlay: AktivesOverlay | null;
  onSchliessen: () => void;
  suchverzeichniseintraege: Suchverzeichniseintrag[];
  suchverzeichnisWirdVorbereitet?: boolean;
  suchverzeichnisWirdAktualisiert?: boolean;
  ladeGesetz: GesetzLader;
  aktiverTab: Tab | null;
  aktivesGesetz?: GesetzDarstellung;
  einklappZustandRef: RefObject<Record<string, EinklappZustand>>;
  gesetzeskurzbefehle: Record<string, Gesetzeskurzbefehl>;
  oeffnenOverlayInitial: SuchOverlayVorbelegung;
  verlauf: TabVerlauf | undefined;
  verlaufNavigieren: ReturnType<
    typeof import('@/hooks/tabs/useAppTabs').useAppTabs
  >['verlaufNavigieren'];
  elementOeffnen: (params: ElementOeffnenParams) => void;
  gesetzesreferenzOeffnen: ReturnType<typeof useGesetzOeffnen>['gesetzesreferenzOeffnen'];
  /** "Minimalistischer Modus" (Einstellungen.tsx) – u. a. für die
   *  Modus-Umschaltzeile der Volltextsuche (siehe VolltextSucheOverlay.tsx). */
  minimalistischerModus: boolean;
  /** Wechselt zwischen den beiden Volltextsuche-Overlay-Typen
   *  ('volltextSuche' = Einzel-Gesetz, 'volltextAlle' = alle Gesetze). */
  onVolltextModusWechseln: (ziel: 'volltextSuche' | 'volltextAlle') => void;
  onLoeschen: (referenz: Gesetzesreferenz) => Promise<void>;
  onExportieren: (referenz: Gesetzesreferenz) => Promise<void>;
  onUebersichtExportAktionAnmelden: (aktion: (() => void) | null) => void;
  onDateienAbgelegt: (pfade: string[]) => void;
  onGesetzeskurzbefehleGeaendert: () => void;
  onNeuLadenNachImport: () => Promise<void>;
  /** Dateiimport benötigt einen ausdrücklich bestätigten Ladeabschluss. */
  onNeuLadenNachDateiImport?: (
    referenzen: readonly Gesetzesreferenz[],
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ) => Promise<void>;
  onInfoAktualisiert: (aktualisierteGesetze: GesetzDarstellung[]) => void;
  onDateiImportSchliessen: () => void;
  /** Wird VOR elementOeffnen aufgerufen, wenn ein Gesetz konkret über das
   *  Öffnen-Overlay geöffnet wird (Treffer- oder "neuer Tab"-Klick) – nutzt
   *  App.tsx, um Schritt 1→2 der Einführung (useEinfuehrung.ts) nur bei
   *  echter Navigation über die Suche abzuschließen, nicht bei jedem
   *  anderweitig schon offenen Gesetz (z. B. wiederhergestellte Tabs). */
  onOeffnenNavigation?: () => void;
  einfuehrungTeilaktion?: number;
  onKeineVerbindung?: (keineVerbindung: boolean) => void;
}

export function AppOverlayHost({
  textDarstellung,
  aktivesOverlay,
  onSchliessen,
  suchverzeichniseintraege: alleSuchverzeichniseintraege,
  suchverzeichnisWirdVorbereitet,
  suchverzeichnisWirdAktualisiert,
  ladeGesetz,
  aktiverTab,
  aktivesGesetz,
  einklappZustandRef,
  gesetzeskurzbefehle,
  oeffnenOverlayInitial,
  verlauf,
  verlaufNavigieren,
  elementOeffnen,
  gesetzesreferenzOeffnen,
  minimalistischerModus,
  onVolltextModusWechseln,
  onLoeschen,
  onExportieren,
  onUebersichtExportAktionAnmelden,
  onDateienAbgelegt,
  onGesetzeskurzbefehleGeaendert,
  onNeuLadenNachImport,
  onNeuLadenNachDateiImport,
  onInfoAktualisiert,
  onDateiImportSchliessen,
  onOeffnenNavigation,
  einfuehrungTeilaktion,
  onKeineVerbindung,
}: AppOverlayHostProps) {
  const suchverzeichniseintraege = alleSuchverzeichniseintraege.filter(
    (e) => e.status === 'in-ordnung',
  );
  const volltextSuchstand = useVolltextSuchtext(
    alleSuchverzeichniseintraege,
    suchverzeichnisWirdVorbereitet ?? true,
    ladeGesetz,
    aktivesOverlay === 'volltextAlle',
    suchverzeichnisWirdAktualisiert,
  );
  const dateiImportZustand = useDateiImportZustand();
  return (
    <>
      {aktivesOverlay === 'uebersicht' && (
        <Gesetzesuebersicht
          gesetze={suchverzeichniseintraege}
          wirdVorbereitet={suchverzeichnisWirdVorbereitet}
          onSchliessen={onSchliessen}
          onOeffnen={(gesetzesreferenz) =>
            gesetzesreferenzOeffnen({ gesetzesreferenz, nurInstalliert: true })
          }
          onLoeschen={onLoeschen}
          onExportieren={onExportieren}
          onExportAktionAnmelden={onUebersichtExportAktionAnmelden}
          onDateienAbgelegt={onDateienAbgelegt}
          gesetzeskurzbefehle={gesetzeskurzbefehle}
          onGesetzeskurzbefehleGeaendert={onGesetzeskurzbefehleGeaendert}
        />
      )}

      {aktivesOverlay === 'aktualisieren' && (
        <AktualisierenOverlay
          gesetze={suchverzeichniseintraege}
          wirdVorbereitet={suchverzeichnisWirdVorbereitet}
          onSchliessen={onSchliessen}
          onInfoAktualisiert={onInfoAktualisiert}
        />
      )}

      {aktivesOverlay === 'tastenkuerzel' && <TastenkuerzelOverlay onSchliessen={onSchliessen} />}

      {aktivesOverlay === 'datenschutz' && <DatenschutzOverlay onSchliessen={onSchliessen} />}

      {aktivesOverlay === 'ueber' && <UeberOverlay onSchliessen={onSchliessen} />}

      {aktivesOverlay === 'importindizes' && <ImportindexOverlay onSchliessen={onSchliessen} />}

      {aktivesOverlay === 'gesetzInfo' && !!aktivesGesetz && (
        <GesetzInfoOverlay gesetz={aktivesGesetz} onSchliessen={onSchliessen} />
      )}

      {aktivesOverlay === 'oeffnen' && (
        <OeffnenOverlay
          einfuehrungGesperrt={
            einfuehrungTeilaktion !== undefined &&
            !istErlaubt(einfuehrungTeilaktion, 'suche-schliessen')
          }
          onKeineVerbindung={onKeineVerbindung}
          gesetze={[]}
          aktivesGesetz={typeof oeffnenOverlayInitial === 'string' ? (aktivesGesetz ?? null) : null}
          aktivesElementId={
            typeof oeffnenOverlayInitial === 'string' && aktivesGesetz
              ? einklappZustandRef.current[
                  aktiverTab?.id + '-' + gesetzesreferenzSchluessel(aktivesGesetz)
                ]?.aktivesElementId
              : undefined
          }
          initialInput={
            typeof oeffnenOverlayInitial === 'string'
              ? oeffnenOverlayInitial
              : oeffnenOverlayInitial.suchtext
          }
          initialMeldung={
            typeof oeffnenOverlayInitial === 'string' ? undefined : oeffnenOverlayInitial.meldung
          }
          key={
            typeof oeffnenOverlayInitial === 'string'
              ? 'normal'
              : `${oeffnenOverlayInitial.suchtext}:${oeffnenOverlayInitial.meldung}`
          }
          onSchliessen={onSchliessen}
          onInstalliertOeffnen={(gesetzesreferenz, xmlId, neuerTab) => {
            onOeffnenNavigation?.();
            gesetzesreferenzOeffnen(
              {
                gesetzesreferenz,
                xmlId,
                nurInstalliert: true,
                ...(einfuehrungTeilaktion !== undefined &&
                istErlaubt(einfuehrungTeilaktion, 'suche-navigieren')
                  ? { favoritfaehigeStartnorm: true as const }
                  : {}),
              },
              neuerTab ? 'immer-neu' : 'aktiver-tab',
            );
          }}
          onGesetzOeffnen={(gesetz, normXmlId) => {
            onOeffnenNavigation?.();
            elementOeffnen({
              gesetz,
              xmlId: normXmlId,
              modus: 'aktiver-tab',
            });
          }}
          onNeuenTabOeffnen={(gesetz, normXmlId) => {
            onOeffnenNavigation?.();
            elementOeffnen({
              gesetz,
              xmlId: normXmlId,
              modus: 'immer-neu',
            });
          }}
          gesetzeskurzbefehle={gesetzeskurzbefehle}
        />
      )}

      {(aktivesOverlay === 'volltextAlle' ||
        (aktivesOverlay === 'volltextSuche' && !!aktivesGesetz)) &&
        (aktivesOverlay === 'volltextSuche' && aktivesGesetz ? (
          <VolltextSucheOverlay
            gesetz={aktivesGesetz}
            onSchliessen={onSchliessen}
            onNormNavigieren={(gesetz, normXmlId) =>
              elementOeffnen({ gesetz, xmlId: normXmlId, modus: 'aktiver-tab' })
            }
            minimalistischerModus={minimalistischerModus}
            onModusUmschalten={() => onVolltextModusWechseln('volltextAlle')}
          />
        ) : (
          <VolltextSucheOverlay
            suchstand={volltextSuchstand}
            onSchliessen={onSchliessen}
            onNormNavigieren={(gesetzesreferenz, normXmlId) =>
              gesetzesreferenzOeffnen({ gesetzesreferenz, xmlId: normXmlId, nurInstalliert: true })
            }
            minimalistischerModus={minimalistischerModus}
            onModusUmschalten={
              aktivesGesetz ? () => onVolltextModusWechseln('volltextSuche') : undefined
            }
          />
        ))}

      {aktivesOverlay === 'verlauf' && !!aktiverTab && (
        <VerlaufOverlay
          textDarstellung={textDarstellung}
          verlauf={verlauf ?? leererVerlauf()}
          ladeGesetz={ladeGesetz}
          onSchliessen={onSchliessen}
          onOeffnen={(gesetzesreferenz, normXmlId) => {
            verlaufNavigieren(
              aktiverTab.id,
              { gesetzesreferenz, xmlId: normXmlId },
              (ziel, melden) =>
                gesetzesreferenzOeffnen(
                  { ...ziel, ohneVerlauf: true },
                  'immer-aktiver-tab',
                  aktiverTab.id,
                  melden,
                ),
            );
          }}
          onNeuenTabOeffnen={(gesetzesreferenz, normXmlId) => {
            gesetzesreferenzOeffnen({ gesetzesreferenz, xmlId: normXmlId }, 'immer-neu');
          }}
        />
      )}

      {aktivesOverlay === 'favoritenHinzufuegen' && !!aktivesGesetz && (
        <FavoritenHinzufuegenOverlay gesetz={aktivesGesetz} onSchliessen={onSchliessen} />
      )}
      {aktivesOverlay === 'export' && (
        <ExportOverlay
          aktuellesGesetz={aktivesGesetz ? referenzVon(aktivesGesetz) : null}
          onSchliessen={onSchliessen}
        />
      )}

      {aktivesOverlay === 'dateiImport' && dateiImportZustand.art !== 'kein' && (
        <DateiImportOverlay
          zustand={dateiImportZustand}
          onSchliessen={onDateiImportSchliessen}
          onNeuLaden={onNeuLadenNachDateiImport ?? onNeuLadenNachImport}
        />
      )}
    </>
  );
}
