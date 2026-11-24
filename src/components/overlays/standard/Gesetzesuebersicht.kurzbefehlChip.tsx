// Gesetzesuebersicht.kurzbefehlChip.tsx
//
// KurzbefehlChip – verwaltet den Recording-Zustand vollständig selbst.
// Tastatureingaben werden über tabIndex + onKeyDown abgefangen; durch
// e.nativeEvent.stopImmediatePropagation() erreichen sie weder den
// Gesetzesuebersicht-Handler noch App.tsx, solange der Chip fokussiert ist.
//
// Ausgelagert aus Gesetzesuebersicht.tsx (500-Zeilen-Richtwert): vollständig
// eigenständige, in sich geschlossene Präsentationskomponente – kennt nur
// schluessel/kurzbefehl und die vom Parent übergebenen Callbacks, hält keinen
// Zustand außerhalb ihrer selbst (Rekonfiguration der Zeile passiert im
// Parent über onRecordingStart/onRecordingStop).

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { useState, useEffect, useRef } from 'react';
import {
  type Gesetzeskurzbefehl,
  type SpeicherErgebnis,
  gesetzeskurzbefehlAlsText,
  gesetzeskurzbefehlVonEvent,
  speichereGesetzeskurzbefehl,
  loescheGesetzeskurzbefehl,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { badgePadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';

interface KurzbefehlChipProps {
  schluessel: string;
  gesetz: Gesetzesreferenz;
  kurzbefehl: Gesetzeskurzbefehl | null;
  /** Hover-Zustand der übergeordneten Zeile */
  rowHovered: boolean;
  /** Eine andere Zeile nimmt gerade auf → + Kurzbefehl ausblenden */
  anyRecording: boolean;
  onGesetzeskurzbefehleGeaendert: () => void;
  /** Zeile als selektiert markieren (beim Start des Recordings) */
  onSelektieren: () => void;
  /** Meldet dem Parent: diese Zeile nimmt auf */
  onRecordingStart: (id: string) => void;
  /** Meldet dem Parent: diese Zeile ist fertig */
  onRecordingStop: (id: string) => void;
}

export function KurzbefehlChip({
  schluessel,
  gesetz,
  kurzbefehl,
  rowHovered,
  anyRecording,
  onGesetzeskurzbefehleGeaendert,
  onSelektieren,
  onRecordingStart,
  onRecordingStop,
}: KurzbefehlChipProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const radiusRollen = useRadiusRollen();
  const [recording, setRecording] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const chipRef = useRef<HTMLDivElement>(null);

  function startRecording() {
    setFehler(null);
    setRecording(true);
    onSelektieren();
    onRecordingStart(schluessel);
  }

  function stopRecording() {
    setRecording(false);
    onRecordingStop(schluessel);
  }

  // Fokus setzen sobald Recording startet
  useEffect(() => {
    if (recording) chipRef.current?.focus();
  }, [recording]);

  // Capture-Phase-Listener während des Recordings:
  // Feuert VOR allen Bubble-Listenern (inkl. window-Handler in Gesetzesuebersicht),
  // sodass Tastatureingaben zuverlässig abgefangen werden.
  useEffect(() => {
    if (!recording) return;

    const handler = async (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();

      if (e.key === 'Escape') {
        setRecording(false);
        onRecordingStop(schluessel);
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        try {
          await loescheGesetzeskurzbefehl(gesetz);
          onGesetzeskurzbefehleGeaendert();
          setFehler(null);
        } catch (ausnahme) {
          console.error('Gesetzeskurzbefehl konnte nicht gelöscht werden:', gesetz, ausnahme);
          setFehler('Konnte nicht gespeichert werden');
        }
        setRecording(false);
        onRecordingStop(schluessel);
        return;
      }

      const k = gesetzeskurzbefehlVonEvent(e);
      if (!k) return; // nur Modifier gedrückt – warten

      // e.code zusätzlich übergeben: nötig für die schmale, code-basierte
      // Zusatzprüfung in istTastenkuerzelReserviert (siehe Kopfkommentar in
      // gesetzeskurzbefehlSpeicher.ts) – fängt ⌥-Tastenkürzel ab, bei denen e.key
      // layoutabhängig ein anderes Zeichen liefert als erwartet.
      try {
        const ergebnis: SpeicherErgebnis = await speichereGesetzeskurzbefehl(gesetz, k, e.code);
        if (ergebnis === 'ok') {
          onGesetzeskurzbefehleGeaendert();
          setFehler(null);
        } else {
          setFehler(ergebnis === 'reserviert' ? 'Von der App belegt' : 'Bereits vergeben');
        }
      } catch (ausnahme) {
        console.error('Gesetzeskurzbefehl konnte nicht gespeichert werden:', gesetz, ausnahme);
        setFehler('Konnte nicht gespeichert werden');
      }
      setRecording(false);
      onRecordingStop(schluessel);
    };

    window.addEventListener('keydown', handler, true /* capture */);
    return () => window.removeEventListener('keydown', handler, true);
  }, [recording, gesetz, schluessel, onGesetzeskurzbefehleGeaendert, onRecordingStop]);

  function handleBlur() {
    // Abbrechen wenn Fokus das Chip verlässt (z. B. Klick außerhalb)
    if (recording) stopRecording();
  }

  const base: React.CSSProperties = {
    ...textRollen.mikrotext,
    padding: badgePadding(uiFaktor),
    borderRadius: radiusRollen.klein,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    userSelect: 'none',
    lineHeight: '18px',
    minWidth: pxSkaliert(52, uiFaktor),
    textAlign: 'center',
    outline: 'none', // Fokus-Ring unterdrücken (eigenes Styling im recording-Zustand)
  };

  // 1. Aufnahme-Modus: fokussierbar für Blur-Erkennung; Tastatur via capture-Listener
  if (recording) {
    return (
      <TextAnzeige
        element="div"
        ref={chipRef}
        tabIndex={0}
        onBlur={handleBlur}
        style={{
          ...base,
          border: '1px solid var(--rahmen)',
          background: 'var(--bg-leiste)',
          color: 'var(--text-primaer)',
          cursor: 'default',
          minWidth: pxSkaliert(110, uiFaktor),
          overflow: 'hidden',
        }}
        text="Welche Tasten?"
      />
    );
  }

  // 2. Fehlermeldung – bleibt sichtbar bis zum nächsten Klick auf den Chip
  if (fehler) {
    return (
      <TextAnzeige
        element="div"
        title="Klicken, um es erneut zu versuchen"
        onClick={(e) => {
          e.stopPropagation();
          startRecording();
        }}
        style={{
          ...base,
          border: '1px solid var(--rahmen)',
          background: 'var(--bg-leiste)',
          color: 'var(--akzent-warnung)',
          cursor: 'pointer',
        }}
        text={fehler}
      />
    );
  }

  // 3. Kurzbefehl gesetzt – immer sichtbar, Hover-Effekt
  if (kurzbefehl) {
    return (
      <TextAnzeige
        element="div"
        title="Klicken, um Kurzbefehl zu ändern · Entf löscht es"
        onClick={(e) => {
          e.stopPropagation();
          startRecording();
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          ...base,
          border: '1px solid var(--rahmen)',
          background: hovered
            ? 'color-mix(in srgb, var(--akzent) 10%, var(--bg-leiste))'
            : 'var(--bg-leiste)',
          color: hovered ? 'var(--akzent)' : 'var(--text-sekundaer)',
          cursor: 'pointer',
        }}
        text={gesetzeskurzbefehlAlsText(kurzbefehl)}
      />
    );
  }

  // 4. Kein Kurzbefehl – bei Zeilen-Hover sichtbar (außer wenn eine andere Zeile aufnimmt)
  const sichtbar = rowHovered && !anyRecording;
  return (
    <TextAnzeige
      element="div"
      title="Klicken, um Kurzbefehl festzulegen"
      onClick={(e) => {
        e.stopPropagation();
        startRecording();
      }}
      style={{
        ...base,
        border: '1px dashed color-mix(in srgb, var(--text-primaer) 40%, transparent)',
        background: 'transparent',
        color: 'var(--text-primaer)',
        cursor: 'pointer',
        opacity: sichtbar ? 0.7 : 0,
        pointerEvents: sichtbar ? 'auto' : 'none',
        transition: 'opacity 0.1s',
      }}
      text="+ Kurzbefehl"
    />
  );
}
