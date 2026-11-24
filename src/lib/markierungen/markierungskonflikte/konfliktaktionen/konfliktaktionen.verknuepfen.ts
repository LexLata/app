// Konfliktaktionen: verknuepfen; nutzt gemeinsame Helfer ohne eigenen Zustand.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { MarkierungsSchreibErgebnis } from '@/lib/markierungen/eintrag/eintrag.index';
import {
  aendereEintraegeMitGesetzquellen,
  leseEintraegeMitGesetzquellen,
} from '@/lib/markierungen/eintrag/eintrag.index';
import {
  identitaetsSchluessel,
  klassifiziereZielnorm,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  aktuellerElementstand,
  berechneAktuelleVerknuepfungen,
  berechneZielelementstaende,
  ermittleVerknuepfungsQuellen,
} from '@/lib/markierungen/markierungskonflikte/konfliktaktionen/markierungskonflikteAktionen';
import type { AnzeigeGesetzKonflikte } from '@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige';
import { verifiziereBekannteKonflikte } from '@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige';
import { reiheInPruefungsKetteEin } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefkette';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import type { VerknuepfungsUmfang, VerknuepfungsZahlen } from './markierungskonflikteAktionen';

import { synceMarkierungsAenderung } from './konfliktaktionen';
/** Die angezeigten Identitäten begrenzen Einzelaktionen auch nach zwischenzeitlichen Änderungen. */
interface ZielnormZeilenUmfang {
  zeilenart: 'zielNormUnpassend' | 'zielNormNichtEindeutig' | 'zielNormFehlt';
  verweisziele: readonly { bezeichnung: string }[];
}

