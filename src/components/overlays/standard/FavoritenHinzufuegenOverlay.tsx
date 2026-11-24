// FavoritenHinzufuegenOverlay.tsx
//
// Overlay zum Hinzufügen mehrerer Favoriten auf einmal für das aktive Gesetz.
// Eingabe: durch Leerzeichen getrennte Bezeichnungen, z.B. „280 433 985".
// Untergeordnete Normen mit Bindestrich: „247-1" → „Art. 247 § 1".
//
// Validierung: jede Eingabe wird per loeseLesezeichenOderFavoritAuf gegen das Gesetz geprüft;
// nicht gefundene Normen werden nicht gespeichert und im Bericht als
// 'nichtGefunden' markiert.

import type { ReactElement } from 'react';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useState, useEffect, useRef } from 'react';
import { OverlayRahmen, OVERLAY_BREITE_KOMPAKT } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import {
  loeseLesezeichenOderFavoritAuf,
  vollstaendigeBezeichnung,
  pruefeKurzform,
} from '@/lib/domain/norm/norm.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { overlayAussenPadding, eingabefeldPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { OverlayTrennlinie } from '@/components/overlays/OverlayTrennlinie';
import { ImportBerichtZeile } from '@/components/overlays/standard/ImportBerichtZeile';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import { Star } from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

const favoritenErklaertext =
  'Normen eingeben, mehrere durch Leerzeichen trennen. Reihenfolge ist egal. Untergeordnete Normen mit Bindestrich eingeben, z.\u00a0B. 247-1 für Art 247 § 1 EGBGB.';

type EintragStatus = 'ok' | 'vorhanden' | 'nichtGefunden';

interface BerichtEintrag {
  id: string;
  status: EintragStatus;
  /** Angezeigter Bezeichner (Eingabe-Format, z.B. „247-1") */
  anzeige: string;
  /** Gespeicherte volle Bezeichnung (z.B. „Art. 247 § 1") */
  bezeichnung: string;
}

