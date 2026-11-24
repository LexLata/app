// Willkommensansicht.tsx
// Zeigt den Einstieg, wenn noch kein Gesetz geöffnet ist oder das Gesetz des
// aktiven Tabs nicht geladen werden kann (dann mit Hinweis statt „LexLata“).
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { usePlattform } from '@/hooks/utils/usePlattform';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { SucheIcon } from '@/components/seitenleisten/seitenleisten.index';
import { useIconGroessen } from '@/hooks/stil/useTextRollen';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert, badgePadding } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import lexLataLogo from '@/assets/lexlata-logo.svg';

export function Willkommensansicht({
  onOeffnenOverlayOeffnen,
  wirdGeladen = false,
  titel = 'LexLata',
}: { titel?: string } & (
  | { onOeffnenOverlayOeffnen: () => void; wirdGeladen?: false }
  | { wirdGeladen: true; onOeffnenOverlayOeffnen?: never }
)) {
  const iconGroessen = useIconGroessen();
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const radiusRollen = useRadiusRollen();
  const { istMac } = usePlattform();
  return (
    <div
      role={wirdGeladen || titel !== 'LexLata' ? 'status' : undefined}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: abstandRollen.gross,
        color: 'var(--text-sekundaer)',
      }}
    >
      {/* Logo per CSS mask-image statt Inline-SVG-Komponente (wie die
          übrigen Custom-Icons im Projekt, z. B. in
          auswahlleiste.tsx): die Rohdatei ist mit
          ~26 KB deutlich größer als die dortigen Icons, als String im JSX
          wäre sie unhandlich. Die Maske übernimmt automatisch die
          umgebende Textfarbe (currentColor) – folgt damit wie zuvor das
          "§" automatisch Light-/Dark-Mode, unabhängig von der Füllfarbe
          in der SVG-Datei selbst. */}
      <div
        aria-hidden
        style={{
          width: pxSkaliert(150, uiFaktor),
          height: pxSkaliert(150, uiFaktor),
          opacity: 0.3,
          backgroundColor: 'currentColor',
          WebkitMaskImage: `url(${lexLataLogo})`,
          maskImage: `url(${lexLataLogo})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
      <TextAnzeige
        element="div"
        style={{ fontSize: pxSkaliert(16, uiFaktor), fontWeight: 500 }}
        text={titel}
      />
      <div
        style={{
          fontSize: pxSkaliert(13, uiFaktor),
          lineHeight: textRollen.standardtext.lineHeight,
          display: 'flex',
          alignItems: 'center',
          gap: abstandRollen.kompakt,
        }}
      >
        {wirdGeladen ? (
          <TextAnzeige text="Gesetz wird geladen" />
        ) : (
          <>
            <button
              onClick={onOeffnenOverlayOeffnen}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: abstandRollen.kompakt,
                background: 'none',
                border: 'none',
                color: 'var(--akzent)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 'inherit',
                lineHeight: 'inherit',
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <SucheIcon groesse={iconGroessen.standard} />
              </span>
              <TextAnzeige text="Gesetz oder Norm öffnen" />
            </button>
            <kbd
              style={{
                ...textRollen.mikrotext,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'inherit',
                padding: badgePadding(uiFaktor),
                borderRadius: radiusRollen.klein,
                border: '1px solid var(--rahmen)',
                background: 'var(--bg-leiste)',
              }}
            >
              <TextAnzeige text={tastenkuerzelAnzeige('oeffnen', istMac)} />
            </kbd>
          </>
        )}
      </div>
    </div>
  );
}
