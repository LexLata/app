// Ändert Markierungsbestände unter Quellsperren und serialisiert sie in Dokumentreihenfolge.
import { GESETZE_ORDNER } from '@/lib/persistenz/kern/kern.index';
import { MARKIERUNGEN_SUFFIX } from '@/lib/persistenz/kern/kern.index';

import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { alsFehler } from '@/lib/utils/fehler';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { ladeGesetzFuerVerknuepfung } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  appDatenLoeschen,
  ermittleGesetzDateipfad,
  mitGesetzDateiSperren,
} from '@/lib/persistenz/kern/kern.index';
import { schreibeMarkierungsXML } from './markierungSpeicher.schreiben';
import { baueXML } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  eintraegeSindGleich,
  uebernehmeZeitstempel,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import type { EintragsAenderung, MarkierungsSchreibErgebnis } from './markierungSpeicher';
import {
  ermittleMarkierungsDateipfad,
  MARKIERUNGEN_ORDNER,
  mitMarkierungsQuelle,
  sicherstelleOrdner,
} from './markierungSpeicher';
import { ladeEintraegeFuerPruefung, ladeEintraegeUnterSperre } from './markierungSpeicher.lesen';

/** Lädt unter Dateisperre, speichert Änderungen sortiert und stößt einmal die
 * Prüfung aller eigenen Markierungen an. Diese Prüfung wird nicht abgewartet.
 * zielGeschrieben bestätigt synchron nur das eigene Zieldateischreiben vor Folgeereignissen. */
export async function aendereEintraege<T>(
  gesetz: Gesetzesreferenz,
  bearbeiten: (bisherige: readonly MarkierungsEintrag[]) => EintragsAenderung<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  zielGeschrieben?: () => void,
): Promise<T> {
  return mitMarkierungsQuelle(
    gesetz,
    async (token, vorgang, geaendert) => {
      const bisherige = await ladeEintraegeUnterSperre(
        gesetz,
        token,
        vorgang,
        geaendert,
        meldungEmpfangen,
      );
      const aenderung = bearbeiten(bisherige);
      if (
        aenderung.art === 'geaendert' &&
        !eintraegeSindGleich(gesetz, aenderung.eintraege, bisherige)
      ) {
        await sicherstelleOrdner();
        await schreibeEintraege(gesetz, [...aenderung.eintraege], token, vorgang);
        zielGeschrieben?.();
        geaendert();
      }
      return aenderung.ergebnis;
    },
    undefined,
    false,
    meldungEmpfangen,
  );
}

/** Gemeinsamer Bulkpfad für fachliche Verknüpfungsaktionen eines Ausgangsgesetzes.
 * Vorablesen ermittelt ausschließlich die Quellenmenge; Berechnung und Schreiben
 * verwenden den frisch gelesenen Bestand unter allen Quellsperren. */
