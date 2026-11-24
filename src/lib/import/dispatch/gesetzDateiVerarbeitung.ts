// gesetzDateiVerarbeitung.ts
//
// Verarbeitet erkannte Gesetzdateien aus Bund, BW, EU und GesetzesXML.
// verarbeiteGesetzDatei liefert getaggtes XML und GesetzInfos für den
// Vergleich ohne vollständige Darstellung. mitGesetzDateiImport registriert
// den Vorgang; seine Dateioperation speichert neue Gesetze und gibt Änderungen
// als Konflikt zurück.
// Der Vergleich ignoriert den Verarbeitungszeitpunkt.

import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { GesetzInfos } from '@/lib/domain/gesetzInfos';
import type { NachbereitungBeiImport } from '@/lib/einstellungen/einstellungen.index';
import { liesNormgeber, referenzVon } from '@/lib/domain/gesetzesreferenz';
import {
  leseGesetzInfos,
  speichereGesetz,
  GesetzSpeicherFolgefehler,
  leseGesetz,
  mitSpeicherSammelbatch,
  type SpeicherSammelbatch,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { LANDESRECHT_BW_QUELLE } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  mitReferenzKontext,
  type ReferenzKontext,
  nachbereiteGesetzesXML,
  taggeGesetzesXML,
  vergleicheGesetzesXMLMitBestand,
} from '@/lib/import/importabschluss/importabschluss.index';
import { sucheImImportindexPerLangtitel } from '@/lib/import/importindex/importindex.index';
import type {
  GesetzDateiErgebnis,
  GesetzDateiFormat,
  GesetzDateiImport,
} from '@/lib/import/importVertrag.types';
import {
  gibGesetzSperreFrei,
  mitManuellemImportVorgang,
  versucheGesetzSperreZuErhalten,
} from '@/lib/import/dispatch/importVorgang';

type RohGesetzImport = {
  xmlString?: string;
  kurztitel?: string;
  langtitel?: string;
  fehler?: string;
};

/** Führt `importMitOverride` NUR aus, wenn per Langtitel-Suche im Importindex ein
 *  bereits bekanntes Gesetz gefunden wird – sorgt dafür, dass ein
 *  Neu-Import eines Gesetzes, dessen Kurztitel sich seit dem letzten Import
 *  geändert hat (oder das erstmals über Langtitel-Matching gefunden wird),
 *  denselben Kurztitel wie der Bestand bekommt statt einen neuen
 *  XML-Dateinamen anzulegen. Gemeinsame Logik von 'bja-xml' und
 *  'html-bw' (siehe holeRohGesetzImport unten) – bei `vorlauf.fehler`
 *  wird die (unnötige) Importindex-Suche übersprungen. */
async function mitKurztitelOverride(
  vorlauf: RohGesetzImport,
  importindexKategorie: ImportindexKategorie,
  importMitOverride: (kurztitel: string) => RohGesetzImport,
  kontext: ReferenzKontext,
): Promise<RohGesetzImport> {
  if (vorlauf.fehler) return vorlauf;
  try {
    const kurztitelOverride = (
      await sucheImImportindexPerLangtitel(importindexKategorie, vorlauf.langtitel ?? '')
    )?.kurztitel;
    return kurztitelOverride ? importMitOverride(kurztitelOverride) : vorlauf;
  } catch (fehler) {
    kontext.meldeEinschraenkung(
      importindexKategorie,
      `Kurztitelabgleich nicht möglich; der Kurztitel der Quelldatei bleibt erhalten und kann zu einer abweichenden Dateizuordnung führen. ${fehler instanceof Error ? fehler.message : String(fehler)}`,
    );
    return vorlauf;
  }
}

