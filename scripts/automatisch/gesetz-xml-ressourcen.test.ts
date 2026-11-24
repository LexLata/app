// Prüft die tatsächlich gebündelten GesetzesXML strikt und ihren Whitespace-Vertrag.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';

const ordner = new URL('../../src-tauri/resources/europa/', import.meta.url);
function xmlDateien(basis: URL, pfad = ''): string[] {
  return readdirSync(new URL(pfad, basis), { withFileTypes: true }).flatMap((datei) => {
    const relativ = `${pfad}${datei.name}`;
    if (datei.isDirectory()) return xmlDateien(basis, `${relativ}/`);
    return datei.isFile() && datei.name.endsWith('.xml') ? [relativ] : [];
  });
}
const dateien = xmlDateien(ordner);

describe('gebündelte GesetzesXML', () => {
  it('enthält ausschließlich EMRK und die kuratierte Liste', () => {
    expect(readdirSync(ordner).sort()).toEqual(['EMRK_europarat.xml', 'europaKuratiert.json']);
    expect(dateien).toEqual(['EMRK_europarat.xml']);
  });
  it.each(dateien)('%s ist wohlgeformt ohne rootweites xml:space', (datei) => {
    const xml = readFileSync(
      new URL(datei.split('/').map(encodeURIComponent).join('/'), ordner),
      'utf8',
    );
    expect(() => pruefeXmlWohlgeformtheit(xml)).not.toThrow();
    const wurzel = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
    expect(wurzel.localName).toBe('gesetz');
    expect(wurzel.getAttribute('version')).toBe('1');
    expect(wurzel.hasAttribute('xml:space')).toBe(false);
  });
});
