# Markierungskonflikte erklären

Diese Datei legt fest, wie die Konflikttypen im Markierungskonfliktfenster in
der Vorschau (eine Zeile je Konflikt) und in der Erläuterung (erscheint unter der
Zeile, sobald sie ausgewählt ist) dargestellt werden. Sie ist die verbindliche
Vorgabe für alle Texte, Symbole, die Reihenfolge der Zeilen und die Auswahl nach
einer Aktion.

Die gespeicherten Ausgangsstellen und Verweisziele folgen der gemeinsamen
[Bezeichnungsregel](xml-formate/markierungen.md#bezeichnungen); den Aufbau
Gesetz → Markierung → Konflikt beschreibt das
[Konfliktformat](xml-formate/markierungen.md#markierungskonflikte).

## Grundregeln

### Symbole

Das Symbol steht am Ende der Vorschauzeile. „(X)“, „(?)“ und „(→)“ stehen in
dieser Datei für die vorhandenen Icons der Oberfläche; sie sind nicht Teil des
Vorschautextes.

| Symbol | Bedeutung                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| (X)    | Etwas ist nicht da: Gesetz oder Datei nichtamtlicher Titel nicht auf dem Gerät, Ausgangsstelle fehlt, Zielnorm fehlt. |
| (?)    | Die Ausgangsstelle der Markierung hat sich verändert oder ist nicht eindeutig.                                        |
| (→)    | Es geht um eine Zielnorm, die vorhanden ist, aber nicht mehr passt: Sie hat sich verändert oder ist nicht eindeutig.  |

### Wortwahl

- **„nicht auf dem Gerät“** gilt für ganze Gesetze und für die Datei mit den
  nichtamtlichen Titeln. Das Wort „fehlt“ bleibt Normen, Überschriften und
  Zielnormen vorbehalten, die es im vorhandenen Gesetz nicht mehr gibt.
- **Fachbegriffe:** Ausgangsstelle (Norm oder Überschrift, an der die
  Markierung steht), Zielnorm (worauf ein Verweis zeigt),
  Zielgesetz (das Gesetz der Zielnorm), Bezugstext (die markierte Textstelle).
- **Wortlaut des Verweises** ist der Text, den der Nutzer als Verweis erfasst hat,
  z. B. „Art. 1, 2 GG“. Er kann von den ermittelten Zielnormen abweichen. In den
  Beispielen dieser Datei steht dafür der Platzhalter „[Verweistext]“ (so heißt
  das Feld im Datenmodell); in der Oberfläche erscheint nur der Text selbst.
- **Einzahl und Mehrzahl** richten sich nach der Zahl der betroffenen Normen:
  „Zielnorm verändert“, aber „Zielnormen verändert“. Das gilt auch für
  Erläuterungen, Aktionsbuttons, Rückfragen und Rückmeldungen. Mehrere Normen mit
  demselben Präfix werden zusammengefasst: „Art. 1, 2 GG“, „§§ 6, 7 BGB“.
- Deutsche Anführungszeichen nutzen: „…“

### Bezeichnung der Ausgangsstelle

Die Vorschau beginnt mit dem Anzeigenamen der Ausgangsstelle:

- **Normen:** „§ 1“, bei Gliederungsartikeln „Art. 229 § 2“. Ist die Norm nicht
  mehr im Gesetz oder nicht eindeutig zu finden, steht die gespeicherte
  Bezeichnung mit dem gespeicherten Präfix (ebenfalls „§ 5“).
- **Überschriften:** der Titel der Überschrift; hat sie keinen Titel, ihre
  Bezeichnung (z. B. „Erster Teil“). Gliederungskennzahlen erscheinen nie. Ist die
  Überschrift nicht mehr im Gesetz oder nicht eindeutig zu finden, steht nur
  „Überschrift“.

### Kürzung

In der Vorschau werden Bezugstext, Wortlaut des Verweises und Überschriftentitel
gekürzt, wenn sie länger als 30 Zeichen sind (Leerzeichen und Satzzeichen zählen
mit). Gezeigt werden so viele ganze Wörter, wie in 30 Zeichen passen, danach „…“
ohne Leerzeichen. Ist schon das erste Wort länger als 30 Zeichen, wird nach dem 30. Zeichen abgeschnitten. Texte bis 30 Zeichen bleiben unverändert. Die
Erläuterung zeigt alles vollständig.

### Wenn nur der gespeicherte Stand verfügbar ist

Konnte die Prüfung nicht abgeschlossen werden, steht nur der gespeicherte
Konflikttyp zur Verfügung. Dann entfallen Bezugstext, Wortlaut des Verweises und
Zielnormen in Vorschau und Erläuterung, z. B. „§ 1: Unterstrichener Text
verändert (?)“ oder „§ 1: Verweis auf GG: Zielnorm fehlt (X)“. Bei Überschriften
steht nur „Überschrift“. Die Erläuterung lässt die entfallenden Angaben aus
(„Die Zielnorm, auf die sich der Verweis bezieht, fehlt.“, immer in der Einzahl;
Satz 2 beim Bezugstext entfällt). „Nicht eindeutig“ und die Fallunterscheidung
beim nichtamtlichen Titel sind dann nicht erkennbar; es gelten die allgemeinen
Texte.

### Aufbau der Vorschau

- **Gesetzzeile:** Kurztitel mit Aufklapp-Pfeil (dreht sich beim Auf- und
  Zuklappen). Die Gesetzzeile trägt kein Konfliktsymbol, denn sie ist selbst
  kein Konflikt. Ausnahme `gesetzFehlt`: Dort steht statt des Pfeils der Text
  „Gesetz nicht auf dem Gerät“ mit Symbol (siehe unten).
- **Konfliktzeile:** `<Ausgangsstelle>: <Konflikt> (<Symbol>)`, z. B.
  „§ 1: Unterstrichener Text „Vertrag“ verändert (?)“.
- **Verweis mit mehreren Konflikten:** Kopfzeile mit Bulletzeilen, siehe unten.

## gesetzFehlt

Vorschau: BGB: Gesetz nicht auf dem Gerät (X)

Erläuterung: BGB ist nicht auf diesem Gerät. Markierungen dazu können erst nach
einem Import geprüft werden.

## nichtamtlicheTitelXmlFehlt

Vorschau: Nichtamtliche Titel nicht auf dem Gerät (X)

Erläuterung: Die Datei mit den nichtamtlichen Titeln zu diesem Gesetz ist nicht
auf diesem Gerät. Markierungen nichtamtlicher Titel können deshalb nicht geprüft
werden.

## bezugstextFehltOderUnpassend

### Vorschau

§ 1: Unterstrichener Text „[Bezugstext gekürzt]“ verändert (?)
§ 1: Hervorgehobener Text „[Bezugstext gekürzt]“ verändert (?)
§ 1: Bezugstext des Verweises „[Bezugstext gekürzt]“ verändert (?)
§ 1: Kommentierter Text „[Bezugstext gekürzt]“ verändert (?)

Bei Überschriften steht statt „§ 1“ der Anzeigename der Überschrift, z. B.
„Allgemeine Vorschriften: Unterstrichener Text „…“ verändert (?)“.

Die Vorschau sagt immer „Text“ und „verändert“, auch wenn der Bezugstext ganz
fehlt, und auch bei Titeln und Bezeichnungen. Den genauen Bereich nennt erst die
Erläuterung.

### Erläuterung

Satz 1 nennt den Bereich und den Konflikt:

> Der Normtext, auf den sich die Unterstreichung bezieht, fehlt oder hat sich
> verändert.

| Bereiche bei Normen                                                       | Bereiche bei Überschriften                           |
| ------------------------------------------------------------------------- | ---------------------------------------------------- |
| der Normtext, der Normtitel, der nichtamtliche Titel, die Normbezeichnung | der Überschriftentitel, die Überschriftenbezeichnung |

Satz 2 nennt den vollständigen Bezugstext und die Fundstelle:

> Die Markierung bezieht sich auf „[vollständiger Bezugstext]“ in Abs. 1 S. 1.

Bei Titeln und Bezeichnungen entfällt „in …“, weil Satz 1 den Bereich schon
nennt. Es entfällt auch, wenn es keinen Textpfad gibt (die Norm hat keine
Absatzstruktur).

**Fundstelle:** Sie steht immer in dieser Form, unabhängig von den
Zitiereinstellungen der App: „Abs. 1 UAbs. 1 S. 1 Nr. 1a“ (Abkürzungen mit
Punkt, arabische Ziffern). Eine Litera, die unmittelbar auf eine Nummer folgt,
wird an sie angehängt („Nr. 1a“); tiefer verschachtelte Literae stehen als
„lit. aa“. Ein Satz innerhalb einer Nummer folgt am Ende („Nr. 3a S. 2“).

| Markierung                    | Satz 1 (Beispiel)                                                                          | Satz 2                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Unterstreichung, Normtext     | Der Normtext, auf den sich die Unterstreichung bezieht, fehlt oder hat sich verändert.     | Die Markierung bezieht sich auf „[Bezugstext]“ in Abs. 1 S. 1.             |
| Hervorhebung, Normtext        | Der Normtext, auf den sich die Hervorhebung bezieht, fehlt oder hat sich verändert.        | Die Markierung bezieht sich auf „[Bezugstext]“ in Abs. 2 S. 1 Nr. 3a S. 2. |
| Kommentar, Normtitel          | Der Normtitel, auf den sich der Kommentar bezieht, fehlt oder hat sich verändert.          | Die Markierung bezieht sich auf „[Bezugstext]“.                            |
| Verweis, Überschriftentitel   | Der Überschriftentitel, auf den sich der Verweis bezieht, fehlt oder hat sich verändert.   | Die Markierung bezieht sich auf „[Bezugstext]“.                            |
| Hervorhebung, Normbezeichnung | Die Normbezeichnung, auf die sich die Hervorhebung bezieht, fehlt oder hat sich verändert. | Die Markierung bezieht sich auf „[Bezugstext]“.                            |

### Sonderfall nichtamtlicher Titel

Ist die Datei mit den nichtamtlichen Titeln vorhanden und ist der Titel dort
geändert oder entfernt (die Norm hat weiterhin keinen amtlichen Titel), gilt der
normale Text oben mit „der nichtamtliche Titel“. Wird der nichtamtliche Titel gar
nicht mehr angezeigt, erklärt Satz 1 den Grund. Die Vorschau bleibt unverändert.

| Lage der Norm                        | Satz 1                                                                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Norm ist weggefallen                 | Der nichtamtliche Titel, auf den sich die Unterstreichung bezieht, wird nicht mehr angezeigt, weil die Norm weggefallen ist. |
| Norm hat jetzt einen amtlichen Titel | … wird nicht mehr angezeigt, weil die Norm jetzt einen amtlichen Titel hat.                                                  |
| Norm nicht mehr im Gesetz            | … wird nicht mehr angezeigt, weil die Norm nicht mehr im Gesetz vorhanden ist.                                               |

In diesen drei Fällen entfällt nur das „in …“. Satz 2 mit dem Bezugstext bleibt:
„Die Markierung bezieht sich auf „[vollständiger Bezugstext]“.“

## pauschalerBezugFehlt

Vorschau:
§ 1: Kommentar, Ausgangsstelle fehlt (X)
§ 1: Verweis, Ausgangsstelle fehlt (X)
Bei Überschriften steht deren Anzeigename statt „§ 1“ (bei einer fehlenden
Überschrift nur „Überschrift“).

Erläuterung: Die Ausgangsstelle, an der der Kommentar (der Verweis) steht, fehlt.

## pauschalerBezugUnpassend

Wie `pauschalerBezugFehlt`, aber „verändert“ statt „fehlt“ und (?) statt (X).

Vorschau: § 1: Kommentar, Ausgangsstelle verändert (?)

Erläuterung: Die Ausgangsstelle, an der der Kommentar (der Verweis) steht, hat sich
verändert.

## Ausgangsstelle nicht eindeutig

Kommt die Bezeichnung der Ausgangsstelle im Gesetz
mehrfach vor, lässt sich die Markierung keiner Stelle sicher zuordnen. Das gilt
für Markierungen mit Textbezug (gespeichert als `bezugstextFehltOderUnpassend`)
und für pauschale Markierungen (gespeichert als `pauschalerBezugFehlt`). Es ist
kein eigener Typ; die Darstellung ersetzt „fehlt“ oder „verändert“.
`pauschalerBezugUnpassend` ist nie betroffen, weil er eine eindeutig gefundene
Ausgangsstelle voraussetzt.

Vorschau (Symbol immer (?)):
§ 5: Unterstreichung, Ausgangsstelle nicht eindeutig (?)
§ 5: Kommentar, Ausgangsstelle nicht eindeutig (?)
Überschrift: Kommentar, Ausgangsstelle nicht eindeutig (?)

Erläuterung: Zur Ausgangsstelle § 5 passen mehrere Normen im Gesetz.
Bei Überschriften: Zur Ausgangsstelle passen mehrere Überschriften im Gesetz.

## zielGesetzFehlt

Vorschau: § 1: Verweis auf GG: Gesetz nicht auf dem Gerät (X)

Erläuterung: Der Verweis „[Verweistext]“ bezieht sich auf
ein Gesetz, das nicht auf dem Gerät ist.

Für ein Zielgesetz, das nicht auf dem Gerät ist, zeigt die Vorschau nur diese
eine Zeile; seine Zielnormen lassen sich nicht beurteilen.

## Zielnormen: verändert, nicht eindeutig, fehlt

Ein Verweis kann auf dasselbe Gesetz mehrere Zielnormen mit unterschiedlichen
Problemen haben, z. B. „Art. 10, 5, 999 GG“: Art. 10 hat sich verändert, zu
Art. 5 passen mehrere Normen, Art. 999 gibt es nicht. Jede Art braucht eine
andere Erklärung, ein anderes Symbol und ein anderes Aktionsangebot. Deshalb gibt
es für sie getrennte Zeilen.

### Vorschau

| Zielnormen      | Vorschau (Einzahl)                                   | Vorschau (Mehrzahl)                                       | Symbol |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------- | ------ |
| verändert       | § 1: Verweis auf Art. 10 GG: Zielnorm verändert      | § 1: Verweis auf Art. 1, 2 GG: Zielnormen verändert       | (→)    |
| nicht eindeutig | § 1: Verweis auf Art. 5 GG: Zielnorm nicht eindeutig | § 1: Verweis auf Art. 4, 5 GG: Zielnormen nicht eindeutig | (→)    |
| fehlt           | § 1: Verweis auf Art. 999 GG: Zielnorm fehlt         | § 1: Verweis auf Art. 998, 999 GG: Zielnormen fehlen      | (X)    |

### Erläuterungen

**Verändert**

- Einzahl: Die Zielnorm Art. 1 GG, auf die sich der Verweis „[Verweistext]“ bezieht, hat sich verändert.
- Mehrzahl: Die Zielnormen Art. 1, 2 GG, auf die sich der Verweis „[Verweistext]“ bezieht, haben sich verändert.

**Nicht eindeutig**

- Einzahl: Zur Zielnorm Art. 5 GG, auf die sich der Verweis „[Verweistext]“ bezieht, passen mehrere Normen. Sie kann deshalb nicht neu verknüpft werden.
- Mehrzahl: Zu den Zielnormen Art. 4, 5 GG, auf die sich der Verweis „[Verweistext]“ bezieht, passen jeweils mehrere Normen. Sie können deshalb nicht neu verknüpft werden.

**Fehlt**

- Einzahl: Die Zielnorm Art. 999 GG, auf die sich der Verweis „[Verweistext]“ bezieht, fehlt.
- Mehrzahl: Die Zielnormen Art. 998, 999 GG, auf die sich der Verweis „[Verweistext]“ bezieht, fehlen.

### Aktionen je Zeile

Die Aktionen wirken nur auf die Zielnormen der ausgewählten Zeile. Eine Zeile
„fehlt“ entfernt also nie die Verknüpfung veränderter Zielnormen und umgekehrt.

| Aktion                                           | verändert                                    | nicht eindeutig | fehlt |
| ------------------------------------------------ | -------------------------------------------- | --------------- | ----- |
| Markierung löschen                               | ja                                           | ja              | ja    |
| Verweis bearbeiten                               | ja                                           | ja              | ja    |
| Mit aktueller Norm (aktuellen Normen) verknüpfen | ja                                           | nein            | nein  |
| Verknüpfung (Verknüpfungen) entfernen            | ja                                           | ja              | ja    |
| Zielnorm öffnen                                  | nur wenn die Zeile nur eine Zielnorm enthält | nein            | nein  |

## Verweise mit mehreren Konflikten

Hat ein Verweis mehr als einen Konflikt, zeigt die Vorschau eine Kopfzeile mit
dem Anzeigenamen der Ausgangsstelle und dem Wortlaut des Verweises und darunter
je Konflikt eine Bulletzeile:

§ 1: Verweis „Art. 1, 2, 5, 999 GG, § 1 ZVG“:

- Bezugstext „[Bezugstext gekürzt]“ verändert (?)
- Art. 1, 2 GG: Zielnormen verändert (→)
- Art. 5 GG: Zielnorm nicht eindeutig (→)
- Art. 999 GG: Zielnorm fehlt (X)
- ZVG: Gesetz nicht auf dem Gerät (X)

Die Bulletzeilen werden immer angezeigt. Die Kopfzeile ist nicht klickbar. Jede
Bulletzeile ist einzeln anklickbar: Sie wählt ihren Konflikt aus und öffnet die
Markierung im Hauptfenster. Unter der ausgewählten Bulletzeile erscheint ihre
Erläuterung; die Konfliktseitenleiste zeigt die Aktionen dieses Konflikts, wie bei einem
einzelnen Konflikt. Ohne Wortlaut des Verweises (gespeicherter Stand) lautet die
Kopfzeile „§ 1: Verweis:“.

Hat ein Verweis nur einen Konflikt, bleibt es bei der einzeiligen Vorschau.

### Reihenfolge der Bulletzeilen

1. Konflikt der Ausgangsstelle (`bezugstextFehltOderUnpassend`, Ausgangsstelle
   nicht eindeutig)
2. Zielkonflikte, sortiert nach Kurztitel der Zielgesetze. Innerhalb eines
   Zielgesetzes:
   1. Gesetz nicht auf dem Gerät (schließt die übrigen aus)
   2. veränderte Zielnormen
   3. nicht eindeutige Zielnormen
   4. fehlende Zielnormen

Damit stehen innerhalb eines Gesetzes alle (→) vor den (X).

## Auswahl nach einer Aktion

Verschwindet die ausgewählte Zeile (z. B. weil eine Aktion ihren Konflikt gelöst
hat oder das Zielgesetz importiert wurde), wird die nächste Zeile desselben
Verweises ausgewählt, die nach der Reihenfolge oben darunter steht; gibt es
keine, die davor stehende; gibt es keine, wird nichts ausgewählt. Eine Zeile gilt
als „darunter“, wenn sie nach dieser Reihenfolge hinter der verschwundenen Zeile
stehen würde. So führt der Import eines fehlenden Zielgesetzes auf die ersten
neuen Zeilen dieses Gesetzes. Das Hauptfenster bleibt dabei unverändert. Zeilen
anderer Verweise und Gesetzzeilen werden nie ausgewählt.
