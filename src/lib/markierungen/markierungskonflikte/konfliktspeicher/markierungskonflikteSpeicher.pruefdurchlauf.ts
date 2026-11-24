// Führt Markierungskonfliktprüfungen unter der Konfliktdateisperre aus; Prüfquellen
// werden bei unterbrochener Sperre gelesen (liesQuellenOhneKonfliktsperre).
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { liesQuellenOhneKonfliktsperre } from './markierungskonflikteSpeicher.ungesperrtesLesen';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import {
  ermittleGesetzeMitMarkierungen,
  ladeEintraegeFuerPruefung,
  leseMarkierungsXMLFuerPruefung,
} from '@/lib/markierungen/eintrag/eintrag.index';
import type { GeladenerPruefstand } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import {
  PruefstandAbschlussfehler,
  erhalteVollbedarf,
  ladePruefstand,
  pruefvorgangsAktion,
  schreibePruefergebnis,
  schreibeGesetzKonflikte,
} from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import {
  berechneNeueKonflikte,
  entscheideEigenerBlock,
  entscheidePatchBlock,
} from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.entscheidung';
import { planeFensterOeffnen } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.fensterOeffnen';
import { existierenNichtamtlicheTitelFuerPruefung } from '@/lib/persistenz/gesetz/gesetz.index';
import { liesVerweiszielGesetze } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  ladeGesetzeMitBefunden,
  sammleQuellfehler,
  wirfQuellfehler,
} from './markierungskonflikteSpeicher.quellheilung';

import { liesPruefungsKette } from './markierungskonflikteSpeicher.zustand';
import { gesetzquellenDerMarkierungen } from './markierungskonflikteQuellen';

interface Pruefquellen {
  nichtamtlicheTitelVorhanden: Set<string>;
  referenzierend: Gesetzesreferenz[];
  eintraegeJeGesetz: Map<string, Awaited<ReturnType<typeof ladeEintraegeFuerPruefung>>>;
  alleGesetze: Awaited<ReturnType<typeof ladeGesetzeMitBefunden>>;
}

