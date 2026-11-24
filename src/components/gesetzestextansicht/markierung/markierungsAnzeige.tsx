// markierungsAnzeige.tsx
// Reine Anzeige-Helfer für UeberschriftZeile/NormBlock: allgemeine (nicht
// textbezogene) Verweis-/Kommentar-Superscripts hinter dem Titel. Ursprünglich
// aus Gesetzestextansicht.bausteine.tsx ausgelagert, da diese Bausteine reine, von
// der Zeilen-Layout-Logik unabhängige Anzeige-Helfer sind. AktivZeiger (Kern)
// und KlappChevron (Struktur) sind mittlerweile in eigene Dateien
// ausgelagert (aktivZeiger.tsx bzw.
// baum/klappChevron.tsx), da sie fachlich keine
// Markierungs-Anzeige sind, sondern hier nur mit hineingerutscht waren.

import { useContext, type ReactNode } from 'react';
import { MarkierungCtx } from '@/components/gesetzestextansicht/markierung/markierungContext';
import {
  VerweisAnzeige,
  KommentarSymbol,
} from '@/components/gesetzestextansicht/markierung/markierungsBausteine';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';

/** Ordnet jeden gültigen Markierungsfall der pauschalen oder textbezogenen Anzeige zu. */
function istPauschal(eintrag: MarkierungsEintrag): boolean {
  switch (eintrag.typ) {
    case 'unterstreichung':
    case 'hervorhebung':
      return false;
    case 'kommentar':
    case 'verweismarkierung':
      switch (eintrag.bezug.typ) {
        case 'bezugstext':
          return false;
        case 'pauschal':
          return true;
      }
  }
}

/** Ein gemeinsamer Container bewahrt das Inline-Layout und die Bearbeitung jedes Eintrags. */
function PauschaleMarkierungen<T extends MarkierungsEintrag>({
  eintraege,
  ausgangsXmlId,
  renderEintrag,
}: {
  eintraege: T[];
  ausgangsXmlId: string;
  renderEintrag: (markierung: T, index: number) => ReactNode;
}) {
  const { onMarkierungRechtsklick } = useContext(MarkierungCtx);
  if (eintraege.length === 0) return null;
  return (
    <span>
      {eintraege.map((markierung, index) => (
        <span
          key={index}
          onContextMenu={
            onMarkierungRechtsklick
              ? (ereignis) => {
                  ereignis.preventDefault();
                  ereignis.stopPropagation();
                  onMarkierungRechtsklick(ausgangsXmlId, markierung);
                }
              : undefined
          }
        >
          {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: PauschaleMarkierungen rahmt ausschließlich geschützte VerweisAnzeige und KommentarSymbol ein; markierungsAnzeige.anzeige.test.tsx prüft Zitate und Aktionen. */}
          {renderEintrag(markierung, index)}
        </span>
      ))}
    </span>
  );
}

/** Pauschale Verweise stehen inline hinter Normzeile oder Überschrift, getrennt durch Semikola. */
export function VerweisSuperscript({
  markierungen,
  ausgangsXmlId,
}: {
  markierungen: MarkierungsEintrag[];
  ausgangsXmlId: string;
}) {
  const allgemein = markierungen.filter(
    (m): m is Extract<MarkierungsEintrag, { typ: 'verweismarkierung' }> =>
      m.typ === 'verweismarkierung' && istPauschal(m),
  );
  return (
    <PauschaleMarkierungen
      eintraege={allgemein}
      ausgangsXmlId={ausgangsXmlId}
      renderEintrag={(markierung, index) => (
        <>
          {index > 0 && (
            <span style={{ color: 'var(--markierungsfarbe-aktuell, var(--markierungsfarbe))' }}>
              {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Reines Symbol: VerweisSuperscript trennt mehrere Zitate mit einem einzelnen Semikolon. */}
              {';'}
            </span>
          )}
          <VerweisAnzeige verweisinhalt={markierung.verweisinhalt} ausgangsXmlId={ausgangsXmlId} />
        </>
      )}
    />
  );
}

/** Ein pauschaler Kommentar öffnet sich durch Klick auf sein abschließendes Infosymbol. */
export function KommentarSuperscript({
  markierungen,
  ausgangsXmlId,
}: {
  markierungen: MarkierungsEintrag[];
  ausgangsXmlId: string;
}) {
  const { onKommentarKlick } = useContext(MarkierungCtx);
  const allgemein = markierungen.filter((m) => m.typ === 'kommentar' && istPauschal(m));
  return (
    <PauschaleMarkierungen
      eintraege={allgemein}
      ausgangsXmlId={ausgangsXmlId}
      renderEintrag={(markierung) => (
        <KommentarSymbol
          onKlick={onKommentarKlick ? () => onKommentarKlick(ausgangsXmlId, markierung) : undefined}
        />
      )}
    />
  );
}
