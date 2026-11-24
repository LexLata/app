---
name: kon
description: Den Kontext des Hauptagenten weitestmöglich entlasten.
disable-model-invocation: true
---

## Arbeit verteilen

- Der Hauptagent hält Überblick, Nutzerkommunikation und gezielte Ergebniskontrolle. Exploration und Umsetzung grundsätzlich delegieren. Begrenzte Aufgaben selbst erledigen, wenn sie wenig zusätzliche Kontextaufnahme erfordern und die Delegation mehr Aufwand als Entlastung erzeugen würde.
- Während einer Umsetzung höchstens ein Subagent gleichzeitig.
- Subagenten ohne übernommene Gesprächshistorie starten. Grundsätzlich `gpt-6.2-sol` low bzw. Opus low verwenden; für einfachere oder schwierigere Aufgaben nach Ermessen.

## Auftrag und Übergabe

- Auftrag: Gib alle für den Teilauftrag nötigen Nutzerentscheidungen, Quellen und Abnahmekriterien mit.
- Während der Subagent arbeitet keine Statusupdates für den Nutzer.
- Der Hauptagent prüft die Übergabe gezielt gegen Abnahmekriterien sowie an betroffenen Schnittstellen und Risikostellen; bei konkreten Befunden oder unzureichenden Nachweisen vertieft er die Prüfung.