async function holeRohGesetzImport(
  format: 'bja-xml' | 'html-bw',
  inhalt: string,
  kontext: ReferenzKontext,
): Promise<RohGesetzImport> {
  switch (format) {
    case 'bja-xml': {
      const { importiereBundXML } = await import('@/lib/import/bund/bund.index');
      // Der Anzeigetext bleibt für die Anzeige erhalten; die Herkunft steht
      // unabhängig davon als <normgeber> im GesetzesXML.
      const vorlauf = importiereBundXML(inhalt, 'Gesetze im Internet');
      return mitKurztitelOverride(
        vorlauf,
        NORMGEBER_DE_BUND,
        (kurztitel) => importiereBundXML(inhalt, 'Gesetze im Internet', kurztitel),
        kontext,
      );
    }
    case 'html-bw': {
      const { importiereGesetzHTMLBW } = await import('@/lib/import/bw/bw.index');
      // Anzeigetext und Dateibenennung sind über <normgeber> entkoppelt.
      const vorlauf = importiereGesetzHTMLBW(inhalt, LANDESRECHT_BW_QUELLE);
      return mitKurztitelOverride(
        vorlauf,
        NORMGEBER_DE_BW,
        (kurztitel) => importiereGesetzHTMLBW(inhalt, LANDESRECHT_BW_QUELLE, true, kurztitel),
        kontext,
      );
    }
  }
}

/** Unterscheidet fehlende Pflichtangaben von nicht lesbarem XML. */
function gesetzesXMLLesefehler(inhalt: string): string {
  const doc = new DOMParser().parseFromString(inhalt, 'application/xml');
  const infos = Array.from(doc.documentElement.children).find((el) => el.tagName === 'infos');
  const kurztitel = infos && Array.from(infos.children).find((el) => el.tagName === 'kurztitel');
  if (
    !doc.querySelector('parsererror') &&
    doc.documentElement.tagName === 'gesetz' &&
    infos &&
    !kurztitel?.textContent?.trim()
  )
    return 'Fehlender oder leerer Kurztitel in <infos> des Gesetz-XML.';
  if (!doc.querySelector('parsererror') && doc.documentElement.tagName === 'gesetz' && infos) {
    try {
      const normgeber = Array.from(infos.children).find((el) => el.tagName === 'normgeber');
      if (!liesNormgeber(normgeber?.textContent))
        return 'Ungültiger oder fehlender Normgeber im Gesetz-XML.';
    } catch (fehler) {
      return fehler instanceof Error ? fehler.message : String(fehler);
    }
  }
  return 'XML konnte nicht gelesen werden.';
}

/**
 * Verarbeitet den rohen Inhalt einer bereits als Gesetz-Format erkannten
 * Datei bis zum getaggten, GesetzesXML samt gelesenen GesetzInfos.
 * SPEICHERT NICHTS (siehe vergleicheMitBestand + Datei-Kommentar).
 *
 * `optionen.nachbereitungBeiImport`: NUR bei format === 'kanonisch-xml' relevant
 * (Nutzereinstellung "Beim Import taggen" – die Einstellung selbst
 * bleibt AUSSERHALB dieses Moduls, der Aufrufer liest sie und reicht nur
 * die Entscheidung durch). Bei Bundes- und BW-Quelldateien wird IMMER
 * vertaggt, dort gibt es keine Wahl.
 */
export async function verarbeiteGesetzDatei(
  format: 'bja-xml' | 'kanonisch-xml' | 'html-bw',
  inhalt: string,
  optionen?: {
    nachbereitungBeiImport?: NachbereitungBeiImport;
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
  },
  kontext?: ReferenzKontext,
): Promise<
  | { getaggtesXML: string; gesetz: GesetzInfos; nachbereitungsfehler?: string[] }
  | { fehler: string }
