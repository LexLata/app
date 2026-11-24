# Markierungen und Markierungskonflikte

Teil der [XML-Formate](../xml-formate.md). Fließtext- und Zeichenregeln:
[Textaufbereitung](textaufbereitung.md).

## Markierungen

Bau/Parse: [src/lib/markierungen/markierungs-xml/markierungsXML.ts](../../../src/lib/markierungen/markierungs-xml/markierungsXML.ts).
Dateiname: `markierungen/{Kurztitel}_{Normgeber}-markierungen.xml`.

Die vier Markierungs-Tags sind zugleich die internen Werte von `MarkierungsTyp`:
`unterstreichung`, `hervorhebung`, `verweismarkierung`, `kommentar`.
Im Konfliktformat benennt derselbe Tag die Markierungsart.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<markierungen version="1">
    <infos>
        <gesetz normgeber="de-bund">BGB</gesetz>
        <verarbeitungszeit>2026-11-05T10:15:30Z</verarbeitungszeit>
    </infos>
    <inhalt>
        <unterstreichung>
            <bezeichnung>§ 433</bezeichnung>
            <textstelle><absatz>(1)</absatz><satz>1</satz><nummer wiederholung="2">1.</nummer><zeichenbereich start="12" ende="34"/></textstelle>
            <bezugstext>markierter Textausschnitt</bezugstext>
            <erstellt>2026-11-05T10:00:00Z</erstellt>
        </unterstreichung>
        <hervorhebung>
            <bezeichnung>Anhang 1</bezeichnung>
            <textstelle><zeichenbereich start="0" ende="4"/></textstelle>
            <bezugstext>Text</bezugstext>
            <erstellt>2026-11-05T10:00:00Z</erstellt>
        </hervorhebung>
        <kommentar>
            <bezeichnung>§ 433</bezeichnung>
            <elementstand><titel>Kaufvertrag</titel><textlaenge>842</textlaenge></elementstand>
            <kommentartext>Kommentartext des Nutzers.</kommentartext>
            <erstellt>2026-11-05T10:00:00Z</erstellt>
            <geaendert>2026-11-05T10:15:30Z</geaendert>
        </kommentar>
        <verweismarkierung>
            <bezeichnung>Art. 229 § 3</bezeichnung>
            <elementstand><textlaenge>20</textlaenge></elementstand>
            <verweisinhalt>
                <verweistext>§ 6 EGBGB</verweistext>
                <verweisziel>
                    <gesetz normgeber="de-bund">EGBGB</gesetz>
                    <bezeichnung>§ 6</bezeichnung>
                    <verweistextZeichenbereich start="0" ende="9"/>
                    <elementstand><titel>Zielnorm</titel><textlaenge>842</textlaenge></elementstand>
                </verweisziel>
            </verweisinhalt>
            <erstellt>2026-11-05T10:00:00Z</erstellt>
        </verweismarkierung>
    </inhalt>
