// quelldateienLauf.ts
// Auswahl nach Dateistand und wiederaufnehmbarer Beschaffungslauf ohne PräfixstrukturXML.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { meldeLaufErgebnis, meldeLaufFortschritt } from './laufMeldung';
import type { LaufAusgabe } from './laufMeldung';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { PraefixlaufAuftrag } from '@/lib/plattform/praefixlaufAuftrag';
import { berechneImportParallelitaet } from '@/lib/import/basis/basis.index';
import { fuehreWellenlaufAus } from './wellenlauf';
import type { LaufBericht } from './laufBericht';
import type { BeschaffungsErgebnis } from './beschaffung';
import type { EuBeschaffungsErgebnis } from './euBeschaffung';

const EU_QUELLDATEIEN_PARALLELITAET = 10;
import { eindeutigeKandidaten } from './kandidaten';

export interface QuelldateienUmgebung<
  Ergebnis = BeschaffungsErgebnis | EuBeschaffungsErgebnis,
> extends LaufAusgabe {
  leseDateistand(): Promise<{ quellen: string[] }>;
  ladeKandidaten(): Promise<ImportindexSucheEintrag[]>;
  pruefeErreichbarkeit(): Promise<string | null>;
  beschaffe(eintrag: ImportindexSucheEintrag): Promise<Ergebnis>;
  ausgabe(zeile: string): void | Promise<void>;
}
/** Vorhandene Quellen werden nur mit `neu` erneut abgerufen, auch bei benannten Kurztiteln. */
export function waehleFehlendeQuelldateien(
  eintraege: ImportindexSucheEintrag[],
  quellen: string[],
  kurztitel?: string[],
  neu = false,
): ImportindexSucheEintrag[] {
  const vorhanden = new Set(quellen.map((k) => k.toLowerCase()));
  const benannt = kurztitel && new Set(kurztitel.map((k) => k.toLowerCase()));
  return eintraege.filter(
    (e) =>
      (!benannt || benannt.has(e.kurztitel.toLowerCase())) &&
      (neu || !vorhanden.has(e.kurztitel.toLowerCase())),
  );
}
export async function fuehreQuelldateienLaufAus(
  auftrag: Extract<PraefixlaufAuftrag, { modus: 'quelldateien' }>,
  umgebung: QuelldateienUmgebung,
  meldeBericht?: (bericht: LaufBericht) => void,
): Promise<LaufBericht> {
  const bericht: LaufBericht = { gespeichert: 0, teilerfolge: [], fehlgeschlagen: [] };
  let rueckfaelle = 0;
  const fehlerarten = { 'nicht-verfuegbar': 0, download: 0, format: 0 };
  try {
    const alle = await umgebung.ladeKandidaten();
    const stand = await umgebung.leseDateistand();
    const kandidaten = eindeutigeKandidaten(
      alle,
      waehleFehlendeQuelldateien(alle, stand.quellen, auftrag.kurztitel, auftrag.neu),
      bericht,
      (text) => {
        void meldeLaufErgebnis(umgebung, text);
      },
    );
    if (kandidaten.length) {
      const fehler = await umgebung.pruefeErreichbarkeit();
      if (fehler) throw new Error(fehler);
    }
    const vorabFehler = bericht.fehlgeschlagen.length;
    await fuehreWellenlaufAus(
      kandidaten,
      auftrag.anzahl,
      auftrag.normgeber === NORMGEBER_EU
        ? EU_QUELLDATEIEN_PARALLELITAET
        : berechneImportParallelitaet(auftrag.normgeber),
      async (e) => {
        const ergebnis = await umgebung.beschaffe(e);
        const celex = auftrag.normgeber === NORMGEBER_EU ? ` (CELEX ${e.abrufkennung})` : '';
        if (ergebnis.fehler !== undefined) {
          if ('fehlerart' in ergebnis && ergebnis.fehlerart) fehlerarten[ergebnis.fehlerart]++;
          bericht.fehlgeschlagen.push({ kurztitel: e.kurztitel, meldung: ergebnis.fehler + celex });
          await meldeLaufErgebnis(umgebung, `${e.kurztitel}: ${ergebnis.fehler}`);
          return 'fehler';
        }
        if (ergebnis.gesetzesXMLGeloescht)
          (bericht.zusatzzeilen ??= []).push(`${e.kurztitel}: Bisheriges GesetzesXML gelöscht.`);
        if ('rueckfall' in ergebnis && ergebnis.rueckfall) rueckfaelle++;
        if ('hinweis' in ergebnis && ergebnis.hinweis)
          (bericht.zusatzzeilen ??= []).push(`${e.kurztitel}${celex}: ${ergebnis.hinweis}`);
        const teilerfolg = 'teilerfolg' in ergebnis ? ergebnis.teilerfolg : undefined;
        if (teilerfolg)
          bericht.teilerfolge.push({
            kurztitel: e.kurztitel,
            meldung: teilerfolg + celex,
          });
        else bericht.gespeichert++;
        await meldeLaufErgebnis(
          umgebung,
          `${e.kurztitel}: ${teilerfolg ? `Teilerfolg – ${teilerfolg}` : 'Quelldatei und GesetzesXML gespeichert'}`,
        );
        return teilerfolg ? 'teilerfolg' : 'erfolg';
      },
      meldeLaufFortschritt(umgebung, vorabFehler),
    );
    return bericht;
  } finally {
    if (auftrag.normgeber === NORMGEBER_EU)
      (bericht.zusatzzeilen ??= []).push(
        `Rückfall auf Originaltext: ${rueckfaelle}`,
        `Fehler nach Art: nicht verfügbar: ${fehlerarten['nicht-verfuegbar']} / Download: ${fehlerarten.download} / Format: ${fehlerarten.format}`,
      );
    meldeBericht?.(bericht);
  }
}
