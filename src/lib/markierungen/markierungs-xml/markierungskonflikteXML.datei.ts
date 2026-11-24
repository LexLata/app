// markierungskonflikteXML.datei.ts
//
// Liest und schreibt MarkierungskonflikteXML (markierungskonflikte.xml) als
// ganze Datei. Nach außen gehen nur fachliche Werte: je Gesetz die
// gespeicherten Markierungskonflikte (GespeicherteGesetzKonflikte) sowie
// Prüfstatus und unbekannte Wurzelangaben als undurchsichtiger Durchreichwert.
// Der Wortlaut unveränderter Gesetzesblöcke bleibt beim Zurückschreiben
// erhalten; er ist nur innerhalb dieses Submoduls zugänglich.

import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type {
  GesetzKonflikte,
  MarkierungsEintrag,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { escapeXML, liesXmlWurzel, xmlKinder } from '@/lib/utils/xmlVerarbeitung';
import {
  baueGesetzBlock,
  XML_KONFLIKTART,
  gesetzesreferenzAusBlock,
  parseKonfliktEintraege,
  parseNichtamtlicheTitelXmlFehlt,
  patchEigenenEintrag,
  patchReferenzierendesGesetz,
} from './markierungskonflikteXML';
import type { GespeicherterKonfliktEintrag } from './markierungskonflikteXML';

export type MarkierungskonfliktPruefstatus = 'aktuell' | 'ausstehend' | 'fehlgeschlagen';

/**
 * Gespeicherte Markierungskonflikte EINES Gesetzes. Entsteht nur durch Lesen
 * der Datei oder über die Erstell- und Aktualisierungsfunktionen dieses
 * Submoduls; der gespeicherte Wortlaut bleibt dabei intern erhalten.
 */
class GespeicherteGesetzKonflikte {
  readonly gesetz: Gesetzesreferenz;
  /** Das Gesetz selbst fehlt (gesetzFehlt). */
  readonly fehlendesGesetz: boolean;
  readonly nichtamtlicheTitelXmlFehlt: boolean;
  readonly eintraege: readonly GespeicherterKonfliktEintrag[];
  readonly #wortlaut: string;

  constructor(wortlaut: string) {
    this.gesetz = gesetzesreferenzAusBlock(wortlaut);
    this.fehlendesGesetz = xmlKinder(liesXmlWurzel(wortlaut, 'gesetz'), 'konflikt').some(
      (el) => el.getAttribute('typ') === XML_KONFLIKTART.gesetzFehlt,
    );
    this.nichtamtlicheTitelXmlFehlt = parseNichtamtlicheTitelXmlFehlt(wortlaut);
    this.eintraege = parseKonfliktEintraege(wortlaut);
    this.#wortlaut = wortlaut;
    Object.freeze(this);
  }

  static wortlautVon(konflikte: GespeicherteGesetzKonflikte): string {
    return konflikte.#wortlaut;
  }
}
export type { GespeicherteGesetzKonflikte };

/** Unbekanntes Wurzelkind; wird unverändert zurückgeschrieben. */
class UnbekanntesWurzelkind {
  readonly #wortlaut: string;

  constructor(wortlaut: string) {
    this.#wortlaut = wortlaut;
    Object.freeze(this);
  }

  static wortlautVon(kind: UnbekanntesWurzelkind): string {
    return kind.#wortlaut;
  }
}

/** Unbekannte Wurzelangaben bleiben bei Status- und Befundänderungen erhalten. */
export interface KonfliktdateiErweiterungen {
  attribute: [string, string][];
  kinder: readonly UnbekanntesWurzelkind[];
}

export interface GelesenerKonfliktstand {
  gesetzKonflikte: Map<string, GespeicherteGesetzKonflikte>;
  /** null: Status fehlt oder ist alt/unbekannt. */
  pruefstatus: MarkierungskonfliktPruefstatus | null;
  erweiterungen: KonfliktdateiErweiterungen;
}

const wortlautVon = (konflikte: GespeicherteGesetzKonflikte) =>
  GespeicherteGesetzKonflikte.wortlautVon(konflikte);

function istPruefstatus(wert: string | null): wert is MarkierungskonfliktPruefstatus {
  return wert === 'aktuell' || wert === 'ausstehend' || wert === 'fehlgeschlagen';
}

/**
 * Liest eine vollständige MarkierungskonflikteXML. Gesetzesblöcke ohne
 * Kurztitel oder Normgeber werden übergangen, unbekannte Angaben ignoriert
 * bzw. zum Zurückschreiben aufbewahrt. Wirft bei ungültigem Inhalt.
 */
export function liesMarkierungskonflikteXML(xml: string): GelesenerKonfliktstand {
  const wurzel = liesXmlWurzel(xml, 'markierungskonflikte');
  const status = wurzel.getAttribute('pruefstatus');
  const kinder = Array.from(wurzel.children)
    .filter((kind) => kind.tagName !== 'gesetz')
    .map((kind) => new UnbekanntesWurzelkind(new XMLSerializer().serializeToString(kind)));
  const gesetzKonflikte = new Map<string, GespeicherteGesetzKonflikte>();
  for (const el of xmlKinder(wurzel, 'gesetz')) {
    if (el.getAttribute('kurztitel') !== null && el.hasAttribute('normgeber')) {
      // Auch Zielreferenzen werden schon hier vollständig gelesen; ungültiger
      // abgeleiteter Altbestand macht die ganze Datei ungültig.
      const wert = new GespeicherteGesetzKonflikte(new XMLSerializer().serializeToString(el));
      gesetzKonflikte.set(gesetzesreferenzSchluessel(wert.gesetz), wert);
    }
  }
  return {
    gesetzKonflikte,
    pruefstatus: istPruefstatus(status) ? status : null,
    erweiterungen: {
      attribute: Array.from(wurzel.attributes)
        .filter((attribut) => attribut.name !== 'version' && attribut.name !== 'pruefstatus')
        .map((attribut) => [attribut.name, attribut.value]),
      kinder,
    },
  };
}

/**
 * Baut die vollständige MarkierungskonflikteXML. Gesetze stehen nach
 * Kurztitel (deutsche Sortierung), bei Gleichstand nach Schlüssel.
 */
export function baueMarkierungskonflikteXML(stand: {
  gesetzKonflikte: ReadonlyMap<string, GespeicherteGesetzKonflikte>;
  pruefstatus: MarkierungskonfliktPruefstatus;
  erweiterungen?: KonfliktdateiErweiterungen;
}): string {
  const sortiert = [...stand.gesetzKonflikte.entries()].sort(
    (a, b) =>
      a[1].gesetz.kurztitel.localeCompare(b[1].gesetz.kurztitel, 'de') ||
      a[0].localeCompare(b[0], 'de'),
  );
  const zusatzattribute = (stand.erweiterungen?.attribute ?? [])
    .filter(([name]) => name !== 'version' && name !== 'pruefstatus')
    .map(([name, wert]) => ` ${name}="${escapeXML(wert)}"`)
    .join('');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<markierungskonflikte version="1" pruefstatus="${stand.pruefstatus}"${zusatzattribute}>`,
    sortiert.map(([, wert]) => wortlautVon(wert)).join('\n'),
    ...(stand.erweiterungen?.kinder ?? []).map((kind) => UnbekanntesWurzelkind.wortlautVon(kind)),
    '</markierungskonflikte>',
  ].join('\n');
}

/** Erfasst frisch berechnete Markierungskonflikte eines Gesetzes zum Speichern. */
export function erstelleGespeicherteGesetzKonflikte(
  konflikte: GesetzKonflikte,
): GespeicherteGesetzKonflikte {
  return new GespeicherteGesetzKonflikte(baueGesetzBlock(konflikte));
}

/**
 * Aktualisiert bei einem referenzierenden Gesetz nur die Zielkonflikte zu
 * `betroffene`; eigene Konflikte und Zielkonflikte zu anderen Gesetzen
 * bleiben. undefined: kein Konflikt mehr.
 */
export function aktualisiereZielkonflikte(
  vorher: GespeicherteGesetzKonflikte | undefined,
  eintraege: MarkierungsEintrag[],
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  betroffene: Set<string>,
): GespeicherteGesetzKonflikte | undefined {
  const ergebnis = patchReferenzierendesGesetz(
    vorher && wortlautVon(vorher),
    eintraege,
    eigenesGesetz,
    alleGesetze,
    betroffene,
  );
  return ergebnis && erstelleGespeicherteGesetzKonflikte(ergebnis);
}

/**
 * Prüft genau eine Markierung des eigenen Gesetzes neu; alle anderen
 * Markierungen behalten ihre gespeicherten Konflikte. undefined: kein
 * Konflikt mehr.
 */
export function aktualisiereEinzelneMarkierung(
  vorher: GespeicherteGesetzKonflikte | undefined,
  gesetz: Gesetzesreferenz,
  geaenderterSchluessel: string,
  alleLiveEintraege: MarkierungsEintrag[],
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  nichtamtlicheTitelVorhanden: Set<string>,
  nichtamtlicheTitelXmlFehlt: boolean,
): GespeicherteGesetzKonflikte | undefined {
  const ergebnis = patchEigenenEintrag(
    vorher && wortlautVon(vorher),
    gesetz,
    geaenderterSchluessel,
    alleLiveEintraege,
    eigenesGesetz,
    alleGesetze,
    nichtamtlicheTitelVorhanden,
    nichtamtlicheTitelXmlFehlt,
  );
  return ergebnis && erstelleGespeicherteGesetzKonflikte(ergebnis);
}

/** Gleich, wenn beide unverändert denselben gespeicherten Wortlaut ergeben. */
export function sindGleicheGespeicherteGesetzKonflikte(
  a: GespeicherteGesetzKonflikte | undefined,
  b: GespeicherteGesetzKonflikte | undefined,
): boolean {
  if (a === undefined || b === undefined) return a === b;
  return wortlautVon(a) === wortlautVon(b);
}
