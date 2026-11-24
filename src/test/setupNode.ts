// setupNode.ts
//
// Globaler Setup für Vitest-Tests in der Node-Umgebung (siehe
// vitest.config.ts, environment: 'node'). Stellt DOMParser- und
// XMLSerializer-Polyfills über linkedom bereit, da gesetzesXMLParser.ts
// (und darauf aufbauende Module) sowie gesetzesXMLNachbereiten.ts die
// Browser-DOM-APIs nutzen, die es in reinem Node.js nicht gibt. linkedom
// bewusst statt jsdom/happy-dom gewählt: hier wird nur XML-Parsing/
// -Serialisierung gebraucht, kein Rendering/Layout – linkedom ist dafür
// deutlich leichtgewichtiger.
//
// Vorhandene Browser-Globals bleiben erhalten. Der Node-Adapter prüft XML
// strikt mit saxes, weil linkedom beschädigte Dokumente sonst repariert.

import { DOMParser, Node } from 'linkedom';
import { SaxesParser } from 'saxes';

class StrikterDOMParser {
  parseFromString(xml: string, typ: string) {
    const parser = new DOMParser();
    const mime = typ === 'text/html' ? 'text/html' : 'text/xml';
    if (typ === 'application/xml' || typ === 'text/xml') {
      try {
        new SaxesParser({ xmlns: true }).write(xml).close();
      } catch {
        return parser.parseFromString(
          '<parsererror>XML ist nicht wohlgeformt.</parsererror>',
          mime,
        );
      }
    }
    const doc = parser.parseFromString(xml, mime);
    // linkedom gibt XML-Attribute sonst erneut maskiert zurück; Browser liefern
    // wie Attr.value den dekodierten Wert (insbesondere Präfixe mit & oder <).
    for (const el of Array.from(doc.querySelectorAll('*')) as Element[]) {
      el.getAttribute = (name: string) => el.getAttributeNode(name)?.value ?? null;
    }
    return doc;
  }
}

if (typeof globalThis.DOMParser === 'undefined') {
  // @ts-expect-error - Browser-Globals nur für den Testlauf in Node gesetzt.
  globalThis.DOMParser = StrikterDOMParser;
}
if (typeof globalThis.Node === 'undefined') {
  // @ts-expect-error - Browser-Globals nur für den Testlauf in Node gesetzt.
  globalThis.Node = Node;
}

// linkedom exportiert selbst kein XMLSerializer – Document-Instanzen bringen
// aber bereits eine vollständige XML-Serialisierung über toString() mit
// (inkl. XML-Deklaration), daher genügt ein minimaler Adapter statt einer
// eigenen Implementierung.
class XMLSerializerPolyfill {
  serializeToString(node: { toString(): string }): string {
    return node.toString();
  }
}
// Kein @ts-expect-error nötig (anders als bei DOMParser/Node oben): der
// globale XMLSerializer-Typ aus lib.dom.d.ts erlaubt diese Zuweisung bereits
// strukturell ohne Fehler.
if (typeof globalThis.XMLSerializer === 'undefined') {
  globalThis.XMLSerializer = XMLSerializerPolyfill;
}

// jsdom berechnet kein Layout. Geometrietests ersetzen diesen Browser-Adapter
// durch eine steuerbare Größenbeobachtung.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
