// LinuxTitelleistenAbfrage.tsx
//
// Erscheint EINMALIG beim allerersten Start unter Linux (siehe App.tsx:
// gerendert, solange istLinux && linuxTitelleistenPraeferenz === null).
// Fragt, ob die native Fenstertitelleiste (sicherer Standard, da
// decorations:false unter Linux je nach X11/Wayland-Compositor nicht
// durchgängig zuverlässig ist – siehe useLinuxTitelleistenPraeferenz.ts) oder
// die App-eigene, mit macOS/Windows einheitliche Titelleiste verwendet
// werden soll. Kann jederzeit nachträglich in Einstellungen.tsx geändert
// werden (dort auch für andere Plattformen sichtbar, siehe
// usePlattformfremdeUiAnzeigen.ts).
//
// kannSchliessen=false: die Entscheidung ist über Escape/Backdrop-Klick
// nicht überspringbar – sonst bliebe linuxTitelleistenPraeferenz dauerhaft
// null und der Dialog erschiene bei jedem Start erneut. Titelzeile daher
// über OverlayKopfzeile OHNE Schließen-Kreuz (zeigeSchliessen=false) – Titel
// bleibt trotzdem einheitlich mit den übrigen Standardoverlays.

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { OverlayRahmen, OVERLAY_BREITE_KOMPAKT } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { overlayAussenPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';

/** Nicht überspringbare Auswahl; die Anwendung übernimmt Speicherung und Ausblenden. */
export interface LinuxTitelleistenAbfrageProps {
  /** Meldet die gewählte Titelleiste; der Aufrufer speichert sie und blendet die Abfrage aus. */
  onAuswahl: (praeferenz: 'nativ' | 'eigene') => void;
}

export function LinuxTitelleistenAbfrage({ onAuswahl }: LinuxTitelleistenAbfrageProps) {
  const buttonRollen = useButtonRollen();
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <OverlayRahmen
      onSchliessen={() => {}}
      breite={OVERLAY_BREITE_KOMPAKT}
      zIndex={2000}
      kannSchliessen={false}
    >
      <OverlayKopfzeile
        titel="Fenstertitelleiste"
        onSchliessen={() => {}}
        zeigeSchliessen={false}
      />
      <div
        style={{
          padding: overlayAussenPadding(uiFaktor),
          display: 'flex',
          flexDirection: 'column',
          gap: abstandRollen.gross,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <TextAnzeige
          element="div"
          style={{ ...textRollen.standardtext, lineHeight: 1.5 }}
          text="Gesetze kann entweder die native Titelleiste deines Systems verwenden, oder eine eigene, einheitliche Titelleiste mit Minimieren/Maximieren/ Schließen-Buttons direkt in der Tableiste. Je nach Linux-Distribution und Fenstermanager kann das Verhalten der eigenen Titelleiste (insbesondere Verschieben per Ziehen) variieren. Diese Auswahl lässt sich jederzeit in den Einstellungen ändern."
        />
        {/* Bewusste Abweichung von der buttonRollen-Kernaussage (siehe
            Kommentar dort): zwei gleichwertige, große Auswahl-Buttons ohne
            Primär/Sekundär-Hierarchie, daher auch Hintergrund/Gewicht lokal
            überschrieben, nicht nur Padding/borderRadius. Padding als
            Faktor-Override relativ zu BASIS_ROH (6px/16px) statt fester
            Pixelzahl, damit es weiterhin mit der UI-Größe skaliert. */}
        <div
          style={{ display: 'flex', gap: abstandRollen.gross, marginTop: pxSkaliert(6, uiFaktor) }}
        >
          <button
            type="button"
            onClick={() => onAuswahl('nativ')}
            style={{
              ...buttonRollen.sekundaer(),
              flex: 1,
              padding: buttonRollen.paddingFaktor(10 / 6, 12 / 16),
              borderRadius: pxSkaliert(8, uiFaktor),
              background: 'var(--bg-eingabe)',
              fontWeight: 500,
            }}
          >
            <TextAnzeige text="Native Titelleiste" />
          </button>
          <button
            type="button"
            onClick={() => onAuswahl('eigene')}
            style={{
              ...buttonRollen.primaer(),
              flex: 1,
              padding: buttonRollen.paddingFaktor(10 / 6, 12 / 16),
              borderRadius: pxSkaliert(8, uiFaktor),
              fontWeight: 500,
            }}
          >
            <TextAnzeige text="Eigene Titelleiste" />
          </button>
        </div>
      </div>
    </OverlayRahmen>
  );
}
