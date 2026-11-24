// Prüft Ausgangsstellen und bündelt Markierungskonflikte eines Gesetzes.

import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { loeseNormAusgangsstelleAuf } from '@/lib/domain/norm/norm.index';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import { aktuellerTextAnPfad, textpfadSchluessel } from '@/lib/domain/textpfad/textpfad.index';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/markierungSpeicher.types';
import {
  berechneZielKonflikte,
  elementstandPasstNochZu,
  type ZielKonflikt,
} from './markierungskonfliktPruefung.zielkonflikte';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';

export {
  berechneZielKonflikte,
  klassifiziereZielnorm,
} from './markierungskonfliktPruefung.zielkonflikte';
export type { ZielKonflikt, ZielnormBefund } from './markierungskonfliktPruefung.zielkonflikte';

/**
 * Ein Konflikt-Datensatz für GENAU EINE Markierung: `eigenerKonflikt` (eigener Bezugskonflikt)
 * und `zielKonflikte` (Zielkonflikte, je Zielgesetz bis zu zwei Einträge) können bei
 * einem Verweismarkierung gemeinsam auftreten, da beide dieselbe Markierung
 * betreffen. Ein Datensatz wird nur erzeugt, wenn mindestens einer von
 * beiden vorliegt (siehe pruefeMarkierung).
 */
export type EigenerKonflikt =
  'bezugstextFehltOderUnpassend' | 'pauschalerBezugFehlt' | 'pauschalerBezugUnpassend';

export interface KonfliktEintrag {
  /** Konkreter Konflikt der Ausgangsstelle; fehlt bei passendem Bezug. */
  eigenerKonflikt?: EigenerKonflikt;
  /** Zielkonflikte, je Zielgesetz und Typ höchstens ein Eintrag. */
  zielKonflikte: ZielKonflikt[];
  ausgangsstelle: Ausgangsstelle;
  markierungstyp: MarkierungsEintrag['typ'];
  /** Nur gesetzt, wenn die Markierung eine textstelle hatte (siehe oben). */
  textstelle?: Textstelle;
  /** Nur ohne textstelle, markierungstyp 'kommentar'. */
  kommentarText?: string;
  /** Nur ohne textstelle, markierungstyp 'verweismarkierung' (Rohtext des allgemeinen Verweises). */
  verweistext?: string;
}

/**
 * Bestimmt die drei einander ausschließenden Identifikations-Felder
 * (textstelle/kommentarText/verweistext) von KonfliktEintrag aus EINER live
 * geladenen MarkierungsEintrag: bei vorhandenem Zeichenbereich identifiziert
 * über textstelle, sonst (nur möglich bei 'kommentar'/'verweismarkierung') über kommentarText/verweistext (siehe
 * KonfliktEintrag-Kommentar). Ein Kommentar/Verweis KANN trotzdem einen
 * Zeichenbereich haben (Textbezug, siehe MarkierungsEintrag.textstelle) –
 * dann identifiziert auch dort textstelle statt kommentarText/verweistext.
 *
 * Gemeinsamer Helfer statt dreifacher Kopie derselben Logik (echte
 * Anwendungsfälle: pruefeMarkierung hier, baueKonfliktEintragAusLive in
 * markierungskonflikteXML.ts, verifiziereEinenKonfliktEintrag in
 * markierungskonflikteAnzeige.ts).
 */
export function bestimmeIdentifizierendeFelder(
  eintrag: MarkierungsEintrag,
): Pick<KonfliktEintrag, 'textstelle' | 'kommentarText' | 'verweistext'> {
  const leer = { textstelle: undefined, kommentarText: undefined, verweistext: undefined };
  switch (eintrag.bezug.typ) {
    case 'bezugstext':
      return { ...leer, textstelle: eintrag.bezug.textstelle };
    case 'pauschal':
      switch (eintrag.typ) {
        case 'unterstreichung':
        case 'hervorhebung':
          return {};
        case 'kommentar':
          return { ...leer, kommentarText: eintrag.kommentarText };
        case 'verweismarkierung':
          return { ...leer, verweistext: eintrag.verweisinhalt.verweistext };
      }
  }
}

export interface GesetzKonflikte {
  gesetz: Gesetzesreferenz;
  /** true = gesetzFehlt (ganzes Gesetz fehlt) – eintraege ist dann leer. */
  fehlendesGesetz?: true;
  /** true = nichtamtlicheTitelXmlFehlt (siehe Datei-Kopfkommentar): mindestens eine
   *  Markierung dieses Gesetzes bezieht sich auf einen nichtamtlichen Titel,
   *  es existiert aber keine nichtamtlicheTitel-XML dafür. Anders als
   *  fehlendesGesetz NICHT exklusiv – eintraege kann trotzdem befüllt sein
   *  (siehe Datei-Kopfkommentar). */
  nichtamtlicheTitelXmlFehlt?: true;
  eintraege: KonfliktEintrag[];
}

export const ausgangsstelleNichtEindeutigMeldung =
  'Diese Stelle lässt sich im Gesetz nicht eindeutig adressieren. Hier sind keine Markierungen möglich.';

