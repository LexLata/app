// Zeigt den eingebetteten Text „Über LexLata“, die Version aus Tauri und auf
// Wunsch die Drittlizenzen. Markdown wird nie als HTML ausgegeben; die
// Drittlizenzen sind Klartext und werden erst beim Aufklappen geladen.
import ueberText from './ueber.md?raw';
import { useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { CaretDown, CaretRight, Info } from '@phosphor-icons/react';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { parseMiniMarkdown } from '@/lib/utils/miniMarkdown';
import { OverlayRahmen, OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import { LesetextBereich, MarkdownBloecke } from '@/components/overlays/standard/MarkdownBloecke';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';

const [titelBlock, ...restBloecke] = parseMiniMarkdown(ueberText);
const titelBloecke = titelBlock ? [titelBlock] : [];

/** Rein lesbares Overlay; einziger Zustand sind Version und Aufklappen der Drittlizenzen. */
export interface UeberOverlayProps {
  onSchliessen: () => void;
}

function Drittlizenzen() {
  const textRollen = useTextRollen();
  const buttonRollen = useButtonRollen();
  const abstandRollen = useAbstandRollen();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!offen || text !== null) return;
    let aktiv = true;
    void import('@/../THIRD-PARTY-LICENSES?raw').then((modul) => {
      if (aktiv) setText(modul.default);
    });
    return () => {
      aktiv = false;
    };
  }, [offen, text]);
  const Pfeil = offen ? CaretDown : CaretRight;
  return (
    <section>
      <TextAttributElement
        element="button"
        type="button"
        aria-expanded={offen}
        aria-controls="drittlizenzen-text"
        onClick={() => setOffen((wert) => !wert)}
        style={{
          ...buttonRollen.sekundaer(),
          display: 'inline-flex',
          alignItems: 'center',
          gap: abstandRollen.kompakt,
        }}
      >
        <Pfeil size="1em" aria-hidden="true" />
        <TextAnzeige text="Drittlizenzen" />
      </TextAttributElement>
      {offen ? (
        <TextAnzeige
          element="pre"
          id="drittlizenzen-text"
          text={text ?? 'Wird geladen …'}
          style={{ ...textRollen.hinweistext, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}
        />
      ) : null}
    </section>
  );
}

export function UeberOverlay({ onSchliessen }: UeberOverlayProps) {
  const textRollen = useTextRollen();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let aktiv = true;
    void getVersion().then((wert) => {
      if (aktiv) setVersion(wert);
    });
    return () => {
      aktiv = false;
    };
  }, []);
  return (
    <OverlayRahmen onSchliessen={onSchliessen} breite={OVERLAY_BREITE_GROSS}>
      <OverlayKopfzeile icon={Info} titel="Über LexLata" onSchliessen={onSchliessen} />
      <LesetextBereich>
        <MarkdownBloecke bloecke={titelBloecke} />
        {version !== null ? (
          <p style={{ ...textRollen.hinweistext, margin: 0 }}>
            <TextAnzeige text={`Version ${version}`} />
          </p>
        ) : null}
        <MarkdownBloecke bloecke={restBloecke} />
        <Drittlizenzen />
      </LesetextBereich>
    </OverlayRahmen>
  );
}
