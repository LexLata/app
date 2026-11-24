// FensterLadeAnzeige.tsx
//
// Kurzer Lade-Zustand für Hilfsfenster (Verweismarkierung-/Kommentar-Fenster),
// solange deren Kontext (Prop-Übergabe beim Fenster-Öffnen) noch nicht
// eingetroffen ist – siehe VerweismarkierungFenster.tsx/KommentarFenster.tsx:
// `if (!kontext) return ...`. War zuvor in beiden Dateien identisch
// dupliziert und fest codiert (skalierte nicht mit der UI-Größe); jetzt
// eine Komponente, die von einem eigenen, lokalen UiGroesseProvider
// umschlossen aufgerufen wird (der reguläre Provider weiter unten im
// jeweiligen Fenster steht erst NACH diesem frühen Return).
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { useTextRollen } from '@/hooks/stil/useTextRollen';

export function FensterLadeAnzeige({ fehler }: { fehler?: string | null }) {
  const uiFaktor = useUiSkalierungsFaktor();
  const textRollen = useTextRollen();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: 'var(--bg-haupt)',
        color: 'var(--text-sekundaer)',
        fontFamily: 'var(--schrift)',
        fontSize: pxSkaliert(13, uiFaktor),
      }}
    >
      <TextAnzeige
        style={fehler ? textRollen.fehlertext : undefined}
        text={fehler || 'Wird geladen …'}
      />
    </div>
  );
}
