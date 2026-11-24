// VolltextSucheOverlay.tsx
// Volltextsuche – zwei Modi:
//   • Einzel-Modus (⌘F):     durchsucht nur das aktive Gesetz, zeigt § ohne Kürzel
//   • Alle-Modus  (⌘⇧F):    durchsucht alle importierten Gesetze, zeigt § + Kürzel
//
// Suchlogik:
//   - Groß-/Kleinschreibung wird ignoriert.
//   - Fuzzy: Alle Tokens müssen irgendwo in derselben Norm vorkommen
//     (Teilstring-Match, nicht unbedingt zusammenhängend).
//   - Durchsucht: § Bezeichnung, § Titel, alle Absätze/Sätze/Listeneinträge
//     sowie Texte vorangehender Überschriften.

import { Checkbox } from '@/components/Checkbox';
import { UeberlagerterScrollbereich } from '@/components/scrollbereich/UeberlagerterScrollbereich';
import { TextAnzeige, type HervorhebungsBereich } from '@/components/textanzeige/textanzeige.index';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { OverlayRahmen, OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { SuchleisteKopf } from '@/components/overlays/suche/SuchleisteKopf';
import { SuchleisteKeinErgebnis } from '@/components/overlays/suche/SuchleisteKeinErgebnis';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert, zeilePadding } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { messeSync } from '@/lib/utils/perfMessung';
import {
  type SuchtextEintrag,
  baueSuchIndexFuerGesetz,
  tokenisiere,
  normMatchtTokens,
  extrahiereKontext,
} from '@/components/overlays/suche/VolltextSucheOverlay.helpers';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GemeinsameVolltextSucheProps {
  onSchliessen: () => void;
  /**
   * Wird bei Klick/Enter auf einen Treffer nach onSchliessen aufgerufen.
   * Der Aufrufer navigiert; das Overlay ändert keine Tabs.
   * Im Einzel-Modus ist `gesetz` immer dasselbe wie der Prop;
   * im Alle-Modus kann es jedes importierte Gesetz sein.
   */

  /** "Minimalistischer Modus" (Einstellungen.tsx): blendet die
   *  Modus-Umschaltzeile aus. Default false. */
  minimalistischerModus?: boolean;
  /**
   * Wechselt zwischen Einzel- und Alle-Modus (steuert aktivesOverlay in
   * App.tsx – siehe OverlayHost.tsx). Wird nur gesetzt, wenn ein Wechsel
   * gerade möglich ist (im Alle-Modus z. B. nur bei offenem Tab mit Gesetz);
   * bei undefined wird die Umschaltzeile nicht gerendert.
   */
  onModusUmschalten?: () => void;
}

