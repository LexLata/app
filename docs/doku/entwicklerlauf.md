# Quelldateien, GesetzesXML und Präfixstrukturen erzeugen

Diese Anleitung beschreibt die Befehle, ihre Dateien und den Umgang mit der PräfixstrukturXML.

## Befehl wählen

| Befehl                                             | Was passiert?                                                                                             | Normgeber                | Netz                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------- |
| `npm run quelldateien -- NORMGEBER ANZAHL`         | Fehlende Quelldateien laden und daraus GesetzesXML erzeugen.                                              | `de-bund`, `de-bw`, `eu` | Für fehlende Quellen |
| `npm run gesetzesxml -- NORMGEBER ANZAHL`          | Fehlendes GesetzesXML aus vorhandenen Quelldateien erzeugen.                                              | `de-bund`, `de-bw`, `eu` | Nein                 |
| `npm run praefixstrukturen -- NORMGEBER ANZAHL`    | Quellen wiederverwenden oder laden, GesetzesXML neu erzeugen und fehlende Präfixstrukturbefunde ergänzen. | `de-bund`, `de-bw`       | Für fehlende Quellen |
| `npm run praefixstrukturen -- NORMGEBER --offline` | Vorhandenes GesetzesXML neu auswerten und Präfixstrukturbefunde ersetzen.                                 | `de-bund`, `de-bw`       | Nein                 |
| `npm run praefixdiagnose`                          | Gespeichertes GesetzesXML anhand der Präfixlisten untersuchen und Diagnoseberichte schreiben.             | `de-bund`, `de-bw`       | Nein                 |
| `npm run grundbestand -- PFAD`                     | Gesetze einer Grundbestandsliste beschaffen, erzeugen und importierbar in einem Ordner sammeln.           | `de-bund`, `de-bw`, `eu` | Für fehlende Quellen |

