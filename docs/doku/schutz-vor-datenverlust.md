# Schutz vor Datenverlust

Diese Datei hält die dauerhaften Schutzregeln gegen Datenverlust, ihre Grenzen
und die zuständigen Einstiegspunkte fest.

## App-Absturz während des Schreibens

App-eigene Daten- und Gesetzesdateien werden atomar ersetzt: Bei einem App-Absturz
bleibt die alte oder die neue vollständige Fassung erhalten. Bei Stromausfall
ist der Schutz bestmöglich; der letzte Speichervorgang ist nicht garantiert.

## Verlust der WebView-Einstellungen

Der localStorage bleibt die Laufzeitquelle der Einstellungen und liegt außerhalb
des Datenordners. Nach Änderungen exportierbarer Einstellungen (auch beim Import)
schreibt die App nach einer Sekunde ohne weitere Änderung eine atomare Kopie nach
`einstellungen/einstellungen-backup.xml`. Das bestehende Einstellungs-XML bleibt unverändert.
Die Kopie wird bei Sicherungen und Umzügen des Datenordners mitgenommen.

Nur beim Start des Desktop-Hauptfensters mit Label `main` und vollständig leerem
exportierbarem Einstellungsbestand übernimmt die App ein gültiges Backup
automatisch vor Farbschema-Anwendung und erstem Render. Danach erscheint einmal
„Einstellungen aus der Sicherung wiederhergestellt.“. Bereits vorhandene
Einstellungen werden nicht ergänzt oder überschrieben; Hilfsfenster und Mobile
stellen nicht wieder her. Sitzungsdaten (Fenster, geschlossene Tabs, Aktivierung),
Mobile-Schlüssel und der letzte Exportordner gehören nicht zum Backup.

Vor der Übernahme wird der gesamte Inhalt anhand der Anforderungen des bestehenden
Schemas geprüft. Zusätzlich gilt für Backups: XML ohne DTD; jede DOCTYPE-Deklaration
wird abgelehnt, auch ohne eigene Entities. Vordefinierte und numerische XML-Escapes
bleiben erlaubt. Diese Einschränkung ist bewusst enger als das RelaxNG-Schema;
der Einstellungsimport bleibt unverändert. Beschädigte oder unzulässige Backups, einschließlich leerer
Dateien, werden archiviert und ignoriert; der Start läuft weiter. Bei Änderungen
zwischen Lesen und Archivierung gilt dieselbe vollständige Prüfung erneut.

„Einstellungen zurücksetzen“ löscht zuerst das Backup und leert danach den
localStorage unter derselben appweiten Dateisperre. Bei einem Lösch- oder
Sperrfehler bleiben die Einstellungen erhalten und der Vorgang meldet den Fehler.
Wartende Schreibvorgänge lesen den Bestand erst unter der Sperre und können nach
dem Zurücksetzen keine alten Werte zurückschreiben. Erst eine neue Änderung
erzeugt wieder ein Backup. Ein leerer Bestand allein überschreibt das Backup nie.
Schreibfehler verwerfen keine Einstellungen. Beim Dateiimport erscheinen
Backupfehler im zugehörigen Importbericht; außerhalb des Dateiimports werden sie
höchstens einmal bis zum nächsten erfolgreichen Schreiben gemeldet. Beim Beenden
innerhalb der Verzögerung kann die letzte Änderung im Backup fehlen.

Entwicklungs- und Release-Build verwenden getrennten localStorage, teilen sich
aber dieselbe Backup-Datei. Ein Release-Start kann daher Entwicklungseinstellungen
übernehmen; Zurücksetzen im Entwicklungsbuild löscht auch das Release-Backup.
Beim Wiederherstellen kann das Farbschema kurz falsch aufblitzen, weil das
Startskript in `index.html` vor der Wiederherstellung liest.

Zuständig: [einstellungenBackup.ts](../../src/lib/einstellungen/einstellungenBackup.ts),
[einstellungenSpeicher.ts](../../src/lib/einstellungen/einstellungenSpeicher.ts)
und [main.tsx](../../src/main.tsx).

## Abweichende Formatversion

