# Abgeleitete Daten: Suchverzeichnis

Das Suchverzeichnis in `cache/suchverzeichnis.json` der App-Daten enthält
Suchdaten der installierten Gesetze. Es ist aus den Gesetzesdateien neu erzeugbar,
kein Nutzerdatum und weder Teil von Backup noch Export. Die Gesetzesdateien sind bei
Abweichungen maßgeblich. Importindizes beschreiben dagegen die Angebote externer Quellen;
die Volltextsuche benötigt zusätzlich den Normtext.

## JSON-Dateivertrag, Version 1

Die Wurzel enthält `version: 1`, `abgeglichen` als Boolean und `eintraege` als
Array. Unbekannte Versionen, fehlende, leere oder fehlerhafte Dateien werden als
leerer, nicht abgeglichener Stand gelesen und beim Abgleich neu aufgebaut.
Es gibt dafür keine Sicherung oder Migration.

| Feld eines Eintrags            | Inhalt                                                                                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                       | `in-ordnung` oder `nicht-lesbar`                                                                                                                                                 |
| `kurztitel`, `normgeber`       | Gesetzesreferenz; bei nicht lesbaren Dateien nur, soweit aus dem Dateinamen ableitbar                                                                                            |
| `dateistempel`                 | `groesse` und `aenderungszeit` als präzisionserhaltende Dezimaltexte, keine JavaScript-Zeitstempel                                                                               |
| Kopfangaben (nur `in-ordnung`) | `langtitel`, optional `fundstelle`, `ausfertigung`, `aenderungsvermerk`, `neugefasst`, `fassung`, `datenquelle`, `sprache`, `normpraefix`, `verarbeitungszeit`, `letzteNeuerung` |
| Suchdaten (nur `in-ordnung`)   | optionale `praefixstruktur`, `hatGliederungsartikel`, `hatNormenOhneTitel`, `normen`                                                                                             |

`fassung` enthält `art` (`konsolidiert` oder `original`), optional `stichtag`
und `erwaegungsgruendeErgaenzt`; `datenquelle` optional `name` und `url`.
Datumsobjekte (`verarbeitungszeit`, `letzteNeuerung`) werden als JSON-Zeichenketten
geschrieben und beim Lesen wieder als Datumsobjekte hergestellt. Optionale
Angaben mit `undefined` entfallen in JSON.

Jede Suchnorm enthält `xmlId`, `bezeichnung`, `art` (`normal`,
`gliederungsartikel`, `erwaegungsgrund`), `istArtikel`, `artikelkennzeichen`
(Text oder `null`), `normzahlen` (Textarray), optional `normPraefixFamilie`
(`paragraph`, `artikel`, `canon`), `bereich` (zwei nichtnegative ganze Zahlen
oder `null`) und `nebennormzahl` (Text oder `null`).
Der Eintrag enthält keine Darstellungselemente, Normtexte oder Gliederung.
Der Artikelkontext des Öffnen-Overlays auf Desktop stammt aus dem aktiven geladenen Gesetz.
Ein `nicht-lesbar`-Eintrag enthält ausschließlich Status, Dateistempel und
gegebenenfalls die Referenz, keine Kopfangaben und keine Normliste.

## Abgleich, Pflege und Sicherheit

Die Suchvorbereitung vergleicht vor einem Abgleich den gespeicherten vollständigen
Stand mit einer frischen vollständigen Dateistempelliste. Nur wenn alle Einträge
lesbar, aktuell und eindeutig sind, entfällt der Abgleich ohne Cache-Schreibzugriff
oder GesetzesXML-Lesen. Unbekannte Frische oder Vergleichsfehler führen in den
bestehenden Abgleich; ausdrücklich angeforderte Wiederholungen und die Prüfung
nach Dateiimport bleiben davon ausgenommen.

Der Abgleich setzt `abgeglichen` zunächst auf falsch und durchläuft alle Dateien
mit Größe und Änderungszeit. Unveränderte lesbare Einträge werden übernommen;
neue, geänderte, konkurrierende oder nicht lesbare Dateien werden über die
bestehenden Prüf- und Sicherungswege eingelesen. Die Darstellungen bleiben
hierbei nicht im Fensterbestand. Nach jedem Einzelschritt erhält die Anzeige
Gelegenheit zur Verarbeitung; neue Einträge werden in wachsenden Paketen
veröffentlicht. Ein abgebrochener Lauf kann auf diesen Einträgen aufbauen.

Unter der Verzeichnisdateisperre wird vor jeder Änderung frisch gelesen und
atomar geschrieben. Frische Stempelprüfungen verhindern die Übernahme von
inzwischen geänderten oder gelöschten Dateien. Erst ein vollständiger,
eindeutiger und bei lesbarem Ordner bestätigter Stand wird als abgeglichen
veröffentlicht. Eine Änderung bei unveränderter Größe und Änderungszeit bleibt
bis zum Öffnen unentdeckt.

Speichern, Importieren und Löschen pflegen den Eintrag einmal je Speicher-Batch.
Ein Datei-Import bildet einen eigenen, ausdrücklich durchgereichten Batch
(`mitSpeicherSammelbatch` in
[gesetzSpeicherEreignisse.ts](../../src/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicherEreignisse.ts)):
Pflege, `gesetze-geaendert` und Markierungskonfliktprüfung laufen einmal am Ende;
parallele Speichervorgänge desselben Fensters schließen unabhängig davon ab.
Die Ableitung nutzt den geschriebenen XML-Text und seinen Dateistempel, ohne
andere Gesetze vollständig zu laden. Ohne vorhandene gültige Verzeichnisdatei
legt die Pflege keinen Teilbestand an. Pflegefehler ändern einen erfolgreichen
Gesetzesspeichervorgang nicht; das Verzeichnis wird soweit möglich entwertet.

Das Verzeichnis dient dem Aufzählen und Filtern. Eine fehlende Referenz allein
rechtfertigt keine Löschung oder Überschreibung. Sitzungswiederherstellung und
Importklassifizierung prüfen die betroffene Datei. Dauerhaft gespeicherte
Verweise beim Import benötigen einen abgeglichenen Stand. Dafür wird ein
vorgangsgebundener Referenzstand verwendet; die anschließende Verzeichnispflege
führt ihre Änderungen mit dem frisch gesperrt gelesenen Stand zusammen.

`gesetze-geaendert` und `gesetze-geloescht` veranlassen andere Fenster zum
Auffrischen. Eine leere Änderungsliste signalisiert nur Verzeichnisfortschritt;
sie entwertet keine geladenen Gesetzesdarstellungen.

## Zuständigkeiten

Typ, Suchnormen und Ableitung:
[Suchmodul](../../src/lib/domain/app/oeffnen/suchverzeichnis.ts).
Dateivertrag, Validierung, Sperren und Pflege:
[Gesetzpersistenz](../../src/lib/persistenz/gesetz/gesetz.index.ts), insbesondere
[Datei](../../src/lib/persistenz/gesetz/suchverzeichnis/suchverzeichnisDatei.ts),
[Validierung](../../src/lib/persistenz/gesetz/suchverzeichnis/suchverzeichnisValidierung.ts),
[Abgleich](../../src/lib/persistenz/gesetz/suchverzeichnis/suchverzeichnisAbgleich.ts) und
[Pflege](../../src/lib/persistenz/gesetz/suchverzeichnis/suchverzeichnisPflege.ts).
Anzeigevorbereitung und Meldungen:
[gesetz-laden](../../src/lib/gesetz-laden/suchverzeichnisVorbereitung.ts).
Die Startreihenfolge steht unter [App-Start](app-start.md).