/** Gemeinsamer Befund für die strikte Zuordnung der Ausgangsstelle. */
export function loeseAusgangsstelleAuf(
  gesetz: GesetzDarstellung,
  ausgangsstelle: Ausgangsstelle,
): {
  element?: NormDarstellung | UeberschriftDarstellung;
  anzahlTreffer: number;
} {
  if (ausgangsstelle.typ !== 'ueberschrift') {
    const { norm, anzahlTreffer } = loeseNormAusgangsstelleAuf(gesetz, ausgangsstelle);
    return pruefeDarstellbarkeit(gesetz, norm, anzahlTreffer);
  }
  const treffer = gesetz.elemente.filter(
    (e) =>
      e.typ === 'ueberschrift' && e.data.gliederungskennzahl === ausgangsstelle.gliederungskennzahl,
  );
  const el = treffer.length === 1 ? treffer[0] : undefined;
  return pruefeDarstellbarkeit(
    gesetz,
    el?.typ === 'ueberschrift' ? el.data : undefined,
    treffer.length,
  );
}

/** Der Anzeigeweg adressiert über XML-ID; eine geteilte ID wäre eine Fehlzuordnung. */
function pruefeDarstellbarkeit(
  gesetz: GesetzDarstellung,
  element: NormDarstellung | UeberschriftDarstellung | undefined,
  anzahlTreffer: number,
) {
  if (!element) return { element, anzahlTreffer };
  const anzahlSichtbarerElemente = gesetz.elemente.filter(
    (el) => el.data.xmlId === element.xmlId,
  ).length;
  return {
    element: element.xmlId && anzahlSichtbarerElemente === 1 ? element : undefined,
    anzahlTreffer: Math.max(anzahlTreffer, anzahlSichtbarerElemente),
  };
}

/** Löst ausdrücklich gekennzeichnete Überschriften exakt auf; sonst nur Normen. */
export function findeElementZuBezeichnung(
  gesetz: GesetzDarstellung,
  ausgangsstelle: Ausgangsstelle,
): NormDarstellung | UeberschriftDarstellung | undefined {
  return loeseAusgangsstelleAuf(gesetz, ausgangsstelle).element;
}

// Vergleich einer aktuellen Norm gegen eine zuvor gespeicherte elementstand
// (titel/textlaenge) – identische Kriterien wie Elementstand/
// Elementstand in markierungSpeicher.ts, gleiche Berechnung (normTextLaenge).
// Identifiziert Markierungen innerhalb ihres Gesetzes einschließlich des vollständigen
// Textpfads; gleiche Zeichenbereiche in verschiedenen Absätzen bleiben getrennt.
export function identitaetsSchluessel(
  e: Pick<
    MarkierungsEintrag,
    'ausgangsstelle' | 'typ' | 'bezug' | 'kommentarText' | 'verweisinhalt'
  >,
): string {
  let rest: string;
  switch (e.bezug.typ) {
    case 'bezugstext':
      rest = `z:${e.bezug.textstelle.zeichenbereichStart}-${e.bezug.textstelle.zeichenbereichEnde}|${textpfadSchluessel(e.bezug.textstelle.pfad)}`;
      break;
    case 'pauschal':
      switch (e.typ) {
        case 'kommentar':
          if (e.kommentarText === undefined)
            throw new Error('Kommentartext fehlt in der Identität.');
          rest = `t:${e.kommentarText}`;
          break;
        case 'verweismarkierung':
          if (e.verweisinhalt === undefined)
            throw new Error('Verweisinhalt fehlt in der Identität.');
          rest = `v:${e.verweisinhalt.verweistext}`;
          break;
        case 'unterstreichung':
        case 'hervorhebung':
          throw new Error('Diese Markierung benötigt einen Bezugstext.');
      }
  }
  return `${ausgangsnormSchluessel(e)}|${e.typ}|${rest}`;
}

/** Prüft den eigenen Textbezug oder den Stand der pauschal markierten Ausgangsstelle. */
export function pruefeEigenenKonflikt(
  eintrag: MarkierungsEintrag,
  eigenesGesetz: GesetzDarstellung,
): EigenerKonflikt | undefined {
  const element = findeElementZuBezeichnung(eigenesGesetz, eintrag.ausgangsstelle);
  switch (eintrag.bezug.typ) {
    case 'bezugstext': {
      const aktuell = element ? aktuellerTextAnPfad(element, eintrag.bezug.textstelle) : undefined;
      return aktuell === undefined || aktuell !== eintrag.bezug.bezugstext
        ? 'bezugstextFehltOderUnpassend'
        : undefined;
    }
    case 'pauschal': {
      if (!element) return 'pauschalerBezugFehlt';
      const stand = eintrag.bezug.elementstand;
      return !elementstandPasstNochZu(element, stand.titel, stand.textlaenge)
        ? 'pauschalerBezugUnpassend'
        : undefined;
    }
  }
}

