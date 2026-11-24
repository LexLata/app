// verweismarkierungAktionen.zitatAufloesung.ts
//
// Aus speichereVerweismarkierung (verweismarkierungAktionen.ts) ausgelagert, um
// dessen Cognitive Complexity zu senken (siehe Kopfkommentar dort): dieser
// Teil löst den geparsten Zitat-Text (RohNormZitat[] aus zitatParser.ts) zu
// konkreten Zielnormen auf – zwei fachlich unabhängige Schritte, die schon
// vor der Auslagerung sequenziell, aber unverschachtelt liefen:
//   1. loeseAmbiguitaeten: Kommagrenzen-Mehrdeutigkeiten auflösen
//      (siehe zitatParser.ts: AmbiguerPunkt).
//   2. loeseVerweiszieleAuf: jedes verbleibende Zitat einzeln zu einer
//      Verweisziel oder einem ZitatFehler auflösen.
// Domain-Funktionen (verweisZuXmlId, pruefeZusatzangabe, …) werden wie
// bei versucheAktualisierung/versucheNeuImport explizit als Parameter
// hereingereicht statt selbst importiert – der Aufrufer (speichereVerweismarkierung)
// lädt sie weiterhin dynamisch, hier bleibt reine, direkt testbare Logik
// ohne eigene Modul-Abhängigkeiten.

import type { Elementstand } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { UeberschriftDarstellung } from '@/lib/domain/gesetzTypes';
import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import {
  gesetzesreferenzSchluessel,
  istGleichesGesetz,
  waehleGesetzeskandidat,
} from '@/lib/domain/gesetzesreferenz';
import type { AmbiguerPunkt, RohNormZitat, ZusatzArt } from '@/lib/markierungen/zitat/zitat.index';
import type { ZusatzKontext } from '@/lib/domain/norm/norm.index';

/** Eine präzise Fehlermeldung beim Auflösen eines Zitats (siehe Absprache:
 *  "wenn es mehrere Fehler gibt, kommen mehrere Fehlermeldungen"). Aus
 *  VerweismarkierungFormular.tsx hierher verschoben: der Typ wird von der
 *  Auflösung SELBST erzeugt (loeseVerweiszieleAuf unten), das Formular
 *  importiert ihn nur zur Anzeige – die umgekehrte Richtung hätte
 *  markierungen von einer UI-Komponente abhängig gemacht. `gesetz` nur
 *  bei 'gesetz'/'norm' gesetzt (die von importVersuchen tatsächlich
 *  anzusteuernde Gesetzesreferenz). Fehlende oder mehrdeutige Auswahl hat
 *  keine bestimmte Referenz und keine Import-Aktion; `grund` unterscheidet
 *  diese Gesetzesfehler. 'sonst' hat ebenfalls keine Import-Aktion. */
export interface ZitatFehler {
  art: 'gesetz' | 'norm' | 'sonst';
  grund?: 'fehlend' | 'mehrdeutig';
  text: string;
  gesetz?: Gesetzesreferenz;
}

/** Beiden Auflösungsphasen (Ambiguitäten UND Zielnormen) gemeinsame
 *  Grundfunktionen: eine Norm anhand ihrer Bezeichnung im Zielgesetz finden. */
interface NormNachschlagenFns {
  verweisZuXmlId: (gesetz: GesetzDarstellung, bezeichnung: string) => string | null;
  gesetzNormen: (gesetz: GesetzDarstellung) => NormDarstellung[];
}

/** Explizit übergebene Domain-Funktionen für die Ambiguitäten-Auflösung
 *  (siehe Dateikopf: Parameter-Injektion statt eigener dynamischer Importe). */
export interface AmbiguitaetenDomainFns extends NormNachschlagenFns {
  pruefeZusatzangabe: (
    norm: NormDarstellung,
    art: ZusatzArt,
    wert: string,
    kontext?: ZusatzKontext,
  ) => boolean;
  pruefeZusatzangabeMitKette: (
    norm: NormDarstellung,
    art: ZusatzArt,
    wert: string,
    kontext: ZusatzKontext | undefined,
    kette: Array<{ art: ZusatzArt; wert: string }>,
  ) => boolean;
}

