// text-darstellung.index.ts
// Lokaler Rahmen und gemeinsame Messverträge; Canvas und Caches bleiben intern.
export { TextDarstellungsRahmen } from './textDarstellung';
export {
  useTextDarstellungsModell,
  useTextMessung,
  useSatzNummerStil,
} from './textDarstellung.modell';
export type { TextDarstellungsModell } from './textDarstellung.modell';
export type { Schriftstil, TextMessung, Trennsprache } from './textMessung';
