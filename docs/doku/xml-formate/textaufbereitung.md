# Textaufbereitung: Leerraum und Zeichenkoordinaten

Teil der [XML-Formate](../xml-formate.md); gilt für das [Gesetz-XML](gesetz.md)
und die [Markierungen](markierungen.md).

Den Leerraum im Fließtext fasst ausschließlich der Darstellungsparser
([gesetzesXMLParser.ts](../../../src/lib/darstellung/gesetzesXMLParser.ts)) beim
Lesen zusammen; gespeichertes XML sowie Import und Nachbereitung bleiben dadurch
unverändert. Auch die Unicode-Normalform NFC (siehe Regeln) entsteht nur beim
Lesen. Mixed Content wird nie automatisch formatiert: eingefügter Leerraum an
Wort- oder Satzzeichengrenzen kann den Text verändern. Das Wurzelelement trägt
kein `xml:space="preserve"`.

**Die folgenden Regeln sind Teil des Markierungsformats und eingefroren**,
einschließlich Leerraum, ausdrücklicher Umbrüche und Wortgrenzen.

## Regeln

- Folgen gewöhnlicher Leerzeichen (SP), Tabs (TAB), Wagenrückläufe (CR) und
  Zeilenvorschübe (LF) werden zu einem gewöhnlichen Leerzeichen. Dieser
  Leerraum entfällt am Anfang und Ende jedes Textblatts. Geschützte
  Leerzeichen (NBSP) bleiben auch am Rand erhalten.
- Die Regeln gelten in `<satz>` sowie für direkten Text in `<absatz>`,
  `<unterabsatz>` und Listeneinträgen (`<nummer>`, `<litera>`). Haupttext und
  Fortsetzung werden jeweils normalisiert; Unterlisten bilden eigene Textblätter.
- Inline-Verweise (`<verweis>`) unterbrechen die Normalisierung nicht.
  Elementgrenzen erzeugen selbst keine Leerzeichen; vorhandener Leerraum über
  eine solche Grenze hinweg zählt nur einmal. Verweisbereiche beziehen sich auf
  den normalisierten Text.
- `<zeilenumbruch/>` erzeugt einen ausdrücklichen Umbruch, auch mehrfach
  hintereinander innerhalb eines Textblatts. Am Anfang und Ende eines
  Textblatts entfallen ausdrückliche Umbrüche; Einrückungsleerraum unmittelbar
  davor und danach entfällt ebenfalls. Die Fortsetzung nach einer Unterliste
  wird bereits durch die Textstruktur unterhalb der Liste dargestellt.
- Wortgrenzen und Interpunktion werden nicht erraten oder repariert. Ein
  Quelltextumbruch innerhalb eines Wortes trennt es; ein Quelltextumbruch vor
  einem Punkt erzeugt ein Leerzeichen vor diesem Punkt.
- Text, Titel und Bezeichnungen werden beim Einlesen in die Unicode-Normalform
  NFC gebracht; das gilt auch für nichtamtliche Titel
  ([nichtamtlicheTitelSpeicher.pruefen.ts](../../../src/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.pruefen.ts)).
  Eine Quelle in zerlegter Schreibweise (etwa `a` mit Trema statt `ä`) ergibt
  daher denselben Text und keine Markierungskonflikte. Das gilt für übliche
  Schreibweisen: Ein als Zeichenverweis angegebenes Zeichen (`&#x308;`) und ein
  Tag zwischen Buchstabe und Akzent werden nicht zusammengesetzt.
- Das Taggen von Verweisen setzt, verschiebt oder entfernt nur `<verweis>`-Tags
  und verändert nie die Zeichen zwischen ihnen. Elementstand und Zeichenbereiche
  hängen allein von der Zeichenfolge des dargestellten Textes ab, nicht von der
  Lage der Verweis-Tags
  ([verweisTagger.textstabilitaet.test.ts](../../../src/lib/import/basis/verweisTagger.textstabilitaet.test.ts)).

Beispiel:

```xml
<satz zahl="1">
    Es gelten
    <verweis>die allgemeinen
        Vorschriften</verweis>
    entsprechend.<zeilenumbruch/>
    Weitere Angaben folgen.
</satz>
```

Der gelesene Text lautet `Es gelten die allgemeinen Vorschriften entsprechend.`,
gefolgt von einem ausdrücklichen Umbruch und `Weitere Angaben folgen.`. Der
Bezugstext des Verweises lautet `die allgemeinen Vorschriften`.

## Nachbereitung beim Import

Die optionale Nachbereitung („Sätze und Verweise taggen“) bereinigt eigenständig:
Sie glättet Quelltexteinrückung, ersetzt geschützte Leerzeichen durch
gewöhnliche und kann sie am Rand entfernen, fasst aufeinanderfolgende
ausdrückliche Umbrüche zusammen, entfernt Randumbrüche und kann Umbrüche an
Satzgrenzen durch Satzstruktur ersetzen. Der Parser rekonstruiert diese
entfernten Zeichen nicht. Die Darstellung setzt weiterhin nach ihren Regeln
geschützte Leerzeichen.

## Zeichenkoordinaten

`start` zählt ab null und ist eingeschlossen, `ende` ist ausgeschlossen:
`start="0" ende="3"` bezeichnet die ersten drei UTF-16-Codeeinheiten. Gezählt
wird der dekodierte, dargestellte Text in NFC, nicht der XML-Quelltext mit Tags oder
Entity-Schreibweisen (`&amp;` zählt als ein `&`). Die Zähleinheit entspricht
JavaScript-Stringpositionen; manche Zeichen, etwa viele Emoji, belegen zwei
Einheiten. Welcher Text gemeint ist, regelt das
[Markierungsformat](markierungen.md#zeichenkoordinaten-und-textpfad).

Ein fehlender Satz-Schritt im Textpfad bedeutet Satz 1. Das gilt für den äußeren
Satz eines Absatzes oder Unterabsatzes ebenso wie für den Satz im Listeneintrag.
Der GesetzesXML-Schreiber lässt bei genau einem Satz den `<satz>`-Wrapper weg;
bei mehreren Sätzen schreibt er je einen Wrapper. Deshalb sind ein fehlender
Satz-Schritt und Satz 1 bei Auflösung und Pfadvergleichen gleichwertig.
Das Anfügen oder Streichen anderer Sätze lässt den Bezug auf einen unveränderten
ersten Satz bestehen. Der gespeicherte Bezugstext wird weiterhin geprüft;
ein vorangestellter neuer Satz oder ein entfallener Satz 2 bleibt ein Konflikt.
