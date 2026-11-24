// StrukturKontextLeiste.tsx
// Reine Darstellungskomponente für den oben im Gesetzes-View angezeigten
// strukturellen Kontext der aktuell sichtbaren Norm: die Kette der
// übergeordneten Überschriften (z. B. "1" → "1.4" → "1.4.3"), sofern diese
// gerade nicht selbst im Viewport zu sehen sind. Die komplette Scroll-
// Auswertung, Anticipation-Logik und Höhen-Polster-Mechanik lebt in
// useStrukturKontext.ts (siehe dort) – diese Datei konsumiert nur noch
// den fertigen pfad sowie effektiveHoehe/hoeheAnimiert und kennt selbst
// keine Scroll- oder Polster-Details mehr.
//
// Die Leiste ist ein SCHWEBENDES Element (position: absolute) über dem
// Scroll-Container von Gesetzestextansicht.tsx, nicht Teil dessen Layoutflusses
// – siehe Kopf-Kommentar von useStrukturKontext.ts für die Details dazu,
// warum das keine Scroll-Kompensation braucht und welche zwei Höhen
// (echte/effektive) dabei im Spiel sind.

import {
  STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT,
  STRUKTURKONTEXTLEISTE_GROESSE_WERTE,
} from '@/lib/stil/gesetzTextDarstellung';
import { useEffect, useLayoutEffect, useRef, type ReactElement } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { ueberschriftVollTitel, normVollTitel } from '@/lib/domain/gesetzDarstellungAuswertung';
import {
  STANDARD_RAND_INLINE,
  TEXT_SPALTE_BREITE,
  berechneTitelEinzug,
} from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';

import type { StrukturKontextLeisteProps } from './Ansichtssteuerung.types';
// Optischer Auslauf des Schattens, ohne Einfluss auf Messung oder Scrollhöhe.
const SCHATTENRAUM = 6;

