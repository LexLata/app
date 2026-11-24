// GesetzInfoOverlay.tsx
// Overlay mit Metadaten zum aktuell geöffneten Gesetz.
// Modelliert nach GesetzInfoView.swift aus dem alten Projekt.

import { formatFassung } from '@/lib/domain/gesetzInfos';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useMemo } from 'react';
import type {
  GesetzDarstellung,
  NormDarstellung,
  ListenEintragDarstellung,
} from '@/lib/domain/gesetzTypes';
import { normKurzzeilenTitel, gesetzNormen } from '@/lib/domain/gesetzDarstellungAuswertung';
import { OverlayRahmen, OVERLAY_BREITE_NORMAL } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import { OverlayTrennlinie } from '@/components/overlays/OverlayTrennlinie';
import { formatDatumLang, formatAusfertigung } from '@/lib/utils/datumFormat';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { OVERLAY_AUSSEN_ROH, pxSkaliert } from '@/lib/stil/paddingRollen';
import { Info } from '@phosphor-icons/react';
import { messeSync } from '@/lib/utils/perfMessung';
import { normgeberAnzeigename } from '@/lib/domain/normgeber';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

const MIT_BUCHSTABE_RE = /\d[a-zA-Z]/;

/** Ermittelt die drei Umfangskennzahlen in einem Durchlauf. */
function berechneUmfang(gesetz: GesetzDarstellung) {
  let aktivNormen = 0,
    mitBuchstabe = 0,
    zeichen = 0;
  for (const norm of gesetzNormen(gesetz)) {
    if (normKurzzeilenTitel(norm) === undefined) aktivNormen++;
    if (MIT_BUCHSTABE_RE.test(norm.bezeichnung)) mitBuchstabe++;
    zeichen += normZeichen(norm);
  }
  return { aktivNormen, mitBuchstabe, zeichen };
}

function normZeichen(norm: NormDarstellung): number {
  return norm.absaetze.reduce(
    (s, abs) =>
      s +
      abs.saetze.reduce(
        (s2, satz) =>
          s2 +
          satz.text.length +
          (satz.fortsetzung?.length ?? 0) +
          satz.eintraege.reduce((s3, e) => s3 + eintragZeichen(e), 0),
        0,
      ),
    0,
  );
}

function eintragZeichen(e: ListenEintragDarstellung): number {
  return (
    e.text.length +
    (e.fortsetzung?.length ?? 0) +
    e.untereintraege.reduce((s, u) => s + eintragZeichen(u), 0)
  );
}

/** Zahl mit Tausenderpunkt formatieren */
function formatZahl(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n);
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Informationen zum übergebenen Gesetz ohne Änderung der Gesetzesdaten. */
export interface GesetzInfoOverlayProps {
  gesetz: GesetzDarstellung;
  onSchliessen: () => void;
}

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export function GesetzInfoOverlay({ gesetz, onSchliessen }: GesetzInfoOverlayProps) {
  const uiFaktor = useUiSkalierungsFaktor();
  const { aktivNormen, mitBuchstabe, zeichen } = useMemo(
    () => messeSync('gesetzInfo.umfang', () => berechneUmfang(gesetz)),
    [gesetz],
  );

  const hatFundstelle: boolean = !!gesetz.fundstelle?.trim();
  const hatDatum: boolean = !!(
    gesetz.ausfertigung ||
    gesetz.neugefasst ||
    gesetz.fassung ||
    gesetz.aenderungsvermerk
  );

  const anzeigeDatum = gesetz.verarbeitungszeit;
  const datenquellenwert = gesetz.datenquelle?.name || gesetz.datenquelle?.url;

  return (
    <OverlayRahmen onSchliessen={onSchliessen} breite={OVERLAY_BREITE_NORMAL}>
      <OverlayKopfzeile icon={Info} titel={gesetz.kurztitel} onSchliessen={onSchliessen} />

      {/* Inhalt – scrollbar, z. B. falls Lang-/Kurztitel oder Fundstelle sehr lang sind */}
      <div
        style={{
          padding: `0 ${pxSkaliert(24, uiFaktor)}px ${pxSkaliert(OVERLAY_AUSSEN_ROH, uiFaktor)}px`,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {/* Bezeichnung */}
        <Abschnitt titel="Bezeichnung" />
        {gesetz.langtitel && <Zeile label="Langtitel" wert={gesetz.langtitel} mehrzeilig />}
        <Zeile label="Kurztitel" wert={gesetz.kurztitel} />
        <Zeile label="Normgeber" wert={normgeberAnzeigename(gesetz.normgeber)} />

        {/* Fundstelle */}
        {(hatFundstelle || hatDatum) && (
          <>
            <OverlayTrennlinie style={{ marginTop: pxSkaliert(12, uiFaktor) }} />
            <Abschnitt titel="Fundstelle" />
            {hatFundstelle && (
              <Zeile label="Fundstelle" wert={gesetz.fundstelle!.trim()} mehrzeilig />
            )}
            {gesetz.ausfertigung && (
              <Zeile label="Ausgefertigt" wert={formatAusfertigung(gesetz.ausfertigung)} />
            )}
            {gesetz.neugefasst && <Zeile label="Neufassung" wert={gesetz.neugefasst} />}
            {!!gesetz.fassung && <Zeile label="Fassung" wert={formatFassung(gesetz.fassung)} />}
            {gesetz.aenderungsvermerk && (
              <Zeile label="Letzte Änderung" wert={gesetz.aenderungsvermerk} />
            )}
          </>
        )}

        {/* Umfang */}
        <OverlayTrennlinie style={{ marginTop: pxSkaliert(12, uiFaktor) }} />
        <Abschnitt titel="Umfang" />
        <Zeile label="Normen" wert={String(aktivNormen)} />
        {mitBuchstabe > 0 && <Zeile label="Mit Buchstabe" wert={String(mitBuchstabe)} />}
        <Zeile label="Zeichen" wert={formatZahl(zeichen)} />

        {/* Import */}
        <OverlayTrennlinie style={{ marginTop: pxSkaliert(12, uiFaktor) }} />
        <Abschnitt titel="Import" />
        {!!datenquellenwert && <Zeile label="Datenquelle" wert={datenquellenwert} />}
        <Zeile
          label="Importiert am"
          wert={anzeigeDatum ? formatDatumLang(anzeigeDatum) : 'unbekannt'}
        />
      </div>
    </OverlayRahmen>
  );
}

// ---------------------------------------------------------------------------
// Hilfskomponenten
// ---------------------------------------------------------------------------

function Abschnitt({ titel }: { titel: string }) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <TextAnzeige
      element="div"
      text={titel}
      style={{
        ...textRollen.abschnittsUeberschrift,
        paddingTop: pxSkaliert(16, uiFaktor),
        paddingBottom: pxSkaliert(4, uiFaktor),
      }}
    />
  );
}

function Zeile({
  label,
  wert,
  mehrzeilig = false,
}: {
  label: string;
  wert: string;
  mehrzeilig?: boolean;
}) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: mehrzeilig ? 'flex-start' : 'baseline',
        gap: 0,
        padding: `${pxSkaliert(3, uiFaktor)}px 0`,
      }}
    >
      <TextAnzeige
        text={label}
        style={{
          ...textRollen.standardtext,
          width: pxSkaliert(140, uiFaktor),
          flexShrink: 0,
          color: 'var(--text-sekundaer)',
        }}
      />
      <TextAnzeige style={{ ...textRollen.standardtext, flex: 1, lineHeight: 1.5 }} text={wert} />
    </div>
  );
}
