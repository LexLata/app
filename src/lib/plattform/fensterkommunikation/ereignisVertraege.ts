// ereignisVertraege.ts
// Technische Reichweiten mit bestehenden Fachtypen; keine fachliche Zustandsquelle.
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { AppUpdateMeldung } from '@/lib/domain/app/appUpdate';

/** Technischer Umschlag. Das zuständige Fachmodul setzt hier seinen bestehenden
 * Aktionstyp ein; die Plattform importiert keine Fachaktions-Implementierung. */
export interface HistorienNachricht<Aktion> {
  kennung: string;
  senderLabel: string;
  empfaengerLabel: string;
  aktion: Aktion;
}
interface HistorienBestaetigung {
  kennung: string;
  empfaengerLabel: string;
}
export interface GlobaleEreignisse {
  'importindex-geaendert': { kategorie: ImportindexKategorie; absender: string };
  'gesetze-geaendert': Gesetzesreferenz[];
  'gesetze-geloescht': Gesetzesreferenz[];
  'gesetzeskurzbefehle-geaendert': void;
  'markierung-wegen-ueberlappung-abgelehnt': void;
  'lesezeichen-geaendert': void;
  'favoriten-geaendert': void;
  'markierungen-geaendert': { gesetz: Gesetzesreferenz };
}
export interface FensterEreignisse<Aktion = unknown> {
  'startaufgaben-verfuegbar': void;
  'hauptfenster-hinweise-verfuegbar': void;
  'gesetzesuebersicht-oeffnen': void;
  'einstellungen-oeffnen': void;
  'dateien-importieren-anfrage': void;
  'gesetze-aktualisieren-oeffnen': void;
  'gesetz-info-oeffnen': void;
  'export-oeffnen': void;
  'favorit-speichern': void;
  'favoriten-hinzufuegen-oeffnen': void;
  'lesezeichen-speichern': void;
  'alle-lesezeichen-entfernen-anfrage': void;
  'unterstreichen-anfrage': void;
  'hervorheben-anfrage': void;
  'verweismarkierung-anfrage': void;
  'kommentar-anfrage': void;
  'einfuehrung-neu-starten-anfrage': void;
  'datenschutz-oeffnen': void;
  'ueber-oeffnen': void;
  'nach-updates-suchen-anfrage': void;
  'app-update-zustand': AppUpdateMeldung;
  'beenden-anfrage': { id: number };
  'beenden-anfrage-abbruch': { id: number };
  'tastenkuerzel-oeffnen': void;
  'markierung-rueckgaengig-anfrage': void;
  'markierung-wiederholen-anfrage': void;
  'gesetzesindizes-oeffnen': void;
  'oeffnen-overlay-oeffnen': void;
  'volltext-suche-oeffnen': void;
  'volltext-alle-oeffnen': void;
  'verlauf-anzeigen-oeffnen': void;
  'schliessen-anfrage': void;
  'fenster-schliessen-anfrage': void;
  'leerentab-oeffnen': void;
  'letzter-tab-oeffnen': void;
  'menu-zustand-anfordern': void;
  'tab-uebertragung-eingefuegt': void;
  'tab-uebertragung-bestaetigt': { kennung: string; uebernommen: boolean };
  'tiefenlink-oeffnen': string[];
  'interne-navigation-vorhanden': void;
  'markierung-historie-uebertragen': HistorienNachricht<Aktion>;
  'markierung-historie-bestaetigt': HistorienBestaetigung;
}
export type MenueEreignis =
  | 'gesetzesuebersicht-oeffnen'
  | 'einstellungen-oeffnen'
  | 'dateien-importieren-anfrage'
  | 'gesetze-aktualisieren-oeffnen'
  | 'gesetz-info-oeffnen'
  | 'export-oeffnen'
  | 'favorit-speichern'
  | 'favoriten-hinzufuegen-oeffnen'
  | 'lesezeichen-speichern'
  | 'alle-lesezeichen-entfernen-anfrage'
  | 'unterstreichen-anfrage'
  | 'hervorheben-anfrage'
  | 'verweismarkierung-anfrage'
  | 'kommentar-anfrage'
  | 'einfuehrung-neu-starten-anfrage'
  | 'datenschutz-oeffnen'
  | 'ueber-oeffnen'
  | 'nach-updates-suchen-anfrage'
  | 'tastenkuerzel-oeffnen'
  | 'markierung-rueckgaengig-anfrage'
  | 'markierung-wiederholen-anfrage'
  | 'gesetzesindizes-oeffnen'
  | 'oeffnen-overlay-oeffnen'
  | 'volltext-suche-oeffnen'
  | 'volltext-alle-oeffnen'
  | 'verlauf-anzeigen-oeffnen'
  | 'schliessen-anfrage'
  | 'fenster-schliessen-anfrage'
  | 'leerentab-oeffnen'
  | 'letzter-tab-oeffnen';