</markierungen>
```

### Gesetzesangaben

- `<infos><gesetz>` ist die Dateizuordnung; das Attribut `normgeber` ist Pflicht. Einträge ohne Normgeber in Dateizuordnung oder Verweisziel werden mit Befund abgelehnt. `<verweisziel><gesetz>` ist das Verweisziel. Bei einem
  Ziel im selben Gesetz fehlt `<gesetz>`; dann gilt das Gesetz der Ausgangsstelle.
  Die Suche nach referenzierenden Gesetzen liest die Zielfelder, nicht die
  Dateizuordnung.
- Wird die Zielreferenz nicht ausdrücklich gewählt, entscheidet der Normgeber
  des Ausgangsgesetzes unter namensgleichen Gesetzen: bei `de-bw` BW vor Bund vor
  EU, bei `de-bund` Bund vor EU, bei `eu` nur EU; bei anderen oder fehlenden
  Normgebern Bund vor EU, danach alphabetisch. Gespeichert wird die vollständige
  Zielreferenz. Ein später fehlendes Ziel wird als Konflikt gemeldet, nicht
  durch ein namensgleiches Gesetz ersetzt.
- Ein Verweis auf ein ganzes Gesetz (z. B. „GG“) hat keine konkrete Zielnorm:
  `<verweisziel>` bleibt der Container, enthält aber `<gesetz>` (auch beim Ausgangsgesetz)
  ohne `<bezeichnung>` und `<elementstand>`. Das ist von der **pauschalen
  Verweismarkierung** ([GLOSSAR](../../GLOSSAR.md)) zu unterscheiden: Diese hat an
  der Ausgangsstelle keinen Bezugstext, kann aber eine konkrete Zielnorm zitieren.
- Ein Verweis hat null oder mehr `<verweisziel>`-Einträge. Reine Zusatzinformation
  ohne Normbezug (z. B. „Abs. 3“ allein) bleibt einfacher Verweistext; sie wird
  nicht als Verweisziel gespeichert und ist nicht klickbar. Bei „Trotzdem
  speichern“ einer konkreten Zielnorm fehlt nur `<elementstand>`.
- Das bisherige `<zielnorm>`-Format wird als Befund abgelehnt, ebenso Ziele ohne
  Gesetz und Bezeichnung, fehlende Zeichenbereiche sowie überlappende oder
  außerhalb des Verweistextes liegende Bereiche.
- Im Modell tragen Markierungen vollständige Gesetzesreferenzen; ein fehlendes
  Zielgesetz eines `Verweisziel` bedeutet das eigene Gesetz.

### Bezeichnungen

Favoriten, Lesezeichen, Ausgangsstellen und Verweisziele von Markierungen
sowie Markierungskonflikte speichern die volle Normbezeichnung wie im Zitat
ohne Gesetzesangabe und ohne Zusatzattribut: `§ 433`, `Art. 1`, `Anhang 1`,
`Art. 229 § 3`, `E25`. Bei einer Norm unter einem Gliederungsartikel stehen
Artikelbezeichnung, ein Leerzeichen und Normbezeichnung zusammen. Die Schreibweise
der Quelle bleibt erhalten, auch `§3` ohne Abstand; gebildet wird sie gemeinsam
über `vollstaendigeBezeichnung`. Überschriften verwenden stattdessen genau eine
`<gliederungskennzahl>` mit dem Muster `([0-9]{3})+`.
Diese Form verbindet die unabhängig gespeicherten Bestände ohne Präfixliste.

Vergleich und Auflösung bleiben tolerant gegenüber bekannten Präfixvarianten,
Leerraum und Sammelbezeichnungen. Ein Ziel ohne Präfix, etwa `6` bei „Trotzdem
speichern“, ist zulässig, wird aber nur bei eindeutigem Treffer zugeordnet.
Kurzformen wie `433` und `229 3` dienen ausschließlich der Seitenleistenanzeige
und der Sperre mehrdeutiger Kurzformen beim Hinzufügen von Favoriten oder
Lesezeichen; gespeichert und aufgelöst wird die volle Bezeichnung.

### Zeitstempel

`<erstellt>` steht an allen neu erzeugten Markierungen, `<geaendert>` zusätzlich
nach einer inhaltlichen Änderung an Kommentar oder Verweismarkierung.
Beide sind Kindelemente am Ende der Markierung, ISO-8601 in UTC mit `Z`,
sekundengenau und ohne Millisekunden. Verschmelzen und Zerschneiden von
Unterstreichungen oder Hervorhebungen setzt `erstellt` für die neuen Bereiche neu.
Jede Änderung am XML eines Kommentars oder Verweises außer den beiden
Zeitfeldern setzt `geaendert`, auch Bearbeiten, Umwandeln des Bezugs, Importabgleich,
Undo/Redo und Konfliktabgleich von Elementständen oder Verknüpfungen.
Unveränderte Inhalte setzen keinen neuen Änderungszeitpunkt. Eine zentrale
Gleichheits- und Stempelfunktion erfasst die Schreibwege; die Ursprungszeit bleibt
beim Bearbeiten erhalten. Fehlende oder ungültige Zeitfelder werden beim Lesen
nicht ergänzt; sie machen den sonst lesbaren Eintrag nicht unlesbar.

### Elementstand

Kommentare und Verweismarkierungen haben entweder Textbezug (`textstelle` und
`bezugstext`) oder sind pauschal; beides zugleich gibt es nicht. Eine pauschale
Markierung speichert bei einer vorhandenen, eindeutig zugeordneten Ausgangsstelle den
amtlichen Titel und die Textlänge als Elementstand:

```xml
<kommentar>
    <bezeichnung>§ 433</bezeichnung>
    <elementstand><titel>Vertragstypische Pflichten beim Kaufvertrag</titel><textlaenge>842</textlaenge></elementstand>
    <kommentartext>Kommentar zur gesamten Norm.</kommentartext>
