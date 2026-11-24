// FensterEingabeFeld.tsx
//
// Gemeinsames Freitext-Eingabefeld für Kommentar-/Verweismarkierung-Fenster:
// Textarea mit automatischem Wachsen nach unten (kein Scrollen innerhalb
// des Felds selbst) – vorher in KommentarFormular.tsx und
// VerweismarkierungFormular.tsx praktisch wortgleich dupliziert (siehe
// Absprache Formular-Vereinheitlichung). `rows`/`minHeight` bleiben bewusst
// Props: Kommentar (mehrzeiliger, rows=2/minHeight=50) und Verweismarkierung
// (einzeiliger, rows=1/minHeight=30) unterscheiden sich hier tatsächlich,
// keine zufällige Abweichung.

import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useEffect, type RefObject } from 'react';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { eingabefeldPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';

interface FensterEingabeFeldProps {
  value: string;
  cursorAmEnde: boolean;
  disabled: boolean;
  /** Browser-Default-Zeilenzahl vor der ersten automatischen Höhenanpassung
   *  (siehe Kommentar oben: unterscheidet sich zwischen den beiden
   *  Verwendungsstellen). */
  rows: number;
  /** Mindesthöhe bei normaler UI-Größe; skaliert wie Schrift und Innenabstand. */
  minHeight: number;
  platzhalter?: string;
  /** Optionaler Hinweistext oberhalb des Felds (z.B. "Groß-/Kleinschreibung
   *  ist relevant" bei VerweismarkierungFenster). */
  hinweisText?: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (wert: string) => void;
  /** Enter (ohne ⇧) löst die Hauptaktion des Fensters aus, siehe
   *  Verwendungsstellen. */
  onEnter: () => void;
}

function hoeheAnpassen(feld: HTMLTextAreaElement) {
  // Während der Messung hält die Hülle die bisherige Höhe. Sonst schrumpft der
  // Formularbereich kurz, seine Scrollleiste verschwindet, und gemessen wird
  // mit größerer Breite – lange Texte bekämen zu wenige Zeilen.
  const huelle = feld.parentElement;
  if (huelle) huelle.style.minHeight = `${huelle.offsetHeight}px`;
  feld.style.height = 'auto';
  // scrollHeight enthält den Innenabstand, aber bei border-box nicht den
  // Rahmen. Ohne ihn fehlen unten Pixel, sobald die Mindesthöhe nicht greift.
  feld.style.height = `${feld.scrollHeight + feld.offsetHeight - feld.clientHeight}px`;
  if (huelle) huelle.style.minHeight = '';
}

export function FensterEingabeFeld({
  value,
  cursorAmEnde,
  disabled,
  rows,
  minHeight,
  platzhalter,
  hinweisText,
  textareaRef,
  onChange,
  onEnter,
}: FensterEingabeFeldProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const radiusRollen = useRadiusRollen();

  useEffect(() => {
    const t = setTimeout(() => {
      const feld = textareaRef.current;
      if (!feld) return;
      feld.focus();
      if (cursorAmEnde) feld.setSelectionRange(feld.value.length, feld.value.length);
    }, 50);
    return () => clearTimeout(t);
  }, [cursorAmEnde, textareaRef]);

  // Höhe beim Einblenden und nach einem Wechsel der UI-Größe wie im
  // onChange-Handler berechnen. Sonst bleibt die zuvor gesetzte Höhe trotz
  // geänderter Schrift- und Zeilenhöhe erhalten.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    hoeheAnpassen(el);
  }, [textareaRef, uiFaktor]);

  // Breitenänderung (z.B. ein- oder ausgeblendete Scrollleiste im
  // Formularbereich) ändert den Zeilenumbruch, also auch die nötige Höhe.
  // Nur auf die Breite reagieren: Die eigene Höhenänderung löst den
  // Beobachter ebenfalls aus.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    let breite = el.clientWidth;
    const beobachter = new ResizeObserver(() => {
      if (el.clientWidth === breite) return;
      breite = el.clientWidth;
      hoeheAnpassen(el);
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [textareaRef]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: abstandRollen.kompakt }}>
      {hinweisText ? (
        <TextAnzeige style={{ ...textRollen.hinweistext }} text={hinweisText} />
      ) : null}
      <TextAttributElement
        element="textarea"
        ref={textareaRef}
        value={value}
        disabled={disabled}
        rows={rows}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        placeholder={platzhalter}
        onChange={(e) => {
          onChange(e.target.value);
          // Dynamisches Wachsen nach unten: Höhe zurücksetzen, bevor
          // scrollHeight gemessen wird, sonst bliebe sie beim Verkürzen des
          // Texts auf der zuletzt gewachsenen Höhe stehen.
          hoeheAnpassen(e.target);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            // Enter löst die Hauptaktion aus (siehe Absprache) statt einen
            // Zeilenumbruch einzufügen – ⇧Enter bleibt als Fluchtweg für
            // einen tatsächlich gewünschten Umbruch (Standard-Konvention).
            e.preventDefault();
            e.stopPropagation();
            onEnter();
          }
        }}
        style={{
          ...textRollen.eingabetext,
          width: '100%',
          padding: eingabefeldPadding(uiFaktor),
          borderRadius: radiusRollen.standard,
          border: '1px solid var(--rahmen)',
          background: 'var(--bg-eingabe)',
          fontFamily: 'var(--schrift)',
          boxSizing: 'border-box',
          resize: 'none',
          overflow: 'hidden',
          minHeight: pxSkaliert(minHeight, uiFaktor),
          lineHeight: `${pxSkaliert(18, uiFaktor)}px`,
        }}
      />
    </div>
  );
}