export function StrukturKontextLeiste({
  modell,
  schrift,
  skalierungsFaktor = STRUKTURKONTEXTLEISTE_GROESSE_WERTE[STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT],
  randInline = STANDARD_RAND_INLINE,
  minimalistischerModus = false,
  maxBreite = TEXT_SPALTE_BREITE,
}: StrukturKontextLeisteProps) {
  const {
    pfad,
    effektiveHoehe,
    hoeheAnimiert,
    bereit,
    waehleEintrag: onKlick,
    meldeGemesseneHoehe,
  } = modell;
  // innenRef misst die natürliche (echte) Höhe des aktuellen Pfads. Der
  // eigentliche Hintergrund/Rahmen-Kasten sitzt unverändert INNERHALB dieses
  // Divs und ist dadurch immer nur so hoch wie sein Inhalt, auch wenn der
  // äußere Wrapper (s.u.) dank Polster gerade höher ist – der Bereich
  // zwischen Kasten-Unterkante und Wrapper-Unterkante bleibt dann einfach
  // leer, der Trennstrich/Schatten sitzt also weiterhin direkt unter der
  // untersten Überschrift, nicht am Wrapper-Ende.
  const innenRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // Ein neuer sichtbarer Pfad braucht seine echte Höhe im selben Paint;
    // der nachgelagerte ResizeObserver bleibt für reine Breitenänderungen.
    meldeGemesseneHoehe(innenRef.current?.offsetHeight ?? 0);
  }, [pfad, meldeGemesseneHoehe]);

  // ResizeObserver statt useLayoutEffect: ein reiner Breiten-Resize des
  // Fensters löst KEINEN Re-Render dieser Komponente aus (pfad ändert sich
  // dabei nicht), der Browser bricht Überschriften-Text aber ggf. neu um
  // und ändert dadurch die natürliche Höhe rein per CSS-Reflow – das war
  // per useLayoutEffect (gebunden an [pfad]) nicht erkennbar. Der
  // ResizeObserver erkennt echte Box-Größenänderungen unabhängig davon, ob
  // React überhaupt neu gerendert hat.
  useEffect(() => {
    const el = innenRef.current;
    if (!el) return;
    let frame: number | null = null;
    let beendet = false;
    const ro = new ResizeObserver(() => {
      if (beendet) return;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (beendet) return;
        const neueHoehe = innenRef.current?.offsetHeight ?? 0;
        meldeGemesseneHoehe(neueHoehe);
      });
    });
    ro.observe(el);
    return () => {
      beendet = true;
      ro.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [meldeGemesseneHoehe]);

  const eintraege: ReactElement[] = pfad.map((eintrag, i) => {
    const istLetzter = i === pfad.length - 1;
    const farbe = istLetzter ? 'var(--text-primaer)' : 'var(--text-sekundaer)';
    const key = eintrag.ueberschrift?.id ?? eintrag.gliederungsartikel!.id;
    const label = eintrag.ueberschrift
      ? ueberschriftVollTitel(eintrag.ueberschrift)
      : normVollTitel(eintrag.gliederungsartikel!);
    return (
      <div
        key={key}
        onClick={() => onKlick(eintrag)}
        style={{
          fontSize: schrift * skalierungsFaktor,
          fontFamily: 'var(--schrift-text)',
          fontWeight: istLetzter ? 600 : 400,
          lineHeight: 1.2,
          paddingInlineStart: '1.2em',
          textIndent: '-1.2em',
          paddingBlock: 2,
          color: farbe,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--akzent)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = farbe;
        }}
      >
        <TextAnzeige text={label} />
      </div>
    );
  });

  return (
    <>
      {modell.messung ? (
        <div aria-hidden="true" style={{ visibility: 'hidden', pointerEvents: 'none' }}>
          <StrukturKontextLeiste
            modell={{
              ...modell,
              messung: undefined,
              pfad: modell.messung.pfad,
              bereit: false,
              effektiveHoehe: 0,
              meldeGemesseneHoehe: modell.messung.bestaetigen,
            }}
            schrift={schrift}
            skalierungsFaktor={skalierungsFaktor}
            maxBreite={maxBreite}
            randInline={randInline}
            minimalistischerModus={minimalistischerModus}
          />
        </div>
      ) : null}
      <div
        style={{
          position: 'absolute',
          pointerEvents: 'none',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1,
          overflow: 'hidden',
          height: effektiveHoehe + (pfad.length > 0 ? SCHATTENRAUM : 0),
          // Rein optische Glättung beim Scrollen (z. B. bei Mausrad-Scrolling,
          // das in diskreten Sprüngen statt kontinuierlich feuert) – wirkt
          // sich NICHT auf contentOffset aus, da useStrukturKontext.ts den
          // State-Wert direkt verwendet, nicht die tatsächlich gerade
          // gerenderte (ggf. noch animierende) Pixel-Höhe. Anders als die
          // früher entfernte Scroll-Kompensation ist diese Transition also
          // rein dekorativ und kann keine Rückkopplung mehr erzeugen. Nur
          // aktiv, wenn hoeheAnimiert true ist (echtes Scroll-Event) – sonst
          // (Mount, Tab-Wechsel, gezielter Sprung) springt die Höhe sofort
          // auf den Zielwert, ohne sichtbar hoch-/runterzuanimieren.
          transition: hoeheAnimiert ? 'height 120ms ease-out' : 'none',
          visibility: bereit ? 'visible' : 'hidden',
        }}
      >
        <div ref={innenRef} style={{ pointerEvents: 'auto' }}>
          {pfad.length > 0 && (
            <div
              style={{
                background: 'var(--bg-haupt)',
                borderBottom: '1px solid var(--rahmen)',
                boxShadow: '0 2px 4px var(--strukturkontextleiste-schatten)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', paddingInline: randInline }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    width: '100%',
                    maxWidth: maxBreite,
                    paddingLeft: berechneTitelEinzug(minimalistischerModus, schrift),
                    paddingBlock: 8,
                  }}
                >
                  {eintraege}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
