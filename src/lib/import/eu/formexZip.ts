// formexZip.ts
// Liest die referenzierte Hauptdatei eines Formex-Archivs ohne Datei- oder Netzzugriff.
import { strFromU8, unzipSync } from 'fflate';

export function extrahiereFormexZip(
  zip: Uint8Array,
): { hauptdatei: string; docXml: string } | { fehler: string; grund?: 'format' } {
  try {
    const dateien = unzipSync(zip);
    const metadata = Object.keys(dateien).find((name) => /\.doc(?:\.fmx)?\.xml$/.test(name));
    if (!metadata) return { fehler: 'Keine Formex-Metadaten gefunden.' };
    const docXml = strFromU8(dateien[metadata]!);
    const doc = new DOMParser().parseFromString(docXml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length)
      return { fehler: 'Ungültiges Formex-XML.', grund: 'format' };
    for (const ref of Array.from(doc.getElementsByTagName('REF.PHYS'))) {
      if (ref.getAttribute('TYPE') !== 'DOC.XML') continue;
      const inhalt = dateien[ref.getAttribute('FILE') ?? ''];
      if (!inhalt) continue;
      const hauptdatei = strFromU8(inhalt);
      const text = new DOMParser().parseFromString(hauptdatei, 'application/xml');
      if (text.getElementsByTagName('parsererror').length)
        return { fehler: 'Ungültiges Formex-XML.', grund: 'format' };
      if (
        Array.from(text.getElementsByTagName('ENACTING.TERMS')).some(
          (e) => e.getElementsByTagName('ARTICLE').length > 0,
        )
      )
        return { hauptdatei, docXml };
    }
    return { fehler: 'Keine Artikel in den referenzierten Formex-Dateien gefunden.' };
  } catch {
    return { fehler: 'Formex-Archiv konnte nicht entpackt werden.' };
  }
}
