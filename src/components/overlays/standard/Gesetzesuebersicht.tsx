// Gesetzesuebersicht.tsx
// Modal-Overlay: Gesetzesliste mit Auswahl, Import, Löschen (Delete-Taste), Export (⌘E).
// Außerdem: pro Zeile ein Kurzbefehl-Chip zum Einstellen von Gesetzeskurzbefehlen.

import {
  kurztitelVergleichsform,
  vergleicheNachKurztitelUndNormgeber,
} from '@/lib/domain/kurztitelVergleich';
import { UeberlagerterScrollbereich } from '@/components/scrollbereich/UeberlagerterScrollbereich';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { gesetzesreferenzSchluessel, referenzVon } from '@/lib/domain/gesetzesreferenz';
import { useState, useEffect, useRef, useCallback, type ReactElement } from 'react';
import { OverlayRahmen, OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { Gesetzeskurzbefehl } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { Gesetzeszeile } from './Gesetzesuebersicht.zeile';
import { usePlattform } from '@/hooks/utils/usePlattform';
import { bestimmeTastaturAktion } from '@/components/overlays/standard/Gesetzesuebersicht.tastatur';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import {
  eingabefeldPadding,
  pxSkaliert,
  OVERLAY_AUSSEN_ROH,
  zeilePadding,
  badgePadding,
  overlayKopfPadding,
} from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import { Books } from '@phosphor-icons/react';

/** Verwaltung der übergebenen Gesetze; Datenänderung und Navigation übernimmt der Aufrufer. */
export interface GesetzesuebersichtProps {
  gesetze: LesbarerSuchverzeichniseintrag[];
  wirdVorbereitet?: boolean;
  onSchliessen: () => void;
  /** Nach onSchliessen; der Aufrufer öffnet das Gesetz im Tab. */
  onOeffnen: (gesetz: Gesetzesreferenz) => void;
  /** Löscht über den Aufrufer; nach Erfüllung wird die lokale Auswahl geleert.
   * Ablehnungen werden hier nicht abgefangen; der Aufrufer verantwortet die Fehlerbehandlung. */
  onLoeschen: (referenz: Gesetzesreferenz) => Promise<void>;
  /** Exportiert über den Aufrufer ohne Schließen; Ablehnungen werden hier nicht abgefangen. */
  onExportieren: (referenz: Gesetzesreferenz) => Promise<void>;
  /** Übernimmt den gemeinsamen Exportbefehl bei Auswahl oder Sperre.
   * null gibt ihn ohne Auswahl und beim Schließen für das allgemeine Export-Overlay frei. */
  onExportAktionAnmelden: (aktion: (() => void) | null) => void;
  /** Per Drag-and-drop abgelegte Pfade; der Aufrufer startet den Datei-Import
   * (bzw. zeigt den laufenden) im eigenen Overlay. */
  onDateienAbgelegt: (pfade: string[]) => void;
  /** Alle gespeicherten Gesetzeskurzbefehle (aus App.tsx-State) */
  gesetzeskurzbefehle: Record<string, Gesetzeskurzbefehl>;
  /** Wird aufgerufen, nachdem ein Kurzbefehl gespeichert oder gelöscht wurde */
  onGesetzeskurzbefehleGeaendert: () => void;
}

export function Gesetzesuebersicht({
  gesetze,
  wirdVorbereitet = false,
  onSchliessen,
  onOeffnen,
  onLoeschen,
  onExportieren,
  onExportAktionAnmelden,
  onDateienAbgelegt,
  gesetzeskurzbefehle,
  onGesetzeskurzbefehleGeaendert,
}: GesetzesuebersichtProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const radiusRollen = useRadiusRollen();
  const abstandRollen = useAbstandRollen();
  const eingabeStyle: React.CSSProperties = {
    ...textRollen.standardtext,
    width: '100%',
    padding: eingabefeldPadding(uiFaktor),
    background: 'var(--bg-eingabe)',
    border: '1px solid var(--rahmen)',
    borderRadius: radiusRollen.standard,
    outline: 'none',
    boxSizing: 'border-box',
  };
  const { istMac } = usePlattform();
  const buttonRollen = useButtonRollen();
  const [suchtext, setSuchtext] = useState('');
  const [auswahlSchluessel, setAuswahlSchluessel] = useState<string | null>(null);
  const [hoverSchluessel, setHoverSchluessel] = useState<string | null>(null);
  const [dragAktiv, setDragAktiv] = useState(false);

  // Welches Gesetz nimmt gerade einen Kurzbefehl auf? (nur für Footer-Hinweis + anyRecording)
  // Die eigentliche Recording-Logik liegt im KurzbefehlChip selbst.
  const [aufnahmeSchluessel, setAufnahmeSchluessel] = useState<string | null>(null);

  const sucheRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    sucheRef.current?.focus();
  }, []);

  const passtZurSuche = (g: LesbarerSuchverzeichniseintrag, suchtext: string) => {
    const q = kurztitelVergleichsform(suchtext);
    return (
      kurztitelVergleichsform(g.kurztitel).includes(q) ||
      kurztitelVergleichsform(g.langtitel).includes(q)
    );
  };

  const gefiltert = gesetze
    .filter((g) => passtZurSuche(g, suchtext))
    .sort(vergleicheNachKurztitelUndNormgeber);

  const ausgewaehltesGesetz = gefiltert.find(
    (gesetz) => gesetzesreferenzSchluessel(gesetz) === auswahlSchluessel,
  );
  const aktionenGesperrt = aufnahmeSchluessel !== null;
  const handleOeffnen = useCallback(
    (gesetz = ausgewaehltesGesetz) => {
      if (!gesetz || aktionenGesperrt) return;
      onSchliessen();
      onOeffnen(referenzVon(gesetz));
    },
    [ausgewaehltesGesetz, aktionenGesperrt, onSchliessen, onOeffnen],
  );
  const handleExportieren = useCallback(() => {
    if (!ausgewaehltesGesetz || aktionenGesperrt) return;
    void onExportieren(referenzVon(ausgewaehltesGesetz));
  }, [ausgewaehltesGesetz, aktionenGesperrt, onExportieren]);
  const handleLoeschen = useCallback(() => {
    if (!ausgewaehltesGesetz || aktionenGesperrt) return;
    void onLoeschen(referenzVon(ausgewaehltesGesetz)).then(() => setAuswahlSchluessel(null));
  }, [ausgewaehltesGesetz, aktionenGesperrt, onLoeschen]);
  useEffect(() => {
    onExportAktionAnmelden(ausgewaehltesGesetz || aktionenGesperrt ? handleExportieren : null);
    return () => onExportAktionAnmelden(null);
  }, [ausgewaehltesGesetz, aktionenGesperrt, handleExportieren, onExportAktionAnmelden]);

  // Auswahl zurücksetzen wenn durch Suche rausgefiltert
  useEffect(() => {
    if (
      auswahlSchluessel &&
      !gesetze.some(
        (g) => gesetzesreferenzSchluessel(g) === auswahlSchluessel && passtZurSuche(g, suchtext),
      )
    ) {
      setAuswahlSchluessel(null);
    }
  }, [suchtext, gesetze, auswahlSchluessel]);

  // ---------------------------------------------------------------------------
  // Tastatur-Handler (Chip blockiert Ereignisse via nativeEvent.stopImmediatePropagation
  // während er den Fokus hat – dieser Handler muss das nicht extra prüfen)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const zielTag = e.target && 'tagName' in e.target ? e.target.tagName : null;
      const aktion = bestimmeTastaturAktion({
        taste: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        zielIstInput: zielTag === 'INPUT',
        auswahlSchluessel,
        gefilterteSchluessel: gefiltert.map((g) => gesetzesreferenzSchluessel(g)),
        // Während ein Chip aufnimmt, kümmert sich sein Capture-Listener um alle Tasten
        recordingAktiv: aufnahmeSchluessel !== null,
      });

      switch (aktion.typ) {
        case 'loeschen':
          e.preventDefault();
          handleLoeschen();
          break;
        case 'oeffnen':
          // Ein nativer Button aktiviert sich bei Enter selbst.
          if (zielTag !== 'BUTTON') handleOeffnen();
          break;
        case 'navigieren':
          e.preventDefault();
          if (aktion.neuerSchluessel) setAuswahlSchluessel(aktion.neuerSchluessel);
          break;
        case 'keine':
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [auswahlSchluessel, gefiltert, gesetze, handleOeffnen, handleLoeschen, aufnahmeSchluessel]);

  // Dateiimport per Drag-and-drop (ZIP oder Einzeldateien) auf die Gesetzesübersicht.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let beendet = false;
    void (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        const abmelden = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === 'over') {
            setDragAktiv(true);
            return;
          }
          if (event.payload.type === 'leave') {
            setDragAktiv(false);
            return;
          }
          if (event.payload.type === 'drop') {
            setDragAktiv(false);
            onDateienAbgelegt(event.payload.paths);
          }
        });
        if (beendet) abmelden();
        else unlisten = abmelden;
      } catch (fehler) {
        console.error('Drag&Drop-Import konnte nicht eingerichtet werden:', fehler);
      }
    })();
    return () => {
      beendet = true;
      unlisten?.();
    };
  }, [onDateienAbgelegt]);

  const gesetzZeilen: ReactElement[] = gefiltert.map((gesetz) => {
    const schluessel = gesetzesreferenzSchluessel(gesetz);
    return (
      <Gesetzeszeile
        key={schluessel}
        gesetz={gesetz}
        aktiv={schluessel === auswahlSchluessel}
        mausDarueber={schluessel === hoverSchluessel}
        andereAufnahmeAktiv={aufnahmeSchluessel !== null && aufnahmeSchluessel !== schluessel}
        kurzbefehl={gesetzeskurzbefehle[schluessel] ?? null}
        onSelektieren={() => setAuswahlSchluessel(schluessel)}
        onOeffnen={() => handleOeffnen(gesetz)}
        onHover={(aktiv) => setHoverSchluessel(aktiv ? schluessel : null)}
        onAufnahmeStart={setAufnahmeSchluessel}
        onAufnahmeStop={(beendet) =>
          setAufnahmeSchluessel((vorher) => (vorher === beendet ? null : vorher))
        }
        onGesetzeskurzbefehleGeaendert={onGesetzeskurzbefehleGeaendert}
      />
    );
  });

  const buttonsDeaktiviert = !ausgewaehltesGesetz || aktionenGesperrt;
  const aktionsButtonStil = {
    ...buttonRollen.sekundaerKompakt(buttonsDeaktiviert),
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: abstandRollen.kompakt,
  };

  return (
    <OverlayRahmen onSchliessen={onSchliessen} breite={OVERLAY_BREITE_GROSS}>
      {/* Titelzeile + eigene Suchzeile darunter – beide flexShrink:0, bleiben
            beim Scrollen der darunterliegenden Liste stehen (siehe Absprache:
            Suchfeld nicht mehr Teil der Titelzeile). */}
      <div style={{ flexShrink: 0 }}>
        <OverlayKopfzeile icon={Books} titel="Gesetze verwalten" onSchliessen={onSchliessen} />
        <div
          style={{ padding: overlayKopfPadding(uiFaktor), borderBottom: '1px solid var(--rahmen)' }}
        >
          <TextAttributElement
            element="input"
            ref={sucheRef}
            value={suchtext}
            onChange={(e) => setSuchtext(e.target.value)}
            placeholder="Suchen …"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={eingabeStyle}
          />
        </div>
      </div>

      {/* Liste */}
      <UeberlagerterScrollbereich beschriftung="Gesetzesübersicht">
        <>
          {gefiltert.length === 0 ? (
            <div
              style={{
                padding: `${pxSkaliert(24, uiFaktor)}px ${pxSkaliert(OVERLAY_AUSSEN_ROH, uiFaktor)}px`,
                ...textRollen.leererZustandText,
                textAlign: 'center',
              }}
            >
              <TextAnzeige
                text={
                  wirdVorbereitet
                    ? 'Gesetzesliste wird vorbereitet …'
                    : suchtext
                      ? 'Keine Treffer.'
                      : 'Noch keine Gesetze auf dem Gerät.'
                }
              />
            </div>
          ) : (
            gesetzZeilen
          )}
        </>
      </UeberlagerterScrollbereich>

      {/* Fußzeile */}
      <div
        style={{
          borderTop: '1px solid var(--rahmen)',
          padding: zeilePadding(uiFaktor),
          flexShrink: 0,
        }}
      >
        <div
          style={{
            ...textRollen.hinweistext,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: abstandRollen.gross,
          }}
        >
          <button
            disabled={buttonsDeaktiviert}
            onClick={() => handleOeffnen()}
            style={aktionsButtonStil}
          >
            <TextAnzeige text="Öffnen" />
            <Kbd text="↵" />
          </button>
          <button
            disabled={buttonsDeaktiviert}
            onClick={handleExportieren}
            style={aktionsButtonStil}
          >
            <TextAnzeige text="Exportieren" />
            <Kbd text={tastenkuerzelAnzeige('gesetzesuebersicht-export', istMac)} />
          </button>
          <button disabled={buttonsDeaktiviert} onClick={handleLoeschen} style={aktionsButtonStil}>
            <TextAnzeige text="Löschen" />
            <Kbd text="⌫" />
          </button>
        </div>
        {!!aufnahmeSchluessel && (
          <div style={{ ...textRollen.hinweistext, marginBottom: pxSkaliert(8, uiFaktor) }}>
            <TextAnzeige text="Tastenkombination drücken · " />
            <Kbd text="⌫" />
            <TextAnzeige text=" löscht den Kurzbefehl · " />
            <Kbd text="Esc" />
            <TextAnzeige text=" abbrechen" />
          </div>
        )}

        <>
          {!!dragAktiv && (
            <span style={{ ...textRollen.hinweistext }}>
              <TextAnzeige text="Datei(en) hier loslassen zum Importieren …" />
            </span>
          )}
        </>
      </div>
    </OverlayRahmen>
  );
}

// ---------------------------------------------------------------------------
// Kleine Hilfselemente
// ---------------------------------------------------------------------------

function Kbd({ text }: { text: string | number }) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <TextAnzeige
      element="kbd"
      text={text}
      style={{
        ...textRollen.mikrotext,
        padding: badgePadding(uiFaktor),
        borderRadius: pxSkaliert(3, uiFaktor),
        border: '1px solid var(--rahmen)',
        background: 'var(--bg-leiste)',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
      }}
    />
  );
}
