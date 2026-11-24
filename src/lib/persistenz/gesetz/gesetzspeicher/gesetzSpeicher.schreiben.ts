// Schreiben und Löschen von Gesetzen mit Quellabschluss und Speicherereignissen.
import {
  type AktionsMeldungEmpfaenger,
  erzeugeAktionsMeldungsWeiterleitung,
} from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  beiSpeicherBatchAbgeschlossen,
  nachSpeichernPruefen,
  type SpeicherSammelbatch,
} from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicherEreignisse';
import { synchronisiereEinNichtamtlicheTitel } from '@/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.synchronisieren';
import {
  appDatenLoeschen,
  appDatenSchreiben,
  appDatenVerarbeitungszeitAuffrischen,
  ermittleGesetzDateipfad,
  meldePersistenzBefund,
  merkePruefpflichtigeAenderungVor,
  mitGesetzDateiSperre,
  schliessePruefpflichtigeQuelleAb,
} from '@/lib/persistenz/kern/kern.index';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { referenzAusDateiBasis } from '@/lib/persistenz/kern/kern.index';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import { mitGesetzesXMLReferenz } from '@/lib/domain/gesetzesXMLReferenz';
import {
  merkeSuchverzeichnisPflege,
  pflegeSuchverzeichnis,
} from '@/lib/persistenz/gesetz/suchverzeichnis/suchverzeichnisPflege';
import { sicherstelleOrdner } from './gesetzSpeicher.dateien';
import {
  GESETZE_ORDNER,
  type GesetzLoeschErgebnis,
  GesetzSpeicherFolgefehler,
  fehlertext,
} from './gesetzSpeicher.typen';

// Fensterübergreifender Sync der Gesetzeliste: sobald ein Speicher-/Lösch-
// Batch (siehe gesetzSpeicherEreignisse.ts) Änderungen oder gepflegte
// Verzeichnismetadaten enthielt, EINMAL 'gesetze-geaendert' broadcasten – unabhängig davon, wie
// viele Gesetze im Batch betroffen waren oder welcher Import-/Aktualisierungs-
// Pfad (Bund-Internet-Import, BW-Internet-Import, Datei-Import, Markierungs-
// updates-Fenster, künftige Pfade) ihn ausgelöst hat. Ersetzt die bisher pro
// Aufrufer manuell gesetzten Emits (OeffnenOverlay.tsx,
// VerweismarkierungFenster.tsx, useHintergrundAktualisierung.ts) – deren Emit war
// leicht zu vergessen, siehe konfliktaktionen.ts, wo genau
// das passiert war (importierte Gesetze erschienen erst nach manuellem
// Neuladen der Gesetzesübersicht).
//
// Eine leere Referenzliste meldet ausschließlich frische Verzeichnismetadaten;
// Volltextempfänger lassen ihren Bestand und laufende Zugriffe dabei unverändert.
// Payload = inhaltlich betroffene Gesetzesreferenzen (stabil, fensterübergreifend
// gültig – NICHT die ephemeren `id`-Felder, die pro Fenster/Parse-Lauf
// unterschiedlich sind, siehe SSOT-Regel). Empfänger (useGesetzVerwaltung.ts)
// nutzt das, um zusätzlich zum Listen-Reload gezielt bereits offene Tabs mit
// genau diesen Gesetzen zu patchen – vereinheitlicht den bisher separaten,
// lokalen Tab-Patch-Pfad (nachDateiImportAktualisieren, AktualisierenOverlay,
// useHintergrundAktualisierung) und schließt nebenbei eine bestehende Lücke:
// bisher wurde ein in einem ANDEREN Fenster offener Tab desselben Gesetzes
// bei einer Aktualisierung gar nicht gepatcht.
beiSpeicherBatchAbgeschlossen((betroffene, _vorgaenge, ausloeser) => {
  return (async () => {
    const verzeichnisGepflegt = await pflegeSuchverzeichnis();
    if (!betroffene.length && !verzeichnisGepflegt) return;
    try {
      await sendeGlobal('gesetze-geaendert', Array.from(betroffene));
    } catch (fehler) {
      if (ausloeser?.some((a) => a.meldungEmpfangen)) throw fehler;
      // kein Tauri-Kontext – ohne Wirkung
    }
  })();
}, true);

/** Prüfpflichtiger Gesetzvorgang: Vormerkung vor Sperren, Abschluss und Ereignis nach Freigabe.
 *  Ein `sammelbatch` gilt für beide Speicherereignisse dieses Vorgangs. */
