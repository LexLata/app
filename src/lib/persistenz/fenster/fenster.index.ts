// Fassade der Fenster-Persistenz: Fensterzustand und Stapel geschlossener
// Tabs. Die Schnittstelle ist auf hooks/fenster und lib/domain/fenster
// zugeschnitten; externe Aufrufer verwenden ausschließlich diese Datei.

export type {
  FensterGeometrie,
  GespeichertesFenster,
} from '@/lib/persistenz/fenster/fensterSpeicher';
export type { GeschlossenerTab } from '@/lib/persistenz/fenster/geschlosseneTabsSpeicher';
export {
  alleFensterLabels,
  entferneFensterZustand,
  ladeFensterZustand,
  speichereFensterZustand,
  uebernehmeFensterZustandNachMain,
  FensterUebernahmeFehler,
} from '@/lib/persistenz/fenster/fensterSpeicher';
export {
  geschlossenenTabPoppen,
  geschlossenenTabPushen,
  geschlosseneTabsMenuStatusSynchronisieren,
} from '@/lib/persistenz/fenster/geschlosseneTabsSpeicher';
export {
  hauptFensterGeometrieFuerRustSpeichern,
  letzteFensterGeometrieSpeichern,
  letzteFensterGeometrieLesen,
} from '@/lib/persistenz/fenster/fensterGeometrieSpeicher';
