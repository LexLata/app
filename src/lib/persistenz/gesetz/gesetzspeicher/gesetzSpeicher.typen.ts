// Gemeinsame Typen, Fehleridentitäten und Konstanten der Gesetzpersistenz.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { BeschaedigteTiteldateiFehler } from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.pruefen';

export { GESETZE_ORDNER } from '@/lib/persistenz/kern/kern.index';

/** Entfernung erfolgreich; ein fehlender Fensterabgleich bleibt gesondert erkennbar. */
export type GesetzLoeschErgebnis =
  { benachrichtigung: 'gesendet' } | { benachrichtigung: 'fehlgeschlagen'; fehler: unknown };

/** Nur nach bestätigtem Gesetzesschreiben: die nachfolgende Titelergänzung
 * ist gescheitert. Kein fachlicher Importabschluss und kein erneuter Schreibgrund. */
export class GesetzSpeicherFolgefehler extends Error {
  constructor(
    readonly inhaltGeaendert: boolean,
    ursache: unknown,
    readonly gespeicherteReferenz: Gesetzesreferenz,
  ) {
    super(fehlertext(ursache), { cause: ursache });
    this.name = 'GesetzSpeicherFolgefehler';
  }
}

/** Befunde sind lokal zum jeweiligen Ladevorgang und benennen die betroffene Dateibasis. */
export type GesetzLadeBefund =
  | {
      status: 'reparierbar';
      dateiBasis: string;
      kurztitel: string;
      quelle: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW;
    }
  | {
      status: 'archiviert' | 'gesichert_aber_nicht_entfernt';
      dateiBasis: string;
      sicherungspfad: string;
    }
  | { status: 'fehlt' | 'leer'; dateiBasis: string }
  | { status: 'unlesbar' | 'sicherung_fehlgeschlagen'; dateiBasis: string; fehler: string }
  | { status: 'ordner_unlesbar'; fehler: string };

export type GesetzDateiPruefung =
  | { status: 'gueltig'; dateiBasis: string; inhalt: string; gesetz: GesetzDarstellung }
  | { status: 'ungueltig'; dateiBasis: string; inhalt: string }
  | { status: 'fehlt' | 'leer'; dateiBasis: string }
  | { status: 'unlesbar'; dateiBasis: string; fehler: string };

/** Ein Ladeversuch liefert entweder das Gesetz oder einen konkreten Befund. */
export type LadeErgebnis =
  { gesetz: GesetzDarstellung; befund?: never } | { gesetz?: never; befund: GesetzLadeBefund };

/** Anzeigetext für Landesrecht BW. */
export const LANDESRECHT_BW_QUELLE = 'Landesrecht BW';

export function fehlertext(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}

/** Gelesener Gesetzbefund, ohne Reparatur oder Sicherung im Prüfweg. */
export class BeschaedigteGesetzdateiFehler extends Error {
  readonly dateityp = 'gesetz' as const;
  constructor(
    readonly gesetz: Gesetzesreferenz | null,
    readonly dateiBasis: string,
    readonly inhalt: string,
    readonly grund: 'beschaedigt' | 'reparierbar' | 'leer',
  ) {
    super(`Die Gesetzdatei „${dateiBasis}“ ist ${grund}.`);
    this.name = 'BeschaedigteGesetzdateiFehler';
  }
}

export type BeschaedigteGesetzquelle = BeschaedigteGesetzdateiFehler | BeschaedigteTiteldateiFehler;

/** Enthält sämtliche Befunde einschließlich unveränderter Zugriffsfehler. */
export class GesetzquellenPruefungFehler extends AggregateError {
  readonly beschaedigteQuellen: BeschaedigteGesetzquelle[];
  constructor(fehler: unknown[]) {
    super(fehler, 'Die Gesetze konnten nicht vollständig geladen werden.');
    this.name = 'GesetzquellenPruefungFehler';
    this.beschaedigteQuellen = fehler.filter(
      (befund): befund is BeschaedigteGesetzquelle =>
        befund instanceof BeschaedigteGesetzdateiFehler ||
        befund instanceof BeschaedigteTiteldateiFehler,
    );
  }
}

/** Vollständiger Abschluss des übergangsweise noch verwendeten Sammelladens. */
export interface GesetzLadeabschluss {
  liste: GesetzDarstellung[];
  befunde: GesetzLadeBefund[];
  ordnerLesbar: boolean;
}
