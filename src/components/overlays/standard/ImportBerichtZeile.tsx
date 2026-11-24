// ImportBerichtZeile.tsx
// Zeigt eine einheitliche Zeile für Meldungen im Importbericht an.

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { CSSProperties, ReactElement } from 'react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { pxSkaliert } from '@/lib/stil/paddingRollen';

export function ImportBerichtZeile({
  icon,
  iconFarbe,
  children,
  schriftgroesse = 13,
}: {
  icon: string;
  iconFarbe: CSSProperties['color'];
  children: ReactElement;
  schriftgroesse?: number;
}) {
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: abstandRollen.standard,
        fontSize: pxSkaliert(schriftgroesse, uiFaktor),
      }}
    >
      <TextAnzeige
        text={icon}
        style={{
          flexShrink: 0,
          marginTop: pxSkaliert(1, uiFaktor),
          color: iconFarbe,
          fontWeight: 600,
          width: pxSkaliert(12, uiFaktor),
          textAlign: 'center',
        }}
      />
      {children}
    </div>
  );
}
