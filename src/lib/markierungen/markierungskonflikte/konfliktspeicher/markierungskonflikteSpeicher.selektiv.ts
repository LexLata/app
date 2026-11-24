// Prüft geänderte Gesetze und einzelne Markierungen über die gemeinsame Prüfkette.
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { ladeEintraegeFuerPruefung } from '@/lib/markierungen/eintrag/eintrag.index';
import { pruefeNichtamtlicheTitelXmlFehlt } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { GeladenerPruefstand } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import {
  erhalteVollbedarf,
  ladePruefstand,
  schreibePruefergebnis,
} from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import {
  aktualisiereEinzelneMarkierung,
  sindGleicheGespeicherteGesetzKonflikte,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  existierenNichtamtlicheTitelFuerPruefung,
  ladeGesetzeFuerPruefung,
} from '@/lib/persistenz/gesetz/gesetz.index';
import {
  benoetigtVollpruefung,
  fuehrePruefungAus,
  fuehrePruefungMitFehlerabschluss,
  fuehreVollpruefungAus,
} from './markierungskonflikteSpeicher.pruefdurchlauf';
import { liesQuellenOhneKonfliktsperre } from './markierungskonflikteSpeicher.ungesperrtesLesen';
import { gesetzquellenDerMarkierungen } from './markierungskonflikteQuellen';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { reiheInPruefungsKetteEin } from './markierungskonflikteSpeicher.pruefkette';
import { pruefeEinmaligeVollwiederholung } from './markierungskonflikteSpeicher.pruefsteuerung';

/**
 * Prüft NUR die übergebenen Gesetze VOLLSTÄNDIG (alle eigenen und Zielkonflikte möglich) sowie
 * – über einen günstigen Rohtext-Vorfilter statt vollem Parsen – alle
 * anderen Gesetze, deren Markierungs-XML überhaupt einen Verweis auf eines
 * der betroffenen Gesetze enthält, aber für Letztere NUR GEZIELT: deren
 * eigener Konflikt (eigener Bezugskonflikt) und Zielkonflikte zu unveränderten Gesetzen
 * bleiben unangetastet, nur die Zielkonflikte zu `betroffene` werden neu
 * berechnet (siehe aktualisiereZielkonflikte und Absprache: eine
 * Aktualisierung des GG soll im BGB-Block nicht auch dessen unabhängige
 * eigene Konflikte neu berechnen). Patcht damit gezielt nur die tatsächlich
 * betroffenen Gesetze in markierungskonflikte.xml, alle anderen bleiben
 * wörtlich unverändert. Wird normalerweise NICHT direkt aufgerufen, sondern über
 * nachSpeichernPruefen(). Fehlender oder unterbrochener Gesamtbestand wird
 * stattdessen über den gemeinsamen Vollprüfungsablauf wiederhergestellt.
 *
 * Läuft NIE parallel zu einem anderen Aufruf dieser Funktion (siehe
 * reiheInPruefungsKetteEin oben) – ein neuer Aufruf wartet, bis der
 * vorherige geschrieben hat, bevor er selbst zu lesen beginnt.
 *
 * `nurEigeneMarkierungen` (siehe fuehrePruefungAus): überspringt den
 * Referenz-Scan anderer Gesetze – für Aufrufer, bei denen sich NUR die
 * Markierungen von `betroffene` selbst geändert haben, nicht deren
 * Gesetz-XML (Datei-Import, Sammel-Konfliktaktionen wie "Markierungen
 * nichtamtlicher Titel löschen"). Für einen EINZELNEN geänderten Eintrag
 * ist stattdessen die deutlich günstigere pruefeEineMarkierungSelektiv()
 * unten gedacht.
 */