Die [Versionsregel](xml-formate.md#projektweite-regeln) lässt Lesen und Bearbeiten
weiter zu und schützt vor dem ersten Überschreiben den Originalstand als Kopie
im Datenordner. Die Meldung nennt Anlass und Sicherungspfad; ein Fehler bei der
Sicherung verhindert das Schreiben. Die Ausnahmen und die genaue Bedingung
stehen ausschließlich in der Versionsregel.

## Unlesbar geschriebene Markierungsdatei

Eine Markierungsdatei wird nur geschrieben, wenn ihr Inhalt keine in XML 1.0
unzulässigen Zeichen enthält und als wohlgeformtes MarkierungsXML lesbar ist;
sonst wird weder gesichert noch geschrieben, und es erscheint die übliche
Schreibfehlermeldung. Die Zeichenprüfung hängt nicht von der Strenge des
WebView-Parsers ab. Nutzertext wird schon beim Übernehmen bereinigt
([Zeichenregel](xml-formate/markierungen.md#eingangskontrolle-und-befunde)).
Bereits beschädigte Dateien werden beim Laden beiseitegelegt und beim Import
abgelehnt; beim Lesen wird nichts repariert.

Zuständig: [markierungSpeicher.schreiben.ts](../../src/lib/markierungen/eintrag/markierungSpeicher.schreiben.ts)
(einziger Schreibweg für Markierungsdateien).

## Bereits beschädigte Nutzerdaten-Datei

Erkannte beschädigte, nicht leere Dateien für Favoriten, Gesetzeskurzbefehle, Lesezeichen
und Markierungen werden vor einer regulären Änderung vollständig als `.bak`
gesichert und beiseitegelegt. Lese- oder Sicherungsfehler brechen die Änderung
mit sichtbarer Meldung ab. Eine inzwischen veränderte Datei wird vor der
Archivierung erneut beurteilt.

Die Wurzel-Tag-Prüfung allein erkennt keine Schäden innerhalb intakter Tags.
Bei Markierungsdateien erkennt zusätzlich die Eingangskontrolle nicht passende
Einträge und meldet sie als Befunde. Unter der Dateisperre wird das vollständige
Original als `.bak` gesichert; die lesbaren Einträge der erneut eingelesenen
Sicherung werden sofort zurückgeschrieben. Erst danach erscheint eine
Sammelmeldung mit Anzahl, höchstens drei Ausgangsstellen und Sicherungspfad.
Ein erneutes oder paralleles Laden erzeugt keine zweite Sicherung oder Meldung.
Scheitert Sicherung oder Rückschreiben, endet der Ladevorgang als Fehler, ohne
Ersatzbestand oder Bereinigungserfolg; eine vorhandene Sicherung wird benannt.
Das kurze Zeitfenster ohne Originaldatei zwischen Beiseitelegen und
Rückschreiben bleibt bestehen. Der strikte Prüfweg schreibt und sichert nie;
Befunde lösen dort die bestehende Quellheilung aus.
Importieren mit „Ersetzen“ bleibt eine bewusste Ausnahme; Sicherungen werden
nicht automatisch wiederhergestellt.

## Beschädigte Gesetzes- und Titeldateien

Einzelne Lade- oder Sicherungsfehler entfernen andere gültige Gesetze nicht
aus dem geladenen Bestand.

| Befund                                                                                                                  | Schutzverhalten                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Ungültiges Gesetz mit eindeutig erkannter Quelle Bund oder BW                                                           | Zunächst erhalten; „Alle aktualisieren“ bietet Reparatur aus dieser Quelle an. Vor dem Schreiben wird die Zielidentität geprüft. |
| Ungültiges Gesetz mit EU-, unbekannter oder fehlender Quelle; beschädigte oder falsch zugeordnete nichtamtlicheTitelXML | Vor dem Entfernen vollständig als `.bak` sichern. Scheitert die Sicherung, bleibt das Original erhalten.                         |
| Unlesbare Datei                                                                                                         | Nicht archivieren; Lesefehler sichtbar halten.                                                                                   |
| Verbindungs- oder Downloadfehler bei der Reparatur                                                                      | Ungültige Datei und Reparaturangebot erhalten; erneuter Versuch bleibt möglich.                                                  |

Ein Inhaltsvergleich schützt vor Archivierung aufgrund eines veralteten
Lesestands. Eine inzwischen gültige Datei wird bei der Reparatur nicht
überschrieben, eine inzwischen fehlende nicht ungefragt neu installiert.
Beschäftigte Gesetze bleiben für einen späteren Versuch erhalten. „Gesichert,
aber nicht entfernt“ wird von erfolgreichem Beiseitelegen unterschieden;
fehlende und leere Dateien gelten nicht als erfolgreiche Archivierung.

Mitgelieferte Titel können nach der Entfernung beim nächsten Laden über den
Fensterbestand, durch die Titel-Hintergrundaufgabe beim App-Start oder beim
nächsten Speichern des Gesetzes aus den Ressourcen nachgezogen werden. Eigene Titel bleiben ausschließlich
in der Sicherung; eine automatische Rekonstruktion gibt es nicht.

Unlesbare Gesetzesbestände belegen weder fehlende Gesetze noch fehlende Normen
und lösen keinen automatischen Import aus. Erst verlässlich fehlende Gesetze
beginnen den Importweg mit Wiederholungsangebot bei Fehlern. Tabwahl, Zielprüfung
und Verlaufserhalt: [Öffnungsvertrag](adressierungsformat-eingefroren.md#konkrete-ziele-sofortimport-und-verlauf).

**Grenzen:** Maßgeblich sind die bestehenden Parserprüfungen, keine vollständige
XML-Schemavalidierung. Für EU- und unbekannte Quellen gibt es keinen
Reimport-Button. Der Inhaltsvergleich schützt die Archivierung, garantiert
aber keine vollständige Transaktion beim Reimport gegenüber externen Bearbeitern.

## Gleichzeitige Änderungen

Favoriten, Gesetzeskurzbefehle, Lesezeichen und Markierungen sperren den vollständigen
Lese-Ändern-Schreiben-Vorgang je Datei innerhalb eines App-Prozesses, auch beim
Zusammenführen, Ersetzen und Sichern. Ein abgewiesener Sperrerwerb verändert
nichts; Hilfsfenstereingaben bleiben erhalten. Nach zehn Sekunden Wartezeit wird ein
erneuter Versuch angeboten. Ein aktiver Halter darf länger arbeiten.

Das Zerstören eines Fensters macht seine Tokens ungültig; laufende
Dateioperationen müssen vor der Freigabe abgeschlossen sein. Ein abgebrochener
Schließversuch gibt die Sperre nicht frei. Es gibt keinen Rückfall auf
ungeschütztes Schreiben.

Mehrteilige Undo-/Redo-Aktionen sperren jeden Einzelschritt. Andere Fenster
können dazwischen speichern. Nach Teilfehlern bleiben abgeschlossene Schritte
erhalten; ein erneuter Versuch setzt nur die offenen Schritte fort.

**Grenzen:** Zweite App-Instanzen und externe Programme beachten diese Sperren
nicht. Ein hängender Halter kann bis zum App-Neustart blockieren. Gleichzeitig
angestoßene Aktionen haben keine garantierte Aufrufreihenfolge. Die Dateisperre
verhindert keine fachlichen Konflikte zwischen mehreren Bearbeitungsfenstern;
bewusstes Ersetzen und Löschen dürfen frühere Änderungen entfernen.

Für Gesetzesdateien und nichtamtliche Titel gelten eigene Speicher- und
Importsperren; die Konfliktdatei hat ihren eigenen gesperrten Prüfweg.
Fenstergeometrie, Suchindex und Aktivierung im Browserspeicher fallen nicht
unter den genannten Schutz für Nutzerdaten-Dateien.

## Sichtbare Fehler bei Schreibaktionen

Schreibfehler werden am betroffenen Vorgang sichtbar gemeldet. Ein regulärer
Dialogabbruch bleibt ohne Fehlermeldung. Fehler dürfen weder Erfolg vortäuschen
noch eine wiederholbare Undo-/Redo-Aktion verwerfen. Mehrstufige Aktionen sind
keine Gesamttransaktionen: Gespeicherte Teilschritte bleiben nach Folgefehlern
erhalten. Benachrichtigungsfehler sind von Speicherfehlern zu unterscheiden;
sie können Anzeigen bis zum nächsten erfolgreichen Abgleich veralten lassen.

Eine vollständige Neuprüfung schreibt keinen aktuellen Konfliktstand auf
unvollständig lesbarer Grundlage. Lade-, Prüf- und Speicherfehler bleiben
sichtbar; die Prüfung bleibt wiederholbar. Bereits erfolgte Sicherungen,
Archivierungen oder Löschungen werden bei einem Folgefehler nicht zurückgenommen.
Ein gewöhnlicher Prüffehler erzeugt keine zusätzliche Sicherung der Konfliktdatei.
Erkannt beschädigtes Konflikt-XML wird dagegen unter der Dateisperre vor dem
Beiseitelegen als `.bak` gesichert; Sicherungsfehler brechen die Verarbeitung ab.
Der verlorene Prüfstand erfordert eine vollständige Neuprüfung.

**Grenzen:** Die Fehleranzeige bei Gesetzexport gilt für Dialog- und Schreibfehler;
Lesefehler vor dem Schreibversuch fallen nicht unter diese Zusage.
Fenstergeometrie, Hintergrundaktualisierung und Importindex behalten ihre
eigenen Fehlerstrategien. Konfliktprüfung und Statusbedeutung:
[Markierungskonflikte](markierungskonflikte.md#prüfabläufe).

### Verknüpfungsaktionen im Markierungskonfliktfenster

Elementstände werden aus frisch gelesenen Markierungen und Gesetzesquellen unter
gemeinsamen Dateisperren berechnet. Prüfung und Fensterabgleich folgen erst
nach deren Freigabe. Auch hier besteht keine atomare Gesamttransaktion.

Nur tatsächlich gespeicherte Änderungen zählen als Erfolg. Bei einem
nachgelagerten Prüf- oder Abgleichfehler bleiben Befunde, gespeicherte Teilerfolge
und Fehler sichtbar; weitere Gesetze werden nicht bearbeitet. Ein unbestätigter
Abschluss sperrt weitere schreibende und von der Prüfwarteschlange abhängige
Aktionen. „Alle Markierungen neu prüfen“ bleibt als Wiederaufnahmeweg verfügbar;
erst eine erfolgreiche ausdrückliche Vollprüfung erlaubt frisches Nachladen
und neue Aktionen. Ladefehler ersetzen vorhandene Befunde nicht durch eine
leere Liste. Aktionsumfang und fachliche Grenzen:
[Konfliktübersicht](markierungskonflikte.md#allgemeine-aktionen).

## Schließen von Kommentar- und Verweismarkierung-Fenstern

Ungespeicherte Textänderungen lösen beim Schließen über Fensterkreuz, Escape
oder ⌘W/Strg+W die Wahl „Speichern“, „Verwerfen“ oder „Abbrechen“ aus.
„Abbrechen“ erhält Fenster und Text. Die Textbezug-Checkbox allein gilt vor dem
Speichern nicht als Textänderung. Vor Einrichtung des Schließschutzes ist kein
editierbares Formular verfügbar; Fehler lassen das Fenster mit Meldung offen.

Bereits gespeicherte Inhalte und ihre bestätigte Übernahme für Rückgängig sind
getrennte Abschlüsse. Bei offener Übernahme wird nur diese erneut versucht;
der Inhalt wird nicht nochmals gespeichert. Bewusstes „Trotzdem schließen“
bleibt möglich.

Das Schließen wartet auf laufende Gesetz-Speichervorgänge und deren
Benachrichtigungen, nicht auf laufende Downloads. Ein abgeschlossener Versand
bestätigt keine bereits aktualisierte Anzeige in jedem Empfänger. Ein späterer
Ausfall des nativen Schließereignissystems ist nicht durch den JavaScript-Schutz
abgedeckt.

## Beenden-Anfrage

Vor der Installation eines App-Updates und vor dem Beenden fragt die App alle
offenen Fenster, ob sie beendet werden dürfen. Es läuft höchstens eine Beenden-Anfrage zugleich.
Zuerst antworten die Hilfsfenster, danach die Hauptfenster; so beenden
Hauptfenster ihr Speichern erst, wenn kein Hilfsfenster mehr abbricht.

- Hilfsfenster mit Schließschutz stellen dieselbe Rückfrage wie beim
  Fensterkreuz. „Abbrechen“ bricht die Beenden-Anfrage ab; Fenster und Text
  bleiben. Hilfsfenster ohne ungespeicherte Eingaben sind sofort bereit.
  Läuft schon ein eigenes Schließen und speichert das Hilfsfenster gerade,
  wartet die Beenden-Anfrage dessen Abschluss ab. Bei einer bereits offenen
  Rückfrage zum eigenen Schließen meldet das Hilfsfenster „nicht bereit“.
- Hauptfenster beenden ihr laufendes Speichern, warten auf laufende
  Gesetz-Speichervorgänge einschließlich Datei-Importen und deren
  Benachrichtigungen und speichern Tabs und Geometrie ein letztes Mal. Neue
  Gesetz-Speichervorgänge des Fensters (etwa der Hintergrundaktualisierung)
  beginnen danach erst wieder nach einer Abbruchnachricht. Anders
  als beim Schließen bleibt der Fensterzustand erhalten; die Sitzung wird beim
  nächsten Start wiederhergestellt.
- Ein Fenster, das während der Anfrage verschwindet, gilt als bereit.
- Je Stufe gilt eine Frist von 30 Sekunden. Sie ruht, solange ein Fenster
  für die Anfrage eine Rückfrage zeigt. Nach dessen Antwort beginnt die Frist
  für die noch offenen Fenster neu. Bei einem Fristablauf bricht die Anfrage
  ab. Das Fensterlabel steht in der Konsole.

Bei Abbruch erhalten alle bereits angefragten Fenster außer dem ablehnenden
eine Abbruchnachricht und arbeiten unverändert weiter; Hauptfenster speichern
wieder laufend. Erreicht der Abbruch ein Hilfsfenster mit offener Rückfrage
zur Beenden-Anfrage, bleibt der Text bei „Verwerfen“ erhalten. Bei „Speichern“
wird gespeichert und das Fenster bleibt offen. Das App-Update bleibt installationsbereit. Sind alle Fenster
bereit, wird installiert und neu gestartet, ohne die Fenster einzeln zu
schließen. Schlägt die Installation fehl, erhalten die vorbereiteten Fenster
ebenfalls die Abbruchnachricht.

Ein Hilfsfenster bleibt nach seiner Zustimmung bis zum Beenden bedienbar.
Eingaben in dieser Zeit gehen beim Beenden verloren.

Beenden-Wege:

- macOS: „LexLata beenden“ (⌘Q), „Beenden“ im Dock sowie Abmelden und
  Herunterfahren laufen über die Beenden-Anfrage. Die App lehnt das sofortige
  Beenden ab und beendet sich erst, wenn alle Fenster bereit sind; bei Abbruch
  bleibt sie offen. Ein dadurch unterbrochenes Abmelden muss erneut gestartet
  werden. Nach dem letzten Fenster bleibt die App geöffnet.
- Windows/Linux: Das Schließen des letzten Hauptfensters startet die
  Beenden-Anfrage. Seine Sitzung bleibt erhalten wie beim Beenden auf macOS;
  bei Abbruch bleiben alle Fenster offen. Sind weitere Hauptfenster offen,
  schließt das Fenster und entfernt seinen Fensterzustand.
- Der Neustart zur Installation eines App-Updates und das Beenden durch den
  Windows-Installer folgen erst auf eine erfolgreiche Beenden-Anfrage und
  fragen nicht erneut.

Grenzen: Ein Hilfsfenster, dessen Inhalt noch lädt, antwortet nicht und führt
nach Ablauf der Frist zum Abbruch. Andere Schreibvorgänge als
Gesetz-Speichervorgänge (etwa Einstellungen) hält die Beenden-Anfrage nicht
an; jede Datei wird dabei atomar ersetzt. Abmelden und Herunterfahren unter
Windows/Linux meldet Tauri nicht; sie laufen nicht über die Beenden-Anfrage.

## Fensterabgleich nach bestätigter Gesetzeslöschung

Erst die bestätigte Dateientfernung schließt die Tabs dieser Gesetzesreferenz
in allen erreichten Hauptfenstern. Gleichnamige Gesetze anderer Normgeber
bleiben geöffnet; der letzte Tab wird durch einen leeren ersetzt, kein
Hauptfenster geschlossen. Fehlgeschlagene Löschung, unlesbarer Bestand oder
eine beim allgemeinen Reload fehlende Datei allein schließen keine Tabs.
Ausstehende Schreibvorgänge dürfen keinen Verlauf für entfernte Tabs anlegen.

Ein Versandfehler macht die Dateilöschung nicht rückgängig. Ohne erfolgreichen
Empfang kann eine Anzeige bis zum nächsten Abgleich veraltet bleiben.

## Geordnete Reloads und tablokale Aktivierung

Neuere Bestände entwerten ältere, verspätete Ladeergebnisse. Betroffene
Gesetzesreferenzen bleiben bis zum erfolgreichen Abgleich vorgemerkt; ein
Neuimport öffnet bereits geschlossene Tabs nicht automatisch. Bei einer
Inhaltsänderung bleibt die gültige aktive XML-ID oder Gliederungskennzahl je
Tab erhalten. Ein ausdrücklicher Sprungauftrag hat Vorrang. Fehlende Normen
werden nicht durch geratene Ersatznormen ersetzt; pixelgenaue Scrollposition
und Einklappstruktur sind nicht zugesagt.

## Fensterstart und Ladefehler im Hilfsfenster

Die automatische Fensterwiederherstellung importiert fehlende Gesetze nicht.
Der gemeinsame Stapel der zehn zuletzt geschlossenen Tabs bleibt über Neustarts
hinweg erhalten und wird beim Desktopstart nicht bereinigt. Das ausdrückliche
Wiederöffnen eines Tabs verwendet den
[gemeinsamen Sofortimport](adressierungsformat-eingefroren.md#konkrete-ziele-sofortimport-und-verlauf).
Sein Menüstatus wird aus dem gemeinsam gespeicherten Stapel abgeleitet;
Auswahl und Undo/Redo bleiben fensterbezogen.

Ladefehler einer bekannten Hilfsfensterwurzel zeigen im vorgesehenen Fenster
eine Meldung mit erneutem Versuch. Kontextabholung und Formularaktionen beginnen
erst nach erfolgreichem Laden. Allgemeine Render- und Laufzeitfehler sind davon
nicht abgedeckt.

## Zuständigkeiten und Einstiegspunkte

| Verantwortung                                                 | Einstiegspunkt                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AppData-Dateizugriff und atomarer Ersatz                      | [appDatenZugriff.ts](../../src/lib/persistenz/kern/dateizugriff/appDatenZugriff.ts), [commands/datei_io.rs](../../src-tauri/src/commands/datei_io.rs)                                                                                                                                                                                                                                                        |
| Geschütztes Lesen und Sicherung beschädigter Inhalte          | [appDatenLesenGeschuetzt.ts](../../src/lib/persistenz/kern/appDatenLesenGeschuetzt.ts)                                                                                                                                                                                                                                                                                                                       |
| Dateisperren und Fensterlebensdauer                           | [dateiSperre.ts](../../src/lib/persistenz/kern/dateizugriff/dateiSperre.ts), [commands/datei_sperre.rs](../../src-tauri/src/commands/datei_sperre.rs)                                                                                                                                                                                                                                                        |
| Gesetzes- und Titeldateien                                    | [gesetzSpeicher.ts](../../src/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicher.ts), [nichtamtlicheTitelSpeicher.ts](../../src/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.ts)                                                                                                                                                                                                    |
| Reparatur und Ladebefunde                                     | [gesetzReparaturDispatch.ts](../../src/lib/import/dispatch/gesetzReparaturDispatch.ts), [gesetzLadeMeldungen.ts](../../src/lib/gesetz-laden/gesetzLadeMeldungen.ts)                                                                                                                                                                                                                                          |
| Markierungsaktionen und Undo/Redo                             | [useMarkierungen.ts](../../src/hooks/markierungen/useMarkierungen.ts), [markierungSpeicher.ts](../../src/lib/markierungen/eintrag/markierungSpeicher.ts)                                                                                                                                                                                                                                                     |
| Konfliktaktionen und Prüfpersistenz                           | [konfliktaktionen.ts](../../src/lib/markierungen/markierungskonflikte/konfliktaktionen/konfliktaktionen.ts), Dateizugriff, Sperre und Meldung: [markierungskonflikteSpeicher.dateiZugriff.ts](../../src/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff.ts), Format: [markierungs-xml](../../src/lib/markierungen/markierungs-xml/markierungs-xml.index.ts) |
| Schließschutz und Abschluss gespeicherter Hilfsfensterinhalte | [useFensterSchliessenAbsichern.ts](../../src/hooks/fenster/useFensterSchliessenAbsichern.ts)                                                                                                                                                                                                                                                                                                                 |
| Beenden-Anfrage                                               | [fenster/beenden_anfrage.rs](../../src-tauri/src/fenster/beenden_anfrage.rs), [useBeendenAnfrage.ts](../../src/hooks/fenster/useBeendenAnfrage.ts)                                                                                                                                                                                                                                                           |
| Fensterabgleich und Tabzustand                                | [useGesetzVerwaltung.ts](../../src/hooks/tabs/useGesetzVerwaltung.ts), [useAppTabs.ts](../../src/hooks/tabs/useAppTabs.ts)                                                                                                                                                                                                                                                                                   |
| Start und Hilfsfensterladen                                   | [useFensterstartInitialisierung.ts](../../src/hooks/useFensterstartInitialisierung.ts), [main.tsx](../../src/main.tsx)                                                                                                                                                                                                                                                                                       |

Datenschutz und Grenzen der BW-Abruffenster:
[eingebettete Textquelle](../../DATENSCHUTZ.md).
