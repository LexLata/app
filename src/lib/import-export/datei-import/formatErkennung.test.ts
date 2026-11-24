// formatErkennung.test.ts
//
// Unit-Tests für erkenneDateiFormat() (formatErkennung.ts) – reine,
// synchrone Funktion ohne I/O. Deckt die Erkennungsreihenfolge (Endung vor
// Root-Tag-Sniffing), die HTML/EU/BW-Unterscheidung, die verschiedenen
// XML-Root-Tags sowie die BJA-Fallback-Erkennung über <norm>/<metadaten> ab.
// Die EU-interne Rechtsakt-Unterscheidung (eu/formatErkennungEU.ts) ist
// nicht Gegenstand dieser Datei.

import { describe, it, expect } from 'vitest';
import { erkenneDateiFormat } from '@/lib/import-export/datei-import/formatErkennung';

describe('erkenneDateiFormat – ZIP', () => {
  it('.zip-Endung wird unabhängig vom (hier leeren) Inhalt erkannt', () => {
    expect(erkenneDateiFormat('', '/pfad/export.zip')).toBe('zip');
  });

  it('Groß-/Kleinschreibung der Endung ist egal', () => {
    expect(erkenneDateiFormat('', '/pfad/export.ZIP')).toBe('zip');
  });
});

describe('erkenneDateiFormat – HTML (Landesrecht BW / EU-Recht)', () => {
  it('.html-Endung mit <!DOCTYPE html> -> html-bw ohne EU-Merkmale', () => {
    const inhalt = '<!DOCTYPE html><html><head><title>Test</title></head></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/gesetz.html')).toBe('html-bw');
  });

  it('.htm-Endung wird ebenso akzeptiert wie .html', () => {
    const inhalt = '<!DOCTYPE html><html></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/gesetz.htm')).toBe('html-bw');
  });

  it('DOCTYPE-Erkennung ist case-insensitiv', () => {
    const inhalt = '<!doctype HTML><html></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/gesetz.html')).toBe('html-bw');
  });

  it('beginnt direkt mit <html> (ohne DOCTYPE) -> ebenfalls als HTML erkannt', () => {
    const inhalt = '<html><body>Text</body></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/gesetz.html')).toBe('html-bw');
  });

  it('XML-Deklaration + DOCTYPE html wird toleriert (Format wird grundsätzlich als HTML erkannt, hier ohne EU-Merkmale -> html-bw)', () => {
    const inhalt = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/seite.html')).toBe('html-bw');
  });

  it('XML-Deklaration + DOCTYPE html KOMBINIERT mit EU-Merkmal (eli-container) -> unbekannt (EUR-Lex-HTML wird nicht importiert)', () => {
    const inhalt =
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html><html class="eli-container"></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/eurlex.html')).toBe('unbekannt');
  });

  it('Edge-Case: vom Browser als "Webseite, HTML" gespeicherte EUR-Lex-Seite – die XML-Deklaration wurde vom Browser-Parser in einen Kommentar umgewandelt', () => {
    const inhalt =
      '<!--?xml version="1.0" encoding="UTF-8"?--><!DOCTYPE html><html class="eli-container"></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/eurlex.html')).toBe('unbekannt');
  });

  it('EU-Erkennung über class="eli-container"', () => {
    const inhalt = '<!DOCTYPE html><html><body class="eli-container">Text</body></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/eurlex.html')).toBe('unbekannt');
  });

  it('EU-Erkennung über einen href auf eur-lex.europa.eu (ältere/konsolidierte Exporte ohne eli-container)', () => {
    const inhalt =
      '<!DOCTYPE html><html><a href="https://eur-lex.europa.eu/legal-content/DE/TXT/">Quelle</a></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/euv.html')).toBe('unbekannt');
  });

  it('ohne eli-container UND ohne eur-lex-Link -> html-bw (Default innerhalb von HTML)', () => {
    const inhalt = '<!DOCTYPE html><html><body>Ganz normales Landesrecht-BW-HTML</body></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/gesetz.html')).toBe('html-bw');
  });

  it('Edge-Case: .html-Endung, aber Inhalt sieht NICHT nach HTML aus (z.B. leere/falsch benannte Datei) -> unbekannt (kein Fallthrough zur XML-Erkennung)', () => {
    expect(erkenneDateiFormat('kein html hier, nur Text', '/pfad/falsch.html')).toBe('unbekannt');
  });

  it('Edge-Case: KEINE .html-Endung, aber Inhalt sieht nach HTML aus -> trotzdem als HTML erkannt (Inhalts-Sniff als Absicherung gegen falsch benannte Dateien)', () => {
    const inhalt = '<!DOCTYPE html><html></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/falsch_benannt.txt')).toBe('html-bw');
  });

  it('führender Whitespace vor <!DOCTYPE wird toleriert (trimStart)', () => {
    const inhalt = '\n\n  <!DOCTYPE html><html></html>';
    expect(erkenneDateiFormat(inhalt, '/pfad/gesetz.html')).toBe('html-bw');
  });
});

