// GesetzTextScreen.tsx
//
// Hülle um Gesetzestextansicht (unverändert wiederverwendet, siehe Mobile-Plan
// Punkt 6 – Gesetzestextansicht ist bereits sauber in reines Rendering + optionale
// Interaktions-Props getrennt, keine Markierungs-/Rechtsklick-Logik greift
// ohne die entsprechenden Callback-Props, daher KEINE eigene
// Mobile-Rendering-Komponente nötig, kein Duplicate-before-abstract-Konflikt).
//
// v1: nur Anzeigen + Verweismarkierung-Klicks innerhalb der Gesetze auf dem Gerät navigieren
// (Ziel-Gesetz fehlt → einfacher Hinweis statt Banner-System, siehe unten).
// Keine Markierungen (markierungenDeaktiviert=true), keine Favoriten-Aktionen,
// kein Kontextmenü (kommt aus den bewusst nicht gesetzten Props on
// VerweisBearbeiten/onMarkierungLoeschen).

import type { VerweisKlickziel } from '@/lib/darstellung/darstellung.index';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import {
  SCHRIFTART_DEFAULT,
  ZEILENABSTAND_DEFAULT,
  BLOCKSATZ_DEFAULT,
  SILBENTRENNUNG_DEFAULT,
} from '@/lib/stil/gesetzTextDarstellung';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { useState } from 'react';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import { verweisZuXmlId } from '@/lib/domain/norm/norm.index';
import { MobileSeitenleiste } from '@/mobile/components/MobileSeitenleiste';

interface GesetzTextScreenProps {
  gesetz: GesetzDarstellung;
  initialNorm?: string;
  onZurueckZuOeffnen: () => void;
  onEinstellungenOeffnen: () => void;
  schriftgroesse: number;
  randInline: number;
  seitenleistenGroesse: number;
  /** Verweisziel liegt in einem anderen, bereits auf dem Gerät vorhandenen Gesetz –
   *  wechselt den angezeigten Screen-Zustand in MobileApp. */
  onAnderesGesetzOeffnen: (referenz: Gesetzesreferenz, bezeichnung: string) => void;
}

export function GesetzTextScreen({
  gesetz,
  initialNorm,
  onZurueckZuOeffnen,
  onEinstellungenOeffnen,
  schriftgroesse,
  randInline,
  seitenleistenGroesse,
  onAnderesGesetzOeffnen,
}: GesetzTextScreenProps) {
  const [aktuellerInitialNorm, setAktuellerInitialNorm] = useState(initialNorm);
  const [hinweis, setHinweis] = useState<string | null>(null);

  // Eigene Ziele werden unmittelbar aufgelöst; fremde Referenzen gehen an
  // den fensterlokalen Zugriff der mobilen Wurzel.
  function handleVerweisKlick(_ausgangsXmlId: string, zielnorm: VerweisKlickziel) {
    const zielReferenz =
      (zielnorm.typ === 'getaggterVerweis' ? zielnorm.zielgesetz : zielnorm.gesetz) ?? gesetz;
    const bezeichnung =
      zielnorm.typ === 'getaggterVerweis' ? zielnorm.zielBezeichnung : (zielnorm.bezeichnung ?? '');
    if (!istGleichesGesetz(gesetz, zielReferenz)) {
      onAnderesGesetzOeffnen(zielReferenz, bezeichnung);
      return;
    }
    const zielgesetz = gesetz;
    const zielXmlId = verweisZuXmlId(
      zielgesetz,
      zielnorm.typ === 'getaggterVerweis' ? zielnorm.zielBezeichnung : (zielnorm.bezeichnung ?? ''),
    );
    if (!zielXmlId) {
      zeigeHinweis('Norm nicht gefunden.');
      return;
    }
    setAktuellerInitialNorm(zielXmlId);
  }

  function zeigeHinweis(text: string) {
    setHinweis(text);
    setTimeout(() => setHinweis(null), 4000);
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'var(--bg-haupt)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 8px',
            flexShrink: 0,
            borderBottom: '1px solid var(--rahmen)',
          }}
        >
          <TextAttributElement
            element="button"
            onClick={onZurueckZuOeffnen}
            aria-label="Zurück"
            style={{
              width: 44,
              height: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: 'var(--text-primaer)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M12.5 4 6 10l6.5 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </TextAttributElement>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--text-primaer)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            <TextAnzeige text={gesetz.kurztitel} />
          </div>
        </div>

        {hinweis !== null && (
          <div
            style={{
              padding: '8px 16px',
              fontSize: 13,
              color: 'var(--text-sekundaer)',
              background: 'var(--bg-leiste)',
            }}
          >
            <TextAnzeige text={hinweis} />
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0 }}>
          <Gesetzestextansicht
            gesetz={gesetz}
            initialNorm={aktuellerInitialNorm}
            onInitialNormScrolled={() => setAktuellerInitialNorm(undefined)}
            markierungenDeaktiviert={true}
            schriftgroesse={schriftgroesse}
            schriftart={SCHRIFTART_DEFAULT}
            zeilenabstand={ZEILENABSTAND_DEFAULT}
            blocksatz={BLOCKSATZ_DEFAULT}
            silbentrennungAktiviert={SILBENTRENNUNG_DEFAULT}
            randInline={randInline}
            onVerweisKlick={(ausgangsXmlId, zielnorm) =>
              handleVerweisKlick(ausgangsXmlId, zielnorm)
            }
          />
        </div>
      </div>
      <MobileSeitenleiste
        onOeffnenOverlayOeffnen={onZurueckZuOeffnen}
        onEinstellungenOeffnen={onEinstellungenOeffnen}
        groesse={seitenleistenGroesse}
      />
    </div>
  );
}
