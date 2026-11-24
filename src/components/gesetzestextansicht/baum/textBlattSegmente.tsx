// Segmentdarstellung für Unterstreichungen, Hervorhebungen, Verweise und Kommentare im TextBlatt.
import type { MouseEvent } from 'react';
import { pfadGleich, type Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import {
  type MarkierungState,
  VerweisAnzeige,
  GetaggterVerweisText,
  KommentarSymbol,
  mitFixierterLeerzeichenbreite,
  type GeschuetztesDarstellungssegment,
} from '@/components/gesetzestextansicht/markierung/markierung.index';

// ---------------------------------------------------------------------------
// Geschütztes Leerzeichen ↔ Blocksatz
// ---------------------------------------------------------------------------
// schuetzeLeerzeichen()/schuetzeLeerzeichenZitat() (lib/domain/basis/textNachbearbeitung.ts)
// fügen \u00A0 (geschütztes Leerzeichen) in den Rohtext ein, um einen
// Zeilenumbruch an der Stelle zu verhindern ("§ 5", "Art. 12" bleiben
// zusammen). Bei aktiviertem Blocksatz (Einstellung "Blocksatz",
// useTextDarstellung.ts, CSS-Variable --text-align: justify) würde der
// Browser aber auch DIESE Leerzeichen wie normale Wortzwischenräume
// strecken – optisch sieht "§ 5" dann bei jeder Zeile unterschiedlich breit
// auseinandergezogen aus, obwohl es zusammengehören soll.
//
// mitFixierterLeerzeichenbreite (Import von markierung.index, s.o. – dort
// exportiert aus markierungsBausteine.tsx, wo auch
// VerweisAnzeige sie braucht; baum/ darf einseitig aus markierung.index
// importieren, daher hier keine eigene Kopie) packt jedes \u00A0 in eine
// eigene inline-block-Box: Der Blocksatz-Algorithmus verteilt Extra-Weite
// nur zwischen separaten Inline-Boxen, nicht innerhalb einer einzelnen
// atomaren Box – das geschützte Leerzeichen behält so immer seine
// natürliche (nicht gestreckte) Breite. Ohne Blocksatz ist der Effekt
// visuell nicht wahrnehmbar (inline-block ohne feste width verhält sich
// wie normaler Inline-Text).
//
// WICHTIG (Bugfix): text-decoration/background eines UMGEBENDEN Elements
// wird von den meisten Browsern NICHT über eine inline-block-Kindbox hinweg
// durchgemalt (bekannte CSS-Eigenheit – inline-block ist eine atomare Box,
// vergleichbar mit einem Bild) – sichtbar als Lücke in der Unterstreichung
// bzw. im Hervorhebungs-Hintergrund genau an der Stelle des geschützten
// Leerzeichens. Deshalb NICHT wie zunächst versucht nur den äußeren
// Container stylen, sondern optionalen `deko`-Style hier auf JEDES
// Fragment (auch die nbsp-Box selbst) anwenden – jedes Fragment malt dann
// seine eigene, lückenlos anschließende Dekoration.
//
// WICHTIG (Offset-Invariante): verändert NICHT die Gesamtzahl der Zeichen
// im DOM-Textinhalt (nur zusätzliche Verschachtelung um bereits vorhandene
// Zeichen) – die zeichenbasierte Offset-Zählung in textpfad.ts
// (die den gesamten Textinhalt von [data-leaf] durchläuft) bleibt daher
// unverändert korrekt.

// ---------------------------------------------------------------------------
// Verweis-Anzeige (Verweismarkierung-Text) und Kommentar-Infosymbol (ⓘ)
// ---------------------------------------------------------------------------
// VerweisAnzeige/KommentarSymbol liegen jetzt in
// markierung/markierungsBausteine.tsx (siehe Umbauplan
// Abschnitt 6.1 – Verschiebung nötig, um den sonst entstehenden
// Modul-Zyklus baum ⇄ markierung aufzulösen: markierungsAnzeige.tsx
// (VerweisSuperscript/KommentarSuperscript) brauchte diese Bausteine
// bereits vorher, dieses Modul (künftig baum/) braucht seinerseits
// MarkierungCtx aus markierung/).

// ---------------------------------------------------------------------------
// Segment-Renderer für TextBlatt (ein Fall pro TextSegment.typ)
// ---------------------------------------------------------------------------
// Ausgelagert aus der segmente.map(...)-Callback in TextBlatt (s.u.), damit
// deren kognitive Komplexität innerhalb des Sonar-Limits bleibt (war 17 von
// 15 erlaubt) – rein mechanische Extraktion, kein Verhaltensunterschied.
// segStart wird vom Aufrufer übergeben (= segmentOffsets[i] aus TextBlatt),
// da die dortige Indexbildung (Zeichen-Offset je Segment) modulübergreifend
// nur einmal gebraucht wird und nicht in jeden Segment-Renderer dupliziert
// werden soll.

// Unterstreichung (manuelle Markierung oder getaggter Verweis-Basistext) und
// Hervorhebung teilen sich denselben Rechtsklick-Löschen-Mechanismus, nur die
// Deko-Styles unterscheiden sich – daher weiterhin ein gemeinsamer Renderer.
function findeVolleMarkierung(
  markierungen: MarkierungsEintrag[],
  pfad: Textpfad,
  versatz: number,
  segStart: number,
  segEnde: number,
  passtTyp: (markierung: MarkierungsEintrag) => boolean,
): MarkierungsEintrag | undefined {
  return markierungen.find(
    (markierung) =>
      passtTyp(markierung) &&
      markierung.bezug.typ === 'bezugstext' &&
      pfadGleich(markierung.bezug.textstelle.pfad, pfad) &&
      markierung.bezug.textstelle.zeichenbereichStart - versatz <= segStart &&
      markierung.bezug.textstelle.zeichenbereichEnde - versatz >= segEnde,
  );
}

export function UnterstreichungsSegment({
  seg,
  segStart,
  segEnde,
  markierungAnfang,
  markierungEnde,
  pfad,
  markierungen,
  versatz,
  ausgangsXmlId,
  onMarkierungRechtsklick,
}: {
  seg: GeschuetztesDarstellungssegment;
  segStart: number;
  segEnde: number;
  markierungAnfang: boolean;
  markierungEnde: boolean;
  pfad: Textpfad;
  markierungen: MarkierungsEintrag[];
  versatz: number;
  ausgangsXmlId?: string;
  onMarkierungRechtsklick?: MarkierungState['onMarkierungRechtsklick'];
}) {
  const handleContextMenu = (e: MouseEvent) => {
    if (!ausgangsXmlId || !onMarkierungRechtsklick) return;
    const voll = findeVolleMarkierung(
      markierungen,
      pfad,
      versatz,
      segStart,
      segEnde,
      (markierung) => markierung.typ === seg.typ,
    );
    if (!voll) return;
    e.preventDefault();
    e.stopPropagation();
    onMarkierungRechtsklick(ausgangsXmlId, voll);
  };
  return (
    <span
      onContextMenu={handleContextMenu}
      style={
        seg.typ === 'hervorhebung'
          ? {
              background: 'var(--hervorheben-bg)',
              // An künstlichen Gruppengrenzen schließen die Flächen ohne
              // abgerundete Innenkanten an; der bisherige Außenradius bleibt.
              borderTopLeftRadius: markierungAnfang ? 2 : 0,
              borderBottomLeftRadius: markierungAnfang ? 2 : 0,
              borderTopRightRadius: markierungEnde ? 2 : 0,
              borderBottomRightRadius: markierungEnde ? 2 : 0,
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
            }
          : undefined
      }
    >
      {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: UnterstreichungsSegment gibt GetaggterVerweisText mit GeschuetzterDarstellungstext aus; textBlatt.auswahl.test.tsx prüft Dekorationsgrenzen. */}
      {seg.typ === 'hervorhebung' ? (
        (seg.getaggteVerweisTeile ?? [{ text: seg.text, verweis: undefined }]).map(
          (teil, index) => (
            <GetaggterVerweisText
              key={index}
              text={teil.text}
              verweis={teil.verweis}
              ausgangsXmlId={ausgangsXmlId}
              deko={
                teil.verweis
                  ? {
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                      textDecorationColor: 'var(--text-sekundaer)',
                    }
                  : undefined
              }
            />
          ),
        )
      ) : (
        <GetaggterVerweisText
          text={seg.text}
          verweis={seg.getaggterVerweis}
          ausgangsXmlId={ausgangsXmlId}
          deko={{
            textDecoration: 'underline',
            textUnderlineOffset: 2,
            textDecorationColor: 'var(--markierungsfarbe-aktuell, var(--markierungsfarbe))',
          }}
        />
      )}
    </span>
  );
}

// Textbezogener Verweismarkierung (manuelle Markierung ODER aus dem Quell-XML
// getaggter Verweis, siehe (seg.typ === 'getaggterVerweis')).
export function VerweisSegment({
  seg,
  segStart,
  segEnde,
  zeigeAnhang,
  pfad,
  markierungen,
  versatz,
  ausgangsXmlId,
  onVerweisKlick,
  onMarkierungRechtsklick,
}: {
  seg: GeschuetztesDarstellungssegment;
  segStart: number;
  segEnde: number;
  zeigeAnhang: boolean;
  pfad: Textpfad;
  markierungen: MarkierungsEintrag[];
  versatz: number;
  ausgangsXmlId?: string;
  onVerweisKlick?: MarkierungState['onVerweisKlick'];
  onMarkierungRechtsklick?: MarkierungState['onMarkierungRechtsklick'];
}) {
  const ersteZielnorm = seg.getaggterVerweis
    ? {
        typ: 'getaggterVerweis' as const,
        zielBezeichnung: seg.getaggterVerweis.zielBezeichnung,
        zielgesetz: seg.getaggterVerweis.zielgesetz,
      }
    : seg.verweisinhalt?.verweisziele[0];
  const klickbar = !!(ersteZielnorm && ausgangsXmlId && onVerweisKlick);
  // Fallback-Klick für den unterstrichenen BASISTEXT (nicht den angehängten
  // Zitat-Text – dessen Teilbereiche haben eigene Klick-Handler, siehe
  // VerweisAnzeige): navigiert zum ERSTEN erkannten Ziel. Bei mehreren
  // Zielen bleibt der Zitat-Text selbst maßgeblich für ein bestimmtes Ziel.
  const handleClick = (e: MouseEvent) => {
    if (!klickbar) return;
    // Textmarkierung (zum Kopieren) soll nicht gleichzeitig als Klick zählen
    // – gleiches Prinzip wie normTextKlick/klappKlick in
    // Gesetzestextansicht.bausteine.tsx.
    if (window.getSelection()?.toString()) return;
    e.stopPropagation();
    onVerweisKlick!(ausgangsXmlId!, ersteZielnorm!, e.metaKey || e.ctrlKey);
  };
  // Findet den VOLLEN MarkierungsEintrag (nicht nur das per segmentiere() auf
  // auf Darstellungsangaben reduzierte TextSegment) für den Rechtsklick
  // – über pfadGleich UND die Zeichenposition des Segments, denn an einem
  // Textpfad (z.B. demselben Satz) können durchaus MEHRERE Verweise an
  // unterschiedlichen Textstellen liegen (früherer Bug: reines pfadGleich
  // fand bei mehreren Verweisen im selben Pfad immer nur den ersten).
  // segStart/segEnde liegen (wie m.textstelle.zeichenbereichStart/-Ende) im versatz-bereinigten
  // Koordinatensystem von `text` – ein Enthaltensein-Vergleich statt exakter
  // Gleichheit toleriert dabei ein eventuelles Clipping durch segmentiere()
  // an den Textgrenzen.
  // Kein Rechtsklick-Menü bei getaggten Verweisen (Quellenverweise): die sind
  // nicht persistiert und daher nicht bearbeitbar.
  const handleContextMenu = (e: MouseEvent) => {
    if (seg.typ === 'getaggterVerweis' || !ausgangsXmlId || !onMarkierungRechtsklick) return;
    const voll = findeVolleMarkierung(
      markierungen,
      pfad,
      versatz,
      segStart,
      segEnde,
      (markierung) => markierung.typ === 'verweismarkierung',
    );
    if (!voll) return;
    e.preventDefault();
    e.stopPropagation();
    onMarkierungRechtsklick(ausgangsXmlId, voll);
  };
  return (
    // Klick-Bereich umfasst den GESAMTEN Block – sowohl den unterstrichenen
    // (kommentierten) Text als auch das angehängte Zitat (z.B. bei "Würde
    // Art. 1 GG" ist "Würde" unterstrichen, "Art. 1 GG" das Zitat; ein Klick
    // soll in beiden Bereichen die Zielnorm öffnen, nicht nur beim Klick auf
    // "Würde"). Deshalb sitzt der Handler auf dem äußeren <span>, nicht
    // (mehr) nur auf dem unterstrichenen Innenteil.
    <span
      onClick={klickbar ? handleClick : undefined}
      onContextMenu={seg.typ !== 'getaggterVerweis' ? handleContextMenu : undefined}
      style={{ cursor: klickbar ? 'pointer' : undefined }}
    >
      {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: VerweisSegment gibt seg.text über mitFixierterLeerzeichenbreite aus; textBlatt.auswahl.test.tsx prüft Auswahl und Anhänge. */}
      {mitFixierterLeerzeichenbreite(seg.text, {
        textDecoration: 'underline',
        // Getaggte Verweise (bereits im Quell-XML vorhandene Referenzen,
        // Quellenverweise) sind KEINE Nutzer-Markierung und sollen daher
        // nicht in Markierungsfarbe erscheinen, sondern wie normaler
        // (leicht abgesetzter) Fließtext – nur die UnterstreichungsFARBE
        // ändert sich, der Text selbst bleibt in --text-primaer (kommt vom
        // umgebenden style-Prop, hier unverändert).
        textDecorationColor:
          seg.typ === 'getaggterVerweis'
            ? 'var(--text-sekundaer)'
            : 'var(--markierungsfarbe-aktuell, var(--markierungsfarbe))',
        textUnderlineOffset: 2,
      })}
      {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: VerweisSegment hängt einmalig VerweisAnzeige mit geschuetzterZitattext an; textBlatt.test.tsx prüft Anhänge. */}
      {zeigeAnhang && seg.verweisinhalt && seg.typ !== 'getaggterVerweis' && (
        <VerweisAnzeige verweisinhalt={seg.verweisinhalt} ausgangsXmlId={ausgangsXmlId} />
      )}
    </span>
  );
}

// Textbezogener Kommentar (immer eine echte, persistierte Nutzer-Markierung
// – es gibt keine "getaggten" Kommentare aus dem Quell-XML).
export function KommentarSegment({
  seg,
  segStart,
  segEnde,
  zeigeAnhang,
  pfad,
  markierungen,
  versatz,
  ausgangsXmlId,
  onKommentarKlick,
  onMarkierungRechtsklick,
}: {
  seg: GeschuetztesDarstellungssegment;
  segStart: number;
  segEnde: number;
  zeigeAnhang: boolean;
  pfad: Textpfad;
  markierungen: MarkierungsEintrag[];
  versatz: number;
  ausgangsXmlId?: string;
  onKommentarKlick?: MarkierungState['onKommentarKlick'];
  onMarkierungRechtsklick?: MarkierungState['onMarkierungRechtsklick'];
}) {
  // Findet den vollen MarkierungsEintrag für den Klick-Handler – gleiches
  // Prinzip wie handleContextMenu in VerweisSegment: pfadGleich allein
  // reicht nicht, da an einem Textpfad mehrere Kommentare an
  // unterschiedlichen Textstellen liegen können (analog zum dokumentierten
  // Verweis-Bug).
  const vollerEintrag = markierungen.find(
    (m) =>
      m.typ === 'kommentar' &&
      m.bezug.typ === 'bezugstext' &&
      pfadGleich(m.bezug.textstelle.pfad, pfad) &&
      m.bezug.textstelle!.zeichenbereichStart - versatz <= segStart &&
      m.bezug.textstelle!.zeichenbereichEnde - versatz >= segEnde,
  );
  const klickbar = !!(vollerEintrag && ausgangsXmlId && onKommentarKlick);
  const handleContextMenu = (e: MouseEvent) => {
    if (!vollerEintrag || !ausgangsXmlId || !onMarkierungRechtsklick) return;
    e.preventDefault();
    e.stopPropagation();
    onMarkierungRechtsklick(ausgangsXmlId, vollerEintrag);
  };
  return (
    <span onContextMenu={handleContextMenu}>
      {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: KommentarSegment gibt GetaggterVerweisText mit geschütztem Teiltext aus; textBlatt.auswahl.test.tsx prüft Auswahl. */}
      {(seg.getaggteVerweisTeile ?? [{ text: seg.text, verweis: undefined }]).map((teil, index) => (
        <GetaggterVerweisText
          key={index}
          text={teil.text}
          verweis={teil.verweis}
          ausgangsXmlId={ausgangsXmlId}
          deko={{
            textDecoration: 'underline',
            textDecorationColor: 'var(--markierungsfarbe-aktuell, var(--markierungsfarbe))',
            textUnderlineOffset: 2,
          }}
        />
      ))}
      {zeigeAnhang && (
        <KommentarSymbol
          onKlick={klickbar ? () => onKommentarKlick!(ausgangsXmlId!, vollerEintrag!) : undefined}
        />
      )}
    </span>
  );
}
