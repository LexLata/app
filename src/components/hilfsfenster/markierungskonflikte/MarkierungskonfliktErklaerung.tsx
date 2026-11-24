// Markierungskonflikt-Erklärung: erst Bestätigen speichert den Lesestatus.
// Die Sichtbarkeit wird beim Öffnen festgelegt; ein Reset wirkt beim nächsten Öffnen.
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';
import { MARKIERUNGSKONFLIKT_ERKLAERUNG_GELESEN_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';

export function MarkierungskonfliktErklaerung({ children }: { children?: ReactElement }) {
  const [gelesen, setGelesen] = useLocalStorageState(
    MARKIERUNGSKONFLIKT_ERKLAERUNG_GELESEN_KEY,
    false,
    { parse: (roh) => roh === 'true' },
  );
  const [sichtbar, setSichtbar] = useState(!gelesen);
  const button = useRef<HTMLButtonElement>(null);
  const text = useTextRollen();
  const knoepfe = useButtonRollen();
  const abstand = useAbstandRollen();
  const radius = useRadiusRollen();
  useEffect(() => {
    if (!sichtbar) return;
    const vorher = document.activeElement;
    button.current?.focus();
    return () => {
      if (vorher instanceof HTMLElement) vorher.focus();
    };
  }, [sichtbar]);
  return (
    <>
      <div inert={sichtbar} style={{ display: 'contents' }}>
        {children}
      </div>
      {sichtbar ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="markierungskonflikt-erklaerung-titel"
          aria-describedby="markierungskonflikt-erklaerung-text"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'grid',
            placeItems: 'center',
            padding: abstand.gross,
            background: '#0006',
          }}
          onKeyDown={(ereignis) => {
            if (ereignis.key === 'Tab') {
              ereignis.preventDefault();
              button.current?.focus();
            }
          }}
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              color: 'var(--text-primaer)',
              borderRadius: radius.standard,
              padding: abstand.gross,
              maxWidth: '48ch',
              maxHeight: '100%',
              overflowY: 'auto',
              boxShadow: '0 8px 32px #0004',
            }}
          >
            <TextAnzeige
              element="div"
              id="markierungskonflikt-erklaerung-titel"
              style={text.standardtextBetont}
              text="Markierungskonflikte"
            />
            <TextAnzeige
              element="p"
              id="markierungskonflikt-erklaerung-text"
              style={text.standardtext}
              text="Wenn ein Gesetz aktualisiert wird, kann es passieren, dass die bestehenden Markierungen nicht mehr zur neuen Gesetzesfassung passen. Solche Markierungskonflikte werden von der App automatisch erkannt. Dieses Fenster dient dazu, die Konflikte zu beheben."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                ref={button}
                style={knoepfe.primaerKompakt()}
                onClick={() => {
                  setGelesen(true);
                  setSichtbar(false);
                }}
              >
                <TextAnzeige text="Verstanden" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
