// tab-bereithaltung.index.ts
// Öffentliche Schnittstelle der Regel der Bereithaltung von Gesetzestextansichten.

/**
 * bereitzuhaltendeAnsichten: entscheidet, welche bereits benutzten Gesetzestextansichten eines
 * Hauptfensters aufgebaut bleiben. Der Aufrufer übergibt alle Ansichten mit geprüfter Gültigkeit
 * und Kosten: Art `tab` in Aktivierungsreihenfolge, danach Art `verlassen` nach dem Zeitpunkt des
 * Verlassens, jeweils jüngste zuerst. Ergebnis: die zu haltenden Ansichten als dieselben Objekte
 * in Eingabereihenfolge; alle übrigen verwirft der Aufrufer.
 *
 * bereithaltungskosten: Kosten einer Ansicht für das Tab-Bereithaltungsbudget.
 */
export { bereitzuhaltendeAnsichten, bereithaltungskosten } from './tabBereithaltung';

/** Festes Tab-Bereithaltungsbudget je Hauptfenster. */
export { TAB_BEREITHALTUNGSBUDGET } from './tabBereithaltungsbudget';