/** Bereits bestimmte Ziele bleiben für denselben unveränderten Zitattext bindend. */
export interface ZitatZielAuswahl {
  kandidaten: Gesetzesreferenz[];
  gewaehlt?: Map<string, Gesetzesreferenz>;
}

export interface ZielgesetzAufloesung {
  referenz: Gesetzesreferenz | undefined;
  eingabe: string;
  gefunden: GesetzDarstellung | undefined;
  fehler?: 'fehlend' | 'mehrdeutig';
}

/** Löst auf, WELCHES Gesetz für einen RohNormZitat-Kandidaten gilt (eigenes
 *  vorangegangenes gesetzRoh oder – als Fallback – das Ausgangsgesetz). */
export function loeseZielgesetzAuf(
  zitat: Pick<RohNormZitat, 'gesetzRoh'> & Partial<Pick<RohNormZitat, 'textStart'>>,
  alle: GesetzDarstellung[],
  ausgangsgesetz: Gesetzesreferenz,
  auswahl?: ZitatZielAuswahl,
): ZielgesetzAufloesung {
  const eingabe = (zitat.gesetzRoh ?? ausgangsgesetz.kurztitel).trim();
  const schluessel = zitat.textStart === undefined ? undefined : String(zitat.textStart);
  const schonGewaehlt = schluessel === undefined ? undefined : auswahl?.gewaehlt?.get(schluessel);
  const kandidat =
    zitat.gesetzRoh === undefined || schonGewaehlt
      ? undefined
      : waehleGesetzeskandidat(eingabe, ausgangsgesetz.normgeber, auswahl?.kandidaten ?? alle);
  const ziel =
    schonGewaehlt ?? (zitat.gesetzRoh === undefined ? ausgangsgesetz : kandidat?.referenz);
  if (!ziel) {
    return {
      eingabe,
      gefunden: undefined,
      referenz: undefined,
      fehler: kandidat?.mehrdeutig ? 'mehrdeutig' : 'fehlend',
    };
  }
  const gefunden = alle.find((g) => istGleichesGesetz(g, ziel));
  const referenz = {
    kurztitel: ziel.kurztitel,
    normgeber: ziel.normgeber,
  };
  // Eine implizite Zuordnung zum Ausgangsgesetz ist noch kein bestätigtes
  // Ziel: die Existenzprüfung kann stattdessen die spätere Gesetzesangabe wählen.
  if (schluessel !== undefined && (zitat.gesetzRoh !== undefined || schonGewaehlt)) {
    auswahl?.gewaehlt?.set(schluessel, referenz);
  }
  return { eingabe, gefunden, referenz };
}

/** Prüft die vom Parser geordneten Normkandidaten ausschließlich auf
 * vollständige Treffer. Die erfolgreiche Norm bestimmt später die Speicherform. */
function findeZitatNorm(
  zitat: RohNormZitat,
  gesetz: GesetzDarstellung,
  domainFns: NormNachschlagenFns,
): NormDarstellung | undefined {
  for (const kandidat of zitat.normKandidaten ?? [zitat]) {
    const xmlId = domainFns.verweisZuXmlId(gesetz, bezeichnungRohzitat(kandidat));
    const norm = xmlId ? domainFns.gesetzNormen(gesetz).find((n) => n.xmlId === xmlId) : undefined;
    if (norm) return norm;
  }
  return undefined;
}

/** Ausgangsgesetz hat Vorrang. Die spätere Gesetzesangabe wird nur bei
 * fehlender Norm und ohne eigene Gesetzesangabe geprüft; sie muss selbst
 * eindeutig ausgewählt sein und einen tatsächlichen Normtreffer liefern. */
