# Zitatgrammatik

Diese Übersicht beschreibt die Eingaberegeln, Zuständigkeiten und Grenzen des
Zitatparsers. Fachbegriffe nach dem [Glossar](../GLOSSAR.md).

## Normangaben und Gesetzeszuordnung

Der Parser erkennt Normangaben mit Symbol oder bloßer Zahl, Zusatzangaben und
Kurztitel. Ein Kurztitel am Ende einer Zahlenkette gilt für deren Normen.
Ein neues Normsymbol oder Semikolon beginnt dagegen eine neue Gesetzeszuordnung.
Ohne eigene Gesetzesangabe gilt das Ausgangsgesetz.

| Eingabe               | Bedeutung                                                            |
| --------------------- | -------------------------------------------------------------------- |
| `§§ 433 und 434 BGB`  | §§ 433 und 434 BGB                                                   |
| `§ 433 und § 434 BGB` | § 433 des Ausgangsgesetzes, § 434 BGB                                |
| `§§ 5 bis 7 BGB`      | § 5 und § 7 BGB; die dazwischenliegenden Normen werden nicht ergänzt |
| `Art. 229 § 2 EGBGB`  | § 2 unter Gliederungsartikel 229 EGBGB                               |
| `§ 5 § 6 BGB`         | § 5 des Ausgangsgesetzes, § 6 BGB                                    |

Komma, `/`, `und`, `sowie`, `oder`, `bzw.` und `iVm` (auch `i.V.m.`) haben dieselbe Trennwirkung.
Unmittelbar wiederholte Paragraphensymbole ohne erste Zahl, etwa `§ § 90`
oder `§§ § 90`, ergeben einen einzelnen normalen Verweis auf `§ 90`.
Komma und Semikolon werden dabei nicht überbrückt.

`bis` sowie ein Strich zwischen Zahlen bezeichnen nur die beiden Enden.
Zusatzangaben wie Absatz, Unterabsatz, Satz, Nummer, Litera und Halbsatz
präzisieren den Normbezug. Canon-Schreibweisen werden nur mit entsprechendem
Zielprofil erkannt; dessen Ermittlung bleibt Aufgabe des Aufrufers.

## Vollständige Kurztitel

Beginnt ein möglicher Kurztitel und folgt ohne Komma oder Semikolon ein `§`,
kann dieses Zeichen zum Namen gehören. Der Parser prüft den begonnenen Text
gegen die bekannten vollständigen Kurztitel der Gesetze auf dem Gerät und aus den Importindizes.
Der längste vollständig passende Kurztitel wird zusammenhängend gelesen;
Wortanfänge reichen nicht. Das gilt auch für Kurztitel mit Zahlen oder anderen
Grammatikbestandteilen. Komma und Semikolon werden nicht überbrückt.

`§ 5 VO zu § 18 LHO` bezeichnet dadurch § 5 des bekannten Gesetzes
„VO zu § 18 LHO“. Der bloße Kurztitel bezeichnet das ganze Gesetz. Bei
`§ 5 § 6 BGB` hat vor dem zweiten `§` kein Kurztitel begonnen; es bleiben zwei
Normen. Die Regel für `Art. 229 § 2 EGBGB` bleibt erhalten.

Ohne bekannten vollständigen Treffer gelten die gewöhnlichen Parserregeln.
Dann würde `§ 5 VO zu § 18 LHO` in § 5 mit Kurztitel-Kandidat „VO zu“ und
§ 18 LHO zerlegt; der unbekannte Kurztitel wird als Fehler gemeldet.
Sonderzeichen in unbekannten Kurztiteln bleiben deshalb eine Eingabegrenze.

## Schreibweise und Gesetzesauswahl

Groß-/Kleinschreibung ist unerheblich. Leerzeichen bleiben relevant: einfache,
doppelte und geschützte Leerzeichen sowie Tabs und Zeilenumbrüche werden für
den Vergleich auf beiden Seiten zu einem einfachen Leerzeichen vereinheitlicht.
`SGB IV` und `SGB IV` passen zusammen, `SGBIV` und `SGB IV` nicht.

