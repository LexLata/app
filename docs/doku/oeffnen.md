# Öffnen-Overlay aus Nutzersicht

Diese Übersicht fasst zusammen, wie das Öffnen-Overlay Eingaben deutet, Treffer ordnet und Importangebote macht. Fachbegriffe nach dem [Glossar](../GLOSSAR.md). Maßgeblich ist die [Trefferberechnung](../../src/lib/domain/app/oeffnen/oeffnen.index.ts); die Beispiele sind durch ihre Tests abgedeckt (`oeffnenBeispieltabellen.test.ts`, `oeffnenTrefferregeln.test.ts`).

Beschrieben ist das Öffnen-Overlay auf Desktop. Mobile nutzt dieselbe Trefferberechnung, importiert aber nur aus dem Index Bund und kennt weder Neuer-Tab noch Artikelkontext.

Arbeitsbegriffe: **Hauptnorm** = Norm mit Normpräfix (zB § 1, Art. 1, Regel 1). **Nebennorm** = Norm ohne Normpräfix, außer Erwägungsgrund, gefunden über ihre erste Zahl (Anlage 1, Anhang 1, Muster 1).

## Eingaben

| Eingabe                        | Bedeutung                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `433`                          | Normzahl ohne Normpräfix: § 433, Art. 433, Can. 433, Regel 433 oder Nr. 433, je nachdem, was das Gesetz hat; zusätzlich Nebennormen (zB Anlage 433) |
| `§ 433`, `§433`                | nur Normen mit §; im gemeinten Gesetz auch alle anderen Normpräfixe; keine Nebennormen                                                              |
| `Art. 5`, `Art 5`, `Artikel 5` | Art.-Normen; im gemeinten Gesetz auch alle anderen Normpräfixe; keine Nebennormen                                                                   |
| `229 3`                        | Art. 229 § 3 (Gliederungsartikel und § darin); keine Nebennormen                                                                                    |
| `e25`                          | Erwägungsgrund E25; das „e“ steht unmittelbar vor der Zahl; keine Nebennormen                                                                       |
| `433 bgb`, `§ 433 BGB`         | Normeingabe und Gesetzeseingabe zusammen                                                                                                            |
| `bgb`, `bürgerliches`          | nur Gesetzeseingabe: Kurz- oder Langtitel oder ein Teil davon                                                                                       |
| `1GG`, `1 GG`                  | Normzahl und Kurztitel dürfen ohne Leerzeichen zusammenstehen; gilt auch für `433bgb`                                                               |
| `23a`, `23A`                   | Normzahl mit Buchstabenzusatz; Groß- und Kleinschreibung gleichgültig                                                                               |
| leer, `§`                      | die ersten 30 installierten Gesetze                                                                                                                 |

## Normzahl und Norm

| Regel                                                                                                                    | Beispiel                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Es zählt die ganze Normzahl.                                                                                             | `23` findet § 23, nicht § 123, § 230 oder § 23a; `23a` findet § 23a, nicht § 23ab                                                               |
| Sammelnormen zählen alle genannten Zahlen.                                                                               | „§§ 3 bis 6“ findet 3 bis 6; „§§ 3, 5“ findet 3 und 5, nicht 4                                                                                  |
| Bei Nebennormen zählt nur die erste Zahl der Bezeichnung.                                                                | `3` findet „Anlage 3 (zu § 5)“, `5` nicht; „Anhang I“ (römisch) und „Anhang 1a“ werden von `1` nicht gefunden                                   |
| Gibt es eine Normzahl mehrfach, gilt die erste Fundstelle; in Gesetzen mit Gliederungsartikeln gehen Artikel den §§ vor. | zwei Normen „§ 1“: die erste                                                                                                                    |
| Fehlt die Norm im installierten Gesetz, ist es kein Treffer.                                                             | Ausnahme: Gesetze ohne Normpräfix (nur Anlagen oder Muster) öffnen mit Gesetzeseingabe das Gesetz ohne Norm; mit reiner Zahl erscheinen sie nie |

## Welches Gesetz wird durchsucht?

Bei reiner Normeingabe (ohne Gesetzeseingabe) gilt:

1. Das aktive Gesetz zuerst. Gibt es dort einen Treffer, erscheinen nur Treffer aus diesem Gesetz.
2. Sonst (oder ohne aktives Gesetz) alle installierten Gesetze, nach zuletzt angezeigt geordnet.

Wie streng ein Gesetz durchsucht wird, hängt davon ab, ob es gemeint ist:

| Gesetz  | Gilt für                                                                                       | § und Art.                                                                    | Nebennormen                       | Treffer je Gesetz                |
| ------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------- | -------------------------------- |
| gemeint | aktives Gesetz bei reiner Normeingabe; Gesetz mit vollständig eingegebenem Kurztitel (`1 LBO`) | Normpräfixe tauschbar: `§ 1` findet auch Art. 1 und Can. 1, `Art. 1` auch § 1 | bei `1` alle, nach der Hauptnorm  | Hauptnorm, dann alle Nebennormen |
| übrig   | Gesetze im Rückfall; nur teilweise genannte Gesetze (`1 l`, `§ 1 bürgerliches`)                | Präfix muss passen; `1` ohne Präfix passt auf jedes                           | nur, wenn es keine Hauptnorm gibt | höchstens einer                  |