function pruefeZitatNorm(
  zitat: RohNormZitat,
  gesetz: ZielgesetzAufloesung,
  alle: GesetzDarstellung[],
  ausgangsgesetz: Gesetzesreferenz,
  domainFns: NormNachschlagenFns,
  auswahl?: ZitatZielAuswahl,
): { gesetz: ZielgesetzAufloesung; norm?: NormDarstellung } {
  if (!gesetz.gefunden) return { gesetz };
  const norm = findeZitatNorm(zitat, gesetz.gefunden, domainFns);
  if (
    norm ||
    zitat.gesetzRoh !== undefined ||
    !zitat.spaetereGesetzesangabe ||
    (gesetz.referenz && !istGleichesGesetz(gesetz.referenz, ausgangsgesetz))
  ) {
    return { gesetz, norm };
  }
  const spaeteresGesetz = loeseZielgesetzAuf(
    zitat.spaetereGesetzesangabe,
    alle,
    ausgangsgesetz,
    auswahl,
  );
  const spaetereNorm = spaeteresGesetz.gefunden
    ? findeZitatNorm(zitat, spaeteresGesetz.gefunden, domainFns)
    : undefined;
  if (!spaetereNorm) return { gesetz };
  if (spaeteresGesetz.referenz) {
    auswahl?.gewaehlt?.set(String(zitat.textStart), spaeteresGesetz.referenz);
  }
  return { gesetz: spaeteresGesetz, norm: spaetereNorm };
}

/** Prüft, ob der VORHERIGE Kandidat den in `amb` beschriebenen Zusatz
 *  (Absatz/Satz/Nummer/…) tatsächlich hat – entscheidet, ob der mehrdeutige
 *  nachfolgende Kandidat verworfen (Zusatz vorhanden) oder als eigenständige
 *  Norm behandelt wird (siehe loeseAmbiguitaeten). */
function pruefeAmbiguitaet(
  norm: NormDarstellung,
  amb: AmbiguerPunkt,
  domainFns: Pick<AmbiguitaetenDomainFns, 'pruefeZusatzangabe' | 'pruefeZusatzangabeMitKette'>,
): boolean {
  const ambKontext = {
    absatz: amb.absatzKontext,
    unterabsatz: amb.unterabsatzKontext,
    satz: amb.satzKontext,
    nummer: amb.nummerKontext,
  };
  if (amb.verfeinerung && amb.verfeinerung.length > 0) {
    return domainFns.pruefeZusatzangabeMitKette(
      norm,
      amb.art,
      amb.wert,
      ambKontext,
      amb.verfeinerung,
    );
  }
  return domainFns.pruefeZusatzangabe(norm, amb.art, amb.wert, ambKontext);
}

/**
 * Mehrdeutige Kommagrenzen auflösen (siehe zitatParser.ts: AmbiguerPunkt):
 * ist das Zielgesetz des fachlichen Ankers (noch) nicht verfügbar, kann
 * nicht geprüft werden – der Kandidat bleibt dann (Default) eine
 * eigenständige Norm. Bei positiver Prüfung wird der Kandidat verworfen
 * und sein Textbereich dem unmittelbar vorherigen überlebenden Eintrag zugeschlagen
 * (lückenlose Kachelung bleibt dadurch erhalten). Mutiert `roh` in-place
 * (textEnde der übernehmenden Kandidaten) – wie vor der Auslagerung.
 */
