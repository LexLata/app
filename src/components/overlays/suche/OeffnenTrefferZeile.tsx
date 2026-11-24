// OeffnenTrefferZeile.tsx
// Einzelne Ergebniszeile in OeffnenOverlay.tsx – ausgelagert, weil die
// Zeilen-Darstellung (Norm-Label, Gesetzeskurzbefehl-Kasten, Importindex-Quelle-Kasten) recht
// umfangreich ist und rein präsentational ist (keine eigene Such-/Import-
// Logik), daher unabhängig von OeffnenOverlay.tsx testbar/lesbar.

import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import {
  type Gesetzeskurzbefehl,
  gesetzeskurzbefehlAlsText,
} from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import {
  indexNormAnzeige,
  type Suchanfrage,
  IMPORTINDEX_QUELLE_TEXT,
  type SucheTreffer,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import { usePlattform } from '@/hooks/utils/usePlattform';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { zeilePadding, badgePadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';

/** Darstellung eines Suchtreffers; Auswahl, Import und Navigation steuert der Aufrufer. */
export interface TrefferZeileProps {
  idx: number;
  treffer: SucheTreffer;
  markiert: boolean;
  /** Bereits aufgelöste Norm-Bezeichnung (nur bei installierten Treffern möglich). */
  zielnorm?: string;
  /** Gesetzt bei Zwei-Zahlen-Suche (z.B. „229 3") – zeigt den Artikel-Kontext an. */
  artikelNummer?: string;
  /** Geparste Eingabe für Importangebote ohne lokale Normstruktur. */
  anfrage?: Suchanfrage;
  /** Benutzerdefiniertes Gesetzeskurzbefehl für dieses Gesetz (nur bei reiner Gesetzeseingabe). */
  kurzbefehl?: Gesetzeskurzbefehl | null;
  /** Meldet Aktivierung der Zeile; führt selbst weder Import noch Navigation aus. */
  onClick: () => void;
  /** Wird nur bei tatsächlicher Mausbewegung über der Zeile ausgelöst (nicht bei „stillstehendem" Hover). */
  onMausBewegung: () => void;
}

/** Kleiner Hinweis-Kasten, der zeigt, von welcher Quelle ein Importindex-Treffer
 *  bei Auswahl importiert wird (Bund/BW) – optisch wie der Gesetzeskurzbefehl-Kasten. */
function QuelleKasten({ treffer }: { treffer: Extract<SucheTreffer, { art: 'index' }> }) {
  const quelle =
    treffer.quelle === NORMGEBER_EU && treffer.eintrag.abrufkennung.toLowerCase().endsWith('.xml')
      ? 'vorinstalliert'
      : IMPORTINDEX_QUELLE_TEXT[treffer.quelle];
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const radiusRollen = useRadiusRollen();
  return (
    <TextAttributElement
      element="kbd"
      title={`Wird bei Auswahl von ${quelle} importiert`}
      style={{
        ...textRollen.mikrotext,
        padding: badgePadding(uiFaktor),
        borderRadius: radiusRollen.klein,
        border: '1px solid var(--rahmen)',
        background: 'var(--bg-leiste)',
        fontFamily: 'inherit',
        lineHeight: '16px',
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      <TextAnzeige text={`↓ ${quelle}`} />
    </TextAttributElement>
  );
}

export function TrefferZeile({
  idx,
  treffer,
  markiert,
  zielnorm,
  artikelNummer,
  anfrage,
  kurzbefehl,
  onClick,
  onMausBewegung,
}: TrefferZeileProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const radiusRollen = useRadiusRollen();
  // Weder textRollen.standardtext (13px) noch -Betont treffen hier exakt –
  // Norm-/Gesetzesbezeichnung in der Trefferzeile ist bewusst 14px. Einmal
  // berechnet, an den zwei Stellen unten verwendet (vorher zweimal einzeln
  // berechnet).
  const bezeichnungGroesse = Math.round(14 * uiFaktor);
  const { istMac } = usePlattform();
  const kurztitel =
    treffer.gefundenUeber ??
    (treffer.art === 'installiert'
      ? treffer.gesetzesreferenz.kurztitel
      : treffer.eintrag.kurztitel);
  const langtitel = treffer.art === 'installiert' ? treffer.langtitel : treffer.eintrag.langtitel;
  // Bei Importindex-Treffern ist die Norm noch nicht aufgelöst (kein zielnorm) –
  // stattdessen die roh eingegebene Nummer als Hinweis anzeigen.
  const anzeige =
    treffer.art === 'index'
      ? indexNormAnzeige(
          anfrage ?? {
            normNummer: null,
            artikelNummer: artikelNummer ?? null,
            erwaegungsgrundNummer: null,
            gesetzQuery: '',
          },
          treffer.eintrag.praefixstruktur,
          kurztitel,
        )
      : null;
  const normLabel = zielnorm ?? anzeige?.normLabel;
  artikelNummer = anzeige ? (anzeige.artikelNummer ?? undefined) : artikelNummer;

  return (
    <div
      data-idx={idx}
      onClick={onClick}
      onMouseMove={onMausBewegung}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: abstandRollen.gross,
        padding: zeilePadding(uiFaktor),
        background: markiert ? 'color-mix(in srgb, var(--akzent) 14%, transparent)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 0.08s',
      }}
    >
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: abstandRollen.kompakt,
            flexWrap: 'nowrap',
          }}
        >
          {normLabel ? (
            <>
              {artikelNummer && (
                <span style={{ ...textRollen.standardtextBetont, whiteSpace: 'nowrap' }}>
                  <TextAnzeige text={`Art. ${artikelNummer}`} />
                </span>
              )}
              <span
                style={{
                  ...(artikelNummer
                    ? { ...textRollen.standardtext, color: 'var(--text-sekundaer)' }
                    : textRollen.standardtextBetont),
                  fontSize: bezeichnungGroesse,
                  whiteSpace: 'nowrap',
                }}
              >
                <TextAnzeige text={normLabel} />
              </span>
              <span
                style={{
                  ...textRollen.standardtextBetont,
                  color: 'var(--text-sekundaer)',
                  fontSize: bezeichnungGroesse,
                  whiteSpace: 'nowrap',
                }}
              >
                <TextAnzeige text={kurztitel} />
              </span>
              {treffer.art === 'index' && <QuelleKasten treffer={treffer} />}
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: pxSkaliert(7, uiFaktor),
                minWidth: 0,
              }}
            >
              <span
                style={{
                  ...textRollen.standardtextBetont,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <TextAnzeige text={kurztitel} />
              </span>
              {!!kurzbefehl && (
                <kbd
                  style={{
                    ...textRollen.mikrotext,
                    padding: badgePadding(uiFaktor),
                    borderRadius: radiusRollen.klein,
                    border: '1px solid var(--rahmen)',
                    background: 'var(--bg-leiste)',
                    fontFamily: 'inherit',
                    lineHeight: '16px',
                    flexShrink: 0,
                  }}
                >
                  <TextAnzeige text={gesetzeskurzbefehlAlsText(kurzbefehl)} />
                </kbd>
              )}
              {treffer.art === 'index' && <QuelleKasten treffer={treffer} />}
            </div>
          )}
        </div>
        {!!langtitel && (
          <div
            style={{
              ...textRollen.hinweistext,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.4,
              marginTop: pxSkaliert(1, uiFaktor),
            }}
          >
            <TextAnzeige text={langtitel} />
          </div>
        )}
      </div>

      {/* Hinweis beim markierten Eintrag (⌘↩ auf Mac, Strg+Enter sonst) */}
      {markiert && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: pxSkaliert(3, uiFaktor),
            flexShrink: 0,
            marginLeft: pxSkaliert(8, uiFaktor),
          }}
        >
          <span
            style={{
              ...textRollen.hinweistext,
              fontFamily: 'var(--schrift)',
              lineHeight: 1,
            }}
          >
            <TextAnzeige text={tastenkuerzelAnzeige('oeffnen-neuer-tab', istMac)} />
          </span>
          <span style={{ ...textRollen.hinweistext }}>
            <TextAnzeige text="neuer Tab" />
          </span>
        </div>
      )}
    </div>
  );
}
