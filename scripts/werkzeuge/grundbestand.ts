// grundbestand.ts
// Liest den Grundbestand (kuratierte Gesetzesliste je Normgeber) für den Entwicklerlauf
// und gleicht ihn mit Importindex und kuratierter Europaliste ab; die App nutzt ihn nicht.
import {
  IMPORTINDEX_KATEGORIEN,
  NORMGEBER_DE_BUND,
  NORMGEBER_EU,
  type ImportindexKategorie,
} from '@/lib/domain/normgeber';
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import { parseKuratierteListe } from '@/lib/import/importindex/europaKuratiert';
import {
  eintraegeAusImportindex,
  validiereImportindex,
} from '@/lib/import/importindex/importindexValidierung';
import { liesVerarbeitungszeitstempel } from '@/lib/utils/xmlVerarbeitung';
import { SaxesParser } from 'saxes';

/** Elementnamen unter `<inhalt>` sind die Kurzformen der Normgeber ohne Länderpräfix `de-`. */
const NORMGEBER_ELEMENTE = new Map<string, ImportindexKategorie>(
  IMPORTINDEX_KATEGORIEN.map((normgeber) => [normgeber.replace(/^de-/, ''), normgeber]),
);

export type GrundbestandGesetze = Partial<Record<ImportindexKategorie, string[]>>;

export interface Grundbestand {
  /** Letzte inhaltliche Änderung der von Hand gepflegten Liste. */
  geaendert: Date;
  /** Fehlt ein Normgeber, wird er nicht verarbeitet. Reihenfolge wie in der Datei. */
  gesetze: GrundbestandGesetze;
}

class GrundbestandFormatFehler extends Error {
  constructor(ursache: string) {
    super(`Ungültiger Grundbestand: ${ursache}`);
    this.name = 'GrundbestandFormatFehler';
  }
}

interface Knoten {
  name: string;
  version: string | undefined;
  kinder: Knoten[];
  text: string;
}

