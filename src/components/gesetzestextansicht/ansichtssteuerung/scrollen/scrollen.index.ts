// scrollen.index.ts
// Scrollausführung und Messstand; Virtualizer und Auftragsfortsetzungen bleiben privat.
export { useScrollSteuerung } from './useScrollSteuerung';
export type {
  ScrollPosition,
  ScrollStand,
  ScrollAnker,
  KlappAnker,
  ScrollAuftrag,
  ScrollSteuerung,
} from './ScrollSteuerung.types';
export { aktivesElementNachfuehren } from './aktivesElementNachfuehren';
export type { MesslaufRekorder } from './messlaufErfassung';
