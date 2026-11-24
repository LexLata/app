// Zeigt Verlaufseinträge für Normen und Überschriften; nur Normen bieten eine Vorschau.
// Doppelklick navigiert im aktuellen Tab: Liste bleibt, Zeiger folgt erst bei Erfolg.
// ⌘/⌃-Klick öffnet einen neuen Tab mit eigenem Starteintrag.

import { UeberlagerterScrollbereich } from '@/components/scrollbereich/UeberlagerterScrollbereich';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useEffect, useState } from 'react';
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import { OverlayRahmen, OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import { AbsatzListe } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { vollstaendigeBezeichnung } from '@/lib/domain/norm/norm.index';
import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { TabVerlauf, VerlaufEintrag } from '@/lib/domain/appTypes';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { overlayAussenPadding, pxSkaliert, zeilePadding } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { CaretRight, ClockCounterClockwise } from '@phosphor-icons/react';

import type { AbsatzListeProps } from '@/components/gesetzestextansicht/gesetzestextansicht.index';

/** Tabverlauf; die Navigation erfolgt nach dem Schließen durch den Aufrufer. */
export interface VerlaufOverlayProps {
  textDarstellung: Pick<
    AbsatzListeProps,
    'schriftart' | 'zeilenabstand' | 'blocksatz' | 'satzNeuZeile'
  > & {
    schriftgroesse: number;
    silbentrennung: boolean;
  };
  verlauf: TabVerlauf;
  ladeGesetz: GesetzLader;
  onSchliessen: () => void;
  /** Nach onSchliessen; navigiert im aktuellen Tab zum übergebenen Element. */
  onOeffnen: (gesetzesreferenz: Gesetzesreferenz, xmlId: string) => void;
  /** Nach onSchliessen; öffnet das übergebene Element in einem neuen Tab. */
  onNeuenTabOeffnen: (gesetzesreferenz: Gesetzesreferenz, xmlId: string) => void;
}

interface AufgeloesterEintrag {
  eintrag: VerlaufEintrag;
  istNorm?: boolean;
  titel?: string;
  anzeigeBezeichnung: string; // z.B. "Art. 229 § 3" oder "§ 1303"
}

/** Nur der angeforderte Verlauf wird aufgelöst; gespeichert wird die Zeilenanzeige, kein Gesetz. */
function loeseEintragAuf(eintrag: VerlaufEintrag, gesetz?: GesetzDarstellung): AufgeloesterEintrag {
  const element = gesetz?.elemente.find((el) => el.data.xmlId === eintrag.xmlId);
  if (!gesetz || !element) return { eintrag, anzeigeBezeichnung: 'Eintrag nicht verfügbar' };
  if (element.typ === 'ueberschrift')
    return { eintrag, titel: element.data.titel, anzeigeBezeichnung: element.data.bezeichnung };
  return {
    eintrag,
    istNorm: true,
    titel: element.data.titel,
    anzeigeBezeichnung: vollstaendigeBezeichnung(gesetz, eintrag.xmlId) ?? element.data.bezeichnung,
  };
}
export function VerlaufOverlay({
  textDarstellung,
  verlauf,
  ladeGesetz,
  onSchliessen,
  onOeffnen,
  onNeuenTabOeffnen,
}: VerlaufOverlayProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const eintraege: VerlaufEintrag[] = verlauf.eintraege;

  return (
    <OverlayRahmen onSchliessen={onSchliessen} breite={OVERLAY_BREITE_GROSS}>
      <OverlayKopfzeile icon={ClockCounterClockwise} titel="Verlauf" onSchliessen={onSchliessen} />

      {/* ── Liste ── */}
      {verlauf.eintraege.length > 0 ? (
        <UeberlagerterScrollbereich beschriftung="Verlauf">
          <>
            {eintraege.map((eintrag) => (
              <VerlaufZeile
                textDarstellung={textDarstellung}
                key={`${gesetzesreferenzSchluessel(eintrag.gesetzesreferenz)}:${eintrag.xmlId}`}
                eintrag={eintrag}
                ladeGesetz={ladeGesetz}
                onOeffnen={() => {
                  onSchliessen();
                  onOeffnen(eintrag.gesetzesreferenz, eintrag.xmlId);
                }}
                onNeuenTabOeffnen={() => {
                  onSchliessen();
                  onNeuenTabOeffnen(eintrag.gesetzesreferenz, eintrag.xmlId);
                }}
              />
            ))}
          </>
        </UeberlagerterScrollbereich>
      ) : (
        <TextAnzeige
          element="div"
          text="Noch keine Einträge im Verlauf dieses Tabs"
          style={{
            padding: `${pxSkaliert(28, uiFaktor)}px ${pxSkaliert(16, uiFaktor)}px`,
            ...textRollen.leererZustandText,
            textAlign: 'center',
          }}
        />
      )}
    </OverlayRahmen>
  );
}

// ---------------------------------------------------------------------------
// VerlaufZeile
// ---------------------------------------------------------------------------

interface VerlaufZeileProps {
  textDarstellung: VerlaufOverlayProps['textDarstellung'];
  eintrag: VerlaufEintrag;
  ladeGesetz: GesetzLader;
  onOeffnen: () => void;
  onNeuenTabOeffnen: () => void;
}

function VerlaufZeile({
  textDarstellung,
  eintrag,
  ladeGesetz,
  onOeffnen,
  onNeuenTabOeffnen,
}: VerlaufZeileProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const pfeilbreite = Math.round(10 * uiFaktor);
  const texteinzug = overlayAussenPadding(uiFaktor) + pfeilbreite + abstandRollen.standard;
  const [aufgeloest, setAufgeloest] = useState(() => loeseEintragAuf(eintrag));
  useEffect(() => {
    let aktiv = true;
    void ladeGesetz(eintrag.gesetzesreferenz, undefined, { behalten: false }).then((ergebnis) => {
      if (aktiv)
        setAufgeloest(
          loeseEintragAuf(eintrag, ergebnis.status === 'geladen' ? ergebnis.gesetz : undefined),
        );
    });
    return () => {
      aktiv = false;
    };
  }, [eintrag, ladeGesetz]);
  const { istNorm, titel, anzeigeBezeichnung } = aufgeloest;
  const [aufgeklappt, setAufgeklappt] = useState(false);
  const [vorschau, setVorschau] = useState<{ norm: NormDarstellung; sprache?: string } | null>(
    null,
  );
  useEffect(() => {
    if (!aufgeklappt) return;
    let aktiv = true;
    const anzeigen = (gesetz?: GesetzDarstellung) => {
      const element = gesetz?.elemente.find((el) => el.data.xmlId === eintrag.xmlId);
      if (aktiv && element?.typ === 'norm')
        setVorschau({ norm: element.data, sprache: gesetz?.sprache });
    };
    void ladeGesetz(eintrag.gesetzesreferenz, undefined, { behalten: false }).then((ergebnis) =>
      anzeigen(ergebnis.status === 'geladen' ? ergebnis.gesetz : undefined),
    );
    return () => {
      aktiv = false;
    };
  }, [aufgeklappt, eintrag, ladeGesetz]);

  // Kopfzeile: "§ 1303 BGB: Ehemündigkeit" (alles in einer Zeile, Doppelpunkt
  // zwischen Gesetzkürzel und Titel). Ist kein Titel vorhanden, entfällt
  // der Doppelpunkt.
  const kopfText = titel
    ? `${anzeigeBezeichnung} ${aufgeloest.eintrag.gesetzesreferenz.kurztitel}: ${titel}`
    : `${anzeigeBezeichnung} ${aufgeloest.eintrag.gesetzesreferenz.kurztitel}`;

  // Aufgeklappter Zustand wird lokal in dieser Zeile gehalten (kein
  // App-weiter Einklapp-State nötig) – AbsatzListe braucht keinen
  // EinklappCtx, sie rendert unabhängig davon direkt den Norminhalt.

  return (
    <div style={{ borderBottom: '1px solid var(--rahmen)' }}>
      {/* Kopfzeile – immer sichtbar, eine Zeile */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: zeilePadding(uiFaktor),
          paddingRight: texteinzug,
          cursor: 'pointer',
          userSelect: 'none',
          gap: abstandRollen.standard,
        }}
        onClick={
          istNorm
            ? () => {
                if (aufgeklappt) setVorschau(null);
                setAufgeklappt((a) => !a);
              }
            : undefined
        }
        onDoubleClick={(e) => {
          e.preventDefault();
          onOeffnen();
        }}
        onMouseDown={(e) => {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onNeuenTabOeffnen();
          }
        }}
      >
        {/* Aufklapp-Indikator */}
        <span
          style={{
            width: pfeilbreite,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            color: 'var(--symbol-gedaempft)',
          }}
        >
          {istNorm ? (
            <CaretRight
              size={pfeilbreite}
              weight="bold"
              style={{
                transform: aufgeklappt ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 120ms ease',
              }}
            />
          ) : null}
        </span>

        {/* Haupttext: "§ 1303 BGB: Ehemündigkeit" */}
        <TextAnzeige
          text={kopfText}
          style={{
            ...textRollen.standardtextBetont,
            // Freigegebene Textgröße aus den Einstellungen gilt auch für Verlaufköpfe.
            fontSize: textDarstellung.schriftgroesse,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.4,
          }}
        />
      </div>

      {/* Aufgeklappter Norminhalt */}
      {aufgeklappt && vorschau ? (
        <div
          className="gesetz-text"
          style={{
            padding: `0 ${texteinzug}px ${pxSkaliert(10, uiFaktor)}px ${texteinzug}px`,
          }}
        >
          <AbsatzListe
            schriftart={textDarstellung.schriftart}
            zeilenabstand={textDarstellung.zeilenabstand}
            blocksatz={textDarstellung.blocksatz}
            absaetze={vorschau.norm.absaetze}
            zusatztexte={vorschau.norm.zusatztexte}
            schrift={textDarstellung.schriftgroesse}
            satzNeuZeile={textDarstellung.satzNeuZeile}
            sprache={vorschau.sprache}
            silbentrennungAktiviert={textDarstellung.silbentrennung}
          />
        </div>
      ) : null}
    </div>
  );
}