/** Volltextsuche in genau einem Gesetz oder einer Liste; beide Eingaben sind exklusiv. */
export type VolltextSucheOverlayProps = GemeinsameVolltextSucheProps &
  (
    | {
        gesetz: GesetzDarstellung;
        suchstand?: never;
        onNormNavigieren: (gesetz: GesetzDarstellung, normXmlId: string) => void;
      }
    | {
        suchstand: import('./useVolltextSuchtext').VolltextSuchstand;
        gesetz?: never;
        onNormNavigieren: (gesetz: Gesetzesreferenz, normXmlId: string) => void;
      }
  );

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export function VolltextSucheOverlay(props: VolltextSucheOverlayProps) {
  const {
    gesetz,
    suchstand,
    onSchliessen,
    minimalistischerModus = false,
    onModusUmschalten,
  } = props;
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const alleGesetzesModus = suchstand !== undefined;
  const navigieren = useCallback(
    (referenz: Gesetzesreferenz, xmlId: string) => {
      if (props.gesetz) props.onNormNavigieren(props.gesetz, xmlId);
      else props.onNormNavigieren(referenz, xmlId);
    },
    [props],
  );

  const [suchtext, setSuchtext] = useState('');
  const [markierterIndex, setMarkierterIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);

  // Suchindex einmalig aufbauen – abhängig vom Modus
  const suchIndex = useMemo(
    (): SuchtextEintrag[] =>
      messeSync(
        'suchIndex.bauen',
        () => {
          if (suchstand !== undefined) return suchstand.eintraege;
          return baueSuchIndexFuerGesetz(gesetz);
        },
        (index) => `${index.length} Einträge`,
      ),
    [suchstand, gesetz],
  );

  // Treffer berechnen
  const treffer = useMemo(
    (): SuchtextEintrag[] =>
      messeSync(
        'suche.filtern',
        () => {
          const tokens = tokenisiere(suchtext);
          if (tokens.length === 0) return [];
          return suchIndex.filter((e) => normMatchtTokens(e.volltext, tokens));
        },
        (ergebnis) => `${ergebnis.length} Treffer`,
      ),
    [suchtext, suchIndex],
  );

  const tokens = useMemo(() => tokenisiere(suchtext), [suchtext]);

  // Fokus beim Öffnen
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  // Auswahl zurücksetzen beim Tippen
  useEffect(() => {
    setMarkierterIndex(0);
  }, [suchtext]);

  // Markiertes Element scrollen
  useEffect(() => {
    if (!listeRef.current) return;
    const el = listeRef.current.querySelector<HTMLElement>(`[data-idx="${markierterIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [markierterIndex]);

  const oeffneMarkiert = useCallback(() => {
    const eintrag = treffer[markierterIndex];
    if (!eintrag) return;
    onSchliessen();
    navigieren(eintrag.gesetz, eintrag.norm.xmlId);
  }, [treffer, markierterIndex, onSchliessen, navigieren]);

  // Tastatursteuerung
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setMarkierterIndex((i) => Math.max(0, i - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setMarkierterIndex((i) => Math.min(treffer.length - 1, i + 1));
          break;
        case 'Enter':
          e.preventDefault();
          oeffneMarkiert();
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [oeffneMarkiert, treffer.length]);

  const sichtbareTreffer: SuchtextEintrag[] = treffer.slice(0, 200);
  const placeholder = alleGesetzesModus
    ? 'Text in allen Gesetzen suchen …'
    : 'Text im geöffneten Gesetz suchen …';

  return (
    <OverlayRahmen onSchliessen={onSchliessen} breite={OVERLAY_BREITE_GROSS} variante="suche">
      <>
        <SuchleisteKopf
          inputRef={inputRef}
          value={suchtext}
          onChange={setSuchtext}
          platzhalter={placeholder}
        />

        {/* ── Modus-Umschalter (nur bei leerem Suchfeld, außerhalb minimalistischem Modus) ── */}
        {!minimalistischerModus && !suchtext.trim() && !!onModusUmschalten && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: abstandRollen.standard,
              padding: `${pxSkaliert(9, uiFaktor)}px ${pxSkaliert(16, uiFaktor)}px`,
              fontSize: pxSkaliert(13, uiFaktor),
              color: 'var(--text-sekundaer)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <Checkbox checked={alleGesetzesModus} onChange={() => onModusUmschalten()} />
            <TextAnzeige text="Alle Gesetze durchsuchen" />
          </label>
        )}

        {!!suchstand && !suchstand.vollstaendig && (
          <TextAnzeige
            element="div"
            style={{ ...textRollen.hinweistext, padding: zeilePadding(uiFaktor) }}
            text={`Durchsucht ${suchstand.erledigt} von ${suchstand.gesamt} Gesetzen${suchstand.erledigt === suchstand.gesamt ? ' – Suchbestand unvollständig' : ' …'}`}
          />
        )}
        {/* ── Ergebnisliste ── */}
        {treffer.length > 0 && (
          <UeberlagerterScrollbereich ref={listeRef} beschriftung="Volltextsuche">
            <>
              {sichtbareTreffer.map((eintrag, idx) => (
                <TrefferZeile
                  key={`${gesetzesreferenzSchluessel(eintrag.gesetz)}:${eintrag.norm.xmlId}`}
                  idx={idx}
                  eintrag={eintrag}
                  tokens={tokens}
                  zeigeGesetz={alleGesetzesModus}
                  markiert={idx === markierterIndex}
                  onClick={() => {
                    setMarkierterIndex(idx);
                    onSchliessen();
                    navigieren(eintrag.gesetz, eintrag.norm.xmlId);
                  }}
                  onMausBewegung={() => setMarkierterIndex(idx)}
                />
              ))}
              {treffer.length > 200 && (
                <div
                  style={{
                    ...textRollen.hinweistext,
                    padding: zeilePadding(uiFaktor),
                    borderTop: '1px solid var(--rahmen)',
                  }}
                >
                  <TextAnzeige
                    text={`${treffer.length - 200} weitere Treffer – Suche verfeinern`}
                  />
                </div>
              )}
            </>
          </UeberlagerterScrollbereich>
        )}

        {/* ── Kein Ergebnis ── */}
        {treffer.length === 0 &&
          !!suchtext.trim() &&
          !!(suchstand === undefined || suchstand.vollstaendig) && (
            <SuchleisteKeinErgebnis text="Kein Treffer" />
          )}
      </>
    </OverlayRahmen>
  );
}

// ---------------------------------------------------------------------------
// TrefferZeile
// ---------------------------------------------------------------------------

interface TrefferZeileProps {
  idx: number;
  eintrag: SuchtextEintrag;
  tokens: string[];
  /** true im Alle-Modus: Gesetzeskürzel neben der § Bezeichnung anzeigen. */
  zeigeGesetz: boolean;
  markiert: boolean;
  onClick: () => void;
  /** Wird nur bei tatsächlicher Mausbewegung über der Zeile ausgelöst (nicht bei „stillstehendem" Hover). */
  onMausBewegung: () => void;
}

function TrefferZeile({
  idx,
  eintrag,
  tokens,
  zeigeGesetz,
  markiert,
  onClick,
  onMausBewegung,
}: TrefferZeileProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const kontext = useMemo(() => {
    // Vor der Darstellung wieder zusammenführen: UTF-16-Bereiche beziehen sich
    // auf den unveränderten Ausschnitt einschließlich vorhandener Ellipsen.
    let text = '';
    const hervorhebungen: HervorhebungsBereich[] = [];
    for (const segment of extrahiereKontext(eintrag.volltext, tokens)) {
      const von = text.length;
      text += segment.text;
      if (segment.hervorgehoben) hervorhebungen.push({ von, bis: text.length });
    }
    return { text, hervorhebungen };
  }, [eintrag.volltext, tokens]);

  return (
    <div
      data-idx={idx}
      onClick={onClick}
      onMouseMove={onMausBewegung}
      style={{
        padding: zeilePadding(uiFaktor),
        background: markiert ? 'color-mix(in srgb, var(--akzent) 14%, transparent)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.08s',
        borderBottom: '1px solid var(--rahmen)',
      }}
    >
      {/* § Bezeichnung  [Gesetzkürzel]  [Titel] */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: abstandRollen.kompakt,
          marginBottom: pxSkaliert(3, uiFaktor),
          minWidth: 0,
        }}
      >
        <TextAnzeige
          text={eintrag.norm.bezeichnung}
          style={{
            ...textRollen.standardtext,
            fontWeight: 700,
            color: 'var(--akzent)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        />
        {zeigeGesetz && (
          <TextAnzeige
            text={eintrag.gesetz.kurztitel}
            style={{
              ...textRollen.standardtextBetont,
              color: 'var(--akzent)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          />
        )}
        {!!eintrag.norm.titel && (
          <TextAnzeige
            text={eintrag.norm.titel}
            style={{
              ...textRollen.standardtext,
              color: 'var(--text-sekundaer)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          />
        )}
      </div>

      {/* Kontextausschnitt */}
      <TextAnzeige
        element="div"
        text={kontext.text}
        hervorhebungen={kontext.hervorhebungen}
        hervorhebungStil={{ color: 'var(--text-primaer)', fontWeight: 700 }}
        style={
          {
            ...textRollen.hinweistext,
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          } as React.CSSProperties
        }
      />
    </div>
  );
}
