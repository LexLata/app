# Entscheidung: Adressierungsformat eingefroren

Diese Datei hält den eingefrorenen Adressierungsvertrag, seine zentralen Gründe
und die Grenzen künftiger Änderungen fest.

## Entscheidung

Ab Release sind die Ableitung der XML-ID, die gespeicherten Normbezeichnungen
und das öffentliche `lexlata://`-Pfadformat eingefroren. Eine Änderung ihrer
Bedeutung betrifft gemeinsam die Dateien und bereits verteilten Links.

| Bestandteil                                              | Maßgeblicher Einstiegspunkt                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ableitung der XML-ID und Kollisionssuffixe               | `berechneId` und `IdVergabe` in [bezeichnungZuId.ts](../../src/lib/domain/norm/bezeichnungZuId.ts)                                                                                                                                                                                           |
| Umrechnung und Vergleich der Normbezeichnungen           | `verweisZuXmlId` in [verweisAufloesung.ts](../../src/lib/domain/norm/verweisAufloesung.ts), `vergleicheBezeichnung` in [bezeichnungVergleich.ts](../../src/lib/domain/norm/bezeichnungVergleich.ts) und `xmlIdZuBezeichnung` in [normKurzform.ts](../../src/lib/domain/norm/normKurzform.ts) |
| Gespeicherte Normbezeichnungen, gemäß voller Bezeichnung | [XML-Referenz](xml-formate/markierungen.md#bezeichnungen) und [Nutzerdatenformate](xml-formate/nutzerdaten.md)                                                                                                                                                                               |
| Öffentliche Gesetzes-, Norm- und Öffnen-Links            | [tiefenLink.ts](../../src/lib/domain/app/tiefenLink.ts)                                                                                                                                                                                                                                      |

Gesetzesreferenzen bestehen aus Normgeber und Kurztitel. Normen werden über
ihre Bezeichnung adressiert, Überschriften über ihre Gliederungskennzahl.
Normbezeichnungen werden vollständig einschließlich ihres Präfixes gespeichert,
beispielsweise „§ 433“. Ein separates Präfixattribut wird nicht verwendet.
XML-ID-Ableitung und öffentliches Pfadformat bleiben erhalten.
Deren Speicherung im MarkierungsXML und MarkierungskonflikteXML beschreibt die
[XML-Referenz](xml-formate/markierungen.md#bezeichnungen).

## Öffentliche Gesetzes- und Normlinks

`lexlata://<Normgeber>/<Kurztitel>/<Norm>` adressiert eine Norm, ohne Normsegment
das Gesetz. Beispiele: `lexlata://de-bund/bgb/433` und
`lexlata://de-bund/egbgb/249/3`. Neue Links schreiben jedes Segment klein und
kodieren es einzeln; auch eigene gültige Normgeber-Codes bleiben im Link erhalten.
Query und Fragment sind ungültig, einschließlich `?keinFallback`.
Es gibt keinen dejure-Fallback und keine öffentlichen Überschriftenlinks.

## Öffentlicher Öffnen-Link (additiv)

`lexlata://oeffnen/<Suchtext>` nutzt auf Desktop die Auflösung des Öffnen-Overlays ohne aktives
Gesetz und öffnet den ersten Treffer, nötigenfalls nach automatischem Import.
Beispiel: `lexlata://oeffnen/433%20BGB`. `oeffnen` ist als erstes Segment unabhängig
von Groß-/Kleinschreibung reserviert und bezeichnet dort keinen Normgeber.
Bestehende Gesetzes-/Normlinks und XML-Formate behalten ihre Bedeutung.

Der Suchtext ist genau ein percent-kodiertes Pfadsegment, wird einmal dekodiert
und behält seine Schreibung. Fehlender oder leerer Text, fehlerhafte Kodierung,
zusätzliche unkodierte Segmente, Query und Fragment sind ungültig.
Ohne Treffer oder bei Importfehler bleibt das vorbelegte Öffnen-Overlay mit Meldung;
eine Ersatzwebsite wird nicht geöffnet. Die Bedienung von Öffnen-Links auf Mobile ist nicht vorgesehen.

## Konkrete Ziele, Sofortimport und Verlauf

Konkrete Normziele werden nach dem gemeinsamen eindeutigen Zuordnungsmaßstab
in [verweisAufloesung.ts](../../src/lib/domain/norm/verweisAufloesung.ts)
aufgelöst; volle Bezeichnung und Artikelkontext müssen passen. Ohne Präfix
ist nur ein exakter, eindeutiger Treffer zulässig. Fehlende oder mehrdeutige
Ziele öffnen keine Ersatznorm. XML-ID-Ziele werden exakt geprüft,
Überschriften anhand ihrer Gliederungskennzahl. Tolerante Auflösung bleibt dem
Öffnen-Overlay vorbehalten. Gespeicherte Favoriten und Aktivierungen bleiben
auch bei fehlendem Ziel erhalten.

Die [Öffnungssteuerung](../../src/hooks/tabs/useGesetzOeffnen.ts) bündelt auf
Desktop den Sofortimport für öffentliche Gesetzes-/Normlinks, getaggte Verweise,
Verweismarkierungen, Lesezeichen, Verlauf und ausdrücklich wieder geöffnete Tabs.
Ein fehlendes verfügbares Gesetz wird ohne zweite Bestätigung importiert.
Automatische Fensterwiederherstellung, interne Konfliktnavigation und Mobile
lösen dadurch keinen Import aus; die Verweisbearbeitung behält ihre Rückfrage.
Interne Konfliktklicks übergeben eine vollständige Gesetzesreferenz mit Norm-
oder Überschriftziel, keinen öffentlichen Link.

Alle sofortigen Öffnungen (Verweisklick, Öffnen-Overlay, Lesezeichen, interne
Navigation und Links, Wiederöffnen mit ⇧⌘T) folgen einem Ablauf: Erst wird
geladen bzw. importiert; erst bei Erfolg wird der Tab gewählt oder gefüllt,
gesprungen und der Verlauf fortgeschrieben. Bis dahin bleiben Ausgangstab, Fokus
und Ansicht erhalten; ohne Tab bleibt die Willkommensansicht. Ein Fehler zeigt
nur ein Banner, ändert keine Tabs und erzeugt keine Fehlerseite. Fehlende oder
mehrdeutige Normen ergeben keinen erfolgreichen Verlaufseintrag.

- Eine neuere Öffnung gewinnt; die ältere wird fertig importiert, aber nicht
  angezeigt. Ein Tabwechsel bricht nicht ab. Wiederholte Klicks auf dasselbe
  laufende Ziel werden ignoriert.
- Wird der Ausgangstab geschlossen oder in ein anderes Fenster gezogen, öffnet
  „im selben Tab“ nichts mehr und das Fehlerbanner verschwindet; „in neuem Tab“
  öffnet weiterhin im ursprünglichen Fenster.
- War der Ausgangstab beim Start leer und ist er bis zum Abschluss belegt,
  öffnet „im selben Tab“ einen neuen Tab.
- Interne Navigation: Ein fehlendes Gesetz gilt als erledigt, ein nicht
  lesbares bleibt offen.
- Ausnahme Wiederherstellung beim Fensterstart: Sie wird nicht von neueren
  Öffnungen verworfen; ihre Tabs erscheinen immer, ein Link zusätzlich.

Die Ladezustände „fehlt“ und „nicht lesbar“ mit Fehlerseite gibt es nur noch
für die Wiederherstellung beim Start und die Fensterübernahme. Verlauf und geschlossene Tabs
speichern Gesetzesreferenzen; Zurück/Vorwärts erzeugt durch einen Import keinen
neuen Verlaufseintrag. Zuständig ist die
[Tabverwaltung](../../src/hooks/tabs/useAppTabs.ts); Lade- und Importfehler:
[Schutz vor Datenverlust](schutz-vor-datenverlust.md#beschädigte-gesetzes--und-titeldateien).

## Gründe für die Entscheidung

- **Die XML-ID bietet keine unabhängige Stabilität.** Sie wird beim Import
  ebenfalls aus der Bezeichnung berechnet. Kollisionssuffixe hängen zusätzlich
  von der Importreihenfolge ab. Ein Wechsel von Bezeichnungen auf diese XML-ID
  würde die Abhängigkeit nur verlagern.
- **Lesbare Adressen verbinden unabhängig gespeicherte Daten.** GesetzesXML,
  Favoriten, Lesezeichen, Kurzbefehle, Markierungen und Markierungskonflikte
  teilen die Adressierung mit öffentlichen Links. Die Bezeichnungen ermöglichen lesbare XML-Dateien
  und teilbare Links ohne gemeinsame Referenztabellen oder Waisenbereinigung.
- **Dauerhaft vergebene IDs wären ein anderer Mechanismus.** Eine einmalig
  vergebene opake ID, etwa eine UUID, müsste bei jeder Gesetzesaktualisierung
  aktiv erhalten und den neuen Normen zugeordnet werden. Sie wäre robuster
  gegenüber Bezeichnungsänderungen, erforderte aber zusätzliche Zuordnungslogik
  und würde bei Verwendung in Tiefenlinks deren Lesbarkeit aufgeben.

## Vorgehen bei künftiger Änderung

Eine Änderung des eingefrorenen Vertrags erfordert eine gemeinsame Migration
aller betroffenen Dateiformate und eine Lösung für bereits verteilte
`lexlata://`-Links. Die Schemaversion aller betroffenen XML-Formate ist anzuheben;
maßgeblich sind die [Versionierungsregeln](xml-formate.md#projektweite-regeln).

Die Entscheidung ist neu zu bewerten, wenn ein weiterer Dienst Eigenschaften
wie Eindeutigkeit über Gesetzesgrenzen hinweg benötigt, Kollisionsprobleme in
der Praxis auftreten oder Normen über Gesetzesaktualisierungen hinweg stabil
referenziert werden müssen. Dann ist die Alternative dauerhaft vergebener IDs
zu prüfen, statt das bestehende Format isoliert zu ändern.
