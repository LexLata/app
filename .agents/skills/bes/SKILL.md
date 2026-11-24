---
name: bes
description: Den aktuellen Projektbestand auf Architektur, technische Schulden und veraltete Dokumentation prüfen.
disable-model-invocation: true
---

Prüfe den gesamten Projektbestand anhand aller folgenden Prüfpunkte.
Setze für jeden Prüfpunkt einen Subagenten ein. Arbeite kontextschonend nach [kon](../kon/SKILL.md). Für die Prüfung `gpt6.2-sol` medium bzw. Opus medium verwenden.

## Prüfpunkte

1. Architektur: Maßstab aus AGENTS.md. Prüfe insbesondere:
   - ob Dateistruktur und Dateinamen klar sind
   - je Interface: ob das Modul gemäß [mod](../mod/SKILL.md) eine klare Verantwortung, zusammenhängende Operationen, verständliche öffentliche Typen und Verträge hat
   - Konkrete Auffälligkeiten gezielt vertiefen; dafür nur die erforderlichen Aufrufer oder Implementierungsstellen lesen. Umfangreiche Vertiefungen als Folgeprüfung empfehlen.
2. Führe npm run vollpruefen aus. Prüfe Regelunterdrückungen, Ausschlüsse und Baselines bei ESLint, TypeScript, Rust/Clippy, Knip, Dependency-Cruiser und der Duplikatprüfung. Beurteile Reichweite, hinterlegten Grund und heutigen Bedarf; kennzeichne den belegten Genehmigungsstatus.
3. Dateigröße: Erfasse handgeschriebene Code-Dateien mit mehr als 500 Zeilen. Prüfe anhand ihrer Gliederung und Verantwortlichkeiten, ob eine Aufteilung Verständlichkeit oder Änderbarkeit verbessert. Berücksichtige Produktionscode und Tests getrennt. Berichte begründete Aufteilungsvorschläge mit vorgeschlagener Trennlinie und Nutzen.
4. Prüfe und aktualisiere `docs/ARCHITEKTUR.md` und `docs/doku/` nach [doku](../doku/SKILL.md).

## Abschluss

Berichte priorisierte Befunde mit Fundstelle, praktischer Folge und Empfehlung.
Kennzeichne nachweislich genehmigte Ausnahmen, ungeklärten Genehmigungsstatus und
Vorschläge für neue Regeln getrennt. Benenne untersuchte Bereiche und Prüfgrenzen;
sage ausdrücklich, wenn keine wesentlichen Befunde bestehen.
