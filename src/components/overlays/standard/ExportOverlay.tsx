// ExportOverlay.tsx
//
// Allgemeines Export-Overlay (⌘E / Menü "Export…"): Auswahl mehrerer
// Kategorien (Gesetze, Markierungen, Favoriten, Lesezeichen, Gesetzeskurzbefehle,
// Importindizes, vollständige Sammlung), die zusammen über einen
// gemeinsamen Datei-Dialog exportiert werden (siehe exportSpeicher.ts).
//
// Konkurrenzregeln (siehe exportSpeicher.ts-Kommentar/Absprache):
// - "Aktuelles Gesetz" und "Alle Gesetze" schließen sich
//   gegenseitig aus.
// - "Vollständige Sammlung" schließt alle anderen Kategorien aus; Auswahl
//   einer anderen Kategorie deaktiviert umgekehrt "Vollständige Sammlung".
// - "Aktuelles Gesetz" wird nur angezeigt, wenn im aktiven Tab
//   ein Gesetz offen ist; ist keines offen, ist "Alle Gesetze" der Default.

import { Checkbox } from '@/components/Checkbox';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { useState, useEffect, useRef } from 'react';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { OverlayRahmen, OVERLAY_BREITE_KOMPAKT } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import { exportiere, type ExportKategorie } from '@/lib/import-export/import-export.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { overlayAussenPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { Export } from '@phosphor-icons/react';
import { usePlattform } from '@/hooks/utils/usePlattform';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';

/** Auswahl und Export von Kategorien; Abbruch oder Fehler lassen das Overlay offen. */
export interface ExportOverlayProps {
  /** Kurztitel des im aktiven Tab offenen Gesetzes, falls vorhanden –
   *  steuert, ob "Aktuelles Gesetz" angezeigt wird. */
  aktuellesGesetz: Gesetzesreferenz | null;
  /** Nach erfolgreichem Export oder manueller Schließaktion; Exportfehler werden angezeigt und protokolliert. */
  onSchliessen: () => void;
}

interface ListenEintrag {
  kategorie: ExportKategorie;
  label: string;
  /** Index des Zeichens in `label`, das als Tastatur-Tastenkürzel unterstrichen
   *  wird (Kleinbuchstabe an dieser Position = zugehörige Taste). Meist 0,
   *  auch bei "Importindizes" ("I" am Wortanfang). */
  tastenkuerzelIndex: number;
}

