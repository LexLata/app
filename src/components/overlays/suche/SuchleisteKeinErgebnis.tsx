// SuchleisteKeinErgebnis.tsx
// Gemeinsamer leerer Zustand beider Suchleisten; die Trennlinie gehört zum Kopf.

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { leererZustandPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';

interface SuchleisteKeinErgebnisProps {
  text: string;
  hinweis?: string;
}

export function SuchleisteKeinErgebnis({ text, hinweis }: SuchleisteKeinErgebnisProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: leererZustandPadding(uiFaktor),
        gap: abstandRollen.kompakt,
      }}
    >
      <svg
        width={pxSkaliert(28, uiFaktor)}
        height={pxSkaliert(28, uiFaktor)}
        viewBox="0 0 28 28"
        fill="none"
        style={{ color: 'var(--text-sekundaer)', opacity: 0.6 }}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
        <line
          x1="19"
          y1="19"
          x2="26"
          y2="26"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <line
          x1="9"
          y1="12"
          x2="15"
          y2="12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <TextAnzeige element="div" style={textRollen.leererZustandText} text={text} />
      {hinweis && <TextAnzeige element="div" style={textRollen.hinweistext} text={hinweis} />}
    </div>
  );
}