/** Bearbeitet nur angezeigte Zielnormen mit einem weiterhin passenden Konfliktbefund. */
export async function aktualisiereVerknuepfungMitErgebnis(
  gesetz: Gesetzesreferenz,
  schluessel: string,
  zielgesetzReferenz: Gesetzesreferenz,
  modus: 'verknuepfen' | 'entfernen',
  umfang: ZielnormZeilenUmfang,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsSchreibErgebnis<VerknuepfungsZahlen>> {
  const ergebnis = await aendereEintraegeMitGesetzquellen(
    gesetz,
    (alle) =>
      alle.some(
        (e) =>
          identitaetsSchluessel(e) === schluessel &&
          e.typ === 'verweismarkierung' &&
          e.verweisinhalt?.verweisziele.some(
            (z) =>
              z.typ === 'zielnorm' && istGleichesGesetz(z.gesetz ?? gesetz, zielgesetzReferenz),
          ),
      )
        ? [zielgesetzReferenz]
        : [],
    (alle, quellen) => {
      const zielgesetz = quellen.get(gesetzesreferenzSchluessel(zielgesetzReferenz));
      const zahlen: VerknuepfungsZahlen = {
        markierungen: 0,
        verweisziele: 0,
        elementstaende: 0,
      };
      const eintraege = alle.map((e) => {
        if (identitaetsSchluessel(e) !== schluessel) return e;
        const neu = berechneZielelementstaende(gesetz, e, zielgesetzReferenz, (z) => {
          if (
            !zielgesetz ||
            !umfang.verweisziele.some((angezeigt) => angezeigt.bezeichnung === z.bezeichnung)
          )
            return 'unveraendert';
          const befund = klassifiziereZielnorm(z, zielgesetz);
          const erwartet = {
            zielNormUnpassend: 'unpassend',
            zielNormNichtEindeutig: 'nichtEindeutig',
            zielNormFehlt: 'fehlt',
          }[umfang.zeilenart];
          if (befund !== erwartet || (modus === 'verknuepfen' && befund !== 'unpassend'))
            return 'unveraendert';
          zahlen.verweisziele++;
          return modus === 'entfernen' ? undefined : aktuellerElementstand(z, zielgesetz);
        });
        if (neu !== e) zahlen.markierungen++;
        return neu;
      });
      return zahlen.markierungen === 0
        ? { art: 'unveraendert', ergebnis: zahlen }
        : { art: 'geaendert', eintraege, ergebnis: zahlen };
    },
    meldungEmpfangen,
  );
  return schliesseVerknuepfungAb(gesetz, ergebnis, meldungEmpfangen);
}

async function schliesseVerknuepfungAb<T>(
  gesetz: Gesetzesreferenz,
  ergebnis: MarkierungsSchreibErgebnis<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsSchreibErgebnis<T>> {
  if (ergebnis.status === 'fehlgeschlagen') return ergebnis;
  let nachgelagerterFehler = ergebnis.nachgelagerterFehler;
  // Ein unbestätigter Quellabschluss kann die vorhandene Prüfqueue blockieren.
  // Ein bereits gemeldeter Nachfehler darf deshalb kein erneutes Warten auslösen.
  if (nachgelagerterFehler === undefined) {
    try {
      if (ergebnis.status === 'unveraendert') await verifiziereBekannteKonflikte(meldungEmpfangen);
      await reiheInPruefungsKetteEin(async () => {}, true, false, false, false, meldungEmpfangen);
    } catch (fehler) {
      nachgelagerterFehler = fehler;
    }
  }
  // Fenster dürfen den gespeicherten Bestand auch bei offenem Prüfbefund nachladen.
  try {
    await synceMarkierungsAenderung(gesetz, meldungEmpfangen, ergebnis.status === 'geaendert');
  } catch (fehler) {
    nachgelagerterFehler =
      nachgelagerterFehler === undefined
        ? fehler
        : new AggregateError(
            [nachgelagerterFehler, fehler],
            'Die Änderung konnte nicht vollständig nachgeprüft oder synchronisiert werden.',
          );
  }
  if (nachgelagerterFehler !== undefined && ergebnis.status === 'geaendert' && meldungEmpfangen)
    meldePersistenzBefund(
      {
        text: 'Die Verknüpfung wurde geändert. Die anschließende Prüfung oder Synchronisierung konnte nicht zuverlässig abgeschlossen werden.',
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'pruefabschluss',
        aenderungsstand: 'vollstaendig',
      },
      meldungEmpfangen,
    );
  return nachgelagerterFehler === undefined ? ergebnis : { ...ergebnis, nachgelagerterFehler };
}

export async function aktualisiereAusgangsVerknuepfungMitErgebnis(
  gesetz: Gesetzesreferenz,
  schluessel: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsSchreibErgebnis<VerknuepfungsZahlen>> {
  const umfang = new Map([[schluessel, { ausgang: true, zielgesetze: [] }]]);
  return schliesseVerknuepfungAb(
    gesetz,
    await bearbeiteAktuelleVerknuepfungen(gesetz, umfang, false, meldungEmpfangen),
    meldungEmpfangen,
  );
}

/** Geschütztes Nachladen zur Anzeigevoraussetzung; ein Ladefehler ist kein leeres Ergebnis. */
export async function ladeAktuelleMarkierung(
  gesetz: Gesetzesreferenz,
  schluessel: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
) {
  return leseEintraegeMitGesetzquellen(
    gesetz,
    () => [],
    (alle) => alle.find((e) => identitaetsSchluessel(e) === schluessel),
    meldungEmpfangen,
  );
}

async function bearbeiteAktuelleVerknuepfungen(
  gesetz: Gesetzesreferenz,
  umfang: ReadonlyMap<string, VerknuepfungsUmfang>,
  nurErmitteln = false,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsSchreibErgebnis<VerknuepfungsZahlen>> {
  if (nurErmitteln) {
    try {
      const zahlen = await leseEintraegeMitGesetzquellen(
        gesetz,
        (alle) => ermittleVerknuepfungsQuellen(gesetz, alle, umfang),
        (alle, quellen) => berechneAktuelleVerknuepfungen(gesetz, alle, umfang, quellen).zahlen,
        meldungEmpfangen,
      );
      return { status: 'unveraendert', ergebnis: zahlen };
    } catch (fehler) {
      return { status: 'fehlgeschlagen', fehler };
    }
  }
  return aendereEintraegeMitGesetzquellen(
    gesetz,
    (alle) => ermittleVerknuepfungsQuellen(gesetz, alle, umfang),
    (alle, quellen) => {
      const { eintraege, zahlen } = berechneAktuelleVerknuepfungen(gesetz, alle, umfang, quellen);
      return zahlen.markierungen === 0
        ? { art: 'unveraendert', ergebnis: zahlen }
        : { art: 'geaendert', eintraege, ergebnis: zahlen };
    },
    meldungEmpfangen,
  );
}

export interface VerknuepfungsBericht {
  zahlen: VerknuepfungsZahlen;
  gesetze: {
    gesetz: Gesetzesreferenz;
    ergebnis: MarkierungsSchreibErgebnis<VerknuepfungsZahlen>;
  }[];
  fehler: { gesetz: Gesetzesreferenz; fehler: unknown }[];
  /** Nach einem unbestätigten Prüfabschluss wird die blockierbare Queue nicht erneut betreten. */
  unbearbeiteteGesetze: Gesetzesreferenz[];
}

/** Derselbe geschützte Berechnungsweg wie beim Schreiben; Ladefehler bleiben ausdrücklich erhalten. */
export async function ermittleAktuelleVerknuepfungsMoeglichkeit(
  gesetze: AnzeigeGesetzKonflikte[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
) {
  const bericht = await verknuepfeAngezeigteNormen(gesetze, true, meldungEmpfangen);
  return { moeglich: bericht.zahlen.markierungen > 0, fehler: bericht.fehler };
}

export async function verknuepfeMitAktuellenNormen(
  gesetze: AnzeigeGesetzKonflikte[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<VerknuepfungsBericht> {
  return verknuepfeAngezeigteNormen(gesetze, false, meldungEmpfangen);
}

function ermittleAngezeigtenVerknuepfungsUmfang(gesetze: AnzeigeGesetzKonflikte[]) {
  const gruppen = new Map<
    string,
    { gesetz: Gesetzesreferenz; umfang: Map<string, VerknuepfungsUmfang> }
  >();
  for (const g of gesetze) {
    if (g.fehlendesGesetz) continue;
    const gruppe = gruppen.get(gesetzesreferenzSchluessel(g.gesetz)) ?? {
      gesetz: g.gesetz,
      umfang: new Map<string, VerknuepfungsUmfang>(),
    };
    gruppen.set(gesetzesreferenzSchluessel(g.gesetz), gruppe);
    for (const e of g.eintraege) {
      const u = gruppe.umfang.get(e.schluessel) ?? {
        ausgang: false,
        zielgesetze: [],
      };
      u.ausgang ||= e.eigenerKonflikt === 'pauschalerBezugUnpassend';
      for (const z of e.zielKonflikte)
        if (!u.zielgesetze.some((g) => istGleichesGesetz(g, z.gesetz)))
          u.zielgesetze.push(z.gesetz);
      gruppe.umfang.set(e.schluessel, u);
    }
  }
  return gruppen;
}

async function verknuepfeAngezeigteNormen(
  gesetze: AnzeigeGesetzKonflikte[],
  nurErmitteln: boolean,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<VerknuepfungsBericht> {
  const bericht: VerknuepfungsBericht = {
    zahlen: { elementstaende: 0, verweisziele: 0, markierungen: 0 },
    gesetze: [],
    fehler: [],
    unbearbeiteteGesetze: [],
  };
  const gruppen = ermittleAngezeigtenVerknuepfungsUmfang(gesetze);
  for (const g of gruppen.values()) {
    const gespeichert = await bearbeiteAktuelleVerknuepfungen(
      g.gesetz,
      g.umfang,
      nurErmitteln,
      meldungEmpfangen,
    );
    const ergebnis = nurErmitteln
      ? gespeichert
      : await schliesseVerknuepfungAb(g.gesetz, gespeichert, meldungEmpfangen);
    bericht.gesetze.push({ gesetz: g.gesetz, ergebnis });
    if (ergebnis.status === 'fehlgeschlagen') {
      bericht.fehler.push({ gesetz: g.gesetz, fehler: ergebnis.fehler });
      continue;
    }
    if (nurErmitteln || ergebnis.status === 'geaendert')
      for (const key of ['elementstaende', 'verweisziele', 'markierungen'] as const)
        bericht.zahlen[key] += ergebnis.ergebnis[key];
    if (ergebnis.nachgelagerterFehler !== undefined) {
      bericht.fehler.push({
        gesetz: g.gesetz,
        fehler: ergebnis.nachgelagerterFehler,
      });
      // Weitere Schreibaufträge könnten auf denselben unbestätigten Abschluss warten.
      bericht.unbearbeiteteGesetze = [...gruppen.values()]
        .slice(bericht.gesetze.length)
        .map((g) => g.gesetz);
      break;
    }
  }
  return bericht;
}
