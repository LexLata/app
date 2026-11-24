// gesetzImportAbschluss.ts
// Gemeinsamer Abschluss für noch nicht vertaggtes GesetzesXML aus Bund,
// BW und den entsprechenden Dateiimporten: Verweise taggen, Inhalt prüfen,
// mit dem Bestand vergleichen und speichern.

import type { GesetzAktualisierungsBestand } from '@/lib/domain/gesetzTypes';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import { pruefeReparaturreferenz } from './gesetzImportZiel';
import type { Normgeber } from '@/lib/domain/gesetzTypes';
import { isoZeitstempel } from '@/lib/utils/xmlVerarbeitung';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { speichereImportGesetz } from './gesetzImportSpeichern';
import { ladeGesetzesXML, leseGesetz } from '@/lib/persistenz/gesetz/gesetz.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { taggeVerweise } from '@/lib/import/basis/basis.index';
import type { Gesetzesreferenz, GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type {
  AktualisierungsErgebnis,
  ImportEinzelErgebnis,
  ImportFehler,
  ImportFortschritt,
  GesetzImportZielpruefung,
} from '@/lib/import/importVertrag.types';
import { mitReferenzKontext } from './referenzKontext';
import type { ReferenzKontext } from './referenzKontext';
import { gesetzesXMLOhneVeraenderlicheFelder } from '@/lib/import/importabschluss/gesetzVergleich';
import { messeSync } from '@/lib/utils/perfMessung';

/** Taggt mit Rest-/Leerlisten; ohne Normgeber nur Eigenzuordnungen, ohne
 * Quellenzugriff. Ohne Kontext wird ein eigener Vorgang abgeschlossen. */
export async function taggeGesetzesXML(
  xmlString: string,
  kurztitel: string,
  normgeber: Normgeber,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string> {
  const gesetz = parseGesetzesXML(xmlString);
  if (!gesetz || normgeber !== gesetz.normgeber) {
    throw new Error('GesetzesXML ist nicht lesbar oder enthält einen unpassenden Normgeber.');
  }
  const taggen = async (referenzKontext: ReferenzKontext) => {
    const gesetzRefs = await referenzKontext.referenzenFuer(gesetz.normgeber);
    return messeSync('taggeVerweise', () =>
      taggeVerweise(xmlString, { kurztitel, normgeber: gesetz.normgeber }, gesetzRefs, {
        normpraefix: gesetz.normpraefix,
      }),
    );
  };
  return kontext ? taggen(kontext) : mitReferenzKontext(taggen, meldungEmpfangen);
}

export async function vergleicheGesetzesXMLMitBestand(
  referenz: Gesetzesreferenz,
  xmlString: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<'neu' | 'unveraendert' | 'geaendert'> {
  const gelesen = await leseGesetz(referenz, meldungEmpfangen);
  if (gelesen.status === 'nicht-lesbar')
    throw new Error('Das vorhandene Gesetz konnte nicht verlässlich geprüft werden.');
  if (gelesen.status === 'fehlt') return 'neu';
  const bestehendesXML = await ladeGesetzesXML(referenz, meldungEmpfangen);
  if (bestehendesXML === null)
    throw new Error('Die vorhandene Gesetzesdatei konnte nicht gelesen werden.');
  return gesetzesXMLOhneVeraenderlicheFelder(bestehendesXML, referenz) ===
    gesetzesXMLOhneVeraenderlicheFelder(xmlString, referenz)
    ? 'unveraendert'
    : 'geaendert';
}

// Der Vergleich erfolgt nach dem Verweis-Tagging. Eine veränderte
// Verweis-Taggung gilt damit ebenfalls als Änderung der gespeicherten Datei.
/** Ersetzt nur den Inhalt des verarbeitungszeit-Tags in einem bereits gespeicherten
 *  GesetzesXML-String, ohne den Rest der Datei anzufassen. */
function mitNeuerVerarbeitungszeit(xml: string, zeit: Date): string {
  return xml.replace(
    /<verarbeitungszeit>[^<]*<\/verarbeitungszeit>/,
    `<verarbeitungszeit>${isoZeitstempel(zeit)}</verarbeitungszeit>`,
  );
}

/** Validiert den Normgeber vor Quellenwahl, taggt idempotent, prüft und speichert.
 * Referenzfehler verhindern den Abschluss nicht; Format-/Speicherfehler ergeben
 * art:fehler. Gezielte Abbrüche der Reparaturzielprüfung bleiben geworfene Fehler.
 */
export function taggeUndSpeichereGesetzesXML(
  xmlString: string,
  kurztitel: string,
  fortschritt?: (f: ImportFortschritt) => void,
  parseFehlerText?: string,
  istAktualisierung?: false,
  bestehendesGesetz?: GesetzAktualisierungsBestand,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis>;
export function taggeUndSpeichereGesetzesXML(
  xmlString: string,
  kurztitel: string,
  fortschritt: ((f: ImportFortschritt) => void) | undefined,
  parseFehlerText: string | undefined,
  istAktualisierung: true,
  bestehendesGesetz?: GesetzAktualisierungsBestand,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis>;
export async function taggeUndSpeichereGesetzesXML(
  xmlString: string,
  kurztitel: string,
  fortschritt?: (f: ImportFortschritt) => void,
  parseFehlerText = 'XML konnte nicht gelesen werden.',
  istAktualisierung = false,
  /** Das VOR der Aktualisierung im Speicher gehaltene Gesetz-Objekt (aus dem
   *  Aufrufer, z.B. AktualisierenOverlay). Nur für den 'unveraendert'-Fall
   *  relevant: dort wird bewusst DIESES Objekt (unverändert, nur verarbeitungszeit
   *  gepatcht) zurückgegeben statt die aufgefrischte XML neu zu parsen –
   *  ein Neu-Parse würde ein komplett neues elemente-Array mit neuen,
   *  zufälligen Laufzeit-ids erzeugen (siehe Projektgrundsatz "id-Felder
   *  sind pro Parse-Lauf zufällig neu"), obwohl sich inhaltlich nichts
   *  geändert hat – das würde in einem bereits offenen Tab Scrollposition
   *  und aktivierte Norm zerstören, obwohl gar kein Remount stattfindet. */
  bestehendesGesetz?: GesetzAktualisierungsBestand,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportEinzelErgebnis | AktualisierungsErgebnis> {
  if (!kontext) {
    return mitReferenzKontext((eigenerKontext) => abschliessen(eigenerKontext), meldungEmpfangen);
  }
  return abschliessen(kontext);

  async function abschliessen(
    referenzKontext: ReferenzKontext,
  ): Promise<ImportEinzelErgebnis | AktualisierungsErgebnis> {
    const rohGesetz = parseGesetzesXML(xmlString);
    if (!rohGesetz) {
      return { art: 'fehler', fehler: { grund: 'format', meldung: parseFehlerText } };
    }
    // Leerschutz für alle Quellen: ein Abruf ohne eine einzige Norm (z. B. geänderte
    // Quellstruktur) darf weder einen Bestand überschreiben noch als Gesetz entstehen.
    if (!rohGesetz.elemente.some((element) => element.typ === 'norm')) {
      return {
        art: 'fehler',
        fehler: {
          grund: 'format',
          meldung: `${rohGesetz.kurztitel}: Die Quelle enthält keine Normen.${istAktualisierung ? ' Die bestehende Fassung wurde beibehalten.' : ''}`,
        },
      };
    }
    fortschritt?.({ phase: 'vertaggen', meldung: 'Verweise werden getaggt …' });
    const getaggtesXML = await taggeGesetzesXML(
      xmlString,
      kurztitel,
      rohGesetz.normgeber,
      referenzKontext,
    );
    const gesetz = parseGesetzesXML(getaggtesXML);
    if (!gesetz) return { art: 'fehler', fehler: { grund: 'format', meldung: parseFehlerText } };

    const zielfehler = pruefeImportZiel(gesetz, zielpruefung);
    if (zielfehler) return { art: 'fehler', fehler: zielfehler };

    // Bei einer Aktualisierung erst mit der bestehenden Datei vergleichen,
    // statt sie sofort zu ersetzen (siehe Absprache): unverändert → nur der
    // verarbeitungszeit-Tag wird aufgefrischt, geändert → Datei wird ersetzt.
    if (istAktualisierung) {
      const ergebnis = await aktualisiereGesetzesXML(
        gesetz,
        getaggtesXML,
        fortschritt,
        bestehendesGesetz,
        zielpruefung,
        meldungEmpfangen,
      );
      if (ergebnis.art === 'erfolg') referenzKontext.merkeGespeichertesGesetz(ergebnis.gesetz);
      return ergebnis;
    }

    // Erst-Import: keine Vergleichsbasis vorhanden, immer speichern.
    const fehler = await speichereMitFortschritt(
      gesetz,
      getaggtesXML,
      'importiert',
      fortschritt,
      zielpruefung,
      meldungEmpfangen,
    );
    if (fehler) return { art: 'fehler', fehler };

    referenzKontext.merkeGespeichertesGesetz(gesetz);
    return { art: 'erfolg', gesetz };
  }
}

function pruefeImportZiel(
  gesetz: GesetzDarstellung,
  zielpruefung?: GesetzImportZielpruefung,
): ImportFehler | null {
  if (!zielpruefung) return null;
  return pruefeReparaturreferenz(zielpruefung.ziel, gesetz);
}

async function aktualisiereGesetzesXML(
  gesetz: GesetzDarstellung,
  getaggtesXML: string,
  fortschritt?: (f: ImportFortschritt) => void,
  bestehendesGesetz?: GesetzAktualisierungsBestand,
  zielpruefung?: GesetzImportZielpruefung,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis> {
  const gelesen = await leseGesetz(referenzVon(gesetz), meldungEmpfangen);
  if (gelesen.status === 'nicht-lesbar')
    return {
      art: 'fehler',
      fehler: {
        grund: 'laden',
        meldung: 'Das vorhandene Gesetz konnte nicht verlässlich geprüft werden.',
      },
    };
  const altesXML =
    gelesen.status === 'fehlt'
      ? null
      : await ladeGesetzesXML(referenzVon(gesetz), meldungEmpfangen);
  if (gelesen.status === 'geladen' && altesXML === null)
    return {
      art: 'fehler',
      fehler: {
        grund: 'laden',
        meldung: 'Die vorhandene Gesetzesdatei konnte nicht gelesen werden.',
      },
    };

  if (
    altesXML !== null &&
    gesetzesXMLOhneVeraenderlicheFelder(altesXML, gesetz) ===
      gesetzesXMLOhneVeraenderlicheFelder(getaggtesXML, gesetz)
  ) {
    const jetzt = new Date();
    const aufgefrischtesXML = mitNeuerVerarbeitungszeit(altesXML, jetzt);

    fortschritt?.({ phase: 'speichern', meldung: 'Prüfzeitpunkt wird aktualisiert …' });
    // inhaltGeaendert: false – nur der verarbeitungszeit-Tag wurde aufgefrischt,
    // eine Neuprüfung der Markierungen wäre hier verschwendete Arbeit.
    const fehler = await speichereMitFehlerErgebnis(
      gesetz,
      aufgefrischtesXML,
      false,
      zielpruefung,
      meldungEmpfangen,
    );
    if (fehler) return { art: 'fehler', fehler };

    fortschritt?.({ phase: 'fertig', meldung: `${gesetz.kurztitel}: keine Neuerungen.` });

    // Bewusst NICHT neu geparst (siehe Doku oben am Parameter
    // bestehendesGesetz) – falls es fehlt (z.B. Aufruf ohne Kontext),
    // als Fallback doch neu parsen, damit trotzdem ein korrektes Ergebnis
    // zurückkommt.
    const unveraendertesGesetz = bestehendesGesetz?.elemente
      ? {
          ...bestehendesGesetz,
          elemente: bestehendesGesetz.elemente,
          ...referenzVon(gesetz),
          verarbeitungszeit: jetzt,
        }
      : (() => {
          const g = parseGesetzesXML(aufgefrischtesXML);
          if (g) {
            Object.assign(g, referenzVon(gesetz));
          }
          return g ?? gesetz;
        })();
    return { art: 'erfolg', gesetz: unveraendertesGesetz, kategorie: 'unveraendert' };
  }

  const fehler = await speichereMitFortschritt(
    gesetz,
    getaggtesXML,
    'aktualisiert',
    fortschritt,
    zielpruefung,
    meldungEmpfangen,
  );
  if (fehler) return { art: 'fehler', fehler };

  return { art: 'erfolg', gesetz, kategorie: 'aktualisiert' };
}

async function speichereMitFortschritt(
  gesetz: GesetzDarstellung,
  xml: string,
  aktion: 'importiert' | 'aktualisiert',
  fortschritt?: (f: ImportFortschritt) => void,
  zielpruefung?: GesetzImportZielpruefung,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportFehler | null> {
  fortschritt?.({ phase: 'speichern', meldung: 'Wird gespeichert …' });
  const fehler = await speichereMitFehlerErgebnis(
    gesetz,
    xml,
    undefined,
    zielpruefung,
    meldungEmpfangen,
  );
  if (fehler) return fehler;
  fortschritt?.({ phase: 'fertig', meldung: `${gesetz.kurztitel} erfolgreich ${aktion}.` });
  return null;
}

async function speichereMitFehlerErgebnis(
  gesetz: GesetzDarstellung,
  xml: string,
  inhaltGeaendert?: boolean,
  zielpruefung?: GesetzImportZielpruefung,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<ImportFehler | null> {
  // Gezielte Prüfungsabbrüche bleiben erkennbar; sie sind keine Speicherfehler.
  await zielpruefung?.vorSchreiben();
  return speichereImportGesetz(gesetz, xml, inhaltGeaendert, meldungEmpfangen);
}
