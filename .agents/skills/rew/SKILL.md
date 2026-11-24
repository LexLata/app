---
name: rew
description: Umsetzung eines Plans kritisch prüfen.
disable-model-invocation: true
---

Prüfe die zum Plan gehörenden Änderungen entlang zweier Prüfachsen. Lies auch die zugehörige Umsetzungsdatei, sofern vorhanden.
Arbeite kontextschonend nach [kon](../kon/SKILL.md). Für die Prüfung `gpt6.2-sol` medium bzw. Opus medium nutzen.

## Planumsetzung

- Verfolge Anforderungen bis in den tatsächlichen Aufrufpfad; prüfe auch Fehlerfälle und die Einhaltung der festgelegten Nicht-Ziele.
- Gleiche dokumentierte Entscheidungen, Abweichungen, Prüfergebnisse und offene Abnahmekriterien mit Code und Nachweisen ab.
- Prüfe, ob die Tests die zugesagten Eigenschaften einschließlich des Zusammenspiels der Phasen tatsächlich belegen.

## Qualität der Umsetzung

- Prüfe geänderte fachliche Bezeichnungen und ihre Verwendung im betroffenen Code gegen das Glossar.
- Prüfe den Architekturmaßstab aus AGENTS.md und bei Modulgestaltung zusätzlich [mod](../mod/SKILL.md).
- Benenne neu entstandene technische Schulden, unnötige Abstraktionen und vorübergehende Lösungen ohne geregelten Abschluss, auch wenn sie dem Plan entsprechen.

## Dokumentationspflege

Prüfe und aktualisiere die durch die geprüfte Umsetzung betroffenen Dokumentationsaussagen nach [doku](../doku/SKILL.md).
Weise den Nutzer darauf hin, falls das Glossar zu aktualisieren/erweitern ist.

## Bericht

Berichte konkrete Befunde beider Prüfachsen gemeinsam nach Bedeutung mit Fundstelle, Auswirkung und Empfehlung. Unterscheide Fehler, Planabweichungen, fehlende Nachweise und Verbesserungsvorschläge. Benenne Prüfgrenzen.

Schließe mit einem knappen Gesamturteil und den offenen Abnahmekriterien; sage ausdrücklich, wenn keine wesentlichen Befunde bestehen.