> {
  if (!kontext)
    return mitReferenzKontext(
      (eigenerKontext) => verarbeiteGesetzDatei(format, inhalt, optionen, eigenerKontext),
      optionen?.meldungEmpfangen,
    );
  if (format === 'kanonisch-xml') {
    const infos = leseGesetzInfos(inhalt);
    if (!infos) {
      return { fehler: gesetzesXMLLesefehler(inhalt) };
    }
    if (!infos.kurztitel.trim())
      return { fehler: 'Fehlender oder leerer Kurztitel in <infos> des Gesetz-XML.' };
    const nachbereitungsfehler: string[] = [];
    const modus = optionen?.nachbereitungBeiImport ?? 'aus';
    const nachbereitet =
      modus !== 'aus'
        ? await nachbereiteGesetzesXML(inhalt, kontext, modus, (meldung) =>
            nachbereitungsfehler.push(meldung),
          )
        : inhalt;
    return {
      getaggtesXML: nachbereitet,
      gesetz: infos,
      ...(nachbereitungsfehler.length > 0 ? { nachbereitungsfehler } : {}),
    };
  }

  const roh = await holeRohGesetzImport(format, inhalt, kontext);
  if (roh.fehler || !roh.xmlString) return { fehler: roh.fehler ?? 'Unbekannter Fehler.' };

  const rohInfos = leseGesetzInfos(roh.xmlString);
  if (!rohInfos) return { fehler: 'XML konnte nicht gelesen werden.' };
  const normgeber = liesNormgeber(rohInfos.normgeber);
  if (!normgeber) return { fehler: 'Ungültiger oder fehlender Normgeber im Gesetz-XML.' };

  const getaggtesXML = await taggeGesetzesXML(
    roh.xmlString,
    roh.kurztitel ?? '',
    normgeber,
    kontext,
  );
  const infos = leseGesetzInfos(getaggtesXML);
  if (!infos) return { fehler: 'XML konnte nicht gelesen werden.' };
  if (!liesNormgeber(infos.normgeber))
    return { fehler: 'Ungültiger oder fehlender Normgeber im Gesetz-XML.' };
  return { getaggtesXML, gesetz: infos };
}

/**
 * Vergleicht ein bereits getaggtes/geparstes Gesetz mit einer evtl.
 * bestehenden, bereits gespeicherten Version (Vergleich ignoriert den
 * verarbeitungszeit-Tag – ein rein zeitlich aufgefrischter Bestand gilt als
 * 'unveraendert', siehe gesetzesXMLOhneVeraenderlicheFelder). SPEICHERT NICHTS, reine Auskunft.
 */
