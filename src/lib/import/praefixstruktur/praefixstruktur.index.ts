// praefixstruktur.index.ts
// Öffentliche Grenze für Liste und Prüflauf; Format und Leseregeln bleiben intern.

import type { PraefixlaufAuftrag } from '@/lib/plattform/praefixlaufAuftrag';
import type { PraefixlaufUmgebung, PraefixlaufBericht } from './praefixlauf.types';

/**
 * Prüft bis zur gewünschten Zahl erfolgreicher Gesetze (Fehlerauswahl: höchstens
 * die gewünschte Zahl gespeicherter Kandidaten) und schreibt GesetzesXML
 * und PräfixstrukturXML über die Umgebung. Gesetzfehler werden dauerhaft gemerkt;
 * der Lauf setzt mit weiteren Kandidaten fort. Schwere Fehler (insbesondere
 * Schreibfehler) beenden den Lauf durch Ablehnung; bereits bestätigte Schreibungen
 * bleiben bestehen. Laufende Arbeiten werden vor der Ablehnung abgewartet.
 * meldeBericht erhält auch bei Abbruch den abschließenden Stand, sobald die
 * Kandidaten geladen sind; vorangehende Initialisierungsfehler liefern keinen Stand.
 */
export async function fuehrePraefixlaufAus(
  auftrag: Extract<PraefixlaufAuftrag, { modus: 'praefix' }>,
  umgebung: PraefixlaufUmgebung,
  meldeBericht?: (bericht: PraefixlaufBericht) => void,
): Promise<PraefixlaufBericht> {
  const { fuehrePraefixlaufAus: ausfuehren } = await import('./praefixlauf');
  return ausfuehren(auftrag, umgebung, meldeBericht);
}

/** Erzeugt den Entwickleradapter erst bei Bedarf, ohne Importer in der Suche. */
export async function erzeugeTauriPraefixlaufUmgebung(
  kontext?: import('@/lib/import/importabschluss/importabschluss.index').ReferenzKontext,
): Promise<PraefixlaufUmgebung> {
  const { erzeugeTauriPraefixlaufUmgebung: erzeuge } = await import('./praefixlaufUmgebung');
  return erzeuge(kontext);
}

export async function fuehrePraefixAuswertungAus(
  ...args: Parameters<typeof import('./praefixAuswertung').fuehrePraefixAuswertungAus>
) {
  const { fuehrePraefixAuswertungAus } = await import('./praefixAuswertung');
  return fuehrePraefixAuswertungAus(...args);
}
export async function erzeugeTauriPraefixAuswertungUmgebung() {
  const { erzeugeTauriPraefixAuswertungUmgebung } = await import('./praefixAuswertungUmgebung');
  return erzeugeTauriPraefixAuswertungUmgebung();
}

/** Ergänzung mit Vollständigkeitsstatus für den gemeinsamen Suchbestand. */
export { ergaenzePraefixstrukturMitDiagnose } from './praefixstrukturErgaenzung';