</kommentar>
```

- Wechsel zum Textbezug entfernt den Stand; Wechsel zurück zur pauschalen
  Markierung berechnet ihn frisch. Pauschale Markierungen benötigen immer einen Stand.
- Überschriften speichern Titel und Zeichenzahl von Bezeichnung plus Titel; nichtamtliche Titel gehen nicht in
  den amtlichen Vergleichstitel ein.
- Bei konkreten Zielnormen ist `<elementstand>` (Titel falls vorhanden, Textlänge
  der Zielnorm) der Regelfall; ein Verweis auf ein ganzes Gesetz hat keinen.
- Der Vergleich ist bewusst grob (Titel und Länge, keine Prüfsumme): gleich lange
  Textänderungen bleiben unbemerkt, bloße Längenänderungen können einen
  Hinweis auslösen. Er prüft keine inhaltliche Gleichwertigkeit.

### Eingangskontrolle und Befunde

Der Leser liefert lesbare Einträge und Befunde getrennt zurück. Ein Eintrag
entfällt mit Befund, wenn seine Ausgangsstelle fehlt, mehrfach angegeben ist
oder eine ungültige Gliederungskennzahl trägt. Unterstreichungen und
Hervorhebungen brauchen `textstelle`, gültige ganzzahlige Zeichengrenzen und
`bezugstext`. Kommentare und Verweismarkierungen mit vorhandenem, aber defektem
Textbezug werden ebenfalls abgelehnt; sie werden nicht pauschal umgedeutet.
Kommentare benötigen genau ein `<kommentartext>`-Element; dessen Inhalt darf leer sein.
Verweismarkierungen benötigen genau einen lesbaren `<verweisinhalt>`. Kommentartext
ist nur bei Kommentaren, Verweisinhalt nur bei Verweismarkierungen zulässig.
Befunde nennen Fall, Markierungstyp und Ausgangsstelle, keine Nutzertexte.

In XML 1.0 unzulässige Zeichen in Kommentartext und Verweistext werden beim
Übernehmen in den Eintrag 1:1 ersetzt, sodass Länge und Zeichenbereiche gleich
bleiben: vertikaler Tabulator (U+000B, etwa der manuelle Zeilenumbruch aus
Word) und Seitenvorschub (U+000C) durch einen Zeilenumbruch, einzelne
Surrogate durch U+FFFD, übrige durch ein Leerzeichen
([ersetzeUnzulaessigeXmlZeichen](../../../src/lib/utils/xmlVerarbeitung.ts)).
Dateien, die solche Zeichen dennoch enthalten, werden nicht repariert
([Schutz vor Datenverlust](../schutz-vor-datenverlust.md#unlesbar-geschriebene-markierungsdatei)).

Weitere abgelehnte Fälle:

- `<bereich>` zusammen mit Absatz, Unterabsatz, Satz oder Eintragskette;
  unbekannter Bereich; zweiter `<satz>` ohne Eintragskette (Satz im Eintrag ohne
  Kette); ungültige oder mehrfach angegebene Pfadstufen; negative Zeichengrenzen
  oder Start nach Ende.
- Kommentar ohne `<kommentartext>`; mehrfacher Kommentartext oder Verweisinhalt;
  Kommentartext an anderen Markierungstypen sowie Verweisinhalt an anderen
  Markierungstypen.

Widersprüchliche Textpfade ergeben `textpfadUngueltig`, ungültige Zeichengrenzen
`textbezugUngueltig`. In der abgeleiteten Konfliktdatei werden solche Einträge
verworfen; der vollständige Neuaufbau ermittelt die Konflikte erneut.

Beim normalen Laden wird eine Datei mit Befunden unter derselben Dateisperre
frisch gelesen und vollständig als `.bak` gesichert. Ausschließlich die lesbaren
Einträge der tatsächlich gesicherten Fassung werden sofort zurückgeschrieben.
Eine Sammelmeldung nennt die Anzahl, höchstens drei Ausgangsstellen und die
Sicherung. Ein zweites Laden bleibt still; parallele Fenster sichern und melden
nur einmal. Gültige Dateien werden weiterhin ohne Sperre gelesen.

Sicherungs- und Schreibfehler beenden den Ladevorgang mit einer Fehlermeldung,
gegebenenfalls unter Nennung der vorhandenen Sicherung. Es gibt keinen leeren
Ersatzbestand und keine Erfolgsmeldung. Zwischen Beiseitelegen und Rückschreiben
besteht weiterhin ein kurzes Zeitfenster ohne Originaldatei.

Der strikte Prüfweg bleibt schreibfrei und behandelt Befunde wie eine
beschädigte Datei. Die Quellheilung nutzt danach den normalen Sicherungsweg und
bestätigt den bereinigten Zustand strikt. Beim Dateiimport und Ersetzen werden
Befunde gemeldet und nur lesbare Einträge übernommen; die Importquelle bleibt
erhalten, eine `.bak` wird dafür nicht angelegt. Der Formatumbau vor dem Release
behält `version="1"`; spätere neue gespeicherte Angaben erfordern gemäß den
[Versionsregeln](../xml-formate.md) eine höhere Version.

### Zeichenkoordinaten und Textpfad

Intern bündelt `Textstelle` den `Textpfad` unter `pfad` und die beiden Grenzen
`zeichenbereichStart` und `zeichenbereichEnde`. Markierungen, Historienzustände und
Konfliktidentifikation tragen diesen gebündelten Textbezug; `bezugstext` bleibt
ein eigenes Feld. Die Ausgangsstelle unterscheidet Norm,
Erwägungsgrund und Überschrift. XML-Leser und -Schreiber übersetzen an der Dateigrenze.
Der Textpfad unterscheidet Bereich und Normtext. Bereichspfade tragen genau
Bezeichnung, amtlichen Titel oder nichtamtlichen Titel; sie enthalten keine
Normtextadresse. Normtextpfade enthalten optional Absatz, numerischen
Absatzwiederholungsindex, Unterabsatzbezeichnung als unveränderte Zeichenkette
und äußeren Satz. Ein Listeneintrag trägt eine nicht leere Kette; nur mit dieser
Kette ist ein Satz im Eintrag zulässig. Die Lage der `<satz>`-Tags vor bzw. nach
der Kette bleibt die Kodierung des äußeren bzw. inneren Satzes.
Die feste Pfadreihenfolge lautet: Absatz, Unterabsatz, äußerer Satz,
Listenkette, Satz im Eintrag, Zeichenbereich; die einzelnen optionalen Stufen
dürfen fehlen. Ein Bereich steht stattdessen allein vor dem Zeichenbereich.
Das Schema sichert diese Reihenfolge. Konfliktidentitäten berücksichtigen den
Fall der Ausgangsstelle und die volle Bezeichnung.

Ein fehlender Satz-Schritt im Textpfad bedeutet Satz 1. Das gilt für den äußeren
Satz eines Absatzes oder Unterabsatzes ebenso wie für den Satz im Listeneintrag.
Der GesetzesXML-Schreiber lässt bei genau einem Satz den `<satz>`-Wrapper weg;
bei mehreren Sätzen schreibt er je einen Wrapper. Deshalb sind ein fehlender
Satz-Schritt und Satz 1 bei Auflösung und Pfadvergleichen gleichwertig.
Das Anfügen oder Streichen anderer Sätze lässt den Bezug auf einen unveränderten
ersten Satz bestehen. Der gespeicherte Bezugstext wird weiterhin geprüft;
ein vorangestellter neuer Satz oder ein entfallener Satz 2 bleibt ein Konflikt.

Zählregeln für `start`/`ende`: [Textaufbereitung](textaufbereitung.md#zeichenkoordinaten).

- `<textstelle><zeichenbereich>` bezieht sich auf das durch den Textpfad ausgewählte
  Textblatt der Ausgangsstelle (bzw. Titel oder Bezeichnungsfeld), nicht auf den
  gesamten Normtext oder den gespeicherten Bezugstext. Haupttext und Fortsetzung
  eines Textblatts bilden gemeinsam den Zeichenbereich; der Text untergeordneter
  Listeneinträge zählt nicht mit. Maßgeblich ist der dargestellte Text nach der
  Textaufbereitung.
- `<verweistextZeichenbereich>` bezieht sich auf `<verweistext>` des zugehörigen
  `<verweisinhalt>`; die Bereiche der Verweisziele liegen innerhalb dieses Textes, überlappen nicht und dürfen Lücken lassen.
- Dieselbe Bedeutung gilt in den Markierungskonflikten.
- Schreiber verwenden `start` vor `ende` und selbstschließende Tags mit
  doppelten Anführungszeichen. Leser tolerieren zusätzlich Leerraum innerhalb
  dieser Tags (auch um `=` und vor `/>`) und vertauschte Attributreihenfolge.

Absatz-, Nummer- und Litera-Labels werden wörtlich wie im GesetzesXML
gespeichert; es erfolgt keine Normalisierung. Eine geänderte Schreibweise
im GesetzesXML führt bei betroffenen Markierungen zu Markierungskonflikten.

Weitere optionale Felder in `<textstelle>` (auch in Markierungskonflikten):

- `<absatz wiederholung="2"/>` adressiert das dritte Vorkommen eines
  unnummerierten Absatzes innerhalb derselben Norm. Der 0-basierte Index zählt
  sämtliche Absätze mit gleicher Bezeichnung gemeinsam, einschließlich
  Zwischenüberschriften. Bei nummerierten Absätzen steht die Bezeichnung als
  Textinhalt, etwa `<absatz wiederholung="1">(1)</absatz>`. Beim ersten
  Vorkommen entfällt das Attribut; `undefined` und 0 sind intern gleichwertig.
  Ohne Bezeichnung wird das Element nur bei einer Wiederholung geschrieben.
  Der Index dient ausschließlich der eindeutigen Adressierung und erscheint
  weder im Rechtstext noch im Zitat. MarkierungskonflikteXML verwendet dieselbe
  Textpfad-Serialisierung.
- `<unterabsatz>[1]</unterabsatz>` nach dem äußeren Absatz: übernimmt die
  Bezeichnung aus `unterabsatz/@zahl` unverändert (nichtleerer Text).
- `<satz>1</satz>` vor der Listenkette ist der äußere Satz, `<satz>2</satz>`
  nach der Listenkette der Satz im Listeneintrag; beide können gemeinsam
  vorkommen (z. B. `…<unterabsatz>[2]</unterabsatz><satz>1</satz><nummer>1.</nummer><litera>a)</litera><satz>2</satz>…`:
  zweiter Satz im Eintrag a von Nummer 1, im ersten äußeren Satz des zweiten
  Unterabsatzes).
- Beliebig tiefe Folge von `<nummer>`/`<litera>` in Pfadreihenfolge;
  `wiederholung` nur bei einem positiven Wiederholungsindex.
- `<bereich>` enthält `amtlicher-titel`, `nichtamtlicher-titel` oder
  `bezeichnung`; fehlt das Feld, liegt die Markierung im Normtext. Es wird nur
  geschrieben, wenn der Bezug außerhalb des Normtextes liegt. Im Modell heißt
  die Auswahl `Textpfad.bereich`, im DOM `data-bereich`; das abgeleitete
  Kennzeichen für einen ergänzten Normtitel heißt `titelIstNichtamtlich`.

## Markierungskonflikte

Aktionen, Gruppierung und Fehlerverhalten: [Konfliktübersicht](../markierungskonflikte.md).
Lesen und Bauen der ganzen Datei samt Wurzel:
[markierungskonflikteXML.datei.ts](../../../src/lib/markierungen/markierungs-xml/markierungskonflikteXML.datei.ts)
im Submodul `markierungs-xml`, das allein MarkierungsXML und MarkierungskonflikteXML liest und schreibt.
Dateizugriff, Konfliktdateisperre und Meldungen liegen in
[markierungskonflikteSpeicher.dateiZugriff.ts](../../../src/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff.ts). Dateiname: `markierungskonflikte.xml` (AppData-Wurzel).

Ausgangs- und Zielgesetze sind vollständige Gesetzesreferenzen (Normgeber und
Kurztitel; Vergleich gemäß [Gesetzesreferenz](gesetz.md#normgeber-und-gesetzesreferenz)); die
XML-Zuordnung trägt beides; der Normgeber ist Pflicht. Konflikte ohne Normgeber
werden als abgeleitete Daten verworfen. Eine ausdrücklich gewählte, fehlende Zielreferenz
bleibt erhalten.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<markierungskonflikte version="1" pruefstatus="aktuell">
    <gesetz kurztitel="StGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz>
    <gesetz kurztitel="BGB" normgeber="de-bund">
        <konflikt typ="nichtamtliche-titel-xml-fehlt"/>
        <unterstreichung>
            <konflikt typ="bezugstext-fehlt-oder-unpassend"/>
            <bezeichnung>§ 6</bezeichnung>
            <textstelle><absatz>(1)</absatz><zeichenbereich start="12" ende="34"/></textstelle>
        </unterstreichung>
        <verweismarkierung>
            <konflikt typ="pauschaler-bezug-unpassend"/>
            <konflikt typ="ziel-norm-unpassend" gesetz="PolG" normgeber="de-bw"/>
            <konflikt typ="ziel-norm-fehlt" gesetz="PolG" normgeber="de-bw"/>
            <bezeichnung>Art. 229 § 3</bezeichnung>
            <verweistext>§§ 7, 8 PolG</verweistext>
        </verweismarkierung>
    </gesetz>
</markierungskonflikte>
```

