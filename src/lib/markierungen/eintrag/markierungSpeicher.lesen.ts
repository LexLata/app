// Liest Markierungsdateien und bewahrt die getrennten Verträge für Prüfung, Import und Archivierung.
import { MARKIERUNGEN_SUFFIX } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  appDatenLesen,
  appDatenLesenOderNull,
  appDatenExistiert,
  appDatenOrdnerLesen,
  meldePersistenzBefund,
  referenzAusDateiBasis,
  sichereBeiUngueltigemInhalt,
} from '@/lib/persistenz/kern/kern.index';
import { schreibeMarkierungsXML } from './markierungSpeicher.schreiben';
import {
  baueXML,
  istMarkierungsXML,
  parseEintraege,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  MARKIERUNGEN_ORDNER,
  ermittleMarkierungsDateipfad,
  mitMarkierungsQuelle,
} from './markierungSpeicher';

function dateiname(pfad: string): string {
  return pfad.split('/').at(-1) ?? pfad;
}

async function leseMarkierungsInhalt(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  const pfad = await ermittleMarkierungsDateipfad(gesetz);
  try {
    return await appDatenLesen(pfad, undefined, meldungEmpfangen);
  } catch (fehler) {
    if (await appDatenExistiert(pfad)) {
      if (meldungEmpfangen)
        meldePersistenzBefund(
          {
            typ: 'fehler',
            art: 'fehler',
            anlass: 'lesen',
            aenderungsstand: 'keine',
            grund: 'nichtLesbar',
            betroffen: dateiname(pfad),
            text: `Die Datei ‚${dateiname(pfad)}' konnte nicht gelesen werden. Änderungen daran werden nicht gespeichert.`,
          },
          meldungEmpfangen,
        );
      throw fehler;
    }
    return null;
  }
}

/** Beschädigter gelesener Inhalt bleibt für die spätere Behandlung erhalten. */
export class BeschaedigteMarkierungsdateiFehler extends Error {
  constructor(
    public readonly gesetz: Gesetzesreferenz,
    public readonly inhalt: string,
    ursache?: unknown,
    readonly pfad?: string,
  ) {
    super(
      `Die gelesene Markierungsdatei${pfad ? ` „${pfad}“` : ''} konnte nicht geprüft werden.${ursache instanceof Error ? ` ${ursache.message}` : ''}`,
      { cause: ursache },
    );
    this.name = 'BeschaedigteMarkierungsdateiFehler';
  }
}

/** Strikter Prüfweg: kein Archivieren und keine Ersatzbestände bei Beschädigung. */
export async function leseMarkierungsXMLFuerPruefung(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  const inhalt = await leseMarkierungsInhalt(gesetz, meldungEmpfangen);
  if (inhalt === null || inhalt.trim().length === 0) return inhalt;
  try {
    if (!istMarkierungsXML(inhalt)) throw new Error('Markierungenwurzel fehlt.');
    if (parseEintraege(inhalt, gesetz).befunde.length > 0)
      throw new Error('Nicht lesbare Markierungseinträge.');
  } catch (fehler) {
    throw new BeschaedigteMarkierungsdateiFehler(
      { ...gesetz },
      inhalt,
      fehler,
      await ermittleMarkierungsDateipfad(gesetz),
    );
  }
  return inhalt;
}

