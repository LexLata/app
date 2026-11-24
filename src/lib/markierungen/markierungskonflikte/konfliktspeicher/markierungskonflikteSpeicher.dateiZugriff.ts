// markierungskonflikteSpeicher.dateiZugriff.ts
//
// Dateizugriff auf markierungskonflikte.xml und Abgleich des gespeicherten
// Prüfstands mit der nativen Vorgangsverwaltung. Die fachliche Berechnung
// liegt in markierungskonflikteSpeicher.pruefdurchlauf.ts; die Serialisierung
// der Prüfaufträge in markierungskonflikteSpeicher.pruefkette.ts. Deren
// fensterlokaler Zustand liegt in markierungskonflikteSpeicher.zustand.ts.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import {
  appDatenLesen,
  appDatenSchreiben,
  appDatenExistiert,
  sichereBeiUngueltigemInhalt,
  meldePersistenzBefund,
} from '@/lib/persistenz/kern/kern.index';
import type {
  GespeicherteGesetzKonflikte,
  KonfliktdateiErweiterungen,
  MarkierungskonfliktPruefstatus,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import {
  baueMarkierungskonflikteXML,
  liesMarkierungskonflikteXML,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';

export const MARKIERUNGSKONFLIKTE_DATEI = 'markierungskonflikte.xml';

export interface GeladenerPruefstand {
  /** Gespeicherte Markierungskonflikte je Gesetzesreferenzschlüssel. */
  gesetzKonflikte: Map<string, GespeicherteGesetzKonflikte>;
  /** null: Datei fehlt oder Status ist alt/unbekannt; niemals Konfliktfreiheit. */
  pruefstatus: MarkierungskonfliktPruefstatus | null;
  vollpruefungErforderlich: boolean;
  erweiterungen: KonfliktdateiErweiterungen;
}

/** Flüchtiger prozessweiter Zusammenhang; keine fachlichen Aufträge. */
export interface NativerPruefstand {
  offeneQuellen: number;
  offenePruefungen: number;
  vollbedarf: boolean;
}

export async function pruefvorgangsAktion(
  aktion:
    | 'abfragen'
    | 'abbrechen'
    | 'quelle_abschliessen'
    | 'fehler'
    | 'teilpruefung_abschliessen'
    | 'vollbedarf'
    | 'vollpruefung_abschliessen',
  konfliktToken: string,
  vorgaenge: string[] = [],
): Promise<NativerPruefstand> {
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: pruefvorgangsAktion übergibt nur Aktion, konfliktToken und Vorgangskennungen; markierungskonflikteSpeicher.dateiZugriff.test.ts prüft native Prüfvorgänge.
  const stand = await rufeBefehl(`pruefvorgang_${aktion}`, {
    konfliktToken,
    vorgaenge,
  });
  if (
    !stand ||
    !Number.isSafeInteger(stand.offeneQuellen) ||
    stand.offeneQuellen < 0 ||
    !Number.isSafeInteger(stand.offenePruefungen) ||
    stand.offenePruefungen < 0 ||
    typeof stand.vollbedarf !== 'boolean'
  ) {
    throw new Error('Ungültiger nativer Prüfvorgangsstand');
  }
  return stand;
}

/** Ein gespeichertes pending ohne lebenden Zusammenhang stammt aus einer Unterbrechung. */
export async function erhalteVollbedarf(
  token: string,
  stand: GeladenerPruefstand,
): Promise<NativerPruefstand> {
  const nativ = await pruefvorgangsAktion('abfragen', token);
  if (
    stand.pruefstatus === null ||
    stand.pruefstatus === 'fehlgeschlagen' ||
    (stand.pruefstatus === 'ausstehend' && nativ.offeneQuellen + nativ.offenePruefungen === 0)
  )
    return pruefvorgangsAktion('vollbedarf', token);
  return nativ;
}

export function statusNachTeilabschluss(
  stand: GeladenerPruefstand,
  nativ: NativerPruefstand,
): MarkierungskonfliktPruefstatus {
  if (stand.pruefstatus === 'fehlgeschlagen') return 'fehlgeschlagen';
  return nativ.vollbedarf || nativ.offeneQuellen > 0 || nativ.offenePruefungen > 0
    ? 'ausstehend'
    : 'aktuell';
}

export function meldePruefstandFehler(
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  geschrieben = false,
): void {
  meldePersistenzBefund(
    {
      typ: 'fehler',
      anlass: 'pruefabschluss',
      art: geschrieben ? 'hinweis' : 'fehler',
      aenderungsstand: geschrieben ? 'vollstaendig' : 'keine',
      text: geschrieben
        ? 'Der Stand der Markierungskonflikte wurde gespeichert. Der Prüfabschluss konnte jedoch nicht bestätigt werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.'
        : 'Der Stand der Markierungskonflikte konnte nicht gespeichert werden. Bitte starten Sie LexLata neu, um die Prüfung erneut auszuführen.',
    },
    meldungEmpfangen,
  );
}

/** Abschluss und Statusentscheidung bleiben bis zum Schreiben unter derselben Sperre. */
export class PruefstandAbschlussfehler extends Error {
  constructor(readonly original: unknown) {
    super('Der Prüfstand konnte nicht abgeschlossen werden.', { cause: original });
  }
}

export async function schreibePruefergebnis(
  token: string,
  stand: GeladenerPruefstand,
  vollstaendig: boolean,
  vorgaenge: string[] = [],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  let geschrieben = false;
  try {
    const nativ = vollstaendig
      ? await pruefvorgangsAktion('abfragen', token)
      : await pruefvorgangsAktion('teilpruefung_abschliessen', token, vorgaenge);
    if (vollstaendig && nativ.offeneQuellen > 0) throw new Error('Quellen sind noch offen.');
    await schreibeGesetzKonflikte(
      stand.gesetzKonflikte,
      token,
      {
        pruefstatus: vollstaendig ? 'aktuell' : statusNachTeilabschluss(stand, nativ),
        erweiterungen: stand.erweiterungen,
      },
      meldungEmpfangen,
    );
    geschrieben = true;
    // Erst der dauerhaft gespeicherte vollständige Bestand hebt den Vollbedarf auf.
    if (vollstaendig) await pruefvorgangsAktion('vollpruefung_abschliessen', token);
  } catch (fehler) {
    try {
      await pruefvorgangsAktion('fehler', token);
    } catch (abschlussfehler) {
      console.error('Nativer Prüffehlerabschluss fehlgeschlagen:', abschlussfehler);
    }
    if (geschrieben) {
      try {
        await schreibeGesetzKonflikte(
          stand.gesetzKonflikte,
          token,
          {
            pruefstatus: 'fehlgeschlagen',
            erweiterungen: stand.erweiterungen,
          },
          meldungEmpfangen,
        );
      } catch (statusfehler) {
        console.error('Fehlerstatus konnte nicht gespeichert werden:', statusfehler);
      }
    }
    meldePruefstandFehler(meldungEmpfangen, geschrieben);
    throw new PruefstandAbschlussfehler(fehler);
  }
}

/** Nur tatsächlich gelesene ungültige Inhalte dürfen später gesichert werden. */
class BeschaedigteKonfliktdatei extends Error {
  constructor(
    readonly inhalt: string,
    original: unknown,
  ) {
    super(
      `Datei ungültig: markierungskonflikte.xml. ${original instanceof Error ? original.message : String(original)}`,
      { cause: original },
    );
    this.name = 'BeschaedigteKonfliktdatei';
  }
}

/** XML und bekannte Gesetzesreferenzen müssen für alle Konfliktleser lesbar sein. */
function istGueltigeKonfliktdatei(inhalt: string): boolean {
  try {
    parsePruefstand(inhalt);
    return true;
  } catch {
    return false;
  }
}

/** Ohne Token strikt lesend; mit Konfliktdateisperrtoken darf beschädigter
 * gelesener Inhalt gesichert werden. Ein verlorener Bestand bleibt Vollbedarf;
 * die vollständige Wiederherstellung übernimmt der gemeinsame Prüflauf.
 */
export async function ladePruefstand(
  token?: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GeladenerPruefstand> {
  let xml: string;
  try {
    xml = await appDatenLesen(MARKIERUNGSKONFLIKTE_DATEI, undefined, meldungEmpfangen);
  } catch (fehler) {
    let vorhanden: boolean;
    try {
      vorhanden = await appDatenExistiert(MARKIERUNGSKONFLIKTE_DATEI);
    } catch (existenzfehler) {
      meldeKonfliktdateiLesefehler(meldungEmpfangen);
      throw existenzfehler;
    }
    if (vorhanden) {
      meldeKonfliktdateiLesefehler(meldungEmpfangen);
      throw fehler;
    }
    if (token !== undefined) await pruefvorgangsAktion('vollbedarf', token);
    return leererPruefstand();
  }
  try {
    return parsePruefstand(xml);
  } catch (ursache) {
    const fehler = new BeschaedigteKonfliktdatei(xml, ursache);
    if (token === undefined) throw fehler;
    return sichereBeschaedigtenPruefstand(token, xml, fehler, meldungEmpfangen);
  }
}

/** Bestehende Hauptfensteraufrufer erhalten weiterhin nur den Fehlerwurf. */
function meldeKonfliktdateiLesefehler(meldungEmpfangen?: AktionsMeldungEmpfaenger): void {
  if (!meldungEmpfangen) return;
  meldePersistenzBefund(
    {
      typ: 'fehler',
      art: 'fehler',
      anlass: 'lesen',
      aenderungsstand: 'keine',
      text: 'Die Datei „markierungskonflikte.xml“ konnte nicht gelesen werden. Der Stand der Markierungskonflikte ist nicht zuverlässig verfügbar.',
    },
    meldungEmpfangen,
  );
}

async function sichereBeschaedigtenPruefstand(
  token: string,
  xml: string,
  fehler: BeschaedigteKonfliktdatei,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GeladenerPruefstand> {
  const sicherung = await sichereBeiUngueltigemInhalt(
    MARKIERUNGSKONFLIKTE_DATEI,
    xml,
    istGueltigeKonfliktdatei,
    { token, meldungEmpfangen },
  );
  if (sicherung.status === 'leer') throw fehler;
  if (sicherung.status === 'gesichert_aber_nicht_entfernt')
    throw new Error(
      'Die beschädigte Konfliktdatei wurde gesichert, das Original aber nicht entfernt.',
    );
  if (sicherung.status === 'gueltig') return parsePruefstand(sicherung.inhalt);
  const stand = leererPruefstand();
  await pruefvorgangsAktion('vollbedarf', token);
  if (sicherung.status === 'archiviert') {
    await schreibeGesetzKonflikte(
      stand.gesetzKonflikte,
      token,
      { pruefstatus: 'ausstehend' },
      meldungEmpfangen,
    );
    stand.pruefstatus = 'ausstehend';
  }
  return stand;
}

function leererPruefstand(): GeladenerPruefstand {
  return {
    gesetzKonflikte: new Map(),
    pruefstatus: null,
    vollpruefungErforderlich: true,
    erweiterungen: { attribute: [], kinder: [] },
  };
}

function parsePruefstand(xml: string): GeladenerPruefstand {
  const { gesetzKonflikte, pruefstatus, erweiterungen } = liesMarkierungskonflikteXML(xml);
  return {
    gesetzKonflikte,
    pruefstatus,
    vollpruefungErforderlich: pruefstatus !== 'aktuell',
    erweiterungen,
  };
}

/** Ein atomarer Schreibzugriff für Status UND Befunde, auch ohne Konflikte.
 * Der Aufrufer hält die Konfliktdateisperre und entscheidet den Status anhand
 * des frischen Bestands und der nativen Abschlüsse. Ohne solche Entscheidung
 * wird konservativ ausstehend geschrieben. Unbekannte Wurzelangaben aus dem
 * benannten Ladeergebnis müssen durchgereicht werden.
 */
export async function schreibeGesetzKonflikte(
  gesetzKonflikte: ReadonlyMap<string, GespeicherteGesetzKonflikte>,
  token?: string,
  stand?: {
    pruefstatus: MarkierungskonfliktPruefstatus;
    erweiterungen?: KonfliktdateiErweiterungen;
  },
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  await appDatenSchreiben(
    MARKIERUNGSKONFLIKTE_DATEI,
    baueMarkierungskonflikteXML({
      gesetzKonflikte,
      pruefstatus: stand?.pruefstatus ?? 'ausstehend',
      erweiterungen: stand?.erweiterungen,
    }),
    token,
  );

  try {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo({ kind: 'Any' }, 'markierungskonflikte-geaendert', {
      pruefstatus: stand?.pruefstatus ?? 'ausstehend',
    });
  } catch (fehler) {
    console.error('Markierungskonflikt-Benachrichtigung fehlgeschlagen:', fehler);
    // Der dauerhafte Stand bleibt erfolgreich geschrieben. Ohne ausdrücklichen
    // Empfänger bleibt der bisherige Hauptfensterstandard (Protokoll) erhalten.
    if (meldungEmpfangen)
      meldePersistenzBefund(
        {
          typ: 'warnung',
          art: 'hinweis',
          anlass: 'synchronisation',
          aenderungsstand: 'vollstaendig',
          text: 'Der Stand der Markierungskonflikte wurde gespeichert. Andere Fenster konnten jedoch nicht zuverlässig über die Änderung benachrichtigt werden.',
        },
        meldungEmpfangen,
      );
  }
}
