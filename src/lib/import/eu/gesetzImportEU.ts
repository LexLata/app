// gesetzImportEU.ts
// Erstimport und Aktualisierung mit einmaligem Fassungsrückfall, Formex-Konvertierung und gemeinsamem Speicherabschluss.
import type { GesetzAktualisierungsBestand } from '@/lib/domain/gesetzTypes';
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { sucheImImportindex } from '@/lib/import/importindex/importindex.index';
import { leseEuFassung } from '@/lib/einstellungen/einstellungen.index';
import type { EuFassung } from '@/lib/domain/euFassungsvertrag';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import { ladeGesetzesXML, leseGesetzInfos } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  pruefeDateibestandVorErstimport,
  taggeUndSpeichereGesetzesXML,
  type ReferenzKontext,
} from '@/lib/import/importabschluss/importabschluss.index';
import type {
  ImportEinzelErgebnis,
  AktualisierungsErgebnis,
  ImportFortschritt,
  GesetzImportZielpruefung,
} from '@/lib/import/importVertrag.types';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import { type Konsolidierung } from './cellar';
import { ladeEuQuelle } from './euDownload';
import { konvertiereEuQuelle } from './euKonvertierung';
import type { GesetzInfos } from '@/lib/domain/gesetzInfos';

/** Einmaliger Hinweis erst nach bestätigtem Import; die Metadaten bleiben die dauerhafte Angabe. */
function meldeFassungsabweichung(
  kurztitel: string,
  fassung: EuFassung,
  verwendet: Konsolidierung | undefined,
  konsolidierung: Konsolidierung | undefined,
  fassungsangabe: string,
  neueFassung: GesetzInfos['fassung'],
  bisherigeFassung: GesetzInfos['fassung'],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
) {
  const tatsaechlicheFassung = verwendet ? 'konsolidiert' : 'original';
  if (
    tatsaechlicheFassung !== fassung &&
    (neueFassung?.art !== bisherigeFassung?.art ||
      neueFassung?.stichtag !== bisherigeFassung?.stichtag)
  ) {
    const rueckfallgrund = verwendet
      ? 'Der gewählte Originaltext konnte bei EUR-Lex nicht abgerufen werden.'
      : konsolidierung
        ? 'Die gewählte konsolidierte Fassung konnte bei EUR-Lex nicht abgerufen werden.'
        : 'Es ist keine konsolidierte Fassung verfügbar.';
    meldePersistenzBefund(
      {
        typ: 'info',
        art: 'hinweis',
        anlass: 'import',
        aenderungsstand: 'vollstaendig',
        grund: verwendet ? 'euKonsolidiertStattOriginal' : 'euOriginalStattKonsolidiert',
        betroffen: kurztitel,
        detail: rueckfallgrund,
        text: `${kurztitel}: ${fassungsangabe} importiert. ${rueckfallgrund}${verwendet ? '' : ' Spätere Änderungen können fehlen.'}`,
      },
      meldungEmpfangen,
    );
  }
}

/** Lädt genau eine tatsächlich verfügbare Fassung; nur 404/406 erlaubt den Rückfall. */
export async function importiereVomInternetEU(
  eintrag: ImportindexSucheEintrag,
  fortschritt?: (f: ImportFortschritt) => void,
  zielpruefung?: GesetzImportZielpruefung,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  fassung: EuFassung = leseEuFassung(),
): Promise<ImportEinzelErgebnis> {
  if (!zielpruefung) {
    const fehler = await pruefeDateibestandVorErstimport(
      { kurztitel: eintrag.kurztitel, normgeber: NORMGEBER_EU },
      meldungEmpfangen,
    );
    if (fehler) return { art: 'fehler', fehler };
  }
  return verarbeiteUndSpeichere(
    eintrag,
    fortschritt,
    undefined,
    zielpruefung,
    kontext,
    meldungEmpfangen,
    fassung,
  );
}

