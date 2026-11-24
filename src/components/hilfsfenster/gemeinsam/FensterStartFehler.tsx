// FensterStartFehler.tsx
// Statische Ladefehleransicht vor dem Start der eigentlichen Hilfsfensterwurzel.
// Keine Kontextabholung oder Fachaktion; Sichtbarkeit und Schließen verwenden
// dieselben Hooks wie die regulären Hilfsfenster.

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useRef, useState } from 'react';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { fensterAussenPadding } from '@/lib/stil/paddingRollen';
import { useFensterSichtbarMachen } from '@/hooks/fenster/useFensterSichtbarMachen';
import { useSchliessenAnfrageSchliesstFenster } from '@/hooks/fenster/useSchliessenAnfrageSchliesstFenster';
import { useBeendenAnfrage } from '@/hooks/fenster/useBeendenAnfrage';
import { useAppAkzentfarbe } from '@/hooks/einstellungen/useAppAkzentfarbe';

interface Props {
  erneutVersuchen: () => Promise<boolean>;
}

function StartFehlerInhalt({ erneutVersuchen }: Props) {
  useFensterSichtbarMachen();
  useSchliessenAnfrageSchliesstFenster();
  // Ohne ungespeicherte Eingaben sofort bereit.
  useBeendenAnfrage();
  useAppAkzentfarbe();
  const faktor = useUiSkalierungsFaktor();
  const textRollen = useTextRollen();
  const buttonRollen = useButtonRollen();
  const abstandRollen = useAbstandRollen();
  const [laeuft, setLaeuft] = useState(false);
  const laeuftRef = useRef(false);
  async function wiederholen() {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setLaeuft(true);
    try {
      await erneutVersuchen();
    } finally {
      laeuftRef.current = false;
      setLaeuft(false);
    }
  }
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: abstandRollen.standard,
        padding: fensterAussenPadding(faktor),
        background: 'var(--bg-haupt)',
        color: 'var(--text-primaer)',
        fontFamily: 'var(--schrift)',
        minHeight: '100vh',
        boxSizing: 'border-box',
      }}
    >
      <TextAnzeige
        element="div"
        role="alert"
        style={textRollen.fehlertext}
        text="Die Oberfläche dieses Fensters konnte nicht geladen werden. Bitte versuchen Sie es erneut."
      />
      <button
        type="button"
        disabled={laeuft}
        onClick={() => void wiederholen()}
        style={{ ...buttonRollen.primaer(laeuft), alignSelf: 'flex-start' }}
      >
        <TextAnzeige text={laeuft ? 'Wird geladen …' : 'Erneut versuchen'} />
      </button>
    </main>
  );
}

export function FensterStartFehler(props: Props) {
  return (
    <UiGroesseProvider>
      <StartFehlerInhalt erneutVersuchen={props.erneutVersuchen} />
    </UiGroesseProvider>
  );
}
