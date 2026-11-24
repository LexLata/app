// gesetzesxmlLauf.ts
// Wiederaufnehmbare Offline-Erzeugung aus vorhandenen Quellen ohne PräfixstrukturXML.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { meldeLaufErgebnis, meldeLaufFortschritt } from './laufMeldung';
import type { LaufAusgabe } from './laufMeldung';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { PraefixlaufAuftrag } from '@/lib/plattform/praefixlaufAuftrag';
import { berechneImportParallelitaet } from '@/lib/import/basis/basis.index';
import { fuehreWellenlaufAus } from './wellenlauf';
import type { LaufBericht } from './laufBericht';
import { eindeutigeKandidaten } from './kandidaten';

type Dateistand = {
  quellen: string[];
  gesetzesxml: string[];
  konsolidiert?: string[];
  original?: string[];
};
type Auswahl = { neu?: boolean; kurztitel?: string[] };
export interface GesetzesXMLUmgebung<
  Ergebnis extends { fehler?: string; teilerfolg?: string } = {
    fehler?: string;
    teilerfolg?: string;
    gesetzesXMLGeloescht?: boolean;
  },
> extends LaufAusgabe {
  leseDateistand(): Promise<Dateistand>;
  ladeKandidaten(): Promise<ImportindexSucheEintrag[]>;
  erzeuge(eintrag: ImportindexSucheEintrag): Promise<Ergebnis>;
  ausgabe(zeile: string): void | Promise<void>;
}
export function waehleGesetzesXML(
  eintraege: ImportindexSucheEintrag[],
  stand: Dateistand,
  auswahl: Auswahl,
) {
  const quellen = new Set(stand.quellen.map((k) => k.toLowerCase()));
  const xml = new Set(stand.gesetzesxml.map((k) => k.toLowerCase()));
  const benannt = auswahl.kurztitel && new Set(auswahl.kurztitel.map((k) => k.toLowerCase()));
  const ausgewaehlt = eintraege.filter((e) => !benannt || benannt.has(e.kurztitel.toLowerCase()));
  return {
    kandidaten: ausgewaehlt.filter(
      (e) =>
        quellen.has(e.kurztitel.toLowerCase()) &&
        (benannt || auswahl.neu || !xml.has(e.kurztitel.toLowerCase())),
    ),
    fehlendeQuellen: ausgewaehlt.filter((e) => !quellen.has(e.kurztitel.toLowerCase())),
  };
}
export async function fuehreGesetzesXMLLaufAus(
  auftrag: Extract<PraefixlaufAuftrag, { modus: 'gesetzesxml' }>,
  umgebung: GesetzesXMLUmgebung,
  meldeBericht?: (bericht: LaufBericht) => void,
): Promise<LaufBericht> {
  const bericht: LaufBericht = { gespeichert: 0, teilerfolge: [], fehlgeschlagen: [] };
  try {
    const alle = await umgebung.ladeKandidaten();
    const stand = await umgebung.leseDateistand();
    const auswahl = waehleGesetzesXML(alle, stand, auftrag);
    const fehlende = new Map(
      auswahl.fehlendeQuellen.map((e) => [e.kurztitel.toLowerCase(), e.kurztitel]),
    );
    bericht.zusatzzeilen = [
      `Quelldatei fehlt: ${fehlende.size}`,
      ...[...fehlende.values()].map((k) => `${k}: Quelldatei fehlt`),
    ];
    if (auftrag.normgeber === NORMGEBER_EU) {
      const vollstaendig = new Set(stand.quellen.map((k) => k.toLowerCase()));
      const benannt = auftrag.kurztitel?.map((k) => k.toLowerCase());
      const unvollstaendig = new Set(
        [...(stand.konsolidiert ?? []), ...(stand.original ?? [])].filter(
          (k) =>
            !vollstaendig.has(k.toLowerCase()) && (!benannt || benannt.includes(k.toLowerCase())),
        ),
      );
      bericht.zusatzzeilen.push(
        `Unvollständige EU-Quellen: ${unvollstaendig.size}`,
        ...[...unvollstaendig].map(
          (k) => `${k}: Archive ohne Herkunftsangabe; unvollständige Quelle`,
        ),
      );
    }
    const kandidaten = eindeutigeKandidaten(alle, auswahl.kandidaten, bericht, (text) => {
      void meldeLaufErgebnis(umgebung, text);
    });
    const vorabFehler = bericht.fehlgeschlagen.length;
    await fuehreWellenlaufAus(
      kandidaten,
      auftrag.anzahl,
      berechneImportParallelitaet(auftrag.normgeber),
      async (e) => {
        const ergebnis = await umgebung.erzeuge(e);
        if (ergebnis.fehler !== undefined) {
          bericht.fehlgeschlagen.push({ kurztitel: e.kurztitel, meldung: ergebnis.fehler });
          await meldeLaufErgebnis(umgebung, `${e.kurztitel}: ${ergebnis.fehler}`);
          return 'fehler';
        }
        if (ergebnis.gesetzesXMLGeloescht)
          bericht.zusatzzeilen?.push(`${e.kurztitel}: Bisheriges GesetzesXML gelöscht.`);
        if (ergebnis.teilerfolg) {
          bericht.teilerfolge.push({ kurztitel: e.kurztitel, meldung: ergebnis.teilerfolg });
          await meldeLaufErgebnis(umgebung, `${e.kurztitel}: ${ergebnis.teilerfolg}`);
          return 'teilerfolg';
        }
        bericht.gespeichert++;
        await meldeLaufErgebnis(umgebung, `${e.kurztitel}: GesetzesXML gespeichert`);
        return 'erfolg';
      },
      meldeLaufFortschritt(umgebung, vorabFehler),
    );
    return bericht;
  } finally {
    meldeBericht?.(bericht);
  }
}
