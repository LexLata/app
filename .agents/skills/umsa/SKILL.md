---
name: umsa
description: Einen abgestimmten, umfangreichen Umsetzungsplan mit schreibenden Subagenten ausführen.
disable-model-invocation: true
---

## Vorbereitung

Lege neben dem Plan eine Umsetzungsdatei `<planname>-umsetzung.md` an:

- Am Anfang steht der aktuelle Stand, darunter stehen die schon abgeschlossenen Phasen.
- Der Plan beschreibt das vereinbarte Soll, die Umsetzungsdatei den tatsächlichen Stand und Nachweise. Beschlossene Änderungen in die betroffenen Planabschnitte einarbeiten.

## Verantwortlichkeiten pro Phase

1. Delegation
   - Beauftrage einen Subagenten ohne Gesprächshistorie mit Planpfad und Phasenkennung. Er muss nach .agents/skills/umsu/SKILL.md arbeiten.
   - Sofern der Nutzer kein Modell vorgibt, verwende `gpt6.2-sol` low bzw. Opus low.
   - Insgesamt läuft höchstens ein Subagent gleichzeitig.
2. Während der Umsetzung nur dann an den Nutzer schreiben, wenn eine offene Frage vor den nächsten Phasen geklärt werden muss.
3. Prüfe anhand der Abnahmekriterien der Phase gezielt den fertigen Diff, betroffene Schnittstellen und Modulgrenzen einschließlich ihrer Importe. Lies zusätzlichen Code oder Protokolle nur, soweit konkrete Fragen oder Befunde dies erfordern.
4. Korrekturen
   - Erledige kleine, eindeutig mechanische Detailkorrekturen selbst.
   - Gib größere Korrekturen und fehlende Umsetzungsteile mit konkretem Befund und Abnahmekriterium an den zuständigen Subagenten zurück.
   - Wiederhole nach Korrekturen Punkt 3 (Prüfung).
5. Aktualisiere nach jeder Phase Stand, Entscheidungen, Abweichungen, Nachweise und offene Befunde in der Umsetzungsdatei; umfangreiche Protokolle verlinken.

## Abschluss

- Führe npm run vollpruefen aus.
- Prüfe nach der letzten Phase die Gesamtabnahmekriterien einschließlich des Zusammenspiels der Phasen.
- Halte Ergebnis, abschließenden Prüflauf und offene Abnahmekriterien in der Umsetzungsdatei fest.
- Bericht nur über Abweichungen vom Plan, eigene Entscheidungen, offene Befunde und Risiken sowie das Prüfergebnis.