export async function vergleicheMitBestand(
  getaggtesXML: string,
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<'neu' | 'unveraendert' | 'geaendert'> {
  return vergleicheGesetzesXMLMitBestand(referenzVon(gesetz), getaggtesXML, meldungEmpfangen);
}

/** Registriert eine vollständige Sammelarbeit und wartet auch bei Ausnahme auf
 * gestartete Dateiimporte, bevor Kontext und Registrierung freigegeben werden.
 * Alle Speicherungen gehören einem Sammelbatch, der erst nach dem Ende aller
 * gestarteten Dateiimporte einmal abschließt. */
export async function mitGesetzDateiImport<T>(
  arbeit: (importiereDatei: GesetzDateiImport) => Promise<T>,
): Promise<T> {
  return mitManuellemImportVorgang(() =>
    mitReferenzKontext((kontext) =>
      mitSpeicherSammelbatch(async (batch) => {
        let aktiv = true;
        const gestartet: Promise<GesetzDateiErgebnis>[] = [];
        const importiereDatei: GesetzDateiImport = async (format, inhalt, optionen) => {
          if (!aktiv) throw new Error('Der Datei-Import ist bereits beendet.');
          // Ein ausdrücklicher Dateiempfänger besitzt nur die tatsächlich für
          // diese Datei verwendeten Referenzdiagnosen; keine Batch-Pauschalzuordnung.
          const aufruf = optionen?.meldungEmpfangen
            ? kontext.mitMeldungsempfaenger(
                (dateiKontext) =>
                  importiereGesetzDateiImKontext(format, inhalt, optionen, dateiKontext, batch),
                optionen.meldungEmpfangen,
              )
            : importiereGesetzDateiImKontext(format, inhalt, optionen, kontext, batch);
          gestartet.push(aufruf);
          return aufruf;
        };
        try {
          return await arbeit(importiereDatei);
        } finally {
          aktiv = false;
          await Promise.allSettled(gestartet);
        }
      }),
    ),
  );
}

/** Bewahrt bestätigte Zielspeicherungen auch bei einem fehlgeschlagenen Abschluss. */
async function speichereNeuesGesetz(
  gesetz: GesetzInfos,
  getaggtesXML: string,
  bericht: { nachbereitungsfehler?: string[] },
  kontext: ReferenzKontext,
  batch: SpeicherSammelbatch,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDateiErgebnis> {
  let geschrieben = false;
  try {
    Object.assign(
      gesetz,
      await speichereGesetz(gesetz, getaggtesXML, {
        inhaltGeaendert: true,
        meldungEmpfangen,
        zielGeschrieben: () => {
          geschrieben = true;
          kontext.merkeGespeichertesGesetz(gesetz);
        },
        sammelbatch: batch,
      }),
    );
  } catch (fehler) {
    const meldung = fehler instanceof Error ? fehler.message : String(fehler);
    if (geschrieben) {
      if (!(fehler instanceof GesetzSpeicherFolgefehler))
        meldungEmpfangen?.({
          typ: 'fehler',
          art: 'hinweis',
          anlass: 'synchronisation',
          aenderungsstand: 'vollstaendig',
          grund: 'abschlussFehlgeschlagen',
          betroffen: gesetz.kurztitel,
          detail: meldung,
          text: `Das Gesetz wurde gespeichert. Beim anschließenden Abschluss: ${meldung}`,
        });
      return { art: 'neu', kurztitel: gesetz.kurztitel, ...bericht };
    }
    return {
      art: 'fehler',
      fehler: {
        grund: 'speichern',
        meldung,
      },
    };
  }
  return { art: 'neu', kurztitel: gesetz.kurztitel, ...bericht };
}

async function importiereGesetzDateiImKontext(
  format: GesetzDateiFormat,
  inhalt: string,
  optionen:
    | {
        nachbereitungBeiImport?: NachbereitungBeiImport;
        meldungEmpfangen?: AktionsMeldungEmpfaenger;
      }
    | undefined,
  kontext: ReferenzKontext,
  batch: SpeicherSammelbatch,
): Promise<GesetzDateiErgebnis> {
  try {
    const verarbeitet = await verarbeiteGesetzDatei(format, inhalt, optionen, kontext);
    if ('fehler' in verarbeitet) {
      return { art: 'fehler', fehler: { grund: 'format', meldung: verarbeitet.fehler } };
    }
    const { getaggtesXML, gesetz } = verarbeitet;
    const bericht = verarbeitet.nachbereitungsfehler
      ? { nachbereitungsfehler: verarbeitet.nachbereitungsfehler }
      : {};
    if (
      !(await versucheGesetzSperreZuErhalten({
        kurztitel: gesetz.kurztitel,
        normgeber: gesetz.normgeber,
      }))
    ) {
      return {
        art: 'fehler',
        fehler: {
          grund: 'beschaeftigt',
          meldung: `${gesetz.kurztitel} wird bereits an anderer Stelle importiert oder aktualisiert.`,
        },
      };
    }
    try {
      const vergleich = await vergleicheMitBestand(
        getaggtesXML,
        gesetz,
        optionen?.meldungEmpfangen,
      );
      if (vergleich === 'neu') {
        return await speichereNeuesGesetz(
          gesetz,
          getaggtesXML,
          bericht,
          kontext,
          batch,
          optionen?.meldungEmpfangen,
        );
      }
      if (vergleich === 'unveraendert') {
        return { art: 'unveraendert', kurztitel: gesetz.kurztitel, ...bericht };
      }
      const bestehendes =
        format === 'kanonisch-xml'
          ? await leseGesetz(gesetz, optionen?.meldungEmpfangen).then((g) =>
              g.status === 'geladen' ? g.gesetz : undefined,
            )
          : undefined;
      return {
        art: 'konflikt',
        kurztitel: gesetz.kurztitel,
        neuesXML: getaggtesXML,
        neuesGesetz: gesetz,
        ...bericht,
        bestehendeVerarbeitungszeit: bestehendes?.verarbeitungszeit,
        importierteVerarbeitungszeit:
          format === 'kanonisch-xml' ? gesetz.verarbeitungszeit : undefined,
      };
    } finally {
      await gibGesetzSperreFrei({ kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber });
    }
  } catch (fehler) {
    return {
      art: 'fehler',
      fehler: {
        grund: 'sonstiger',
        meldung: fehler instanceof Error ? fehler.message : String(fehler),
      },
    };
  }
}