export async function mitPruefpflichtigemGesetzVorgang<T>(
  gesetz: Gesetzesreferenz | null,
  aktion: (
    vorgang: string,
    abgeschlossen: (status: 'geaendert' | 'fehlgeschlagen') => void,
  ) => Promise<T>,
  {
    nachVorgang = async () => {},
    meldungEmpfangen,
    sammelbatch,
  }: {
    nachVorgang?: () => Promise<unknown>;
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
    sammelbatch?: SpeicherSammelbatch;
  } = {},
): Promise<T> {
  const ausfuehren = async () => {
    const vorgang = await merkePruefpflichtigeAenderungVor(meldungEmpfangen);
    let status: 'geaendert' | 'unveraendert' | 'fehlgeschlagen' = 'unveraendert';
    let veraendert = false;
    const meldeAenderung = async () => {
      if (veraendert && gesetz)
        await nachSpeichernPruefen(gesetz, true, async () => {}, {
          pruefvorgang: vorgang,
          meldungEmpfangen,
          sammelbatch,
        });
    };
    let ergebnis: T;
    try {
      ergebnis = await aktion(vorgang, (neuerStatus) => {
        status = neuerStatus;
        if (neuerStatus === 'geaendert') veraendert = true;
      });
    } catch (fehler) {
      await schliessePruefpflichtigeQuelleAb(vorgang, 'fehlgeschlagen', meldungEmpfangen);
      await meldeAenderung();
      throw fehler;
    }
    await schliessePruefpflichtigeQuelleAb(vorgang, status, meldungEmpfangen);
    await meldeAenderung();
    await nachVorgang();
    return ergebnis;
  };
  return gesetz ? nachSpeichernPruefen(gesetz, false, ausfuehren, { sammelbatch }) : ausfuehren();
}

/**
 * Speichert ein Gesetz als XML-Datei im AppData-Ordner.
 * `inhaltGeaendert` = false NUR für den "unveraendert"-Aktualisierungsfall
 * (siehe taggeUndSpeichereGesetzesXML in gesetzImportGemeinsam.ts): dort
 * wird lediglich der verarbeitungszeit-Tag aufgefrischt, ohne dass sich am Inhalt
 * etwas geändert hat – eine Neuprüfung der Markierungen wäre hier
 * verschwendete Arbeit (siehe Absprache: nicht jede Aktualisierung verändert
 * etwas). Default true, damit Erst-Import und echte Aktualisierungen (die
 * übrigen, deutlich häufigeren Aufrufer) ohne explizite Angabe korrekt als
 * relevant gezählt werden.
 *
 * Verwendet die Referenz der tatsächlichen Datei auch in den Kopfangaben.
 * Die Eingabe bleibt unverändert; der Rückgabewert enthält nur diese Referenz.
 * Der Schreibvorgang ergänzt fehlende mitgelieferte Titeldateien.
 * Fehler aus dem Schreiben oder der anschließenden Synchronisierung werden
 * an Aufrufer weitergereicht. Nach bestätigtem Gesetzesschreiben kennzeichnet
 * GesetzSpeicherFolgefehler einen Fehler der anschließenden Titelergänzung;
 * die Gesetzdatei ist dann bereits gespeichert, auch beim reinen Prüf-Refresh.
 * zielGeschrieben bestätigt synchron die Zieldatei vor Titelergänzung und Quellabschluss.
 * sammelbatch ordnet das Speicherereignis einem Datei-Import zu (siehe mitSpeicherSammelbatch).
 */
