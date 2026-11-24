// euBeschaffung.ts
// Beschafft EU-Archive mit Herkunftsinvalidation vor jeder Änderung des Quellenstands.
import { STANDARD_EU_FASSUNG } from '@/lib/domain/euFassungsvertrag';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { ImportFehler } from '@/lib/import/importVertrag.types';
import {
  konvertiereEuQuelle,
  extrahiereEuErwaegungsgruende,
  type EuDownload,
  type EuQuelle,
  type EuHerkunft,
} from '@/lib/import/eu/eu.index';

export interface EuBeschaffungsErgebnis {
  fehler?: string;
  fehlerart?: 'nicht-verfuegbar' | 'download' | 'format';
  netz: boolean;
  gesetzesXMLGeloescht?: boolean;
  teilerfolg?: string;
  hinweis?: string;
  rueckfall?: boolean;
}
export interface EuBeschaffungsUmgebung {
  laden(
    eintrag: ImportindexSucheEintrag,
    fassung: typeof STANDARD_EU_FASSUNG,
  ): Promise<EuDownload | { fehler: ImportFehler }>;
  leseHerkunft(kurztitel: string): Promise<string | null>;
  leseOriginal(kurztitel: string): Promise<Uint8Array | null>;
  loescheGesetzesXML(kurztitel: string): Promise<boolean>;
  loescheHerkunft(kurztitel: string): Promise<void>;
  schreibeArchiv(
    art: 'konsolidiert' | 'original',
    kurztitel: string,
    inhalt: Uint8Array,
  ): Promise<void>;
  schreibeHerkunft(kurztitel: string, herkunft: EuHerkunft): Promise<void>;
  nachbereiten(xml: string, eintrag: ImportindexSucheEintrag): Promise<string>;
  pruefeXML(xml: string): boolean;
  schreibeGesetzesXML(kurztitel: string, xml: string): Promise<void>;
  pause(ms: number): Promise<void>;
  zufall(): number;
  jetzt(): Date;
}
function fehlerart(fehler: ImportFehler): EuBeschaffungsErgebnis['fehlerart'] {
  if (fehler.grund === 'nichtVerfuegbar') return 'nicht-verfuegbar';
  return ['format', 'entpacken'].includes(fehler.grund) ? 'format' : 'download';
}
async function leseOriginalZuordnung(
  kurztitel: string,
  umgebung: EuBeschaffungsUmgebung,
): Promise<string | null> {
  const text = await umgebung.leseHerkunft(kurztitel);
  if (!text) return null;
  let herkunft: unknown;
  try {
    herkunft = JSON.parse(text);
  } catch {
    return null;
  }
  if (!herkunft || typeof herkunft !== 'object') return null;
  if ('originalBasisCelex' in herkunft)
    return typeof herkunft.originalBasisCelex === 'string' ? herkunft.originalBasisCelex : null;
  return 'basisCelex' in herkunft && typeof herkunft.basisCelex === 'string'
    ? herkunft.basisCelex
    : null;
}
async function ergaenzeAusBestand(
  quelle: EuDownload,
  eintrag: ImportindexSucheEintrag,
  umgebung: EuBeschaffungsUmgebung,
  originalBasisCelex: string | null,
): Promise<boolean> {
  if (
    !['fehlgeschlagen', 'nicht-verfuegbar'].includes(quelle.herkunft.ergaenzung) ||
    originalBasisCelex !== eintrag.abrufkennung
  )
    return false;
  const original = await umgebung.leseOriginal(eintrag.kurztitel);
  if (!original) return false;
  const ergaenzung = extrahiereEuErwaegungsgruende(original);
  if ('fehler' in ergaenzung || !ergaenzung.normen.length) return false;
  quelle.archive.original = original;
  quelle.herkunft.ergaenzung = 'ergaenzt';
  return true;
}
export async function beschaffeEuQuelldatei(
  eintrag: ImportindexSucheEintrag,
  umgebung: EuBeschaffungsUmgebung,
): Promise<EuBeschaffungsErgebnis> {
  let geloescht = false;
  try {
    let quelle: Awaited<ReturnType<EuBeschaffungsUmgebung['laden']>>;
    try {
      quelle = await umgebung.laden(eintrag, STANDARD_EU_FASSUNG);
    } catch (fehler) {
      return { fehler: String(fehler), fehlerart: 'download', netz: true };
    }
    if ('fehler' in quelle)
      return { fehler: quelle.fehler.meldung, fehlerart: fehlerart(quelle.fehler), netz: true };
    const originalBasisCelex = await leseOriginalZuordnung(eintrag.kurztitel, umgebung);
    const wiederverwendet = await ergaenzeAusBestand(quelle, eintrag, umgebung, originalBasisCelex);
    quelle.herkunft.originalBasisCelex = quelle.archive.original
      ? eintrag.abrufkennung
      : originalBasisCelex;
    geloescht = await umgebung.loescheGesetzesXML(eintrag.kurztitel);
    await umgebung.loescheHerkunft(eintrag.kurztitel);
    for (const art of ['konsolidiert', 'original'] as const) {
      const archiv = quelle.archive[art];
      if (archiv) await umgebung.schreibeArchiv(art, eintrag.kurztitel, archiv);
    }
    await umgebung.schreibeHerkunft(eintrag.kurztitel, quelle.herkunft);
    const erzeugt = await erzeugeEuGesetzesXML(quelle, eintrag, umgebung);
    if (erzeugt.fehler !== undefined)
      return {
        fehler: `${erzeugt.fehler}; Quelldatei bleibt gespeichert.${geloescht && !erzeugt.fehler.includes('GesetzesXML gelöscht') ? '; GesetzesXML gelöscht.' : ''}`,
        fehlerart: 'format',
        netz: true,
      };
    return {
      netz: true,
      gesetzesXMLGeloescht: geloescht,
      rueckfall: quelle.herkunft.fassung === 'original',
      ...(wiederverwendet
        ? {
            hinweis: `Vorhandenes Original wiederverwendet; neuer Originalabruf: ${quelle.ergaenzungsfehler?.meldung ?? 'nicht verfügbar'}.`,
          }
        : {}),
      ...(quelle.herkunft.ergaenzung === 'fehlgeschlagen'
        ? {
            teilerfolg: `Nur das Basisarchiv liegt vor; Original für die Erwägungsgründe fehlt: ${quelle.ergaenzungsfehler?.meldung ?? 'Abruf fehlgeschlagen'}.`,
          }
        : {}),
    };
  } catch (fehler) {
    if (geloescht) throw new Error(`${String(fehler)}; GesetzesXML gelöscht.`, { cause: fehler });
    throw fehler;
  } finally {
    await umgebung.pause(500 + umgebung.zufall() * 1000);
  }
}

