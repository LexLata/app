// AktualisierenOverlay.inhalt.tsx
// Darstellung der Kandidaten, ihrer laufenden Vorgänge und der Bestandshinweise.
import { UeberlagerterScrollbereich } from '@/components/scrollbereich/UeberlagerterScrollbereich';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { AktualisierungsKategorie } from '@/lib/import/import.index';
import { formatDatumLang, formatAusfertigung } from '@/lib/utils/datumFormat';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert, zeilePadding } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { ArrowsClockwise } from '@phosphor-icons/react';

// Typen

export type LadeZustand =
  | { laedt: LesbarerSuchverzeichniseintrag }
  | { kategorie: AktualisierungsKategorie }
  | { fehler: string };

function istKategorie(z: LadeZustand | undefined): z is { kategorie: AktualisierungsKategorie } {
  return typeof z === 'object' && z !== null && 'kategorie' in z;
}

// Leer-Zustand

export function LeerZustand({ hinweis }: { hinweis?: string }) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: abstandRollen.gross,
        padding: pxSkaliert(48, uiFaktor),
        color: 'var(--text-sekundaer)',
      }}
    >
      <span style={{ opacity: 0.3, display: 'flex' }}>
        <ArrowsClockwise size={pxSkaliert(36, uiFaktor)} weight="regular" />
      </span>
      <TextAnzeige
        style={textRollen.leererZustandText}
        text="Keine Gesetze aus dem Internet importiert."
      />
      {hinweis && <TextAnzeige style={textRollen.hinweistext} text={hinweis} />}
    </div>
  );
}

// Kandidaten-Liste

interface KandidatenListeProps {
  kandidaten: LesbarerSuchverzeichniseintrag[];
  zustaende: Record<string, LadeZustand>;
  irgendwasLaedt: boolean;
  wirdErmittelt: boolean;
  hinweis?: string;
  zuletztAktualisiert: Date | null;
  onEinzeln: (g: LesbarerSuchverzeichniseintrag) => void;
  onAlle: () => void;
}

export function KandidatenListe({
  kandidaten,
  zustaende,
  irgendwasLaedt,
  wirdErmittelt,
  hinweis,
  zuletztAktualisiert,
  onEinzeln,
  onAlle,
}: KandidatenListeProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const buttonRollen = useButtonRollen();
  const abstandRollen = useAbstandRollen();
  return (
    <>
      {/* Scrollbare Liste */}
      <UeberlagerterScrollbereich beschriftung="Gesetze aktualisieren">
        <>
          {kandidaten.length === 0 && (
            <TextAnzeige
              element="div"
              style={{ ...textRollen.leererZustandText, padding: zeilePadding(uiFaktor) }}
              text="Keine Treffer."
            />
          )}
          {kandidaten.map((gesetz, idx) => (
            <KandidatZeile
              key={gesetzesreferenzSchluessel(gesetz)}
              gesetz={gesetz}
              zustand={zustaende[gesetzesreferenzSchluessel(gesetz)]}
              istLetzter={idx === kandidaten.length - 1}
              deaktiviert={wirdErmittelt}
              onAktualisieren={() => onEinzeln(gesetz)}
            />
          ))}
        </>
      </UeberlagerterScrollbereich>

      {/* Fußzeile */}
      <div
        style={{
          borderTop: '1px solid var(--rahmen)',
          padding: zeilePadding(uiFaktor),
          display: 'flex',
          flexDirection: 'column',
          gap: abstandRollen.kompakt,
          flexShrink: 0,
        }}
      >
        <TextAnzeige
          style={{ fontSize: pxSkaliert(11, uiFaktor), color: 'var(--text-primaer)' }}
          text={
            zuletztAktualisiert
              ? `Zuletzt aktualisiert: ${formatDatumLang(zuletztAktualisiert)}`
              : 'Zuletzt aktualisiert: –'
          }
        />
        {hinweis && <TextAnzeige style={textRollen.hinweistext} text={hinweis} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: abstandRollen.standard }}>
          <TextAnzeige
            style={{ ...textRollen.hinweistext, flex: 1 }}
            text="Quelle: gesetze-im-internet.de / landesrecht-bw.de / EUR-Lex"
          />
          <button
            onClick={onAlle}
            disabled={irgendwasLaedt || wirdErmittelt}
            style={buttonRollen.primaer(irgendwasLaedt || wirdErmittelt)}
          >
            <TextAnzeige text="Alle aktualisieren" />
          </button>
        </div>
      </div>
    </>
  );
}

