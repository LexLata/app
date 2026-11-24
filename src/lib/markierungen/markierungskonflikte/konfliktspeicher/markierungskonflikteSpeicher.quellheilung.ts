// Sammelt Quellenfehler und heilt bestätigte beschädigte Quellen über ihre Schutzpfade.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import {
  BeschaedigteMarkierungsdateiFehler,
  ladeEintraege,
  ladeEintraegeFuerPruefung,
} from '@/lib/markierungen/eintrag/eintrag.index';
import {
  BeschaedigteGesetzdateiFehler,
  BeschaedigteTiteldateiFehler,
  ladeAlleGesetzeFuerPruefung,
  ladeGesetzeFuerPruefung,
  ladeNichtamtlicheTitel,
  ladeNichtamtlicheTitelFuerPruefung,
  pruefeGesetzDatei,
  sichereUngueltigeGesetzDatei,
} from '@/lib/persistenz/gesetz/gesetz.index';

/** Flüchtige Quellenbefunde; es wird kein unvollständiges Prüfergebnis veröffentlicht. */
class KonfliktquellenPruefungFehler extends AggregateError {
  readonly beschaedigteQuellen: (
    | BeschaedigteGesetzdateiFehler
    | BeschaedigteTiteldateiFehler
    | BeschaedigteMarkierungsdateiFehler
  )[];

  constructor(fehler: unknown[]) {
    super(fehler, 'Die Konfliktquellen konnten nicht vollständig geprüft werden.');
    this.name = 'KonfliktquellenPruefungFehler';
    this.beschaedigteQuellen = fehler.filter(
      (befund): befund is (typeof this.beschaedigteQuellen)[number] =>
        befund instanceof BeschaedigteGesetzdateiFehler ||
        befund instanceof BeschaedigteTiteldateiFehler ||
        befund instanceof BeschaedigteMarkierungsdateiFehler,
    );
  }
}

export function sammleQuellfehler(fehler: unknown[], befund: unknown): void {
  if (befund instanceof AggregateError) {
    for (const ursache of befund.errors) sammleQuellfehler(fehler, ursache);
  } else if (!fehler.includes(befund)) fehler.push(befund);
}

/** Fehlende Gesetzgrundlage blockiert das Sammeln weiterer Markierungsbefunde nicht. */
export async function ladeGesetzeMitBefunden(
  quellfehler: unknown[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  referenzen?: readonly Gesetzesreferenz[],
): Promise<Awaited<ReturnType<typeof ladeAlleGesetzeFuerPruefung>>> {
  try {
    return await (referenzen
      ? ladeGesetzeFuerPruefung(referenzen, meldungEmpfangen)
      : ladeAlleGesetzeFuerPruefung(meldungEmpfangen));
  } catch (fehler) {
    sammleQuellfehler(quellfehler, fehler);
    return [];
  }
}

export function wirfQuellfehler(fehler: unknown[]): void {
  if (fehler.length === 1) throw fehler[0];
  if (fehler.length > 1) throw new KonfliktquellenPruefungFehler(fehler);
}

// (siehe markierungskonflikteSpeicher.fensterOeffnen.ts).
/** Dedup über die vollständige Referenz; keine dauerhafte Reparaturliste. */
export type HeilbareQuelle =
  BeschaedigteMarkierungsdateiFehler | BeschaedigteGesetzdateiFehler | BeschaedigteTiteldateiFehler;

export function heilbareQuellenAusFehler(fehler: unknown): HeilbareQuelle[] {
  const ursachen: unknown[] = [];
  sammleQuellfehler(ursachen, fehler);
  const quellen = new Map<string, HeilbareQuelle>();
  for (const ursache of ursachen) {
    if (ursache instanceof BeschaedigteMarkierungsdateiFehler)
      quellen.set(`markierung:${gesetzesreferenzSchluessel(ursache.gesetz)}`, ursache);
    else if (ursache instanceof BeschaedigteGesetzdateiFehler && ursache.grund === 'beschaedigt')
      quellen.set(`gesetz:${ursache.dateiBasis}`, ursache);
    else if (ursache instanceof BeschaedigteTiteldateiFehler)
      quellen.set(`titel:${gesetzesreferenzSchluessel(ursache.gesetz)}`, ursache);
  }
  return [...quellen.values()];
}

/** Der normale Schutzpfad sichert und prüft frisch, ohne nachgebaute Sperren/Ereignisse.
 * Striktes Nachlesen verhindert leeren Ersatz für verbliebene Schäden. */
export async function heileQuellen(
  quellen: HeilbareQuelle[],
  original: unknown,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  const fehler: unknown[] = [];
  for (const quelle of quellen) {
    try {
      if (quelle instanceof BeschaedigteMarkierungsdateiFehler) {
        await ladeEintraege(quelle.gesetz, meldungEmpfangen);
        await ladeEintraegeFuerPruefung(quelle.gesetz, meldungEmpfangen);
      } else if (quelle instanceof BeschaedigteTiteldateiFehler) {
        await ladeNichtamtlicheTitel(quelle.gesetz, meldungEmpfangen);
        await ladeNichtamtlicheTitelFuerPruefung(quelle.gesetz, meldungEmpfangen);
      } else {
        await sichereUngueltigeGesetzDatei(quelle.dateiBasis, quelle.inhalt, { meldungEmpfangen });
        const frisch = await pruefeGesetzDatei(quelle.dateiBasis, meldungEmpfangen);
        if (frisch.status !== 'gueltig' && frisch.status !== 'fehlt')
          throw new Error(`Gesetzquelle nach Sicherung weiterhin ${frisch.status}.`, {
            cause: frisch,
          });
      }
    } catch (heilungsfehler) {
      sammleQuellfehler(fehler, heilungsfehler);
    }
  }
  if (fehler.length > 0) {
    console.error('Quellheilung fehlgeschlagen:', { original, heilungsfehler: fehler });
    throw original;
  }
}

/** Nach Quellenwarten alte Befunde ausschließlich strikt lesend bestätigen. */
export async function bestaetigeHeilbareQuellen(
  quellen: HeilbareQuelle[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<HeilbareQuelle[]> {
  const fehler: unknown[] = [];
  for (const quelle of quellen) {
    try {
      if (quelle instanceof BeschaedigteMarkierungsdateiFehler)
        await ladeEintraegeFuerPruefung(quelle.gesetz, meldungEmpfangen);
      else if (quelle instanceof BeschaedigteTiteldateiFehler)
        await ladeNichtamtlicheTitelFuerPruefung(quelle.gesetz, meldungEmpfangen);
      else {
        const frisch = await pruefeGesetzDatei(quelle.dateiBasis, meldungEmpfangen);
        if (frisch.status === 'gueltig' || frisch.status === 'fehlt') continue;
        // Den ursprünglichen Inhalt nicht ersetzen: der Schutzpfad entscheidet
        // durch seinen Inhaltsvergleich auch über zwischenzeitliche Reparaturen.
        if (frisch.status === 'unlesbar') throw new Error(frisch.fehler);
        fehler.push(quelle);
      }
    } catch (befund) {
      sammleQuellfehler(fehler, befund);
    }
  }
  const heilbar = heilbareQuellenAusFehler(new AggregateError(fehler));
  if (heilbar.length !== fehler.length) wirfQuellfehler(fehler);
  return heilbar;
}
