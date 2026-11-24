// Gemeinsame Auswahl für Overlay und Öffnen-Link: Import und bestehende Normauflösung.
import { loeseNormzielNachImportAuf } from '@/lib/gesetz-laden/gesetz-laden.index';
import {
  erzeugeBannerMeldungsSammlung,
  zeigeAktionsMeldungsBanner,
} from '@/lib/banner/banner.index';
import { useCallback } from 'react';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { SucheTreffer, Suchanfrage } from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  importiereGesetze,
  istVerbindungsFehler,
  warteAufGesetzImport,
  type ImportFehler,
} from '@/lib/import/import.index';

/** Höchstdauer, die der Importweg auf ein anderswo gespeichertes Gesetz wartet. */
const SPERRE_WARTEN_MS = 30_000;

type AuswahlErgebnis =
  | {
      gesetz: GesetzDarstellung;
      xmlId: string | undefined;
      meldung?: never;
      gesetzesreferenz?: never;
    }
  | {
      gesetzesreferenz: Gesetzesreferenz;
      xmlId: string | undefined;
      gesetz?: never;
      meldung?: never;
    }
  | {
      meldung: string;
      keineVerbindung: boolean;
      gesetz?: never;
      xmlId?: never;
      gesetzesreferenz?: never;
    };

type IndexTreffer = Extract<SucheTreffer, { art: 'index' }>;

/** Importiert das Angebot; ein anderswo gespeichertes Gesetz gilt als Ergebnis.
 * Hält ein anderer Vorgang die Gesetzsperre, wird höchstens SPERRE_WARTEN_MS gewartet
 * und danach erneut geprüft. */
async function importiereOderFindeVorhandenes(
  treffer: IndexTreffer,
  meldungEmpfangen: AktionsMeldungEmpfaenger,
  beiWartenAufSperre?: () => void,
): Promise<{ gesetz: GesetzDarstellung } | { gesetzesreferenz: Gesetzesreferenz } | ImportFehler> {
  const referenz: Gesetzesreferenz = {
    kurztitel: treffer.eintrag.kurztitel,
    normgeber: treffer.eintrag.normgeber ?? treffer.quelle,
  };
  const importieren = () =>
    importiereGesetze(
      [{ kurztitel: referenz.kurztitel, abrufkennung: treffer.eintrag.abrufkennung }],
      referenz.normgeber,
      undefined,
      meldungEmpfangen,
    );
  let ergebnis = await importieren();
  if (ergebnis.fehlgeschlagene[0]?.fehler.grund === 'beschaeftigt') {
    beiWartenAufSperre?.();
    if (await warteAufGesetzImport(referenz, SPERRE_WARTEN_MS)) ergebnis = await importieren();
  }
  const gesetz = ergebnis.erfolgreiche[0];
  if (gesetz) return { gesetz };
  const fehler = ergebnis.fehlgeschlagene[0]?.fehler;
  if (fehler?.grund === 'bereitsVorhanden') return { gesetzesreferenz: referenz };
  return fehler ?? { grund: 'sonstiger', meldung: 'Import fehlgeschlagen.' };
}

export function useOeffnenAuswahl() {
  return useCallback(
    async (
      treffer: SucheTreffer,
      anfrage: Suchanfrage,
      /** Meldet, dass auf ein anderswo gerade gespeichertes Gesetz gewartet wird. */
      beiWartenAufSperre?: () => void,
    ): Promise<AuswahlErgebnis> => {
      if (treffer.art === 'installiert')
        return { gesetzesreferenz: treffer.gesetzesreferenz, xmlId: treffer.norm?.xmlId };
      const meldungen = erzeugeBannerMeldungsSammlung();
      let importiert: string | undefined;
      try {
        const ergebnis = await importiereOderFindeVorhandenes(
          treffer,
          meldungen.meldungEmpfangen,
          beiWartenAufSperre,
        );
        if ('meldung' in ergebnis)
          return {
            meldung: ergebnis.meldung,
            keineVerbindung: ergebnis.grund === 'keineVerbindung',
          };
        if ('gesetz' in ergebnis) importiert = ergebnis.gesetz.kurztitel;
        const xmlId =
          anfrage.normNummer || anfrage.erwaegungsgrundNummer
            ? await loeseNormzielNachImportAuf(
                'gesetz' in ergebnis ? ergebnis.gesetz : ergebnis.gesetzesreferenz,
                anfrage,
                treffer.gefundenUeber,
                meldungen.meldungEmpfangen,
              )
            : undefined;
        return { ...ergebnis, xmlId };
      } catch (fehler) {
        console.error('Import fehlgeschlagen:', fehler);
        return {
          meldung: fehler instanceof Error ? fehler.message : 'Import fehlgeschlagen.',
          keineVerbindung: istVerbindungsFehler(fehler),
        };
      } finally {
        // Ein Banner nur bei Befunden; das geöffnete Gesetz trägt dann die Folgemeldungen.
        const befunde = meldungen.abschliessen();
        if (befunde.length)
          zeigeAktionsMeldungsBanner(befunde, {
            namen: importiert ? [importiert] : [],
            ueberschrift: () => 'Importiert',
          });
      }
    },
    [],
  );
}
