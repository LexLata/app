// Leitet Gruppierungszeilen und Tastenkürzel der Lesezeichenleiste ab.
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { Lesezeichen } from '@/lib/persistenz/nutzerdaten/lesezeichenSpeicher';
import { tastenkuerzelAnzeige } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';

export const GAP_KOPF = 6;
const KOPF_ZEICHEN_MAX = 12;

/** Wenigste Zeilen, darin die kleinste längste Zeile; Wörter bleiben ganz. */
export function zerlegeKurztitel(text: string): string[] {
  const woerter = text.trim().split(/ +/).filter(Boolean);
  if (!woerter.length) return [''];
  const loesungen: string[][] = Array.from({ length: woerter.length + 1 }, () => []);
  for (let i = woerter.length - 1; i >= 0; i--) {
    let beste: string[] | undefined;
    for (let j = i + 1; j <= woerter.length; j++) {
      const zeile = woerter.slice(i, j).join(' ');
      if (j > i + 1 && zeile.length > KOPF_ZEICHEN_MAX) break;
      const kandidat = [zeile, ...(loesungen[j] ?? [])];
      if (
        !beste ||
        kandidat.length < beste.length ||
        (kandidat.length === beste.length &&
          Math.max(...kandidat.map((z) => z.length)) < Math.max(...beste.map((z) => z.length)))
      )
        beste = kandidat;
    }
    loesungen[i] = beste ?? [];
  }
  return loesungen[0] ?? [];
}

// ---------------------------------------------------------------------------
// Zeilen-Modell: flache Liste aus Gesetz-Kopfzeilen + Lesezeichen-Einträgen
// ---------------------------------------------------------------------------

interface ZeileKopf {
  typ: 'kopf';
  gesetz: Gesetzesreferenz;
  text: string;
  ersteGesetzeszeile: boolean;
}

interface ZeileEintrag {
  typ: 'eintrag';
  eintrag: Lesezeichen;
  /** Position innerhalb der ursprünglichen (sortierten) Lesezeichen-Liste,
   *  ohne Kopfzeilen mitzuzählen – entscheidet über das ⌥-Tastenkürzel. */
  tastenkuerzelIndex: number;
}

export type Zeile = ZeileKopf | ZeileEintrag;

/**
 * Leitet aus der sortierten Lesezeichen-Liste die Zeilenliste ab: vor jeder
 * neuen Gesetz-Gruppe wird eine Kopfzeile eingefügt. Die Liste muss bereits
 * nach Gesetz sortiert sein (siehe lesezeichenSpeicher.ts), sonst entstehen
 * mehrere Kopfzeilen für dasselbe Gesetz.
 */
export function baueZeilen(eintraege: Lesezeichen[]): Zeile[] {
  const zeilen: Zeile[] = [];
  let letztesGesetz: Gesetzesreferenz | null = null;
  eintraege.forEach((eintrag, tastenkuerzelIndex) => {
    if (!letztesGesetz || !istGleichesGesetz(eintrag.gesetz, letztesGesetz)) {
      zerlegeKurztitel(eintrag.gesetz.kurztitel).forEach((text, i) =>
        zeilen.push({ typ: 'kopf', gesetz: eintrag.gesetz, text, ersteGesetzeszeile: i === 0 }),
      );
      letztesGesetz = eintrag.gesetz;
    }
    zeilen.push({ typ: 'eintrag', eintrag, tastenkuerzelIndex });
  });
  return zeilen;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

export interface TastenkuerzelInfo {
  /** Die angezeigte Ziffer: „1"–„9", „0", oder „" wenn kein Tastenkürzel. */
  ziffer: string;
  /** Kursiv-Darstellung für Shift-Variante (Index 10–19). */
  kursiv: boolean;
  /** Volle Tastenkombination für den nativen Hover-Tooltip. */
  tooltip: string;
}

/**
 * Tastenkürzel-Info für das n-te Lesezeichen:
 *   0– 9: ⌥1–⌥0   → Ziffer „1"–„0", nicht kursiv
 *  10–19: ⌥⇧1–⌥⇧0 → Ziffer „1"–„0", kursiv
 *  ≥ 20: kein Tastenkürzel
 */
export function lesezeichenTastenkuerzelInfo(index: number, istMac: boolean): TastenkuerzelInfo {
  if (index < 0 || index >= 20) return { ziffer: '', kursiv: false, tooltip: '' };
  const n = (index % 10) + 1;
  const ziffer = n === 10 ? '0' : String(n);
  if (index < 10)
    return {
      ziffer,
      kursiv: false,
      tooltip: tastenkuerzelAnzeige('lesezeichen-1-10', istMac, n % 10),
    };
  return {
    ziffer,
    kursiv: true,
    tooltip: tastenkuerzelAnzeige('lesezeichen-11-20', istMac, n % 10),
  };
}
