// Gemeinsame Blockdarstellung für eingebettete Mini-Markdown-Texte (Datenschutz, Über LexLata).
// Markdown-Knoten werden als geschützte React-Textblätter ausgegeben, niemals als HTML.
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { parseMiniMarkdown } from '@/lib/utils/miniMarkdown';
import { OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import type { CSSProperties, ReactElement } from 'react';
import { OVERLAY_AUSSEN_ROH, pxSkaliert } from '@/lib/stil/paddingRollen';

export type MarkdownBlock = ReturnType<typeof parseMiniMarkdown>[number];
type Block = MarkdownBlock;
type Inline = Extract<Block, { art: 'absatz' }>['inhalt'];

const UEBERSCHRIFTEN = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

function InlineDarstellung({ inhalt }: { inhalt: Inline }) {
  const textRollen = useTextRollen();
  return inhalt.map((knoten, index) => {
    if (typeof knoten.inhalt === 'string') {
      return (
        <TextAnzeige
          key={index}
          element={knoten.art === 'code' ? 'code' : 'span'}
          text={knoten.inhalt}
        />
      );
    }
    if (knoten.art === 'fett') {
      return (
        <strong key={index} style={textRollen.standardtextBetont}>
          <InlineDarstellung inhalt={knoten.inhalt} />
        </strong>
      );
    }
    return (
      <em key={index}>
        <InlineDarstellung inhalt={knoten.inhalt} />
      </em>
    );
  });
}

function BlockDarstellung({ block }: { block: Block }) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstand = pxSkaliert(12, uiFaktor);
  if (block.art === 'ueberschrift') {
    const Ueberschrift = UEBERSCHRIFTEN[block.ebene - 1] ?? 'h6';
    return (
      <Ueberschrift style={{ ...textRollen.abschnittsUeberschrift, margin: `${abstand}px 0` }}>
        <InlineDarstellung inhalt={block.inhalt} />
      </Ueberschrift>
    );
  }
  if (block.art === 'absatz') {
    return (
      <p style={{ ...textRollen.standardtext, margin: `${abstand}px 0` }}>
        <InlineDarstellung inhalt={block.inhalt} />
      </p>
    );
  }
  if (block.art === 'liste') {
    const eintraege: Inline[] = block.eintraege;
    return (
      <ul
        style={{
          ...textRollen.standardtext,
          paddingLeft: pxSkaliert(24, uiFaktor),
          margin: `${abstand}px 0`,
        }}
      >
        {eintraege.map((inhalt, index) => (
          <li key={index} style={{ marginBottom: pxSkaliert(4, uiFaktor) }}>
            <InlineDarstellung inhalt={inhalt} />
          </li>
        ))}
      </ul>
    );
  }
  const kopf: Inline[] = block.kopf;
  const zeilen: Inline[][] = block.zeilen;
  // Lokale Spaltenaufteilung aus der bestehenden Overlaybreite, mit derselben
  // UI-Skalierung. Gegenstellen bleiben zusammenhängend; Erklärungstext
  // bekommt mehr Platz. Die Summe darf den horizontalen Container überragen.
  const spaltenFaktoren = [0.3, 0.4, 0.6];
  const spaltenStil = (spalte: number): CSSProperties => ({
    minWidth: pxSkaliert(OVERLAY_BREITE_GROSS * (spaltenFaktoren[spalte] ?? 0.3), uiFaktor),
    ...(spalte === 1 ? { whiteSpace: 'nowrap' } : {}),
  });
  const zellenStil: CSSProperties = {
    padding: pxSkaliert(8, uiFaktor),
    border: '1px solid var(--rahmen)',
    verticalAlign: 'top',
  };
  return (
    <div style={{ overflowX: 'auto', margin: `${abstand}px 0` }}>
      <table
        style={{
          ...textRollen.standardtext,
          width: '100%',
          overflowWrap: 'normal',
          borderCollapse: 'collapse',
          textAlign: 'left',
        }}
      >
        <thead>
          <tr>
            {kopf.map((inhalt, index) => (
              <th
                key={index}
                scope="col"
                style={{ ...zellenStil, ...spaltenStil(index), ...textRollen.standardtextBetont }}
              >
                <InlineDarstellung inhalt={inhalt} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zeilen.map((zeile, index) => (
            <tr key={index}>
              {zeile.map((inhalt, spalte) => (
                <td key={spalte} style={{ ...zellenStil, ...spaltenStil(spalte) }}>
                  <InlineDarstellung inhalt={inhalt} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Stellt die Blöcke eines geparsten Mini-Markdown-Textes nacheinander dar. */
export function MarkdownBloecke({ bloecke }: { bloecke: MarkdownBlock[] }) {
  return bloecke.map((block, index) => <BlockDarstellung key={index} block={block} />);
}

/** Scrollbarer Inhaltsbereich unter der Kopfzeile der Lesetext-Overlays. */
export function LesetextBereich({
  children,
}: {
  children: ReactElement | (ReactElement | null)[];
}) {
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <div
      style={{
        padding: `0 ${pxSkaliert(24, uiFaktor)}px ${pxSkaliert(OVERLAY_AUSSEN_ROH, uiFaktor)}px`,
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </div>
  );
}
