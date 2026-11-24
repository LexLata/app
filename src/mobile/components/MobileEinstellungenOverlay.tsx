// MobileEinstellungenOverlay.tsx
// Vollbild-Sheet für die mobilen Anzeige-Einstellungen (Schriftgröße Text,
// Schriftgröße Seitenleiste, Rand neben dem Text, Seitenleistengröße).
// State kommt komplett von außen (useMobileEinstellungen in MobileApp.tsx) –
// gleiches Prinzip wie Einstellungen.tsx am Desktop.

import { Checkbox } from '@/components/Checkbox';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import {
  RAND_MAX,
  RAND_MIN,
  SCHRIFT_MAX,
  SCHRIFT_MIN,
  SEITENLEISTEN_GROESSE_MAX,
  SEITENLEISTEN_GROESSE_MIN,
} from '@/mobile/useMobileEinstellungen';

interface MobileEinstellungenOverlayProps {
  schriftgroesse: number;
  onSchriftgroesseAendern: (wert: number) => void;
  randInline: number;
  onRandInlineAendern: (wert: number) => void;
  seitenleistenGroesse: number;
  onSeitenleistenGroesseAendern: (wert: number) => void;
  customTastaturAktiv: boolean;
  onCustomTastaturAktivAendern: (wert: boolean) => void;
  onSchliessen: () => void;
}

function SliderZeile({
  label,
  wert,
  einheit,
  min,
  max,
  onChange,
}: {
  label: string;
  wert: number;
  einheit: string;
  min: number;
  max: number;
  onChange: (wert: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <TextAnzeige
          style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primaer)' }}
          text={label}
        />
        <TextAnzeige
          style={{ fontSize: 13, color: 'var(--text-sekundaer)' }}
          text={`${wert}${einheit}`}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={wert}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', height: 32 }}
      />
    </div>
  );
}

export function MobileEinstellungenOverlay({
  schriftgroesse,
  onSchriftgroesseAendern,
  randInline,
  onRandInlineAendern,
  seitenleistenGroesse,
  onSeitenleistenGroesseAendern,
  customTastaturAktiv,
  onCustomTastaturAktivAendern,
  onSchliessen,
}: MobileEinstellungenOverlayProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--bg-haupt)',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--rahmen)',
          flexShrink: 0,
        }}
      >
        <TextAnzeige
          text="Einstellungen"
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-sekundaer)',
          }}
        />
        <TextAttributElement
          element="button"
          onClick={onSchliessen}
          aria-label="Schließen"
          style={{
            width: 44,
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            color: 'var(--text-primaer)',
            fontSize: 20,
          }}
        >
          <TextAnzeige text="✕" />
        </TextAttributElement>
      </div>

      <div
        style={{
          padding: '20px 16px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          overflowY: 'auto',
        }}
      >
        <SliderZeile
          label="Schriftgröße"
          wert={schriftgroesse}
          einheit=" pt"
          min={SCHRIFT_MIN}
          max={SCHRIFT_MAX}
          onChange={onSchriftgroesseAendern}
        />
        <TextAnzeige
          element="div"
          modus="zitat"
          text="§ 1 Beispieltext zur Vorschau der gewählten Schriftgröße."
          className="gesetz-text"
          style={{
            padding: '12px 14px',
            background: 'var(--bg-eingabe)',
            border: '1px solid var(--rahmen)',
            borderRadius: 8,
            fontSize: schriftgroesse,
            lineHeight: 1.6,
            color: 'var(--text-primaer)',
          }}
        />

        <SliderZeile
          label="Rand neben dem Text"
          wert={randInline}
          einheit=" px"
          min={RAND_MIN}
          max={RAND_MAX}
          onChange={onRandInlineAendern}
        />

        <SliderZeile
          label="Seitenleistengröße"
          wert={seitenleistenGroesse}
          einheit=" px"
          min={SEITENLEISTEN_GROESSE_MIN}
          max={SEITENLEISTEN_GROESSE_MAX}
          onChange={onSeitenleistenGroesseAendern}
        />

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            color: 'var(--text-primaer)',
            cursor: 'pointer',
          }}
        >
          <Checkbox checked={customTastaturAktiv} onChange={onCustomTastaturAktivAendern} />
          <TextAnzeige text="Eigene Tastatur zum Öffnen von Gesetzen und Normen" />
        </label>
        <TextAnzeige
          element="div"
          style={{ fontSize: 12, color: 'var(--text-sekundaer)', marginTop: -18 }}
          text="Zeigt eine an die deutsche Tastatur angelehnte Tastatur mit §-Sonderzeichen statt der System-Tastatur."
        />
      </div>
    </div>
  );
}
