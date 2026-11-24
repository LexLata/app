// Verifiziert bekannte Markierungskonflikte über die gemeinsame Prüfqueue und live geladene Quellen.

import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { ladeEintraegeFuerPruefung } from '@/lib/markierungen/eintrag/eintrag.index';
import type {
  KonfliktEintrag,
  MarkierungsEintrag,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  berechneZielKonflikte,
  bestimmeIdentifizierendeFelder,
  identitaetsSchluessel,
  pruefeEigenenKonflikt,
  pruefeNichtamtlicheTitelXmlFehlt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  ladePruefstand,
  schreibeGesetzKonflikte,
  type GeladenerPruefstand,
} from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import { istVollpruefungErforderlich } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefdurchlauf';
import { reiheInPruefungsKetteEin } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefkette';
import { pruefeErforderlicheVollpruefung } from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefsteuerung';
import type {
  GeparsterKonfliktEintrag,
  GespeicherteGesetzKonflikte,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { erstelleGespeicherteGesetzKonflikte } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  existierenNichtamtlicheTitelFuerPruefung,
  ladeGesetzeFuerPruefung,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { gesetzquellenDerMarkierungen } from './konfliktspeicher/markierungskonflikteQuellen';

/**
 * Prüft NUR, ob die BEREITS BEKANNTEN Konflikte aus markierungskonflikte.xml
 * noch bestehen – im Unterschied zu pruefeMarkierungenSelektiv() (siehe
 * markierungskonflikteSpeicher.ts) KEIN Entdeckungs-Check (keine vollständige
 * Neuprüfung aller Markierungen eines Gesetzes, kein Rohtext-Scan anderer
 * Markierungs-XMLs auf neue Verweise). Quelländerungen an Gesetzen und
 * Markierungen melden ihren dauerhaften Prüfbedarf bereits vor dem Schreiben.
 * Die Anzeige verifiziert bekannte Befunde zusätzlich vor ihrer Darstellung.
 * Markierungsbestände werden dabei strikt lesend geladen: beschädigte Quellen
 * führen zu einem benannten Prüffehler; ihre Archivierung erfolgt außerhalb
 * der Konfliktsperre.
 *
 * Lädt nur Ausgangsgesetze bekannter Konflikte und deren noch betroffene
 * Zielgesetze. Gibt die geladenen Gesetze zurück (leeres Array ohne bekannte
 * Konflikte). Der Anzeigelader verwendet zusätzlich die einmal gelesenen
 * Markierungsbestände aus verifiziereStand für den Aufbau der Anzeige.
 *
 * Läuft über dieselbe pruefungsKette wie pruefeMarkierungenSelektiv (siehe
 * reiheInPruefungsKetteEin dort), damit sich beide nie überlappend auf
 * markierungskonflikte.xml auswirken. Quellfehler durchlaufen den gemeinsamen
 * Fehlerabschluss und den begrenzten Schutzpfad. Nach erfolgreicher Heilung
 * wird außerhalb des vorherigen Auftrags erneut frisch geladen; ungelöste
 * Fehler werden an den Aufrufer weitergegeben.
 */
export async function verifiziereBekannteKonflikte(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung[]> {
  const ergebnis = await reiheInPruefungsKetteEin(
    (token, empfangen) => fuehreVerifikationAus(token, empfangen),
    true,
    'bei-vollbedarf',
    'automatisch',
    true,
    meldungEmpfangen,
  );
  if (ergebnis) return ergebnis;
  await pruefeErforderlicheVollpruefung(meldungEmpfangen);
  const frisch = await reiheInPruefungsKetteEin(
    (token, empfangen) => fuehreVerifikationAus(token, empfangen),
    true,
    'bei-vollbedarf',
    'automatisch',
    true,
    meldungEmpfangen,
  );
  if (!frisch) throw new Error('Der Prüfstand konnte nicht vollständig aufgebaut werden.');
  return frisch;
}

async function fuehreVerifikationAus(
  token: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung[] | undefined> {
  const stand = await ladePruefstand(token, meldungEmpfangen);
  if (await istVollpruefungErforderlich(token, stand)) return undefined;
  return (await verifiziereStand(stand, token, meldungEmpfangen)).gesetze;
}

type GeladeneKonfliktquellen = {
  gesetze: GesetzDarstellung[];
  eintraegeJeGesetz: ReadonlyMap<string, MarkierungsEintrag[]>;
};

/** Liest jeden benötigten Markierungsbestand einmal und ergänzt nur bekannte Zielkonfliktquellen. */
async function ladeKonfliktquellen(
  gesetzKonflikte: ReadonlyMap<string, GespeicherteGesetzKonflikte>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GeladeneKonfliktquellen> {
  const eintraegeJeGesetz = new Map<string, MarkierungsEintrag[]>();
  if (gesetzKonflikte.size === 0) return { gesetze: [], eintraegeJeGesetz };
  const ausgaenge = [...gesetzKonflikte.values()].map((gespeichert) => gespeichert.gesetz);
  const alleGesetze = await ladeGesetzeFuerPruefung(ausgaenge, meldungEmpfangen);
  const ausgangsschluessel = new Set(ausgaenge.map(gesetzesreferenzSchluessel));
  const zielreferenzen = new Map<string, Gesetzesreferenz>();
  for (const gespeichert of gesetzKonflikte.values()) {
    const referenz = gespeichert.gesetz;
    if (gespeichert.fehlendesGesetz) continue;
    const eintraege = await ladeEintraegeFuerPruefung(referenz, meldungEmpfangen);
    eintraegeJeGesetz.set(gesetzesreferenzSchluessel(referenz), eintraege);
    if (!alleGesetze.some((g) => istGleichesGesetz(g, referenz))) continue;
    for (const ziel of zielquellenBekannterKonflikte(referenz, gespeichert, eintraege)) {
      const schluessel = gesetzesreferenzSchluessel(ziel);
      if (!ausgangsschluessel.has(schluessel)) zielreferenzen.set(schluessel, ziel);
    }
  }
  alleGesetze.push(
    ...(await ladeGesetzeFuerPruefung([...zielreferenzen.values()], meldungEmpfangen)),
  );
  return { gesetze: alleGesetze, eintraegeJeGesetz };
}

/** Neue oder bereits aufgelöste Ziele gehören nicht zur Anzeigeverifikation. */
function zielquellenBekannterKonflikte(
  referenz: Gesetzesreferenz,
  gespeichert: GespeicherteGesetzKonflikte,
  eintraege: readonly MarkierungsEintrag[],
): Gesetzesreferenz[] {
  const liveNachSchluessel = new Map(eintraege.map((e) => [identitaetsSchluessel(e), e]));
  return gespeichert.eintraege.flatMap((bekannt) => {
    const live = liveNachSchluessel.get(bekannt.schluessel);
    if (!live) return [];
    const bekannteZiele = new Set(
      bekannt.zielKonflikte.map((z) => gesetzesreferenzSchluessel(z.gesetz)),
    );
    return gesetzquellenDerMarkierungen(referenz, [live], bekannteZiele);
  });
}

export async function verifiziereStand(
  stand: GeladenerPruefstand,
  token: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GeladeneKonfliktquellen> {
  const gesetzKonflikte = stand.gesetzKonflikte;
  const { gesetze: alleGesetze, eintraegeJeGesetz } = await ladeKonfliktquellen(
    gesetzKonflikte,
    meldungEmpfangen,
  );
  if (gesetzKonflikte.size === 0) return { gesetze: alleGesetze, eintraegeJeGesetz };
  // Nur für nichtamtlicheTitelXmlFehlt benötigt (siehe markierungskonfliktPruefung.ts) – erkennt
  // auch die AUFLÖSUNG des Konflikts nichtamtlicheTitelXmlFehlt (nichtamtlicheTitel-XML wurde
  // zwischenzeitlich nachgeliefert, z.B. durch Resource-Sync), nicht nur
  // dessen Fortbestehen. Auf die Referenzen aus `gesetzKonflikte` eingeschränkt, da
  // nur für diese unten konsultiert wird (siehe Nutzung weiter unten).
  const nichtamtlicheTitelVorhanden = await existierenNichtamtlicheTitelFuerPruefung(
    [...gesetzKonflikte.values()].map((gespeichert) => gespeichert.gesetz),
    meldungEmpfangen,
  );
  let veraendert = false;

  for (const gespeichert of [...gesetzKonflikte.values()]) {
    const geaendert = verifiziereEinenBlock(
      gespeichert,
      alleGesetze,
      nichtamtlicheTitelVorhanden,
      gesetzKonflikte,
      eintraegeJeGesetz,
    );
    if (geaendert) veraendert = true;
  }

  if (veraendert)
    await schreibeGesetzKonflikte(
      gesetzKonflikte,
      token,
      {
        pruefstatus: stand.pruefstatus ?? 'ausstehend',
        erweiterungen: stand.erweiterungen,
      },
      ...(meldungEmpfangen ? [meldungEmpfangen] : []),
    );
  return { gesetze: alleGesetze, eintraegeJeGesetz };
}

/**
 * Verifiziert die gespeicherten Konflikte GENAU EINES Gesetzes (Kern der
 * for-Schleife in fuehreVerifikationAus oben) und mutiert `gesetzKonflikte`
 * entsprechend (set/delete) – Rückgabe: hat sich dieser Block gegenüber
 * `gespeichert` geändert? Verwendet denselben frisch geladenen Markierungsbestand
 * wie der anschließende Anzeigeaufbau; kein erneutes Lesen von Quellen.
 */
function verifiziereEinenBlock(
  gespeichert: GespeicherteGesetzKonflikte,
  alleGesetze: GesetzDarstellung[],
  nichtamtlicheTitelVorhanden: Set<string>,
  gesetzKonflikte: Map<string, GespeicherteGesetzKonflikte>,
  eintraegeJeGesetz: ReadonlyMap<string, MarkierungsEintrag[]>,
): boolean {
  const gesetzesreferenz = gespeichert.gesetz;
  // gesetzFehlt (ganzes Gesetz fehlt): nur Existenz neu prüfen. Ist das Gesetz
  // wieder vorhanden, wird der veraltete gesetzFehlt-Block hier nur ENTFERNT –
  // eine etwaige vollständige Neuprüfung (gesetzFehlt → ggf. wieder eigene und Zielkonflikte) ist
  // bereits über den speichereGesetz()-Aufruf abgedeckt, der dieses Gesetz
  // eingespielt hat (siehe nachSpeichernPruefen), läuft also nicht über
  // diesen reinen Auflösungs-Check. Exklusiv (ein fehlendesGesetz-Block
  // enthält NUR diesen Konflikt) – anders als früher NICHT
  // mehr über die Abwesenheit von <markierung> erkannt, da ein reiner
  // nichtamtlicheTitelXmlFehlt-Block (siehe unten) das ebenfalls nicht enthält.
  if (gespeichert.fehlendesGesetz) {
    if (!alleGesetze.some((g) => istGleichesGesetz(g, gesetzesreferenz))) return false;
    gesetzKonflikte.delete(gesetzesreferenzSchluessel(gesetzesreferenz));
    return true;
  }

  const eigenesGesetz = alleGesetze.find((g) => istGleichesGesetz(g, gesetzesreferenz));
  if (!eigenesGesetz) return false; // kann laut obigem Zweig hier nicht vorkommen

  const liveEintraege = eintraegeJeGesetz.get(gesetzesreferenzSchluessel(gesetzesreferenz)) ?? [];
  const bekannt = gespeichert.eintraege;
  const { neueEintraege, veraendert } = verifiziereKonfliktEintraege(
    bekannt,
    liveEintraege,
    eigenesGesetz,
    alleGesetze,
    gesetzesreferenz,
    nichtamtlicheTitelVorhanden,
  );

  // nichtamtlicheTitelXmlFehlt (siehe markierungskonfliktPruefung.ts) auf Gesetz-Ebene neu
  // verifizieren – unabhängig davon, ob überhaupt <markierung>-Blöcke
  // vorhanden waren (ein Gesetz kann AUSSCHLIESSLICH nichtamtlicheTitelXmlFehlt haben).
  const nichtamtlicheTitelXmlFehlt = pruefeNichtamtlicheTitelXmlFehlt(
    liveEintraege,
    gesetzesreferenz,
    nichtamtlicheTitelVorhanden,
  );
  const titelStatusGeaendert =
    nichtamtlicheTitelXmlFehlt !== gespeichert.nichtamtlicheTitelXmlFehlt;

  if (neueEintraege.length === 0 && !nichtamtlicheTitelXmlFehlt) {
    gesetzKonflikte.delete(gesetzesreferenzSchluessel(gesetzesreferenz));
  } else {
    gesetzKonflikte.set(
      gesetzesreferenzSchluessel(gesetzesreferenz),
      erstelleGespeicherteGesetzKonflikte({
        gesetz: gesetzesreferenz,
        nichtamtlicheTitelXmlFehlt: nichtamtlicheTitelXmlFehlt || undefined,
        eintraege: neueEintraege,
      }),
    );
  }

  return veraendert || titelStatusGeaendert;
}

/**
 * Verifiziert die BEREITS BEKANNTEN Konflikteinträge EINES Gesetzes (`bekannt`,
 * aus den gespeicherten Konflikten) gegen die live geladenen Markierungen
 * (`liveEintraege`) – reine Kernlogik von fuehreVerifikationAus oben, ohne
 * jeden Datei-/AppData-Zugriff (macht sie ohne vi.mock direkt testbar, siehe
 * Testkonvention). Prüft NUR Auflösung/Änderung bestehender Einträge, KEINE
 * Entdeckung neuer Konflikte (siehe Kopfkommentar zu
 * verifiziereBekannteKonflikte). `gesetzesreferenz` wird ausschließlich für den
 * nichtamtlicheTitelXmlFehlt-Bezug (`nichtamtlicheTitelVorhanden.has(gesetzesreferenzSchluessel(gesetzesreferenz))`) gebraucht.
 */
export function verifiziereKonfliktEintraege(
  bekannt: readonly GeparsterKonfliktEintrag[],
  liveEintraege: MarkierungsEintrag[],
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  gesetzesreferenz: Gesetzesreferenz,
  nichtamtlicheTitelVorhanden: Set<string>,
): { neueEintraege: KonfliktEintrag[]; veraendert: boolean } {
  const liveNachSchluessel = new Map(liveEintraege.map((e) => [identitaetsSchluessel(e), e]));
  let veraendert = false;
  const neueEintraege: KonfliktEintrag[] = [];

  for (const alt of bekannt) {
    const ergebnis = verifiziereEinenKonfliktEintrag(
      alt,
      liveNachSchluessel,
      eigenesGesetz,
      alleGesetze,
      gesetzesreferenz,
      nichtamtlicheTitelVorhanden,
    );
    if (ergebnis.veraendert) veraendert = true;
    if (ergebnis.eintrag) neueEintraege.push(ergebnis.eintrag);
  }

  return { neueEintraege, veraendert };
}

/**
 * Verifiziert GENAU EINEN bekannten Konflikteintrag (`alt`) gegen die live
 * geladene Markierung – Kern der for-Schleife in verifiziereKonfliktEintraege
 * oben. `eintrag: undefined` bedeutet vollständig aufgelöst (Markierung
 * gelöscht ODER kein Konflikt mehr).
 */
function verifiziereEinenKonfliktEintrag(
  alt: GeparsterKonfliktEintrag,
  liveNachSchluessel: Map<string, MarkierungsEintrag>,
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  gesetzesreferenz: Gesetzesreferenz,
  nichtamtlicheTitelVorhanden: Set<string>,
): { eintrag: KonfliktEintrag | undefined; veraendert: boolean } {
  const live = liveNachSchluessel.get(alt.schluessel);
  if (!live) {
    // Markierung selbst wurde gelöscht – ihr Konflikt ist damit hinfällig.
    return { eintrag: undefined, veraendert: true };
  }

  // Betrifft nichtamtlicheTitelXmlFehlt (siehe pruefeMarkierung in markierungskonfliktPruefung.ts):
  // fehlt die nichtamtlicheTitel-XML weiterhin, bleibt der generische
  // Textvergleich (eigenerKonflikt) für DIESE Markierung irreführend und wird
  // übersprungen – der Konflikt selbst wird stattdessen einmal auf
  // Gesetz-Ebene geführt (nichtamtlicheTitelXmlFehlt, siehe Aufrufer).
  const nichtamtlicherTitelBetroffen =
    live.bezug.textstelle?.pfad.bereich === 'nichtamtlicherTitel' &&
    !nichtamtlicheTitelVorhanden.has(gesetzesreferenzSchluessel(gesetzesreferenz));
  const eigenerKonflikt =
    !nichtamtlicherTitelBetroffen && alt.eigenerKonflikt
      ? pruefeEigenenKonflikt(live, eigenesGesetz)
      : undefined;
  // Bewusst nur gegen die BEREITS bekannten Zielgesetze geprüft (siehe
  // Funktionskommentar zu verifiziereKonfliktEintraege) – kein Scan nach
  // ZUSÄTZLICHEN Zielen.
  const bekannteZielgesetze = new Set(
    alt.zielKonflikte.map((z) => gesetzesreferenzSchluessel(z.gesetz)),
  );
  const zielKonflikte = berechneZielKonflikte(
    live,
    eigenesGesetz,
    alleGesetze,
    bekannteZielgesetze,
  );

  const unveraendert =
    eigenerKonflikt === alt.eigenerKonflikt &&
    zielKonflikte.length === alt.zielKonflikte.length &&
    zielKonflikte.every((z) =>
      alt.zielKonflikte.some((a) => istGleichesGesetz(a.gesetz, z.gesetz) && a.typ === z.typ),
    );

  if (!eigenerKonflikt && zielKonflikte.length === 0) {
    return { eintrag: undefined, veraendert: !unveraendert }; // vollständig aufgelöst
  }

  return {
    eintrag: {
      eigenerKonflikt: eigenerKonflikt || undefined,
      zielKonflikte,
      ausgangsstelle: live.ausgangsstelle,
      markierungstyp: live.typ,
      ...bestimmeIdentifizierendeFelder(live),
    },
    veraendert: !unveraendert,
  };
}
