// gesetzesreferenzImport.ts
// Verfügbare vollständige Zielreferenzen und Import ohne Umdeutung des gewählten Gesetzes.
import {
  NORMGEBER_DE_BUND,
  NORMGEBER_DE_BW,
  NORMGEBER_EU,
  NORMGEBER_EUROPARAT,
} from '@/lib/domain/normgeber';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { eindeutigAbrufbareEintraege } from '@/lib/domain/importindexSucheEintrag';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import {
  alleImportindexEintraege,
  leseEuropaVerzeichnis,
} from '@/lib/import/importindex/importindex.index';
import { leseGesetz, leseSuchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';
import type {
  GesetzImportErgebnis,
  ImportEinzelErgebnis,
  ImportFehler,
} from '@/lib/import/importVertrag.types';
import type { GesetzLeseErgebnis } from '@/lib/persistenz/gesetz/gesetz.index';
import { warteAufGesetzImport } from './importVorgang';
import { parallelMitLimit } from '@/lib/import/basis/basis.index';
import { erstelleFehlersicherenFortschritt } from './fortschritt';
import { importiereGesetze } from './gesetzImportDispatch';

export interface Gesetzeskandidat extends Gesetzesreferenz {
  abrufkennung?: string;
}

/** Indexangebote und installierte Gesetze; übrige Normgeber stammen nur aus dem Bestand. */
export async function ladeGesetzeskandidaten(
  _meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ausgangsgesetz?: Gesetzesreferenz,
): Promise<Gesetzeskandidat[]> {
  const ergebnisse = await Promise.allSettled([
    alleImportindexEintraege(NORMGEBER_DE_BUND),
    alleImportindexEintraege(NORMGEBER_DE_BW),
    leseEuropaVerzeichnis(),
  ]);
  const kandidaten = new Map<string, Gesetzeskandidat>();
  const quellen = [NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU] as const;
  for (const [index, ergebnis] of ergebnisse.entries()) {
    if (ergebnis.status !== 'fulfilled') continue;
    for (const eintrag of eindeutigAbrufbareEintraege(ergebnis.value)) {
      const kandidat = {
        kurztitel: eintrag.kurztitel,
        normgeber: eintrag.normgeber ?? quellen[index]!,
        abrufkennung: eintrag.abrufkennung,
      };
      kandidaten.set(gesetzesreferenzSchluessel(kandidat), kandidat);
    }
  }
  for (const gesetz of (await leseSuchverzeichnis())?.eintraege ?? []) {
    if (!gesetz.kurztitel || !gesetz.normgeber) continue;
    const schluessel = gesetzesreferenzSchluessel({
      kurztitel: gesetz.kurztitel,
      normgeber: gesetz.normgeber,
    });
    if (!kandidaten.has(schluessel))
      kandidaten.set(schluessel, { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber });
  }
  if (ausgangsgesetz && !kandidaten.has(gesetzesreferenzSchluessel(ausgangsgesetz)))
    kandidaten.set(gesetzesreferenzSchluessel(ausgangsgesetz), ausgangsgesetz);
  return [...kandidaten.values()];
}

/** Befunde beider Dateiläufe bleiben auch bei einem Importfehler verfügbar. */
export type GesetzesreferenzImportErgebnis = ImportEinzelErgebnis & {
  ladeabschluss: GesetzLeseErgebnis;
  bestandspruefung: GesetzLeseErgebnis;
  /** Tatsächlicher Dispatchabschluss, unabhängig vom anschließenden Laden. */
  importergebnis?: GesetzImportErgebnis;
  /** Bereits im ersten Bestand vorhanden; kein Import und keine Speicherung dieses Gesetzes. */
  unveraendert?: true;
};

function importfehlerErgebnis(
  fehler: ImportFehler | undefined,
  nichtVerfuegbar: ImportEinzelErgebnis,
): ImportEinzelErgebnis {
  if (!fehler || fehler.grund === 'nichtImIndex') return nichtVerfuegbar;
  return { art: 'fehler', fehler };
}

/** Importiert genau die Referenz; Erfolg benötigt einen frischen lesbaren Bestand. */
export async function importiereGesetzesreferenz(
  referenz: Gesetzesreferenz,
  fortschritt?: (meldung: string) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzesreferenzImportErgebnis> {
  const bestandspruefung = await leseGesetz(referenz, meldungEmpfangen);
  let importergebnis: GesetzImportErgebnis | undefined;
  let ladeabschluss = bestandspruefung;
  const abschliessen = (ergebnis: ImportEinzelErgebnis): GesetzesreferenzImportErgebnis => ({
    ...ergebnis,
    ladeabschluss,
    bestandspruefung,
    ...(importergebnis ? { importergebnis } : {}),
  });
  const ladefehler = (): GesetzesreferenzImportErgebnis =>
    abschliessen({
      art: 'fehler',
      fehler: { grund: 'laden', meldung: 'Das Gesetz konnte nicht verlässlich geladen werden.' },
    });
  if (ladeabschluss.status === 'nicht-lesbar') return ladefehler();
  const vorhanden = ladeabschluss.status === 'geladen' ? ladeabschluss.gesetz : undefined;
  if (vorhanden)
    return { ...abschliessen({ art: 'erfolg', gesetz: vorhanden }), unveraendert: true };
  const normgeber = referenz.normgeber;
  const nichtVerfuegbar: ImportEinzelErgebnis = {
    art: 'fehler',
    fehler: {
      grund: 'nichtVerfuegbar',
      meldung: `‚${referenz.kurztitel}‘ ist für den Import nicht verfügbar.`,
    },
  };
  if (
    normgeber !== NORMGEBER_DE_BUND &&
    normgeber !== NORMGEBER_DE_BW &&
    normgeber !== NORMGEBER_EU &&
    normgeber !== NORMGEBER_EUROPARAT
  )
    return abschliessen(nichtVerfuegbar);
  try {
    let eingabe: string | { kurztitel: string; abrufkennung: string } = referenz.kurztitel;
    if (normgeber === NORMGEBER_EU || normgeber === NORMGEBER_EUROPARAT) {
      const eintrag = (await leseEuropaVerzeichnis()).find((kandidat) =>
        istGleichesGesetz({ ...kandidat, normgeber: kandidat.normgeber ?? NORMGEBER_EU }, referenz),
      );
      if (!eintrag) return abschliessen(nichtVerfuegbar);
      eingabe = eintrag;
    }
    const ergebnis = await importiereGesetze(
      [eingabe],
      referenz.normgeber,
      (_kurztitel, _status, _gesetz, meldung) => {
        if (meldung) fortschritt?.(meldung);
      },
      meldungEmpfangen,
    );
    importergebnis = ergebnis;
    const fehler = ergebnis.fehlgeschlagene[0]?.fehler;
    if (fehler?.grund === 'beschaeftigt') await warteAufGesetzImport(referenz);
    else if (!ergebnis.erfolgreiche.length)
      return abschliessen(importfehlerErgebnis(fehler, nichtVerfuegbar));
    ladeabschluss = await leseGesetz(referenz, meldungEmpfangen);
    if (ladeabschluss.status === 'nicht-lesbar') return ladefehler();
    const gesetz = ladeabschluss.status === 'geladen' ? ladeabschluss.gesetz : undefined;
    if (gesetz) return abschliessen({ art: 'erfolg', gesetz });
    return abschliessen({
      art: 'fehler',
      fehler: fehler ?? {
        grund: 'format',
        meldung: 'Das angeforderte Gesetz konnte nicht importiert werden.',
      },
    });
  } catch (fehler) {
    console.error('Gesetz konnte nicht importiert werden:', fehler);
    return abschliessen({
      art: 'fehler',
      fehler: {
        grund: 'sonstiger',
        meldung: 'Das Gesetz konnte nicht importiert werden.',
      },
    });
  }
}

/** Gezielte Mehrfachimporte mit dem bestehenden Zehnerlimit und verzögerten Callbackfehlern. */
export async function importiereGesetzesreferenzen(
  referenzen: Gesetzesreferenz[],
  fortschritt?: (referenz: Gesetzesreferenz, ergebnis: ImportEinzelErgebnis) => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Array<{ referenz: Gesetzesreferenz; ergebnis: GesetzesreferenzImportErgebnis }>> {
  const ergebnisse: Array<{
    referenz: Gesetzesreferenz;
    ergebnis: GesetzesreferenzImportErgebnis;
  }> = [];
  const { melden, wirfErstenFehler } =
    erstelleFehlersicherenFortschritt<[Gesetzesreferenz, ImportEinzelErgebnis]>(fortschritt);
  await parallelMitLimit(referenzen, 10, async (referenz) => {
    let ergebnis: GesetzesreferenzImportErgebnis;
    try {
      ergebnis = await importiereGesetzesreferenz(referenz, undefined, meldungEmpfangen);
    } catch (ursache) {
      const unvollstaendig: GesetzLeseErgebnis = { status: 'nicht-lesbar', befunde: [] };
      ergebnis = {
        ladeabschluss: unvollstaendig,
        bestandspruefung: unvollstaendig,
        art: 'fehler',
        fehler: {
          grund: 'sonstiger',
          meldung: ursache instanceof Error ? ursache.message : String(ursache),
        },
      };
    }
    ergebnisse.push({ referenz, ergebnis });
    melden(referenz, ergebnis);
  });
  wirfErstenFehler();
  return ergebnisse;
}
