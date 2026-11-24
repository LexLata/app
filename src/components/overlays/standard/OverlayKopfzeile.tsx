// OverlayKopfzeile.tsx
//
// Gemeinsame Titelzeile aller Standardoverlays: Icon + Titel + Schließen-
// Kreuz, randlose Trennlinie darunter. Vorher an 10 Stellen fast wortgleich
// dupliziert (nur Icon/Titel/Breite unterschieden sich tatsächlich) – siehe
// Absprache Overlay-Vereinheitlichung. NUR für Standardoverlays (siehe
// overlays/standard/): die beiden Suchleisten-Overlays (overlays/suche/)
// haben keine Titelzeile in diesem Sinn, ihre "Kopfzeile" ist das
// Sucheingabefeld selbst (siehe SuchleisteKopf.tsx).
//
// `icon` ist optional, damit LinuxTitelleistenAbfrage (kein fachliches Icon)
// dieselbe Komponente für Titel + Trennlinie nutzen kann, ohne ein Icon zu
// erfinden.

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { Icon } from '@phosphor-icons/react';
import { OverlaySchliessenButton } from '@/components/overlays/standard/OverlaySchliessenButton';
import { useTextRollen, useIconGroessen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { overlayKopfPadding } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';

interface OverlayKopfzeileProps {
  /** Phosphor-Icon-Komponente (nicht das JSX-Element selbst), damit Größe/
   *  Farbe/Gewicht hier zentral statt an jeder Verwendungsstelle gesetzt
   *  werden. z. B. `icon={Star}`. */
  icon?: Icon;
  titel: string | number;
  /** Schließen-Kreuz weglassen (z. B. LinuxTitelleistenAbfrage: die
   *  Entscheidung ist nicht überspringbar, siehe dortiger Kommentar).
   *  Standard: true. */
  zeigeSchliessen?: boolean;
  onSchliessen: () => void;
  /** Sperrt das Schließen-Kreuz optisch/funktional (z. B. während ein
   *  Import/Export läuft) – Standard: false. */
  schliessenDeaktiviert?: boolean;
}

export function OverlayKopfzeile({
  icon: Icon,
  titel,
  zeigeSchliessen = true,
  onSchliessen,
  schliessenDeaktiviert = false,
}: OverlayKopfzeileProps) {
  const textRollen = useTextRollen();
  const iconGroessen = useIconGroessen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: abstandRollen.standard,
        padding: overlayKopfPadding(uiFaktor),
        borderBottom: '1px solid var(--rahmen)',
        flexShrink: 0,
      }}
    >
      {Icon ? (
        <Icon size={iconGroessen.standard} weight="regular" color="var(--text-sekundaer)" />
      ) : null}
      <TextAnzeige style={{ ...textRollen.overlayUeberschrift, flex: 1 }} text={titel} />
      {zeigeSchliessen ? (
        <OverlaySchliessenButton onClick={onSchliessen} deaktiviert={schliessenDeaktiviert} />
      ) : null}
    </div>
  );
}
