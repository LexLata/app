// Strikte XML-Wohlgeformtheitsprüfung für Schreiber- und Ressourcentests.
// saxes verwirft fehlerhaftes XML, statt es wie der Test-DOMParser zu reparieren.
import { SaxesParser } from 'saxes';

export function pruefeXmlWohlgeformtheit(xml: string): void {
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    if (![...tag.name].every((zeichen) => zeichen.charCodeAt(0) < 128)) {
      throw new Error(`Nicht-ASCII-Elementname: ${tag.name}`);
    }
    for (const name of Object.keys(tag.attributes)) {
      if (![...name].every((zeichen) => zeichen.charCodeAt(0) < 128)) {
        throw new Error(`Nicht-ASCII-Attributname: ${name}`);
      }
    }
  });
  parser.write(xml).close();
}