function baueBaum(xml: string): Knoten {
  const parser = new SaxesParser();
  const stapel: Knoten[] = [];
  let wurzel: Knoten | undefined;
  parser.on('opentag', (tag) => {
    const version = tag.attributes.version;
    const knoten: Knoten = {
      name: tag.name,
      version: typeof version === 'string' ? version : undefined,
      kinder: [],
      text: '',
    };
    stapel.at(-1)?.kinder.push(knoten);
    wurzel ??= knoten;
    stapel.push(knoten);
  });
  const text = (inhalt: string) => {
    const knoten = stapel.at(-1);
    if (knoten) knoten.text += inhalt;
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('closetag', () => stapel.pop());
  try {
    parser.write(xml).close();
  } catch {
    throw new GrundbestandFormatFehler('XML ist nicht wohlgeformt.');
  }
  if (!wurzel) throw new GrundbestandFormatFehler('XML ist nicht wohlgeformt.');
  return wurzel;
}

function einziges(eltern: Knoten, name: string): Knoten {
  const treffer = eltern.kinder.filter((k) => k.name === name);
  const [einzig] = treffer;
  if (treffer.length !== 1 || !einzig)
    throw new GrundbestandFormatFehler(
      `<${name}> muss genau einmal in <${eltern.name}> stehen (gefunden: ${treffer.length}).`,
    );
  return einzig;
}

/** Strenge Prüfung ohne Teilübernahme: jeder Verstoß verwirft die ganze Liste. */
export function leseGrundbestand(xml: string): Grundbestand {
  const wurzel = baueBaum(xml);
  if (wurzel.name !== 'grundbestand')
    throw new GrundbestandFormatFehler(
      `Wurzelelement muss <grundbestand> sein, nicht <${wurzel.name}>.`,
    );
  const { version } = wurzel;
  if (version === undefined) throw new GrundbestandFormatFehler('Attribut version fehlt.');
  if (version !== '1')
    throw new GrundbestandFormatFehler(`Version ${version} wird nicht unterstützt (erwartet: 1).`);
  for (const kind of wurzel.kinder) {
    if (kind.name !== 'infos' && kind.name !== 'inhalt')
      throw new GrundbestandFormatFehler(`Unbekanntes Element <${kind.name}> in <grundbestand>.`);
  }
  const zeitText = einziges(einziges(wurzel, 'infos'), 'geaendert').text.trim();
  const geaendert = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(zeitText)
    ? liesVerarbeitungszeitstempel(zeitText)
    : undefined;
  if (!geaendert)
    throw new GrundbestandFormatFehler(
      `<geaendert> „${zeitText}“ ist kein UTC-Zeitstempel der Form JJJJ-MM-TTThh:mm:ssZ.`,
    );
  const gesetze: GrundbestandGesetze = {};
  for (const gruppe of einziges(wurzel, 'inhalt').kinder) {
    const normgeber = NORMGEBER_ELEMENTE.get(gruppe.name);
    if (!normgeber)
      throw new GrundbestandFormatFehler(
        `Unbekanntes Normgeberelement <${gruppe.name}>; zulässig: ${[...NORMGEBER_ELEMENTE.keys()].join(', ')}.`,
      );
    if (gesetze[normgeber])
      throw new GrundbestandFormatFehler(`Normgeberelement <${gruppe.name}> steht mehrfach.`);
    gesetze[normgeber] = leseGesetze(gruppe);
  }
  return { geaendert, gesetze };
}

function leseGesetze(gruppe: Knoten): string[] {
  const gesehen = new Set<string>();
  return gruppe.kinder.map((gesetz) => {
    if (gesetz.name !== 'gesetz')
      throw new GrundbestandFormatFehler(
        `Unbekanntes Element <${gesetz.name}> in <${gruppe.name}>.`,
      );
    if (gesetz.kinder.length > 0)
      throw new GrundbestandFormatFehler(`<gesetz> in <${gruppe.name}> darf nur Text enthalten.`);
    const kurztitel = gesetz.text.trim();
    if (!kurztitel) throw new GrundbestandFormatFehler(`Leerer Kurztitel in <${gruppe.name}>.`);
    const schluessel = kurztitelVergleichsform(kurztitel);
    if (gesehen.has(schluessel))
      throw new GrundbestandFormatFehler(`Doppelter Kurztitel in <${gruppe.name}>: ${kurztitel}.`);
    gesehen.add(schluessel);
    return kurztitel;
  });
}

export interface GrundbestandAbgleich {
  /** Eindeutig gefundene Kurztitel in der Schreibweise des Importindex, Reihenfolge der Liste. */
  kurztitel: GrundbestandGesetze;
  /** Kurztitel der Liste ohne Eintrag im Bestand. */
  fehlend: GrundbestandGesetze;
  /** Kurztitel der Liste mit mehreren Einträgen im Bestand. */
  mehrdeutig: GrundbestandGesetze;
}

/** Rohtexte des Bestands; gelesen mit denselben strengen Lesern wie in der App. */
export interface GrundbestandQuellen {
  importindexBund: string;
  importindexBW: string;
  europaKuratiert: string;
}

function kurztitelDesBestands(
  normgeber: ImportindexKategorie,
  quellen: GrundbestandQuellen,
): string[] {
  if (normgeber === NORMGEBER_EU)
    return parseKuratierteListe(quellen.europaKuratiert).map(({ kurztitel }) => kurztitel);
  const xml = normgeber === NORMGEBER_DE_BUND ? quellen.importindexBund : quellen.importindexBW;
  return eintraegeAusImportindex(validiereImportindex(xml, normgeber)).map(
    ({ kurztitel }) => kurztitel,
  );
}

/**
 * Gleicht die Liste mit dem Bestand ab: für `de-bund`/`de-bw` der Importindex,
 * für `eu` die kuratierte Europaliste. Vergleich wie `istGleichesGesetz`
 * (Groß-/Kleinschreibung gleichgültig). Ungültige Quellen werfen.
 */
export function gleicheGrundbestandAb(
  gesetze: GrundbestandGesetze,
  quellen: GrundbestandQuellen,
): GrundbestandAbgleich {
  const ergebnis: GrundbestandAbgleich = { kurztitel: {}, fehlend: {}, mehrdeutig: {} };
  for (const normgeber of IMPORTINDEX_KATEGORIEN) {
    const liste = gesetze[normgeber];
    if (!liste) continue;
    const { gefunden, fehlend, mehrdeutig } = gleicheNormgeberAb(
      liste,
      kurztitelDesBestands(normgeber, quellen),
    );
    ergebnis.kurztitel[normgeber] = gefunden;
    if (fehlend.length) ergebnis.fehlend[normgeber] = fehlend;
    if (mehrdeutig.length) ergebnis.mehrdeutig[normgeber] = mehrdeutig;
  }
  return ergebnis;
}

function gleicheNormgeberAb(liste: readonly string[], bestand: readonly string[]) {
  const schreibweisen = new Map<string, string[]>();
  for (const titel of bestand) {
    const schluessel = kurztitelVergleichsform(titel.trim());
    schreibweisen.set(schluessel, [...(schreibweisen.get(schluessel) ?? []), titel.trim()]);
  }
  const gefunden: string[] = [];
  const fehlend: string[] = [];
  const mehrdeutig: string[] = [];
  for (const titel of liste) {
    const treffer = schreibweisen.get(kurztitelVergleichsform(titel)) ?? [];
    const [einzig] = treffer;
    if (treffer.length === 1 && einzig) gefunden.push(einzig);
    else (treffer.length === 0 ? fehlend : mehrdeutig).push(titel);
  }
  return { gefunden, fehlend, mehrdeutig };
}
