// euGesetzesxml.ts
// Liest vollständige EU-Quellen offline mit geprüfter Herkunft und Originalzuordnung.
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import {
  extrahiereEuErwaegungsgruende,
  type EuHerkunft,
  type EuQuelle,
} from '@/lib/import/eu/eu.index';
import { erzeugeEuGesetzesXML, type EuBeschaffungsUmgebung } from './euBeschaffung';

export interface EuGesetzesXMLUmgebung extends Pick<
  EuBeschaffungsUmgebung,
  | 'leseHerkunft'
  | 'nachbereiten'
  | 'pruefeXML'
  | 'loescheGesetzesXML'
  | 'schreibeGesetzesXML'
  | 'schreibeHerkunft'
  | 'jetzt'
> {
  leseArchiv(art: 'konsolidiert' | 'original', kurztitel: string): Promise<Uint8Array | null>;
}
function istHerkunft(wert: unknown): wert is EuHerkunft {
  if (!wert || typeof wert !== 'object') return false;
  if (!(
    'basisCelex' in wert &&
    typeof wert.basisCelex === 'string' &&
    !!wert.basisCelex &&
    'celex' in wert &&
    typeof wert.celex === 'string' &&
    !!wert.celex &&
    'fassung' in wert &&
    (wert.fassung === 'original' || wert.fassung === 'konsolidiert') &&
    'ergaenzung' in wert &&
    ['nicht-noetig', 'ergaenzt', 'nicht-verfuegbar', 'fehlgeschlagen'].some(
      (s) => s === wert.ergaenzung,
    ) &&
    (!('datum' in wert) ||
      (typeof wert.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wert.datum))) &&
    (!('originalBasisCelex' in wert) ||
      wert.originalBasisCelex === null ||
      typeof wert.originalBasisCelex === 'string')
  ))
    return false;
  if (!/^[13]\d{4}[A-Z]\d*(?:\/TXT)?$/.test(wert.basisCelex)) return false;
  if (wert.fassung === 'original') return wert.celex === wert.basisCelex && !('datum' in wert);
  if (!('datum' in wert) || typeof wert.datum !== 'string') return false;
  const datum = new Date(`${wert.datum}T00:00:00Z`);
  return (
    !Number.isNaN(datum.getTime()) &&
    datum.toISOString().slice(0, 10) === wert.datum &&
    wert.celex === `0${wert.basisCelex.slice(1)}-${wert.datum.replaceAll('-', '')}`
  );
}
function parseHerkunft(text: string | null): EuHerkunft | null {
  try {
    const wert: unknown = text === null ? null : JSON.parse(text);
    return istHerkunft(wert) ? wert : null;
  } catch {
    return null;
  }
}
export async function erzeugeEuGesetzesXMLAusBestand(
  eintrag: ImportindexSucheEintrag,
  umgebung: EuGesetzesXMLUmgebung,
): Promise<{ fehler?: string; teilerfolg?: string; gesetzesXMLGeloescht?: boolean }> {
  const text = await umgebung.leseHerkunft(eintrag.kurztitel);
  const herkunft = parseHerkunft(text);
  const fehler = async (meldung: string) => {
    const geloescht = await umgebung.loescheGesetzesXML(eintrag.kurztitel);
    return { fehler: `${meldung}${geloescht ? '; GesetzesXML gelöscht.' : ''}` };
  };
  if (!herkunft || herkunft.basisCelex !== eintrag.abrufkennung)
    return fehler(
      text === null
        ? 'Herkunftsangabe fehlt; unvollständige Quelle.'
        : 'Ungültige Herkunftsangabe.',
    );
  const quelle: EuQuelle = { archive: {}, herkunft };
  const basis = await umgebung.leseArchiv(herkunft.fassung, eintrag.kurztitel);
  if (!basis) return fehler('Basisarchiv fehlt.');
  quelle.archive[herkunft.fassung] = basis;
  const zuordnung =
    herkunft.originalBasisCelex === undefined ? herkunft.basisCelex : herkunft.originalBasisCelex;
  if (herkunft.fassung === 'original' && zuordnung !== eintrag.abrufkennung)
    return fehler('Original-Basisarchiv ist keinem passenden Gesetz zugeordnet.');
  if (
    herkunft.fassung === 'konsolidiert' &&
    zuordnung === eintrag.abrufkennung &&
    herkunft.ergaenzung !== 'nicht-noetig'
  ) {
    const original = await umgebung.leseArchiv('original', eintrag.kurztitel);
    if (original) {
      const gelesen = extrahiereEuErwaegungsgruende(original);
      if ('fehler' in gelesen) return fehler(gelesen.fehler.meldung);
      quelle.archive.original = original;
    }
  }
  return erzeugeEuGesetzesXML(quelle, eintrag, umgebung, umgebung.schreibeHerkunft);
}
