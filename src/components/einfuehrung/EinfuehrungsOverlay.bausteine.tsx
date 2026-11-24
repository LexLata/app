// Darstellungsbausteine und Text-Tokens der Einführung; Positionierung bleibt im Overlay.

import { ZuklappenIcon } from '@/components/seitenleisten/seitenleisten.index';
import type { ReactElement } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useEinfuehrungsTextRollen } from './useEinfuehrungsTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { overlayKopfPadding, pxSkaliert } from '@/lib/stil/paddingRollen';

export const SPRECHBLASE_BREITE = 320;
export const EINFUEHRUNG_RAHMENDICKE = 3;

/** Zerlegt einen (bereits kürzel-ersetzten) Text in Zeilen/Tokens für die
 *  Anzeige. Getrennt von ersetzeTokens, weil hier JSX statt String entsteht
 *  (Tastenkürzel-Ersetzung bleibt reines String-Replace, da tastenkuerzelAnzeige bereits
 *  fertig formatierten Text liefert). */
function renderInline(text: string): ReactElement[] {
  const zeilen: string[] = text.split('\n');
  return zeilen.map((zeile, zi) => {
    const teile: string[] = zeile.split(/(\{[^}]+\})/g);
    return (
      <span key={zi}>
        {teile.map((teil, ti) => {
          if (teil === '{zuklappen}')
            return (
              <span
                key={ti}
                aria-hidden="true"
                style={{ display: 'inline-flex', verticalAlign: 'middle', color: 'var(--akzent)' }}
              >
                <ZuklappenIcon groesse="1em" />
              </span>
            );
          if (teil === '{zeiger}') return <ZeigerVorschau key={ti} />;
          return <TextAnzeige key={ti} text={teil} />;
        })}
        {zi < zeilen.length - 1 && <br />}
      </span>
    );
  });
}

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

export function Sprechblase({
  children,
  style,
  innerRef,
  breite = SPRECHBLASE_BREITE,
}: {
  children: ReactElement | ReactElement[];
  style: React.CSSProperties;
  innerRef?: React.RefObject<HTMLDivElement | null>;
  breite?: number;
}) {
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <div
      ref={innerRef}
      style={{
        position: 'absolute',
        width: breite,
        background: 'var(--bg-leiste)',
        border: `${EINFUEHRUNG_RAHMENDICKE}px solid var(--akzent-blass)`,
        borderRadius: pxSkaliert(10, uiFaktor),
        padding: overlayKopfPadding(uiFaktor),
        boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
        pointerEvents: 'auto',
        fontFamily: 'var(--schrift)',
        color: 'var(--text-primaer)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Haupttext({ text }: { text: string }) {
  const textRollen = useEinfuehrungsTextRollen();
  return (
    <div style={{ ...textRollen.standardtextBetont, lineHeight: 1.4 }}>{renderInline(text)}</div>
  );
}

export function Zusatztext({ text }: { text: string }) {
  const textRollen = useEinfuehrungsTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <div
      style={{
        ...textRollen.standardtext,
        color: 'var(--text-sekundaer)',
        marginTop: pxSkaliert(8, uiFaktor),
      }}
    >
      {renderInline(text)}
    </div>
  );
}

/** Kleine Vorschau des blauen Auswahl-Zeigers (siehe AktivZeiger in
 *  aktivZeiger.tsx) – em-basiert, damit sie sich
 *  unabhängig von der Schriftgröße stimmig in die Textzeile einfügt (siehe
 *  Projektkonvention für vertikale Korrekturen). */
function ZeigerVorschau() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '0.2em',
        height: '0.9em',
        borderRadius: '0.1em',
        background: 'var(--aktiv-element)',
        verticalAlign: 'middle',
        position: 'relative',
        top: '-0.05em',
        margin: '0 0.15em',
      }}
    />
  );
}
