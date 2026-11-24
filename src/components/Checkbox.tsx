// Checkbox.tsx
// Echtes Eingabefeld mit CSS-Kästchen und dekorativem Haken.
import { TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { Check } from '@phosphor-icons/react';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { erzeugeCheckboxRolle } from '@/lib/stil/checkboxRolle';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}

export function Checkbox({
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: CheckboxProps) {
  const faktor = useUiSkalierungsFaktor();
  return (
    <span style={{ display: 'inline-flex', position: 'relative', flexShrink: 0 }}>
      <TextAttributElement
        element="input"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-label={ariaLabel}
        style={erzeugeCheckboxRolle(faktor, checked, disabled)}
      />
      {checked && (
        <Check
          weight="bold"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            transform: 'scale(0.8)',
            pointerEvents: 'none',
            color: '#fff',
            opacity: disabled ? 0.4 : 1,
          }}
        />
      )}
    </span>
  );
}