Die bestehende Rangfolge nach Normgeber bleibt maßgeblich. Innerhalb des
maßgeblichen Rangs hat ein exakt geschriebener Kurztitel Vorrang vor einem
Treffer durch Leerzeichenvereinheitlichung. Erst wenn die Suche mit einem
Schlusspunkt erfolglos ist, wird ohne diesen Punkt erneut gesucht. So kann
`BGB.` BGB finden, während ein tatsächlicher Kurztitel mit Punkt erhalten bleibt.

Verbleiben mehrere unterschiedliche gleichrangige Gesetzesreferenzen, meldet die
Auflösung Mehrdeutigkeit. Sie wählt nicht nach Listenreihenfolge. Nach erfolgreicher
Auswahl wird die vorhandene vollständige Referenz übernommen. Gespeicherte
Kurztitel, Normgeber, Identitätsschlüssel und XML-Formate werden nicht verändert.

## Strenge Nummern und Mehrdeutigkeiten

Eingabezahlen dürfen ein oder zwei unmittelbar angehängte Kleinbuchstaben haben,
etwa `5a`, `5aa` oder `5ab`. `5f` bleibt Zahl, `5ff` eine Zahl mit Folgeangabe.
Längere Buchstabenläufe bleiben Zahl plus Wort: `5abc` wird nicht auf `5ab`
gekürzt. `5bis` wird nicht zum Bereichstrenner umgedeutet.

Normauflösung und Zusatzprüfung vergleichen vollständige Nummern. Eine vorhandene
Nr. `1abc` bestätigt weder Nr. `1a` noch Nr. `1ab`. Die vollständige Nummer einer
vorhandenen Absatz- oder Listenbezeichnung wird auch dann gelesen, wenn sie mehr
Buchstaben enthält, als der Eingabeparser unterstützt.

Bei `§ 5 Abs. 1, 2 BGB` kann „2“ eine weitere Absatzangabe oder eine weitere Norm
sein. Die Auflösung prüft am fachlichen Anker, ob die Zusatzangabe im genannten
Kontext vorhanden ist. Nur dann entfällt der zusätzliche Normkandidat. Fehlt das
Zielgesetz, bleibt der Kandidat zunächst bestehen. Dasselbe gilt mit `/` oder `und`.

## Zuständigkeiten und Grenzen

- Das [Zitatmodul](../../src/lib/markierungen/zitat/zitat.index.ts) erkennt
  Schreibweisen und Kandidaten; es lädt keine Dateien oder Gesetze.
- Die [Hilfsfensteraktionen](../../src/lib/markierungen/hilfsfenster-aktionen/verweismarkierungAktionen.ts)
  beschaffen einen gemeinsamen Kandidatenbestand für Zielanalyse, Profilwahl
  und endgültigen Parse. Ein noch nicht importiertes Gesetz kann über seinen
  Indexeintrag bekannt sein; fehlende Indexangebote begrenzen diese Erkennung.
- Die [Auflösung](../../src/lib/markierungen/hilfsfenster-aktionen/verweismarkierungAktionen.zitatAufloesung.ts)
  wählt das Gesetz und prüft Normen und Zusatzangaben. Fehlende oder mehrdeutige
  Gesetzesreferenzen werden nicht geraten, auch nicht bei „Trotzdem speichern“.
- Ein Verweis auf ein ganzes Gesetz ist unabhängig vom Bezugstext der
  Verweismarkierung. „Pauschal“ bezeichnet ausschließlich eine Markierung oder
  einen Kommentar ohne Bezugstext.
- Eingabetext und Textpositionen bleiben erhalten. Nichtleere Zitatlisten decken
  den ganzen Text ohne Lücken oder Überlappung ab, auch nach Mehrdeutigkeitsauflösung.
  Alleinstehende Trenner oder Füllwörter wie `und`, `/` oder `vgl.` erzeugen
  keine Ziele; beim Speichern folgt „Es konnte keine Norm erkannt werden.“
