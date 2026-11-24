// Lädt nichtamtliche Titel, sichert ungültige Dateien und ergänzt die Darstellung.
import { NICHTAMTLICHE_TITEL_SUFFIX } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { vollstaendigeBezeichnung } from '@/lib/domain/norm/norm.index';
import {
  appDatenExistiert,
  appDatenLesen,
  ermittleGesetzDateipfad,
  sichereBeiUngueltigemInhalt,
} from '@/lib/persistenz/kern/kern.index';

import { NICHTAMTLICHE_TITEL_ORDNER, mitTitelQuelle } from './nichtamtlicheTitelSpeicher';
import {
  normalisiereBezeichnung,
  pruefeNichtamtlicheTitelXML,
  titelMeldungen,
} from './nichtamtlicheTitelSpeicher.pruefen';
/** Die Titelquelle ersetzt die generischen Sicherungstexte durch eigene Meldungen. */
function titelSicherungsEmpfaenger(
  befund: { lesefehler: boolean },
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): AktionsMeldungEmpfaenger | undefined {
  if (!meldungEmpfangen) return undefined;
  return (meldung) => {
    if (meldung.anlass === 'lesen' && meldung.art === 'fehler') befund.lesefehler = true;
    if (meldung.anlass === 'lesen' && meldung.art === 'hinweis') meldungEmpfangen(meldung);
  };
}

/** Lädt optionale Titel. Ungültige Dateien werden durch die native
 * Vergleichssicherung geschützt; nur bestätigte Entfernung meldet eine
 * Änderung der Dateiexistenz. Resource-Sync bleibt bei seinen Aufrufern. */
