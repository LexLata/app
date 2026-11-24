// TextBlatt ordnet geschützten Blatttext seinen Markierungen und Segmentdarstellungen zu.
// Das Blatt schützt den vollständigen Darstellungstext und verteilt ihn auf
// die Renderer in textBlattSegmente.tsx. Alle Daten kommen
// über Props; auf EinklappCtx wird hier nicht zugegriffen.
//
// Unterstreichungen (siehe markierungSpeicher.ts/textpfad.ts) folgen
// demselben Prinzip: die für die Norm geltende Liste kommt als Prop
// `markierungen` herein (aus MarkierungCtx, von NormBlock aufgelöst,
// siehe Gesetzestextansicht.bausteine.tsx) und wird von den aufrufenden Ebenen bis
// hierher durchgereicht. Jedes Blatt trägt beim Rendern data-Attribute
// (data-leaf, data-absatz, data-unterabsatz, data-satz, data-satz-in-eintrag,
// data-eintraege (JSON-serialisierte TextpfadEintrag[]-Kette, siehe
// Textpfad.eintraege in textpfad.ts), data-bereich, data-zeichen-versatz), über die textpfad.ts
// eine Selektion später wieder einer Position zuordnen kann.
//
// Einschränkung: Enthält ein Satz innerhalb eines Aufzählungseintrags
// (eintrag.saetze) SELBST wieder eine eigene Aufzählung (satz.eintraege),
// gibt es dafür in der vorgegebenen textstelle-Struktur keine dritte
// Verschachtelungsebene – solche (in der Praxis extrem seltenen) Stellen sind
// daher nicht unterstreichbar.

import type { Textauszeichnung } from '@/lib/darstellung/darstellung.index';
import { useContext, type CSSProperties } from 'react';
import { pfadGleich } from '@/lib/domain/textpfad/textpfad.index';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';
import {
  MarkierungCtx,
  mitFixierterLeerzeichenbreite,
  mitUmbruchschutz,
  geschuetzterBlatttext,
  segmentiereDarstellungstext,
  teileDarstellungssegment,
} from '@/components/gesetzestextansicht/markierung/markierung.index';

import { UnterstreichungsSegment, VerweisSegment, KommentarSegment } from './textBlattSegmente';

// ---------------------------------------------------------------------------
// Markierbares Text-Blatt (Unterstreichung/Hervorhebung)
// ---------------------------------------------------------------------------

