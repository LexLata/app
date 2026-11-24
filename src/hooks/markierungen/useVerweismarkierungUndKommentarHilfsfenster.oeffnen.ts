// Öffnet Markierungshilfsfenster mit einer aus ihrem Layout geschätzten Starthöhe.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

// Statt dynamisch: useMarkierungenDeaktiviert.ts wird bereits über App.tsx
// (Hook-Aufruf beim Root-Component) statisch/eager geladen – ein dynamischer
// Import hier brachte keinen Chunk-Splitting-Vorteil, nur die
// Vite-Warnung INEFFECTIVE_DYNAMIC_IMPORT.

import type {
  KommentarKontext,
  VerweismarkierungKontext,
} from '@/lib/markierungen/markierungen.index';
import { nativesMarkierungsfensterOeffnen } from '@/lib/plattform/tauriHelpers';
import { FENSTER_AUSSEN_ROH } from '@/lib/stil/paddingRollen';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';

/** Deterministische Schätzung der Fenster-Starthöhe aus den festen
 *  Layout-Werten von VerweismarkierungFormular.tsx/KommentarFenster.
 *  formular.tsx (Padding, Gaps, Zeilenfeld, Button-Zeile) – ersetzt eine
 *  fest geratene Startgröße, damit der ResizeObserver-Effekt dort beim
 *  Öffnen kaum noch etwas korrigieren muss (bislang: 420x320 fix, sichtbares
 *  Schrumpfen bei jeder Abweichung vom Durchschnittsfall). Bewusst grob
 *  genug gehalten, um bei Schriftgrößen-/Plattformschwankungen nicht selbst
 *  zum neuen Rätsel zu werden – exakte Kompensation (inkl. macOS-
 *  Titelleisten-Overhead) bleibt weiterhin Aufgabe des Laufzeit-Effekts. */
interface HilfsfensterHoeheKonstanten {
  padding: number;
  eingabezeile: number;
  buttonzeile: number;
  checkboxzeile: number; // optionale "Bezug auf markierten Text"-Zeile inkl. Gap
  gap: number; // Gap zwischen den Top-Level-Flex-Kindern
}

const VERWEISMARKIERUNG_HOEHE: HilfsfensterHoeheKonstanten = {
  // Identisch mit dem Fenster-Außenrand aus paddingRollen.ts (oben+unten),
  // bewusst referenziert statt als eigenes Literal dupliziert – siehe
  // Kommentar dort zu "zufällig derselbe Zahlenwert" vs. echter Bezug.
  padding: FENSTER_AUSSEN_ROH * 2,
  eingabezeile: 48, // Hinweistext + Textarea (minHeight 30) + Gap
  buttonzeile: 34,
  checkboxzeile: 30,
  gap: 10,
};

// KOMMENTAR_HOEHE.eingabezeile etwas größer als bei Verweismarkierung, da der
// Kommentar-Freitext typischerweise mehrzeilig ist (siehe
// KommentarFormular.tsx: rows der Textarea).
const KOMMENTAR_HOEHE: HilfsfensterHoeheKonstanten = {
  padding: FENSTER_AUSSEN_ROH * 2,
  eingabezeile: 78,
  buttonzeile: 34,
  checkboxzeile: 30,
  gap: 10,
};

function schaetzeHilfsfensterHoehe(k: HilfsfensterHoeheKonstanten, zeigeCheckbox: boolean): number {
  let hoehe = k.padding + k.eingabezeile + k.buttonzeile + k.gap;
  if (zeigeCheckbox) hoehe += k.checkboxzeile + k.gap;
  return hoehe;
}

interface HilfsfensterKontextBasis {
  openerLabel: string;
  ausgangsstelle: Ausgangsstelle;
  ausgangsBezeichnung?: string;
  auswahl?: unknown;
  bearbeiten?: { textbezug?: unknown };
}

/** Öffnet eines der beiden eigenständigen Hilfsfenster (Verweismarkierung oder
 *  Kommentar) mit den übergebenen Startdaten – gemeinsam genutzt von
 *  oeffneVerweismarkierungFenster/oeffneKommentarFenster unten, da sich beide nur
 *  in den Tauri-Befehlsnamen, dem Label-Präfix, dem Titel-Präfix und der
 *  Höhenschätzung unterscheiden. `bearbeiten` steuert NUR den nativen
 *  Fenstertitel ("hinzufügen" vs. "bearbeiten") – welcher Modus tatsächlich
 *  aktiv ist, entscheidet weiterhin das jeweilige Fenster selbst anhand von
 *  kontext.bearbeiten. */
async function oeffneHilfsfenster(
  titelPraefix: string,
  labelPraefix: string,
  kontextBefehl: 'kommentar_kontext_ablegen' | 'verweismarkierung_kontext_ablegen',
  fensterBefehl: 'kommentar_fenster_oeffnen' | 'verweismarkierung_fenster_oeffnen',
  hoeheKonstanten: HilfsfensterHoeheKonstanten,
  kontext: HilfsfensterKontextBasis,
  bearbeiten: boolean,
) {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    kontext.openerLabel = getCurrentWindow().label;
    const label = labelPraefix + crypto.randomUUID().replace(/-/g, '');
    const titel = `${titelPraefix} zu ${kontext.ausgangsBezeichnung ?? bezeichnungAusgangsstelle(kontext.ausgangsstelle)} ${bearbeiten ? 'bearbeiten' : 'hinzufügen'}`;
    const zeigeCheckbox = !!kontext.auswahl || !!kontext.bearbeiten?.textbezug;
    const hoehe = schaetzeHilfsfensterHoehe(hoeheKonstanten, zeigeCheckbox);
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: oeffneHilfsfenster legt originalen Kontext unter technischem Fensterlabel ab; useVerweismarkierungUndKommentarHilfsfenster.test.ts prüft Kontext und separate geschützte Fensteröffnung.
    await rufeBefehl(kontextBefehl, { label, payload: JSON.stringify(kontext) });
    await nativesMarkierungsfensterOeffnen(fensterBefehl, {
      label,
      titel,
      hoehe,
    });
  } catch (fehler) {
    console.error(`${titelPraefix}fenster konnte nicht geöffnet werden:`, fehler);
  }
}

export async function oeffneVerweismarkierungFenster(
  kontext: VerweismarkierungKontext,
  bearbeiten: boolean,
) {
  await oeffneHilfsfenster(
    'Verweis',
    'verweismarkierung-',
    'verweismarkierung_kontext_ablegen',
    'verweismarkierung_fenster_oeffnen',
    VERWEISMARKIERUNG_HOEHE,
    kontext,
    bearbeiten,
  );
}

export async function oeffneKommentarFenster(kontext: KommentarKontext, bearbeiten: boolean) {
  await oeffneHilfsfenster(
    'Kommentar',
    'kommentar-',
    'kommentar_kontext_ablegen',
    'kommentar_fenster_oeffnen',
    KOMMENTAR_HOEHE,
    kontext,
    bearbeiten,
  );
}