Präfixlauf = Lauf der Entwicklungs-App, der für `quelldateien`, `gesetzesxml` und `praefixstrukturen` Gesetze beschafft, umwandelt und auswertet. Er ist nur im Entwicklungsbau enthalten, nicht im ausgelieferten Programm ([Modulstruktur](modulstruktur.md#entwicklerlauf-nur-im-entwicklungsbau), geprüft durch [entwicklerlauf-nur-entwicklungsbau.test.ts](../../scripts/automatisch/entwicklerlauf-nur-entwicklungsbau.test.ts)).

`quelldateien` und `gesetzesxml` verändern die PräfixstrukturXML nicht. Für EU gibt es keine Präfixauswertung. EU-Quelldateien werden unabhängig von den App-Einstellungen in konsolidierter Fassung mit Erwägungsgründen aus dem Originaltext beschafft; fehlt eine konsolidierte Fassung, wird der Originaltext verwendet.

## Auswahl und Wiederholung

- `NORMGEBER` und `ANZAHL` sind Platzhalter. Die Anzahl begrenzt erfolgreiche Ergebnisse. Bei `quelldateien` und `gesetzesxml` ist auch `alle` möglich; `--offline` erlaubt keine Anzahl.
- `--kurztitel GG,EGBGB` wählt statt einer Anzahl einzelne Gesetze aus; Groß-/Kleinschreibung ist gleichgültig. Bei `quelldateien` werden nur benannte Gesetze ohne vorhandene Quelle geladen; `--neu` erzwingt den Neuabruf. Bei `gesetzesxml` erzwingt die Auswahl die Neuerzeugung. Mit `--offline` beschränkt es die neue Auswertung.
- `gesetzesxml` überspringt vorhandenes GesetzesXML; `--neu` erzeugt es aus vorhandenen Quellen neu. Fehlende Quellen werden gemeldet und nicht geladen.
- Der normale Präfixlauf überspringt gespeicherte Struktur-, Leer- und Fehlerbefunde. `gescheitert ANZAHL` versucht höchstens diese Anzahl gespeicherter Fehlschläge erneut und lädt auch vorhandene Quellen neu.
- Die Offline-Auswertung ersetzt auch Leer- und Fehlerbefunde und ergänzt fehlende Listeneinträge. Einträge ohne GesetzesXML oder mit nicht auswertbarer Datei bleiben unverändert; Auslassungen stehen im Bericht.

```sh
npm run quelldateien -- de-bund 10
npm run quelldateien -- eu --kurztitel DSGVO
npm run gesetzesxml -- de-bw alle --neu
npm run praefixstrukturen -- de-bund --kurztitel GG,EGBGB
npm run praefixstrukturen -- de-bw gescheitert 10
npm run praefixstrukturen -- de-bund --offline
```

Nach Änderungen an Konvertierung oder Nachbereitung zuerst `gesetzesxml -- NORMGEBER alle --neu` ausführen, danach für Bund und BW `praefixstrukturen -- NORMGEBER --offline`.

## Dateien und Terminalausgabe

Die Arbeitsdateien liegen im Repository unter `arbeitsdaten/` und sind gitignoriert. Sonderzeichen in Kurztitel-Dateinamen sind kodiert.

| Datei                                                            | Ablage unter `arbeitsdaten/`                                                               |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Bund-Quelldatei, entpacktes XML                                  | `quelldateien/de-bund/<kurztitel>.xml`                                                     |
| BW-Quelldatei, unverändertes Gesamtausgabe-HTML                  | `quelldateien/de-bw/<kurztitel>.html`                                                      |
| EU-Quelldateien, unveränderte Formex-Archive                     | `quelldateien/eu/konsolidiert/<kurztitel>.zip`, `quelldateien/eu/original/<kurztitel>.zip` |
| EU-Herkunftsangabe zur Zuordnung und Vollständigkeit der Quellen | `quelldateien/eu/herkunft/<kurztitel>.json`                                                |
| Nachbereitetes GesetzesXML                                       | `gesetzesxml/<normgeber>/<kurztitel>.xml`                                                  |
| Fehler- und Diagnoseberichte                                     | `berichte/`                                                                                |

EU-Archive benötigen die zugehörige Herkunftsangabe für die Offline-Erzeugung. Fehlt die notwendige Originalergänzung, können Quelle und GesetzesXML als Teilerfolg vorliegen; zum erneuten Abruf `--kurztitel … --neu` verwenden.

`quelldateien`, `gesetzesxml` und `praefixstrukturen` zeigen im Terminal kompakt Status und Ergebnisse. Ausführliche Meldungen schaltet `--debug` zu, zum Beispiel:

```sh
npm run quelldateien -- de-bund 10 --debug
```

Abgeschlossene Läufe schreiben Fehlerberichte mit Erfolgen, Teilerfolgen, Fehlschlägen und Auslassungen. Bei Abbruch mit Strg+C kann der Bericht fehlen; bereits bestätigte Schreibungen bleiben erhalten.

Die normale Entwicklungs-App vorher schließen (Port 1420). Die Beschaffungs- und Präfixläufe starten im Entwicklungs-Build ohne Hauptoberfläche und beenden sich selbst. Installierte Gesetze bleiben unverändert; der Importindexabgleich kann AppData-Indizes aktualisieren. `praefixdiagnose` benötigt keinen Appstart.

Gesetzfehler erlauben die Fortsetzung; Infrastruktur- und Dateifehler brechen den Lauf ab. Scheitert ein Abruf, bleiben bisherige Dateien erhalten. Scheitert die Verarbeitung, kann bisheriges GesetzesXML gelöscht werden; die Quelldatei bleibt für einen erneuten Versuch erhalten. Löschungen werden im Bericht genannt.

## Grundbestand erzeugen

```sh
npm run grundbestand -- docs/doku/testdaten/wichtigste-gesetze.xml
npm run grundbestand -- PFAD --neu --debug
```

- `PFAD` ist eine Liste im Format [grundbestand](xml-formate/indizes-und-titel.md), absolut oder relativ zum aktuellen Verzeichnis. Vor dem Appstart wird sie gelesen und mit Importindex (`de-bund`, `de-bw`) bzw. kuratierter Europaliste (`eu`) abgeglichen; fehlt die Datei, ist sie ungültig oder enthält sie unbekannte oder mehrdeutige Kurztitel, bricht der Aufruf mit Meldung ab.
- Danach startet das Skript für `de-bund`, `de-bw` und `eu` nacheinander den Lauf `quelldateien -- NORMGEBER --kurztitel …` mit den Kurztiteln der Liste in der Schreibweise des Importindex (ein Appstart je Normgeber; Normgeber ohne Einträge entfallen). `--neu` und `--debug` gehen an jeden Lauf; ohne `--neu` werden vorhandene Quellen nicht neu geladen.
- Anschließend leert das Skript `arbeitsdaten/grundbestand/` (Verknüpfungen darin werden entfernt, ihr Ziel bleibt unberührt; ist der Ordner selbst eine Verknüpfung, bricht es ab) und kopiert je Kurztitel `arbeitsdaten/gesetzesxml/<normgeber>/<Dateiname>.xml` nach `arbeitsdaten/grundbestand/<Dateiname>_<normgeber>.xml`. Den Dateinamen übernimmt es aus dem vorhandenen Bestand (Groß-/Kleinschreibung gleichgültig), z. B. `PassG%2FPAuswG_de-bw.xml`.
- Jeder Lauf berichtet wie bisher. Gesetze, die der Bericht des Laufs unter `arbeitsdaten/berichte/` als fehlgeschlagen nennt, kopiert das Skript nicht, auch wenn noch ein älteres GesetzesXML vorliegt (etwa bei `--neu` nach gescheitertem Abruf).
- Am Ende nennt das Skript je Normgeber die Zahl der kopierten, gescheiterten und ohne Datei gebliebenen Gesetze, einzeln deren Kurztitel und einen Hinweis zum erneuten Abruf (`npm run quelldateien -- NORMGEBER --kurztitel … --neu`, bei vorhandener Quelldatei `npm run gesetzesxml -- NORMGEBER --kurztitel …`). Einzelne Gesetzfehler beenden den Ablauf nicht; eine ungültige Liste, ein Lauf mit Fehlercode (Infrastrukturfehler) oder ein Lauf ohne Bericht beendet ihn mit Fehlercode.
- Import in die App: „Dateien importieren“ wählen und alle Dateien aus `arbeitsdaten/grundbestand/` auswählen.

## PräfixstrukturXML lesen und aktualisieren

Die Listen liegen unter `src-tauri/resources/praefixstrukturen/de-bund.xml` und `de-bw.xml`. Sie sind die Fortschrittsquelle des normalen Präfixlaufs; Quelldateien und GesetzesXML allein gelten nicht als gespeicherter Befund. Neue Listen stehen in der App nach Neustart/Build zur Verfügung.

Ein `<gesetz>` enthält den Kurztitel und entweder einen Strukturbefund oder einen Ermittlungsstatus. Die Attribute bedeuten:

| Attribut an `<gesetz>` in der PräfixstrukturXML | Gespeicherter Befund / Bedeutung                                                                                                                                                                                                                    | Wirkung in Importvorschau und Suche                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `praefixstruktur`                               | Bei erfolgreicher Strukturbestimmung; `paragraph` wird durch Weglassen gespeichert. Weitere Werte: `artikel`, `gliederungsartikel`, `artikel-und-paragraphen`, `regel`, `nummer`, `roemisch`, `arabisch`, `alphabetisch`, `ohne-praefix`, `unklar`. | Importvorschau: Art. bei Artikeln/Gliederungsartikeln, Regel bei `regel`, Nr. bei `nummer`; `ohne-praefix` bietet nur das Gesetz ohne Normvorschau an. Gliederungsartikel erlauben getrennte Artikel-/§-Angaben. Sonst gilt der §-Standard. |
| `diagnosegrund`                                 | Bei `unklar`: automatisch festgestellter Befund, keine gesicherte Aussage über die Ursache in der Quelle.                                                                                                                                           | Keine eigene Wirkung.                                                                                                                                                                                                                       |
| `ermittlungsstatus`                             | `gescheitert`: fehlgeschlagener Versuch. `leer`: erfolgreich gelesenes, vollständig elementloses Darstellungsmodell; keine Aussage über den Inhalt der amtlichen Veröffentlichung. Beide stehen ohne Präfixstruktur.                                | Statusbefunde ergänzen das Importangebot nicht um eine vermeintliche Paragraphenstruktur.                                                                                                                                                   |
| `fehlerart`                                     | Nur mit `gescheitert`: `identifikation`, `tablink-zeitueberschreitung`, `keine-normen` oder `gesetz-laden`.                                                                                                                                         | Keine eigene Wirkung.                                                                                                                                                                                                                       |

`version="1"`, `normgeber` und `verarbeitungszeit` sichern Format, Zuordnung und Speicherzeitpunkt; sie steuern keine Trefferanzeige. Formatregeln und Beispiel: [PräfixstrukturXML](xml-formate/indizes-und-titel.md#präfixstrukturxml).

Nach dem Import wird die Präfixstruktur aus dem Darstellungsmodell bestimmt. Bei `ohne-praefix` bleibt das Gesetz auch mit Zahleneingabe als Ganzes erreichbar; bei Regel/Nr führen Zahlen über vorhandene Normbezeichnungen zur XML-ID. Die allgemeine Such-, Verweis- und Zitiergrammatik wird nicht erweitert. Die fachliche Bestimmung liegt in [der Präfixstrukturerkennung](../../src/lib/domain/praefixstruktur.ts).
