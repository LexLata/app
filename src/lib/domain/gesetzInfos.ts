// gesetzInfos.ts
// Gemeinsame Kopfangaben; Leser sagen nur die tatsächlich benötigte Vollständigkeit zu.
import type { Normgeber } from './gesetzTypes';

export interface GesetzInfos {
  kurztitel: string;
  langtitel?: string;
  fundstelle?: string;
  ausfertigung?: string;
  aenderungsvermerk?: string;
  neugefasst?: string;
  fassung?: {
    art: 'konsolidiert' | 'original';
    stichtag?: string;
    erwaegungsgruendeErgaenzt?: boolean;
  };
  datenquelle?: { name?: string; url?: string };
  normgeber: Normgeber;
  verarbeitungszeit?: Date;
  letzteNeuerung?: Date;
}

/** Der XML-Bauer benötigt die bisherigen Pflichtangaben und technischen Zusätze. */
export type GesetzInfosFuerXML = GesetzInfos &
  Required<Pick<GesetzInfos, 'langtitel' | 'normgeber'>> & {
    hatGliederungsartikel?: boolean;
  };

/** Liest ausschließlich die strukturierten Fassungsangaben. */
export function leseFassung(infos: Element): GesetzInfos['fassung'] {
  const element = infos.querySelector(':scope > fassung');
  const art = element?.getAttribute('art');
  if (art !== 'konsolidiert' && art !== 'original') return undefined;
  return {
    art,
    stichtag: element?.getAttribute('stichtag') || undefined,
    erwaegungsgruendeErgaenzt:
      element?.getAttribute('erwaegungsgruendeErgaenzt') === 'true' || undefined,
  };
}

/** Bisheriger Wortlaut für die Anzeige einer EU-Fassung. */
export function formatFassung(fassung: NonNullable<GesetzInfos['fassung']>): string {
  const text =
    fassung.art === 'konsolidiert' && fassung.stichtag
      ? `Konsolidierte Fassung vom ${fassung.stichtag.split('-').reverse().join('.')} (keine Rechtswirkung)`
      : fassung.art === 'original'
        ? 'Originaltext'
        : 'Konsolidierte Fassung (keine Rechtswirkung)';
  return text + (fassung.erwaegungsgruendeErgaenzt ? '; Erwägungsgründe aus dem Originaltext' : '');
}
