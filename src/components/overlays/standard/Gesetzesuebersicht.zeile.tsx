// Gesetzesuebersicht.zeile.tsx
// Zeile der Gesetzesübersicht: Bezeichnung, Auswahlzustand und Kurzbefehl-Chip.
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzeskurzbefehl } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { pxSkaliert, zeilePadding } from '@/lib/stil/paddingRollen';
import { KurzbefehlChip } from './Gesetzesuebersicht.kurzbefehlChip';

interface GesetzeszeileProps {
  gesetz: LesbarerSuchverzeichniseintrag;
  aktiv: boolean;
  mausDarueber: boolean;
  andereAufnahmeAktiv: boolean;
  kurzbefehl: Gesetzeskurzbefehl | null;
  onSelektieren: () => void;
  onOeffnen: () => void;
  onHover: (aktiv: boolean) => void;
  onAufnahmeStart: (schluessel: string) => void;
  onAufnahmeStop: (schluessel: string) => void;
  onGesetzeskurzbefehleGeaendert: () => void;
}

export function Gesetzeszeile({
  gesetz,
  aktiv,
  mausDarueber,
  andereAufnahmeAktiv,
  kurzbefehl,
  onSelektieren,
  onOeffnen,
  onHover,
  onAufnahmeStart,
  onAufnahmeStop,
  onGesetzeskurzbefehleGeaendert,
}: GesetzeszeileProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const schluessel = gesetzesreferenzSchluessel(gesetz);
  return (
    <div
      onClick={() => onSelektieren()}
      onDoubleClick={() => onOeffnen()}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: abstandRollen.gross,
        padding: zeilePadding(uiFaktor),
        borderBottom: '1px solid var(--rahmen)',
        cursor: 'pointer',
        background: aktiv ? 'var(--auswahl-bg)' : mausDarueber ? 'var(--hover)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Textbereich */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...textRollen.standardtextBetont,
            color: aktiv ? 'var(--auswahl-text)' : 'var(--text-primaer)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <TextAnzeige text={gesetz.kurztitel} />
        </div>
        {!!gesetz.langtitel && (
          <div
            style={{
              fontSize: pxSkaliert(12, uiFaktor),
              color: aktiv ? 'var(--auswahl-text-sekundaer)' : 'var(--text-sekundaer)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <TextAnzeige text={gesetz.langtitel} />
          </div>
        )}
      </div>

      {/* Kurzbefehl-Chip – verwaltet seinen Recording-Zustand selbst */}
      <KurzbefehlChip
        schluessel={schluessel}
        gesetz={gesetz}
        kurzbefehl={kurzbefehl}
        rowHovered={mausDarueber}
        anyRecording={andereAufnahmeAktiv}
        onGesetzeskurzbefehleGeaendert={onGesetzeskurzbefehleGeaendert}
        onSelektieren={() => onSelektieren()}
        onRecordingStart={onAufnahmeStart}
        onRecordingStop={onAufnahmeStop}
      />
    </div>
  );
}
