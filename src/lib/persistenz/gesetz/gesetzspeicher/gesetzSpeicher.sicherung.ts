// Gesetzdateien prüfen, beschädigte Inhalte erkennen und unverändert sichern.
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { type AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { istGueltigerNormgeber } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  appDatenExistiert,
  appDatenLesen,
  mitDateiSperre,
  mitGesetzDateiSperre,
  normalisierteDateiBasis,
  referenzAusDateiBasis,
  sichereBeiUngueltigemInhalt,
} from '@/lib/persistenz/kern/kern.index';
import { messeAsync, messeSync } from '@/lib/utils/perfMessung';
import { meldeStriktenGesetzbefund } from './gesetzSpeicher.befunde';
import { dateiname, vorhandenerPfad } from './gesetzSpeicher.dateien';
import { mitPruefpflichtigemGesetzVorgang } from './gesetzSpeicher.schreiben';
import {
  GESETZE_ORDNER,
  type GesetzDateiPruefung,
  type GesetzLadeBefund,
  fehlertext,
} from './gesetzSpeicher.typen';

function parseGesetzOhneAusnahme(inhalt: string): GesetzDarstellung | null {
  try {
    return messeSync('parseGesetzesXML', () => parseGesetzesXML(inhalt));
  } catch {
    return null;
  }
}

