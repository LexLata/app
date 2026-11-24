// Rein lesende Prüfung der nichtamtlichen Titel und gemeinsame Fehlerklassen.
import { NICHTAMTLICHE_TITEL_SUFFIX } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  gesetzesreferenzSchluessel,
  istGleichesGesetz,
  liesNormgeber,
} from '@/lib/domain/gesetzesreferenz';
import {
  appDatenExistiert,
  appDatenLesen,
  ermittleGesetzDateipfad,
  meldePersistenzBefund,
} from '@/lib/persistenz/kern/kern.index';

import { NICHTAMTLICHE_TITEL_ORDNER } from './nichtamtlicheTitelSpeicher';
/** Normalisiert eine Bezeichnung für den Vergleich: trim + Whitespace
 *  vereinheitlicht (schützt gegen z.B. doppelte Leerzeichen in händisch
 *  gepflegten nichtamtlicheTitel-Dateien), aber sonst exakter Vergleich
 *  (kein Substring/Fuzzy-Matching). */
export function normalisiereBezeichnung(bezeichnung: string): string {
  return bezeichnung.trim().replace(/\s+/g, ' ');
}

type TitelPruefung =
  | { status: 'gueltig'; titel: Map<string, string> }
  | { status: 'beschaedigt' | 'falsch_zugeordnet' };

/** Bewahrt den bisherigen Prüfumfang: auch eine leere Titel-Map ist gültig. */
export function pruefeNichtamtlicheTitelXML(xml: string, gesetz: Gesetzesreferenz): TitelPruefung {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml.normalize('NFC'), 'application/xml');
  } catch {
    return { status: 'beschaedigt' };
  }
  const wurzel = doc.documentElement;
  if (doc.querySelector('parsererror') || wurzel?.tagName !== 'nichtamtlicheTitel') {
    return { status: 'beschaedigt' };
  }
  const gesetzElement = wurzel.querySelector(':scope > infos > gesetz');
  const gesetzesXML = gesetzElement?.textContent?.trim();
  let normgeber: string | undefined;
  try {
    normgeber = liesNormgeber(gesetzElement?.getAttribute('normgeber') ?? undefined);
  } catch {
    return { status: 'beschaedigt' };
  }
  if (!gesetzesXML || normgeber === undefined) return { status: 'beschaedigt' };
  if (!istGleichesGesetz({ kurztitel: gesetzesXML, normgeber }, gesetz)) {
    return { status: 'falsch_zugeordnet' };
  }

  const map = new Map<string, string>();
  const normEls = wurzel.querySelectorAll(':scope > inhalt > norm');
  for (const normEl of Array.from(normEls)) {
    const bezeichnung = normEl.querySelector(':scope > bezeichnung')?.textContent?.trim();
    const titel = normEl.querySelector(':scope > titel')?.textContent?.trim();
    if (!bezeichnung || !titel) continue;
    map.set(normalisiereBezeichnung(bezeichnung), titel);
  }
  return { status: 'gueltig', titel: map };
}

/** Gelesener Befund; Leerinhalt begründet weiterhin keine Archivierung. */
export class BeschaedigteTiteldateiFehler extends Error {
  readonly dateityp = 'nichtamtlicheTitel' as const;
  constructor(
    readonly gesetz: Gesetzesreferenz,
    readonly dateiBasis: string,
    readonly inhalt: string,
    readonly grund: 'beschaedigt' | 'falsch_zugeordnet' | 'leer',
  ) {
    super(`Die Titeldatei für „${gesetz.kurztitel}“ ist ${grund}.`);
    this.name = 'BeschaedigteTiteldateiFehler';
  }
}