export function loeseAmbiguitaeten(
  roh: RohNormZitat[],
  ambiguitaeten: AmbiguerPunkt[],
  alle: GesetzDarstellung[],
  ausgangsgesetz: Gesetzesreferenz,
  domainFns: AmbiguitaetenDomainFns,
  auswahl?: ZitatZielAuswahl,
): RohNormZitat[] {
  const zuEntfernen = new Set<number>();
  for (const amb of ambiguitaeten) {
    // roh[amb.vorherigerIndex] beweisbar sicher: vorherigerIndex/index
    // stammen aus dem zitatParser und referenzieren immer eine gültige
    // Position im selben roh-Array (siehe zitatParser.ts).
    const vorherigerRoh = roh[amb.vorherigerIndex]!;
    const gesetz = loeseZielgesetzAuf(vorherigerRoh, alle, ausgangsgesetz, auswahl);
    const { norm } = pruefeZitatNorm(
      vorherigerRoh,
      gesetz,
      alle,
      ausgangsgesetz,
      domainFns,
      auswahl,
    );
    if (!norm) continue;
    if (pruefeAmbiguitaet(norm, amb, domainFns)) zuEntfernen.add(amb.index);
  }
  if (zuEntfernen.size === 0) return roh;
  const ergebnis: RohNormZitat[] = [];
  for (const [index, zitat] of roh.entries()) {
    if (zuEntfernen.has(index)) {
      // Jeder verworfene Eintrag hat einen früheren fachlichen Anker;
      // daher überlebt mindestens der erste Eintrag (vorherigerIndex < index).
      ergebnis.at(-1)!.textEnde = zitat.textEnde;
    } else {
      ergebnis.push(zitat);
    }
  }
  return ergebnis;
}

/** Explizit übergebene Domain-Funktionen für die Zielnormen-Auflösung. */
export interface VerweiszieleDomainFns extends NormNachschlagenFns {
  vollstaendigeBezeichnung: (gesetz: GesetzDarstellung, xmlId: string) => string | null;
  berechneElementstand: (element: NormDarstellung | UeberschriftDarstellung) => Elementstand;
}

/** Verbindet nur die vom Zitatparser ermittelten Bestandteile der Eingabe. */
function bezeichnungRohzitat(zitat: Pick<RohNormZitat, 'normzahlRoh' | 'praefix'>): string {
  if (!zitat.praefix?.length) return zitat.normzahlRoh;
  const zahlen = zitat.normzahlRoh.trim().split(/\s+/);
  const symbole = [...zitat.praefix];
  if (zahlen.length === 2 && symbole.length === 1 && /^art(?:ikel)?\.?$/i.test(symbole[0] ?? ''))
    symbole.push('§');
  return zahlen.map((zahl, i) => (symbole[i] ? `${symbole[i]} ${zahl}` : zahl)).join(' ');
}

/** Verfügbare Normen speichern ihre volle Bezeichnung aus dem Gesetz. */
function bezeichnungOhneElementstand(
  zitat: RohNormZitat,
  gesetz: GesetzDarstellung | undefined,
  domainFns: VerweiszieleDomainFns,
): string {
  const norm = gesetz && findeZitatNorm(zitat, gesetz, domainFns);
  return norm && gesetz
    ? (domainFns.vollstaendigeBezeichnung(gesetz, norm.xmlId) ?? bezeichnungRohzitat(zitat))
    : bezeichnungRohzitat(zitat);
}

/** Baut die "Gesetz existiert nicht"/"konnte nicht importiert werden"-
 *  Fehlermeldung für ein noch nicht gefundenes Zielgesetz. `fehlgeschlageneImports`
 *  wird NUR gelesen (siehe speichereVerweismarkierung-Kopfkommentar). */
function baueGesetzNichtGefundenFehler(
  zielgesetz: Gesetzesreferenz,
  fehlgeschlageneImports: ReadonlyMap<string, string | undefined>,
): ZitatFehler {
  const zielKurztitelEingabe = zielgesetz.kurztitel;
  const eingabeKlein = gesetzesreferenzSchluessel(zielgesetz);
  const konkreterFehler = fehlgeschlageneImports.get(eingabeKlein);
  // Ist ein konkreter Fehlertext bekannt (z.B. FEHLERTEXT_KEINE_VERBINDUNG aus
  // internetVerbindung.ts), wird dieser bevorzugt gezeigt – er ist
  // aussagekräftiger als die generische "konnte nicht importiert werden"-
  // Meldung. Letztere bleibt Fallback für den Fall, dass ein Import-Versuch
  // ohne gesetztes ergebnis.fehler gescheitert ist.
  const text =
    konkreterFehler ??
    (fehlgeschlageneImports.has(eingabeKlein)
      ? `${zielKurztitelEingabe} konnte nicht importiert werden.`
      : `${zielKurztitelEingabe} ist nicht auf dem Gerät.`);
  return { art: 'gesetz', text, gesetz: zielgesetz };
}

