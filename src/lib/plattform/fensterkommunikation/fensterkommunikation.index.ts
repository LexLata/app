// fensterkommunikation.index.ts
// Öffentlicher Zugang zu Ereignisreichweite und Listenerlebensdauer.
export {
  hoereGlobal,
  hoereImEigenenFenster,
  sendeGlobal,
  sendeAnFenster,
} from './ereignisAnbindung';
export type { EreignisAnmeldung } from './ereignisAnbindung';
export type { MenueEreignis, HistorienNachricht } from './ereignisVertraege';
export {
  sendeHauptfensterHinweis,
  empfangeHauptfensterHinweise,
  hinweisAusMeldungen,
} from './hauptfensterHinweise';
