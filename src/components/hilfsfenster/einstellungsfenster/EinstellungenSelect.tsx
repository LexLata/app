// EinstellungenSelect.tsx
// Stellt das einheitliche Auswahlfeld für die Einstellungen bereit.

import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import type { CSSProperties, ComponentPropsWithRef, ReactElement } from 'react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { dropdownPadding } from '@/lib/stil/paddingRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import { useTextRollen } from '@/hooks/stil/useTextRollen';

type EinstellungenSelectProps = Omit<
  ComponentPropsWithRef<'select'>,
  'children' | 'dangerouslySetInnerHTML'
> & {
  children: ReactElement | ReactElement[];
  dangerouslySetInnerHTML?: never;
};

/** Einheitliches natives Auswahlfeld für Einstellungszeilen. */
export function EinstellungenSelect({
  style,
  disabled,
  children,
  dangerouslySetInnerHTML,
  ...props
}: EinstellungenSelectProps) {
  // Auch bei dynamischen Fremdprops dürfen HTML-Texte die Optionsanzeige nicht umgehen.
  void dangerouslySetInnerHTML;
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const radiusRollen = useRadiusRollen();
  const basisStil: CSSProperties = {
    ...textRollen.standardtext,
    padding: dropdownPadding(uiFaktor),
    borderRadius: radiusRollen.standard,
    border: '1px solid var(--rahmen)',
    background: 'var(--bg-eingabe)',
    cursor: disabled ? 'default' : 'pointer',
  };

  return (
    <TextAttributElement
      {...props}
      element="select"
      disabled={disabled}
      style={{ ...basisStil, ...style }}
    >
      {children}
    </TextAttributElement>
  );
}