/** Fehlende Auswahl hat keine importierbare Referenz und darf nicht geraten werden. */
function baueGesetzAuswahlFehler(
  eingabe: string | undefined,
  grund: ZielgesetzAufloesung['fehler'],
): ZitatFehler {
  return {
    art: 'gesetz',
    grund,
    text:
      grund === 'mehrdeutig'
        ? `Für „${eingabe}“ kommen mehrere gleichrangige Gesetze infrage.`
        : `Für „${eingabe}“ konnte kein passendes Gesetz ermittelt werden.`,
  };
}

/** Löst EIN Zitat auf – Gegenstück je Schleifendurchlauf der früheren
 *  Schleife in speichereVerweismarkierung. `gemeldeteKurztitel` (normalisierte Referenzschlüssel) verhindert
 *  doppelte "Gesetz fehlt"-Meldungen, wenn dasselbe unbekannte Kurztitel
 *  mehrfach im selben Zitat-Text vorkommt (z.B. "434, 90 ZVG"). */
function loeseEinzelnesZitatAuf(
  zitat: RohNormZitat,
  alle: GesetzDarstellung[],
  ausgangsgesetz: Gesetzesreferenz,
  ohneElementstand: boolean,
  fehlgeschlageneImports: ReadonlyMap<string, string | undefined>,
  gemeldeteKurztitel: ReadonlySet<string>,
  domainFns: VerweiszieleDomainFns,
  auswahl?: ZitatZielAuswahl,
): { fehler?: ZitatFehler; zielnorm?: Verweisziel } {
  if (zitat.ohneZiel) return {};

  const {
    gefunden: zielgesetzGefunden,
    referenz: zielgesetz,
    fehler: gesetzFehler,
  } = loeseZielgesetzAuf(zitat, alle, ausgangsgesetz, auswahl);
  if (!zielgesetz) return { fehler: baueGesetzAuswahlFehler(zitat.gesetzRoh, gesetzFehler) };
  // Übernimmt die kanonische Schreibweise aus der Gesetz-Datei (z.B. "StGB"
  // statt eingegebenem "stgb"). Ist das Gesetz nicht gefunden (z.B. noch
  // nicht importiert), bleibt die Roheingabe erhalten – wird nach einem
  // erfolgreichen Import via importVersuchen() erneut aufgelöst (siehe
  // zitatText, das dabei unverändert bleibt).

  // Ganze Gesetze benötigen auch beim Ausgangsgesetz die explizite Referenz:
  // der XML-Leser erkennt sie an Gesetzesangabe ohne konkrete Bezeichnung.
  if (ohneElementstand) {
    if (zitat.ganzesGesetz)
      return {
        zielnorm: {
          typ: 'ganzesGesetz',
          gesetz: zielgesetz,
          verweistextZeichenbereich: [zitat.textStart, zitat.textEnde],
        },
      };
    const normKennung = bezeichnungOhneElementstand(zitat, zielgesetzGefunden, domainFns);
    return {
      zielnorm: {
        typ: 'zielnormOhneElementstand',
        gesetz: !istGleichesGesetz(zielgesetz, ausgangsgesetz) ? zielgesetz : undefined,
        bezeichnung: normKennung,
        verweistextZeichenbereich: [zitat.textStart, zitat.textEnde],
      },
    };
  }

  if (!zielgesetzGefunden) {
    if (gemeldeteKurztitel.has(gesetzesreferenzSchluessel(zielgesetz))) return {};
    return { fehler: baueGesetzNichtGefundenFehler(zielgesetz, fehlgeschlageneImports) };
  }

  if (zitat.ganzesGesetz) {
    // Verweis auf das ganze Gesetz (siehe zitatParser.ts:
    // RohNormZitat.ganzesGesetz): das Zielgesetz wurde oben bereits gefunden
    // (sonst wäre der !zielgesetzGefunden-Zweig oben gegriffen und hätte
    // bereits "Gesetz importieren"/"Trotzdem speichern" angeboten) – es gibt
    // hier keine konkrete Normzahl, die noch aufgelöst/existenzgeprüft
    // werden müsste (bewusst KEIN verweisZuXmlId/gesetzNormen-
    // Aufruf, anders als unten).
    return {
      zielnorm: {
        typ: 'ganzesGesetz',
        gesetz: zielgesetz,

        verweistextZeichenbereich: [zitat.textStart, zitat.textEnde],
      },
    };
  }

  const { gesetz: normGesetz, norm } = pruefeZitatNorm(
    zitat,
    { gefunden: zielgesetzGefunden, referenz: zielgesetz, eingabe: zielgesetz.kurztitel },
    alle,
    ausgangsgesetz,
    domainFns,
    auswahl,
  );
  if (!norm) {
    return {
      fehler: {
        art: 'norm',
        text: `${zitat.anzeigeText} existiert nicht in ${zielgesetzGefunden.kurztitel}.`,
        gesetz: zielgesetz,
      },
    };
  }

  // Ein erfolgreicher Ausnahmetreffer hat ein geladenes, eindeutig gewähltes Gesetz.
  const bestaetigtesGesetz = normGesetz.gefunden!;
  const bestaetigteReferenz = normGesetz.referenz!;

  // vollstaendigeBezeichnung leitet die Bezeichnung aus der Norm ab,
  // einschließlich ihres Gliederungsartikels, etwa "Art. 229 § 3".
  const zielBezeichnung =
    domainFns.vollstaendigeBezeichnung(bestaetigtesGesetz, norm.xmlId) ?? zitat.normzahlRoh;

  return {
    zielnorm: {
      typ: 'zielnorm',
      gesetz: !istGleichesGesetz(bestaetigteReferenz, ausgangsgesetz)
        ? bestaetigteReferenz
        : undefined,
      bezeichnung: zielBezeichnung,
      verweistextZeichenbereich: [zitat.textStart, zitat.textEnde],
      elementstand: domainFns.berechneElementstand(norm),
    },
  };
}

