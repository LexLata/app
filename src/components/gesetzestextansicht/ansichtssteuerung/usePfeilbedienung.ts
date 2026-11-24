// usePfeilbedienung.ts
// Pfeiltasten der Gesetzestextansicht: Hoch/Runter scrollen zeilenweise, mit Modifikator und
// Links/Rechts wählen sie über die Struktur ein Ziel, das als Zielauftrag angenommen wird.
// Aus useAnsichtssteuerung.ts ausgelagert, ohne Verhaltensänderung.
import { useEffect, type RefObject } from 'react';
import type { AnsichtssteuerungOptionen } from './Ansichtssteuerung.types';
import type { StrukturMomentaufnahme, useStrukturZustand } from './struktur/struktur.index';
import type { ScrollAuftrag, ScrollSteuerung } from './scrollen/scrollen.index';
import { SCHRIFTGROESSE_DEFAULT, ZEILENABSTAND_DEFAULT } from '@/lib/stil/gesetzTextDarstellung';

export function usePfeilbedienung(optionen: {
  aktuellRef: RefObject<AnsichtssteuerungOptionen>;
  bedienungRef: RefObject<{
    struktur: ReturnType<typeof useStrukturZustand>;
    scrollen: ScrollSteuerung;
  }>;
  containerRef: RefObject<HTMLDivElement | null>;
  aktivierungsartRef: RefObject<'sprung' | 'schritt' | 'nachfuehrung'>;
  setZielauftrag: (
    ziel: { vorbereitungsStand: StrukturMomentaufnahme; auftrag: ScrollAuftrag } | null,
  ) => void;
}) {
  const { aktuellRef, bedienungRef, containerRef, aktivierungsartRef, setZielauftrag } = optionen;
  useEffect(() => {
    const h = (event: KeyboardEvent) => {
      const hochRunter = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      if (!istPfeilbedienung(event)) return;
      if (aktuellRef.current.einfuehrungSperren?.normAuswahlGesperrt) return;
      if (document.querySelector('[data-overlay-aktiv]')) return;
      if (istEingabeFokussiert()) return;
      const { struktur: s, scrollen: scroll } = bedienungRef.current;
      if (s.sichtbareElemente.length === 0) return;
      event.preventDefault();
      aktuellRef.current.onBedienung?.();
      scroll.bereiteAuftragVor();
      if (hochRunter && !event.altKey && !event.metaKey && !event.ctrlKey) {
        setZielauftrag(null);
        scroll.beendeAuftragOhneZiel();
        const opts = aktuellRef.current;
        const schritt =
          (opts.schriftgroesse ?? SCHRIFTGROESSE_DEFAULT) *
          (opts.zeilenabstand ?? ZEILENABSTAND_DEFAULT) *
          3;
        containerRef.current?.scrollBy({
          top: event.key === 'ArrowUp' ? -schritt : schritt,
          behavior: 'instant',
        });
        return;
      }
      const richtung = pfeilRichtungen[event.key]!;
      aktivierungsartRef.current = richtung === 'links' ? 'sprung' : 'schritt';
      const ziel = s.fuehrePfeilaktionAus(richtung, {
        shift: event.shiftKey,
        alt: event.altKey,
        meta: event.metaKey || event.ctrlKey,
      });
      if (ziel.zielId)
        setZielauftrag({
          vorbereitungsStand: s.momentaufnahme,
          auftrag: {
            art: 'sichtbar-machen',
            elementId: ziel.zielId,
            ...(hochRunter && (event.metaKey || event.ctrlKey)
              ? { ausrichtung: 'oben' as const }
              : {}),
          },
        });
      else {
        setZielauftrag(null);
        scroll.beendeAuftragOhneZiel();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [aktuellRef, bedienungRef, containerRef, aktivierungsartRef, setZielauftrag]);
}

function istEingabeFokussiert() {
  const focus = document.activeElement;
  return (
    focus instanceof HTMLInputElement ||
    focus instanceof HTMLTextAreaElement ||
    (focus instanceof HTMLElement && focus.isContentEditable)
  );
}

const pfeilRichtungen: Record<string, 'hoch' | 'runter' | 'links' | 'rechts'> = {
  ArrowUp: 'hoch',
  ArrowDown: 'runter',
  ArrowLeft: 'links',
  ArrowRight: 'rechts',
};

function istPfeilbedienung(event: KeyboardEvent): boolean {
  const hochRunter = event.key === 'ArrowUp' || event.key === 'ArrowDown';
  const linksRechts = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
  if (!hochRunter && !linksRechts) return false;
  if ([event.metaKey, event.ctrlKey, event.altKey, event.shiftKey].filter(Boolean).length > 1)
    return false;
  if (hochRunter) return !event.shiftKey;
  return !event.altKey && !event.metaKey && !event.ctrlKey;
}
