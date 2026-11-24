// suchverzeichnis.ts
// Abgeleitete Suchdaten: keine Referenzen auf ursprüngliche Normobjekte.
// Darstellungselemente werden nach dem Parsen ersetzt, nicht in-place verändert.
import type { GesetzDarstellung, NormDarstellung } from '@/lib/domain/gesetzTypes';
import { ermittlePraefixstruktur, type Praefixstruktur } from '@/lib/domain/praefixstruktur';
import { istArtikelBezeichnung } from '@/lib/domain/norm/norm.index';
import {
  familieVonText,
  normPraefixQuelle,
  type NormPraefixFamilie,
} from '@/lib/domain/basis/normPraefixe';

const praefix = new RegExp(
  `^(?:${normPraefixQuelle('abstand')}|Regel(?:n)?|Nr\\.?)\\s*(?=\\d)`,
  'i',
);
export interface Suchnorm {
  xmlId: string;
  bezeichnung: string;
  art: NormDarstellung['art'];
  istArtikel: boolean;
  artikelkennzeichen: string | null;
  normzahlen: string[];
  normPraefixFamilie: NormPraefixFamilie | undefined;
  bereich: readonly [number, number] | null;
  nebennormzahl: string | null;
}
export interface Suchdaten {
  praefixstruktur: Praefixstruktur | undefined;
  hatGliederungsartikel: boolean;
  normen: Suchnorm[];
}

function leiteSuchdatenAb(gesetz: GesetzDarstellung): Suchdaten {
  const normen: Suchnorm[] = [];
  let artikelkennzeichen: string | null = null;
  for (const element of gesetz.elemente) {
    if (element.typ !== 'norm') continue;
    const { xmlId, bezeichnung, art } = element.data;
    if (art === 'gliederungsartikel') artikelkennzeichen = xmlId.toLowerCase();
    const text = bezeichnung.trim();
    const praefixtreffer = praefix.exec(text);
    const zahlen = text.replace(praefix, '').toLowerCase();
    const bereich = /(\d+)\s*bis\s*(\d+)/i.exec(text);
    normen.push({
      xmlId,
      bezeichnung,
      art,
      artikelkennzeichen,
      istArtikel: istArtikelBezeichnung(bezeichnung),
      normPraefixFamilie: familieVonText(praefixtreffer?.[0] ?? ''),
      normzahlen:
        art !== 'erwaegungsgrund' && praefixtreffer ? (zahlen.match(/\d+[a-z]*/g) ?? []) : [],
      bereich: bereich ? [Number(bereich[1]), Number(bereich[2])] : null,
      // Die Suche ist bewusst offener als die Präfixstruktur-Erkennung:
      // Auch Muster und Ziffern mitten in einer Bezeichnung sind auffindbar.
      nebennormzahl:
        art !== 'erwaegungsgrund' && !praefixtreffer
          ? (text.toLowerCase().match(/\d+[a-z]*/)?.[0] ?? null)
          : null,
    });
  }
  const eintrag = {
    normen,
    hatGliederungsartikel: gesetz.hatGliederungsartikel,
    praefixstruktur: ermittlePraefixstruktur(gesetz).praefixstruktur,
  };
  return eintrag;
}

export function liegtInSuchbereich(norm: Suchnorm, nummer: string): boolean {
  return (
    /^\d+$/.test(nummer) &&
    norm.bereich !== null &&
    Number(nummer) >= norm.bereich[0] &&
    Number(nummer) <= norm.bereich[1]
  );
}

/** Präzisionserhaltende Dezimaltexte, keine JavaScript-Zeitstempel. */
export interface Dateistempel {
  groesse: string;
  aenderungszeit: string;
}
export type Suchverzeichniseintrag =
  | (Omit<GesetzDarstellung, 'elemente'> &
      Suchdaten & {
        status: 'in-ordnung';
        hatNormenOhneTitel: boolean;
        dateistempel: Dateistempel;
      })
  | {
      status: 'nicht-lesbar';
      kurztitel?: string;
      normgeber?: string;
      dateistempel: Dateistempel;
    };

/** Eigenständige Kopfangaben und Suchnormen, keine Darstellungselemente. */
export function leiteSuchverzeichniseintragAb(
  gesetz: GesetzDarstellung,
  dateistempel: Dateistempel,
): Extract<Suchverzeichniseintrag, { status: 'in-ordnung' }> {
  const { elemente, ...kopfangaben } = gesetz;
  return {
    ...structuredClone(kopfangaben),
    ...structuredClone(leiteSuchdatenAb(gesetz)),
    status: 'in-ordnung',
    hatNormenOhneTitel: elemente.some(
      (e) => e.typ === 'norm' && (!e.data.titel || e.data.titelIstNichtamtlich),
    ),
    dateistempel: { ...dateistempel },
  };
}

/** Lesbarer Eintrag mit vollständigen Kopfangaben und Suchnormen. */
export type LesbarerSuchverzeichniseintrag = Extract<
  Suchverzeichniseintrag,
  { status: 'in-ordnung' }
>;
