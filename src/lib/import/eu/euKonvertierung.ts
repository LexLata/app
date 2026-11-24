// euKonvertierung.ts
// Konvertiert gespeicherte Formex-Archive ohne Netz oder Speicherung.

import { datumAusKalendertag } from '@/lib/utils/datumFormat';
import { formatFassung, type GesetzInfos } from '@/lib/domain/gesetzInfos';
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { baueGesetzesXML } from '@/lib/import/basis/basis.index';
import type { ImportindexSucheEintrag } from '@/lib/import/importindex/importindex.index';
import type { ImportFehler } from '@/lib/import/importVertrag.types';
import { EUR_LEX_QUELLE } from './cellar';
import type { EuQuelle } from './euDownload';
import { extrahiereFormexZip } from './formexZip';
import { parseFormex } from './formexParser';
import { brauchtEuOriginal, extrahiereEuErwaegungsgruende } from './erwaegungsgruendeEU';
/** DOC.MAIN.PUB bezeichnet den Akt; Amtsblatt-Daten und Vertragsveröffentlichungen zählen nicht. */
export function leseAusfertigung(docXml: string, basisCelex: string): string {
  if (basisCelex.startsWith('1')) return '';
  const doc = new DOMParser().parseFromString(docXml, 'application/xml');
  const publikation = doc.getElementsByTagName('DOC.MAIN.PUB')[0];
  const datum = Array.from(publikation?.children ?? [])
    .find((e) => e.tagName === 'DATE')
    ?.getAttribute('ISO');
  return (
    datum
      ?.match(/^(\d{4})(\d{2})(\d{2})$/)
      ?.slice(1)
      .join('-') ?? ''
  );
}

/** Die eigene Amtsblattveröffentlichung steht in PUBLICATION.REF, nicht in Zitaten des Texts. */
function leseFundstelle(docXml: string, hauptdatei: string): string | undefined {
  const doc = new DOMParser().parseFromString(docXml, 'application/xml');
  const ref = doc.getElementsByTagName('PUBLICATION.REF')[0];
  const text = (name: string) =>
    Array.from(ref?.children ?? [])
      .find((e) => e.tagName === name)
      ?.textContent?.trim();
  const reihe = text('COLL');
  const nummer = text('NO.OJ');
  const dokument =
    ref?.getElementsByTagName('NO.DOC')[0] ??
    doc.getElementsByTagName('BIB.DOC')[0]?.getElementsByTagName('NO.DOC')[0];
  const jahr = dokument?.getElementsByTagName('YEAR')[0]?.textContent?.trim();
  const laufend = dokument?.getElementsByTagName('NO.CURRENT')[0]?.textContent?.trim();
  const einzelpublikation = jahr && laufend ? `${jahr}/${laufend}` : undefined;
  const iso = ref?.getElementsByTagName('DATE')[0]?.getAttribute('ISO');
  const datum = iso?.match(/^(\d{4})(\d{2})(\d{2})$/);
  const hauptdoc = new DOMParser().parseFromString(hauptdatei, 'application/xml');
  const familienkopf = Array.from(
    hauptdoc.getElementsByTagName('FAM.COMP')[0]?.children ?? [],
  ).find((e) => e.tagName === 'BIB.DATA');
  const primaereReferenz = familienkopf
    ?.getElementsByTagName('BIB.INSTANCE.CONS')[0]
    ?.getElementsByTagName('DOCUMENT.REF.CONS')[0];
  const seite =
    primaereReferenz?.getElementsByTagName('PAGE.FIRST')[0]?.textContent?.trim() ||
    doc
      .getElementsByTagName('DOC.MAIN.PUB')[0]
      ?.getElementsByTagName('PAGE.FIRST')[0]
      ?.textContent?.trim();
  if (!reihe || (!nummer && !einzelpublikation)) return undefined;
  const fundstelle = `ABl. ${reihe}${nummer ? ` ${nummer}` : `, ${einzelpublikation}`}`;
  if (!datum) return einzelpublikation ? fundstelle : undefined;
  if (!datumAusKalendertag(Number(datum[1]), Number(datum[2]), Number(datum[3]))) return undefined;
  return `${fundstelle} vom ${Number(datum[3])}.${Number(datum[2])}.${datum[1]}${nummer && seite ? `, S. ${seite}` : ''}`;
}

/** Erzeugt das GesetzesXML vor der Nachbereitung und meldet fehlende nötige Ergänzungen. */
export function konvertiereEuQuelle(
  eintrag: ImportindexSucheEintrag,
  quelle: EuQuelle,
  verarbeitungszeit: Date,
):
  | {
      xml: string;
      originalFehlt: boolean;
      fassungsangabe: string;
      fassung: NonNullable<GesetzInfos['fassung']>;
    }
  | { fehler: ImportFehler } {
  const { herkunft, archive } = quelle;
  const basis = archive[herkunft.fassung];
  if (!basis) return { fehler: { grund: 'format', meldung: 'Basisarchiv fehlt.' } };
  const archiv = extrahiereFormexZip(basis);
  if ('fehler' in archiv)
    return { fehler: { grund: archiv.grund ?? 'entpacken', meldung: archiv.fehler } };
  const normen = parseFormex(archiv.hauptdatei);
  if ('fehler' in normen) return { fehler: { grund: 'format', meldung: normen.fehler } };
  const noetig = brauchtEuOriginal(
    herkunft.ergaenzung === 'nicht-noetig' ? 'konsolidiert' : 'konsolidiert-mit-erwaegungsgruenden',
    herkunft.fassung === 'konsolidiert',
    normen,
  );
  const ergaenzung =
    noetig && archive.original ? extrahiereEuErwaegungsgruende(archive.original) : undefined;
  const ergaenzt = !!ergaenzung && !('fehler' in ergaenzung) && ergaenzung.normen.length > 0;
  if (ergaenzt && ergaenzung && !('fehler' in ergaenzung)) normen.unshift(...ergaenzung.normen);
  const ausfertigung = leseAusfertigung(archiv.docXml, herkunft.basisCelex);
  const datum = herkunft.datum;
  const verwendet = herkunft.fassung === 'konsolidiert' ? { celex: herkunft.celex } : undefined;
  const fassung = {
    art: herkunft.fassung,
    stichtag: datum,
    erwaegungsgruendeErgaenzt: ergaenzt || undefined,
  };
  const fassungsangabe = formatFassung(fassung);
  const xml = baueGesetzesXML(
    {
      verarbeitungszeit,
      kurztitel: eintrag.kurztitel,
      langtitel: eintrag.langtitel,
      normgeber: NORMGEBER_EU,
      datenquelle: {
        name: EUR_LEX_QUELLE,
        url: `https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:${verwendet?.celex ?? eintrag.abrufkennung}`,
      },
      ausfertigung,
      fundstelle: leseFundstelle(archiv.docXml, archiv.hauptdatei),
      fassung,
    },
    normen,
  );
  return { xml, originalFehlt: noetig && !ergaenzt, fassungsangabe, fassung };
}
