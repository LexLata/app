// euDownload.ts
// Beschafft Formex-Archive und Herkunft ohne Zugriff auf den App-Speicher.
import type { EuFassung } from '@/lib/domain/euFassungsvertrag';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { ImportFehler } from '@/lib/import/importVertrag.types';
import {
  ladeFormex,
  ladeKonsolidierungen,
  waehleKonsolidierung,
  type Konsolidierung,
} from './cellar';
import { extrahiereFormexZip } from './formexZip';
import { parseFormex } from './formexParser';
import { brauchtEuOriginal, extrahiereEuErwaegungsgruende } from './erwaegungsgruendeEU';
export interface EuHerkunft {
  basisCelex: string;
  originalBasisCelex?: string | null;
  fassung: 'konsolidiert' | 'original';
  celex: string;
  datum?: string;
  ergaenzung: 'nicht-noetig' | 'ergaenzt' | 'nicht-verfuegbar' | 'fehlgeschlagen';
}
export interface EuQuelle {
  archive: { konsolidiert?: Uint8Array; original?: Uint8Array };
  herkunft: EuHerkunft;
}
export interface EuDownload extends EuQuelle {
  konsolidierung?: Konsolidierung;
  ergaenzungsfehler?: ImportFehler;
}
/** Die Gegenfassung wird ausschließlich nach 404/406 und höchstens einmal angefragt. */
async function ladeFassung(basisCelex: string, fassung: 'konsolidiert' | 'original') {
  const heute = new Date().toISOString().slice(0, 10);
  let konsolidierung: Konsolidierung | undefined;
  const konsolidierungLaden = async () => {
    const zeilen = await ladeKonsolidierungen(basisCelex);
    if ('fehler' in zeilen) return zeilen;
    konsolidierung = waehleKonsolidierung(zeilen, heute);
    return undefined;
  };
  if (fassung === 'konsolidiert') {
    const fehler = await konsolidierungLaden();
    if (fehler) return fehler;
  }
  let verwendet = fassung === 'konsolidiert' ? konsolidierung : undefined;
  let download = await ladeFormex(verwendet?.celex ?? basisCelex);
  if ('fehlt' in download) {
    if (verwendet) {
      verwendet = undefined;
      download = await ladeFormex(basisCelex);
    } else if (fassung === 'original') {
      const fehler = await konsolidierungLaden();
      if (fehler) return fehler;
      if (konsolidierung) {
        verwendet = konsolidierung;
        download = await ladeFormex(konsolidierung.celex);
      }
    }
  }
  return { download, verwendet, konsolidierung };
}

/** Liefert die unveränderten Archive; ergänzende Fehler bleiben von Basisfehlern unterscheidbar. */
export async function ladeEuQuelle(
  eintrag: ImportindexSucheEintrag,
  fassung: EuFassung,
  entpacken?: () => void,
): Promise<EuDownload | { fehler: ImportFehler }> {
  const ergebnis = await ladeFassung(
    eintrag.abrufkennung,
    fassung === 'original' ? 'original' : 'konsolidiert',
  );
  if ('fehler' in ergebnis) return ergebnis;
  const { download, verwendet, konsolidierung } = ergebnis;
  if ('fehler' in download) return download;
  if ('fehlt' in download)
    return { fehler: { grund: 'nichtVerfuegbar', meldung: 'Fassung nicht verfügbar.' } };
  entpacken?.();
  const archiv = extrahiereFormexZip(download.zip);
  if ('fehler' in archiv)
    return { fehler: { grund: archiv.grund ?? 'entpacken', meldung: archiv.fehler } };
  const normen = parseFormex(archiv.hauptdatei);
  if ('fehler' in normen) return { fehler: { grund: 'format', meldung: normen.fehler } };
  const quelle: EuDownload = {
    archive: verwendet ? { konsolidiert: download.zip } : { original: download.zip },
    herkunft: {
      basisCelex: eintrag.abrufkennung,
      fassung: verwendet ? 'konsolidiert' : 'original',
      celex: verwendet?.celex ?? eintrag.abrufkennung,
      datum: verwendet?.datum,
      ergaenzung: 'nicht-noetig',
    },
    konsolidierung,
  };
  if (!brauchtEuOriginal(fassung, verwendet !== undefined, normen)) return quelle;
  return ergaenzeEuQuelle(quelle, eintrag.abrufkennung);
}

/** Ergänzungsfehler erhalten die brauchbare Basisquelle. */
async function ergaenzeEuQuelle(quelle: EuDownload, basisCelex: string): Promise<EuDownload> {
  const original = await ladeFormex(basisCelex);
  if ('fehlt' in original) {
    quelle.herkunft.ergaenzung = 'nicht-verfuegbar';
    quelle.ergaenzungsfehler = { grund: 'download', meldung: 'Kein Formex-Original verfügbar.' };
    return quelle;
  }
  const ergaenzung = 'fehler' in original ? original : extrahiereEuErwaegungsgruende(original.zip);
  if ('fehler' in ergaenzung) {
    quelle.herkunft.ergaenzung = 'fehlgeschlagen';
    quelle.ergaenzungsfehler = ergaenzung.fehler;
  } else {
    if ('zip' in original) quelle.archive.original = original.zip;
    quelle.herkunft.ergaenzung = ergaenzung.normen.length ? 'ergaenzt' : 'nicht-verfuegbar';
    if (!ergaenzung.normen.length)
      quelle.ergaenzungsfehler = {
        grund: 'format',
        meldung: 'Im Original sind keine lesbaren Erwägungsgründe enthalten.',
      };
  }
  return quelle;
}
