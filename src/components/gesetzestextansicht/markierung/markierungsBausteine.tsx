// markierungsBausteine.tsx
//
// Textbezogene Markierungs-Anzeige-Bausteine (VerweisAnzeige, KommentarSymbol).
// Verschoben aus textBlatt.tsx (siehe Umbauplan Abschnitt 6.1):
// markierungsAnzeige.tsx (VerweisSuperscript/KommentarSuperscript) brauchte
// diese beiden Funktionen bereits vorher, textBlatt.tsx (künftig baum/)
// braucht seinerseits MarkierungCtx aus diesem Submodul – eine Belassung in
// textBlatt.tsx hätte nach der Aufteilung in baum/ vs. markierung/ einen
// Modul-Zyklus baum ⇄ markierung erzeugt. Reine Verschiebung, kein
// Verhaltensunterschied.

import type { GetaggterVerweis } from '@/lib/domain/gesetzTypes';
import { useContext, type MouseEvent, type CSSProperties, type ReactNode } from 'react';
import type { VerweisInhalt } from '@/lib/markierungen/markierungen.index';
import { MarkierungCtx } from '@/components/gesetzestextansicht/markierung/markierungContext';
import {
  mitFixierterLeerzeichenbreite,
  mitLeerzeichenboxen,
} from './mitFixierterLeerzeichenbreite';
import { mitUmbruchschutz } from './umbruchschutz';
import {
  geschuetzterZitattext,
  teileDarstellungstext,
  type GeschuetzterDarstellungstext,
} from './darstellungstext';

