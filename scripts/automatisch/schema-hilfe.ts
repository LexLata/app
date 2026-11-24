// schema-hilfe.ts
// RelaxNG-Prüfung ausschließlich für Tests, unabhängig von Systeminstallationen.
// Formatnamen entsprechen den Schemas, einschließlich praefixstrukturen.
import { readFileSync } from 'node:fs';
import { URL as DateiURL } from 'node:url';
import { validateXML } from 'xmllint-wasm';

// Die Node-URL verhindert Vites Asset-Umschreibung in DOM-Tests.
const schemaOrdner = new DateiURL('../../docs/schema/', import.meta.url);

export function pruefeSchema(format: string, xml: string | string[]) {
  return validateXML({
    xml,
    schema: readFileSync(new DateiURL(`${format}.rng`, schemaOrdner), 'utf8'),
    extension: 'relaxng',
    // Die größten mitgelieferten Gesetzesdateien benötigen mehr als die Standardkapazität.
    maxMemoryPages: 2048,
  });
}
