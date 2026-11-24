// gesetzDownloadBund.ts
// Download und Konvertierung ohne Bestand, Nachbereitung oder Speicherung.
import { fetch } from '@tauri-apps/plugin-http';
import type { ImportFortschritt } from '@/lib/import/importVertrag.types';
import {
  istVerbindungsFehler,
  istBerechtigungsFehler,
  timeoutSignal,
  formuliereVerbindungsFehler,
} from '@/lib/import/basis/basis.index';
// Download-URL. Früher gab es hier zusätzlich einen EG-Präfix-/Suffix-
// Fallback (…/eg<kürzel>/xml.zip, …/<kürzel>eg/xml.zip) für den Fall, dass
// nur der Kern-Kürzelteil eingegeben wurde – dieses Problem wird inzwischen
// anderweitig gelöst (Importindex-Auflösung liefert bereits das korrekte,
// download-fähige Kürzel), der Fallback ist daher entfallen. Das hält auch
// den Timeout-Fall einfach: nur noch EIN Versuch statt bis zu drei
// sequenziellen.
const downloadUrl = (kuerzel: string): string =>
  `https://www.gesetze-im-internet.de/${kuerzel.toLowerCase()}/xml.zip`;

/**
 * Entpackt ein ZIP-Archiv und gibt die erste XML-Datei als String zurück.
 * Verwendet die browser-native DecompressionStream API (Tauri WebView).
 *
 * Hinweis: DecompressionStream unterstützt nur gzip/deflate, nicht ZIP-Container.
 * Wir verwenden daher fflate (npm install fflate).
 */
async function extrahiereXMLAusZip(zipDaten: ArrayBuffer): Promise<string> {
  // fflate ist eine reine JS-ZIP-Bibliothek, kein Rust nötig
  const { unzipSync } = await import('fflate');

  const uint8 = new Uint8Array(zipDaten);
  const entpackt = unzipSync(uint8);

  // Erste XML-Datei finden
  const xmlDatei = Object.keys(entpackt).find((name) => name.endsWith('.xml'));
  if (!xmlDatei) throw new Error('Keine XML-Datei im ZIP gefunden.');

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(entpackt[xmlDatei]);
}

/** Download und ZIP-Entpacken ohne Wiederholung. Request und Body teilen sich
 * die gemeinsame Frist. HTTP-Status und Fehlerursache bleiben im Text erhalten;
 * der übergebene Fehlertext benennt den Erstimport-/Aktualisierungskontext.
 * Timeouts sind Verbindungsfehler; Berechtigungsabweisungen und sonstige
 * Body-Lesefehler bleiben Downloadfehler. */
export async function ladeUndEntpackeVonGesetzeImInternet(
  kuerzel: string,
  downloadFehlerText: string,
  fortschritt?: (f: ImportFortschritt) => void,
): Promise<
  | { xmlString: string; fehler?: never; fehlerGrund?: never }
  | {
      xmlString?: never;
      fehler: string;
      fehlerGrund: 'keineVerbindung' | 'download' | 'entpacken';
    }
> {
  const url = downloadUrl(kuerzel);
  fortschritt?.({ phase: 'download', meldung: `Lade ${url} …` });

  const signal = timeoutSignal();
  const istTimeout = (fehler: unknown) =>
    (fehler instanceof Error || fehler instanceof DOMException) && fehler.name === 'TimeoutError';
  const downloadFehler = (
    ursache: unknown,
    beimLesen = false,
  ): {
    fehler: string;
    fehlerGrund: 'keineVerbindung' | 'download';
  } => {
    if (
      !istBerechtigungsFehler(ursache) &&
      (istTimeout(ursache) || (signal.aborted && istTimeout(signal.reason)))
    ) {
      const grund = signal.aborted ? String(signal.reason) : '';
      const details =
        grund && grund !== String(ursache) ? `${String(ursache)}; ${grund}` : String(ursache);
      return {
        fehler: `Zeitüberschreitung beim Download von gesetze-im-internet.de. Ursache: ${details}`,
        fehlerGrund: 'keineVerbindung',
      };
    }
    if (!beimLesen && istVerbindungsFehler(ursache))
      return {
        fehler: `${formuliereVerbindungsFehler(url)} Ursache: ${String(ursache)}`,
        fehlerGrund: 'keineVerbindung',
      };
    return {
      fehler: `${downloadFehlerText} Ursache: ${String(ursache)}`,
      fehlerGrund: 'download',
    };
  };
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, { signal });
  } catch (e) {
    return downloadFehler(e);
  }

  if (!response.ok)
    return { fehler: `${downloadFehlerText} HTTP ${response.status}.`, fehlerGrund: 'download' };

  let zipDaten: ArrayBuffer;
  try {
    zipDaten = await response.arrayBuffer();
  } catch (e) {
    return downloadFehler(e, true);
  }

  fortschritt?.({ phase: 'entpacken', meldung: 'ZIP wird entpackt …' });
  try {
    return { xmlString: await extrahiereXMLAusZip(zipDaten) };
  } catch (e) {
    return { fehler: `ZIP konnte nicht entpackt werden: ${String(e)}`, fehlerGrund: 'entpacken' };
  }
}