export function ExportOverlay({ aktuellesGesetz, onSchliessen }: ExportOverlayProps) {
  const { istMac } = usePlattform();
  const buttonRollen = useButtonRollen();
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();

  const hatAktuellesGesetz = aktuellesGesetz !== null;

  const [ausgewaehlt, setAusgewaehlt] = useState<Set<ExportKategorie>>(
    () => new Set([hatAktuellesGesetz ? 'aktuellesGesetz' : 'alleGesetze']),
  );
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const rahmenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => rahmenRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const eintraege: ListenEintrag[] = [
    ...(hatAktuellesGesetz
      ? [
          {
            kategorie: 'aktuellesGesetz' as const,
            label: `Aktuelles Gesetz (${aktuellesGesetz.kurztitel})`,
            tastenkuerzelIndex: 0,
          },
        ]
      : []),
    { kategorie: 'alleGesetze', label: 'Gesetze', tastenkuerzelIndex: 0 },
    { kategorie: 'alleMarkierungen', label: 'Markierungen', tastenkuerzelIndex: 0 },
    { kategorie: 'alleFavoriten', label: 'Favoriten', tastenkuerzelIndex: 0 },
    { kategorie: 'alleNichtamtlicheTitel', label: 'Nichtamtliche Titel', tastenkuerzelIndex: 0 },
    { kategorie: 'lesezeichen', label: 'Lesezeichen', tastenkuerzelIndex: 0 },
    { kategorie: 'gesetzeskurzbefehle', label: 'Gesetzeskurzbefehle', tastenkuerzelIndex: 0 },
    { kategorie: 'importindizes', label: 'Importindizes', tastenkuerzelIndex: 0 }, // "(I)mportindizes"
    { kategorie: 'einstellungen', label: 'Einstellungen', tastenkuerzelIndex: 0 },
    { kategorie: 'vollstaendigeSammlung', label: 'Vollständige Sammlung', tastenkuerzelIndex: 0 },
  ];

  // Tastatur-Tastenkürzel (reiner Kleinbuchstabe, ohne Modifier) → Kategorie.
  // Wird aus `eintraege` abgeleitet, damit Label und Tastenkürzel nicht
  // auseinanderlaufen können.
  const tastenkuerzelZuKategorie: Record<string, ExportKategorie> = {};
  for (const eintrag of eintraege) {
    // Alle tastenkuerzelIndex-Werte sind Literalkonstanten oben, jeweils
    // nachweislich innerhalb der Länge des zugehörigen Labels (siehe
    // Kommentar bei "importindizes").
    tastenkuerzelZuKategorie[eintrag.label[eintrag.tastenkuerzelIndex]!.toLowerCase()] =
      eintrag.kategorie;
  }

  function toggle(kategorie: ExportKategorie) {
    setFehler(null);
    setAusgewaehlt((prev) => {
      if (kategorie === 'vollstaendigeSammlung') {
        return prev.has('vollstaendigeSammlung')
          ? new Set()
          : new Set<ExportKategorie>(['vollstaendigeSammlung']);
      }
      const next = new Set(prev);
      next.delete('vollstaendigeSammlung');
      // "Aktuelles Gesetz" ist der Default-Sonderfall: jede
      // Auswahl einer anderen Kategorie deselektiert ihn (nicht nur
      // "Alle Gesetze"), umgekehrt deselektiert er "Alle Gesetze".
      if (kategorie === 'aktuellesGesetz') {
        next.delete('alleGesetze');
      } else {
        next.delete('aktuellesGesetz');
      }
      if (next.has(kategorie)) {
        next.delete(kategorie);
      } else {
        next.add(kategorie);
      }
      return next;
    });
  }

  async function starteExport(kategorien: Set<ExportKategorie>) {
    if (kategorien.size === 0 || laeuft) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const ergebnis = await exportiere(kategorien, {
        aktuellesGesetz: aktuellesGesetz ?? undefined,
      });
      if (ergebnis === 'keineDaten') {
        setFehler('Für die gewählten Kategorien liegen keine Daten vor.');
      } else if (ergebnis === 'exportiert') {
        onSchliessen();
      }
      // 'abgebrochen' (Dialog per Escape/Cancel geschlossen): Overlay bleibt offen.
    } catch (e) {
      // Absichtlich weiterhin eine generische Meldung im UI (kein Rohfehler-
      // Text, der z. B. interne Pfade preisgeben könnte) – für die konkrete
      // Diagnose beim Debuggen aber in die Konsole loggen, statt den Fehler
      // stillschweigend zu verschlucken.
      console.error('Export fehlgeschlagen:', e);
      setFehler('Export fehlgeschlagen.');
    } finally {
      setLaeuft(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      // ⌘Enter: wählt "Vollständige Sammlung" aus und exportiert direkt.
      e.preventDefault();
      const sammlung = new Set<ExportKategorie>(['vollstaendigeSammlung']);
      setAusgewaehlt(sammlung);
      void starteExport(sammlung);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void starteExport(ausgewaehlt);
    } else if (!laeuft && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const kategorie = tastenkuerzelZuKategorie[e.key.toLowerCase()];
      if (kategorie) {
        e.preventDefault();
        toggle(kategorie);
      }
    }
  }

  return (
    <OverlayRahmen
      onSchliessen={onSchliessen}
      breite={OVERLAY_BREITE_KOMPAKT}
      kannSchliessen={!laeuft}
    >
      <div
        ref={rahmenRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, outline: 'none' }}
      >
        <OverlayKopfzeile
          icon={Export}
          titel="Export"
          onSchliessen={onSchliessen}
          schliessenDeaktiviert={laeuft}
        />

        {/* Inhalt */}
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
          <span style={{ ...textRollen.hinweistext }}>
            <TextAnzeige text="Wählen Sie aus, was Sie exportieren möchten:" />
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: pxSkaliert(2, uiFaktor) }}>
            {eintraege.map(({ kategorie, label, tastenkuerzelIndex }) => (
              <label
                key={kategorie}
                style={{
                  ...buttonRollen.sekundaerKompakt(laeuft),
                  // Randlos (Bugfix): die Exportoptionen sind Checkbox-Zeilen
                  // einer Auswahlliste, kein umrandeter Button – border wird
                  // deshalb hier lokal entfernt, Größe/Padding/Cursor-
                  // /Opacity-Verhalten bleiben unverändert aus der Rolle.
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: abstandRollen.standard,
                }}
                onMouseEnter={(e) => {
                  if (!laeuft) e.currentTarget.style.background = 'var(--hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Checkbox
                  checked={ausgewaehlt.has(kategorie)}
                  disabled={laeuft}
                  onChange={() => toggle(kategorie)}
                />
                <TextAnzeige
                  text={
                    kategorie === 'vollstaendigeSammlung'
                      ? `${label} ${tastenkuerzelAnzeige('export-sammlung', istMac)}`
                      : label
                  }
                  hervorhebungen={[{ von: tastenkuerzelIndex, bis: tastenkuerzelIndex + 1 }]}
                  hervorhebungStil={{ textDecoration: 'underline', fontWeight: 'inherit' }}
                />
              </label>
            ))}
          </div>

          {!!fehler && <TextAnzeige style={{ ...textRollen.fehlertext }} text={fehler} />}

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: abstandRollen.standard,
              marginTop: pxSkaliert(8, uiFaktor),
            }}
          >
            <button
              onClick={() => void starteExport(ausgewaehlt)}
              disabled={ausgewaehlt.size === 0 || laeuft}
              style={buttonRollen.primaer(ausgewaehlt.size === 0 || laeuft)}
            >
              <TextAnzeige text={laeuft ? 'Exportiert …' : 'Exportieren'} />
            </button>
          </div>
        </div>
      </div>
    </OverlayRahmen>
  );
}
