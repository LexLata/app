// meldungsgruppen.ts
// Gruppen der gegliederten Anzeige je Meldungsgrund: Überschrift für die
// Gliederungsform und ganzer Satz (Singular/Plural) für die Satzform. Gemeinsam
// genutzt von Vorgangsergebnis- und Dateibefund-Bannern sowie dem Importbericht.
import type { MeldungsGrund } from './aktionsMeldung';
import type { Gliederungsgruppe } from './meldungsgliederung';

type Meldungsgruppe = Gliederungsgruppe & { schluessel: MeldungsGrund };

/** Satz „<Namen> <Singular|Plural>.“ */
function verb(singular: string, plural: string) {
  return (namen: string, anzahl: number) => `${namen} ${anzahl > 1 ? plural : singular}.`;
}

/** Aktualisierung und Reparatur. */
export const FEHLERGRUPPEN: readonly Meldungsgruppe[] = [
  {
    schluessel: 'keineVerbindung',
    ueberschrift: () => 'Keine Verbindung',
    satz: (namen) => `${namen}: keine Verbindung.`,
  },
  {
    schluessel: 'beschaeftigt',
    ueberschrift: () => 'Gerade anderweitig in Bearbeitung',
    satz: verb('ist gerade anderweitig in Bearbeitung', 'sind gerade anderweitig in Bearbeitung'),
  },
  {
    schluessel: 'downloadFehlgeschlagen',
    ueberschrift: () => 'Download fehlgeschlagen',
    satz: verb('konnte nicht heruntergeladen werden', 'konnten nicht heruntergeladen werden'),
  },
  {
    schluessel: 'aktualisierungFehlgeschlagen',
    ueberschrift: () => 'Aktualisierung fehlgeschlagen',
    satz: verb('konnte nicht aktualisiert werden', 'konnten nicht aktualisiert werden'),
  },
];

/** Dateibefunde (Probleme mit lokalen Dateien). */
export const DATEIBEFUNDGRUPPEN: readonly Meldungsgruppe[] = [
  {
    schluessel: 'imDatenordnerGesichert',
    ueberschrift: () => 'Wegen Beschädigung gesichert',
    satz: verb('wurde wegen Beschädigung gesichert', 'wurden wegen Beschädigung gesichert'),
  },
  {
    schluessel: 'gesichertNichtEntfernt',
    ueberschrift: () => 'Wegen Beschädigung gesichert, aber nicht entfernt',
    satz: verb(
      'wurde wegen Beschädigung gesichert, aber nicht entfernt',
      'wurden wegen Beschädigung gesichert, aber nicht entfernt',
    ),
  },
  {
    schluessel: 'wegenSchemaversionGesichert',
    ueberschrift: () => 'Wegen abweichender Schemaversion gesichert',
    satz: verb(
      'wurde wegen abweichender Schemaversion gesichert',
      'wurden wegen abweichender Schemaversion gesichert',
    ),
  },
  {
    schluessel: 'schemaversionAbweichend',
    ueberschrift: () => 'Abweichende Schemaversion',
    satz: verb('hat eine abweichende Schemaversion', 'haben eine abweichende Schemaversion'),
  },
  {
    schluessel: 'dateiFehlt',
    ueberschrift: (anzahl) => (anzahl === 1 ? 'Datei fehlt' : 'Dateien fehlen'),
    satz: verb('fehlt', 'fehlen'),
  },
  {
    schluessel: 'dateiLeer',
    ueberschrift: (anzahl) => (anzahl === 1 ? 'Datei leer' : 'Dateien leer'),
    satz: verb('ist leer', 'sind leer'),
  },
  {
    schluessel: 'nichtLesbar',
    ueberschrift: () => 'Nicht lesbar',
    satz: verb('konnte nicht gelesen werden', 'konnten nicht gelesen werden'),
  },
  {
    schluessel: 'sicherungFehlgeschlagen',
    ueberschrift: () => 'Sicherung fehlgeschlagen',
    satz: verb('konnte nicht gesichert werden', 'konnten nicht gesichert werden'),
  },
  {
    schluessel: 'bereinigt',
    ueberschrift: () => 'Ungültige Angaben entfernt',
    satz: (namen) => `Aus ${namen} wurden ungültige Angaben entfernt.`,
  },
  {
    schluessel: 'nichtBereinigt',
    ueberschrift: (anzahl) =>
      anzahl === 1 ? 'Konnte nicht bereinigt werden' : 'Konnten nicht bereinigt werden',
    satz: verb('konnte nicht bereinigt werden', 'konnten nicht bereinigt werden'),
  },
  {
    schluessel: 'nichtSpeicherbar',
    ueberschrift: (anzahl) =>
      anzahl === 1 ? 'Konnte nicht gespeichert werden' : 'Konnten nicht gespeichert werden',
    satz: verb('konnte nicht gespeichert werden', 'konnten nicht gespeichert werden'),
  },
];

/** Gründe, bei denen stets eine Sicherung entstanden ist. */
const GRUENDE_MIT_SICHERUNG: ReadonlySet<string> = new Set<MeldungsGrund>([
  'imDatenordnerGesichert',
  'gesichertNichtEntfernt',
  'wegenSchemaversionGesichert',
  'bereinigt',
]);

/** Schlusssatz statt Pfad, wenn Sicherungen im Datenordner liegen; steht je
 * Anzeige genau einmal nach allen Meldungen (Rohtexte enthalten ihn nicht). */
export function sicherungenImDatenordnerSatz(anzahl: number): string {
  return anzahl === 1
    ? 'Die Sicherung liegt im LexLata-Datenordner.'
    : 'Die Sicherungen liegen im LexLata-Datenordner.';
}

/** Anzahl der Sicherungen hinter den Meldungen: Meldungen mit Sicherungsdatei
 *  (je Datei einmal) sowie Meldungen, deren Grund stets eine Sicherung bedeutet
 *  (je Grund und Betroffenem einmal). 0, wenn kein Sicherungshinweis nötig ist. */
export function anzahlSicherungen(
  meldungen: readonly { grund?: string; betroffen?: string; sicherung?: string }[],
): number {
  const sicherungen = new Set<string>();
  for (const m of meldungen)
    if (m.sicherung) sicherungen.add(`datei:${m.sicherung}`);
    else if (m.grund && GRUENDE_MIT_SICHERUNG.has(m.grund))
      sicherungen.add(JSON.stringify([m.grund, m.betroffen]));
  return sicherungen.size;
}

/** Abschließender Satz zum Ort der Sicherungen hinter diesen Meldungen;
 *  undefined, wenn keine Meldung eine Sicherung betrifft. Für Anzeigen, die
 *  Rohtexte aneinanderreihen (Fehlerzeilen der Hilfsfenster). */
export function sicherungsHinweis(
  meldungen: readonly { grund?: string; betroffen?: string; sicherung?: string }[],
): string | undefined {
  const anzahl = anzahlSicherungen(meldungen);
  return anzahl ? sicherungenImDatenordnerSatz(anzahl) : undefined;
}

/** Gruppe eines Grunds der Tabellen Aktualisierung/Reparatur bzw. Dateibefunde. */
export function meldungsgruppe(
  grund: string | undefined,
): { kategorie: 'fehler' | 'dateien'; gruppe: Meldungsgruppe } | undefined {
  const fehler = FEHLERGRUPPEN.find((g) => g.schluessel === grund);
  if (fehler) return { kategorie: 'fehler', gruppe: fehler };
  const datei = DATEIBEFUNDGRUPPEN.find((g) => g.schluessel === grund);
  return datei ? { kategorie: 'dateien', gruppe: datei } : undefined;
}
