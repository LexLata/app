// Repariert konkrete Gesetzdateien ausschließlich aus ihrer erkannten Quelle.
// Bestehende Vorgänge, Gesetzsperren und der normale Speicherabschluss bleiben maßgeblich.
import { NORMGEBER_DE_BUND } from '@/lib/domain/normgeber';
import {
  pruefeReparaturreferenz,
  mitReferenzKontext,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import {
  pruefeGesetzDatei,
  sichereUngueltigeGesetzDatei,
} from '@/lib/persistenz/gesetz/gesetz.index';
import {
  mitManuellemImportVorgang,
  versucheGesetzSperreZuErhalten,
  gibGesetzSperreFrei,
} from '@/lib/import/dispatch/importVorgang';
import type {
  GesetzReparaturZiel,
  GesetzReparaturErgebnis,
  ImportFehler,
  ImportEinzelErgebnis,
} from '@/lib/import/importVertrag.types';

type DateiPruefung = Awaited<ReturnType<typeof pruefeGesetzDatei>>;
class ReparaturAbbruch extends Error {
  constructor(readonly ergebnis: GesetzReparaturErgebnis) {
    super('Das Reparaturziel hat sich inzwischen verändert.');
  }
}
function alsFehler(ursache: unknown): ImportFehler {
  return {
    grund: 'sonstiger',
    meldung: ursache instanceof Error ? ursache.message : String(ursache),
  };
}
function ausPruefung(
  ziel: GesetzReparaturZiel,
  pruefung: DateiPruefung,
): GesetzReparaturErgebnis | null {
  switch (pruefung.status) {
    case 'gueltig': {
      const fehler = pruefeReparaturreferenz(ziel, pruefung.gesetz);
      return fehler
        ? { status: 'fehler', ziel, fehler }
        : { status: 'bereits_gueltig', ziel, gesetz: pruefung.gesetz };
    }
    case 'ungueltig':
      return null;
    case 'unlesbar':
      return { status: 'unlesbar', ziel, fehler: pruefung.fehler };
    case 'fehlt':
    case 'leer':
      return { status: pruefung.status, ziel };
  }
}
async function nachFehler(
  ziel: GesetzReparaturZiel,
  fehler: ImportFehler,
): Promise<GesetzReparaturErgebnis> {
  const aktuell = await pruefeGesetzDatei(ziel.dateiBasis);
  const ergebnis = ausPruefung(ziel, aktuell);
  if (ergebnis) return ergebnis;
  // Vorübergehende Netz-/Koordinationsfehler geben niemals eine Löschberechtigung.
  if (fehler.grund === 'keineVerbindung') return { status: 'verbindungsfehler', ziel, fehler };
  if (fehler.grund === 'beschaeftigt') return { status: 'beschaeftigt', ziel, fehler };
  // Auch nach erster Serverantwort/Erreichbarkeitsprüfung kann die Verbindung
  // abbrechen. Ungeklärte Downloadfehler berechtigen deshalb nicht zur Archivierung.
  if (fehler.grund === 'download') return { status: 'fehler', ziel, fehler };
  if (aktuell.status !== 'ungueltig') return { status: 'fehler', ziel, fehler };
  try {
    const sicherung = await sichereUngueltigeGesetzDatei(ziel.dateiBasis, aktuell.inhalt, {
      reparaturGescheitert: true,
    });
    if (sicherung.status === 'gueltig' || sicherung.status === 'reparierbar') {
      // Die native Vergleichsschleife kann zwischenzeitlich gültigen Inhalt finden.
      const erneut = ausPruefung(ziel, await pruefeGesetzDatei(ziel.dateiBasis));
      return erneut ?? { status: 'fehler', ziel, fehler };
    }
    return { ...sicherung, ziel };
  } catch (ursache) {
    const erneut = ausPruefung(ziel, await pruefeGesetzDatei(ziel.dateiBasis));
    if (erneut) return erneut;
    return { status: 'sicherung_fehlgeschlagen', ziel, fehler: alsFehler(ursache).meldung };
  }
}
async function repariereEinzelnesGesetz(
  ziel: GesetzReparaturZiel,
  kontext: ReferenzKontext,
): Promise<GesetzReparaturErgebnis> {
  const gesetz = { kurztitel: ziel.kurztitel, normgeber: ziel.quelle };
  if (!(await versucheGesetzSperreZuErhalten(gesetz))) {
    return {
      status: 'beschaeftigt',
      ziel,
      fehler: {
        grund: 'beschaeftigt',
        meldung: `${ziel.kurztitel} wird bereits importiert oder aktualisiert.`,
      },
    };
  }
  try {
    const zuvor = ausPruefung(ziel, await pruefeGesetzDatei(ziel.dateiBasis));
    if (zuvor) return zuvor;
    const zielpruefung = {
      ziel,
      vorSchreiben: async () => {
        const aktuell = ausPruefung(ziel, await pruefeGesetzDatei(ziel.dateiBasis));
        if (aktuell) throw new ReparaturAbbruch(aktuell);
      },
    };
    let importErgebnis: ImportEinzelErgebnis;
    try {
      if (ziel.quelle === NORMGEBER_DE_BUND) {
        const { importiereVomInternet } = await import('@/lib/import/bund/bund.index');
        importErgebnis = await importiereVomInternet(
          ziel.kurztitel,
          undefined,
          zielpruefung,
          kontext,
        );
      } else {
        const { importiereGesetzVomInternetBW } = await import('@/lib/import/bw/bw.index');
        importErgebnis = await importiereGesetzVomInternetBW(
          ziel.kurztitel,
          undefined,
          zielpruefung,
          kontext,
        );
      }
    } catch (ursache) {
      if (ursache instanceof ReparaturAbbruch) return ursache.ergebnis;
      return await nachFehler(ziel, alsFehler(ursache));
    }
    if (importErgebnis.art === 'fehler') return await nachFehler(ziel, importErgebnis.fehler);
    const fehler = pruefeReparaturreferenz(ziel, importErgebnis.gesetz);
    return fehler
      ? { status: 'fehler', ziel, fehler }
      : { status: 'repariert', ziel, gesetz: importErgebnis.gesetz };
  } catch (ursache) {
    return { status: 'fehler', ziel, fehler: alsFehler(ursache) };
  } finally {
    await gibGesetzSperreFrei(gesetz);
  }
}
/** Repariert jedes konkrete Ziel ohne Bestandsprüfung allein nach Kurztitel. */
export async function repariereGesetze(
  ziele: GesetzReparaturZiel[],
): Promise<GesetzReparaturErgebnis[]> {
  if (!ziele.length) return [];
  return mitManuellemImportVorgang(() =>
    mitReferenzKontext(async (kontext) => {
      const ergebnisse: GesetzReparaturErgebnis[] = [];
      for (const ziel of ziele) ergebnisse.push(await repariereEinzelnesGesetz(ziel, kontext));
      return ergebnisse;
    }),
  );
}