Der Aufbau ist Gesetz → Markierung → Konflikt: Gesetzesebenen-Konflikte stehen
direkt unter `<gesetz>`, andere im gemeinsamen Tag der Markierungsart (`<unterstreichung>`, `<hervorhebung>`,
`<kommentar>` oder `<verweismarkierung>`) für
dieselbe Markierung. Konflikttypen stehen als `typ` am leeren `<konflikt>`;
Zielkonflikte tragen zusätzlich `gesetz` und `normgeber`. Nach den Konflikten
folgen Ausgangsstelle und Textstelle beziehungsweise bei pauschalen Markierungen
Verweistext oder Kommentartext. Es gibt keine zusätzliche Kennung und kein
Kindelement für den Markierungstyp.

- Die Datei ordnet Markierungen nach Ausgangsstelle und Textposition.
  Pro Markierung und Zielgesetz steht höchstens ein Konflikt je Typ: zuerst
  `ziel-norm-unpassend`, dann `ziel-norm-fehlt` (auch bei nicht eindeutigen Zielen).
  `ziel-gesetz-fehlt` schließt beide aus; Zielgesetze folgen ihrem ersten
  Vorkommen im Verweis. Ein eigener Bezugskonflikt steht zuerst.
- Konflikttypen: `gesetz-fehlt`, `nichtamtliche-titel-xml-fehlt`,
  `bezugstext-fehlt-oder-unpassend`, `pauschaler-bezug-fehlt`,
  `pauschaler-bezug-unpassend`, `ziel-gesetz-fehlt`, `ziel-norm-unpassend`,
  `ziel-norm-fehlt`. Die drei eigenen Bezugskonflikte schließen sich aus.
