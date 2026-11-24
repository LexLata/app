// importindexValidierung.ts
// Gemeinsame strikte Formatprüfung vor Lesen und Installation eines Importindex.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import { SaxesParser } from 'saxes';
import { liesVerarbeitungszeitstempel, xmlKind, xmlKinder } from '@/lib/utils/xmlVerarbeitung';
import type { ImportindexKategorie, ImportindexSucheEintrag } from './importindexVertrag.types';

export class ImportindexFormatFehler extends Error {
  constructor(
    ursache = 'Format, Normgeber oder Verarbeitungszeit sind ungültig.',
    optionen?: ErrorOptions,
  ) {
    super(
      `Ungültiges Importindex-XML: ${ursache} Bitte den Importindex wiederherstellen oder aktualisieren.`,
      optionen,
    );
    this.name = 'ImportindexFormatFehler';
  }
}

export function kategorieFuerDateiname(dateiname: string): ImportindexKategorie {
  if (dateiname === 'de-bund.xml') return NORMGEBER_DE_BUND;
  if (dateiname === 'de-bw.xml') return NORMGEBER_DE_BW;
  if (dateiname === 'eu.xml') return NORMGEBER_EU;
  throw new ImportindexFormatFehler('Unbekannter Importindexdateiname.');
}

export function dateinameFuerKategorie(kategorie: ImportindexKategorie): string {
  return `${kategorie}.xml`;
}

export function validiereImportindex(
  xml: string,
  erwartet?: ImportindexKategorie,
): {
  doc: Document;
  kategorie: ImportindexKategorie;
  zeit: Date;
} {
  try {
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: validiereImportindex prüft Importindex-XML auf Wohlgeformtheit ohne Anzeige; importindexValidierung.test.ts prüft ungültiges und gültiges XML.
    new SaxesParser({ xmlns: true }).write(xml).close();
  } catch {
    throw new ImportindexFormatFehler('XML ist nicht wohlgeformt.');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (root?.tagName !== 'importindex' || root.getAttribute('version') !== '1') {
    throw new ImportindexFormatFehler('Root oder Schemaversion stimmen nicht.');
  }
  const direkt = (name: string) => Array.from(root.children).filter((el) => el.tagName === name);
  const infos = direkt('infos');
  const normgeber = infos.length === 1 ? xmlKinder(infos[0], 'normgeber') : [];
  const datenquellen = infos.length === 1 ? xmlKinder(infos[0], 'datenquelle') : [];
  const zeiten = infos.length === 1 ? xmlKinder(infos[0], 'verarbeitungszeit') : [];
  if (
    direkt('inhalt').length !== 1 ||
    normgeber.length !== 1 ||
    datenquellen.length !== 1 ||
    zeiten.length !== 1
  ) {
    throw new ImportindexFormatFehler(
      'Inhalt und Infos müssen direkt und eindeutig vorliegen; Normgeber, Datenquelle und Verarbeitungszeit direkt und eindeutig in Infos.',
    );
  }
  for (const gesetz of xmlKinder(direkt('inhalt')[0], 'gesetz')) {
    if (xmlKinder(gesetz, 'link').length > 0)
      throw new ImportindexFormatFehler('Gesetz enthält das frühere Feld link statt abrufkennung.');
  }
  const code = normgeber[0]!.textContent?.trim();
  const kategorie =
    code === NORMGEBER_DE_BUND || code === NORMGEBER_DE_BW || code === NORMGEBER_EU ? code : null;
  const zeit = liesVerarbeitungszeitstempel(zeiten[0]!.textContent?.trim());
  if (!kategorie || (erwartet && erwartet !== kategorie) || !zeit)
    throw new ImportindexFormatFehler();
  return { doc, kategorie, zeit };
}

export function parseImportindex(xml: string): ImportindexSucheEintrag[] {
  return eintraegeAusImportindex(validiereImportindex(xml));
}

/** Extrahiert Einträge aus einem innerhalb desselben Aufrufs geprüften Dokument. */
export function eintraegeAusImportindex({
  doc,
}: ReturnType<typeof validiereImportindex>): ImportindexSucheEintrag[] {
  const eintraege: ImportindexSucheEintrag[] = [];
  for (const el of xmlKinder(xmlKind(doc.documentElement, 'inhalt'), 'gesetz')) {
    const kurztitel = el.querySelector(':scope > kurztitel')?.textContent?.trim() ?? '';
    const langtitel = el.querySelector(':scope > langtitel')?.textContent?.trim() ?? '';
    const abrufkennung = el.querySelector(':scope > abrufkennung')?.textContent?.trim() ?? '';
    if (!kurztitel || !abrufkennung) continue;
    const typ = el.getAttribute('typ');
    eintraege.push({ kurztitel, langtitel, abrufkennung, ...(typ ? { typ } : {}) });
  }
  return eintraege;
}