/** Prüft exakt diese Datei ohne Sicherung, Titelergänzung oder Bestandsänderung. */
export async function pruefeGesetzDatei(
  dateiBasis: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDateiPruefung> {
  let befund: GesetzDateiPruefung;
  try {
    const pfad = await vorhandenerPfad(dateiBasis);
    befund = await pruefeDatei(pfad.slice(GESETZE_ORDNER.length + 1, -4), pfad, meldungEmpfangen);
  } catch (fehler) {
    befund = { status: 'unlesbar', dateiBasis, fehler: fehlertext(fehler) };
  }
  if (befund.status === 'unlesbar')
    meldeStriktenGesetzbefund(
      `Die Gesetzdatei „${dateiBasis}“ konnte nicht geprüft werden`,
      befund.fehler,
      meldungEmpfangen,
    );
  return befund;
}

export async function pruefeDatei(
  dateiBasis: string,
  pfad = dateiname(dateiBasis),
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDateiPruefung> {
  let inhalt: string;
  try {
    inhalt = await messeAsync(
      `Gesetz lesen: ${dateiBasis}`,
      () => appDatenLesen(pfad, undefined, meldungEmpfangen),
      (text) => `${new TextEncoder().encode(text).length} Bytes`,
    );
  } catch (fehler) {
    try {
      if (!(await appDatenExistiert(pfad))) return { status: 'fehlt', dateiBasis };
    } catch {
      // Eine gescheiterte Existenzprüfung belegt keine fehlende Datei.
    }
    return { status: 'unlesbar', dateiBasis, fehler: fehlertext(fehler) };
  }
  if (!inhalt.trim()) return { status: 'leer', dateiBasis };
  const gesetz = messeSync(`Gesetz parsen und zuordnen: ${dateiBasis}`, () =>
    parsePassendesGesetz(dateiBasis, inhalt),
  );
  if (!gesetz) return { status: 'ungueltig', dateiBasis, inhalt };
  return { status: 'gueltig', dateiBasis, inhalt, gesetz };
}

function ohneKommentareUndCDATA(inhalt: string): string {
  return inhalt.replace(/<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/g, '');
}

function erkenneGesetzFuerEreignis(
  dateiBasis: string,
  inhalt: string | null,
): Gesetzesreferenz | null {
  const roh = ohneKommentareUndCDATA(inhalt ?? '');
  const dekodiere = (text: string): string => {
    const doc = new DOMParser().parseFromString(`<wert>${text}</wert>`, 'application/xml');
    return doc.querySelector('parsererror') ? '' : (doc.documentElement.textContent ?? '').trim();
  };
  const titel = [...roh.matchAll(/<kurztitel(?:\s[^>]*)?>([^<]*)<\/kurztitel\s*>/g)].map((m) =>
    dekodiere(m[1]!),
  );
  const normgeberWerte = [...roh.matchAll(/<normgeber(?:\s[^>]*)?>([^<]*)<\/normgeber\s*>/g)].map(
    (m) => dekodiere(m[1]!),
  );
  if (titel.length && titel[0] && new Set(titel).size === 1) {
    const normgeber =
      normgeberWerte.length === 1 && istGueltigerNormgeber(normgeberWerte[0]!)
        ? normgeberWerte[0]
        : undefined;
    if (normgeber !== undefined) return { kurztitel: titel[0], normgeber };
  }
  const ref = referenzAusDateiBasis(dateiBasis);
  return ref;
}

export function erkenneReparaturziel(
  dateiBasis: string,
  inhalt: string,
): Extract<GesetzLadeBefund, { status: 'reparierbar' }> | null {
  const ref = referenzAusDateiBasis(dateiBasis);
  if (!ref) return null;
  inhalt = ohneKommentareUndCDATA(inhalt);
  const normgeberWerte = [
    ...inhalt.matchAll(/<normgeber(?:\s[^>]*)?>([^<]*)<\/normgeber\s*>/g),
  ].map((m) => dekodiereXMLWert(m[1]!));
  if (normgeberWerte.length !== 1) return null;
  const normgeber = normgeberWerte[0]!;
  const quelle = normgeber;
  if (quelle !== NORMGEBER_DE_BUND && quelle !== NORMGEBER_DE_BW) return null;
  const titelWerte = [...inhalt.matchAll(/<kurztitel(?:\s[^>]*)?>([^<]*)<\/kurztitel\s*>/g)].map(
    (m) => dekodiereXMLWert(m[1]!),
  );
  if (
    titelWerte.some(
      (titel) => kurztitelVergleichsform(titel) !== kurztitelVergleichsform(ref.kurztitel),
    )
  )
    return null;
  if (
    normalisierteDateiBasis({ kurztitel: ref.kurztitel, normgeber }) !==
    normalisierteDateiBasis(ref)
  )
    return null;
  return { status: 'reparierbar', dateiBasis, kurztitel: ref.kurztitel, quelle };
}

function dekodiereXMLWert(text: string): string {
  const doc = new DOMParser().parseFromString(`<wert>${text}</wert>`, 'application/xml');
  return doc.querySelector('parsererror') ? '' : (doc.documentElement.textContent ?? '').trim();
}

export function parsePassendesGesetz(dateiBasis: string, inhalt: string): GesetzDarstellung | null {
  const gesetz = parseGesetzOhneAusnahme(inhalt);
  if (!gesetz) return null;
  try {
    const ref = referenzAusDateiBasis(dateiBasis);
    return ref && normalisierteDateiBasis(gesetz) === normalisierteDateiBasis(ref) ? gesetz : null;
  } catch {
    return null;
  }
}

/** Nutzt den nativen Inhaltsvergleich auch bei späteren Reparaturabschlüssen.
 * Reparaturfälle bleiben erhalten, außer nach ausdrücklich gescheiterter Reparatur.
 * Nur eine bestätigte Entfernung meldet eine Bestandsänderung. */
export async function sichereUngueltigeGesetzDatei(
  dateiBasis: string,
  inhalt: string | null,
  optionen: {
    token?: string;
    vorgang?: string;
    reparaturGescheitert?: boolean;
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
    /** Der Aufrufer hat genau diesen Inhalt bereits erfolglos mit parsePassendesGesetz geprüft. */
    alsUngueltigGeprueft?: boolean;
  } = {},
) {
  // Erkennbare Noops benötigen weder Vorabkanal noch Quellsperre.
  if (inhalt === null) return { status: 'fehlt' as const };
  if (!inhalt.trim()) return { status: 'leer' as const };
  if (!optionen.alsUngueltigGeprueft && parsePassendesGesetz(dateiBasis, inhalt))
    return { status: 'gueltig' as const, inhalt };
  const reparaturziel = erkenneReparaturziel(dateiBasis, inhalt);
  if (reparaturziel && !optionen.reparaturGescheitert) return reparaturziel;
  const beginn = performance.now();
  // Unter der Referenzsperre ist der Pfad bereits ermittelt; nur Unteroperationen
  // mit fremdem Token ermitteln ihn selbst.
  const sichern = async (token: string, vorgang: string, pfad?: string) => {
    const ergebnis = await sichereBeiUngueltigemInhalt(
      pfad ?? (await vorhandenerPfad(dateiBasis)),
      inhalt,
      // Auch ein inzwischen erkennbarer Reparaturfall muss erhalten bleiben.
      // Der Ausgangsinhalt ist oben bereits als ungültig und nicht reparierbar
      // erkannt; nur ein zwischenzeitlich geänderter Inhalt wird erneut geparst.
      (text) =>
        text !== inhalt &&
        (parsePassendesGesetz(dateiBasis, text) !== null ||
          (!optionen.reparaturGescheitert && erkenneReparaturziel(dateiBasis, text) !== null)),
      { bannerAnzeigen: false, token, vorgang, meldungEmpfangen: optionen.meldungEmpfangen },
    );
    if (ergebnis.status !== 'gueltig') return ergebnis;
    if (optionen.reparaturGescheitert || parsePassendesGesetz(dateiBasis, ergebnis.inhalt))
      return ergebnis;
    return erkenneReparaturziel(dateiBasis, ergebnis.inhalt) ?? ergebnis;
  };
  // Unteroperationen übernehmen Token und vorgemerkten Vorgang gemeinsam.
  // Abschluss und Nachherereignis verantwortet dann der Besitzer nach Freigabe.
  if (optionen.token !== undefined) {
    if (optionen.vorgang === undefined)
      throw new Error(
        'Die Gesetzessicherung unter einer Sperre benötigt den vorgemerkten Vorgang.',
      );
    return sichern(optionen.token, optionen.vorgang);
  }
  const ref = referenzAusDateiBasis(dateiBasis);
  const ergebnis = await mitPruefpflichtigemGesetzVorgang(
    erkenneGesetzFuerEreignis(dateiBasis, inhalt),
    async (vorgang, abgeschlossen) => {
      const aktion = async (token: string, pfad?: string) => {
        const ergebnis = await sichern(token, vorgang, pfad);
        if (ergebnis.status === 'archiviert') abgeschlossen('geaendert');
        else if (ergebnis.status === 'gesichert_aber_nicht_entfernt')
          abgeschlossen('fehlgeschlagen');
        return ergebnis;
      };
      return ref
        ? mitGesetzDateiSperre(ref, GESETZE_ORDNER, '.xml', aktion, optionen.meldungEmpfangen)
        : mitDateiSperre(dateiname(dateiBasis), aktion, optionen.meldungEmpfangen);
    },
    { meldungEmpfangen: optionen.meldungEmpfangen },
  );
  console.info(
    `Gesetzdatei-Sicherung: ${dateiBasis} ${ergebnis.status}, ${Math.round(performance.now() - beginn)} ms`,
  );
  return ergebnis;
}