/** Frische, rein lesende Prüfung; nur bestätigtes Fehlen ergibt null. */
export async function ladeNichtamtlicheTitelFuerPruefung(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Map<string, string> | null> {
  try {
    return await leseNichtamtlicheTitelFuerPruefung(gesetz, meldungEmpfangen);
  } catch (fehler) {
    // Strikte Prüfaufrufer ohne Empfänger behalten ihren rein werfenden Vertrag.
    if (meldungEmpfangen)
      titelMeldungen(meldungEmpfangen)(
        'fehler',
        `Die Titeldatei für „${gesetz.kurztitel}“ konnte nicht geprüft werden: ${
          fehler instanceof Error ? fehler.message : String(fehler)
        }`,
        'lesen',
      );
    throw fehler;
  }
}

async function leseNichtamtlicheTitelFuerPruefung(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Map<string, string> | null> {
  const pfad = await ermittleGesetzDateipfad(
    gesetz,
    NICHTAMTLICHE_TITEL_ORDNER,
    NICHTAMTLICHE_TITEL_SUFFIX,
  );
  let inhalt: string;
  try {
    inhalt = await appDatenLesen(pfad, undefined, meldungEmpfangen);
  } catch (fehler) {
    try {
      if (!(await appDatenExistiert(pfad))) return null;
    } catch (existenzfehler) {
      throw new AggregateError(
        [fehler, existenzfehler],
        'Titeldatei konnte weder gelesen noch auf Existenz geprüft werden.',
        { cause: existenzfehler },
      );
    }
    throw fehler;
  }
  const dateiBasis = pfad.slice(
    NICHTAMTLICHE_TITEL_ORDNER.length + 1,
    -NICHTAMTLICHE_TITEL_SUFFIX.length,
  );
  if (!inhalt.trim()) throw new BeschaedigteTiteldateiFehler(gesetz, dateiBasis, inhalt, 'leer');
  const pruefung = pruefeNichtamtlicheTitelXML(inhalt, gesetz);
  if (pruefung.status !== 'gueltig') {
    throw new BeschaedigteTiteldateiFehler(gesetz, dateiBasis, inhalt, pruefung.status);
  }
  return pruefung.titel;
}

/** Gesammelte Titelbefunde und unveränderte Zugriffsfehler. */
export class TitelquellenPruefungFehler extends AggregateError {
  readonly beschaedigteQuellen: BeschaedigteTiteldateiFehler[];
  constructor(fehler: unknown[]) {
    super(fehler, 'Die Titelquellen konnten nicht vollständig geprüft werden.');
    this.name = 'TitelquellenPruefungFehler';
    this.beschaedigteQuellen = fehler.filter(
      (befund): befund is BeschaedigteTiteldateiFehler =>
        befund instanceof BeschaedigteTiteldateiFehler,
    );
  }
}

/** Validiert alle betroffenen Titelquellen, auch ohne installiertes Gesetz. */
export async function existierenNichtamtlicheTitelFuerPruefung(
  gesetze: Gesetzesreferenz[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Set<string>> {
  const vorhanden = new Set<string>();
  const fehler: unknown[] = [];
  for (const gesetz of gesetze) {
    try {
      if (await ladeNichtamtlicheTitelFuerPruefung(gesetz, meldungEmpfangen))
        vorhanden.add(gesetzesreferenzSchluessel(gesetz));
    } catch (befund) {
      fehler.push(befund);
    }
  }
  if (fehler.length) throw new TitelquellenPruefungFehler(fehler);
  return vorhanden;
}

/** Erhält die Titeltexte beim ausdrücklichen Empfang und beim Bannerstandard. */
export function titelMeldungen(meldungEmpfangen?: AktionsMeldungEmpfaenger) {
  return (
    typ: 'warnung' | 'fehler',
    text: string,
    anlass: 'lesen' | 'sicherung',
    aenderungsstand: 'keine' | 'teilweise' = 'keine',
    befund?: Pick<AktionsMeldung, 'grund' | 'betroffen' | 'detail' | 'sicherung'>,
  ) =>
    meldePersistenzBefund(
      {
        typ,
        text,
        anlass,
        aenderungsstand,
        ...befund,
        art: aenderungsstand === 'teilweise' ? 'hinweis' : 'fehler',
      },
      meldungEmpfangen,
    );
}
