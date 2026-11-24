// zitat.index.ts
//
// Fassade des zitat-Submoduls. zitat/ ist komplett unabhängig von den
// übrigen markierungen-Unterordnern (keine Importe von dort) – daher die
// einfachste der sechs Fassaden.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/markierungen/zitat/** darf ausschließlich aus DIESER Datei
// importieren, nie direkt aus Implementierungsdateien – das gilt auch für andere
// markierungen-Unterordner (aktuell: hilfsfenster-aktionen/, siehe dortiger
// dynamischer Import von parseZitat).
//
// Diese Fassade ist bewusst breiter als das, was markierungen.index.ts
// nach AUSSEN zeigt (dort ZusatzArt und Zitierformatierung) – parseZitat wird
// weiterhin NICHT nach außerhalb von markierungen/ exportiert, aber von
// hilfsfenster-aktionen/verweismarkierungAktionen.ts intern gebraucht.

export { parseZitat, analysiereZitatZiele } from '@/lib/markierungen/zitat/zitatParser';

export type { ZusatzArt, RohNormZitat, AmbiguerPunkt } from '@/lib/markierungen/zitat/zitatParser';

export type { ZitatEinstellungenWerte } from './zitatFormatierung';
export { formatiereZitat, formatiereFundstelle } from './zitatFormatierung';