/** Favoritenanlage mit Ergebnisbericht; Speicherfehler werden protokolliert, das Overlay bleibt offen. */
export interface FavoritenHinzufuegenOverlayProps {
  gesetz: GesetzDarstellung;
  onSchliessen: () => void;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Wandelt eine Benutzereingabe-Bezeichnung in das gespeicherte Bezeichnung-
 * Format um. Bindestrich-Trennzeichen (z.B. „247-1") → Leerzeichen
 * (→ „247 1"). Nur der erste Bindestrich wird ersetzt (mehrstufige
 * Verschachtelungen gibt es im Bundesrecht nicht).
 */
function eingabeZuBezeichnung(token: string): string {
  return token.replace('-', ' ');
}

function berichtEintrag(
  status: EintragStatus,
  anzeige: string,
  bezeichnung: string,
): BerichtEintrag {
  return { id: crypto.randomUUID(), status, anzeige, bezeichnung };
}

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export function FavoritenHinzufuegenOverlay({
  gesetz,
  onSchliessen,
}: FavoritenHinzufuegenOverlayProps) {
  const buttonRollen = useButtonRollen();
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const radiusRollen = useRadiusRollen();
  const [eingabe, setEingabe] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [bericht, setBericht] = useState<BerichtEintrag[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fokus beim Öffnen
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Initiale Höhe wie im onChange-Handler unten berechnen (scrollHeight
  // statt der ungesetzten Browser-Default-Höhe für rows=1) – sonst weicht
  // die tatsächlich gerenderte Anfangshöhe minimal von der Höhe nach der
  // ersten Eingabe ab, wodurch das Feld beim ersten Tastendruck sichtbar
  // schrumpft (Bugfix, siehe auch FensterEingabeFeld.tsx).
  useEffect(() => {
    if (textareaRef.current) passeHoeheAn(textareaRef.current);
  }, []);

  // ---------------------------------------------------------------------------
  // Textarea: automatisch wachsen
  // ---------------------------------------------------------------------------

  function passeHoeheAn(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  // ---------------------------------------------------------------------------
  // Speicher-Logik
  // ---------------------------------------------------------------------------

  async function speichereFavoriten() {
    const tokens = eingabe.trim().match(/(?:§|Art\.?|Artikel|Anlage|Anhang)\s+\S+|\S+/gi) ?? [];
    if (!tokens.length || laeuft) return;

    setLaeuft(true);
    setBericht([]);

    try {
      // Alle Tokens in Bezeichnung-Format umwandeln und gegen das Gesetz validieren
      const validiert = tokens.map((token) => {
        const bezeichnung = eingabeZuBezeichnung(token);
        const norm = loeseLesezeichenOderFavoritAuf(gesetz, bezeichnung).norm;
        const element = norm ? { typ: 'norm' as const, data: norm } : null;
        const gefunden = element !== null && pruefeKurzform(gesetz, element)?.ok === true;
        return {
          token,
          bezeichnung: norm
            ? (vollstaendigeBezeichnung(gesetz, norm.xmlId) ?? bezeichnung)
            : bezeichnung,
          gefunden,
        };
      });

      const gefundeneBezeichnungen = validiert.filter((v) => v.gefunden).map((v) => v.bezeichnung);

      // Nur gefundene Normen speichern
      let neuHinzugefuegt = new Set<string>();
      if (gefundeneBezeichnungen.length > 0) {
        const { hinzufuegenFavoriten } =
          await import('@/lib/persistenz/nutzerdaten/favoritenSpeicher');
        neuHinzugefuegt = await hinzufuegenFavoriten(gesetz, gefundeneBezeichnungen);
      }

      const neueBericht: BerichtEintrag[] = validiert.map(({ token, bezeichnung, gefunden }) => {
        if (!gefunden) return berichtEintrag('nichtGefunden', token, bezeichnung);
        if (neuHinzugefuegt.has(bezeichnung)) return berichtEintrag('ok', token, bezeichnung);
        return berichtEintrag('vorhanden', token, bezeichnung);
      });

      setBericht(neueBericht);
    } catch (fehler) {
      // Kein eigener Fehler-Status in BerichtEintrag (siehe EintragStatus) –
      // würde eine zusätzliche Anzeige-Variante erfordern; das Overlay bleibt
      // ohne sichtbares Ergebnis, aber (wichtig für no-floating-promises)
      // NICHT dauerhaft im "läuft"-Zustand hängen (siehe finally unten).
      console.error('Favoriten konnten nicht gespeichert werden:', fehler);
    } finally {
      setLaeuft(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const berichtElemente: ReactElement[] = bericht.map((e): ReactElement => (
    <BerichtZeile key={e.id} eintrag={e} />
  ));
  const zeigeBericht = bericht.length > 0;
  const anzahlNeu = bericht.filter((e) => e.status === 'ok').length;
  const anzahlNichtGefund = bericht.filter((e) => e.status === 'nichtGefunden').length;
  // Einzelzeilen anzeigen, wenn das Ergebnis nicht einheitlich ist
  const zeigeEinzelzeilen = zeigeBericht && bericht.some((e) => e.status !== bericht[0]!.status);

  return (
    <OverlayRahmen
      onSchliessen={onSchliessen}
      breite={OVERLAY_BREITE_KOMPAKT}
      kannSchliessen={!laeuft}
    >
      <OverlayKopfzeile
        icon={Star}
        titel={`Favoriten hinzufügen: ${gesetz.kurztitel}`}
        onSchliessen={onSchliessen}
        schliessenDeaktiviert={laeuft}
      />

      {/* Inhalt – inkl. Buttons scrollbar, falls der Bericht mal sehr lang wird */}
      <div
        style={{
          padding: overlayAussenPadding(uiFaktor),
          display: 'flex',
          flexDirection: 'column',
          gap: abstandRollen.gross,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        {/* Erklärtext + Eingabe */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: abstandRollen.kompakt }}>
          <TextAnzeige
            style={textRollen.hinweistext}
            text={favoritenErklaertext}
            hervorhebungen={[
              {
                von: favoritenErklaertext.indexOf('247-1'),
                bis: favoritenErklaertext.indexOf('247-1') + 5,
              },
            ]}
            hervorhebungStil={{
              fontFamily: 'ui-monospace, Menlo, monospace',
              fontWeight: 'inherit',
            }}
          />
          <TextAttributElement
            element="textarea"
            ref={textareaRef}
            value={eingabe}
            rows={1}
            onChange={(e) => {
              setEingabe(e.target.value);
              passeHoeheAn(e.target);
            }}
            onKeyDown={(e) => {
              // Enter speichert (ohne Shift); Escape schließt das Overlay.
              // Beide Events müssen hier abgefangen werden, da die textarea
              // keydown-Events vor dem window-Listener von OverlayRahmen
              // (useEscapeKey) konsumiert.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void speichereFavoriten();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onSchliessen();
              }
            }}
            placeholder="z. B. 280 433 985"
            disabled={laeuft}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            style={
              {
                ...textRollen.eingabetext,
                width: '100%',
                padding: eingabefeldPadding(uiFaktor),
                fontFamily: 'ui-monospace, Menlo, monospace',
                background: 'var(--bg-eingabe)',
                border: '1px solid var(--rahmen)',
                borderRadius: radiusRollen.standard,
                outline: 'none',
                boxSizing: 'border-box',
                resize: 'none',
                overflow: 'hidden',
                lineHeight: 1.5,
                minHeight: pxSkaliert(34, uiFaktor),
              } as React.CSSProperties
            }
          />
        </div>

        {/* Bericht */}
        {zeigeBericht ? (
          <>
            <OverlayTrennlinie />
            <div style={{ display: 'flex', flexDirection: 'column', gap: pxSkaliert(5, uiFaktor) }}>
              {/* Zusammenfassung */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: abstandRollen.standard,
                  fontSize: pxSkaliert(13, uiFaktor),
                }}
              >
                <TextAnzeige
                  style={{ flexShrink: 0, marginTop: pxSkaliert(1, uiFaktor) }}
                  text={anzahlNeu > 0 ? '✅' : anzahlNichtGefund === bericht.length ? '❌' : 'ℹ️'}
                />
                <TextAnzeige
                  style={{ color: 'var(--text-primaer)' }}
                  text={zusammenfassung(anzahlNeu, anzahlNichtGefund, bericht.length)}
                />
              </div>

              {/* Einzelzeilen: nur bei gemischtem Ergebnis */}
              {zeigeEinzelzeilen ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: pxSkaliert(3, uiFaktor),
                    marginTop: pxSkaliert(4, uiFaktor),
                  }}
                >
                  {berichtElemente}
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: abstandRollen.standard }}>
          <button
            onClick={speichereFavoriten}
            disabled={!eingabe.trim() || laeuft}
            style={buttonRollen.primaer(!eingabe.trim() || laeuft)}
          >
            <TextAnzeige text={laeuft ? 'Speichert …' : 'Favoriten hinzufügen'} />
          </button>
        </div>
      </div>
    </OverlayRahmen>
  );
}

// ---------------------------------------------------------------------------
// Bericht-Zeile
// ---------------------------------------------------------------------------

function BerichtZeile({ eintrag }: { eintrag: BerichtEintrag }) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const icon = eintrag.status === 'ok' ? '✓' : eintrag.status === 'nichtGefunden' ? '✗' : '–';

  const iconFarbe =
    eintrag.status === 'ok'
      ? 'var(--text-sekundaer)'
      : eintrag.status === 'nichtGefunden'
        ? textRollen.fehlertext.color
        : 'var(--symbol-gedaempft)';

  const hinweis =
    eintrag.status === 'vorhanden'
      ? 'bereits vorhanden'
      : eintrag.status === 'nichtGefunden'
        ? 'nicht gefunden'
        : '';

  return (
    <ImportBerichtZeile icon={icon} iconFarbe={iconFarbe} schriftgroesse={12}>
      <>
        <TextAnzeige
          text={eintrag.anzeige}
          style={{
            color: 'var(--text-primaer)',
            lineHeight: 1.45,
            fontFamily: 'ui-monospace, Menlo, monospace',
          }}
        />
        {hinweis ? (
          <TextAnzeige
            style={{ ...textRollen.hinweistext, marginTop: pxSkaliert(1, uiFaktor) }}
            text={hinweis}
          />
        ) : null}
      </>
    </ImportBerichtZeile>
  );
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function zusammenfassung(anzahlNeu: number, anzahlNichtGefunden: number, gesamt: number): string {
  if (anzahlNichtGefunden === gesamt)
    return 'Keine der eingegebenen Normen wurde im Gesetz gefunden.';
  if (anzahlNeu === 0 && anzahlNichtGefunden === 0)
    return 'Alle Normen waren bereits als Favoriten gespeichert.';

  const teile: string[] = [];
  if (anzahlNeu > 0)
    teile.push(`${anzahlNeu} ${anzahlNeu === 1 ? 'Favorit' : 'Favoriten'} hinzugefügt`);
  if (anzahlNichtGefunden > 0) teile.push(`${anzahlNichtGefunden} nicht gefunden`);
  return teile.join(', ') + '.';
}
