// Validiert den gesamten abgeleiteten Dateivertrag und stellt Datumsfelder wieder her.
import type { Suchverzeichniseintrag, Suchnorm } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { istGueltigerNormgeber } from '@/lib/domain/gesetzesreferenz';
import { istRecord } from '@/lib/persistenz/kern/kern.index';
import { istDateistempel } from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzDateistempel';

const praefixstrukturen = [
  'paragraph',
  'artikel',
  'gliederungsartikel',
  'regel',
  'nummer',
  'arabisch',
  'alphabetisch',
  'roemisch',
  'ohne-praefix',
  'artikel-und-paragraphen',
  'unklar',
];
const optionalText = (w: unknown) => w === undefined || typeof w === 'string';
const textOderNull = (w: unknown) => w === null || typeof w === 'string';
const familie = (w: unknown) =>
  w === undefined || w === 'paragraph' || w === 'artikel' || w === 'canon';
function istSuchnorm(n: unknown): n is Suchnorm {
  return (
    istRecord(n) &&
    typeof n.xmlId === 'string' &&
    typeof n.bezeichnung === 'string' &&
    ['normal', 'gliederungsartikel', 'erwaegungsgrund'].includes(String(n.art)) &&
    typeof n.istArtikel === 'boolean' &&
    textOderNull(n.artikelkennzeichen) &&
    Array.isArray(n.normzahlen) &&
    n.normzahlen.every((z) => typeof z === 'string') &&
    familie(n.normPraefixFamilie) &&
    textOderNull(n.nebennormzahl) &&
    (n.bereich === null ||
      (Array.isArray(n.bereich) &&
        n.bereich.length === 2 &&
        n.bereich.every((z) => typeof z === 'number' && Number.isSafeInteger(z) && z >= 0)))
  );
}
function stelleDatumHer(objekt: Record<string, unknown>, feld: string): boolean {
  if (objekt[feld] === undefined) return true;
  const wert = objekt[feld];
  if (typeof wert !== 'string' || !Number.isFinite(Date.parse(wert))) return false;
  objekt[feld] = new Date(wert);
  return true;
}
function optionaleKopfangaben(e: Record<string, unknown>): boolean {
  if (
    !['fundstelle', 'ausfertigung', 'aenderungsvermerk', 'neugefasst', 'sprache'].every((f) =>
      optionalText(e[f]),
    ) ||
    !familie(e.normpraefix)
  )
    return false;
  if (
    e.datenquelle !== undefined &&
    (!istRecord(e.datenquelle) ||
      !optionalText(e.datenquelle.name) ||
      !optionalText(e.datenquelle.url))
  )
    return false;
  if (
    e.fassung !== undefined &&
    (!istRecord(e.fassung) ||
      !['konsolidiert', 'original'].includes(String(e.fassung.art)) ||
      !optionalText(e.fassung.stichtag) ||
      (e.fassung.erwaegungsgruendeErgaenzt !== undefined &&
        typeof e.fassung.erwaegungsgruendeErgaenzt !== 'boolean'))
  )
    return false;
  return stelleDatumHer(e, 'verarbeitungszeit') && stelleDatumHer(e, 'letzteNeuerung');
}
export function istSuchverzeichniseintrag(e: unknown): e is Suchverzeichniseintrag {
  if (!istRecord(e) || !istDateistempel(e.dateistempel)) return false;
  const referenz =
    typeof e.kurztitel === 'string' &&
    e.kurztitel.length > 0 &&
    typeof e.normgeber === 'string' &&
    istGueltigerNormgeber(e.normgeber);
  if (e.status === 'nicht-lesbar') {
    return (
      (referenz || (e.kurztitel === undefined && e.normgeber === undefined)) &&
      Object.keys(e).every((k) => ['status', 'kurztitel', 'normgeber', 'dateistempel'].includes(k))
    );
  }
  return (
    e.status === 'in-ordnung' &&
    referenz &&
    typeof e.langtitel === 'string' &&
    typeof e.hatNormenOhneTitel === 'boolean' &&
    typeof e.hatGliederungsartikel === 'boolean' &&
    (e.praefixstruktur === undefined || praefixstrukturen.includes(String(e.praefixstruktur))) &&
    Array.isArray(e.normen) &&
    e.normen.every(istSuchnorm) &&
    optionaleKopfangaben(e) &&
    !('elemente' in e)
  );
}
