// beschaffung.ts
// Geordnete Quellspeicherung und separat nutzbare Offline-Konvertierung.
import { berechneVerzoegerungMs } from '@/lib/import/basis/basis.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { ImportErgebnis } from '@/lib/import/basis/basis.index';

type GesetzErgebnis =
  { gesetz: GesetzDarstellung; fehler?: never } | { fehler: string; gesetz?: never };
export type BeschaffungsErgebnis = GesetzErgebnis & {
  netz: boolean;
  gesetzesXMLGeloescht?: boolean;
};
export interface BeschaffungsUmgebung {
  laden(eintrag: ImportindexSucheEintrag): Promise<ImportErgebnis>;
  loescheGesetzesXML(kurztitel: string): Promise<boolean>;
  schreibeQuelle(kurztitel: string, quelle: string): Promise<void>;
  konvertieren(quelle: string, eintrag: ImportindexSucheEintrag): ImportErgebnis;
  nachbereiten(xml: string, eintrag: ImportindexSucheEintrag): Promise<string>;
  parsen(xml: string): GesetzDarstellung | null;
  schreibeGesetzesXML(kurztitel: string, xml: string): Promise<void>;
  pause(ms: number): Promise<void>;
  zufall(): number;
}

export async function erzeugeGesetzesXML(
  quelle: string,
  eintrag: ImportindexSucheEintrag,
  umgebung: BeschaffungsUmgebung,
): Promise<GesetzErgebnis> {
  let xml: string;
  let gesetz: GesetzDarstellung;
  try {
    const konvertiert = umgebung.konvertieren(quelle, eintrag);
    if (konvertiert.fehler !== undefined) throw new Error(konvertiert.fehler);
    xml = await umgebung.nachbereiten(konvertiert.xmlString, eintrag);
    const gelesen = umgebung.parsen(xml);
    if (!gelesen) throw new Error('Das GesetzesXML konnte nicht gelesen werden.');
    gesetz = gelesen;
  } catch (fehler) {
    const geloescht = await umgebung.loescheGesetzesXML(eintrag.kurztitel);
    return { fehler: `${String(fehler)}${geloescht ? '; GesetzesXML gelöscht.' : ''}` };
  }
  await umgebung.schreibeGesetzesXML(eintrag.kurztitel, xml);
  return { gesetz };
}

export async function beschaffeBundQuelldatei(
  eintrag: ImportindexSucheEintrag,
  umgebung: BeschaffungsUmgebung,
): Promise<BeschaffungsErgebnis> {
  return beschaffeQuelldatei(eintrag, umgebung, true);
}

export function beschaffeBWQuelldatei(umgebung: BeschaffungsUmgebung) {
  let netzabrufe = 0;
  return async (
    eintrag: ImportindexSucheEintrag,
    meldeSchritt?: (schritt: string) => Promise<void>,
  ): Promise<BeschaffungsErgebnis> => {
    await meldeSchritt?.('Warte auf Abruf (Drosselung)');
    await umgebung.pause(berechneVerzoegerungMs(++netzabrufe));
    await meldeSchritt?.('Abruf und Verarbeitung (BW-Hintergrundfenster)');
    return beschaffeQuelldatei(eintrag, umgebung, false);
  };
}

async function beschaffeQuelldatei(
  eintrag: ImportindexSucheEintrag,
  umgebung: BeschaffungsUmgebung,
  bund: boolean,
): Promise<BeschaffungsErgebnis> {
  try {
    let geladen: ImportErgebnis;
    try {
      geladen = await umgebung.laden(eintrag);
    } catch (fehler) {
      return { fehler: String(fehler), netz: true };
    }
    if (geladen.fehler !== undefined) return { fehler: geladen.fehler, netz: true };
    if (!geladen.xmlString.trim()) return { fehler: 'Die Quelldatei ist leer.', netz: true };
    const geloescht = await umgebung.loescheGesetzesXML(eintrag.kurztitel);
    try {
      await umgebung.schreibeQuelle(eintrag.kurztitel, geladen.xmlString);
      const ergebnis = await erzeugeGesetzesXML(geladen.xmlString, eintrag, umgebung);
      if (ergebnis.fehler !== undefined)
        return {
          fehler: `${ergebnis.fehler}; Quelldatei bleibt gespeichert.${geloescht && !ergebnis.fehler.includes('GesetzesXML gelöscht') ? '; GesetzesXML gelöscht.' : ''}`,
          netz: true,
        };
      return { ...ergebnis, netz: true, gesetzesXMLGeloescht: geloescht };
    } catch (fehler) {
      if (geloescht) throw new Error(`${String(fehler)}; GesetzesXML gelöscht.`, { cause: fehler });
      throw fehler;
    }
  } finally {
    if (bund) await umgebung.pause(500 + umgebung.zufall() * 1000);
  }
}
