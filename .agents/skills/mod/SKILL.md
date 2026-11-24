---
name: mod
description: Module und ihre öffentlichen Interfaces planen und prüfen.
disable-model-invocation: true
---

## Auftrag

- Planen: Verantwortungen, Modulgrenzen und Ordnerstruktur abstimmen.
- Prüfen
  - Wenn ich einen Plan nenne → diesen Plan prüfen und mit bestehendem Code abgleichen
  - Wenn ich ein bestehendes Modul nenne → dieses Modul prüfen (sowie Submodule falls zutreffend)
  - Priorisierte Befunde mit Fundstelle, Folge und Empfehlung berichten; sinnvolle bestehende Grenzen, offene Entscheidungen und Grenzen der Prüfung nennen.
- Interface-Entwürfe
  - Interfaceentwürfe nur erstellen, wenn sie wesentliche Entscheidungen zu Modulgrenzen oder öffentlichen Verträgen konkretisieren; sonst genügt die Beschreibung im Plan.
  - Interfaces als `[ordnername].index.entwurf.ts` in docs/plaene/ erstellen. Soweit möglich sollen die Entwürfe bei der Umsetzung übernommen werden können. Der Umsetzungsplan verweist auf sie.

## Maßstäbe

### Kriterien für gute Module

- Grundsatz: „small interface hiding significant complexity“
- Was soll ein Modul sein?
  - Zustände, Nebenwirkungen, notwendige Aufrufreihenfolgen sowie relevante Parallelitäts-, Abbruch- und Teilfehlerregeln haben einen klaren Verantwortlichen.
  - Eine `*.index.ts` ist eine bewusst entworfene Modulgrenze, keine bloße Sammeldatei vorhandener Exporte.
- Außengrenze
  - Modulgrenzen folgen einer gemeinsamen Verantwortung und dem verborgenen Wissen, nicht der bisherigen Ordnerstruktur.
  - Welche Aufruferlogik gehört ins Modul und welche fremde Verantwortung hat das Modul übernommen?
  - Ein Dateiformat hat genau einen Besitzer, der es liest und schreibt. Seine Bausteine gibt er nicht heraus.
- Interface
  - Das Interface enthält nur Operationen und Typen, die außerhalb des Moduls benötigt werden.
  - Kurze JSDoc-Kommentare erklären Zweck, Ergebnis, Nebenwirkungen und relevantes Fehlerverhalten aus Sicht der Aufrufer.
  - Benannte Typen, die Aufrufer zum Verwenden des Interfaces benötigen, sind über das Interface zugänglich.
  - Eingaben, Erfolgs- und Fehlerfälle sind eindeutig.
- Abhängigkeiten und Ladeverhalten: Statische und dynamische Importe respektieren dieselbe Modulgrenze. Große Fassaden ziehen nicht unbeabsichtigt unabhängige Bereiche in dieselbe Ladegrenze.

### Formale Regeln

- Alle Moduldateien liegen in einem gemeinsamen Modulordner. Der Ordner `<pfad>/<modul>/` besitzt genau ein Interface `<modul>.index.ts`.
- (Nur) Modulordner werden in `scripts/automatisch/modulgrenzen.cjs` eingetragen. Folge: Code außerhalb des Modulordners darf ausschließlich das Interface importieren.
- Submodule sind Module, die innerhalb eines Moduls liegen. Zugriffe von außerhalb des äußeren Moduls laufen über das Modul-Interface. Zugriffe aus dem äußeren Modul laufen direkt über das Submodul-Interface.
- Ein Interface reicht nichts durch: keine Umbenennung beim Export und keine Weitergabe von Namen aus Dateien außerhalb des eigenen Modulordners (Namen aus eigenen Submodulen sind erlaubt). Durchgesetzt über die ESLint-Regel interface-durchreichen.
- Ausnahmen von der Zugriffsregel vorab abstimmen und mit konkretem technischen Grund dokumentieren.
