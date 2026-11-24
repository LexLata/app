# App-Start und Fensterstart

Ein Hauptfenster lädt Gesetze bei Bedarf. Die Gesetzesdateien bleiben maßgeblich;
das [Suchverzeichnis](abgeleitete-daten.md) dient dem Öffnen-Overlay und den
Gesetzeslisten. Es ist keine Voraussetzung der Sitzungswiederherstellung.

## Ablauf je Hauptfenster

1. Gespeicherte Fenster- und Tabreferenzen lesen und die Existenz der Dateien
   prüfen. Nachweislich fehlende Gesetze werden nicht wiederhergestellt;
   unbekannte oder unlesbare bleiben als Tabs erhalten. Kein automatischer Import.
2. Tabs mit Gesetzesreferenz und Ladezustand anlegen, Geometrie anwenden und
   Fenster anzeigen. Die Tableiste braucht keine geladenen Darstellungen.
3. Aktiven Tab zuerst laden, danach die übrigen Tabs. Titelabgleich gehört zum
   Laden. Noch nicht geladene Tabs zeigen eine Ladeanzeige im Inhalt.
4. `main` stößt die weiteren Sitzungsfenster an, ohne deren Ladeabschluss
   abzuwarten. Jedes stellt seinen eigenen Zustand her.
5. Das Suchverzeichnis wird gelesen, sobald das Fenster sichtbar ist, sodass die
   gespeicherte Gesetzesliste sofort erscheint, ohne auf das Laden der Tabs zu warten.
   Übertragungen, angefordertes Wiederöffnen eines geschlossenen Tabs und Links
   beim App-Start berücksichtigen; danach die gemeinsamen Startaufgaben anmelden. Auch nach fehlgeschlagenem Startversuch dürfen diese
   Aufgaben beginnen; erfolgreich abgeschlossener Fensterstart ist ein eigener Zustand.
6. Nach erfolgreichem Fensterstart und bestätigtem Importindex-Abgleich die
   Importindizes verzögert im Fenster bereithalten. Erst danach Dateistempel
   vergleichen und zuletzt angezeigte Gesetze im Leerlauf vorladen.
7. Automatische Gesetzaktualisierung (Einstellung _Werkzeuge → Gesetze automatisch
   aktualisieren_): erste Prüfung 10 s nach erfolgreichem Fensterstart, sobald
   die Gesetzesliste vorliegt, danach stündlich. Fällig sind nur Gesetze, deren
   Verarbeitungszeit älter als das eingestellte Intervall ist; ein fensterübergreifend
   registrierter Vorgang verhindert parallele Läufe mehrerer Fenster.
8. Automatische Updateprüfung (Einstellung _Allgemein → Automatisch nach Updates
   suchen_, Vorgabe an) als letzter Schritt: erste Anfrage, wenn der Fensterstart
   abgeschlossen ist, alle gemeinsamen Startaufgaben abgeschlossen sind und der
   erste Durchlauf der automatischen Gesetzaktualisierung dieses Fensters beendet
   oder nicht fällig ist. Das Vorladen im Leerlauf wird nicht abgewartet. Danach
   fragt jedes Hauptfenster stündlich. Rust bestimmt die Fälligkeit je Prozess
   nach Wanduhr, sodass der Ruhezustand mitzählt. Nach der ersten Prüfung gilt
   eine Frist von 24 h ab Prüfbeginn, bei Fehlschlag von 1 h. Liegt die gespeicherte
   Fälligkeit mehr als 24 h in der Zukunft, gilt die Prüfung bei der nächsten
   Anfrage als fällig. Ein Fund erscheint als Update-Banner in allen
   Hauptfenstern; ohne Fund oder bei einem Fehler zeigt die App nichts an.

Ein neuer leerer Tab hat keine Gesetzesreferenz; ein ladender oder fehlerhafter
Tab ist nicht leer. Beim Übertragen werden XML-Stellen erst mit dem im Ziel
geladenen Gesetz in Darstellungsstellen übersetzt.

Der fensterlokale Bestand dedupliziert parallele Zugriffe auf dieselbe Referenz.
Gesetze offener Tabs werden nie wegen der Haltegrenze entladen. Vorläufig gelten
50 behaltene Gesetze ohne offenen Tab und 10 vorgeladene Gesetze; endgültige
Werte erfordern Desktopmessungen. Hilfsfenster behalten und vorladen nicht.
Mobile verwendet dieselbe Zugriffsschicht, aber keine Desktop-Sitzungssteuerung.

## Gemeinsame App-Start-Aufgaben

Nach der Fensterinitialisierung meldet sich jedes Hauptfenster an. Rust vergibt
an eines davon den Besitz und verwaltet ausschließlich den flüchtigen Fortschritt.
Die fachliche Arbeit bleibt im Frontend, in dieser Reihenfolge:

1. Mitgelieferte Importindizes mit den App-Daten abgleichen.
2. Suchverzeichnis anhand der vollständigen Dateistempelliste prüfen; nur bei
   nicht bestätigter Frische mit den Gesetzesdateien abgleichen.
3. Mitgelieferte nichtamtliche Titel für Einträge mit `hatNormenOhneTitel`
   ergänzen, ohne diese Gesetze dafür vollständig zu laden.