/**
 * Prüft nichtamtlicheTitelXmlFehlt (siehe Datei-Kopfkommentar) für EIN GANZES Gesetz:
 * true = mindestens eine der `eintraege` bezieht sich auf einen
 * nichtamtlichen Titel, aber für `kurztitel` existiert
 * auf dem Gerät gar keine nichtamtlicheTitel-XML. Braucht dafür
 * `nichtamtlicheTitelVorhanden` als Eingabe (statt selbst auf die Datei
 * zuzugreifen) – diese Datei bleibt bewusst dateizugriffsfrei (siehe
 * Kopfkommentar); der eigentliche exists()-Check läuft in
 * nichtamtlicheTitelSpeicher.ts, aufgerufen von markierungskonflikteSpeicher.ts/
 * markierungskonflikteAnzeige.ts.
 */
export function pruefeNichtamtlicheTitelXmlFehlt(
  eintraege: MarkierungsEintrag[],
  gesetz: Gesetzesreferenz,
  nichtamtlicheTitelVorhanden: Set<string>,
): boolean {
  return (
    !nichtamtlicheTitelVorhanden.has(gesetzesreferenzSchluessel(gesetz)) &&
    eintraege.some((e) => e.bezug.textstelle?.pfad.bereich === 'nichtamtlicherTitel')
  );
}

export function pruefeMarkierung(
  eintrag: MarkierungsEintrag,
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  nichtamtlicheTitelVorhanden: Set<string>,
): KonfliktEintrag[] {
  // Betrifft nichtamtlicheTitelXmlFehlt (siehe Datei-Kopfkommentar): fehlt die nichtamtlicheTitel-
  // XML komplett, wäre der generische Text-Vergleich (textAnTextpfad gegen
  // norm.titel === undefined) für DIESE Markierung ohnehin nur ein
  // irreführendes "passt nicht mehr" – nichtamtlicheTitelXmlFehlt wird stattdessen einmal pro
  // Gesetz separat geführt (siehe pruefeMarkierungenEinesGesetzes), daher
  // hier nur Unterdrückung der generischen Prüfung, kein eigener Eintrag.
  const nichtamtlicherTitelBetroffen =
    eintrag.bezug.textstelle?.pfad.bereich === 'nichtamtlicherTitel' &&
    !nichtamtlicheTitelVorhanden.has(gesetzesreferenzSchluessel(eigenesGesetz));
  const eigenerKonflikt = nichtamtlicherTitelBetroffen
    ? undefined
    : pruefeEigenenKonflikt(eintrag, eigenesGesetz);
  const zielKonflikte = berechneZielKonflikte(eintrag, eigenesGesetz, alleGesetze);

  if (!eigenerKonflikt && zielKonflikte.length === 0) return [];

  // Eigener Konflikt und Zielgesetz-Konflikte betreffen dieselbe Markierung
  // und werden daher immer als EIN gemeinsamer Datensatz gemeldet (siehe
  // bestimmeIdentifizierendeFelder für die textstelle/kommentarText/verweistext-
  // Aufteilung).
  return [
    {
      eigenerKonflikt: eigenerKonflikt || undefined,
      zielKonflikte,
      ausgangsstelle: eintrag.ausgangsstelle,

      markierungstyp: eintrag.typ,
      ...bestimmeIdentifizierendeFelder(eintrag),
    },
  ];
}

/**
 * Prüft ALLE Markierungen EINES Gesetzes. `eigenesGesetz` ist undefined,
 * wenn das Gesetz selbst nicht (mehr) auf dem Gerät ist (gesetzFehlt) –
 * in dem Fall werden die einzelnen Markierungen gar nicht erst geprüft.
 */
export function pruefeMarkierungenEinesGesetzes(
  gesetz: Gesetzesreferenz,
  eigenesGesetz: GesetzDarstellung | undefined,
  eintraege: MarkierungsEintrag[],
  alleGesetze: GesetzDarstellung[],
  nichtamtlicheTitelVorhanden: Set<string>,
): GesetzKonflikte {
  if (!eigenesGesetz) return { gesetz, fehlendesGesetz: true, eintraege: [] };
  const nichtamtlicheTitelXmlFehlt = pruefeNichtamtlicheTitelXmlFehlt(
    eintraege,
    gesetz,
    nichtamtlicheTitelVorhanden,
  );
  const eintraegeErgebnis: KonfliktEintrag[] = [];
  for (const e of eintraege)
    eintraegeErgebnis.push(
      ...pruefeMarkierung(e, eigenesGesetz, alleGesetze, nichtamtlicheTitelVorhanden),
    );
  return {
    gesetz,
    nichtamtlicheTitelXmlFehlt: nichtamtlicheTitelXmlFehlt || undefined,
    eintraege: eintraegeErgebnis,
  };
}

/** Identifiziert die drei fachlichen Fälle anhand ihrer vollständigen Kennung. */
export function ausgangsnormSchluessel(e: Pick<MarkierungsEintrag, 'ausgangsstelle'>): string {
  const stelle = e.ausgangsstelle;
  switch (stelle.typ) {
    case 'ueberschrift':
      return `ueberschrift:${stelle.gliederungskennzahl}`;
    case 'erwaegungsgrund':
      return `erwaegungsgrund:${stelle.bezeichnung}`;
    case 'norm':
      return `norm:${stelle.bezeichnung}`;
  }
}
