// CustomTastatur.tsx
//
// Rein visuelle, domänenfreie Tastatur-Komponente. Kennt keinen Suchtext,
// keine Gesetze – meldet Tastendrücke ausschließlich über Callbacks nach
// oben (Prinzip: Text-State bleibt exakt dort, wo er heute schon ist, siehe
// Plan). Dadurch an beliebigen Stellen der Mobile-App wiederverwendbar
// (v1: nur OeffnenScreen.tsx, siehe useCustomTastatur.ts).
//
// Diese Datei ist der Orchestrator: Container-Pointer-Weiterleitung (siehe
// Bugfix-Historie unten), Shift/Caps-Lock- und "§123 wird gehalten"-State,
// sowie das reine Zeilen-Layout (JSX). Ausgelagert:
// - CustomTastatur.layout.ts   – Zeichen-Reihen, Abstände, Zeitkonstanten
// - CustomTastatur.types.ts    – TastenHandle (gemeinsame Schnittstelle)
// - CustomTastatur.Taste.tsx   – einzelne Taste (Bubble, Long-Press, Wdh.)
// - CustomTastatur.ModusUmschaltTaste.tsx – §123/ABC-Sonderlogik
//
// Layout: normales deutsches QWERTZ-Layout (ü neben p, ö/ä neben l), darüber
// eine Zahlenreihe (1–0). ⇧ und ⌫ flankieren die y-x-c-v-b-n-m-Reihe, mit
// etwas Abstand (wie bei einer echten Tastatur). Zusätzlich eine
// Sonderzeichen-Ansicht (Umschalter unten links, #+=).
//
// Keine toten Zwischenräume, ohne die Tastengrößen zu verändern: die Tasten
// behalten ihre ursprüngliche Größe (echter CSS-`gap` zwischen ihnen). Der
// äußere Container fängt Pointer-Downs ab, die im Zwischenraum landen
// (weder auf einer Taste noch einem Popup), findet die nächstgelegene
// Taste und "spielt" den Tastendruck dort ab.
//
// Bugfix-Historie: ein früherer Versuch hat dafür ein synthetisches
// `PointerEvent` per `dispatchEvent` an die Ziel-Taste geschickt, die dann
// selbst `setPointerCapture` aufgerufen hat. Das hat auf echten Geräten
// nicht zuverlässig funktioniert – `setPointerCapture` etabliert nur für
// "vertrauenswürdige" (also tatsächlich vom Browser aus einer echten
// Touch-/Maus-Eingabe erzeugte) Pointer-IDs eine echte Capture. Das reale
// `pointerup` landete dadurch weiterhin auf dem Zwischenraum-Element statt
// auf der Taste, die dadurch "hängen blieb" (Bubble/Press-Hervorhebung
// verschwanden nicht mehr von selbst).
//
// Jetzt: der CONTAINER selbst ruft `setPointerCapture` auf sich selbst auf
// (mit der echten, vertrauenswürdigen pointerId aus seinem eigenen
// `onPointerDown`) – das funktioniert immer zuverlässig. Der Container
// steuert die gewählte Ziel-Taste dann direkt über eine kleine imperative
// Schnittstelle (`simulateDown/-Move/-Up/-Cancel`, siehe `registrieren`
// unten), statt ein Event zu simulieren.

import { useRef, useState } from 'react';
import type { TastenHandle } from './CustomTastatur.types';
import {
  ZAHLENREIHE,
  REIHE_1,
  REIHE_2,
  REIHE_3,
  ALTERNATIVEN,
  SONDERZEICHEN_REIHEN,
  DOPPELKLICK_SCHWELLE_MS,
  REIHEN_GAP,
  ZEILEN_GAP,
  RAND_TASTEN_GAP,
} from './CustomTastatur.layout';
import { Taste, ShiftIcon } from './CustomTastatur.Taste';
import { ModusUmschaltTaste } from './CustomTastatur.ModusUmschaltTaste';

interface CustomTastaturProps {
  onTaste: (zeichen: string) => void;
  onLoeschen: () => void;
  onFertig: () => void;
}

