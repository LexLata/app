// ZitatKopierenAbschnitt.tsx
// Einstellungen-Abschnitt: Formatierung des von "Zitat kopieren"
// (Auswahlleiste, siehe auswahlleiste.tsx)
// erzeugten Zitat-Strings – siehe zitatFormatierung.ts für die eigentliche
// Formatierungslogik.
//
// Checkbox-Zeilen nutzen EinstellungenCheckboxZeile.tsx (siehe dort –
// Vereinheitlichung der Zeilenhöhe/-abstände, vormals hier per lokal
// dupliziertem Label-Wrapper). marginTop der ersten Zeile bleibt bewusst 6
// (statt der sonst üblichen 10) – kompakterer Abstand direkt unter der
// Abschnitts-Überschrift, unverändert gegenüber vorher.

import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { EinstellungenCheckboxZeile } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenCheckboxZeile';

interface ZitatKopierenAbschnittProps {
  abkuerzungenAktiv: boolean;
  onAbkuerzungenAktivAendern: (wert: boolean) => void;
  ohnePunkt: boolean;
  onOhnePunktAendern: (wert: boolean) => void;
  roemischeAbsaetze: boolean;
  onRoemischeAbsaetzeAendern: (wert: boolean) => void;
}

export function ZitatKopierenAbschnitt({
  abkuerzungenAktiv,
  onAbkuerzungenAktivAendern,
  ohnePunkt,
  onOhnePunktAendern,
  roemischeAbsaetze,
  onRoemischeAbsaetzeAendern,
}: ZitatKopierenAbschnittProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <>
      <TextAnzeige
        element="div"
        style={{ ...textRollen.abschnittsUeberschrift, paddingBottom: pxSkaliert(4, uiFaktor) }}
        text={'Kopieren von Zitaten'}
      />

      {/* --- Option 1: Abkürzungen --- */}
      <EinstellungenCheckboxZeile
        marginTop={6}
        checked={abkuerzungenAktiv}
        onChange={onAbkuerzungenAktivAendern}
        text="Abkürzungen nutzen (Abs., Nr., S., lit., UAbs.)"
      />

      {abkuerzungenAktiv && (
        <>
          {/* --- Option 2: ohne Punkt --- */}
          <EinstellungenCheckboxZeile
            checked={ohnePunkt}
            onChange={onOhnePunktAendern}
            text="Abkürzungen ohne Punkt (Abs statt Abs.)"
          />

          {/* --- Option 3: römische Absätze --- */}
          <EinstellungenCheckboxZeile
            checked={roemischeAbsaetze}
            onChange={onRoemischeAbsaetzeAendern}
            text="Absätze als römische Zahlen (Abs. 1 → I)"
          />
          <TextAnzeige
            element="div"
            style={{ ...textRollen.hinweistext, marginTop: 0 }}
            modus="zitat"
            text={'Z.\u00a0B. „§ 433 Abs. 1 S. 1" → „§ 433 I 1".'}
          />
        </>
      )}
    </>
  );
}