/** Sucht den aktuellen EU-Indexeintrag und verwendet die aktuelle Fassungswahl. */
export async function aktualisierungVomInternetEU(
  gesetz: GesetzAktualisierungsBestand,
  fortschritt?: (f: ImportFortschritt) => void,
  kontext?: ReferenzKontext,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<AktualisierungsErgebnis> {
  const eintrag = await sucheImImportindex(NORMGEBER_EU, gesetz.kurztitel);
  if (!eintrag)
    return {
      art: 'fehler',
      fehler: {
        grund: 'nichtImIndex',
        meldung: `„${gesetz.kurztitel}“ wurde im Importindex Europarecht nicht gefunden. Bitte Importindex aktualisieren.`,
      },
    };
  return verarbeiteUndSpeichere(
    eintrag,
    fortschritt,
    gesetz,
    undefined,
    kontext,
    meldungEmpfangen,
    leseEuFassung(),
  );
}

/** Liest unter der Gesetzsperre des Dispatchers die maßgebliche gespeicherte Fassung.
 * Bei fehlender oder unlesbarer Datei bleibt die bekannte Bestandsangabe erhalten. */
async function ladeAktuelleBestandsinfos(bestand: GesetzAktualisierungsBestand | undefined) {
  const xml = bestand ? await ladeGesetzesXML(bestand) : null;
  return (xml ? leseGesetzInfos(xml) : null) ?? bestand;
}

/** Bestandsangaben stammen ausschließlich aus dem App-Speicher. */
function beschreibeBestand(bestand: Pick<GesetzDarstellung, 'fassung'> | undefined) {
  if (!bestand) return undefined;
  return bestand.fassung?.erwaegungsgruendeErgaenzt ? 'ergaenzt' : 'unergaenzt';
}

/** Gemeinsamer Download, XML-Aufbau und Speicherabschluss für beide Vorgänge. */
function verarbeiteUndSpeichere(
  eintrag: ImportindexSucheEintrag,
  fortschritt: ((f: ImportFortschritt) => void) | undefined,
  bestehendesGesetz: undefined,
  zielpruefung: GesetzImportZielpruefung | undefined,
  kontext: ReferenzKontext | undefined,
  meldungEmpfangen: AktionsMeldungEmpfaenger | undefined,
  fassung: EuFassung,
): Promise<ImportEinzelErgebnis>;
function verarbeiteUndSpeichere(
  eintrag: ImportindexSucheEintrag,
  fortschritt: ((f: ImportFortschritt) => void) | undefined,
  bestehendesGesetz: GesetzAktualisierungsBestand,
  zielpruefung: GesetzImportZielpruefung | undefined,
  kontext: ReferenzKontext | undefined,
  meldungEmpfangen: AktionsMeldungEmpfaenger | undefined,
  fassung: EuFassung,
): Promise<AktualisierungsErgebnis>;
async function verarbeiteUndSpeichere(
  eintrag: ImportindexSucheEintrag,
  fortschritt: ((f: ImportFortschritt) => void) | undefined,
  bestehendesGesetz: GesetzAktualisierungsBestand | undefined,
  zielpruefung: GesetzImportZielpruefung | undefined,
  kontext: ReferenzKontext | undefined,
  meldungEmpfangen: AktionsMeldungEmpfaenger | undefined,
  fassung: EuFassung,
) {
  fortschritt?.({ phase: 'download', meldung: 'Lade deutsche Fassung von EUR-Lex …' });
  const grundfassung = fassung === 'original' ? 'original' : 'konsolidiert';
  const quelle = await ladeEuQuelle(eintrag, fassung, () =>
    fortschritt?.({ phase: 'entpacken', meldung: 'Entpacke Formex-Archiv …' }),
  );
  if ('fehler' in quelle) return { art: 'fehler', fehler: quelle.fehler };
  const aktuellerBestand = await ladeAktuelleBestandsinfos(bestehendesGesetz);
  const bestand = beschreibeBestand(aktuellerBestand);
  const { herkunft, ergaenzungsfehler, konsolidierung } = quelle;
  const fehlgeschlagen = herkunft.ergaenzung === 'fehlgeschlagen';
  if (ergaenzungsfehler && (fehlgeschlagen ? bestand !== undefined : bestand === 'ergaenzt'))
    return {
      art: 'fehler',
      fehler: {
        ...ergaenzungsfehler,
        meldung: `Erwägungsgründe konnten nicht geladen werden: ${ergaenzungsfehler.meldung} Bestehende Fassung wurde beibehalten.`,
      },
    };
  const ergaenzungswarnung =
    fehlgeschlagen && ergaenzungsfehler
      ? `Erwägungsgründe konnten nicht geladen werden: ${ergaenzungsfehler.meldung}`
      : undefined;
  const konvertiert = konvertiereEuQuelle(eintrag, quelle, new Date());
  if ('fehler' in konvertiert) return { art: 'fehler', fehler: konvertiert.fehler };
  const { xml, fassungsangabe } = konvertiert;
  const verwendet = herkunft.fassung === 'konsolidiert' ? konsolidierung : undefined;
  const abschlussArgumente = [bestehendesGesetz, zielpruefung, kontext, meldungEmpfangen] as const;
  const ergebnis = bestehendesGesetz
    ? await taggeUndSpeichereGesetzesXML(
        xml,
        eintrag.kurztitel,
        fortschritt,
        'Formex konnte nicht gelesen werden.',
        true,
        ...abschlussArgumente,
      )
    : await taggeUndSpeichereGesetzesXML(
        xml,
        eintrag.kurztitel,
        fortschritt,
        'Formex konnte nicht gelesen werden.',
        false,
        ...abschlussArgumente,
      );
  if (ergebnis.art === 'erfolg' && ergaenzungswarnung)
    meldePersistenzBefund(
      {
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'import',
        aenderungsstand: 'vollstaendig',
        grund: 'euOhneErwaegungsgruende',
        betroffen: eintrag.kurztitel,
        detail: ergaenzungswarnung,
        text: `${eintrag.kurztitel}: ${ergaenzungswarnung}`,
      },
      meldungEmpfangen,
    );
  if (ergebnis.art === 'erfolg')
    meldeFassungsabweichung(
      eintrag.kurztitel,
      grundfassung,
      verwendet,
      konsolidierung,
      fassungsangabe,
      konvertiert.fassung,
      aktuellerBestand?.fassung,
      meldungEmpfangen,
    );
  return ergebnis;
}