In Gesetzen mit Gliederungsartikeln (zB EGBGB) findet eine reine Zahl als übriges Gesetz nur Artikel, nicht die §§ darunter; dafür gibt es `229 3`.

**Artikelkontext:** Liest der Nutzer im aktiven Gesetz gerade in oder auf Art. 246a, findet `§ 4` den § 4 dieses Artikels (Art. 246a § 4) statt Art. 4. Das gilt nur bei Eingabe mit §, nur im gemeinten aktiven Gesetz und nur, wenn der § in diesem Artikel existiert; sonst gilt die normale Auflösung. Der Kontext wird beim Öffnen des Öffnen-Overlays festgehalten.

## Reihenfolge der Treffer

Installierte Gesetze und Importangebote stehen in einer Liste, abgeschnitten nach der Sortierung bei höchstens 30 Treffern.

| Rang | Treffer                                                                                                             | Sortierung innerhalb                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | installiert, Kurztitel (bei EU-Gesetzen auch ein vollständiger Alternativname) entspricht der Gesetzeseingabe genau | zuletzt angezeigt zuerst, dann Normgeber                                |
| 2    | Importangebot, Kurztitel oder Alternativname entspricht genau                                                       | Bund, EU, Baden-Württemberg                                             |
| 3    | installiert, Teiltreffer                                                                                            | Stufe, dann zuletzt angezeigt zuerst, dann alphabetisch, dann Normgeber |
| 4    | Importangebot, Teiltreffer                                                                                          | Stufe, dann alphabetisch, dann Normgeber                                |

Teiltreffer ordnen sich nach Stufen:

| Stufe | Teiltreffer, wenn                             |
| ----- | --------------------------------------------- |
| 1     | der Kurztitel mit der Gesetzeseingabe beginnt |
| 2     | der Kurztitel die Gesetzeseingabe enthält     |
| 3     | nur der Langtitel die Gesetzeseingabe enthält |

- Normgeber: Bund vor EU vor Baden-Württemberg; bei `EUV` EU zuerst.
- Leere Eingabe und `§` zeigen die ersten 30 installierten Gesetze: zuletzt angezeigte zuerst, danach in Listenreihenfolge.
- Innerhalb eines Gesetzes steht die Hauptnorm vor den Nebennormen, diese in Textreihenfolge.

## Importangebote

| Frage                           | Regel                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wann gibt es Angebote?          | Nur bei Gesetzeseingabe (`bgb`, `433 bgb`, `e25 dsgvo`). Reine Normeingaben (`433`, `§ 1`, `229 3`, `e1`) zeigen nie Angebote und laden den Importindex nicht. Eingaben wie `2004/38/EG` laden den Importindex ebenfalls, weil sie ein Zahlentitel sein können                                                                    |
| Woher?                          | Importindex Bund (gesetze-im-internet.de), Baden-Württemberg (landesrecht-bw.de), EU (eur-lex.europa.eu); die Zeile nennt die Quelle                                                                                                                                                                                              |
| Wann ausgeblendet?              | Das Gesetz (gleicher Normgeber und Kurztitel) ist installiert. EU-Durchführungsrechtsakte, außer die Einstellung „Durchführungsrechtsakte in „Gesetz oder Norm öffnen“ anzeigen“ ist an oder der Kurztitel entspricht der gesamten Eingabe                                                                                        |
| Wie gefunden?                   | Wie installierte Teiltreffer (Stufen oben). EU-Rechtsakte zusätzlich über vollständig eingegebene Alternativnamen (nicht über Namensteile; die Zeile zeigt dann den gefundenen Namen) und aus der CELEX-Nummer abgeleitete Kurztitel. `egstgb` und `stgbeg` finden dasselbe Gesetz, die zweite Schreibweise steht aber in Stufe 3 |
| Mit Norm?                       | `433 bgb` bietet das BGB mit Hinweis „§ 433“ an; das Präfix folgt der bekannten Präfixstruktur (zB Art. beim GG). Nach dem Import wird die Norm aufgelöst und geöffnet; fehlt sie, öffnet das Gesetz ohne Norm                                                                                                                    |
| Auswahl?                        | Enter oder Klick importiert und öffnet im aktuellen Tab, Strg/⌘+Enter im neuen Tab. Während des Imports ist die Eingabe gesperrt; ein Fehler bleibt bis zur nächsten Eingabe stehen                                                                                                                                               |
| Importindex noch nicht geladen? | „Importvorschläge werden geladen …“; solange ist keine Auswahl möglich, auch nicht für installierte Treffer. Der Index wird kurz nach dem Start im Hintergrund vorgeladen. Schlägt das Laden fehl („Importvorschläge konnten nicht geladen werden.“), bleiben installierte Treffer wählbar                                        |

## Öffnen-Links

Der [öffentliche Öffnen-Link](adressierungsformat-eingefroren.md#öffentlicher-öffnen-link-additiv) nutzt dieselbe Trefferberechnung, aber ohne aktives Gesetz, ohne Reihenfolge nach zuletzt angezeigt und ohne die Einstellung zu Durchführungsrechtsakten: Normeingaben durchsuchen alle installierten Gesetze in Listenreihenfolge, geöffnet wird der erste Treffer.
