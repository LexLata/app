// Fensterlokaler Fortschritt; Einträge werden ausschließlich aus der Verzeichnisdatei gelesen.
import {
  gleicheSuchverzeichnisAb,
  vergleicheSuchverzeichnisDateistempel,
  warteAufSpeicherBatchAbschluss,
  leseSuchverzeichnis,
  istSuchverzeichniseintragAktuell,
  type SuchverzeichnisFortschritt,
  type SuchverzeichnisAbgleichErgebnis,
  meldeGesetzBefundeAnEmpfaenger,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { loeseNormzielAuf, type Suchanfrage } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { istDateibefund, type AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import {
  meldePersistenzBefund,
  normalisierteDateiBasis,
  referenzAusDateiBasis,
} from '@/lib/persistenz/kern/kern.index';
import { getSnapshot, meldeDateibefund, zeigeBanner } from '@/lib/banner/banner.index';
import { findeGesetz, gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { messeMitHauptfaden } from '@/lib/utils/perfMessung';
import { meldeGesetzLadeBefunde } from './gesetzLadeMeldungen';

let fortschritt: SuchverzeichnisFortschritt | null = null;
let laufend: Promise<SuchverzeichnisAbgleichErgebnis> | null = null;
const importEmpfaenger = new Set<AktionsMeldungEmpfaenger>();
const empfaenger = new Set<
  (abschluss?: SuchverzeichnisAbgleichErgebnis, veroeffentlicht?: boolean) => void
>();
const laufendeReparaturen = { current: 0 };
/** Je Fenster bereits gezielt neu gelesene, unverändert nicht lesbare Dateien. */
const nichtLesbarGemeldet = new Set<string>();
function meldeStand(abschluss?: SuchverzeichnisAbgleichErgebnis, veroeffentlicht = false) {
  for (const empfangen of empfaenger) {
    if (veroeffentlicht) empfangen(abschluss, true);
    else empfangen(abschluss);
  }
}
export function holeSuchverzeichnisFortschritt() {
  return fortschritt;
}
export function beiSuchverzeichnisVorbereitung(
  empfangen: (abschluss?: SuchverzeichnisAbgleichErgebnis, veroeffentlicht?: boolean) => void,
) {
  empfaenger.add(empfangen);
  return () => {
    empfaenger.delete(empfangen);
  };
}
/** Je Fenster ein Abgleich; die Ergebnisse enthalten ausschließlich abgeleitete Einträge. */
function gleicheAb(bevorzugt: readonly Gesetzesreferenz[], nur?: readonly Gesetzesreferenz[]) {
  if (laufend) return laufend;
  let abschluss: SuchverzeichnisAbgleichErgebnis | undefined;
  laufend = messeMitHauptfaden('Suchverzeichnisabgleich', () =>
    gleicheSuchverzeichnisAb({
      bevorzugt,
      ...(nur ? { nur } : {}),
      veroeffentlicht: () => meldeStand(undefined, true),
      fortschritt: (stand) => {
        fortschritt = stand;
        meldeStand();
      },
    }),
  )
    .then((ergebnis) => {
      if (!importEmpfaenger.size) {
        // Nicht geladene Gesetze und Dateibefunde erweitern ihr offenes Banner
        // und führen gleiche Befunde selbst nur einmal.
        meldeGesetzLadeBefunde(ergebnis.befunde, laufendeReparaturen);
        for (const meldung of ergebnis.meldungen) {
          if (istDateibefund(meldung)) meldeDateibefund(meldung);
          else if (
            !getSnapshot().some(
              (banner) => banner.text === meldung.text && banner.typ === meldung.typ,
            )
          )
            zeigeBanner({ art: 'dateibefunde', text: meldung.text, typ: meldung.typ });
        }
      }
      abschluss = ergebnis;
      return ergebnis;
    })
    .finally(() => {
      laufend = null;
      importEmpfaenger.clear();
      fortschritt = null;
      meldeStand(abschluss);
    });
  return laufend;
}
/** Bei aktuellem, vollständigem Stand: die je Fenster noch nicht gemeldeten, unverändert
 * nicht lesbaren Dateien. `undefined`, wenn ein Vollabgleich nötig ist. */
async function nochZuMeldendeNichtLesbare(): Promise<Gesetzesreferenz[] | undefined> {
  // Unvollständige Stände benötigen ohnehin den Abgleich; für sie keine
  // zusätzliche Ordnerabfrage vor dessen eigenem vollständigem Dateibefund.
  if (laufend || !(await leseSuchverzeichnis()).abgeglichen) return undefined;
  let vergleich: Awaited<ReturnType<typeof vergleicheSuchverzeichnisDateistempel>>;
  try {
    vergleich = await vergleicheSuchverzeichnisDateistempel();
  } catch {
    // Unbekannte Frische bleibt beim bestehenden Abgleich mit seinen Befunden.
    return undefined;
  }
  if (!vergleich.aktuell) return undefined;
  // Unveränderte, nicht lesbare Dateien gelten als geprüft; je Fenster einmal
  // gezielt neu lesen, damit ihr Befund wie bisher gemeldet wird.
  const neu = vergleich.nichtLesbar.filter(
    (ref) => !nichtLesbarGemeldet.has(gesetzesreferenzSchluessel(ref)),
  );
  for (const ref of neu) nichtLesbarGemeldet.add(gesetzesreferenzSchluessel(ref));
  return neu;
}
/** Technische Fehler liefern false; fachliche Befunde bleiben ein abgeschlossener Abgleich. */
export async function bereiteSuchverzeichnisVor(
  bevorzugt: readonly Gesetzesreferenz[] = [],
  { erneut = false }: { erneut?: boolean } = {},
): Promise<boolean> {
  try {
    // Eine ausdrücklich angeforderte Wiederholung darf keinen älteren Dateibefund
    // übernehmen. Reine Suchvorbereitung teilt weiterhin den laufenden Abgleich.
    if (erneut && laufend) await laufend.catch(() => {});
    const nur = erneut ? undefined : await nochZuMeldendeNichtLesbare();
    if (nur && !nur.length) return true;
    const ergebnis = await gleicheAb(bevorzugt, nur);
    if (ergebnis.fehler) console.error('Suchverzeichnisabgleich fehlgeschlagen:', ergebnis.fehler);
    return !ergebnis.fehler;
  } catch (fehler) {
    console.error('Suchverzeichnisabgleich fehlgeschlagen:', fehler);
    return false;
  }
}
/** Nach dem Ersetzen einzelner Gesetze nur deren Einträge prüfen, kein Vollabgleich.
 * Fehlt ein frischer Eintrag, wird nur seine Datei gezielt neu gelesen. Befunde
 * fremder Dateien gehören nicht zu diesem Import. Wirft, wenn ein Eintrag danach
 * weiterhin fehlt. */
export async function pruefeGesetzdateienNachImport(
  referenzen: readonly Gesetzesreferenz[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  const empfangen: AktionsMeldungEmpfaenger = (meldung) => meldungEmpfangen?.(meldung);
  const fehlend: string[] = [];
  for (const referenz of referenzen) {
    const schluessel = normalisierteDateiBasis(referenz);
    const melde = (ergebnis: SuchverzeichnisAbgleichErgebnis) => {
      meldeGesetzBefundeAnEmpfaenger(
        ergebnis.befunde.filter((befund) => {
          if (!('dateiBasis' in befund)) return false;
          const ref = referenzAusDateiBasis(befund.dateiBasis);
          return !!ref && normalisierteDateiBasis(ref) === schluessel;
        }),
        empfangen,
      );
      for (const meldung of ergebnis.meldungen)
        if (meldung.betroffen === referenz.kurztitel) empfangen(meldung);
    };
    const eintrag = await leseSuchverzeichniseintragNachImport(
      referenz,
      async (abgleich) => melde(await abgleich),
      async () => {
        // Nur der eigene gezielte Lauf gehört dem Import; ein geteilter Lauf
        // (z. B. beim Start) meldet fremde Befunde weiter als Banner.
        while (laufend) await laufend.catch(() => undefined);
        importEmpfaenger.add(empfangen);
        return gleicheAb([referenz], [referenz]);
      },
    );
    if (!eintrag) fehlend.push(referenz.kurztitel);
  }
  if (fehlend.length)
    throw new Error(`Der Eintrag von ${fehlend.join(', ')} konnte nicht abgeglichen werden.`);
}

/** Importierte Ziele erst nach der Dateipflege auflösen; bei fehlendem Cache gezielt bevorzugen.
 * `beobachte` erhält jeden dafür abgewarteten Abgleich; `neuLesen` ersetzt den Abgleich
 * mit bevorzugter Referenz. */
async function leseSuchverzeichniseintragNachImport(
  referenz: Gesetzesreferenz,
  beobachte: (abgleich: Promise<SuchverzeichnisAbgleichErgebnis>) => Promise<void> = async (
    abgleich,
  ) => {
    await abgleich;
  },
  neuLesen?: () => Promise<SuchverzeichnisAbgleichErgebnis>,
) {
  try {
    await warteAufSpeicherBatchAbschluss();
  } catch (fehler) {
    // Ein unabhängiger Batchbefund nimmt einem bereits gepflegten Eintrag nicht seine Gültigkeit.
    console.error('Speicherfolgearbeiten nach erfolgreichem Import fehlgeschlagen:', fehler);
  }
  const finde = async () => {
    const eintrag = findeGesetz(
      (await leseSuchverzeichnis()).eintraege.filter((e) => e.status === 'in-ordnung'),
      referenz,
    );
    return eintrag && (await istSuchverzeichniseintragAktuell(eintrag)) ? eintrag : undefined;
  };
  let eintrag = await finde();
  if (!eintrag) {
    if (laufend) await beobachte(laufend);
    eintrag = await finde();
    if (!eintrag) {
      if (neuLesen) await beobachte(neuLesen());
      else await bereiteSuchverzeichnisVor([referenz]);
      eintrag = await finde();
    }
  }
  return eintrag;
}

/** Ein erfolgreicher Import bleibt auch ohne Cache erfolgreich; der Normsprung wird ausdrücklich gemeldet. */
export async function loeseNormzielNachImportAuf(
  referenz: Gesetzesreferenz,
  anfrage: Suchanfrage,
  gefundenUeber?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | undefined> {
  if (!anfrage.normNummer && !anfrage.erwaegungsgrundNummer) return undefined;
  let normFehlt = false;
  try {
    const eintrag = await leseSuchverzeichniseintragNachImport(referenz);
    if (eintrag) {
      const xmlId = loeseNormzielAuf(anfrage, eintrag, gefundenUeber)?.xmlId;
      if (xmlId) return xmlId;
      normFehlt = true;
    }
  } catch (fehler) {
    console.error('Suchvorbereitung nach erfolgreichem Import fehlgeschlagen:', fehler);
  }
  meldePersistenzBefund(
    {
      typ: 'warnung',
      art: 'hinweis',
      anlass: 'lesen',
      aenderungsstand: 'vollstaendig',
      grund: 'normNichtGefunden',
      betroffen: referenz.kurztitel,
      text: `Das Gesetz „${referenz.kurztitel}“ wurde importiert. Der Sprung zur gewünschten Norm ist fehlgeschlagen, weil ${normFehlt ? 'die gewünschte Norm im importierten Gesetz nicht gefunden wurde' : 'die Suche noch nicht vorbereitet werden konnte'}.`,
    },
    meldungEmpfangen,
  );
  return undefined;
}
