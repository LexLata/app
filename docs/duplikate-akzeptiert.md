# Akzeptierte Code-Duplikate

Diese Datei dokumentiert Duplikate, die nach Prüfung bewusst bestehen bleiben.
Sie ist keine pauschale Freigabe aller Funde eines bestimmten jscpd-Laufs.
Ein Fund gilt nur dann als akzeptiert, wenn Dateien, benannte Code-Anker und
inhaltlicher Grund zu einem Eintrag passen.

Zeilennummern und jscpd-Indizes sind absichtlich nicht angegeben: Sie werden
schon durch unabhängige Änderungen instabil. Die Zuordnung erfolgt über
Dateipfade, Funktions- oder Komponentennamen und den beschriebenen gemeinsamen
Inhalt. Bei Zweifeln ist der Fund neu zu prüfen.

## Bewertungsmaßstab

- Produktionscode darf ähnlich aussehen, wenn die Stellen unterschiedliche
  fachliche Regeln oder Lebenszyklen abbilden und deshalb unabhängig geändert
  werden können.
- Die wiederholte Nutzung einer vorhandenen UI-Abstraktion ist kein zu
  behebendes Duplikat, nur weil die Aufrufstellen ähnliche Props oder Kinder
  enthalten.
- Tests werden nach DAMP beurteilt. Wiederholte Arrange-/Act-/Assert-Blöcke
  bleiben grundsätzlich lokal; gemeinsame Infrastruktur und
  Modellinvarianten können dagegen eine Abstraktion rechtfertigen.
- Ein akzeptierter Fall wird neu bewertet, sobald der unten genannte Auslöser
  eintritt oder die beschriebenen Verträge nicht mehr stimmen.

## Produktionscode

### K-TastenkuerzelLeisten

- Stellen: `Lesezeichen.tsx::LesezeichenItem` und
  `Favoritenleiste.tsx::Favoritenleiste`
- Gemeinsamer Inhalt: Darstellung von Tastenkürzel und Bezeichnung in den
  einzelnen Zeilen. Der gemeinsame Rahmen und die Spaltenaufteilung liegen
  in `Seitenleiste.tsx`.
- Grund: Die Zeilen unterscheiden sich durch gesetzesübergreifende Gruppenköpfe,
  Ziffern- gegenüber Buchstabenkürzeln, unterschiedliche Indexregeln und Navigation.
- Neu prüfen, wenn: Die Tastenkürzelmodelle fachlich vereinheitlicht werden
  oder eine dritte Leiste dasselbe Zeilenmodell benötigt.

### K-EinstellungenSelect-Aufrufstellen

- Stellen: die mehrfachen `EinstellungenSelect`-Aufrufe in
  `GesetzestextAbschnitt.tsx`
- Gemeinsamer Inhalt: Mapping typisierter Optionslisten auf native
  `<option>`-Elemente.
- Grund: Gestaltung und deaktivierter Zustand sind bereits in
  `EinstellungenSelect` zentralisiert. Die verbleibende Wiederholung zeigt
  die konkreten fachlichen Werte unmittelbar an der jeweiligen Einstellung.
- Neu prüfen, wenn: Optionen zusätzlich ein gemeinsames Verhalten oder
  gemeinsame Metadaten erhalten, die an mehreren Aufrufstellen synchron
  gepflegt werden müssen.

### K-SuchergebnisNavigation

- Stellen: `OeffnenOverlay.tsx::OeffnenOverlay` und
  `VolltextSucheOverlay.tsx::VolltextSucheOverlay`
- Gemeinsamer Inhalt: Eingabefokus, Auswahl zurücksetzen, markierten Treffer
  sichtbar scrollen und grundlegende Pfeiltastenbehandlung.
- Grund: Das Öffnen-Overlay ergänzt Importzustand,
  Modifikatortasten und Öffnen in einem neuen Tab. Ein gemeinsamer Hook müsste
  diese fachlichen Abweichungen als umfangreiche Konfiguration aufnehmen; die
  kurzen Effekte sind lokal verständlicher.
- Neu prüfen, wenn: eine dritte Suche dasselbe Navigationsmodell verwendet
  oder die Sonderfälle beider Suchen angeglichen werden.

### K-HintergrundListenerStrictMode

- Stellen: `useHintergrundAktualisierung.ts`, Effekte für `BANNER_EVENT` und
  `gesetze-geaendert`, sowie `useFensterSchliessenAbsichern.ts`
- Gemeinsamer Inhalt: asynchron registrierten Tauri-Listener unter React
  StrictMode sicher wieder abmelden.