export function pruefeMarkierungenSelektiv(
  betroffene: Gesetzesreferenz[],
  optionen?: {
    nurEigeneMarkierungen?: boolean;
    vorgaenge?: string[];
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
  },
): Promise<void> {
  const meldungEmpfangen = optionen?.meldungEmpfangen;
  if (betroffene.length === 0) return Promise.resolve();
  const fehlerMeldungen: AktionsMeldung[] = [];
  return reiheInPruefungsKetteEin(
    (token, empfangen) =>
      fuehrePruefungMitFehlerabschluss(
        token,
        async (stand) =>
          benoetigtVollpruefung(stand, (await erhalteVollbedarf(token, stand)).vollbedarf)
            ? fuehreVollpruefungAus(token, stand, empfangen)
            : fuehrePruefungAus(
                token,
                betroffene,
                false,
                optionen?.nurEigeneMarkierungen ?? false,
                optionen?.vorgaenge,
                stand,
                [],
                empfangen,
              ),
        empfangen,
      ),
    true,
    'bei-vollbedarf',
    false,
    false,
    meldungEmpfangen,
    fehlerMeldungen,
  ).catch(async (fehler: unknown) => {
    await pruefeEinmaligeVollwiederholung(fehler, meldungEmpfangen, fehlerMeldungen);
  });
}

/**
 * Prüft NUR EINE einzelne, bereits bekannte Markierung neu (siehe
 * aktualisiereEinzelneMarkierung in markierungs-xml) – für die einzelnen
 * Konfliktaktionen im Markierungskonflikte-Fenster (Markierung löschen, mit
 * aktueller Norm verknüpfen, Verknüpfung entfernen), bei denen genau EIN
 * Eintrag sich geändert hat, nicht die gesamte Markierungsliste des
 * Gesetzes. Deutlich günstiger als pruefeMarkierungenSelektiv(): kein
 * Referenz-Scan anderer Markierungs-XMLs (der Norminhalt des Gesetzes
 * selbst ändert sich hier nie) UND keine Neuprüfung der ÜBRIGEN
 * Markierungen desselben Gesetzes – nur nichtamtlicheTitelXmlFehlt wird zusätzlich zum
 * Einzeleintrag berücksichtigt (hängt an ALLEN Markierungen des Gesetzes,
 * siehe aktualisiereEinzelneMarkierung).
 *
 * Für Fälle, bei denen MEHRERE Einträge gleichzeitig betroffen sind (z.B.
 * "Markierungen nichtamtlicher Titel löschen", Datei-Import): weiterhin
 * pruefeMarkierungenSelektiv(betroffene, { nurEigeneMarkierungen: true }).
 *
 * Läuft über dieselbe pruefungsKette wie pruefeMarkierungenSelektiv – nie
 * parallel zu einem anderen Prüf-/Patch-Lauf auf markierungskonflikte.xml.
 * Bei vollständigem Ausgangsbestand öffnet die Einzelprüfung das Fenster
 * nicht (anders als
 * fuehrePruefungAus): eine einzelne Konfliktaktion setzt voraus, dass dieses
 * Fenster bereits offen ist, und kann per Definition nur eine
 * (Teil-)Auflösung bewirken, nie neu ENTDECKTE Konflikte (analog zu
 * verifiziereBekannteKonflikte in markierungskonflikteAnzeige.ts). Fehlender oder
 * unterbrochener Gesamtbestand benötigt dagegen eine vollständige Prüfung,
 * die auch neue Konflikte außerhalb der Einzelaktion entdecken kann.
 */
export function pruefeEineMarkierungSelektiv(
  gesetzesreferenz: Gesetzesreferenz,
  schluessel: string,
  vorgang?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  const fehlerMeldungen: AktionsMeldung[] = [];
  return reiheInPruefungsKetteEin(
    (token, empfangen) =>
      fuehrePruefungMitFehlerabschluss(
        token,
        async (stand) =>
          benoetigtVollpruefung(stand, (await erhalteVollbedarf(token, stand)).vollbedarf)
            ? fuehreVollpruefungAus(token, stand, empfangen)
            : fuehreEinzelPruefungAus(
                token,
                gesetzesreferenz,
                schluessel,
                vorgang ? [vorgang] : [],
                stand,
                empfangen,
              ),
        empfangen,
      ),
    true,
    'bei-vollbedarf',
    false,
    false,
    meldungEmpfangen,
    fehlerMeldungen,
  ).then(
    () => undefined,
    async (fehler: unknown) => {
      await pruefeEinmaligeVollwiederholung(fehler, meldungEmpfangen, fehlerMeldungen);
    },
  );
}

