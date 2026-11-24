// spaeteMeldungenBanner.ts
// Sammelstelle für späte Meldungen: Ist ein Vorgang für den Nutzer beendet
// (Bericht geschlossen, Ergebnisbanner gezeigt), während Folgeläufe oder
// sonstige Nacharbeit noch laufen, gehen danach eintreffende Meldungen nicht
// verloren. Nach Ende aller Nacharbeit gehen Dateibefunde in das Banner der
// Dateibefunde, die übrigen zusammen in EIN Banner der Bannerart
// Vorgangsergebnis. Lebt unabhängig von der Anzeige (Unmount).
import {
  erzeugeAktionsMeldungsSammlung,
  istDateibefund,
  type AktionsMeldung,
} from '@/lib/domain/app/aktionsMeldung';
import { zeigeAktionsMeldungsBanner } from './aktionsMeldungsBanner';
import { meldeDateibefund } from './dateibefundBanner';

/** Dateibefunde in das Dateibefund-Banner, die übrigen Meldungen zusammen in
 *  ein Vorgangsergebnis-Banner (keines, wenn keine übrig bleiben). */
export function zeigeMeldungenNachZustaendigkeit(meldungen: readonly AktionsMeldung[]): void {
  for (const meldung of meldungen) if (istDateibefund(meldung)) meldeDateibefund(meldung);
  zeigeAktionsMeldungsBanner(meldungen.filter((m) => !istDateibefund(m)));
}

/** Quelle von Meldungen, die auch nach dem Schließen noch wachsen kann
 *  (z. B. Berichtseintrag), samt ihren offenen Folgeläufen. */
interface SpaeteMeldungsquelle {
  readonly meldungen?: readonly AktionsMeldung[];
  abschluss?: {
    abonnieren: (beobachten: () => void) => () => void;
    hatOffeneFolgelaeufe: () => boolean;
  };
}

/** Je Vorgang eine Sammelstelle. Vor dem Schließen bleibt sie wirkungslos;
 *  die Meldungen gehören dann zum Vorgang selbst. */
export function erzeugeSpaeteMeldungen() {
  const offeneLaeufe = new Set<Promise<unknown>>();
  const ohneQuelle: AktionsMeldung[] = [];
  let geschlossen:
    { quellen: readonly SpaeteMeldungsquelle[]; bekannt: Set<AktionsMeldung> } | undefined;
  const abmelden: Array<() => void> = [];
  let gezeigt = false;

  function pruefeAbschluss() {
    if (!geschlossen || gezeigt || offeneLaeufe.size) return;
    if (geschlossen.quellen.some((q) => q.abschluss?.hatOffeneFolgelaeufe())) return;
    gezeigt = true;
    for (const ende of abmelden.splice(0)) ende();
    const bekannt = geschlossen.bekannt;
    const spaet = [
      ...geschlossen.quellen.flatMap((q) => (q.meldungen ?? []).filter((m) => !bekannt.has(m))),
      ...ohneQuelle,
    ];
    zeigeMeldungenNachZustaendigkeit(spaet);
  }

  return {
    /** Offene Nacharbeit (z. B. Neuladen der Gesetzesliste) bis zu ihrem Ende verfolgen. */
    verfolge(lauf: Promise<unknown>): void {
      offeneLaeufe.add(lauf);
      void lauf
        .catch(() => undefined)
        .finally(() => {
          offeneLaeufe.delete(lauf);
          pruefeAbschluss();
        });
    },
    /** Meldung ohne Quelle; zählt nur, wenn sie nach dem Schließen eintrifft. */
    melde(meldung: AktionsMeldung): void {
      if (geschlossen && !gezeigt) ohneQuelle.push(meldung);
    },
    /** Der Vorgang endet für den Nutzer: Was er bis jetzt gesehen hat, zählt
     *  nicht als spät. Ohne späte Meldungen entsteht kein Banner. Wiederholtes
     *  Schließen bleibt wirkungslos. */
    schliesse(quellen: readonly SpaeteMeldungsquelle[]): void {
      if (geschlossen) return;
      geschlossen = {
        quellen,
        bekannt: new Set(quellen.flatMap((q) => q.meldungen ?? [])),
      };
      for (const q of quellen)
        if (q.abschluss) abmelden.push(q.abschluss.abonnieren(pruefeAbschluss));
      pruefeAbschluss();
    },
  };
}

/** Sammelt während des Vorgangs. abschliessen() liefert die bisherigen
 *  Meldungen für das Ergebnis; spätere gehen an die Sammelstelle für späte
 *  Meldungen und erscheinen nach Ende aller Folgeläufe gesammelt. */
export function erzeugeBannerMeldungsSammlung() {
  const sammlung = erzeugeAktionsMeldungsSammlung();
  const spaete = erzeugeSpaeteMeldungen();
  let ergebnis: readonly AktionsMeldung[] | undefined;
  return {
    meldungEmpfangen: sammlung.meldungEmpfangen,
    abschliessen(): readonly AktionsMeldung[] {
      if (ergebnis) return ergebnis;
      ergebnis = sammlung.meldungen();
      spaete.schliesse([
        {
          get meldungen() {
            return sammlung.meldungen();
          },
          abschluss: sammlung,
        },
      ]);
      return ergebnis;
    },
  };
}
