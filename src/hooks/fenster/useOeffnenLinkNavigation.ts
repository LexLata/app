// Suchspezifische Ausführung; Kennung, Lebensdauer und Reihenfolge gehören dem
// gemeinsamen nativen Empfänger in useInterneNavigation.
import { leseSuchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  bereiteSuchverzeichnisVor,
  beiSuchverzeichnisVorbereitung,
  holeSuchverzeichnisFortschritt,
} from '@/lib/gesetz-laden/gesetz-laden.index';
import { useCallback } from 'react';
import type {
  ElementOeffnenParams,
  Navigationsziel,
  SuchOverlayVorbelegung,
} from '@/lib/domain/appTypes';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { OeffnenLinkZiel } from '@/lib/domain/app/tiefenLink';
import {
  berechneTreffer,
  brauchtImportindexPruefung,
  parseSuchanfrage,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  beiImportindexInvalidiert,
  istImportindexSuchbestandAktuell,
  sucheKandidatenAlleQuellen,
} from '@/lib/import/import.index';
import { useOeffnenAuswahl } from '@/hooks/useOeffnenAuswahl';

interface Optionen {
  importindexVorbereitungRef: React.RefObject<Promise<void> | null>;
  zeigeSuchfehler: (zustand: SuchOverlayVorbelegung) => void;
}
export function useOeffnenLinkNavigation({
  importindexVorbereitungRef,
  zeigeSuchfehler,
}: Optionen) {
  const waehleTreffer = useOeffnenAuswahl();
  return useCallback(
    async (
      auftrag: OeffnenLinkZiel,
      istAktuell: () => Promise<boolean>,
      oeffnen: (ziel: ElementOeffnenParams | Navigationsziel) => void | Promise<boolean>,
    ): Promise<boolean> => {
      const { suchtext } = auftrag;
      let indexGeneration = 0;
      let auswahlGeneration = 0;
      let verzeichnisGeneration = 0;
      let auswahlVerzeichnisGeneration = 0;
      const verzeichnisAbmelden = beiSuchverzeichnisVorbereitung(() => {
        if (!holeSuchverzeichnisFortschritt()) verzeichnisGeneration++;
      });
      const abmelden = beiImportindexInvalidiert(() => {
        indexGeneration++;
      });
      const fehler = async (meldung: string) => {
        if (!(await istAktuell())) return false;
        zeigeSuchfehler({ suchtext, meldung, ohneAktivesGesetz: true });
        return true;
      };
      try {
        await importindexVorbereitungRef.current;
        if (!(await istAktuell())) return false;
        let verzeichnis = await leseSuchverzeichnis();
        if (!istVerzeichnisLesbar(verzeichnis)) {
          await bereiteSuchverzeichnisVor();
          verzeichnis = await leseSuchverzeichnis();
        }
        if (!istVerzeichnisLesbar(verzeichnis)) return false;
        const anfrage = parseSuchanfrage(suchtext);
        async function waehleErstenTreffer() {
          let index: Awaited<ReturnType<typeof sucheKandidatenAlleQuellen>> | null = null;
          // Auftragsprüfung und Indexladen können beide Invalidierungen überholen.
          while (true) {
            const generation = verzeichnisGeneration;
            verzeichnis = await leseSuchverzeichnis();
            if (!(await istAktuell())) return null;
            if (generation !== verzeichnisGeneration) continue;
            index = aktuellerSuchindex(index);
            if (!index && brauchtImportindexPruefung(suchtext)) {
              index = await sucheKandidatenAlleQuellen();
              continue;
            }
            auswahlGeneration = indexGeneration;
            auswahlVerzeichnisGeneration = verzeichnisGeneration;
            const treffer = berechneTreffer(suchtext, verzeichnis.eintraege, null, index)[0];
            // Auswahl und Importbeginn im selben Abschluss: dazwischen kein
            // weiteres Await, das einen schon abgelösten Import beginnen ließe.
            return treffer ? waehleTreffer(treffer, anfrage) : undefined;
          }
        }
        async function pruefeLeertreffer() {
          if (!(await istAktuell())) return false;
          // Auch der letzte native Check darf keine alte Leertrefferentscheidung
          // freigeben. Wiederholen nur nach tatsächlicher Invalidierung.
          if (
            auswahlGeneration !== indexGeneration ||
            auswahlVerzeichnisGeneration !== verzeichnisGeneration
          )
            return null;
          zeigeSuchfehler({
            suchtext,
            meldung: 'Kein Treffer für diesen Link.',
            ohneAktivesGesetz: true,
          });
          return true;
        }
        async function oeffneImportiertesGesetz(gesetz: GesetzDarstellung, xmlId?: string) {
          // Ein inzwischen fehlgeschlagener Abgleich bestätigt den Bestand
          // nach dem Import nicht. Den Auftrag bis zum nächsten gültigen Lauf erhalten.
          const importStand = await leseSuchverzeichnis();
          if (!istVerzeichnisLesbar(importStand)) return false;
          if (!(await istAktuell())) return false;
          return (await oeffnen({ gesetz, xmlId })) !== false;
        }
        async function fuehreAuswahlAus() {
          while (true) {
            const ergebnis = await waehleErstenTreffer();
            if (ergebnis === null) return false;
            if (!ergebnis) {
              const entscheidung = await pruefeLeertreffer();
              if (entscheidung === null) continue;
              return entscheidung;
            }
            // Ein bereits begonnener Import bleibt an seinem Auftrag hängen.
            if (!(await istAktuell())) return false;
            if (ergebnis.gesetzesreferenz) {
              return (
                (await oeffnen({
                  gesetzesreferenz: ergebnis.gesetzesreferenz,
                  xmlId: ergebnis.xmlId,
                  nurInstalliert: true,
                })) !== false
              );
            }
            if (!ergebnis.gesetz) return fehler(ergebnis.meldung);
            return oeffneImportiertesGesetz(ergebnis.gesetz, ergebnis.xmlId);
          }
        }
        return await fuehreAuswahlAus();
      } catch (ursache) {
        console.error('Öffnen-Link konnte nicht ausgewertet werden:', ursache);
        return fehler('Importangebote konnten nicht geladen werden.');
      } finally {
        abmelden();
        verzeichnisAbmelden();
      }
    },
    [importindexVorbereitungRef, waehleTreffer, zeigeSuchfehler],
  );
}

function aktuellerSuchindex(
  bestand: Awaited<ReturnType<typeof sucheKandidatenAlleQuellen>> | null,
) {
  return bestand && istImportindexSuchbestandAktuell(bestand) ? bestand : null;
}

function istVerzeichnisLesbar(verzeichnis: Awaited<ReturnType<typeof leseSuchverzeichnis>>) {
  return (
    verzeichnis.abgeglichen &&
    !verzeichnis.eintraege.some((eintrag) => eintrag.status === 'nicht-lesbar')
  );
}