async function fuehreEinzelPruefungAus(
  token: string,
  gesetzesreferenz: Gesetzesreferenz,
  schluessel: string,
  vorgaenge: string[] = [],
  geladenerStand?: GeladenerPruefstand,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  const stand = geladenerStand ?? (await ladePruefstand(token, meldungEmpfangen));
  const { eintraege, alleGesetze, nichtamtlicheTitelVorhanden } =
    await liesQuellenOhneKonfliktsperre(
      token,
      stand,
      false,
      async (empfangen) => {
        const eintraege = await ladeEintraegeFuerPruefung(gesetzesreferenz, empfangen);
        const gepruefteEintraege = eintraege.filter((e) => identitaetsSchluessel(e) === schluessel);
        const alleGesetze = await ladeGesetzeFuerPruefung(
          gesetzquellenDerMarkierungen(gesetzesreferenz, gepruefteEintraege),
          empfangen,
        );
        const nichtamtlicheTitelVorhanden =
          eintraege.length === 0 || !alleGesetze.some((g) => istGleichesGesetz(g, gesetzesreferenz))
            ? new Set<string>()
            : await existierenNichtamtlicheTitelFuerPruefung([gesetzesreferenz], empfangen);
        return { eintraege, alleGesetze, nichtamtlicheTitelVorhanden };
      },
      meldungEmpfangen,
    );
  const eigenesGesetz = alleGesetze.find((g) => istGleichesGesetz(g, gesetzesreferenz));
  // Sollte bei einer einzelnen Konfliktaktion nie vorkommen (die setzt ein
  // geladenes Gesetz voraus) – best-effort trotzdem abgesichert: bleibt der
  // bestehende Block dann einfach unangetastet, statt ihn fälschlich zu
  // löschen.
  if (!eigenesGesetz) {
    if (vorgaenge.length > 0)
      throw new Error(
        'Das eigene Gesetz fehlt; die einzelne Markierung kann nicht geprüft werden.',
      );
    return;
  }

  await erhalteVollbedarf(token, stand);
  const gesetzKonflikte = stand.gesetzKonflikte;

  if (eintraege.length === 0) {
    // Keine Markierungen mehr für dieses Gesetz (letzte gerade gelöscht) –
    // damit gibt es auch keinen Konflikt mehr, unabhängig von nichtamtlicheTitelXmlFehlt.
    gesetzKonflikte.delete(gesetzesreferenzSchluessel(gesetzesreferenz));
    await schreibePruefergebnis(token, stand, false, vorgaenge, meldungEmpfangen);
    return;
  }

  const nichtamtlicheTitelXmlFehlt = pruefeNichtamtlicheTitelXmlFehlt(
    eintraege,
    gesetzesreferenz,
    nichtamtlicheTitelVorhanden,
  );
  const vorher = gesetzKonflikte.get(gesetzesreferenzSchluessel(gesetzesreferenz));
  const nachher = aktualisiereEinzelneMarkierung(
    vorher,
    gesetzesreferenz,
    schluessel,
    eintraege,
    eigenesGesetz,
    alleGesetze,
    nichtamtlicheTitelVorhanden,
    nichtamtlicheTitelXmlFehlt,
  );
  if (sindGleicheGespeicherteGesetzKonflikte(nachher, vorher) && vorgaenge.length === 0) return;

  if (nachher) gesetzKonflikte.set(gesetzesreferenzSchluessel(gesetzesreferenz), nachher);
  else gesetzKonflikte.delete(gesetzesreferenzSchluessel(gesetzesreferenz));
  await schreibePruefergebnis(token, stand, false, vorgaenge, meldungEmpfangen);
}