// Rendert einen Text-Container, der zugleich als „Blatt" für
// textpfad.ermittleAuswahl auffindbar ist (data-leaf) und bereits
// gespeicherte Markierungen (Unterstreichung/Hervorhebung, siehe
// markierungSpeicher.ts) darstellt.
export function TextBlatt({
  text,
  pfad,
  markierungen,
  getaggteVerweise,
  style,
  versatz = 0,
  ausgangsXmlId,
}: {
  text: string;
  pfad: Textpfad;
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  style: CSSProperties;
  /**
   * Zeichen-Offset dieses Blatts innerhalb seines Textpfad. Nötig, weil
   * Satz-/Eintrag-Text und ihre jeweilige Fortsetzung (nach einer
   * eingeschobenen Aufzählung) DENSELBEN Textpfad teilen (derselbe Satz),
   * aber zwei getrennte DOM-Blätter sind – ohne versatz würden beide bei
   * Zeichen 0 zu zählen anfangen und sich gegenseitig falsche Treffer
   * unterjubeln. versatz = Länge des vorangehenden Teils (z.B. satz.text vor
   * satz.fortsetzung); Standardwert 0 für das erste/einzige Blatt.
   */
  versatz?: number;
  /**
   * xmlId der Norm/Überschrift, in der dieses Blatt liegt – nötig für den
   * Klick auf ein 'verweismarkierung'-Segment (Ausgangsstelle für den Verlaufs-Eintrag,
   * siehe MarkierungCtx.onVerweisKlick / App.tsx: handleVerweisKlick).
   * Optional, da nicht jeder TextBlatt-Aufrufer (noch) durchreicht – ohne
   * ausgangsXmlId bleibt der Verweis lediglich nicht klickbar.
   */
  ausgangsXmlId?: string;
}) {
  const { onVerweisKlick, onMarkierungRechtsklick, onKommentarKlick } = useContext(MarkierungCtx);
  const auszeichnungen: Textauszeichnung[] = [
    ...markierungen.map((markierung): Textauszeichnung => ({ typ: 'markierung', markierung })),
    ...(getaggteVerweise ?? []),
  ];
  const passende = auszeichnungen.flatMap((auszeichnung): Textauszeichnung[] => {
    const textstelle =
      auszeichnung.typ === 'getaggterVerweis'
        ? auszeichnung.verweis.textstelle
        : auszeichnung.markierung.bezug.textstelle;
    if (
      !textstelle ||
      !pfadGleich(textstelle.pfad, pfad) ||
      textstelle.zeichenbereichStart < versatz ||
      textstelle.zeichenbereichEnde > versatz + text.length
    )
      return [];
    const lokal = {
      ...textstelle,
      zeichenbereichStart: textstelle.zeichenbereichStart - versatz,
      zeichenbereichEnde: textstelle.zeichenbereichEnde - versatz,
    };
    if (auszeichnung.typ === 'getaggterVerweis') {
      return [{ typ: 'getaggterVerweis', verweis: { ...auszeichnung.verweis, textstelle: lokal } }];
    }
    const markierung = auszeichnung.markierung;
    if (markierung.bezug.typ !== 'bezugstext') return [];
    return [
      {
        typ: 'markierung',
        markierung: { ...markierung, bezug: { ...markierung.bezug, textstelle: lokal } },
      },
    ];
  });
  // Schutz und Gruppen entstehen am vollständigen Blatt, bevor dekorative
  // Grenzen eingeführt werden. Die Transformation ersetzt ausschließlich 1:1.
  const anzeigeText = geschuetzterBlatttext(text);
  const segmente = segmentiereDarstellungstext(anzeigeText, passende, true);

  // Laufender Zeichen-Offset jedes Segments innerhalb von `text` (versatz-
  // bereinigt, wie bei m.textstelle.zeichenbereichStart/-Ende in `passende` oben) – wird für
  // den Rechtsklick-Handler unten gebraucht, um bei MEHREREN Verweismarkierungen
  // im selben Textpfad (z.B. zwei Verweise im selben Satz) das tatsächlich
  // angeklickte Segment von den anderen zu unterscheiden.
  let laufenderOffset = 0;
  const segmentOffsets: number[] = [];
  for (const seg of segmente) {
    segmentOffsets.push(laufenderOffset);
    laufenderOffset += seg.text.text.length;
  }

  return (
    <span
      style={style}
      data-leaf=""
      data-absatz={pfad.absatz ?? undefined}
      data-absatz-wiederholung={pfad.absatzWiederholung || undefined}
      data-unterabsatz={pfad.unterabsatz}
      data-satz={pfad.satz !== undefined ? String(pfad.satz) : undefined}
      data-eintraege={
        pfad.eintraege && pfad.eintraege.length > 0 ? JSON.stringify(pfad.eintraege) : undefined
      }
      data-satz-in-eintrag={
        pfad.satzInEintrag !== undefined ? String(pfad.satzInEintrag) : undefined
      }
      data-bereich={pfad.bereich}
      data-zeichen-versatz={versatz > 0 ? String(versatz) : undefined}
    >
      {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: TextBlatt gibt geschuetzterBlatttext über mitUmbruchschutz und geschützte Segmente aus; textBlatt.auswahl.test.tsx prüft UTF-16-Positionen. */}
      {mitUmbruchschutz(anzeigeText, (gruppe, gruppenStart) =>
        segmente.map((original, i) => {
          const segStart = segmentOffsets[i]!;
          const segEnde = segStart + original.text.text.length;
          const von = Math.max(gruppenStart, segStart);
          const bis = Math.min(gruppenStart + gruppe.text.length, segEnde);
          if (bis <= von) return null;
          const seg = teileDarstellungssegment(original, von - segStart, bis - segStart);
          // Handler behalten den vollständigen Segmentbereich; nur die
          // Darstellung wird geteilt. Anhänge stehen allein am Originalende.
          const gemeinsam = {
            seg,
            segStart,
            segEnde,
            pfad,
            markierungen,
            getaggteVerweise,
            versatz,
            ausgangsXmlId,
          };
          if (seg.typ === 'unterstreichung' || seg.typ === 'hervorhebung') {
            return (
              <UnterstreichungsSegment
                key={i}
                {...gemeinsam}
                onMarkierungRechtsklick={onMarkierungRechtsklick}
                markierungAnfang={von === segStart}
                markierungEnde={bis === segEnde}
              />
            );
          }
          if (seg.typ === 'verweismarkierung' || seg.typ === 'getaggterVerweis') {
            return (
              <VerweisSegment
                key={i}
                {...gemeinsam}
                zeigeAnhang={bis === segEnde}
                onVerweisKlick={onVerweisKlick}
                onMarkierungRechtsklick={onMarkierungRechtsklick}
              />
            );
          }
          if (seg.typ === 'kommentar') {
            return (
              <KommentarSegment
                key={i}
                {...gemeinsam}
                zeigeAnhang={bis === segEnde}
                onKommentarKlick={onKommentarKlick}
                onMarkierungRechtsklick={onMarkierungRechtsklick}
              />
            );
          }
          return (
            <span key={i}>
              {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: TextBlatt gibt seg.text über mitFixierterLeerzeichenbreite aus; textBlatt.auswahl.test.tsx prüft Originalpositionen. */}
              {mitFixierterLeerzeichenbreite(seg.text)}
            </span>
          );
        }),
      )}
    </span>
  );
}
