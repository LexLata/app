# Glossar: Laden und Tabs

Ergänzt `docs/GLOSSAR.md` (Suchverzeichnis, abgeleitete Daten, Sitzungswiederherstellung).

- App-Start = das Programm wird gestartet
- Fensterstart = ein Hauptfenster initialisiert sich, App-Start oder später
- Laden bei Bedarf = Modell, in dem ein Hauptfenster ein Gesetz erst lädt, wenn ein Tab oder eine Funktion es braucht
- Laden = Gesetz aus seiner Datei in die Darstellungsdaten im Arbeitsspeicher eines Hauptfensters bringen. Abgrenzung: Einlesen für das Suchverzeichnis (Darstellungsdaten werden nicht behalten); Import
- Vorladen = Laden im Hintergrund auf Vorrat, bevor ein Gesetz gebraucht wird (zuletzt angezeigte Gesetze)
- Haltegrenze = höchste Zahl geladener Gesetze ohne offenen Tab, die ein Hauptfenster behält
- Suchverzeichnisabgleich = anhand des Dateistempels (Größe und Änderungsdatum) prüfen, welche Dateien sich im Gesetzesordner verändert haben
- Titelabgleich = die mitgelieferte nichtamtlicheTitelXML eines Gesetzes in die App-Daten übernehmen, falls dort keine liegt, und ihre Titel anwenden

## Tabs

- Tab-Bereithaltung = Die Gesetzestextansicht eines nicht aktiven Tabs bleibt aufgebaut im Speicher, sodass der Wechsel ohne Neuaufbau erfolgt.
- Bereithaltungskosten = Geschätzter Speicherbedarf der bereitgehaltenen Gesetzestextansicht eines Tabs. Abgrenzung: nicht die Gesetzesdaten im Fensterbestand.
- Tab-Bereithaltungsbudget = festes Budget der Bereithaltungskosten aller bereitgehaltenen Ansichten je Hauptfenster; die aktive Ansicht zählt nicht mit, die Bereithaltungsgarantie kann es überschreiten
- Bereithaltungsgarantie = Die Ansicht des zuletzt verlassenen, weiterhin offenen Tabs bleibt auch bei Überschreitung des Budgets bereit
- Verlauf-Bereithaltung = Die Ansicht eines Gesetzes, das im Tab verlassen wurde, bleibt aufgebaut, sodass der Rücksprung im Verlauf ohne Neuaufbau erfolgt