export async function ladeEintraegeFuerPruefung(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsEintrag[]> {
  const inhalt = await leseMarkierungsXMLFuerPruefung(gesetz, meldungEmpfangen);
  return inhalt === null || inhalt.trim().length === 0
    ? []
    : parseEintraege(inhalt, gesetz).eintraege;
}

/** Sicherungsbefunde erhalten unten die fachlichen Markierungstexte;
 * nur Lesehinweise aus einem frischen Wiederholungslesen gehen direkt weiter. */
function markierungsSicherungsEmpfaenger(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): AktionsMeldungEmpfaenger | undefined {
  if (!meldungEmpfangen) return undefined;
  return (meldung) => {
    if (meldung.anlass === 'lesen' && meldung.art === 'hinweis') meldungEmpfangen(meldung);
  };
}

/** Eine fremde oder nicht bestätigte Dateizuordnung erlaubt keine Übernahme. */
function liesGesicherteEintraege(gesichert: string, gesetz: Gesetzesreferenz) {
  try {
    return {
      gelesen: istMarkierungsXML(gesichert) ? parseEintraege(gesichert, gesetz) : undefined,
      grund: '',
    };
  } catch (fehler) {
    return { gelesen: undefined, grund: fehler instanceof Error ? ` ${fehler.message}` : '' };
  }
}

function meldeBereinigt(
  pfad: string,
  sicherungspfad: string,
  befunde: readonly { ort?: string }[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  const orte = befunde
    .slice(0, 3)
    .map((b) => b.ort ?? 'ohne Ausgangsstelle')
    .join(', ');
  meldePersistenzBefund(
    {
      typ: 'warnung',
      art: 'hinweis',
      anlass: 'sicherung',
      aenderungsstand: 'vollstaendig',
      grund: 'bereinigt',
      betroffen: dateiname(pfad),
      sicherung: sicherungspfad,
      detail: `${befunde.length} nicht lesbare Markierungseinträge: ${orte}`,
      text: `Die Datei ‚${dateiname(pfad)}' enthielt ${befunde.length} nicht lesbare Markierungseinträge (${orte}). Die lesbaren Einträge wurden übernommen.`,
    },
    meldungEmpfangen,
  );
}

/** Interner Lader verwendet die bestehende Quellreferenz, ohne neu vorzumerken. */
export async function ladeEintraegeUnterSperre(
  gesetz: Gesetzesreferenz,
  token?: string,
  vorgang?: string,
  geaendert?: () => void,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsEintrag[]> {
  const pfad = await ermittleMarkierungsDateipfad(gesetz);
  const inhalt = await leseMarkierungsInhalt(gesetz, meldungEmpfangen);
  const istGueltig = (text: string) => {
    try {
      return istMarkierungsXML(text) && parseEintraege(text, gesetz).befunde.length === 0;
    } catch {
      return false;
    }
  };
  let sicherungspfad: string | undefined;
  try {
    const ergebnis = await sichereBeiUngueltigemInhalt(pfad, inhalt, istGueltig, {
      token,
      vorgang,
      bannerAnzeigen: false,
      meldungEmpfangen: markierungsSicherungsEmpfaenger(meldungEmpfangen),
    });
    if (ergebnis.status === 'gueltig') return parseEintraege(ergebnis.inhalt, gesetz).eintraege;
    if (ergebnis.status === 'fehlt' || ergebnis.status === 'leer') return [];
    sicherungspfad = ergebnis.sicherungspfad;
    // Sicherungspfade nur in der Konsole, nicht in Meldungen.
    console.info(`${pfad}: Sicherung ${sicherungspfad}`);
    if (ergebnis.status === 'gesichert_aber_nicht_entfernt')
      throw new Error('Die beschädigte Markierungsdatei wurde gesichert, aber nicht entfernt.');
    geaendert?.();
    // Nur die tatsächlich archivierte Fassung darf den bereinigten Bestand bestimmen.
    const gesichert = await appDatenLesen(sicherungspfad, undefined, meldungEmpfangen);
    const { gelesen, grund } = liesGesicherteEintraege(gesichert, gesetz);
    if (!gelesen) {
      meldePersistenzBefund(
        {
          typ: 'warnung',
          art: 'hinweis',
          anlass: 'sicherung',
          aenderungsstand: 'teilweise',
          grund: 'imDatenordnerGesichert',
          betroffen: dateiname(pfad),
          sicherung: sicherungspfad,
          detail: grund.trim() || undefined,
          text: `Die Datei ‚${dateiname(pfad)}' wurde wegen unlesbarer oder nicht passender Angaben gesichert.${grund}`,
        },
        meldungEmpfangen,
      );
      return [];
    }
    await schreibeMarkierungsXML(pfad, baueXML(gesetz, gelesen.eintraege), token, vorgang);
    meldeBereinigt(pfad, sicherungspfad, gelesen.befunde, meldungEmpfangen);
    return gelesen.eintraege;
  } catch (fehler) {
    throw nichtBereinigt(pfad, fehler, sicherungspfad, meldungEmpfangen);
  }
}

function nichtBereinigt(
  pfad: string,
  fehler: unknown,
  sicherungspfad: string | undefined,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): unknown {
  meldePersistenzBefund(
    {
      typ: 'fehler',
      art: 'fehler',
      anlass: 'sicherung',
      aenderungsstand: sicherungspfad ? 'teilweise' : 'keine',
      grund: 'nichtBereinigt',
      betroffen: dateiname(pfad),
      ...(sicherungspfad ? { sicherung: sicherungspfad } : {}),
      text: `Die Datei ‚${dateiname(pfad)}' konnte nicht bereinigt werden.`,
    },
    meldungEmpfangen,
  );
  // Der Sicherungspfad steht nur in der Konsole (oben), nie im geworfenen Fehler.
  return fehler;
}

/** Befundfreie Dateien bleiben sperrefrei. Erst eine nötige Sicherung merkt
 * vor, sperrt die Quelle und liest den aktuellen Inhalt erneut. */
export async function ladeEintraege(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsEintrag[]> {
  const inhalt = await leseMarkierungsInhalt(gesetz, meldungEmpfangen);
  if (inhalt === null || inhalt.trim().length === 0) return [];
  if (istMarkierungsXML(inhalt)) {
    try {
      const gelesen = parseEintraege(inhalt, gesetz);
      if (gelesen.befunde.length === 0) return gelesen.eintraege;
    } catch {
      // Syntax- und Zuordnungsfehler werden unter der Quellsperre erneut geprüft und gesichert.
    }
  }
  return mitMarkierungsQuelle(
    gesetz,
    (token, vorgang, geaendert) =>
      ladeEintraegeUnterSperre(gesetz, token, vorgang, geaendert, meldungEmpfangen),
    undefined,
    false,
    meldungEmpfangen,
  );
}

/** Toleranter Rohtextvertrag ausschließlich für den Importvergleich. */
export async function leseMarkierungsXML(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  return appDatenLesenOderNull(await ermittleMarkierungsDateipfad(gesetz), meldungEmpfangen);
}

/** Dateinamen und Pfade bleiben innerhalb von eintrag. */
export async function ermittleGesetzeMitMarkierungen(): Promise<Gesetzesreferenz[]> {
  let dateien;
  try {
    dateien = await appDatenOrdnerLesen(MARKIERUNGEN_ORDNER);
  } catch (fehler) {
    if (await appDatenExistiert(MARKIERUNGEN_ORDNER)) throw fehler;
    return [];
  }
  const referenzen = dateien.flatMap((datei) => {
    const ref =
      !datei.isDirectory && datei.name ? gesetzesreferenzAusDateiname(datei.name) : undefined;
    return ref ? [ref] : [];
  });
  for (const ref of referenzen) await ermittleMarkierungsDateipfad(ref);
  return referenzen;
}

/** Liest die vollständige Referenz aus einer regulären Markierungsdatei. */
export function gesetzesreferenzAusDateiname(name: string): Gesetzesreferenz | undefined {
  const suffix = MARKIERUNGEN_SUFFIX;
  if (!name.toLowerCase().endsWith(suffix.toLowerCase())) return undefined;
  return referenzAusDateiBasis(name.slice(0, -suffix.length)) ?? undefined;
}

/**
 * Lädt alle gespeicherten Markierungen (Unterstreichung + Hervorhebung) für
 * ein Gesetz, sortiert nach bezeichnung, praefix und Position. Leere Liste, wenn keine
 * Markierungen vorhanden sind.
 */
export async function ladeMarkierungen(gesetz: Gesetzesreferenz): Promise<MarkierungsEintrag[]> {
  return ladeEintraege(gesetz);
}