export async function aendereEintraegeMitGesetzquellen<T>(
  gesetz: Gesetzesreferenz,
  ermittleQuellen: (eintraege: readonly MarkierungsEintrag[]) => readonly Gesetzesreferenz[],
  bearbeiten: (
    eintraege: readonly MarkierungsEintrag[],
    quellen: ReadonlyMap<string, GesetzDarstellung | null>,
  ) => EintragsAenderung<T>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsSchreibErgebnis<T>> {
  return bearbeiteEintraegeMitGesetzquellen(
    gesetz,
    ermittleQuellen,
    bearbeiten,
    false,
    meldungEmpfangen,
  );
}

/** Anzeige liest unter denselben Quellsperren, ohne Prüfbedarf oder Änderungsereignisse. */
export async function leseEintraegeMitGesetzquellen<T>(
  gesetz: Gesetzesreferenz,
  ermittleQuellen: (eintraege: readonly MarkierungsEintrag[]) => readonly Gesetzesreferenz[],
  lesen: (
    eintraege: readonly MarkierungsEintrag[],
    quellen: ReadonlyMap<string, GesetzDarstellung | null>,
  ) => T,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<T> {
  const ergebnis = await bearbeiteEintraegeMitGesetzquellen(
    gesetz,
    ermittleQuellen,
    (eintraege, quellen) => ({
      art: 'unveraendert',
      ergebnis: lesen(eintraege, quellen),
    }),
    true,
    meldungEmpfangen,
  );
  if (ergebnis.status === 'fehlgeschlagen') throw alsFehler(ergebnis.fehler);
  if (ergebnis.nachgelagerterFehler !== undefined) throw alsFehler(ergebnis.nachgelagerterFehler);
  return ergebnis.ergebnis;
}

async function bearbeiteEintraegeMitGesetzquellen<T>(
  gesetz: Gesetzesreferenz,
  ermittleQuellen: (eintraege: readonly MarkierungsEintrag[]) => readonly Gesetzesreferenz[],
  bearbeiten: (
    eintraege: readonly MarkierungsEintrag[],
    quellen: ReadonlyMap<string, GesetzDarstellung | null>,
  ) => EintragsAenderung<T>,
  nurLesen: boolean,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsSchreibErgebnis<T>> {
  let gespeichert: { status: 'geaendert' | 'unveraendert'; ergebnis: T } | undefined;
  const quellenmenge = (eintraege: readonly MarkierungsEintrag[]) =>
    new Map(ermittleQuellen(eintraege).map((ref) => [gesetzesreferenzSchluessel(ref), ref]));
  try {
    for (let versuch = 0; versuch < 3; versuch += 1) {
      const vorbereitet = quellenmenge(await ladeEintraegeFuerPruefung(gesetz, meldungEmpfangen));
      let wiederholen = false;
      let tokens: ReadonlyMap<string, string>;
      const ausfuehren = async (
        token: string,
        vorgang?: string,
        geaendert?: (schluessel?: string) => void,
      ) => {
        const frisch = await ladeEintraegeFuerPruefung(gesetz, meldungEmpfangen);
        const benoetigt = quellenmenge(frisch);
        if (
          JSON.stringify([...benoetigt.keys()].sort()) !==
          JSON.stringify([...vorbereitet.keys()].sort())
        ) {
          wiederholen = true;
          return;
        }
        const quellen = new Map<string, GesetzDarstellung | null>();
        for (const [schluessel, ref] of benoetigt) {
          const pfad = await ermittleGesetzDateipfad(ref, GESETZE_ORDNER);
          const quellenToken = tokens.get(pfad);
          if (!quellenToken) throw new Error('Die benötigte Gesetzquelle ist nicht gesperrt.');
          quellen.set(
            schluessel,
            await ladeGesetzFuerVerknuepfung(
              ref,
              {
                pfad,
                token: quellenToken,
              },
              undefined,
              meldungEmpfangen,
            ),
          );
        }
        const aenderung = bearbeiten(frisch, quellen);
        const veraendert =
          aenderung.art === 'geaendert' &&
          !eintraegeSindGleich(gesetz, aenderung.eintraege, frisch);
        if (aenderung.art === 'geaendert' && veraendert) {
          if (!geaendert) throw new Error('Ein Leseauftrag darf keine Markierungen ändern.');
          await sicherstelleOrdner();
          const jetzt = new Date();
          const eintraege = aenderung.eintraege.map((neu, index) => {
            const vorher = frisch[index];
            if (!vorher) throw new Error('Die Bearbeitung muss die Eintragsreihenfolge erhalten.');
            return uebernehmeZeitstempel(gesetz, vorher, neu, jetzt);
          });
          await schreibeEintraege(gesetz, eintraege, token, vorgang);
          gespeichert = { status: 'geaendert', ergebnis: aenderung.ergebnis };
          geaendert();
        } else
          gespeichert = {
            status: 'unveraendert',
            ergebnis: aenderung.ergebnis,
          };
      };
      const sperren = (lauf: (token: string) => Promise<void>) =>
        mitGesetzDateiSperren(
          [
            {
              gesetz,
              ordner: MARKIERUNGEN_ORDNER,
              suffix: MARKIERUNGEN_SUFFIX,
            },
            ...[...vorbereitet.values()].map((ref) => ({
              gesetz: ref,
              ordner: GESETZE_ORDNER,
              suffix: '.xml',
            })),
          ],
          async (gehalten) => {
            tokens = gehalten;
            const pfad = await ermittleMarkierungsDateipfad(gesetz);
            const token = gehalten.get(pfad);
            if (!token) throw new Error('Die benötigte Markierungsdatei ist nicht gesperrt.');
            return lauf(token);
          },
          meldungEmpfangen,
        );
      if (nurLesen) await sperren((token) => ausfuehren(token));
      else await mitMarkierungsQuelle(gesetz, ausfuehren, sperren, true, meldungEmpfangen);
      if (!wiederholen && gespeichert) return gespeichert;
    }
    throw new Error(
      'Die benötigten Quellen haben sich wiederholt verändert. Bitte erneut versuchen.',
    );
  } catch (fehler) {
    return gespeichert
      ? { ...gespeichert, nachgelagerterFehler: fehler }
      : { status: 'fehlgeschlagen', fehler };
  }
}

/** Bewahrt geprüftes Import-XML bis auf die eigene Wurzelversion.
 * zielGeschrieben bestätigt synchron das eigene
 * Zieldateischreiben vor Quellabschluss und Folgeereignissen, niemals eine Sicherung. */
export async function ersetzeMarkierungsXML(
  gesetz: Gesetzesreferenz,
  inhalt: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  zielGeschrieben?: () => void,
): Promise<void> {
  return mitMarkierungsQuelle(
    gesetz,
    async (token, vorgang, geaendert) => {
      await sicherstelleOrdner();
      await schreibeMarkierungsXML(
        await ermittleMarkierungsDateipfad(gesetz),
        inhalt,
        token,
        vorgang,
      );
      zielGeschrieben?.();
      geaendert();
    },
    undefined,
    false,
    meldungEmpfangen,
  );
}

/** Löscht unter Dateisperre und stößt die eigene Konfliktprüfung an. */
export async function loescheMarkierungsDatei(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  return mitMarkierungsQuelle(
    gesetz,
    async (token, vorgang, geaendert) => {
      await appDatenLoeschen(await ermittleMarkierungsDateipfad(gesetz), token, vorgang);
      geaendert();
    },
    undefined,
    false,
    meldungEmpfangen,
  );
}

/** Schreibt `eintraege` vollständig (sortiert nach bezeichnung, praefix und
 *  Position) in die Datei – gemeinsame Schreiblogik für alle
 *  schreibenden Funktionen dieser Datei. Exportiert für
 *  markierungSpeicher.undo.ts (wiederherstellenEintrag dort). */
export async function schreibeEintraege(
  gesetz: Gesetzesreferenz,
  eintraege: MarkierungsEintrag[],
  token?: string,
  vorgang?: string,
): Promise<void> {
  await schreibeMarkierungsXML(
    await ermittleMarkierungsDateipfad(gesetz),
    baueXML(gesetz, eintraege),
    token,
    vorgang,
  );
}
