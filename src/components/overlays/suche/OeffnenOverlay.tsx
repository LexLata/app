// OeffnenOverlay.tsx
// Schnellsuche für Gesetze und Normen – nach OeffnenView.swift modelliert.
// Öffnet sich per Öffnen-Overlay-Tastenkürzel oder Zifferneingabe; Escape schließt.

import { useSuchverzeichnis } from '@/hooks/useSuchverzeichnis';
import { ladeAnzeigezeitpunkte } from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { UeberlagerterScrollbereich } from '@/components/scrollbereich/UeberlagerterScrollbereich';
import { messeAsync, messeSync } from '@/lib/utils/perfMessung';
import { useEuDurchfuehrungsaktSuche } from '@/hooks/einstellungen/useEuDurchfuehrungsaktSuche';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useId } from 'react';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { OverlayRahmen, OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { OverlayTrennlinie } from '@/components/overlays/OverlayTrennlinie';
import { SuchleisteKopf } from '@/components/overlays/suche/SuchleisteKopf';
import { SuchleisteKeinErgebnis } from '@/components/overlays/suche/SuchleisteKeinErgebnis';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { type Gesetzeskurzbefehl } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import { useImportindexSuchbestand } from '@/hooks/useImportindexSuchbestand';
import {
  type SucheTreffer,
  parseSuchanfrage,
  berechneTreffer,
  brauchtImportindexPruefung,
  trefferSchluessel,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import { useOeffnenAuswahl } from '@/hooks/useOeffnenAuswahl';
import { TrefferZeile } from '@/components/overlays/suche/OeffnenTrefferZeile';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert, hinweisboxPadding } from '@/lib/stil/paddingRollen';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

/** Gesetzes- und Normsuche; Importfehler lassen das Overlay mit Fehlermeldung offen. */
export interface OeffnenOverlayProps {
  gesetze: GesetzDarstellung[];
  aktivesGesetz: GesetzDarstellung | null;
  aktivesElementId?: string | null;
  /** Bereits eingetipptes Zeichen, das den Overlay geöffnet hat (z. B. „3") */
  initialInput?: string;
  initialMeldung?: string;
  einfuehrungGesperrt?: boolean;
  onKeineVerbindung?: (keineVerbindung: boolean) => void;
  onSchliessen: () => void;
  /** Nach onSchliessen; öffnet einen installierten oder erfolgreich importierten Treffer.
   * Beim Importindextreffer wird die Norm erst nach Import aufgelöst; der Aufrufer navigiert. */
  onInstalliertOeffnen: (
    referenz: Gesetzesreferenz,
    xmlId: string | undefined,
    neuerTab: boolean,
  ) => void;
  onGesetzOeffnen: (gesetz: GesetzDarstellung, normXmlId?: string) => void;
  /** Gleicher Ablauf wie onGesetzOeffnen, mit Navigation in einen neuen Tab. */
  onNeuenTabOeffnen: (gesetz: GesetzDarstellung, normXmlId?: string) => void;
  /** Gesetzeskurzbefehle (aus App.tsx-State) */
  gesetzeskurzbefehle?: Record<string, Gesetzeskurzbefehl>;
}

// ---------------------------------------------------------------------------
// Hauptkomponente
// ---------------------------------------------------------------------------

export function OeffnenOverlay({
  gesetze,
  aktivesGesetz,
  aktivesElementId: anfaenglichesAktivesElementId,
  initialInput = '',
  initialMeldung,
  einfuehrungGesperrt = false,
  onKeineVerbindung,
  onSchliessen,
  onGesetzOeffnen,
  onInstalliertOeffnen,
  onNeuenTabOeffnen,
  gesetzeskurzbefehle = {},
}: OeffnenOverlayProps) {
  // Das modale Overlay behält den Artikelkontext vom Öffnen bis zum Schließen.
  const [aktivesElementId] = useState(anfaenglichesAktivesElementId);
  const [eingehangenUm] = useState(() => (import.meta.env.DEV ? performance.now() : 0));
  useEffect(() => {
    if (!import.meta.env.DEV || initialInput !== '' || typeof requestAnimationFrame !== 'function')
      return;
    let ersterFrame = 0;
    let zweiterFrame = 0;
    void messeAsync(
      'Öffnen-Overlay: erstes Zeichnen der leeren Trefferliste',
      () =>
        new Promise<void>((resolve) => {
          ersterFrame = requestAnimationFrame(() => {
            zweiterFrame = requestAnimationFrame(() => resolve());
          });
        }),
      () =>
        `${(performance.now() - eingehangenUm).toFixed(1)} ms seit Einhängen, ${gesetze.length} Gesetze`,
    );
    return () => {
      cancelAnimationFrame(ersterFrame);
      cancelAnimationFrame(zweiterFrame);
    };
  }, [eingehangenUm, initialInput, gesetze.length]);
  const { eintraege, wirdVorbereitet, vorbereitungsText } = useSuchverzeichnis();
  const waehleTreffer = useOeffnenAuswahl();
  const [startMeldung, setStartMeldung] = useState(initialMeldung);
  const uiFaktor = useUiSkalierungsFaktor();
  const textRollen = useTextRollen();
  const sperrHinweisId = useId();
  const [anzeigezeitpunkte] = useState(ladeAnzeigezeitpunkte);
  const [suchtext, setSuchtext] = useState(initialInput);
  const [markierterIndex, setMarkierterIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listeRef = useRef<HTMLDivElement>(null);

  const istAktivRef = useRef(true);
  useEffect(() => {
    istAktivRef.current = true;
    return () => {
      istAktivRef.current = false;
    };
  }, []);
  const brauchtImportindexFallback: boolean = brauchtImportindexPruefung(suchtext);
  const {
    bestand: importindexEintraege,
    fehler: importindexFehler,
    wartet: wartetAufImportindex,
    istAktuell: importindexIstAktuell,
  } = useImportindexSuchbestand(brauchtImportindexFallback);

  useEffect(() => {
    if (suchtext !== initialInput) setStartMeldung(undefined);
  }, [suchtext, initialInput]);

  // Import-Zustand für Importindex-Treffer (installierte Treffer öffnen weiterhin
  // sofort, ohne diesen Zustand zu berühren).
  const [importVorgang, setImportVorgang] = useState<
    | { status: 'idle' }
    | { status: 'laeuft'; kurztitel: string; wartetAufSperre?: true }
    | { status: 'fehler'; meldung: string }
  >({ status: 'idle' });

  // Eine stehengebliebene Fehlermeldung gehört zur vorherigen Eingabe – sobald
  // sich diese ändert, muss sie verschwinden, sonst bleibt sie dauerhaft über
  // der Ergebnisliste stehen (die nur bei status==='idle' gerendert wird) und
  // verdeckt neue Treffer (Bugfix). Status 'laeuft' bleibt unberührt, das
  // Eingabefeld ist währenddessen ohnehin deaktiviert.
  useEffect(() => {
    setImportVorgang((v) => (v.status === 'fehler' ? { status: 'idle' } : v));
    onKeineVerbindung?.(false);
  }, [suchtext, onKeineVerbindung]);

  const schliessen = useCallback(() => {
    onKeineVerbindung?.(false);
    onSchliessen();
  }, [onKeineVerbindung, onSchliessen]);

  const anfrage = useMemo(() => parseSuchanfrage(suchtext), [suchtext]);
  const { euDurchfuehrungsaktSuche } = useEuDurchfuehrungsaktSuche();
  const treffer: SucheTreffer[] = useMemo(
    () =>
      messeSync(
        'Öffnen-Overlay: Trefferberechnung',
        () =>
          berechneTreffer(
            suchtext,
            eintraege,
            aktivesGesetz,
            importindexEintraege,
            euDurchfuehrungsaktSuche,
            anzeigezeitpunkte,
            aktivesElementId,
          ),
        (ergebnis) => `${ergebnis.length} Treffer`,
      ),
    [
      suchtext,
      eintraege,
      aktivesGesetz,
      importindexEintraege,
      euDurchfuehrungsaktSuche,
      anzeigezeitpunkte,
      aktivesElementId,
    ],
  );

  // Zeilenschlüssel müssen eindeutig sein, sonst bleiben beim Tippen verwaiste Zeilen stehen.
  const zeilen: { treffer: SucheTreffer; schluessel: string }[] = useMemo(() => {
    const schluessel = trefferSchluessel(treffer);
    return treffer.map((t, i) => ({ treffer: t, schluessel: schluessel[i] ?? String(i) }));
  }, [treffer]);

  // Fokus beim Öffnen setzen
  useLayoutEffect(() => {
    inputRef.current?.focus();
    const len = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(len, len);
  }, []);

  // Auswahl zurücksetzen beim Tippen
  useEffect(() => {
    setMarkierterIndex(0);
  }, [suchtext]);

  const gueltigerIndex = Math.max(0, Math.min(markierterIndex, treffer.length - 1));
  // Auch die leere Zwischenliste verwirft eine inzwischen entfallene Position.
  useEffect(() => {
    setMarkierterIndex((index) => Math.max(0, Math.min(index, treffer.length - 1)));
  }, [treffer.length]);

  // Markiertes Element in den sichtbaren Bereich scrollen
  useEffect(() => {
    if (!listeRef.current) return;
    const el = listeRef.current.querySelector<HTMLElement>(`[data-idx="${gueltigerIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [gueltigerIndex, treffer]);

  const oeffneMarkiert = useCallback(
    (neuerTab: boolean, auswahlIndex = gueltigerIndex) => {
      if (importVorgang.status === 'laeuft' || wartetAufImportindex) return; // während Import keine weitere Aktion

      if (treffer.length === 0) return;
      const treffer_ = treffer[auswahlIndex];
      if (!treffer_) return;

      if (treffer_.art === 'installiert') {
        schliessen();
        onInstalliertOeffnen(
          treffer_.gesetzesreferenz,
          treffer_.norm?.xmlId,
          neuerTab && !einfuehrungGesperrt,
        );
        return;
      }
      if (!importindexIstAktuell()) return;
      if (treffer_.art === 'index')
        setImportVorgang({ status: 'laeuft', kurztitel: treffer_.eintrag.kurztitel });
      const kurztitel = treffer_.art === 'index' ? treffer_.eintrag.kurztitel : '';
      void waehleTreffer(treffer_, anfrage, () => {
        if (istAktivRef.current)
          setImportVorgang({ status: 'laeuft', kurztitel, wartetAufSperre: true });
      }).then((ergebnis) => {
        if (!istAktivRef.current) return;
        if (ergebnis.gesetzesreferenz) {
          schliessen();
          onInstalliertOeffnen(
            ergebnis.gesetzesreferenz,
            ergebnis.xmlId,
            neuerTab && !einfuehrungGesperrt,
          );
          return;
        }
        if (!ergebnis.gesetz) {
          setImportVorgang({ status: 'fehler', meldung: ergebnis.meldung });
          onKeineVerbindung?.(ergebnis.keineVerbindung);
          return;
        }
        setImportVorgang({ status: 'idle' });
        schliessen();
        if (neuerTab && !einfuehrungGesperrt) onNeuenTabOeffnen(ergebnis.gesetz, ergebnis.xmlId);
        else onGesetzOeffnen(ergebnis.gesetz, ergebnis.xmlId);
      });
    },
    [
      treffer,
      importindexIstAktuell,
      waehleTreffer,
      anfrage,
      wartetAufImportindex,
      gueltigerIndex,
      importVorgang.status,
      schliessen,
      onKeineVerbindung,
      onGesetzOeffnen,
      onInstalliertOeffnen,
      onNeuenTabOeffnen,
      einfuehrungGesperrt,
    ],
  );

  // Tastatursteuerung
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setMarkierterIndex((i) => Math.max(0, Math.min(i, treffer.length - 1) - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setMarkierterIndex((i) => Math.max(0, Math.min(treffer.length - 1, i + 1)));
          break;
        case 'Enter':
          e.preventDefault();
          oeffneMarkiert(e.metaKey || e.ctrlKey);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [oeffneMarkiert, treffer.length]);

  return (
    <OverlayRahmen
      onSchliessen={schliessen}
      breite={OVERLAY_BREITE_GROSS}
      variante="suche"
      kannSchliessen={importVorgang.status !== 'laeuft' && !einfuehrungGesperrt}
    >
      <>
        <SuchleisteKopf
          inputRef={inputRef}
          dataEinfuehrungZiel="oeffnen-eingabe"
          value={suchtext}
          onChange={setSuchtext}
          platzhalter="Gesetz oder Norm eingeben …"
          disabled={importVorgang.status === 'laeuft'}
        />

        {!!startMeldung && <SuchleisteKeinErgebnis text={startMeldung} />}

        {/* ── Import läuft ── */}
        {importVorgang.status === 'laeuft' && (
          <div
            role="status"
            aria-describedby={importVorgang.wartetAufSperre ? sperrHinweisId : undefined}
            style={{
              padding: hinweisboxPadding(uiFaktor),
              fontSize: pxSkaliert(13, uiFaktor),
              color: 'var(--text-sekundaer)',
            }}
          >
            <TextAnzeige text={`„${importVorgang.kurztitel}" wird importiert …`} />
            {!!importVorgang.wartetAufSperre && (
              <TextAnzeige
                element="div"
                id={sperrHinweisId}
                style={textRollen.hinweistext}
                text={`„${importVorgang.kurztitel}" wird gerade an anderer Stelle gespeichert. Es wird danach geöffnet …`}
              />
            )}
          </div>
        )}

        {/* ── Import fehlgeschlagen ── */}
        {importVorgang.status === 'fehler' && (
          <div
            style={{
              padding: hinweisboxPadding(uiFaktor),
              fontSize: pxSkaliert(13, uiFaktor),
              color: 'var(--akzent-warnung)',
            }}
          >
            <TextAnzeige text={importVorgang.meldung} />
          </div>
        )}

        {/* ── Ergebnisliste ── */}
        {wirdVorbereitet === true && <SuchleisteKeinErgebnis text={vorbereitungsText} />}
        {wartetAufImportindex === true && (
          <SuchleisteKeinErgebnis text="Importangebote werden geladen …" />
        )}
        {!!importindexFehler && brauchtImportindexFallback && (
          <SuchleisteKeinErgebnis text="Importangebote konnten nicht geladen werden." />
        )}
        {treffer.length > 0 && importVorgang.status === 'idle' && (
          <UeberlagerterScrollbereich ref={listeRef} beschriftung="Gesetz oder Norm öffnen">
            <>
              {zeilen.map(({ treffer: treffer_, schluessel: key }, idx) => {
                // Normauflösung/Gesetzeskurzbefehl-Anzeige gibt es nur für installierte
                // Treffer – bei Importindex-Treffern ist die Normstruktur erst nach
                // dem Import bekannt (siehe Plan: dort nur allgemeiner Hinweis
                // auf die gesuchte Nummer statt aufgelöster Bezeichnung).
                const gesetz = treffer_.art === 'installiert' ? treffer_.gesetzesreferenz : null;
                const ziel = treffer_.art === 'installiert' ? treffer_.norm : undefined;
                const zielBez = ziel?.bezeichnung;
                // Gesetzeskurzbefehl nur bei reiner Gesetzeseingabe (ohne Norm/Erwägungsgrund) anzeigen
                const zeigeKurzbefehl =
                  gesetz && anfrage.normNummer === null && anfrage.erwaegungsgrundNummer === null
                    ? (gesetzeskurzbefehle[gesetzesreferenzSchluessel(gesetz)] ?? null)
                    : null;
                return (
                  <div key={key}>
                    <TrefferZeile
                      idx={idx}
                      treffer={treffer_}
                      markiert={idx === gueltigerIndex}
                      zielnorm={zielBez}
                      artikelNummer={ziel?.artikelNummer ?? undefined}
                      anfrage={anfrage}
                      kurzbefehl={zeigeKurzbefehl}
                      onClick={() => {
                        setMarkierterIndex(idx);
                        oeffneMarkiert(false, idx);
                      }}
                      onMausBewegung={() => setMarkierterIndex(idx)}
                    />
                    {/* Randständige Trennlinie zwischen Trefferzeilen (KEIN
                        marginLeft – vorher versehentlich eingerückt, sodass
                        sie erst auf Höhe des Texts statt am Overlayrand
                        begann, siehe Bugreport). */}
                    {idx < treffer.length - 1 && <OverlayTrennlinie />}
                  </div>
                );
              })}
            </>
          </UeberlagerterScrollbereich>
        )}

        {/* ── Kein Ergebnis ── */}
        {treffer.length === 0 &&
          !!suchtext.trim() &&
          !wartetAufImportindex &&
          !importindexFehler &&
          !wirdVorbereitet && (
            <SuchleisteKeinErgebnis
              text="Kein Treffer"
              hinweis="Ggf. App oder Importindex aktualisieren"
            />
          )}
      </>
    </OverlayRahmen>
  );
}