describe('erkenneDateiFormat – GesetzesXML und interne Formate (Root-Tag)', () => {
  it('erkennt versionierte Wurzel-Tags', () => {
    expect(erkenneDateiFormat('<markierungen version="1"></markierungen>', '/pfad/m.xml')).toBe(
      'markierung-xml',
    );
    expect(erkenneDateiFormat('<favoriten version="1"></favoriten>', '/pfad/f.xml')).toBe(
      'favoriten-xml',
    );
    expect(erkenneDateiFormat('<importindex version="1"></importindex>', '/pfad/i.xml')).toBe(
      'index-xml',
    );
  });
  it('<gesetz> -> kanonisch-xml', () => {
    expect(erkenneDateiFormat('<gesetz id="bgb"></gesetz>', '/pfad/BGB.xml')).toBe('kanonisch-xml');
  });

  it.each(['de-bund.xml', 'de-bw.xml', 'beliebiger-name.xml'])(
    'erkennt einen Importindex anhand der Wurzel unabhängig vom Dateinamen %s',
    (name) => {
      expect(erkenneDateiFormat('<importindex></importindex>', `/pfad/${name}`)).toBe('index-xml');
    },
  );

  it('<favoriten> -> favoriten-xml', () => {
    expect(erkenneDateiFormat('<favoriten></favoriten>', '/pfad/f.xml')).toBe('favoriten-xml');
  });

  it('<lesezeichen> -> lesezeichen-xml', () => {
    expect(erkenneDateiFormat('<lesezeichen></lesezeichen>', '/pfad/l.xml')).toBe(
      'lesezeichen-xml',
    );
  });

  it('<gesetzeskurzbefehle> -> gesetzeskurzbefehle-xml', () => {
    expect(erkenneDateiFormat('<gesetzeskurzbefehle></gesetzeskurzbefehle>', '/pfad/k.xml')).toBe(
      'gesetzeskurzbefehle-xml',
    );
  });

  it('<markierungen> -> markierung-xml', () => {
    expect(erkenneDateiFormat('<markierungen></markierungen>', '/pfad/m.xml')).toBe(
      'markierung-xml',
    );
  });

  it('<nichtamtlicheTitel> (camelCase im Original) -> nichtamtlicheTitel-xml trotz interner Kleinschreibung des Root-Tags', () => {
    expect(erkenneDateiFormat('<nichtamtlicheTitel></nichtamtlicheTitel>', '/pfad/t.xml')).toBe(
      'nichtamtlicheTitel-xml',
    );
  });

  it('<einstellungen> -> einstellungen-xml', () => {
    expect(erkenneDateiFormat('<einstellungen></einstellungen>', '/pfad/e.xml')).toBe(
      'einstellungen-xml',
    );
  });

  it('Root-Tag-Erkennung ist case-insensitiv (<GESETZ> -> kanonisch-xml)', () => {
    expect(erkenneDateiFormat('<GESETZ id="bgb"></GESETZ>', '/pfad/BGB.xml')).toBe('kanonisch-xml');
  });

  it('XML-Deklaration vor dem Root-Tag wird übersprungen', () => {
    const inhalt = '<?xml version="1.0" encoding="UTF-8"?>\n<gesetz id="bgb"></gesetz>';
    expect(erkenneDateiFormat(inhalt, '/pfad/BGB.xml')).toBe('kanonisch-xml');
  });

  it('Kommentare vor dem Root-Tag werden übersprungen', () => {
    const inhalt = '<!-- Exportiert am 1.1.2024 --><gesetz id="bgb"></gesetz>';
    expect(erkenneDateiFormat(inhalt, '/pfad/BGB.xml')).toBe('kanonisch-xml');
  });

  it('Kombination aus Deklaration UND Kommentar vor dem Root-Tag', () => {
    const inhalt = '<?xml version="1.0"?><!-- Kommentar --><gesetz id="bgb"></gesetz>';
    expect(erkenneDateiFormat(inhalt, '/pfad/BGB.xml')).toBe('kanonisch-xml');
  });

  it('unbekannter Root-Tag ohne BJA-Muster -> unbekannt', () => {
    expect(erkenneDateiFormat('<irgendwas></irgendwas>', '/pfad/x.xml')).toBe('unbekannt');
  });

  it('Edge-Case: leerer Inhalt (kein Root-Tag auffindbar) -> unbekannt', () => {
    expect(erkenneDateiFormat('', '/pfad/x.xml')).toBe('unbekannt');
  });

  it('Edge-Case: Inhalt beginnt nicht mit "<" (z.B. reiner Text) -> unbekannt', () => {
    expect(erkenneDateiFormat('Das ist keine XML-Datei.', '/pfad/x.xml')).toBe('unbekannt');
  });
});

