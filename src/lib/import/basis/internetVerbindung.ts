// internetVerbindung.ts
//
// Zentrale Erkennung von Verbindungsfehlern (kein Internet/Server nicht
// erreichbar/Zeitüberschreitung) UND einheitlicher Fehlertext dafür – genutzt
// von Bund-/BW-Import und Indexerstellung.
//
// Abgrenzung zu einem regulären "nicht gefunden"/HTTP-Fehler: ein
// tatsächlicher HTTP-Statuscode (auch 404/500) gilt allein NICHT als
// Verbindungsfehler: Der Server hat geantwortet. Eine Zeitüberschreitung
// kann dagegen sowohl die Anfrage als auch die vollständige Übertragung
// nach Eingang der Antwortheader abbrechen.

/** Standardfrist für bestehende Bund-/BW-Abrufe einschließlich Body-Lesen.
 * Cellar-SPARQL darf über timeoutSignal(ms) ausdrücklich 60 Sekunden erhalten.
 */
const VERBINDUNGS_TIMEOUT_MS = 30_000;

/** Ersatztext für Berichte ohne konkrete Quelle. */
export const FEHLERTEXT_KEINE_VERBINDUNG =
  'Keine Verbindung zur Quelle möglich. Bitte später erneut versuchen.';

/** Benennt die angefragte Quelle, ohne eine Ursache des Ausfalls zu behaupten. */
export function formuliereVerbindungsFehler(url: string): string {
  const quelle = new URL(url).hostname.replace(/^www\./, '');
  return `Keine Verbindung zu ${quelle} möglich. Bitte später erneut versuchen.`;
}

/** Erkennt die konkreten Scope-/Permission-Abweisungen vor einer Netzwerkdiagnose. */
export function istBerechtigungsFehler(e: unknown): boolean {
  const meldung = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
  // tauri-plugin-http 2.8.0: error.rs; Tauri 2.12.0: ipc/authority.rs
  // (Debug) und webview/mod.rs (Release).
  // Redirect-Scope-Abweisungen werden vom Plugin ebenfalls als UrlNotAllowed
  // weitergegeben, bevor reqwest sie in einen Netzwerkfehler verpacken könnte.
  return (
    meldung.startsWith('url not allowed on the configured scope: ') ||
    meldung === 'command not allowed on any window/webview/URL context' ||
    /^Command plugin:http\|\w+ not allowed by ACL$/.test(meldung) ||
    /^http\.\w+ (?:not allowed(?:\.| on (?:window |origin \[))|explicitly denied on origin )/.test(
      meldung,
    )
  );
}

/**
 * Erkennt Verbindungsfehler, ohne Scope-/Permission-Abweisungen als fehlendes
 * Internet auszugeben. Native Plugin-Fehler kommen als String an; bekannte
 * Netzwerk- und Abbruchtexte werden daher zusätzlich gezielt ausgewertet.
 * Error-/DOMException-Fälle und das Offline-Signal bleiben erhalten, nachdem
 * Berechtigungsabweisungen ausgeschlossen wurden. HTTP-Antworten (auch
 * 404/500) lösen keinen fetch-catch aus und belegen die Erreichbarkeit.
 */
export function istVerbindungsFehler(e: unknown): boolean {
  if (istBerechtigungsFehler(e)) return false;
  const meldung = typeof e === 'string' ? e : e instanceof Error ? e.message : '';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (e instanceof Error || e instanceof DOMException) return true;
  // reqwest::Error (Request) mit URL sowie native und JS-Abbruchschreibweise.
  return (
    /^error sending request for url \(https?:\/\/[^)\s]+\)$/.test(meldung) ||
    meldung === 'Request canceled' ||
    meldung === 'Request cancelled'
  );
}

/**
 * Berichtskategorien für das Markierungskonflikte-Fenster. Der Bericht
 * ordnet maschinenlesbare Importfehlergründe diesen Gruppen zu; die
 * eigentliche Fehlererkennung erfolgt in Quellen und Importabschluss.
 */
export type ImportFehlerKategorie = 'keineVerbindung' | 'nichtImIndex' | 'sonstiger';

/**
 * Erzeugt die übergebene Frist, standardmäßig 30 Sekunden, für
 * jeden HTTP-Abruf; beim Bund umfasst dasselbe Signal auch das Body-Lesen.
 * Verwendung:
 * `fetch(url, { signal: AbortSignal.timeout(VERBINDUNGS_TIMEOUT_MS) })`.
 */
export function timeoutSignal(ms = VERBINDUNGS_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}

/**
 * Schneller Vorab-Check per fetch() (mit Timeout) gegen `url`, BEVOR ein
 * ressourcenintensiverer bzw. selbst nicht klassifizierbarer Vorgang
 * gestartet wird. Zentral hier statt lokal dupliziert, da ZWEI echte
 * Anwendungsfälle denselben Check brauchen:
 * - gesetzImportBW.ts: vor dem Aufbau des WebView-Fensters
 *   (landesrecht_import.rs: dessen eigene Wartezeiten würden bei
 *   echtem Verbindungsausfall unnötig lange bis zur Meldung dauern).
 * - importindexErstellungBW.ts: einmal vor dem Laden der neun Übersichtsseiten.
 *   Spätere Ausfälle behandelt der tatsächliche Seitenabruf.
 * Ein fetch() kann den Seiteninhalt selbst nicht auswerten (React-SPA), reicht
 * aber, um "Server überhaupt erreichbar?" zu klären. Eine HTTP-Antwort
 * erlaubt das Fortfahren, auch bei Fehlerstatus. Klassifizierte Netzwerkfehler
 * liefern den Verbindungstext; Berechtigungsabweisungen und unbekannte Fehler
 * werden an die vorhandene Fehlerbehandlung der Aufrufer weitergegeben.
 */
export async function pruefeErreichbarkeit(url: string): Promise<{ fehler?: string }> {
  try {
    const { fetch } = await import('@tauri-apps/plugin-http');
    await fetch(url, { signal: timeoutSignal() });
  } catch (e) {
    if (istVerbindungsFehler(e)) return { fehler: formuliereVerbindungsFehler(url) };
    throw e;
  }
  return {};
}