/** Getaggter Verweis im markierten Text; Textauswahl löst keine Navigation aus. */
export function GetaggterVerweisText({
  text,
  verweis,
  ausgangsXmlId,
  deko,
}: {
  text: GeschuetzterDarstellungstext;
  verweis?: GetaggterVerweis;
  ausgangsXmlId?: string;
  deko?: CSSProperties;
}) {
  const { onVerweisKlick } = useContext(MarkierungCtx);
  const ziel = verweis
    ? {
        typ: 'getaggterVerweis' as const,
        zielBezeichnung: verweis.zielBezeichnung,
        zielgesetz: verweis.zielgesetz,
      }
    : undefined;
  const klickbar = !!(ziel && ausgangsXmlId && onVerweisKlick);
  return (
    <span
      style={{ cursor: klickbar ? 'pointer' : undefined }}
      onClick={
        klickbar
          ? (e: MouseEvent) => {
              if (window.getSelection()?.toString()) return;
              e.stopPropagation();
              onVerweisKlick!(ausgangsXmlId!, ziel!, e.metaKey || e.ctrlKey);
            }
          : undefined
      }
    >
      {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: GetaggterVerweisText gibt GeschuetzterDarstellungstext über mitFixierterLeerzeichenbreite aus; markierungsBausteine.test.tsx prüft Gruppen. */}
      {mitFixierterLeerzeichenbreite(text, deko)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Verweis-Anzeige (Verweismarkierung-Text)
// ---------------------------------------------------------------------------

// Einheitliche Darstellung eines Verweismarkierung-Inhalts – sowohl für Verweise MIT
// Textbezug (direkt hinter der unterstrichenen Textstelle, im 'verweismarkierung'-
// Segment in baum/textBlatt.tsx) als auch für allgemeine
// Verweise OHNE Textbezug (VerweisSuperscript in
// markierungsAnzeige.tsx, ganz normal ans Ende der
// Normzeile/Überschrift angehängt). Bewusst KEIN <sup>, keine
// abweichende Schriftgröße, keine Einrückung – ein Verweismarkierung soll optisch
// wie normaler Fließtext wirken (siehe Absprache).
//
// Der ursprüngliche `verweistext` bleibt in Fachdaten erhalten. Nur seine
// Anzeige schützt Leerzeichen mit den ausdrücklichen Zitatregeln – ein Klick auf einen
// Teilbereich navigiert anhand von Verweisziel.verweistextZeichenbereich zum
// jeweils passenden Ziel. Geschützte Leerzeichen werden auf dem gesamten
// Zitat vor der Aufteilung angewandt; die Zeichenzahl bleibt dabei gleich.
// Text außerhalb der Zielbereiche bleibt sichtbar und ist nicht klickbar. Das
// führende Leerzeichen ist Teil der Darstellung, nicht der Persistenz.
export function VerweisAnzeige({
  verweisinhalt,
  ausgangsXmlId,
}: {
  verweisinhalt: VerweisInhalt;
  ausgangsXmlId?: string;
}) {
  const { onVerweisKlick } = useContext(MarkierungCtx);
  const anzeigeText = geschuetzterZitattext(verweisinhalt.verweistext);
  return (
    <span
      data-zitatanhang=""
      style={{
        color: 'var(--markierungsfarbe-aktuell, var(--markierungsfarbe))',
        // Der Anhang kann innerhalb einer Schutzgruppe des Basistextes liegen.
        // Seine eigenen Gruppen bleiben geschützt, dazwischen darf er umbrechen.
        whiteSpace: 'pre-wrap',
      }}
    >
      {' '}
      {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: VerweisAnzeige gibt geschuetzterZitattext über mitUmbruchschutz und geschützte Zielteile aus; markierungsBausteine.test.tsx prüft Zitat- und Zielgrenzen. */}
      {mitUmbruchschutz(anzeigeText, (teil, versatz) => {
        const teile: ReactNode[] = [];
        let position = 0;
        for (const z of [...verweisinhalt.verweisziele].sort(
          (a, b) => a.verweistextZeichenbereich[0] - b.verweistextZeichenbereich[0],
        )) {
          const start = Math.max(versatz, z.verweistextZeichenbereich[0]) - versatz;
          const ende =
            Math.min(versatz + teil.text.length, z.verweistextZeichenbereich[1]) - versatz;
          if (ende <= start) continue;
          teile.push(mitLeerzeichenboxen(teileDarstellungstext(teil, position, start)));
          const klickbar = !!(ausgangsXmlId && onVerweisKlick);
          teile.push(
            <span
              key={start}
              onClick={
                klickbar
                  ? (e: MouseEvent) => {
                      if (window.getSelection()?.toString()) return;
                      e.stopPropagation();
                      onVerweisKlick!(ausgangsXmlId!, z, e.metaKey || e.ctrlKey);
                    }
                  : undefined
              }
              style={{ cursor: klickbar ? 'pointer' : undefined }}
            >
              {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: VerweisAnzeige gibt mitLeerzeichenboxen für den geschützten Zitatteil aus; markierungsBausteine.test.tsx prüft Zielgrenzen. */}
              {mitLeerzeichenboxen(teileDarstellungstext(teil, start, ende))}
            </span>,
          );
          position = ende;
        }
        teile.push(mitLeerzeichenboxen(teileDarstellungstext(teil, position, teil.text.length)));
        return teile;
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Kommentar-Infosymbol (ⓘ)
// ---------------------------------------------------------------------------

// Klickbares Infosymbol für Kommentare – bei Bezug auf einen Textabschnitt
// direkt hinter dem in Markierungsfarbe unterstrichenen Text (siehe
// baum/textBlatt.tsx), bei allgemeinem Kommentar hinter der
// Normzeile/Überschrift (siehe KommentarSuperscript in
// markierungsAnzeige.tsx). Ein Klick öffnet SOFORT das
// Hilfsfenster zum Bearbeiten (kein Kontextmenü, anders als beim Verweismarkierung – siehe
// Absprache).
//
// data-zitatanhang: wie beim Verweismarkierung-Zitatanhang (siehe VerweisAnzeige
// oben) muss auch das Infosymbol selbst aus der Zeichen-Zählung für
// Textauswahlen ausgenommen werden (textpfad.ts:
// absoluterOffsetImBlatt entfernt alle [data-zitatanhang]-Elemente vor dem
// Zählen) – sonst verschiebt sich jede spätere Markierung im selben Satz
// um die Symbol-Länge nach hinten.
export function KommentarSymbol({ onKlick }: { onKlick?: () => void }) {
  return (
    <span
      data-zitatanhang=""
      onClick={
        onKlick
          ? (e: MouseEvent) => {
              if (window.getSelection()?.toString()) return;
              e.stopPropagation();
              onKlick();
            }
          : undefined
      }
      style={{
        color: 'var(--markierungsfarbe-aktuell, var(--markierungsfarbe))',
        textDecoration: 'none',
        cursor: onKlick ? 'pointer' : undefined,
        fontSize: '0.85em',
        // Halber Größenunterschied: der Kreis liegt auf der Höhe der
        // umgebenden Großbuchstaben statt auf deren Grundlinie.
        verticalAlign: '0.075em',
        // Gesetzestext-Feinabstand vor dem Kommentar-Icon (em-basierte
        // Schriftgröße hier, s.o.) – siehe Kopfkommentar von
        // absatzBausteine.tsx.
        // eslint-disable-next-line lexlata/keine-unskalierten-px -- Fester 2-Pixel-Feinabstand trennt das Kommentarsymbol vom Bezugstext innerhalb des Gesetzestextes.
        marginLeft: 2,
      }}
    >
      {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Reines Symbol: KommentarSymbol zeigt ausschließlich ⓘ als Kommentar-Infosymbol. */}
      {'ⓘ'}
    </span>
  );
}
