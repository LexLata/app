---
name: pmd
description: Umsetzungsplan in `docs/plaene` schreiben.
disable-model-invocation: true
---

Falls noch Nutzerentscheidungen offen sind, die Ziel, Umfang oder Lösungsweg wesentlich verändern, kläre diese vorab.

Erstelle für die besprochenen Änderungen einen Umsetzungsplan unter `docs/plaene/JJJJ-MM-TT-kurzbeschreibung.md` (Datum per `date +%F`).

Die Umsetzung erfolgt Phase für Phase. Der Umsetzungsagent liest nur den Überblick, die beauftragte Phase und die darin ausdrücklich einbezogenen Grundlagen. Diese müssen zusammen als Auftrag ausreichen. Relevante Dateien werden verlinkt.
Jeder Planabschnitt, einschließlich jeder Phase, beginnt mit einer Überschrift erster Ebene (#).

Planabschnitte:

# Überblick

Der Überblick enthält nur die für alle Phasen nötigen Informationen in knapper Form.

- Ziel mit knapper Begründung, gewünschtem Verhalten und Nicht-Zielen.
- Grundentscheidungen, insbesondere wesentliche Verantwortlichkeiten, gemeinsame Daten- und Fehlerverträge sowie neue Zustandsquellen mit Begründung.
- Nur soweit entscheidungsrelevant: Voraussetzungen, Annahmen, verbleibende Risiken und bewusst verbleibende technische Schulden.
- Knappe Phasenübersicht

# Gemeinsame Grundlagen – bei Bedarf

Informationen, die mehrere, aber nicht alle Phasen benötigen, stehen bei hinreichendem Umfang einmal als eigen benannter Planabschnitt. Die betroffenen Phasen verweisen darauf.

# Phase n: ...

Zuschnitt der Phasen:

- Klar abgegrenzte Phasen mit eigenständig prüfbarem Ergebnis und erfolgreichem `npm run pruefen` am Phasenende.
- Schneide Phasen so, dass ein Umsetzungsagent sie einschließlich Codelektüre, Tests, Integration und nötiger Korrekturen in einem Arbeitsdurchgang abschließen kann. Umfangreiche Einarbeitung und mehrere weitgehend unabhängige Teilaufgaben sprechen für eine weitere Aufteilung.
- Möglichst Tracer Bullets: schmale, durchgängige Funktionsabschnitte durch die beteiligten Schichten. Strukturänderungen dürfen anders geschnitten sein.

Jede Phase enthält:

- Die umzusetzenden Änderungen
- Maßgebliche Bestandsbefunde mit Fundstellen und betroffene Dateien einschließlich Aufrufern.
- Bei umfangreichen Strukturänderungen Ziel-Dateibaum; einzelne Testdateien nicht aufführen.
- Abnahmekriterien (mit eindeutiger Kennung wie `P2-A1`): konkrete nachweisbare Eigenschaften, Prüfweg und nötige Verhaltenstests einschließlich wesentlicher Grenz- und Fehlerfälle. Verlange nur Prüfungen, die in der Umgebung möglich sind.

# Gesamtabnahme

Verweise auf die Phasenabnahmekriterien (anhand der Kennung) und benenne zusätzliche Prüfungen des Zusammenspiels.

# Nutzerabnahme – nur bei Bedarf

Nenne knapp die wesentlichen Eigenschaften, die nur visuell, in der laufenden App oder auf einem bestimmten Betriebssystem beurteilt werden können, mit Prüfhandlung und erwartetem Ergebnis.
