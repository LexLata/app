// geschlosseneTabsSpeicher.ts
//
// Stapel der zuletzt geschlossenen Tabs, fensterübergreifend (alle Fenster
// teilen sich denselben localStorage, siehe fensterSpeicher.ts) – aber OHNE
// Fensterzuordnung: ⇧⌘T öffnet im AKTIVEN Fenster einfach den zuletzt
// geschlossenen Tab, unabhängig davon, in welchem Fenster er ursprünglich
// offen war.
//
// Gespeichert wird nur die Gesetzesreferenz (nicht das vollständige
// GesetzDarstellung-Objekt). Die Tabverwaltung reserviert beim Wiederöffnen
// den Zieltab samt Verlauf; die gemeinsame Öffnungssteuerung lädt beziehungsweise
// importiert das Gesetz. Der Eintrag wird einmal beim ausdrücklichen Wunsch
// verbraucht; Fehlerwiederholungen verwenden den reservierten Auftrag.
//
// Alte Einträge mit Dateibasis werden verworfen; referenzbasierte Einträge bleiben erhalten.
// Der begrenzte Stapel bleibt auch über App-Neustarts hinweg erhalten.

import { verlaufOhneAktivierung } from '@/lib/domain/app/tabVerlauf';
import { pruefeGeschlosseneTabs } from './fensterDatenPruefung';
import type { GeschlossenerTab } from './fensterDatenPruefung';
export type { GeschlossenerTab } from './fensterDatenPruefung';
import { ladeJSON, speichereJSON } from '@/lib/persistenz/kern/kern.index';
import { setzeAktiv } from '@/lib/plattform/menu/menu.index';

const STORAGE_KEY = 'lexlata.geschlosseneTabs';
// Begrenzt den Stapel auf die zehn zuletzt geschlossenen Tabs.
const MAX_STAPEL_GROESSE = 10;

function ladeAlle(): GeschlossenerTab[] {
  const wert: unknown = ladeJSON<unknown>(STORAGE_KEY, null, (_wert): _wert is unknown => true);
  return pruefeGeschlosseneTabs(wert);
}

function speichereAlle(stapel: GeschlossenerTab[]): void {
  speichereJSON(STORAGE_KEY, stapel);
}

// Graut "Zuletzt geschlossenen Tab öffnen" (menu.rs: "letzter-tab") ein oder
// aus, je nachdem, ob der Stapel Einträge hat – ohne Eintrag würde ein Klick
// nur den Leer-Tab-Fallback öffnen (siehe menu.rs: "letzter-tab"-Zweig).
// Das Tastaturkürzel ⇧⌘T bleibt davon unabhängig aktiv, siehe
// useTastenkuerzel.ts – das Ausgrauen wirkt nur auf den Menüpunkt selbst.
function menuStatusSynchronisieren(stapel: GeschlossenerTab[]): void {
  setzeAktiv('letzter-tab', stapel.length > 0);
}

/** Gleicht den Menüstatus mit dem aktuell gespeicherten gemeinsamen Stapel ab.
 * Beim Mount, bei gezielten Fokus-Anfragen und vor dem Hamburger-Menüaufbau. */
export function geschlosseneTabsMenuStatusSynchronisieren(): void {
  menuStatusSynchronisieren(ladeAlle());
}

/** Legt einen geschlossenen Tab oben auf den Stapel. */
export function geschlossenenTabPushen(tab: GeschlossenerTab): void {
  const stapel = ladeAlle();
  stapel.push({ ...tab, verlauf: verlaufOhneAktivierung(tab.verlauf) });
  // Älteste Einträge zuerst verwerfen, wenn die Kappungsgrenze überschritten
  // wird – der zuletzt geschlossene Tab (Ende des Stapels) bleibt immer
  // erhalten, das ist der einzige, der per ⇧⌘T je gebraucht wird.
  while (stapel.length > MAX_STAPEL_GROESSE) stapel.shift();
  speichereAlle(stapel);
  menuStatusSynchronisieren(stapel);
}

/** Entfernt und liefert den zuletzt geschlossenen Tab, oder null wenn der Stapel leer ist. */
export function geschlossenenTabPoppen(): GeschlossenerTab | null {
  const stapel = ladeAlle();
  const tab = stapel.pop();
  if (!tab) return null;
  speichereAlle(stapel);
  menuStatusSynchronisieren(stapel);
  return tab;
}
