---
name: pru
description: Einen vorhandenen Umsetzungsplan kritisch prüfen.
disable-model-invocation: true
---

Prüfe den benannten Plan anhand des aktuellen Projektbestands entlang zweier Prüfachsen.
Arbeite kontextschonend nach [kon](../kon/SKILL.md).

## Auftrag und Umsetzbarkeit

- Erfüllt der Ansatz Ziel und vereinbarten Umfang?
- Sind die Anforderungen aus [pmd](../pmd/SKILL.md) erfüllt? Insbesondere Abgrenzung und Bemessung der Phasen, Abnahmekriterien und TDD nach AGENTS.md?
- Ist der Plan widerspruchsfrei, und stimmen seine Aussagen zum Bestand mit dem Code überein?

## Qualität des Lösungswegs

- Stimmen die Begriffe und ihre Bedeutung im Plan und betroffenen Code mit dem Glossar überein?
- Erfüllt der Zielzustand den Architekturmaßstab aus AGENTS.md und bei Modulgestaltung zusätzlich [mod](../mod/SKILL.md)? Entstehen unnötige Komplexität oder technische Schulden?
- Entstehen Risiken für Sicherheit, Datenbestand, Migration, Parallelität oder unterstützte Plattformen?
- Steht der Aufwand der Änderungen und Nachweise in angemessenem Verhältnis zum erwarteten Gewinn? Gibt es einen einfacheren Weg? Vorschläge mit eingespartem Aufwand und dem dadurch verlorenen Nutzen nennen.

## Bericht

Berichte konkrete Befunde beider Prüfachsen gemeinsam, nach Schwere geordnet und mit `Datei:Zeile`.
Stets mit praktischer Folge, Eintrittswahrscheinlichkeit und einer klaren
Empfehlung erläutern; theoretische Restrisiken als solche kennzeichnen.

Schließe mit einem knappen Gesamturteil: umsetzungsreif, mit bestimmten
Korrekturen umsetzungsreif oder grundlegend zu überarbeiten. Wenn keine
wesentlichen Befunde bestehen, sage das ausdrücklich. Falls einschlägig,
benenne außerdem relevante Grenzen der Prüfung.