export async function speichereGesetz(
  gesetz: Gesetzesreferenz,
  xmlString: string,
  {
    inhaltGeaendert = true,
    meldungEmpfangen,
    zielGeschrieben,
    sammelbatch,
  }: {
    inhaltGeaendert?: boolean;
    meldungEmpfangen?: AktionsMeldungEmpfaenger;
    zielGeschrieben?: () => void;
    sammelbatch?: SpeicherSammelbatch;
  } = {},
): Promise<Gesetzesreferenz> {
  let gespeicherteReferenz = referenzVon(gesetz);
  const schreiben = async (token: string, vorgang?: string) => {
    await sicherstelleOrdner();
    const pfad = await ermittleGesetzDateipfad(gesetz, GESETZE_ORDNER);
    const referenz = referenzAusDateiBasis(pfad.slice(GESETZE_ORDNER.length + 1, -4))!;
    const xml = inhaltGeaendert ? mitGesetzesXMLReferenz(xmlString, referenz) : xmlString;
    if (inhaltGeaendert) await appDatenSchreiben(pfad, xml, token, vorgang);
    else await appDatenVerarbeitungszeitAuffrischen(pfad, xml, token);
    gespeicherteReferenz = referenz;
    zielGeschrieben?.();
    await merkeSuchverzeichnisPflege(referenz, xml);
  };
  // Dieser Schritt beginnt ausschließlich nach dem bestätigten Gesetzesschreiben.
  // Titelbefunde beschreiben ihre eigene Quelle; der Präfix stellt den bereits
  // erreichten Gesetzeserfolg klar, ohne Titel-/Prüferfolg zu behaupten.
  const titelErgaenzen = async () => {
    const gesetzErfolg = inhaltGeaendert
      ? 'Das Gesetz wurde gespeichert.'
      : 'Der Prüfzeitpunkt des Gesetzes wurde aktualisiert.';
    const titelEmpfaenger = erzeugeAktionsMeldungsWeiterleitung(meldungEmpfangen, (meldung) =>
      meldePersistenzBefund(
        {
          ...meldung,
          grund: 'titelNichtErgaenzt',
          betroffen: gespeicherteReferenz.kurztitel,
          detail: meldung.text,
          art: 'hinweis',
          aenderungsstand:
            meldung.aenderungsstand === 'vollstaendig' ? 'vollstaendig' : 'teilweise',
          text: `${gesetzErfolg} Beim Ergänzen der nichtamtlichen Titel: ${meldung.text}`,
        },
        meldungEmpfangen,
      ),
    );
    try {
      await synchronisiereEinNichtamtlicheTitel(gespeicherteReferenz, titelEmpfaenger);
    } catch (ursache) {
      if (meldungEmpfangen)
        meldePersistenzBefund(
          {
            typ: 'fehler',
            art: 'hinweis',
            anlass: 'synchronisation',
            aenderungsstand: 'teilweise',
            grund: 'titelNichtErgaenzt',
            betroffen: gespeicherteReferenz.kurztitel,
            detail: fehlertext(ursache),
            text: `${gesetzErfolg} Die nichtamtlichen Titel konnten jedoch nicht ergänzt werden: ${fehlertext(ursache)}`,
          },
          meldungEmpfangen,
        );
      throw new GesetzSpeicherFolgefehler(inhaltGeaendert, ursache, gespeicherteReferenz);
    }
  };
  if (inhaltGeaendert) {
    await mitPruefpflichtigemGesetzVorgang(
      { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
      async (vorgang, abgeschlossen) =>
        mitGesetzDateiSperre(
          gesetz,
          GESETZE_ORDNER,
          '.xml',
          async (token) => {
            await schreiben(token, vorgang);
            abgeschlossen('geaendert');
          },
          meldungEmpfangen,
        ),
      // Eigene Titeldatei erst nach Gesetzfreigabe und Quellabschluss synchronisieren.
      { nachVorgang: titelErgaenzen, meldungEmpfangen, sammelbatch },
    );
  } else {
    await nachSpeichernPruefen(
      { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
      false,
      async () => {
        await mitGesetzDateiSperre(
          gesetz,
          GESETZE_ORDNER,
          '.xml',
          (token) => schreiben(token),
          meldungEmpfangen,
        );
        await titelErgaenzen();
      },
      { sammelbatch },
    );
  }
  return gespeicherteReferenz;
}

/**
 * Löscht ein Gesetz. Seine Gesetzesreferenz wird mitgegeben
 * (siehe useGesetzVerwaltung.ts: dort aus der bereits geladenen Gesetzeliste
 * bekannt) – anders als beim Speichern liegt hier kein GesetzDarstellung-
 * Objekt vor, aus dem sie sich ableiten ließe. Läuft über denselben
 * nachSpeichernPruefen()-Mechanismus wie speichereGesetz(): auch beim
 * Löschen kann sich der Konflikt-Status ändern (das Gesetz selbst wird zu
 * gesetzFehlt, Verweise anderer Gesetze darauf ggf. von zielNormUnpassend zu
 * zielGesetzFehlt – siehe markierungskonfliktPruefung.ts), daher immer inhaltGeaendert:
 * true.
 */
export async function loescheGesetz(gesetz: Gesetzesreferenz): Promise<GesetzLoeschErgebnis> {
  const referenz = { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber };
  await mitPruefpflichtigemGesetzVorgang(gesetz, (vorgang, abgeschlossen) =>
    mitGesetzDateiSperre(gesetz, GESETZE_ORDNER, '.xml', async (token) => {
      await appDatenLoeschen(await ermittleGesetzDateipfad(gesetz, GESETZE_ORDNER), token, vorgang);
      await merkeSuchverzeichnisPflege(referenz, null);
      abgeschlossen('geaendert');
    }),
  );
  // Die Entfernung ist abgeschlossen. Ein Transportfehler darf ihren Erfolg
  // nicht nachträglich als Dateilöschfehler ausgeben.
  try {
    await sendeGlobal('gesetze-geloescht', [referenz]);
    return { benachrichtigung: 'gesendet' };
  } catch (fehler) {
    return { benachrichtigung: 'fehlgeschlagen', fehler };
  }
}