4. Markierungsprüfung über ihre unveränderten strengen Prüfpfade und deren
   eigene Abstimmung ausführen; offenen Vollprüfbedarf frisch prüfen.
5. Gesetzeskurzbefehle zuletzt bereinigen: nur bei frischem abgeglichenem
   Suchverzeichnis und zusätzlich einzeln bestätigter fehlender Datei.

Schließt das Besitzerfenster, erhält ein anderes angemeldetes Hauptfenster den
noch offenen Schritt. Ohne offenes Hauptfenster bleibt der Fortschritt im
laufenden Prozess erhalten; das nächste übernimmt. Ein veralteter Besitzer
kann keinen Schritt mehr bestätigen. Ein nicht bestätigter Schritt kann erneut
laufen; der Suchverzeichnisabgleich verwendet schon veröffentlichte Einträge.

## Fehler und Grenzen

Die Suchvorbereitung prüft zuerst den gespeicherten vollständigen Stand gegen
eine frische vollständige Dateistempelliste. Sind alle Einträge aktuell und
eindeutig, bleiben Datei und Abschluss unverändert; es gibt keinen Vollabgleich.
Auch eine unverändert nicht lesbare Datei gilt dann als geprüft: Nur sie wird je
Fenster einmal gezielt neu gelesen, damit ihr Befund gemeldet wird. Das gilt auch
nach einem Fenster- oder Programmneustart. Ein Fehler dieses Vergleichs führt in
den bestehenden Abgleich mit seinen Befunden.

Nur ein tatsächlich nötiger Abgleich setzt zunächst `abgeglichen: false` und
durchläuft alle Dateistempel. Unveränderte lesbare Einträge werden wiederverwendet,
auch aus bereits veröffentlichten Teilständen eines unterbrochenen Laufs. Der
Abgleich gibt den Hauptfaden nur nach einem Einlesen oder nach etwa 8 ms frei.
Eine während des Laufs geänderte Datei wird in höchstens drei Runden mit frischem
Dateistempel nachgelesen; bleibt sie geändert, bleibt `abgeglichen: false`.
Vollabgleiche eines Fensters laufen nacheinander, nie parallel; das Lesen des
abgeglichenen Suchverzeichnisses schließt sich einem laufenden Vollabgleich an.
Die Dauer protokolliert `console.info`. Währenddessen kann das Öffnen-Overlay
„Gesetzesliste wird vorbereitet“ anzeigen. Ausdrücklich angeforderte
Wiederholungen behalten den vollständigen Abgleich. Nach dem Ersetzen eines
Gesetzes im Datei-Import wird nur dessen Eintrag geprüft und bei Bedarf allein
seine Datei neu gelesen; Befunde anderer Dateien gehören nicht zum Import.

Fehlende oder ungültige Verzeichnisdateien werden neu aufgebaut. Ein unlesbarer
Ordner bestätigt keine Abwesenheit; Kurzbefehle werden deshalb nicht gelöscht.
Beschädigte Gesetze folgen den vorhandenen Sicherungs- und Reparaturwegen.
Ein fehlgeschlagener Titelabgleich lässt das Gesetz ohne diese Ergänzungen
nutzbar. Scheitert die Anmeldung der Bestandsereignisse, wird das Laden im
betroffenen Fenster gesperrt und ein erneutes Öffnen des Fensters empfohlen.
Fehler der gemeinsamen Aufgaben werden protokolliert; ein fehlgeschlagener
Schritt wird nicht als abgeschlossen bestätigt.

Die Volltextsuche gewinnt Suchtext schrittweise aus einzelnen Gesetzen und
zeigt Teilergebnisse; ihr Suchtext bleibt im Fenster. Ein persistenter
Volltextindex und paralleles Parsen sind nicht implementiert. Desktopmessungen
für Startzeit, Speicher und Hauptfadenblockade sowie manuelle Betriebssystemtests
für Links stehen noch aus.

## Einstiegspunkte

- [Fensterinitialisierung](../../src/hooks/useFensterstartInitialisierung.ts),
  [Sitzungswiederherstellung](../../src/hooks/fenster/useFensterRestore.ts)
- [Gemeinsame Aufgaben](../../src/hooks/app-start/startaufgaben.ts),
  [Besitz und Fortschritt](../../src-tauri/src/commands/startaufgaben.rs)
- [Importindizes bereithalten](../../src/hooks/useImportindizesBereithalten.ts),
  [Vorladen](../../src/hooks/useFensterVorladen.ts)
- [Fensterbestand](../../src/lib/gesetz-laden/geladeneGesetze.ts),
  [Titelabgleich](../../src/lib/gesetz-laden/gesetzTitelabgleich.ts),
  [Kurzbefehlbereinigung](../../src/lib/gesetz-laden/gesetzeskurzbefehlStartAbgleich.ts)
- [Automatische Gesetzaktualisierung](../../src/hooks/useHintergrundAktualisierung.ts),
  [Automatische Updateprüfung](../../src/hooks/useAutomatischeUpdatepruefung.ts),
  [App-Update-Zustand und Fälligkeit](../../src-tauri/src/commands/app_update.rs)