/** Offline-Konvertierung behält Archive und entfernt bei Gesetzfehlern veraltetes GesetzesXML. */
export async function erzeugeEuGesetzesXML(
  quelle: EuQuelle,
  eintrag: ImportindexSucheEintrag,
  umgebung: Pick<
    EuBeschaffungsUmgebung,
    'jetzt' | 'nachbereiten' | 'pruefeXML' | 'loescheGesetzesXML' | 'schreibeGesetzesXML'
  >,
  schreibeHerkunft?: EuBeschaffungsUmgebung['schreibeHerkunft'],
): Promise<{ fehler?: string; teilerfolg?: string; gesetzesXMLGeloescht?: boolean }> {
  let xml: string;
  let originalFehlt: boolean;
  let geloescht = false;
  try {
    const konvertiert = konvertiereEuQuelle(eintrag, quelle, umgebung.jetzt());
    if ('fehler' in konvertiert) throw Error(konvertiert.fehler.meldung);
    originalFehlt = konvertiert.originalFehlt;
    xml = await umgebung.nachbereiten(konvertiert.xml, eintrag);
    if (!umgebung.pruefeXML(xml)) throw Error('Das GesetzesXML konnte nicht gelesen werden.');
  } catch (fehler) {
    const geloescht = await umgebung.loescheGesetzesXML(eintrag.kurztitel);
    return { fehler: `${String(fehler)}${geloescht ? '; GesetzesXML gelöscht.' : ''}` };
  }
  try {
    if (
      !originalFehlt &&
      quelle.archive.original &&
      quelle.herkunft.ergaenzung !== 'nicht-noetig' &&
      quelle.herkunft.ergaenzung !== 'ergaenzt' &&
      schreibeHerkunft
    ) {
      geloescht = await umgebung.loescheGesetzesXML(eintrag.kurztitel);
      await schreibeHerkunft(eintrag.kurztitel, { ...quelle.herkunft, ergaenzung: 'ergaenzt' });
    }
    await umgebung.schreibeGesetzesXML(eintrag.kurztitel, xml);
  } catch (fehler) {
    if (geloescht) throw new Error(`${String(fehler)}; GesetzesXML gelöscht.`, { cause: fehler });
    throw fehler;
  }
  return {
    ...(geloescht ? { gesetzesXMLGeloescht: true } : {}),
    ...(originalFehlt && quelle.herkunft.ergaenzung !== 'nicht-verfuegbar'
      ? {
          teilerfolg:
            'Original für die nötigen Erwägungsgründe fehlt; GesetzesXML ohne Ergänzung gespeichert.',
        }
      : {}),
  };
}