// Einzelne Zeile

interface KandidatZeileProps {
  gesetz: LesbarerSuchverzeichniseintrag;
  zustand: LadeZustand | undefined;
  istLetzter: boolean;
  deaktiviert: boolean;
  onAktualisieren: () => void;
}

function KandidatZeile({
  gesetz,
  zustand,
  istLetzter,
  deaktiviert,
  onAktualisieren,
}: KandidatZeileProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: abstandRollen.gross,
        padding: zeilePadding(uiFaktor),
        borderBottom: istLetzter ? 'none' : '1px solid var(--rahmen)',
      }}
    >
      {/* Metadaten */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <TextAnzeige
          element="div"
          style={{ ...textRollen.standardtextBetont }}
          text={gesetz.kurztitel}
        />
        {!!(gesetz.aenderungsvermerk || gesetz.ausfertigung) && (
          <TextAnzeige
            element="div"
            text={
              gesetz.aenderungsvermerk ??
              `Ausgefertigt: ${formatAusfertigung(gesetz.ausfertigung ?? '')}`
            }
            style={{
              ...textRollen.hinweistext,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: pxSkaliert(2, uiFaktor),
            }}
          />
        )}
      </div>

      {/* Status-Anzeige */}
      <ZustandsAnzeige
        deaktiviert={deaktiviert}
        zustand={zustand}
        onAktualisieren={onAktualisieren}
      />
    </div>
  );
}

// Zustandsanzeige (Button / Spinner / Erfolg-Kategorie / Fehler)

/** Text + Farbe pro Kategorie – 'unveraendert' bewusst neutral (nicht grün),
 *  damit die Zeile der Sammelnachricht ("Keine Neuerungen.") nicht
 *  widerspricht. */
function kategorieAnzeige(kategorie: AktualisierungsKategorie): { text: string; farbe: string } {
  switch (kategorie) {
    case 'unveraendert':
      return { text: 'Keine Neuerungen', farbe: 'var(--text-sekundaer)' };
    case 'aktualisiert':
      return { text: '✓ Aktualisiert', farbe: 'var(--text-primaer)' };
  }
}

function ZustandsAnzeige({
  deaktiviert,
  zustand,
  onAktualisieren,
}: {
  zustand: LadeZustand | undefined;
  deaktiviert: boolean;
  onAktualisieren: () => void;
}) {
  const textRollen = useTextRollen();
  const buttonRollen = useButtonRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  if (zustand === undefined) {
    return (
      <button
        disabled={deaktiviert}
        onClick={onAktualisieren}
        style={{
          ...buttonRollen.sekundaerKompakt(),
          padding: buttonRollen.paddingFaktorKompakt(4 / 6, 12 / 14),
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        <TextAnzeige text="Aktualisieren" />
      </button>
    );
  }

  if ('laedt' in zustand) {
    return (
      <TextAnzeige
        style={{
          ...textRollen.hinweistext,
          flexShrink: 0,
          width: pxSkaliert(100, uiFaktor),
          textAlign: 'right',
        }}
        text="Lädt …"
      />
    );
  }

  if (istKategorie(zustand)) {
    const { text, farbe } = kategorieAnzeige(zustand.kategorie);
    return (
      <TextAnzeige
        style={{
          ...textRollen.standardtextBetont,
          color: farbe,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: pxSkaliert(4, uiFaktor),
        }}
        text={text}
      />
    );
  }

  // Fehler
  return (
    <TextAnzeige
      style={{
        ...textRollen.fehlertext,
        flexShrink: 0,
        maxWidth: pxSkaliert(180, uiFaktor),
        textAlign: 'right',
      }}
      title={zustand.fehler}
      text={`✗ ${zustand.fehler}`}
    />
  );
}