describe('erkenneDateiFormat – Bundesjustizamt-XML (bja-xml)', () => {
  it('typischer Bundesjustizamt-Export mit <dokumente>-Root und <norm>/<metadaten>', () => {
    const inhalt =
      '<?xml version="1.0"?><dokumente><norm builddate="1"><metadaten><jurabk>BGB</jurabk></metadaten></norm></dokumente>';
    expect(erkenneDateiFormat(inhalt, '/pfad/BJNR001950896.xml')).toBe('bja-xml');
  });

  it('DOCTYPE-Deklaration (gii-norm.dtd) vor dem Root-Tag wird übersprungen', () => {
    const inhalt =
      '<?xml version="1.0"?><!DOCTYPE dokumente SYSTEM "gii-norm.dtd"><dokumente><norm><metadaten><jurabk>BGB</jurabk></metadaten></norm></dokumente>';
    expect(erkenneDateiFormat(inhalt, '/pfad/BJNR001950896.xml')).toBe('bja-xml');
  });

  it('Edge-Case: DOCTYPE mit interner Subset-Deklaration in eckigen Klammern wird ebenfalls korrekt übersprungen', () => {
    const inhalt =
      '<?xml version="1.0"?><!DOCTYPE dokumente [<!ENTITY nbsp "&#160;">]><dokumente><norm><metadaten></metadaten></norm></dokumente>';
    expect(erkenneDateiFormat(inhalt, '/pfad/BJNR001950896.xml')).toBe('bja-xml');
  });

  it('robust auch bei abweichendem Root-Tag, solange <norm>…<metadaten> im Dokument vorkommt', () => {
    const inhalt =
      '<sonstwas><norm id="1"><metadaten><jurabk>BGB</jurabk></metadaten></norm></sonstwas>';
    expect(erkenneDateiFormat(inhalt, '/pfad/x.xml')).toBe('bja-xml');
  });

  it('Edge-Case: <norm> ohne <metadaten>-Kind wird NICHT als bja-xml erkannt', () => {
    const inhalt =
      '<dokumente><norm id="1"><text>Kein Metadaten-Tag hier.</text></norm></dokumente>';
    expect(erkenneDateiFormat(inhalt, '/pfad/x.xml')).toBe('unbekannt');
  });

  it('Erkennung ist case-insensitiv (<NORM>…<METADATEN>)', () => {
    const inhalt = '<dokumente><NORM id="1"><METADATEN></METADATEN></NORM></dokumente>';
    expect(erkenneDateiFormat(inhalt, '/pfad/x.xml')).toBe('bja-xml');
  });
});
