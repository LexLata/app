// Gepflegter Vertrag der vom Frontend verwendeten nativen Befehle.
// Ablaufwissen bleibt bei den jeweiligen Aufrufern; Rust bleibt unabhängig gepflegt.
import type { InternerNavigationsauftrag } from '@/lib/domain/app/interneNavigation';
import type { PraefixlaufAuftrag } from '@/lib/plattform/praefixlaufAuftrag.types';
import type { OeffnenLinkZiel } from '@/lib/domain/app/tiefenLink';
import type {
  AppUpdateAnlass,
  AppUpdateInstallationsergebnis,
  AppUpdatePruefergebnis,
  AppUpdateMeldung,
} from '@/lib/domain/app/appUpdate';

type GesetzdateiStempel = {
  name: string;
  dateistempel: { groesse: string; aenderungszeit: string };
};

type MenueNormstatus = {
  bezeichnung: string | null;
  ist_favorit: boolean;
  ist_lesezeichen: boolean;
};

type KeineArgumente = Record<string, never>;
type KeinErgebnis = void;
type TextErgebnis = string;
type OptionalerText = string | null;
type Wahrheitswert = boolean;
type PfadArgumente = { relativerPfad: string };
type DateiArgumente = PfadArgumente & { token?: string; vorgang?: string };
type SchreibArgumente = DateiArgumente & { inhalt: string; nurVerarbeitungszeit?: boolean };
type ArchivArgumente = DateiArgumente & { erwarteterInhalt: string };
type ArchivErgebnis = {
  status: 'archiviert' | 'fehlt' | 'veraendert' | 'gesichert_aber_nicht_entfernt';
  sicherungspfad: string | null;
};
type TokenArgumente = { token: string };
type KonfliktArgumente = { konfliktToken: string };
type VorgangsArgumente = KonfliktArgumente & { vorgaenge: string[] };
type VorgangsStand = { offeneQuellen: number; offenePruefungen: number; vollbedarf: boolean };
type LabelArgumente = { label: string };
type FensterGeometrie = { x: number; y: number; breite: number; hoehe: number; maximiert: boolean };
type FensterArgumente = LabelArgumente & { geometrie?: FensterGeometrie | null };
type HilfsfensterArgumente = LabelArgumente & { titel: string; hoehe: number };
type FensterPosition = { label: string; x: number; y: number; breite: number; hoehe: number };
type FensterPositionen = FensterPosition[];
type ZugArgumente = { zugkennung: number };
type ZiehvorschauAussehen = {
  hintergrund: string;
  hintergrundNativ: [number, number, number, number] | null;
  textfarbe: string;
  schrift: string;
  innenabstand: string;
  eckenradius: string;
};
type ZiehvorschauArgumente = ZugArgumente & {
  titel: string;
  aussehen: ZiehvorschauAussehen;
};
type Farbschema = 'system' | 'hell' | 'dunkel';
type SchemaArgumente = { farbschema: Farbschema; dunkel: boolean };
type DunkelArgumente = { dunkel: boolean };
type NutzlastArgumente = LabelArgumente & { payload: string };
type NavigationsArgumente = { auftrag: InternerNavigationsauftrag };
type OeffnenLinkArgumente = { auftrag: OeffnenLinkZiel; beimAppStart: boolean };
type AnmeldungArgumente = { anmeldung: string };
type BereitArgumente = AnmeldungArgumente & { bereit?: boolean };
type BestaetigungArgumente = AnmeldungArgumente & { kennung: number };
type AnzeigeArgumente = { anmeldung?: string; kennung?: number };
type NavigationsUebergabe = {
  kennung: number;
  auftrag: InternerNavigationsauftrag | OeffnenLinkZiel;
  neuesFenster: boolean;
};
type NavigationErgebnis = NavigationsUebergabe | null;
type Hinweis = { text: string; typ: 'info' | 'warnung' | 'fehler' };
type HinweisArgumente = { kennung: string; hinweis: Hinweis; oeffner?: string };
type HinweisBestaetigung = AnmeldungArgumente & { kennung: string };
type HinweisUebergabe = { kennung: string; hinweis: Hinweis };
type HinweisErgebnis = HinweisUebergabe[];
type VorgangskennungArgumente = { vorgangskennung: string };
type KurztitelArgumente = { kurztitel: string };
type KuerzelArgumente = { kuerzel: string };
type DokArgumente = { dokId: string };
type UrlArgumente = { url: string };
type BerichtArgumente = { zeitstempel: string; inhalt: string };
type XmlArgumente = { xml: string };
type GesetzArgumente = XmlArgumente & { normgeber: string; kurztitel: string };
type Ausgabeart = 'detail' | 'ergebnis' | 'status';
type ZeilenArgumente = { zeile: string; art?: Ausgabeart };
type CodeArgumente = { code: number };
type AktivArgumente = { aktiv: boolean };
type MenueArgumente = AktivArgumente & { id: string };

