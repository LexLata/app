// Fensterlokaler, ausschließlich vollständig gefüllter Suchbestand.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import {
  beiImportindexGeschrieben,
  importindexAbsender,
  leseImportindexEintraegeMitDiagnosen,
  leseReferenzVerzeichnis,
  type ImportindexKategorie,
  type ImportindexSucheEintrag,
} from './importindex/importindex.index';
import { ergaenzePraefixstrukturMitDiagnose } from './praefixstruktur/praefixstruktur.index';
import { hoereGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { messeAsync } from '@/lib/utils/perfMessung';

type Kandidaten = Record<ImportindexKategorie, ImportindexSucheEintrag[]>;
let generation = 0;
const ergebnisGenerationen = new WeakMap<
  Kandidaten,
  { generation: number; vollstaendig: boolean }
>();
let bestand: Kandidaten | undefined;
type Ladevorgang = { generation: number; fertig: boolean; ergebnis: Promise<Kandidaten> };
let laufend: Ladevorgang | undefined;
let ladendeVorgaenge = 0;
let anmeldung: Promise<void> | undefined;
let ereignisseBereit = false;
let aktiv = true;
const empfaenger = new Set<() => void>();

/** Liefert ausschließlich den vollständigen Bestand der aktuellen Generation. */
export function leseImportindexZwischenspeicher(): Kandidaten | undefined {
  void sichereAnmeldung();
  return bestand;
}

/** Prüft die Herkunft eines gelieferten Teil- oder Vollergebnisses gegen die
 * aktuelle Generation. Nach Invalidierung/Abbau und für unbekannte Objekte false;
 * hält weder Ergebnisse fest noch macht es Teilergebnisse dauerhaft wiederverwendbar. */
export function istImportindexSuchbestandAktuell(ergebnis: Kandidaten): boolean {
  return aktiv && ergebnisGenerationen.get(ergebnis)?.generation === generation;
}

/** Ob alle Quellen und Präfixstrukturen dieses Ergebnisses erfolgreich gelesen wurden.
 * Verfügbare Teilergebnisse bleiben trotz false nutzbar. */
export function istImportindexSuchbestandVollstaendig(ergebnis: Kandidaten): boolean {
  return ergebnisGenerationen.get(ergebnis)?.vollstaendig ?? false;
}

/** Meldet nur Invalidierungen, keine Ladeabschlüsse. */
export function beiImportindexInvalidiert(empfangen: () => void): () => void {
  void sichereAnmeldung();
  empfaenger.add(empfangen);
  return () => {
    empfaenger.delete(empfangen);
  };
}

function invalidiere(): void {
  generation++;
  bestand = undefined;
  for (const empfangen of empfaenger) {
    try {
      empfangen();
    } catch (fehler) {
      console.error('Importindex-Invalidierungsbenachrichtigung fehlgeschlagen:', fehler);
    }
  }
}

function sichereAnmeldung(): Promise<void> {
  if (anmeldung) return anmeldung;
  const lokalAbmelden = beiImportindexGeschrieben(invalidiere);
  const global = hoereGlobal('importindex-geaendert', ({ payload }) => {
    if (payload.absender !== importindexAbsender) invalidiere();
  });
  anmeldung = global.bereit
    .then(() => {
      if (aktiv) ereignisseBereit = true;
    })
    .catch((fehler: unknown) => {
      console.error(
        'Importindex-Ereignisanmeldung fehlgeschlagen; Bestand wird nicht gehalten:',
        fehler,
      );
    });
  // Der Bestand gehört zum Fenster, nicht zur Lebensdauer einzelner Suchen.
  if (typeof window !== 'undefined')
    window.addEventListener(
      'pagehide',
      () => {
        aktiv = false;
        ereignisseBereit = false;
        global.abmelden();
        lokalAbmelden();
        bestand = undefined;
        generation++;
        empfaenger.clear();
      },
      { once: true },
    );
  return anmeldung;
}

/** Neue Aufrufe wiederholen Teilfehler; überholte Wartende teilen den Nachfolger,
 * selbst wenn dessen Teilergebnis inzwischen abgeschlossen ist. */
export function sucheKandidatenAlleQuellen(): Promise<Kandidaten> {
  void sichereAnmeldung();
  if (bestand) return Promise.resolve(bestand);
  const vorgang = laufend;
  return vorgang && vorgang.generation === generation && !vorgang.fertig
    ? vorgang.ergebnis
    : starteLaden().ergebnis;
}

function starteLaden(): Ladevorgang {
  ladendeVorgaenge++;
  const vorgang: Ladevorgang = {
    generation,
    fertig: false,
    ergebnis: Promise.resolve()
      .then(async () => {
        await sichereAnmeldung();
        const ergebnis = await messeAsync('sucheKandidatenAlleQuellen', ladeKandidaten);
        if (!aktiv) return ergebnis.kandidaten;
        if (vorgang.generation !== generation) {
          const aktuell = laufend;
          return aktuell && aktuell.generation === generation
            ? aktuell.ergebnis
            : starteLaden().ergebnis;
        }
        ergebnisGenerationen.set(ergebnis.kandidaten, {
          generation: vorgang.generation,
          vollstaendig: ergebnis.vollstaendig,
        });
        if (aktiv && ereignisseBereit && ergebnis.vollstaendig) bestand = ergebnis.kandidaten;
        vorgang.fertig = true;
        return ergebnis.kandidaten;
      })
      .finally(() => {
        ladendeVorgaenge--;
        // Teilfehler nur halten, solange noch überholte Vorgänge darauf wechseln.
        if (!ladendeVorgaenge && laufend?.fertig) laufend = undefined;
      }),
  };
  laufend = vorgang;
  return vorgang;
}

async function ladeKandidaten(): Promise<{ kandidaten: Kandidaten; vollstaendig: boolean }> {
  const quellen = await Promise.allSettled([
    leseImportindexEintraegeMitDiagnosen(NORMGEBER_DE_BUND),
    leseImportindexEintraegeMitDiagnosen(NORMGEBER_DE_BW),
    leseImportindexEintraegeMitDiagnosen(NORMGEBER_EU),
    leseReferenzVerzeichnis(NORMGEBER_EU),
  ]);
  let vollstaendig = true;
  const eintraege = (quelle: (typeof quellen)[number]): ImportindexSucheEintrag[] => {
    if (quelle.status === 'rejected') {
      console.error('Importindex konnte nicht vollständig geladen werden:', quelle.reason);
      vollstaendig = false;
      return [];
    }
    if (quelle.value.fehler.length) {
      console.error('Importindex konnte nicht vollständig geladen werden:', quelle.value.fehler);
      vollstaendig = false;
    }
    return quelle.value.eintraege;
  };
  const [bund, bw, eu, europa] = [
    eintraege(quellen[0]),
    eintraege(quellen[1]),
    eintraege(quellen[2]),
    eintraege(quellen[3]),
  ] as const;
  const [bundPraefix, bwPraefix] = await Promise.all([
    ergaenzePraefixstrukturMitDiagnose(NORMGEBER_DE_BUND, bund),
    ergaenzePraefixstrukturMitDiagnose(NORMGEBER_DE_BW, bw),
  ]);
  return {
    vollstaendig: vollstaendig && bundPraefix.vollstaendig && bwPraefix.vollstaendig,
    kandidaten: {
      [NORMGEBER_DE_BUND]: bundPraefix.eintraege,
      [NORMGEBER_DE_BW]: bwPraefix.eintraege,
      [NORMGEBER_EU]: [
        ...eu,
        ...europa.filter((eintrag) => eintrag.abrufkennung.toLowerCase().endsWith('.xml')),
      ].map((eintrag) =>
        (eintrag.normgeber ?? NORMGEBER_EU) === NORMGEBER_EU
          ? { ...eintrag, praefixstruktur: 'artikel' as const }
          : eintrag,
      ),
    },
  };
}