- Grund: Die Listener reagieren auf verschiedene Ereignisse und führen
  unterschiedliche Aktionen aus. Das lokale `abgebrochen`-/`unlisten`-Muster
  hält den jeweiligen Lebenszyklus vollständig am Listener sichtbar; eine
  zentrale Abstraktion würde hier nur die unterschiedlichen Aktionen verstecken.
- Neu prüfen, wenn: weitere Stellen dasselbe vollständige asynchrone
  Listener-Muster benötigen oder eine zentrale Tauri-Listener-Abstraktion
  eingeführt wird.

### K-IconSvgRahmen

- Stellen: `SeitenleistenAktionen.tsx::ZuklappenIcon` und
  `SeitenleistenAktionen.tsx::AufklappenIcon`
- Gemeinsamer Inhalt: Attribute des SVG-Rahmens für zwei gegenläufige
  Pfeilspitzen-Icons.
- Grund: Die beiden kleinen, semantisch benannten Icons unterscheiden sich
  gerade durch ihre Pfadgeometrie. Ein Wrapper, der nur Pfadstrings
  entgegennimmt, würde die vollständige Icondefinition verteilen und keine
  eigenständige Darstellungsregel kapseln.
- Neu prüfen, wenn: weitere eigene Icons denselben Rahmen benötigen oder
  eine gemeinsame Icon-Komponente mit fachlich sinnvoller API entsteht.

### K-TabButtonHover

- Stellen: `Tableiste.fensterButtons.tsx`, Minimieren- und
  Maximieren-Schaltfläche
- Gemeinsamer Inhalt: Hintergrund- und Textfarbe bei `onMouseEnter` und
  `onMouseLeave` direkt am DOM-Element setzen.
- Grund: Die kurzen Handler halten das Verhalten unmittelbar an den beiden
  nativen Fensteraktionen sichtbar. Ein per Spread eingesetztes
  Handler-Objekt würde nur die DOM-Mutation verbergen; die abweichende rote
  Hover-Darstellung der Schließen-Schaltfläche verhindert zudem einen
  einheitlichen Vertrag für alle Fensterbuttons.
- Neu prüfen, wenn: die Fensterbuttons in einer gemeinsamen Komponente
  gebündelt werden oder ein einheitliches Hover-Modell erhalten.

## Testcode

### K-TestfallWiederholung

- Stellen: beliebige `*.test.ts`-Dateien mit wiederholten
  Arrange-/Act-/Assert-Blöcken
- Gemeinsamer Inhalt: ähnlicher Testaufbau mit unterschiedlichen Eingaben und
  Erwartungen.
- Grund: Die Testfälle sollen einzeln lesbar bleiben. Diese pauschale
  Akzeptanz gilt nicht für kopierte Infrastruktur-Fabriken oder
  fast-check-Arbitraries, die eine gemeinsame Modellinvariante ausdrücken.
- Neu prüfen, wenn: das Duplikat eine Fixture-/Mock-Fabrik, ein Arbitrary oder
  eine gemeinsame Protokollannahme enthält.

## Restcluster

Die Restcluster des Produktionslaufs vom 2026-09-18 sind inhaltlich
entschieden: gemeinsame Änderungsgründe wurden zusammengeführt, bewusst
verbleibende Fälle sind oben mit eigenem K-Eintrag dokumentiert. Es bestehen
keine ungeprüften Restcluster aus diesem Lauf mehr.

## Beobachtung

`npm run audit` schreibt getrennte Berichte nach `.reports/jscpd-prod.json`
und `.reports/jscpd-tests.json`. Ein Anstieg der Gesamtzahl ist nur ein
Hinweis. Eine erneute inhaltliche Prüfung ist besonders sinnvoll, wenn

- mehr als zehn neue Produktionsklone auftreten,
- der Produktionsanteil um mehr als 0,3 Prozentpunkte steigt oder
- neue Dateipaare beziehungsweise neue Funktionen betroffen sind.

Die technische Produktions-Baseline liegt in `scripts/automatisch/jscpd-baseline.json`.
Sie speichert keine instabilen Zeilennummern, sondern Fingerprints aus
Dateipaar, Format und normalisiertem Codefragment und ordnet jeden Treffer
einem K-Cluster dieser Datei zu. `scripts/automatisch/jscpd-baseline.mjs` meldet sowohl
neue beziehungsweise veränderte als auch verschwundene Fingerprints; Audit
und Pre-Commit-Hook rufen die Prüfung mit denselben Schwellen von zehn Zeilen
und 50 Tokens auf. Die Baseline ersetzt die ankerbasierte fachliche
Dokumentation oben nicht und darf nach einem Fund nicht ungeprüft erneuert
werden.