export interface VerweiszieleAufloesungErgebnis {
  fehlerListe: ZitatFehler[];
  verweisziele: Verweisziel[];
}

/** Löst jedes verbleibende Zitat einzeln auf; Fehler werden GESAMMELT statt
 *  beim ersten abzubrechen (siehe Absprache). */
export function loeseVerweiszieleAuf(
  zitate: RohNormZitat[],
  alle: GesetzDarstellung[],
  ausgangsgesetz: Gesetzesreferenz,
  ohneElementstand: boolean,
  fehlgeschlageneImports: ReadonlyMap<string, string | undefined>,
  domainFns: VerweiszieleDomainFns,
  auswahl?: ZitatZielAuswahl,
): VerweiszieleAufloesungErgebnis {
  const fehlerListe: ZitatFehler[] = [];
  const verweisziele: Verweisziel[] = [];
  // Dasselbe unbekannte Kurztitel kann für mehrere Normen im selben
  // Zitat-Text gelten (z.B. "434, 90 ZVG") – dieselbe Fehlermeldung dann
  // nicht mehrfach anzeigen.
  const gemeldeteKurztitel = new Set<string>();

  for (const zitat of zitate) {
    const { fehler, zielnorm } = loeseEinzelnesZitatAuf(
      zitat,
      alle,
      ausgangsgesetz,
      ohneElementstand,
      fehlgeschlageneImports,
      gemeldeteKurztitel,
      domainFns,
      auswahl,
    );
    if (fehler) {
      fehlerListe.push(fehler);
      if (fehler.art === 'gesetz' && fehler.gesetz) {
        gemeldeteKurztitel.add(gesetzesreferenzSchluessel(fehler.gesetz));
      }
    }
    if (zielnorm) verweisziele.push(zielnorm);
  }

  return { fehlerListe, verweisziele };
}
