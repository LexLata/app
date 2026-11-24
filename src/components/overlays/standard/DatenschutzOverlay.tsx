// Zeigt ausschließlich den beim Build eingebetteten Root-Datenschutzhinweis.
// Markdown-Knoten werden als geschützte React-Textblätter ausgegeben, niemals als HTML.
import datenschutzText from '@/../DATENSCHUTZ.md?raw';
import { Shield } from '@phosphor-icons/react';
import { parseMiniMarkdown } from '@/lib/utils/miniMarkdown';
import { OverlayRahmen, OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import { LesetextBereich, MarkdownBloecke } from '@/components/overlays/standard/MarkdownBloecke';

const bloecke = parseMiniMarkdown(datenschutzText);

/** Rein lesbares Overlay ohne Datenabruf oder eigene Zustandsquelle. */
export interface DatenschutzOverlayProps {
  onSchliessen: () => void;
}

export function DatenschutzOverlay({ onSchliessen }: DatenschutzOverlayProps) {
  return (
    <OverlayRahmen onSchliessen={onSchliessen} breite={OVERLAY_BREITE_GROSS}>
      <OverlayKopfzeile icon={Shield} titel="Datenschutz" onSchliessen={onSchliessen} />
      <LesetextBereich>
        <MarkdownBloecke bloecke={bloecke} />
      </LesetextBereich>
    </OverlayRahmen>
  );
}
