// EinstellungenKategorieAbschnitt.tsx
// Gemeinsamer Wrapper für die vier Einstellungen-Hauptkategorien (Allgemein,
// Gesetzestext, Werkzeuge, Erweitert – siehe EinstellungenFenster.tsx). Vier
// echte Verwendungsstellen rechtfertigen die Abstraktion (Grundsatz:
// "abstrahiere erst beim zweiten Anwendungsfall").
//
// `id` dient zugleich als Sprungziel für EinstellungenSeitenleiste.tsx
// (scrollIntoView) und als Beobachtungsziel für
// useAktiverEinstellungenAbschnitt.ts (IntersectionObserver) – beide lesen
// dieselbe id über document.getElementById, daher hier bewusst ein simples
// <section id="…">, kein zusätzliches Ref-Weiterreichen nötig.

import type { ReactElement } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { OVERLAY_KOPF_VERTIKAL_ROH, pxSkaliert } from '@/lib/stil/paddingRollen';

interface EinstellungenKategorieAbschnittProps {
  id: string;
  titel: string;
  /** Erster Abschnitt bekommt keinen Trennstrich/zusätzlichen Abstand nach
   *  oben – er steht direkt am Fensterrand, eine Linie darüber hätte
   *  nichts, wovon sie trennt. */
  ersterAbschnitt?: boolean;
  children: ReactElement;
}

export function EinstellungenKategorieAbschnitt({
  id,
  titel,
  ersterAbschnitt = false,
  children,
}: EinstellungenKategorieAbschnittProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <section
      id={id}
      style={{
        scrollMarginTop: 4,
        // Trennstrich + Luft davor, wie bereits vor dem Zurücksetzen-Button
        // in ErweitertAbschnitt.tsx (gleiche Rolle wiederverwendet statt
        // eines neuen Rohwerts).
        borderTop: ersterAbschnitt ? undefined : '1px solid var(--rahmen)',
        paddingTop: ersterAbschnitt ? undefined : pxSkaliert(OVERLAY_KOPF_VERTIKAL_ROH, uiFaktor),
        paddingBottom: pxSkaliert(OVERLAY_KOPF_VERTIKAL_ROH, uiFaktor),
      }}
    >
      <div style={{ ...textRollen.overlayUeberschrift, paddingBottom: pxSkaliert(8, uiFaktor) }}>
        <TextAnzeige text={titel} />
      </div>
      {children}
    </section>
  );
}