type Dateiart = 'quelle' | 'konsolidiert' | 'original' | 'herkunft' | 'gesetzesxml';
type ArbeitsdateiArgumente = {
  art: Dateiart;
  kurztitel: string;
};
type Dateistand = {
  quellen: string[];
  gesetzesxml: string[];
  konsolidiert: string[];
  original: string[];
};
type AuftragErgebnis = PraefixlaufAuftrag | null;
type StartaufgabenAuftrag = { kennung: number; schritt: number };
type Startaufgabe = StartaufgabenAuftrag | null;

export interface Befehlsverzeichnis {
  startaufgaben_anmelden: { argumente: AnmeldungArgumente; ergebnis: Startaufgabe };
  startaufgaben_lesen: { argumente: AnmeldungArgumente; ergebnis: Startaufgabe };
  startaufgaben_fortschritt: { argumente: KeineArgumente; ergebnis: number };
  startaufgaben_abschliessen: {
    argumente: AnmeldungArgumente & { kennung: number; schritt: number };
    ergebnis: Startaufgabe;
  };
  startaufgaben_abmelden: { argumente: AnmeldungArgumente; ergebnis: KeinErgebnis };
  // App-Update (nur Desktop)
  app_update_zustand: { argumente: KeineArgumente; ergebnis: AppUpdateMeldung };
  app_update_pruefen: {
    argumente: { anlass: AppUpdateAnlass };
    ergebnis: AppUpdatePruefergebnis;
  };
  app_update_ausblenden: { argumente: KeineArgumente; ergebnis: KeinErgebnis };
  /** Kehrt nach Abschluss des Downloads zurück; den Verlauf melden die Zustandsereignisse. */
  app_update_herunterladen: { argumente: KeineArgumente; ergebnis: KeinErgebnis };
  /** Nur aus `bereit`: fragt das Beenden an, installiert und startet neu. */
  app_update_installieren: {
    argumente: KeineArgumente;
    ergebnis: AppUpdateInstallationsergebnis;
  };
  app_update_release_seite_oeffnen: { argumente: KeineArgumente; ergebnis: KeinErgebnis };
  /** Dieses Fenster zeigt zur Beenden-Anfrage `id` eine Rückfrage. */
  beenden_anfrage_rueckfrage: { argumente: { id: number }; ergebnis: KeinErgebnis };
  /** Antwort dieses Fensters auf die Beenden-Anfrage `id`. */
  beenden_anfrage_antworten: {
    argumente: { id: number; bereit: boolean };
    ergebnis: KeinErgebnis;
  };
  /** Vor dem Schließen eines Hauptfensters: `false`, wenn es unter Windows/Linux das
   *  letzte war und stattdessen die App über die Beenden-Anfrage beendet wird bzw.
   *  nach Abbruch offen bleibt; sonst `true` (wie bisher schließen). */
  hauptfenster_schliessen_freigeben: { argumente: KeineArgumente; ergebnis: boolean };
  /** Vollständige Metadatenliste des festen Gesetzesordners; jeder Teilfehler verwirft die Liste. */
  gesetz_dateistempel_lesen: {
    argumente: KeineArgumente;
    ergebnis: GesetzdateiStempel[];
  };
  // Dateien und Archivierung
  app_daten_loeschen: { argumente: DateiArgumente; ergebnis: KeinErgebnis };
  atomar_datei_schreiben: { argumente: SchreibArgumente; ergebnis: KeinErgebnis };
  archiviere_beschaedigte_datei: { argumente: ArchivArgumente; ergebnis: ArchivErgebnis };
  sichere_abweichende_version: { argumente: DateiArgumente; ergebnis: TextErgebnis };
  /** Öffnet den Datenordner bzw. einen existierenden Ordner darin im Dateimanager (Desktop). */
  datenordner_oeffnen: { argumente: { relativerOrdner?: string }; ergebnis: KeinErgebnis };
  // Sperren
  datei_sperre_erwerben: { argumente: PfadArgumente; ergebnis: TextErgebnis };
  datei_sperre_freigeben: { argumente: TokenArgumente; ergebnis: KeinErgebnis };
  datei_sperre_unterbrechen: { argumente: TokenArgumente; ergebnis: KeinErgebnis };
  /** true: seit dem Unterbrechen keine Prüfvorgangsänderung und kein Konfliktdatei-Schreiben. */
  datei_sperre_fortsetzen: { argumente: TokenArgumente; ergebnis: Wahrheitswert };
  gesetz_import_sperre_versuchen_zu_erhalten: {
    argumente: KurztitelArgumente;
    ergebnis: Wahrheitswert;
  };
  gesetz_import_sperre_freigeben: { argumente: KurztitelArgumente; ergebnis: KeinErgebnis };
  pruefvorgang_registrieren: { argumente: KonfliktArgumente; ergebnis: TextErgebnis };
  pruefvorgang_wiederholung_uebernehmen: { argumente: KonfliktArgumente; ergebnis: Wahrheitswert };
  pruefvorgang_quellen_abwarten: { argumente: KeineArgumente; ergebnis: KeinErgebnis };
  pruefvorgang_abfragen: { argumente: VorgangsArgumente; ergebnis: VorgangsStand };
  pruefvorgang_abbrechen: { argumente: VorgangsArgumente; ergebnis: VorgangsStand };
  pruefvorgang_quelle_abschliessen: { argumente: VorgangsArgumente; ergebnis: VorgangsStand };
  pruefvorgang_fehler: { argumente: VorgangsArgumente; ergebnis: VorgangsStand };
  pruefvorgang_teilpruefung_abschliessen: { argumente: VorgangsArgumente; ergebnis: VorgangsStand };
  pruefvorgang_vollbedarf: { argumente: VorgangsArgumente; ergebnis: VorgangsStand };
  pruefvorgang_vollpruefung_abschliessen: { argumente: VorgangsArgumente; ergebnis: VorgangsStand };
  // Fenster und Farbschema
  ziehvorschau_oeffnen: { argumente: ZiehvorschauArgumente; ergebnis: KeinErgebnis };
  ziehvorschau_bewegen: {
    argumente: ZugArgumente & { x: number; y: number };
    ergebnis: KeinErgebnis;
  };
  ziehvorschau_verbergen: { argumente: ZugArgumente; ergebnis: KeinErgebnis };
  ziehvorschau_schliessen: { argumente: ZugArgumente; ergebnis: KeinErgebnis };
  fenster_oeffnen_mit_label: { argumente: FensterArgumente; ergebnis: KeinErgebnis };
  neues_fenster_anfordern: { argumente: KeineArgumente; ergebnis: KeinErgebnis };
  fenster_alle_positionen: { argumente: KeineArgumente; ergebnis: FensterPositionen };
  fenster_vordergrund_holen: { argumente: LabelArgumente; ergebnis: KeinErgebnis };
  fenster_menu_status_aktualisieren: { argumente: KeineArgumente; ergebnis: KeinErgebnis };
  kommentar_fenster_oeffnen: { argumente: HilfsfensterArgumente; ergebnis: KeinErgebnis };
  verweismarkierung_fenster_oeffnen: { argumente: HilfsfensterArgumente; ergebnis: KeinErgebnis };
  einstellungen_fenster_oeffnen: { argumente: KeineArgumente; ergebnis: KeinErgebnis };
  markierungskonflikte_fenster_oeffnen: { argumente: KeineArgumente; ergebnis: KeinErgebnis };
  fenster_farbschema_anwenden: { argumente: SchemaArgumente; ergebnis: KeinErgebnis };
  system_theme_melden: { argumente: DunkelArgumente; ergebnis: KeinErgebnis };
  // Übergaben
  tab_uebertragung_ablegen: { argumente: NutzlastArgumente; ergebnis: KeinErgebnis };
  verweismarkierung_kontext_ablegen: { argumente: NutzlastArgumente; ergebnis: KeinErgebnis };
  kommentar_kontext_ablegen: { argumente: NutzlastArgumente; ergebnis: KeinErgebnis };
  tab_uebertragung_abholen: { argumente: LabelArgumente; ergebnis: OptionalerText };
  verweismarkierung_kontext_abholen: { argumente: LabelArgumente; ergebnis: OptionalerText };
  kommentar_kontext_abholen: { argumente: LabelArgumente; ergebnis: OptionalerText };
  tab_uebertragung_verwerfen: { argumente: NutzlastArgumente; ergebnis: KeinErgebnis };
  // Navigation
  interne_navigation_senden: { argumente: NavigationsArgumente; ergebnis: KeinErgebnis };
  interne_navigation_bereit: { argumente: BereitArgumente; ergebnis: NavigationErgebnis };
  interne_navigation_lesen: { argumente: AnmeldungArgumente; ergebnis: NavigationErgebnis };
  interne_navigation_bestaetigen: { argumente: BestaetigungArgumente; ergebnis: KeinErgebnis };
  interne_navigation_abmelden: { argumente: AnmeldungArgumente; ergebnis: KeinErgebnis };
  interne_navigation_anzeigen: { argumente: AnzeigeArgumente; ergebnis: Wahrheitswert };
  oeffnen_link_navigation_senden: { argumente: OeffnenLinkArgumente; ergebnis: KeinErgebnis };
  // Hinweise
  hauptfenster_hinweis_senden: { argumente: HinweisArgumente; ergebnis: KeinErgebnis };
  hauptfenster_hinweise_bereit: { argumente: AnmeldungArgumente; ergebnis: KeinErgebnis };
  hauptfenster_hinweise_lesen: { argumente: AnmeldungArgumente; ergebnis: HinweisErgebnis };
  hauptfenster_hinweis_bestaetigen: { argumente: HinweisBestaetigung; ergebnis: KeinErgebnis };
  hauptfenster_hinweise_abmelden: { argumente: AnmeldungArgumente; ergebnis: KeinErgebnis };
  // Import
  import_aktualisierung_starten: { argumente: KeineArgumente; ergebnis: TextErgebnis };
  import_aktualisierung_automatisch_starten: {
    argumente: KeineArgumente;
    ergebnis: OptionalerText;
  };
  import_aktualisierung_beenden: { argumente: VorgangskennungArgumente; ergebnis: KeinErgebnis };
  lade_gesetz_html_bw: { argumente: KuerzelArgumente; ergebnis: TextErgebnis };
  lade_landesrecht_uebersichtsseite: { argumente: DokArgumente; ergebnis: TextErgebnis };
  lade_landesrecht_dokumentseite: { argumente: UrlArgumente; ergebnis: TextErgebnis };
  // Präfixlauf
  praefixlauf_bericht_schreiben: { argumente: BerichtArgumente; ergebnis: TextErgebnis };
  praefixlauf_dateistand: { argumente: KeineArgumente; ergebnis: Dateistand };
  praefixlauf_arbeitsdatei_lesen: { argumente: ArbeitsdateiArgumente; ergebnis: OptionalerText };
  praefixlauf_arbeitsdatei_schreiben: {
    argumente: ArbeitsdateiArgumente & { inhalt: string };
    ergebnis: KeinErgebnis;
  };
  praefixlauf_archiv_lesen: { argumente: ArbeitsdateiArgumente; ergebnis: number[] | null };
  praefixlauf_archiv_schreiben: {
    argumente: ArbeitsdateiArgumente & { inhalt: number[] };
    ergebnis: KeinErgebnis;
  };
  praefixlauf_arbeitsdatei_loeschen: { argumente: ArbeitsdateiArgumente; ergebnis: KeinErgebnis };
  praefixlauf_auftrag: { argumente: KeineArgumente; ergebnis: AuftragErgebnis };
  praefixlauf_datei_lesen: { argumente: KeineArgumente; ergebnis: OptionalerText };
  praefixlauf_datei_schreiben: { argumente: XmlArgumente; ergebnis: KeinErgebnis };
  praefixlauf_gesetz_schreiben: { argumente: GesetzArgumente; ergebnis: KeinErgebnis };
  praefixlauf_ausgabe: { argumente: ZeilenArgumente; ergebnis: KeinErgebnis };
  praefixlauf_beenden: { argumente: CodeArgumente; ergebnis: KeinErgebnis };
  // Menü
  menu_normstatus_melden: {
    argumente: {
      status: MenueNormstatus;
    };
    ergebnis: KeinErgebnis;
  };
  menu_item_aktivieren: { argumente: MenueArgumente; ergebnis: KeinErgebnis };
  menueleiste_aktivieren: { argumente: AktivArgumente; ergebnis: KeinErgebnis };
  letzter_tab_anfrage_lesen: { argumente: KeineArgumente; ergebnis: Wahrheitswert };
}

export type Befehlsname = keyof Befehlsverzeichnis;