/** Liest alle Quellen eines Prüflaufs; braucht keine Konfliktdateisperre. */
async function liesPruefquellen(
  betroffene: Gesetzesreferenz[],
  vollstaendig: boolean,
  nurEigeneMarkierungen: boolean,
  vorabQuellfehler: unknown[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Pruefquellen> {
  const quellfehler = [...vorabQuellfehler];
  // Nur für nichtamtlicheTitelXmlFehlt benötigt (siehe markierungskonfliktPruefung.ts) – ein reiner
  // Existenz-Check pro Gesetz, kein Parsen der nichtamtlicheTitel-XML selbst.
  // Auf `betroffene` eingeschränkt: referenzierende Gesetze benötigen den Wert
  // nicht (siehe entscheidePatchBlock/aktualisiereZielkonflikte).
  let nichtamtlicheTitelVorhanden = new Set<string>();
  try {
    nichtamtlicheTitelVorhanden = await existierenNichtamtlicheTitelFuerPruefung(
      [...betroffene],
      meldungEmpfangen,
    );
  } catch (fehler) {
    sammleQuellfehler(quellfehler, fehler);
  }

  const referenzierend = await ermittleReferenzierende(
    betroffene,
    vollstaendig,
    nurEigeneMarkierungen,
    quellfehler,
    meldungEmpfangen,
  );

  const eintraegeJeGesetz = await sammleMarkierungsbefunde(
    [...betroffene, ...referenzierend],
    quellfehler,
    meldungEmpfangen,
  );
  const referenzen = nurEigeneMarkierungen
    ? betroffene.flatMap((ref) =>
        gesetzquellenDerMarkierungen(
          ref,
          eintraegeJeGesetz.get(gesetzesreferenzSchluessel(ref)) ?? [],
        ),
      )
    : undefined;
  const alleGesetze = vorabQuellfehler.length
    ? []
    : await ladeGesetzeMitBefunden(quellfehler, meldungEmpfangen, referenzen);
  wirfQuellfehler(quellfehler);
  return { nichtamtlicheTitelVorhanden, referenzierend, eintraegeJeGesetz, alleGesetze };
}

/**
 * Der Lese-Modifizier-Schreib-Zyklus für EINEN Prüflauf – siehe
 * pruefeMarkierungenSelektiv() für die öffentliche, serialisierte Variante.
 * NIE direkt aufrufen: alle Aufrufe erfolgen über die lokale Warteschlange und
 * die prozessweite Konfliktdateisperre. Nur das Lesen der Quellen geschieht bei
 * unterbrochener Sperre; Berechnen und Schreiben auf dem danach gültigen Stand.
 */
export async function fuehrePruefungAus(
  token: string,
  betroffene: Gesetzesreferenz[],
  vollstaendig = false,
  nurEigeneMarkierungen = false,
  vorgaenge: string[] = [],
  geladenerStand?: GeladenerPruefstand,
  vorabQuellfehler: unknown[] = [],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  const stand = geladenerStand ?? (await ladePruefstand(token, meldungEmpfangen));
  const quellen = await liesQuellenOhneKonfliktsperre(
    token,
    stand,
    vollstaendig,
    (empfangen) =>
      liesPruefquellen(
        betroffene,
        vollstaendig,
        nurEigeneMarkierungen,
        vorabQuellfehler,
        empfangen,
      ),
    meldungEmpfangen,
  );
  await wendePruefungAn(
    token,
    stand,
    betroffene,
    quellen,
    vollstaendig,
    vorgaenge,
    meldungEmpfangen,
  );
}

/** Berechnet und schreibt unter gehaltener Konfliktdateisperre. */
async function wendePruefungAn(
  token: string,
  stand: GeladenerPruefstand,
  betroffene: Gesetzesreferenz[],
  { nichtamtlicheTitelVorhanden, referenzierend, eintraegeJeGesetz, alleGesetze }: Pruefquellen,
  vollstaendig: boolean,
  vorgaenge: string[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  await erhalteVollbedarf(token, stand);
  const gesetzKonflikte = stand.gesetzKonflikte;
  // Schnappschuss VOR den Änderungen unten – dient unten ausschließlich dem
  // Signatur-Diff (berechneNeueKonflikte), NICHT dem eigentlichen Schreiben
  // (dafür wird weiterhin `gesetzKonflikte` selbst mutiert, siehe (a)/(b)).
  const vorherGesetzKonflikte = new Map(gesetzKonflikte);

  // Bei vollstaendig === true (siehe pruefeAlleMarkierungen): statt die
  // geladene Alt-Version weiterzuverwenden und nur einzelne Blöcke gezielt
  // zu patchen, wird gesetzKonflikte komplett geleert – Schritt (a) unten prüft dann
  // ausnahmslos JEDE relevante Kurztitel neu und befüllt gesetzKonflikte von
  // Grund auf. Ein Block zu einem Kurztitel, der weder ein
  // installiertes Gesetz noch eine vorhandene Markierungs-Datei hat (z.B.
  // eine inzwischen wieder aus dem Markierungen-Ordner entfernte Datei),
  // kann dadurch nicht mehr als Waise überleben – bisheriger Bug: "Alle
  // Markierungen neu prüfen" behauptete laut Docstring eine komplette
  // Neuberechnung, patchte aber tatsächlich nur die alte Ladung, sodass
  // solche verwaisten Blöcke unbegrenzt (auch über einen App-Neustart
  // hinweg) liegen blieben.
  if (vollstaendig) gesetzKonflikte.clear();

  // (a) Betroffene Gesetze VOLLSTÄNDIG neu prüfen (Entscheidung Set/Delete
  // siehe entscheideEigenerBlock in markierungskonflikteSpeicher.entscheidung.ts).
  for (const gesetzesreferenz of betroffene) {
    const eintraege = eintraegeJeGesetz.get(gesetzesreferenzSchluessel(gesetzesreferenz))!;
    const block = entscheideEigenerBlock(
      gesetzesreferenz,
      eintraege,
      alleGesetze,
      nichtamtlicheTitelVorhanden,
    );
    if (block) gesetzKonflikte.set(gesetzesreferenzSchluessel(gesetzesreferenz), block);
    else gesetzKonflikte.delete(gesetzesreferenzSchluessel(gesetzesreferenz));
  }

  // (b) Referenzierende Gesetze NUR GEZIELT patchen (siehe
  // entscheidePatchBlock/aktualisiereZielkonflikte) – ihr eigener
  // Konflikt und Zielkonflikte zu anderen, unveränderten Gesetzen bleiben
  // unberührt. Gesetze, deren eigenesGesetz nicht (mehr) existiert, werden
  // hier übersprungen: ihr Block ist entweder unabhängig davon schon als
  // fehlendesGesetz (gesetzFehlt) erfasst (unverändert, da sie selbst nicht in
  // `betroffene` sind) oder – falls noch nie geprüft – wird erst bei ihrer
  // eigenen künftigen Aktualisierung/Löschung vollständig erfasst (siehe
  // Kopfkommentar zur Selektivität).
  for (const gesetzesreferenz of referenzierend) {
    const eigenesGesetz = alleGesetze.find((g) => istGleichesGesetz(g, gesetzesreferenz));
    if (!eigenesGesetz) continue;
    const eintraege = eintraegeJeGesetz.get(gesetzesreferenzSchluessel(gesetzesreferenz))!;
    const block = entscheidePatchBlock(
      gesetzKonflikte.get(gesetzesreferenzSchluessel(gesetzesreferenz)),
      eintraege,
      eigenesGesetz,
      alleGesetze,
      new Set(betroffene.map(gesetzesreferenzSchluessel)),
    );
    if (block) gesetzKonflikte.set(gesetzesreferenzSchluessel(gesetzesreferenz), block);
    else gesetzKonflikte.delete(gesetzesreferenzSchluessel(gesetzesreferenz));
  }

  // "Neue Konflikte erkannt?" – bewusst ein reiner Zunahme-Vergleich (siehe
  // berechneNeueKonflikte in markierungskonflikteSpeicher.entscheidung.ts und
  // Absprache): eine reine Auflösung/Verschiebung bestehender Konflikte
  // (z.B. zielGesetzFehlt → zielNormUnpassend, weil das Zielgesetz jetzt existiert) soll das
  // Fenster NICHT erneut öffnen, nur das Hinzukommen einer bisher nicht
  // vorhandenen Konflikt-Signatur. Nur die in diesem Lauf tatsächlich
  // berührten Referenzen (betroffene ∪ referenzierend) können sich geändert
  // haben – alle anderen Blöcke sind unverändert roh übernommen und daher
  // für den Vergleich irrelevant.
  const neueKonflikte = berechneNeueKonflikte(
    new Set([...betroffene, ...referenzierend].map(gesetzesreferenzSchluessel)),
    vorherGesetzKonflikte,
    gesetzKonflikte,
  );

  await schreibePruefergebnis(token, stand, vollstaendig, vorgaenge, meldungEmpfangen);

  if (neueKonflikte) {
    // Bewusst NICHT awaited (siehe planeFensterOeffnen in
    // markierungskonflikteSpeicher.fensterOeffnen.ts) – würde sonst diesen Lauf
    // und damit die pruefungsKette selbst blockieren, bis das Fenster
    // geöffnet ist. `liesPruefungsKette` statt eines einmaligen Wertes: siehe
    // Kopfkommentar dort (lebende Referenz statt einmaligem Schnappschuss,
    // ohne zirkulären Modul-Import).
    planeFensterOeffnen(liesPruefungsKette);
  }
}

/** Liest sämtliche bekannten Markierungsquellen, bevor der Bestand verändert wird. */
async function sammleMarkierungsbefunde(
  referenzen: Gesetzesreferenz[],
  quellfehler: unknown[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Map<string, Awaited<ReturnType<typeof ladeEintraegeFuerPruefung>>>> {
  const eintraegeJeGesetz = new Map<
    string,
    Awaited<ReturnType<typeof ladeEintraegeFuerPruefung>>
  >();
  for (const ref of referenzen) {
    try {
      eintraegeJeGesetz.set(
        gesetzesreferenzSchluessel(ref),
        await ladeEintraegeFuerPruefung(ref, meldungEmpfangen),
      );
    } catch (fehler) {
      sammleQuellfehler(quellfehler, fehler);
    }
  }
  return eintraegeJeGesetz;
}

/**
 * Ermittelt alle Kurztitel (außer `betroffene` selbst), deren
 * Markierungs-XML mindestens einen Verweis auf ein betroffenes Gesetz
 * enthält (siehe liesVerweiszielGesetze in markierungs-xml). Kommentare und
 * unbekannte Metadaten zählen nicht als Verweise. Er findet nur Verweisziele
 * mit ausdrücklich genanntem Zielgesetz. Ein Verweisziel ohne Zielgesetz gilt
 * als Verweis auf das eigene Gesetz – sollte sich diese Kodierung je ändern
 * (z.B. Selbstverweise künftig mit ausdrücklichem Zielgesetz), muss dieser
 * Filter entsprechend angepasst werden, sonst werden betroffene
 * Selbstverweise hier stillschweigend NICHT gefunden.
 *
 * Bei vollstaendig === true (siehe pruefeAlleMarkierungen) entfällt dieser
 * Scan komplett: `betroffene` enthält dort bereits ausnahmslos jede
 * installierte UND jede über eine vorhandene Markierungs-Datei bekannte
 * Kurztitel – referenzierend könnte also ohnehin nie ein Gesetz
 * enthalten, das nicht schon in betroffene wäre.
 *
 * `nurEigeneMarkierungen` === true: der Norminhalt der betroffenen Gesetze
 * hat sich NICHT geändert (nur ihre eigenen Markierungen, siehe Aufrufer –
 * Datei-Import, Sammel-Konfliktaktionen im Markierungskonflikte-Fenster) –
 * Zielkonflikte ANDERER Gesetze auf `betroffene` können sich dadurch nicht
 * geändert haben, der Scan entfällt dann ebenso wie bei vollstaendig ===
 * true (dort aus einem anderen Grund).
 */
async function ermittleReferenzierende(
  betroffene: Gesetzesreferenz[],
  vollstaendig: boolean,
  nurEigeneMarkierungen: boolean,
  quellfehler: unknown[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Gesetzesreferenz[]> {
  const referenzierend: Gesetzesreferenz[] = [];
  if (vollstaendig || nurEigeneMarkierungen) return referenzierend;

  let referenzen: Gesetzesreferenz[];
  try {
    referenzen = await ermittleGesetzeMitMarkierungen();
  } catch (fehler) {
    sammleQuellfehler(quellfehler, fehler);
    return referenzierend;
  }
  for (const gesetzesreferenz of referenzen) {
    if (betroffene.some((g) => istGleichesGesetz(g, gesetzesreferenz))) continue;
    let roh: string | null;
    try {
      roh = await leseMarkierungsXMLFuerPruefung(gesetzesreferenz, meldungEmpfangen);
    } catch (fehler) {
      sammleQuellfehler(quellfehler, fehler);
      continue;
    }
    if (roh === null || roh.trim().length === 0) continue;
    const ziele = liesVerweiszielGesetze(roh);
    for (const kandidat of betroffene) {
      if (ziele.some((ziel) => istGleichesGesetz(ziel, kandidat))) {
        referenzierend.push(gesetzesreferenz);
        break;
      }
    }
  }
  return referenzierend;
}

/** Fehlgeschlagene Prüfungen bleiben sichtbar; Wiederholung hat eigene Auslöser. */
export function benoetigtVollpruefung(stand: GeladenerPruefstand, vollbedarf: boolean): boolean {
  return stand.pruefstatus !== 'fehlgeschlagen' && (stand.pruefstatus === null || vollbedarf);
}

/** Unter derselben Sperre wie der Aufrufer; kein eigener fachlicher Zustand. */
export async function istVollpruefungErforderlich(
  token: string,
  stand: GeladenerPruefstand,
): Promise<boolean> {
  return benoetigtVollpruefung(stand, (await erhalteVollbedarf(token, stand)).vollbedarf);
}

/** Gemeinsame Vollberechnung: Schreiben nur unter Konfliktsperre und nach Quellenabschluss. */
export async function fuehreVollpruefungAus(
  token: string,
  stand: GeladenerPruefstand,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  const { betroffene, ...quellen } = await liesQuellenOhneKonfliktsperre(
    token,
    stand,
    true,
    async (empfangen) => {
      const quellfehler: unknown[] = [];
      const alleGesetze = await ladeGesetzeMitBefunden(quellfehler, empfangen);
      const betroffene: Gesetzesreferenz[] = alleGesetze.map((g) => ({
        kurztitel: g.kurztitel,
        normgeber: g.normgeber,
      }));
      try {
        for (const gesetzesreferenz of await ermittleGesetzeMitMarkierungen()) {
          if (!betroffene.some((g) => istGleichesGesetz(g, gesetzesreferenz)))
            betroffene.push(gesetzesreferenz);
        }
      } catch (fehler) {
        sammleQuellfehler(quellfehler, fehler);
      }
      return {
        betroffene,
        ...(await liesPruefquellen(betroffene, true, false, quellfehler, empfangen)),
      };
    },
    meldungEmpfangen,
  );
  await wendePruefungAn(token, stand, betroffene, quellen, true, [], meldungEmpfangen);
}

/** Ein nachfolgender technischer Fehler darf die ursprüngliche Ursache nicht verdecken. */
async function versucheNativenPrueffehlerabschluss(token: string): Promise<void> {
  try {
    await pruefvorgangsAktion('fehler', token);
  } catch (abschlussfehler) {
    console.error('Nativer Prüfstand-Fehlerabschluss fehlgeschlagen:', abschlussfehler);
  }
}

export async function fuehrePruefungMitFehlerabschluss<T>(
  token: string,
  lauf: (stand: GeladenerPruefstand) => Promise<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  const stand = await ladePruefstandMitFehlerabschluss(token, meldungEmpfangen);
  try {
    return await lauf(stand);
  } catch (fehler) {
    if (fehler instanceof PruefstandAbschlussfehler) throw fehler.original;
    await versucheNativenPrueffehlerabschluss(token);
    // Ein Berechnungsfehler verändert nie die zuletzt gespeicherten Befunde.
    try {
      const letzterStand = await ladePruefstand(token, meldungEmpfangen);
      // Ein identischer Fehlerabschluss hat keinen neuen gespeicherten Stand.
      // Sein Änderungsbroadcast würde den Anzeige-Listener erneut auslösen.
      if (letzterStand.pruefstatus !== 'fehlgeschlagen')
        await schreibeGesetzKonflikte(
          letzterStand.gesetzKonflikte,
          token,
          {
            pruefstatus: 'fehlgeschlagen',
            erweiterungen: letzterStand.erweiterungen,
          },
          meldungEmpfangen,
        );
    } catch (statusfehler) {
      console.error('Fehlerstatus konnte nicht gespeichert werden:', statusfehler);
    }
    meldePruefungsfehler(fehler, meldungEmpfangen);
    throw fehler;
  }
}

export async function ladePruefstandMitFehlerabschluss(
  token: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GeladenerPruefstand> {
  try {
    return await ladePruefstand(token, meldungEmpfangen);
  } catch (fehler) {
    await versucheNativenPrueffehlerabschluss(token);
    meldePruefungsfehler(fehler, meldungEmpfangen);
    throw fehler;
  }
}

/** Fehler beim Laden/Berechnen sind kein Nachweis eines fehlgeschlagenen Schreibens. */
export function meldePruefungsfehler(
  fehler: unknown,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  const ursachen: unknown[] = [];
  sammleQuellfehler(ursachen, fehler);
  const details = [
    ...new Set(
      ursachen.map((ursache) => (ursache instanceof Error ? ursache.message : String(ursache))),
    ),
  ].join(' ');
  meldePersistenzBefund(
    {
      typ: 'fehler',
      art: 'fehler',
      anlass: 'pruefabschluss',
      aenderungsstand: 'keine',
      text: `Die Prüfung der Markierungskonflikte konnte nicht abgeschlossen werden. ${details} Vorhandene Befunde können überholt sein. Bitte die betroffenen Dateien prüfen und anschließend im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.`,
    },
    meldungEmpfangen,
  );
}
