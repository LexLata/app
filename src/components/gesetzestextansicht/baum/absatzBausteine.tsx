// absatzBausteine.tsx
// Absatz-Ebene der Norminhalt-Render-Bausteine: AbsatzListe, AbsatzBlock und
// UnterabsatzListe. Reicht Markierungen/ausgangsXmlId unverändert nach unten
// an satzEintragBausteine.tsx durch – siehe dortige
// Kopfzeile für die Satz-/Eintrag-Ebene und textBlatt.tsx für
// das gemeinsame Blatt-Rendering-Primitiv (TextBlatt).

import { Fragment } from 'react';
import type { Textauszeichnung } from '@/lib/darstellung/darstellung.index';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useTextMessung } from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { SaetzeListe } from '@/components/gesetzestextansicht/baum/satzEintragBausteine';
import {
  gesetzTextAbsatzAbstand,
  gesetzTextInhaltStil,
  gesetzTextListenStil,
} from '@/components/gesetzestextansicht/baum/textStile';
import type {
  AbsatzDarstellung,
  NormZusatztext,
  UnterabsatzDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';

// ---------------------------------------------------------------------------
// Absatz-Liste
// ---------------------------------------------------------------------------

// Exportiert für VerlaufOverlay.tsx: dort wird nur der Norminhalt (ohne den
// Titel-Header von NormBlock, der eigene Kopfzeile bereits anderweitig
// dargestellt wird) direkt gerendert. VerlaufOverlay übergibt kein
// `markierungen`-Prop (Default: leere Liste) – Unterstreichungen werden
// dort aktuell nicht dargestellt.
export function AbsatzListe({
  absaetze,
  zusatztexte = [],
  schrift,
  satzNeuZeile,
  markierungen = [],
  getaggteVerweise,
  ausgangsXmlId,
}: {
  absaetze: AbsatzDarstellung[];
  zusatztexte?: NormZusatztext[];
  schrift: number;
  satzNeuZeile: boolean;
  markierungen?: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  ausgangsXmlId?: string;
}) {
  const { breiteSpalteFuerBezeichnungen } = useTextMessung();
  const nummeriertCount = absaetze.filter((a) => a.bezeichnung != null).length;
  const hatMehrere = nummeriertCount > 1;

  const absNrBreite = hatMehrere
    ? breiteSpalteFuerBezeichnungen(
        absaetze.map((a) => a.bezeichnung ?? ''),
        schrift,
      )
    : 0;

  return (
    <>
      <NormZusatztexte zusatztexte={zusatztexte} position={0} schrift={schrift} />
      {absaetze.map((abs, index) => (
        <Fragment key={abs.id}>
          <AbsatzBlock
            absatz={abs}
            hatVorgaenger={index > 0 || zusatztexte.some((z) => z.nachAbsatz === 0)}
            absatzWiederholung={
              absaetze.slice(0, index).filter((a) => a.bezeichnung === abs.bezeichnung).length ||
              undefined
            }
            zeigeBezeichnung={hatMehrere}
            absNrBreite={absNrBreite}
            schrift={schrift}
            satzNeuZeile={satzNeuZeile}
            markierungen={markierungen}
            getaggteVerweise={getaggteVerweise}
            ausgangsXmlId={ausgangsXmlId}
          />
          <NormZusatztexte zusatztexte={zusatztexte} position={index + 1} schrift={schrift} />
        </Fragment>
      ))}
    </>
  );
}

function NormZusatztexte({
  zusatztexte,
  position,
  schrift,
}: {
  zusatztexte: NormZusatztext[];
  position: number;
  schrift: number;
}) {
  return (
    <>
      {zusatztexte.map((z, index) =>
        z.nachAbsatz === position ? (
          <div
            key={index}
            data-zusatztext
            style={{
              ...gesetzTextInhaltStil(schrift),
              marginBlockStart:
                position > 0 || index > 0 ? gesetzTextAbsatzAbstand(schrift) : undefined,
            }}
          >
            <TextAnzeige text={z.text} />
          </div>
        ) : null,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Absatz-Block
// ---------------------------------------------------------------------------

function AbsatzBlock({
  absatz,
  hatVorgaenger,
  absatzWiederholung,
  zeigeBezeichnung,
  absNrBreite,
  schrift,
  satzNeuZeile,
  markierungen,
  getaggteVerweise,
  ausgangsXmlId,
}: {
  absatz: AbsatzDarstellung;
  hatVorgaenger: boolean;
  absatzWiederholung?: number;
  zeigeBezeichnung: boolean;
  absNrBreite: number;
  schrift: number;
  satzNeuZeile: boolean;
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  ausgangsXmlId?: string;
}) {
  const { satzNummerBreite } = useTextMessung();
  const marginBlockStart = hatVorgaenger ? gesetzTextAbsatzAbstand(schrift) : undefined;
  const bezeichnungsSpalte = zeigeBezeichnung && absatz.bezeichnung && (
    <span
      style={{
        fontSize: schrift,
        lineHeight: 'var(--zeilen-abstand)',
        minWidth: absNrBreite,
        flexShrink: 0,
      }}
    >
      <TextAnzeige text={absatz.bezeichnung} />
    </span>
  );

  if (absatz.unterabsaetze && absatz.unterabsaetze.length > 0) {
    return (
      <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start', marginBlockStart }}>
        {bezeichnungsSpalte}
        <UnterabsatzListe
          unterabsaetze={absatz.unterabsaetze}
          schrift={schrift}
          satzNeuZeile={satzNeuZeile}
          absatzBezeichnung={absatz.bezeichnung}
          absatzWiederholung={absatzWiederholung}
          markierungen={markierungen}
          getaggteVerweise={getaggteVerweise}
          ausgangsXmlId={ausgangsXmlId}
        />
      </div>
    );
  }

  const satzNrBreite = satzNeuZeile ? satzNummerBreite(absatz.saetze.length, schrift) : 0;

  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        alignItems: 'flex-start',
        marginBlockStart,
        ...(absatz.zwischenueberschrift ? { fontStyle: 'italic' } : {}),
      }}
    >
      {bezeichnungsSpalte}
      <SaetzeListe
        saetze={absatz.saetze}
        satzNrBreite={satzNrBreite}
        schrift={schrift}
        satzNeuZeile={satzNeuZeile}
        basisPfad={{ typ: 'normtext', absatz: absatz.bezeichnung, absatzWiederholung }}
        satzFeld="satz"
        markierungen={markierungen}
        getaggteVerweise={getaggteVerweise}
        ausgangsXmlId={ausgangsXmlId}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unterabsatz-Liste ("[1]", "[2]", … – siehe AbsatzDarstellung.unterabsaetze)
// ---------------------------------------------------------------------------

// Strukturell dasselbe Muster wie SaetzeListe/SatzZeile (Nummer-Spalte links,
// Inhalt rechts) – eine Verschachtelungsebene tiefer, da ein Unterabsatz
// selbst wieder mehrere Sätze enthalten kann. Die Spalte für Absatzbezeichnungen
// (siehe AbsatzBlock) steht bereits links davon; folgende Unterabsätze rücken
// dadurch automatisch unter den ersten (keine eigene Spacer-Logik nötig,
// siehe AbsatzBlock: SaetzeListe/UnterabsatzListe ist EIN Flex-Kind rechts
// von der Bezeichnungsspalte, nicht pro Zeile neu positioniert).
function UnterabsatzListe({
  unterabsaetze,
  schrift,
  satzNeuZeile,
  absatzBezeichnung,
  absatzWiederholung,
  markierungen,
  getaggteVerweise,
  ausgangsXmlId,
}: {
  unterabsaetze: UnterabsatzDarstellung[];
  schrift: number;
  satzNeuZeile: boolean;
  absatzBezeichnung?: string;
  absatzWiederholung?: number;
  markierungen: MarkierungsEintrag[];
  getaggteVerweise?: Textauszeichnung[];
  ausgangsXmlId?: string;
}) {
  const { breiteSpalteFuerBezeichnungen, satzNummerBreite } = useTextMessung();
  const uaNrBreite = breiteSpalteFuerBezeichnungen(
    unterabsaetze.map((ua) => ua.bezeichnung),
    schrift,
  );

  return (
    <div style={gesetzTextListenStil}>
      {unterabsaetze.map((ua) => {
        // Auch bei fortlaufenden Sätzen behält jeder Unterabsatz seinen Block;
        // nur seine Sätze laufen dann im Fließtext (SaetzeListe).
        const satzNrBreite = satzNeuZeile ? satzNummerBreite(ua.saetze.length, schrift) : 0;
        return (
          <div key={ua.id} style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>
            <span
              style={{
                fontSize: schrift,
                lineHeight: 'var(--zeilen-abstand)',
                fontStyle: 'italic',
                minWidth: uaNrBreite,
                flexShrink: 0,
              }}
            >
              <TextAnzeige text={ua.bezeichnung} />
            </span>
            <SaetzeListe
              saetze={ua.saetze}
              satzNrBreite={satzNrBreite}
              schrift={schrift}
              satzNeuZeile={satzNeuZeile}
              basisPfad={{
                typ: 'normtext',
                absatz: absatzBezeichnung,
                absatzWiederholung,
                unterabsatz: ua.bezeichnung,
              }}
              satzFeld="satz"
              markierungen={markierungen}
              getaggteVerweise={getaggteVerweise}
              ausgangsXmlId={ausgangsXmlId}
            />
          </div>
        );
      })}
    </div>
  );
}