- Die Ausgangsstelle folgt der [Bezeichnungsregel](#bezeichnungen). Bei
  Textbezug steht `<textstelle>`, bei pauschalem Verweis `<verweistext>`, bei
  pauschalem Kommentar `<kommentartext>`. Zielbezeichnungen und Elementstände bleiben
  ausschließlich im MarkierungsXML; die Anzeige liest sie dort frisch.
- Die Datei ist abgeleiteter Prüfstand. Ungültige Ausgangsstellen, unbekannte
  Markierungstypen oder defekte Textbezüge werden verworfen. Ein vollständiger
  Neuaufbau ermittelt die Konflikte erneut; Konflikte zu nicht geladenen
  Markierungen bleiben nicht erhalten.

### Prüfstatus

`pruefstatus` am Wurzelelement ist im aktuellen Schema Pflicht:

| Wert             | Bedeutung                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `aktuell`        | Die erforderlichen Prüfungen sind erfolgreich abgeschlossen und der Befund ist gespeichert. Auch ein aktueller Stand kann Konflikte enthalten. |
| `ausstehend`     | Eine prüfpflichtige Änderung oder eine vollständige Prüfung ist noch offen; vorhandene Befunde können überholt sein.                           |
| `fehlgeschlagen` | Eine Quellenoperation, Prüfung oder deren Abschluss ist fehlgeschlagen; vorhandene Befunde belegen keinen aktuellen Stand.                     |

Fehlt die Datei oder das Attribut, oder ist der Status unbekannt, verlangt der
Laufzeitleser eine vollständige Prüfung. Ein gespeichertes `ausstehend` ohne
noch laufenden zugehörigen Vorgang gilt als unterbrochen und verlangt ebenfalls
eine vollständige Prüfung. Eine Teilprüfung hebt einen Fehlerstand nicht auf;
dazu ist eine erfolgreiche vollständige Prüfung erforderlich.

Auch ohne Konflikte wird die Datei mit Status geschrieben. **Nur eine leere
Konfliktliste mit `aktuell` bestätigt Konfliktfreiheit nach den bestehenden
Prüfkriterien.** Eine fehlende Datei oder leere Liste mit anderem Status tut das
nicht. Prüfstatus und Befunde werden gemeinsam atomar geschrieben.

Bei Status- und Befundänderungen bleiben unbekannte Wurzelattribute (außer den
verwalteten `version` und `pruefstatus`) und zusätzliche Wurzelkinder erhalten.
Unveränderte Gesetzesblöcke bleiben wörtlich erhalten; beim Neuaufbau eines Blocks
werden seine unbekannten Metadaten nicht übernommen. Das ist keine allgemeine
Garantie, unbekannte Angaben an jeder Stelle zu bewahren.

Auslöser, selektive Prüfung und vollständige Neuprüfung:
[Prüfabläufe](../markierungskonflikte.md#prüfabläufe).
