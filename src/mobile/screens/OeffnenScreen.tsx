// OeffnenScreen.tsx
//
// Mobiles Gegenstück zu OeffnenOverlay.tsx: gleiche Suchlogik
// (oeffnen.ts) und gleiche Ergebniszeile (OeffnenTrefferZeile.tsx),
// aber als eigener Screen statt Overlay (kein Escape/⌥Space/Tastaturnavigation,
// stattdessen einfacher Tap) und ohne Tab-Konzept (siehe Mobile-Plan).
//
// v1 bewusst NUR Bundesrecht (Landesrecht BW-Import braucht natives
// WebView-Rendering, siehe Mobile-Plan) – von sucheKandidatenAlleQuellen()
// wird daher nur .bund verwendet, bw/eu werden bewusst verworfen,
// wodurch berechneTreffer aus oeffnen.ts (unverändert, keine
// Anpassung nötig) für diese Quellen automatisch keine Treffer liefert.

import { loeseNormzielNachImportAuf } from '@/lib/gesetz-laden/gesetz-laden.index';
import { useSuchverzeichnis } from '@/hooks/useSuchverzeichnis';
import { SuchleisteKeinErgebnis } from '@/components/overlays/overlays.index';
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { importiereGesetze } from '@/lib/import/import.index';
import { TrefferZeile } from '@/components/overlays/overlays.index';
import {
  parseSuchanfrage,
  berechneTreffer,
  brauchtImportindexPruefung,
  trefferSchluessel,
  type SucheTreffer,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import { ladeAnzeigezeitpunkte } from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { useImportindexSuchbestand } from '@/hooks/useImportindexSuchbestand';
import { useCustomTastatur } from '@/mobile/useCustomTastatur';
import { CustomTastatur } from '@/mobile/components/CustomTastatur';

interface OeffnenScreenProps {
  /** Zuletzt angezeigtes Gesetz (falls vorhanden) – nur für die Priorisierung
   *  reiner Zahlen-Suchen ("433" sucht zuerst dort), analog zu aktivesGesetz
   *  im Desktop-Overlay. */
  zuletztGezeigtesGesetz: GesetzDarstellung | null;
  onReferenzGewaehlt: (referenz: Gesetzesreferenz, xmlId?: string) => void;
  onGesetzGewaehlt: (gesetz: GesetzDarstellung, normXmlId?: string) => void;
  /** Aktualisiert nach dem Import nur den Suchbestand, ohne weitere Gesetze zu laden. */
  onGesetzImportiert: () => Promise<void>;
  /** Ob die Custom-Tastatur statt der System-Tastatur verwendet werden soll
   *  (Einstellung aus useMobileEinstellungen, siehe MobileApp.tsx). */
  customTastaturAktiv: boolean;
}

export function OeffnenScreen({
  zuletztGezeigtesGesetz,
  onGesetzGewaehlt,
  onReferenzGewaehlt,
  onGesetzImportiert,
  customTastaturAktiv,
}: OeffnenScreenProps) {
  const { eintraege, wirdVorbereitet, vorbereitungsText } = useSuchverzeichnis();
  const [anzeigezeitpunkte] = useState(ladeAnzeigezeitpunkte);
  const [suchtext, setSuchtext] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const tastatur = useCustomTastatur({
    aktiv: customTastaturAktiv,
    wert: suchtext,
    onWertAendern: setSuchtext,
    inputRef,
  });

  // Selbst gezeichneter blinkender Cursor: der native Caret ist bei
  // readOnly-Inputs (Custom-Tastatur-Modus) auf vielen mobilen Browsern
  // unsichtbar. Ein unsichtbarer Mirror-Span mit identischer Schrift misst
  // die Textbreite bis zur Cursor-Position; darauf basierend wird ein
  // blinkender Balken an der passenden x-Position gezeichnet.
  //
  // Zusätzlich: automatisches Mitscrollen, wenn der Text länger ist als das
  // Eingabefeld breit ist – die Cursor-Position (nicht zwingend das Ende)
  // soll immer sichtbar bleiben. `el.scrollLeft` wird direkt gesetzt (Inputs
  // unterstützen das auch bei readOnly); der Cursor-Balken zieht den
  // aktuellen Scroll-Offset von seiner Position ab, damit er weiterhin an
  // der richtigen sichtbaren Stelle erscheint.
  const mirrorSpanRef = useRef<HTMLSpanElement>(null);
  const [cursorLeftPx, setCursorLeftPx] = useState(12);
  const EINGABE_PADDING_LINKS = 12;
  // Rechts reserviert der Input 32px Innenabstand für das ✕ (siehe unten,
  // padding: '0 32px 0 12px') – el.clientWidth schließt dieses Padding mit
  // ein. Ohne Abzug würde der Cursor bis hinter das Kreuz wandern können,
  // bevor überhaupt gescrollt wird. Deshalb rechts ein größerer Rand.
  const SICHTBARKEITS_RAND_LINKS_PX = 4;
  const SICHTBARKEITS_RAND_RECHTS_PX = 45; // 41px Kreuz-Breite + 4px Puffer
  useLayoutEffect(() => {
    const el = inputRef.current;
    const mirror = mirrorSpanRef.current;
    if (!el || !mirror) return;
    const textBreiteBisCursor = mirror.offsetWidth;
    const sichtbareBreite = el.clientWidth;
    if (textBreiteBisCursor - el.scrollLeft > sichtbareBreite - SICHTBARKEITS_RAND_RECHTS_PX) {
      el.scrollLeft = textBreiteBisCursor - sichtbareBreite + SICHTBARKEITS_RAND_RECHTS_PX;
    } else if (textBreiteBisCursor - el.scrollLeft < SICHTBARKEITS_RAND_LINKS_PX) {
      el.scrollLeft = Math.max(0, textBreiteBisCursor - SICHTBARKEITS_RAND_LINKS_PX);
    }
    setCursorLeftPx(EINGABE_PADDING_LINKS + textBreiteBisCursor - el.scrollLeft);
  }, [suchtext, tastatur.cursorPosition]);

  const {
    bestand,
    fehler: importindexFehler,
    wartet: wartetAufImportindex,
    istAktuell: importindexIstAktuell,
  } = useImportindexSuchbestand(brauchtImportindexPruefung(suchtext));
  const bundImportindex = bestand?.[NORMGEBER_DE_BUND];

  const [importVorgang, setImportVorgang] = useState<
    | { status: 'idle' }
    | { status: 'laeuft'; kurztitel: string }
    | { status: 'fehler'; meldung: string }
  >({ status: 'idle' });

  const anfrage = parseSuchanfrage(suchtext);
  const treffer: SucheTreffer[] = useMemo(() => {
    const importindexEintraege = bundImportindex
      ? {
          [NORMGEBER_DE_BUND]: bundImportindex,
          [NORMGEBER_DE_BW]: [],
          [NORMGEBER_EU]: [],
        }
      : null;
    // Mobile kennt diese Einstellung nicht; false hält ihren Standard für Parameter sechs fest.
    return berechneTreffer(
      suchtext,
      eintraege,
      zuletztGezeigtesGesetz,
      importindexEintraege,
      false,
      anzeigezeitpunkte,
    );
  }, [suchtext, eintraege, zuletztGezeigtesGesetz, bundImportindex, anzeigezeitpunkte]);
  const zeilen: { treffer: SucheTreffer; schluessel: string }[] = useMemo(() => {
    const schluessel = trefferSchluessel(treffer);
    return treffer.map((t, i) => ({ treffer: t, schluessel: schluessel[i] ?? String(i) }));
  }, [treffer]);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  function fertigGedrueckt() {
    if (treffer.length > 0) {
      trefferAuswaehlen(treffer[0]!);
    }
    tastatur.schliessen();
  }

  function trefferAuswaehlen(treffer_: NonNullable<ReturnType<typeof berechneTreffer>>[number]) {
    if (importVorgang.status === 'laeuft') return;

    if (treffer_.art === 'installiert') {
      onReferenzGewaehlt(treffer_.gesetzesreferenz, treffer_.norm?.xmlId);
      return;
    }

    if (!importindexIstAktuell()) return;

    // Importindex-Treffer (immer Quelle 'bund' in v1, siehe Datei-Kommentar oben) –
    // erst importieren, Screen bleibt währenddessen sichtbar.
    const { eintrag } = treffer_;
    setImportVorgang({ status: 'laeuft', kurztitel: eintrag.kurztitel });
    void (async () => {
      try {
        const { erfolgreiche, fehlgeschlagene } = await importiereGesetze(
          [{ kurztitel: eintrag.kurztitel, abrufkennung: eintrag.abrufkennung }],
          NORMGEBER_DE_BUND,
        );

        if (erfolgreiche.length === 0) {
          setImportVorgang({
            status: 'fehler',
            meldung: fehlgeschlagene[0]?.fehler.meldung ?? 'Import fehlgeschlagen.',
          });
          return;
        }

        const gesetz = erfolgreiche[0]!;
        setImportVorgang({ status: 'idle' });
        // Andere Fenster/Geräte gibt es auf Mobile in v1 nicht (geräteisoliert,
        // siehe Mobile-Plan) – emitTo entfällt daher hier bewusst, anders als
        // im Desktop-Overlay.
        await onGesetzImportiert();
        const xmlId = await loeseNormzielNachImportAuf(gesetz, anfrage);
        onGesetzGewaehlt(gesetz, xmlId);
      } catch (fehler) {
        console.error('Import fehlgeschlagen:', fehler);
        setImportVorgang({
          status: 'fehler',
          meldung: fehler instanceof Error ? fehler.message : 'Import fehlgeschlagen.',
        });
      }
    })();
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'var(--bg-haupt)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          flexShrink: 0,
        }}
      >
        <div style={{ position: 'relative', flex: 1 }}>
          <TextAttributElement
            element="input"
            ref={inputRef}
            // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: editierbares Suchinput erhält den originalen Suchwert; useCustomTastatur ergänzt nur Ereignisse, readOnly und inputMode; OeffnenScreen.test.tsx und useCustomTastatur.test.tsx prüfen Eingabewerte und Props.
            value={suchtext}
            onChange={(e) => setSuchtext(e.target.value)}
            placeholder="Gesetz oder Norm eingeben …"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={importVorgang.status === 'laeuft'}
            // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: useCustomTastatur ergänzt nur Eingabeereignisse, readOnly und inputMode ohne sichtbare Textfelder; useCustomTastatur.test.tsx prüft beide Aktivierungszustände.
            {...tastatur.inputProps}
            style={{
              width: '100%',
              minHeight: 44,
              background: 'var(--bg-eingabe)',
              border: 'none',
              borderRadius: 10,
              outline: 'none',
              padding: '0 32px 0 12px',
              fontSize: 17,
              color: 'var(--text-primaer)',
              fontFamily: 'var(--schrift)',
              boxSizing: 'border-box',
              // Nativer Caret bleibt unsichtbar, sobald die Custom-Tastatur
              // aktiv ist – wir zeichnen stattdessen unseren eigenen Cursor
              // (siehe unten), weil der native Caret bei readOnly-Inputs auf
              // vielen mobilen Browsern ohnehin nicht blinkt/erscheint.
              caretColor: customTastaturAktiv ? 'transparent' : undefined,
            }}
          />
          {tastatur.tastaturSichtbar === true && (
            <>
              <span
                ref={mirrorSpanRef}
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  visibility: 'hidden',
                  whiteSpace: 'pre',
                  fontSize: 17,
                  fontFamily: 'var(--schrift)',
                }}
              >
                {/* eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: unsichtbarer aria-hidden-Messspan enthält den originalen Suchslice für offsetWidth; OeffnenScreen.test.tsx prüft Unsichtbarkeit, Originalslice und Cursorposition. */}
                {suchtext.slice(0, tastatur.cursorPosition)}
              </span>
              <span
                className="custom-cursor"
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 9,
                  bottom: 9,
                  left: cursorLeftPx,
                  width: 1.5,
                  background: 'var(--text-primaer)',
                  pointerEvents: 'none',
                }}
              />
            </>
          )}

          {suchtext.length > 0 && (
            <TextAttributElement
              element="button"
              onClick={() => {
                setSuchtext('');
                inputRef.current?.focus();
              }}
              aria-label="Eingabe löschen"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--text-sekundaer)',
                fontSize: 15,
              }}
            >
              ✕
            </TextAttributElement>
          )}
        </div>
      </div>

      {wirdVorbereitet === true && <SuchleisteKeinErgebnis text={vorbereitungsText} />}
      {wartetAufImportindex === true && (
        <SuchleisteKeinErgebnis text="Importangebote werden geladen …" />
      )}
      {importindexFehler === true && (
        <SuchleisteKeinErgebnis text="Importangebote konnten nicht geladen werden." />
      )}
      {importVorgang.status === 'laeuft' && (
        <div style={{ padding: '16px 16px', fontSize: 14, color: 'var(--text-sekundaer)' }}>
          <TextAnzeige text={`„${importVorgang.kurztitel}" wird importiert …`} />
        </div>
      )}

      {importVorgang.status === 'fehler' && (
        <div style={{ padding: '16px 16px', fontSize: 14, color: 'var(--akzent-warnung)' }}>
          <TextAnzeige text={importVorgang.meldung} />
        </div>
      )}

      {importVorgang.status === 'idle' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {zeilen.map(({ treffer: treffer_, schluessel: key }, idx) => {
            const ziel = treffer_.art === 'installiert' ? treffer_.norm : undefined;
            const zielBez = ziel?.bezeichnung;
            return (
              <div key={key} style={{ minHeight: 44 }}>
                <TrefferZeile
                  idx={idx}
                  treffer={treffer_}
                  markiert={false}
                  zielnorm={zielBez}
                  artikelNummer={ziel?.artikelNummer ?? undefined}
                  anfrage={anfrage}
                  onClick={() => trefferAuswaehlen(treffer_)}
                  onMausBewegung={() => {}}
                />
              </div>
            );
          })}
          {treffer.length === 0 &&
            suchtext.trim().length > 0 &&
            !wirdVorbereitet &&
            !wartetAufImportindex &&
            !importindexFehler && (
              <div
                style={{
                  padding: '28px 16px',
                  textAlign: 'center',
                  fontSize: 14,
                  color: 'var(--text-sekundaer)',
                }}
              >
                <TextAnzeige text="Kein Treffer" />
              </div>
            )}
        </div>
      )}

      {tastatur.tastaturSichtbar === true && (
        <CustomTastatur
          onTaste={tastatur.tasteEingeben}
          onLoeschen={tastatur.zeichenLoeschen}
          onFertig={fertigGedrueckt}
        />
      )}
    </div>
  );
}