export async function ladeNichtamtlicheTitel(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<Map<string, string> | null> {
  const melde = titelMeldungen(meldungEmpfangen);
  // Generische Sicherungsbefunde erhalten unten die bisherigen Titeltexte.
  const sicherungsBefund = { lesefehler: false };
  const sicherungEmpfangen = titelSicherungsEmpfaenger(sicherungsBefund, meldungEmpfangen);
  let pfad = '';
  let xml: string | null;
  /** Betroffene Datei für die gegliederte Anzeige; Pfad nur im Detail. */
  const datei = () => pfad.split('/').at(-1) || `Titeldatei ${gesetz.kurztitel}`;
  try {
    pfad = await ermittleGesetzDateipfad(
      gesetz,
      NICHTAMTLICHE_TITEL_ORDNER,
      NICHTAMTLICHE_TITEL_SUFFIX,
    );
    xml = await appDatenLesen(pfad, undefined, meldungEmpfangen);
  } catch {
    try {
      if (pfad && !(await appDatenExistiert(pfad))) return null;
    } catch {
      // Auch eine fehlgeschlagene Existenzprüfung belegt keine fehlende Datei.
    }
    melde(
      'fehler',
      `Die Titeldatei für „${gesetz.kurztitel}“ konnte nicht gelesen werden. Ihre Titel werden derzeit nicht angezeigt.`,
      'lesen',
      'keine',
      { grund: 'nichtLesbar', betroffen: datei() },
    );
    return null;
  }
  if (xml === null) return null;

  // Die reine Prüfung wird beim nativen Inhaltsvergleich erneut verwendet.
  // Der Meldungsgrund stammt aus dem zuletzt tatsächlich geprüften Inhalt.
  let letzterInhalt = xml;
  const grundtext = (): string =>
    pruefeNichtamtlicheTitelXML(letzterInhalt, gesetz).status === 'falsch_zugeordnet'
      ? `Die Titeldatei für „${gesetz.kurztitel}“ passte nicht zum Gesetz.`
      : `Die Titeldatei für „${gesetz.kurztitel}“ war beschädigt.`;
  let ergebnis;
  try {
    const pruefe = (inhalt: string) => {
      letzterInhalt = inhalt;
      return pruefeNichtamtlicheTitelXML(inhalt, gesetz).status === 'gueltig';
    };
    ergebnis = await sichereTiteldatei(gesetz, pfad, xml, pruefe, {
      meldungEmpfangen,
      sicherungEmpfangen,
    });
  } catch {
    melde(
      'fehler',
      sicherungsBefund.lesefehler
        ? `Die Titeldatei für „${gesetz.kurztitel}“ konnte nicht gelesen werden. Ihre Titel werden derzeit nicht angezeigt.`
        : `${grundtext()} Die Datei konnte nicht gesichert werden. Ihre Titel werden derzeit nicht angezeigt.`,
      sicherungsBefund.lesefehler ? 'lesen' : 'sicherung',
      'keine',
      {
        grund: sicherungsBefund.lesefehler ? 'nichtLesbar' : 'sicherungFehlgeschlagen',
        betroffen: datei(),
      },
    );
    return null;
  }
  // Leere Dateien werden wie ungültige gesichert, aber als leer gemeldet.
  const leer = letzterInhalt.trim().length === 0;
  return werteTitelSicherungAus(ergebnis, { gesetz, pfad, melde, grundtext, datei, leer });
}

/** Wertet das Sicherungsergebnis aus; Sicherungspfade nur in der Konsole. */
function werteTitelSicherungAus(
  ergebnis: Awaited<ReturnType<typeof sichereTiteldatei>>,
  {
    gesetz,
    pfad,
    melde,
    grundtext,
    datei,
    leer,
  }: {
    gesetz: Gesetzesreferenz;
    pfad: string;
    melde: ReturnType<typeof titelMeldungen>;
    grundtext: () => string;
    datei: () => string;
    leer: boolean;
  },
): Map<string, string> | null {
  if ('sicherungspfad' in ergebnis) console.info(`${pfad}: Sicherung ${ergebnis.sicherungspfad}`);
  switch (ergebnis.status) {
    case 'gueltig': {
      const pruefung = pruefeNichtamtlicheTitelXML(ergebnis.inhalt, gesetz);
      return pruefung.status === 'gueltig' ? pruefung.titel : null;
    }
    case 'archiviert':
      if (leer) return meldeLeer(gesetz, melde, datei, 'teilweise');
      melde('warnung', `${grundtext()} Sie wurde gesichert.`, 'sicherung', 'teilweise', {
        grund: 'imDatenordnerGesichert',
        betroffen: datei(),
        sicherung: ergebnis.sicherungspfad,
      });
      return null;
    case 'gesichert_aber_nicht_entfernt':
      melde(
        'warnung',
        `${grundtext()} Sie wurde gesichert, aber nicht entfernt; ihre Titel werden derzeit nicht angezeigt.`,
        'sicherung',
        'teilweise',
        {
          grund: 'gesichertNichtEntfernt',
          betroffen: datei(),
          sicherung: ergebnis.sicherungspfad,
        },
      );
      return null;
    case 'leer':
      return meldeLeer(gesetz, melde, datei, 'keine');
    case 'fehlt':
      return null;
  }
}

function meldeLeer(
  gesetz: Gesetzesreferenz,
  melde: ReturnType<typeof titelMeldungen>,
  datei: () => string,
  /** Eine gesicherte leere Datei wurde entfernt. */
  aenderungsstand: 'keine' | 'teilweise',
): null {
  melde(
    'warnung',
    `Die Titeldatei für „${gesetz.kurztitel}“ ist leer. Ihre Titel werden derzeit nicht angezeigt.`,
    // Die gesicherte und entfernte Datei bleibt ein Sicherungsbefund.
    aenderungsstand === 'teilweise' ? 'sicherung' : 'lesen',
    aenderungsstand,
    { grund: 'dateiLeer', betroffen: datei() },
  );
  return null;
}

/** Bewahrt frisches Lesen und Sicherung unter derselben vorgemerkten Titelquelle. */
async function sichereTiteldatei(
  gesetz: Gesetzesreferenz,
  pfad: string,
  xml: string,
  pruefe: (inhalt: string) => boolean,
  {
    meldungEmpfangen,
    sicherungEmpfangen,
  }: {
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
    sicherungEmpfangen?: AktionsMeldungEmpfaenger;
  },
) {
  if (pruefe(xml)) {
    return sichereBeiUngueltigemInhalt(pfad, xml, pruefe, {
      leerenInhaltPruefen: true,
      bannerAnzeigen: false,
      meldungEmpfangen: sicherungEmpfangen,
    });
  } else {
    return mitTitelQuelle(
      gesetz,
      async (token, vorgang, melde) => {
        pfad = await ermittleGesetzDateipfad(
          gesetz,
          NICHTAMTLICHE_TITEL_ORDNER,
          NICHTAMTLICHE_TITEL_SUFFIX,
        );
        let frischerInhalt: string | null;
        try {
          frischerInhalt = await appDatenLesen(pfad, undefined, meldungEmpfangen);
        } catch (fehler) {
          if (await appDatenExistiert(pfad)) throw fehler;
          frischerInhalt = null;
        }
        const gesichert = await sichereBeiUngueltigemInhalt(pfad, frischerInhalt, pruefe, {
          leerenInhaltPruefen: true,
          bannerAnzeigen: false,
          meldungEmpfangen: sicherungEmpfangen,
          token,
          vorgang,
        });
        if (gesichert.status === 'archiviert') melde('geaendert');
        else if (gesichert.status === 'gesichert_aber_nicht_entfernt') melde('fehlgeschlagen');
        return gesichert;
      },
      meldungEmpfangen,
    );
  }
}

/**
 * Ergänzt bei allen Normen des Gesetzes OHNE amtlichen Titel den passenden
 * nichtamtlichen Titel aus der Map (sofern vorhanden). Mutiert die
 * übergebenen NormDarstellung-Objekte direkt (analog zum zweiten Pass in
 * gesetzesXMLParser.ts für ueberschriftartig – hier bewusst NICHT im
 * Parser selbst, siehe Absprache: Parser bleibt rein synchron/pipeline-
 * unabhängig, die Anwendung passiert erst beim Laden für die Anzeige, siehe
 * gesetzSpeicher.ts::ladeGesetz).
 * Der XML-Bauer übernimmt den Weggefallen-Wortlaut als amtlichen Titel.
 * Solche Normen werden wie alle Normen mit vorhandenem Titel übersprungen.
 */
export function wendeNichtamtlicheTitelAn(
  gesetz: GesetzDarstellung,
  titelMap: Map<string, string>,
): void {
  for (const el of gesetz.elemente) {
    if (el.typ !== 'norm' || el.data.titel) continue;
    const bezeichnung = vollstaendigeBezeichnung(gesetz, el.data.xmlId);
    if (!bezeichnung) continue;
    const titel = titelMap.get(normalisiereBezeichnung(bezeichnung));
    if (!titel) continue;
    el.data.titel = titel;
    el.data.titelIstNichtamtlich = true;
  }
}

/** Prüft ohne I/O, ob im Gesetz überhaupt eine Norm ohne amtlichen Titel
 *  vorkommt – Vorabprüfung, damit der Einzelzugriff nur für
 *  tatsächlich betroffene Gesetze (z.B. GG) eine zusätzliche Dateileseoperation
 *  auslöst, nicht für jedes geladene Gesetz. */
export function hatNormenOhneTitel(gesetz: GesetzDarstellung): boolean {
  return gesetz.elemente.some((el) => el.typ === 'norm' && !el.data.titel);
}
