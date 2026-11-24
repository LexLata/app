// Vollständige Ausgangskennungen aus konkreten Elementen, getrennt von Verweiszielen.
import type {
  DarstellungsElement,
  GesetzDarstellung,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import { vollstaendigeBezeichnung } from './normAufloesung';
import { findeUebergeordnetenArtikel } from './normStrukturPruefung';
import { normSammelbereichAufloesbar } from '@/lib/domain/gesetzDarstellungAuswertung';
import { istErwaegungsgrundBezeichnung, gleicheNormBezeichnung } from './verweisAufloesung';

/** Bewahrt Quellschreibweise und tatsächlichen Artikelkontext in einer vollen Bezeichnung. */
export function bildeAusgangskennung(
  gesetz: GesetzDarstellung,
  el: DarstellungsElement,
): Ausgangsstelle | null {
  if (el.typ === 'ueberschrift')
    return el.data.gliederungskennzahl.trim()
      ? { typ: 'ueberschrift', gliederungskennzahl: el.data.gliederungskennzahl }
      : null;
  const norm = el.data;
  if (norm.art === 'erwaegungsgrund')
    return istErwaegungsgrundBezeichnung(norm.bezeichnung)
      ? { typ: 'erwaegungsgrund', bezeichnung: norm.bezeichnung }
      : null;
  const bezeichnung = vollstaendigeBezeichnung(gesetz, el);
  if (!norm.bezeichnung.trim() || !bezeichnung || istErwaegungsgrundBezeichnung(bezeichnung))
    return null;
  return { typ: 'norm', bezeichnung };
}

function passt(a: Ausgangsstelle, b: Ausgangsstelle): boolean {
  if (a.typ !== b.typ || a.typ === 'ueberschrift' || b.typ === 'ueberschrift') return false;
  if (a.typ === 'erwaegungsgrund' && b.typ === 'erwaegungsgrund')
    return a.bezeichnung.toLowerCase() === b.bezeichnung.toLowerCase();
  return (
    a.typ === 'norm' && b.typ === 'norm' && gleicheNormBezeichnung(a.bezeichnung, b.bezeichnung)
  );
}

/** Prüft Sammelzahlen und Bereiche ohne Aufzählung im tatsächlichen Artikelkontext. */
function passtSammelkennung(
  gesetz: GesetzDarstellung,
  norm: NormDarstellung,
  stelle: Ausgangsstelle,
): boolean {
  if (!normSammelbereichAufloesbar(norm) || stelle.typ !== 'norm') return false;
  const sammel = norm.bezeichnung.match(
    /^(§§|Art(?:ikel)?\.?|Anhang|Anlage)\s*(\d+(?:(?:\s*(?:,|und|bis|–|-)\s*)\d+)+)$/i,
  );
  const [, symbol, zahlen] = sammel ?? [];
  const zielzahl = stelle.bezeichnung.trim().match(/(\d+)$/)?.[1];
  if (symbol === undefined || zahlen === undefined || zielzahl === undefined) return false;
  const zahl = BigInt(zielzahl);
  const praefix = symbol === '§§' ? '§' : symbol;
  const artikel = findeUebergeordnetenArtikel(gesetz.elemente, norm);
  const kandidat: Ausgangsstelle = {
    typ: 'norm',
    bezeichnung: [artikel?.bezeichnung, `${praefix} ${zahl}`].filter(Boolean).join(' '),
  };
  if (!passt(stelle, kandidat)) return false;
  for (const treffer of zahlen.matchAll(/(\d+)(?:\s*(?:bis|–|-)\s*(\d+))?/g)) {
    const vonText = treffer[1];
    if (vonText === undefined) continue;
    const von = BigInt(vonText);
    const bis = BigInt(treffer[2] ?? vonText);
    if (zahl === von || (zahl > von && zahl <= bis)) return true;
  }
  return false;
}
/** Alle realen Kandidaten prüfen; gleichwertige Schreibweisen entscheiden keine Mehrdeutigkeit. */
export function loeseNormAusgangsstelleAuf(
  gesetz: GesetzDarstellung,
  stelle: Ausgangsstelle,
): { norm?: NormDarstellung; anzahlTreffer: number } {
  const treffer = new Set<NormDarstellung>();
  for (const el of gesetz.elemente) {
    if (el.typ !== 'norm') continue;
    const kennung = bildeAusgangskennung(gesetz, el);
    if (kennung && (passt(stelle, kennung) || passtSammelkennung(gesetz, el.data, stelle)))
      treffer.add(el.data);
  }
  return { norm: treffer.size === 1 ? [...treffer][0] : undefined, anzahlTreffer: treffer.size };
}