export function CustomTastatur({ onTaste, onLoeschen, onFertig }: CustomTastaturProps) {
  const [sonderzeichenAnsicht, setSonderzeichenAnsicht] = useState(false);
  const [umschaltAnsicht, setUmschaltAnsicht] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const letzterShiftTapRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const tastenMapRef = useRef(new WeakMap<HTMLButtonElement, TastenHandle>());
  const weiterleitungRef = useRef<{ pointerId: number; handle: TastenHandle } | null>(null);
  // Hält fest, ob §123/ABC gerade gehalten wird, und ob währenddessen eine
  // andere Taste benutzt wurde. Andere Tasten melden über
  // meldeTasteBenutzt() nur "benutzt = true" – sie lösen den Rücksprung
  // NICHT selbst aus. Der Rücksprung passiert ausschließlich, wenn §123
  // selbst losgelassen wird (siehe ModusUmschaltTaste.handleUp), und auch
  // dann nur, wenn "benutzt" true ist. Dadurch bleibt die Ansicht die
  // ganze Zeit über stabil, in der §123 gehalten wird – unabhängig davon,
  // was mit einem anderen Finger währenddessen getippt wird.
  const modusUmschaltRef = useRef<{ wechselZurueck: () => void; benutzt: boolean } | null>(null);

  function setzeModusHalten(wechselZurueck: () => void) {
    modusUmschaltRef.current = { wechselZurueck, benutzt: false };
  }

  function meldeTasteBenutzt() {
    if (modusUmschaltRef.current) {
      modusUmschaltRef.current.benutzt = true;
    }
  }

  /** Wird beim Loslassen/Abbrechen von §123 selbst aufgerufen: räumt auf und
   *  springt nur zurück, falls währenddessen tatsächlich eine andere Taste
   *  benutzt wurde. */
  function loescheModusHaltenUndPruefen() {
    const eintrag = modusUmschaltRef.current;
    modusUmschaltRef.current = null;
    if (eintrag?.benutzt) {
      eintrag.wechselZurueck();
    }
  }

  // Einfacher Tap schaltet Umschaltung um; Doppelklick (innerhalb von
  // DOPPELKLICK_SCHWELLE_MS) aktiviert Caps Lock; ein weiterer Tap bei
  // aktivem Caps Lock deaktiviert alles wieder.
  function onShiftGedrueckt() {
    const jetzt = Date.now();
    const istDoppelklick = jetzt - letzterShiftTapRef.current < DOPPELKLICK_SCHWELLE_MS;
    letzterShiftTapRef.current = jetzt;
    if (istDoppelklick) {
      setCapsLock(true);
      setUmschaltAnsicht(true);
    } else if (capsLock) {
      setCapsLock(false);
      setUmschaltAnsicht(false);
    } else {
      setUmschaltAnsicht((v) => !v);
    }
  }

  function registrieren(el: HTMLButtonElement, handle: TastenHandle) {
    tastenMapRef.current.set(el, handle);
  }

  function buchstabenReihe(basisZeichen: string[]) {
    return basisZeichen.map((b) => {
      const zeichen = umschaltAnsicht ? b.toUpperCase() : b;
      return (
        <Taste
          key={b}
          label={zeichen}
          onTaste={onTaste}
          alternativen={ALTERNATIVEN[b]}
          registrieren={registrieren}
          meldeTasteBenutzt={meldeTasteBenutzt}
        />
      );
    });
  }

  // Findet die nächstgelegene Taste zu einer Koordinate (für Taps im
  // Zwischenraum zwischen den Tasten).
  function naechsteTasteFinden(clientX: number, clientY: number): HTMLButtonElement | null {
    const tasten = containerRef.current?.querySelectorAll<HTMLButtonElement>('[data-custom-taste]');
    if (!tasten || tasten.length === 0) return null;
    let naechste: HTMLButtonElement | null = null;
    let kleinsteDistanz = Infinity;
    tasten.forEach((taste) => {
      const rect = taste.getBoundingClientRect();
      const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
      const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
      const distanz = dx * dx + dy * dy;
      if (distanz < kleinsteDistanz) {
        kleinsteDistanz = distanz;
        naechste = taste;
      }
    });
    return naechste;
  }

  function onContainerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const ziel = e.target as HTMLElement;
    if (ziel.closest('[data-custom-taste]')) return; // normaler Tastendruck läuft nativ am Button

    const naechste = naechsteTasteFinden(e.clientX, e.clientY);
    const handle = naechste ? tastenMapRef.current.get(naechste) : undefined;
    if (!handle) return;

    // Echte, vertrauenswürdige Pointer-Capture auf dem Container selbst
    // (funktioniert zuverlässig, siehe Bugfix-Kommentar oben).
    e.currentTarget.setPointerCapture(e.pointerId);
    weiterleitungRef.current = { pointerId: e.pointerId, handle };
    handle.simulateDown();
  }

  function onContainerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (weiterleitungRef.current?.pointerId === e.pointerId) {
      weiterleitungRef.current.handle.simulateMove(e.clientX, e.clientY);
    }
  }

  function onContainerPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (weiterleitungRef.current?.pointerId === e.pointerId) {
      weiterleitungRef.current.handle.simulateUp();
      weiterleitungRef.current = null;
    }
  }

  function onContainerPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (weiterleitungRef.current?.pointerId === e.pointerId) {
      weiterleitungRef.current.handle.simulateCancel();
      weiterleitungRef.current = null;
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onContainerPointerDown}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
      onPointerCancel={onContainerPointerCancel}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: ZEILEN_GAP,
        padding: '8px 6px calc(40px + env(safe-area-inset-bottom, 0px))',
        background: 'var(--tastatur-hintergrund-bg)',
        borderTop: '1px solid var(--rahmen)',
      }}
    >
      {sonderzeichenAnsicht ? (
        <>
          {SONDERZEICHEN_REIHEN.map((reihe, i) => (
            <div key={i} style={{ display: 'flex', gap: REIHEN_GAP }}>
              {reihe.map((z) => (
                <Taste
                  key={z}
                  label={z}
                  onTaste={onTaste}
                  registrieren={registrieren}
                  meldeTasteBenutzt={meldeTasteBenutzt}
                />
              ))}
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: REIHEN_GAP }}>
            {ZAHLENREIHE.map((z) => (
              <Taste
                key={z}
                label={z}
                onTaste={onTaste}
                registrieren={registrieren}
                meldeTasteBenutzt={meldeTasteBenutzt}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: REIHEN_GAP }}>{buchstabenReihe(REIHE_1)}</div>
          <div style={{ display: 'flex', gap: REIHEN_GAP }}>{buchstabenReihe(REIHE_2)}</div>
          <div style={{ display: 'flex', gap: RAND_TASTEN_GAP, alignItems: 'stretch' }}>
            <Taste
              label="⇧"
              icon={<ShiftIcon aktiv={umschaltAnsicht} capsLock={capsLock} />}
              breiteFaktor={1.5}
              zeigtBubble={false}
              onTaste={onShiftGedrueckt}
              registrieren={registrieren}
              meldeTasteBenutzt={meldeTasteBenutzt}
            />
            <div style={{ display: 'flex', gap: REIHEN_GAP, flex: 7 }}>
              {buchstabenReihe(REIHE_3)}
            </div>
            <Taste
              label="⌫"
              breiteFaktor={1.5}
              zeigtBubble={false}
              onTaste={onLoeschen}
              registrieren={registrieren}
              meldeTasteBenutzt={meldeTasteBenutzt}
              wiederholend
            />
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: REIHEN_GAP }}>
        <ModusUmschaltTaste
          label={sonderzeichenAnsicht ? 'ABC' : '#+='}
          breiteFaktor={1.5}
          onModusWechsel={() => setSonderzeichenAnsicht((v) => !v)}
          tastenMapRef={tastenMapRef}
          registrieren={registrieren}
          setzeModusHalten={setzeModusHalten}
          loescheModusHaltenUndPruefen={loescheModusHaltenUndPruefen}
        />
        <Taste
          label="Leerzeichen"
          breiteFaktor={4}
          unterbeschriftung
          zeigtBubble={false}
          onTaste={() => onTaste(' ')}
          registrieren={registrieren}
          meldeTasteBenutzt={meldeTasteBenutzt}
        />
        <Taste
          label="Fertig"
          breiteFaktor={2}
          unterbeschriftung
          zeigtBubble={false}
          onTaste={onFertig}
          registrieren={registrieren}
          meldeTasteBenutzt={meldeTasteBenutzt}
        />
      </div>
    </div>
  );
}
