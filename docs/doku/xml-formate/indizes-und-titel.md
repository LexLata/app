# Importindex, nichtamtliche Titel, Datenbankindex, Grundbestand und PräfixstrukturXML

Teil der [XML-Formate](../xml-formate.md).

## Importindex

Bau: [src/lib/import/importindex/importindexErstellung.ts](../../../src/lib/import/importindex/importindexErstellung.ts). Dateinamen:
`importindizes/de-bund.xml`, `importindizes/de-bw.xml`, `importindizes/eu.xml`.

Der Importindex Europarecht verwendet die Quelle `eur-lex.europa.eu` und als
`abrufkennung` die CELEX-Nummer des Basisakts. Der mitgelieferte Startstand enthält einen
vollständigen Index; die kuratierte Europa-Liste ersetzt beim Lesen Angebote mit gleicher
CELEX und ergänzt fehlende Akte. Der abgeleitete Kurztitel bleibt im Suchbestand
zusätzlich suchbar; angezeigt wird der kuratierte Kurztitel. Das Referenzverzeichnis
bleibt auf kuratierte Angebote und EMRK beschränkt. Das optionale Attribut
`gesetz/@typ` bezeichnet den Dokumenttyp: `verordnung`, `richtlinie`,
`durchfuehrungsverordnung`, `durchfuehrungsrichtlinie`,
`delegierte-verordnung` oder `delegierte-richtlinie`. Bei kuratierten
Angeboten wird dieser Typ durch die Überlagerung entfernt.

EU-Recht wird aus EUR-Lex importiert. Das Bundle-Verzeichnis
`src-tauri/resources/europa/` enthält ausschließlich `europaKuratiert.json`
(kuratierte EU-Angebote mit CELEX-Abrufkennung) und `EMRK_europarat.xml`
(Kurztitel `EMRK`, Normgeber `europarat`). Das Referenzverzeichnis führt beide
Quellen zusammen; EMRK wird weiterhin aus dem Bundle importiert.

Die kuratierte JSON-Liste enthält je Eintrag `celex`, `kurztitel`, optional
`alternativen` und `langtitel`. Alle Pflichtfelder sind nichtleere Zeichenketten;
`alternativen` ist, falls vorhanden, eine nichtleere Liste nichtleerer Zeichenketten.
Jede CELEX-Nummer ist eindeutig. Alle Kurztitel und Alternativbezeichnungen der
Liste sind auch ohne Beachtung von Groß-/Kleinschreibung und äußerem Leerraum
paarweise verschieden. Ein Verstoß verwirft die ganze Liste mit Diagnose;
unbekannte zusätzliche Felder werden ignoriert.

Alternativbezeichnungen betreffen ausschließlich Trefferberechnung und -anzeige des Öffnen-Overlays;
Gesetzesreferenzen und Verweiserkennung verwenden weiterhin nur den Kurztitel.
Die Trefferberechnung gleicht Kurztitel, vollständige Alternativbezeichnungen und abgeleitete
EU-Namen gleichrangig am Ende der Eingabe ab; der längste passende Name gewinnt.
Nur beim Fund über eine Alternative zeigt die Trefferzeile deren gepflegte Schreibweise.
Normangaben davor bleiben erhalten; Import und Navigation verwenden den Kurztitel.

Die manuelle Prüfung `node scripts/werkzeuge/pruefe-europa-kuratiert.mjs`
prüft Parser, Schema und Format des EU-Startindex, fehlende CELEX-Nummern und
Namenskollisionen mit Bund/BW sowie abgeleiteten EU-Namen. Nach Überlagerung des
echten Startindex prüft sie außerdem jeden Kurztitel und jede Alternative durch
das Öffnen-Overlay auf eindeutigen Rechtsakt und passende Anzeige. Sie schreibt den Bericht
nach `.reports/europa-kuratiert-diagnose.txt` und gehört nicht zu `npm run pruefen`.
Die Messung mit dem vollständigen Produktionsbestand bleibt separat aufrufbar:
`node scripts/werkzeuge/messe-europa-suchzeit.mjs` (Bericht `.reports/eu-suchzeit.json`).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<importindex version="1">
    <infos>
        <verarbeitungszeit herkunft="nutzer">2026-08-05T09:52:35Z</verarbeitungszeit>
        <normgeber>de-bund</normgeber>
        <datenquelle name="Gesetze im Internet"/>
    </infos>
    <inhalt>
        <gesetz>
            <langtitel>Bürgerliches Gesetzbuch</langtitel>
            <kurztitel>BGB</kurztitel>
            <abrufkennung>bgb</abrufkennung>
        </gesetz>
    </inhalt>
</importindex>
```

Eintrag im Landesrecht BW (Quelle `landesrecht-bw.de`):

```xml
<gesetz>
    <langtitel>Verordnung des Verkehrsministeriums über den Bau und Betrieb von Anschlußbahnen (BOA)</langtitel>
    <kurztitel>BOA</kurztitel>
    <abrufkennung>ABABauV</abrufkennung>
</gesetz>
```

### Lesevertrag der App

Die Wurzel trägt `version="1"`; `<inhalt>` enthält die Gesetzeseinträge.
`<infos>` enthält genau je einen direkten `<verarbeitungszeit>`, `<normgeber>`
und `<datenquelle>`. Der Normgeber muss zum Index passen. Das Schema erlaubt
Codes aus Kleinbuchstaben und Ziffern mit einzelnen Bindestrichen zwischen
Teilen (`[a-z0-9]+(-[a-z0-9]+)*`), höchstens 20 Zeichen, etwa `de-by`.
Die App unterstützt Importindizes für `de-bund`, `de-bw` und `eu`.
Die Datenquelle trägt den Anzeigenamen als `name` und optional eine bekannte `url`.
Neue Zeitstempel stehen ausschließlich im Kopf.

Das optionale Attribut `herkunft` an `<verarbeitungszeit>` unterscheidet
`nutzer` (durch einen Nutzerlauf erzeugt oder aktualisiert) und `standard`
(unverändert aus dem Bundle vorinstalliert). Die mitgelieferten Dateien tragen
`nutzer`; erst die Vorinstallation setzt beim Kopieren nach AppData `standard`.
Auch ein inhaltlich unveränderter Nutzerlauf setzt wieder `nutzer`.
Fehlt das Attribut, nimmt der Leser `nutzer` an.

| Angabe                | Bedeutung im Lesevertrag                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `<kurztitel>`         | Nichtleerer Kurztitel für Trefferberechnung, Anzeige und Gesetzesreferenz.                                     |
| `<langtitel>`         | Langtitel für Anzeige und Trefferberechnung; darf leer sein.                                                   |
| `<abrufkennung>`      | Nichtleere Kennung, unter der die Datenquelle das Gesetz zum Abruf bereithält; siehe unten.                    |
| `gesetz/@typ`         | Optionaler EU-Dokumenttyp mit den oben genannten sechs Werten.                                                 |
| `<infos>/<normgeber>` | Normgeber des gesamten Index; wird den gelesenen Angeboten zugeordnet.                                         |
| `praefixstruktur`     | Ergänzung des Lesemodells aus der separaten PräfixstrukturXML, kein gespeichertes Pflichtfeld des Importindex. |

Die Abrufkennung ist bei Gesetze im Internet der Verzeichnisname (`bgb`),
bei Baden-Württemberg das Permalink-Kürzel ohne `_BW` (`ABABauV`), bei EU-Recht
die CELEX-Nummer des Basisakts. Bei einer mitgelieferten Ressource wie EMRK ist
sie deren Dateiname. Die Importer bilden daraus den jeweiligen Abruf.
Die Abrufkennung ist **nicht je Eintrag eindeutig**: Ein BW-Permalink kann
mehrere gültige Fassungen mit unterschiedlichen Titeln bereitstellen.
Bei neu gefundenen BW-Einträgen ohne guten Permalink kann ausnahmsweise der
vollständige Link `https://www.landesrecht-bw.de/perma?d=…` mit
`permalinkArt="schlecht"` stehen; dieser Befund verlangt manuelle Prüfung.

### Pflegeattribute

Die folgenden Angaben nutzt nur die Erstellung und Aktualisierung des Index.
Der schlanke App-Leser wertet sie nicht aus; attributerhaltende BW-Abgleiche
bewahren sie. BW-Abgleiche nutzen `bwZusatz` zusätzlich zur Sortierung.

| Attribut und Ort                    | Bedeutung                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gesetz/@kurztitelArt="nummeriert"` | Informative Kennzeichnung eines nummerierten, schlecht auffindbaren Kurztitels.                                                                                                                                                                                                                                                                          |
| `gesetz/@permalinkArt="schlecht"`   | Das Nachladen des guten BW-Permalinks ist fehlgeschlagen; die Abrufkennung enthält noch den ursprünglichen vollständigen Link.                                                                                                                                                                                                                           |
| `gesetz/@duplikatArt`               | `eg`: Bei gleicher Abrufkennung und gleichem Langtitel wurde die mit `EG` beginnende Variante behalten, die mit `EG` endende verworfen (Bund). `unaufgeloest`: Weitere Einträge derselben Abrufkennung bleiben erhalten und sind zur Prüfung markiert.                                                                                                   |
| `gesetz/@duplikatVon`               | Zusammen mit `duplikatArt`: Kurztitel des verworfenen Eintrags (`eg`) beziehungsweise des ersten Eintrags derselben Abrufkennung (`unaufgeloest`).                                                                                                                                                                                                       |
| `kurztitel/@bwZusatz`               | Vom ursprünglichen Kurztitel abgetrennter Zusatz wie `BW 2013`; der Elementtext enthält nur den gekürzten Kurztitel.                                                                                                                                                                                                                                     |
| `kurztitel/@kurztitelDuplikat`      | Abrufkennung eines anderen Eintrags, dessen Kurztitel mit dem nach Abtrennung des BW-Zusatzes gekürzten Titel kollidiert.                                                                                                                                                                                                                                |
| `kurztitel/@kurztitelOriginal`      | Unkorrigierter Kurztitel vor einer hinterlegten Titelkorrektur, gegebenenfalls bereits ohne BW-Zusatz.                                                                                                                                                                                                                                                   |
| `aktualisierung`                    | Am `<gesetz>` kennzeichnet `neu` eine Ergänzung. An geänderten `<kurztitel>`- und/oder `<langtitel>`-Elementen bezeichnet `kurztitel`, `langtitel` oder `beide` die geänderten Felder. `leerzeichen-entfernt` am Langtitel kennzeichnet die automatische Bereinigung von Leerzeichenfehlern. Der gemeinsame Indexschreiber erzeugt diese Hinweise nicht. |
| `gesetz/@moeglicherweiseEntfernt`   | Datum (`YYYY-MM-DD`), seit dem der BW-Abgleich einen bisherigen Eintrag nicht mehr gefunden hat. Ein Wiederauftauchen beziehungsweise eine zugeordnete Umbenennung entfernt den Hinweis; der Eintrag wird nicht automatisch gelöscht.                                                                                                                    |

## Nichtamtliche Titel

Nur Parse, die App baut diese Dateien nie: [src/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.ts](../../../src/lib/persistenz/gesetz/nichtamtliche-titel/nichtamtlicheTitelSpeicher.ts).
Quelle: Ressourcen-Content unter `src-tauri/resources/nichtamtliche-titel/{normgeber kleingeschrieben}/{Kurztitel kodiert}.xml`
oder Datei-Import. In AppData liegen sie unter
`nichtamtliche-titel/{Kurztitel}_{Normgeber}-nichtamtliche-titel.xml`.
Speicheroperationen erhalten die vollständige Gesetzesreferenz.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<nichtamtlicheTitel version="1">
    <infos>
        <gesetz normgeber="de-bund">BGB</gesetz>
        <geaendert>2026-05-26T00:00:00Z</geaendert>
    </infos>
    <inhalt>
        <norm>
            <bezeichnung>§ 433</bezeichnung>
            <titel>Kaufvertrag</titel>
        </norm>
    </inhalt>
</nichtamtlicheTitel>
```

- `<bezeichnung>` steht in voller Form (`§ 433`, `Art. 229 § 3`).
- Wurzel `nichtamtlicheTitel` (CamelCase-Ausnahme). `<geaendert>` ist der
  Bearbeitungszeitpunkt (Zeitstempelformat wie überall) und heißt nicht
  `<verarbeitungszeit>`, weil die App die Datei nicht erzeugt, sondern
  gepflegten Content übernimmt. Der Parser wertet das Feld nicht aus.
- Der Parser prüft `infos/gesetz` gegen das erwartete Gesetz, um fremden oder
  fehlzugeordneten Titelbestand zurückzuweisen; der Normgeber muss exakt und der Kurztitel
  ohne Beachtung der Groß-/Kleinschreibung übereinstimmen.

## Datenbankindex

Der Datenbankindex ist ein Entwurf und gehört nicht zu den Release-Verträgen.
Schreiber und App-Leser sind nicht implementiert; Schema und folgende Beispiele
beschreiben nur den vorgesehenen Aufbau von `datenbankindex.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<datenbankindex version="1">
    <infos>
        <verarbeitungszeit>2026-10-05T04:12:00Z</verarbeitungszeit>
    </infos>
    <inhalt>
        <gesetz>
            <kurztitel>BGB</kurztitel>
            <normgeber>de-bund</normgeber>
            <letzteNeuerung>2026-08-14T09:00:00Z</letzteNeuerung>
        </gesetz>
    </inhalt>
</datenbankindex>
```

- Pflicht: `version="1"`, `<infos>` mit `<verarbeitungszeit>` und `<inhalt>`.
  `<inhalt>` enthält beliebig viele `<gesetz>`-Einträge (auch keinen); jeder
  genau einen nichtleeren `<kurztitel>`, einen `<normgeber>` und eine
  `<letzteNeuerung>`.
- `<verarbeitungszeit>`: vorgesehener Erzeugungszeitpunkt der Datenbankindexdatei;
  der Vertrag sieht ein Neuschreiben nur bei inhaltlicher Änderung vor, damit
  bloßes Prüfen keine Änderungen in Git erzeugt. `<letzteNeuerung>`: letzte Inhaltsänderung des jeweiligen Gesetzes.
- Beide Zeitstempel sind gültige ISO-8601-Werte in UTC mit `Z`, sekundengenau,
  ohne Sekundenbruchteile (`YYYY-MM-DDTHH:mm:ssZ`); andere Zeitzonen und
  zonenlose Werte sind unzulässig. Zeitstempel stehen als Kindelemente, damit
  Änderungen in Git leichter erkennbar sind.
- `<normgeber>` folgt der Regel des [Gesetz-XML](gesetz.md#normgeber-und-gesetzesreferenz)
  (einschließlich `unbekannt`); Vergleiche folgen der dort beschriebenen Gesetzesreferenz.
- Unbekannte Attribute und zusätzliche Metadatenelemente sind wie im Importindex
  zulässig (`<infos>` ist der Platz für Zusatzangaben), ersetzen aber keine
  Pflichtfelder und erlauben keine doppelten bekannten Einzelangaben.

## Grundbestand

Kuratierte Liste der wichtigsten Gesetze je Normgeber für den
[Entwicklerlauf](../entwicklerlauf.md); dem Datenbankindex nachgebildet. Leser und
Abgleich (nur Entwicklerwerkzeug, nicht Teil der App): [scripts/werkzeuge/grundbestand.ts](../../../scripts/werkzeuge/grundbestand.ts).
Ablageort frei wählbar; mitgeliefert: [docs/doku/testdaten/wichtigste-gesetze.xml](../testdaten/wichtigste-gesetze.xml).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<grundbestand version="1">
    <infos>
        <geaendert>2026-11-18T12:00:00Z</geaendert>
    </infos>
    <inhalt>
        <bund>
            <gesetz>BGB</gesetz>
        </bund>
        <bw>
            <gesetz>LBO</gesetz>
        </bw>
        <eu>
            <gesetz>DSGVO</gesetz>
        </eu>
    </inhalt>
</grundbestand>
```

- Pflicht: `version="1"`, `<infos>` mit genau einem `<geaendert>` (von Hand gepflegter
  Zeitpunkt der letzten inhaltlichen Änderung der Liste; UTC mit `Z`, sekundengenau) und genau ein `<inhalt>`.
  Weitere Elemente in `<infos>` sind als Zusatzangaben zulässig.
- `<inhalt>` enthält höchstens je einmal `<bund>` (`de-bund`), `<bw>` (`de-bw`) und
  `<eu>` (`eu`); ein fehlendes Normgeberelement bedeutet, dass dieser Normgeber
  nicht verarbeitet wird. Andere Elemente sind unzulässig.
- Je Gesetz ein `<gesetz>` mit nichtleerem Kurztitel als Text. Innerhalb eines
  Normgebers sind die Kurztitel ohne Beachtung der Groß-/Kleinschreibung paarweise verschieden.
- Der Leser ist streng: Jeder Verstoß verwirft die ganze Liste mit Diagnose.
- Abgleich: Jeder Kurztitel muss für `de-bund` und `de-bw` genau einmal im
  jeweiligen Importindex stehen, für `eu` in der kuratierten Europa-Liste
  (Vergleich ohne Groß-/Kleinschreibung). Fehlende und mehrdeutige Kurztitel werden
  gemeldet; verwendet wird die Schreibweise des Importindex.

## PräfixstrukturXML

Interner Leser und Schreiber:
[src/lib/import/praefixstruktur/praefixstrukturXml.ts](../../../src/lib/import/praefixstruktur/praefixstrukturXml.ts).
Die Präfixstruktur ermöglicht die richtige Vorschau noch nicht importierter
Gesetze, etwa `1 GG` → `Art. 1 GG`. Die Dateien liegen unter
`src-tauri/resources/praefixstrukturen/de-bund.xml` beziehungsweise `de-bw.xml`.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<praefixstrukturen version="1">
    <infos>
        <verarbeitungszeit>2026-10-13T10:00:00Z</verarbeitungszeit>
        <normgeber>de-bund</normgeber>
    </infos>
    <inhalt>
        <gesetz>BGB</gesetz>
        <gesetz praefixstruktur="gliederungsartikel">EGBGB</gesetz>
        <gesetz praefixstruktur="artikel">GG</gesetz>
        <gesetz ermittlungsstatus="leer">LeerG</gesetz>
        <gesetz praefixstruktur="regel">KVR</gesetz>
        <gesetz praefixstruktur="nummer">PreisLS</gesetz>
        <gesetz praefixstruktur="unklar" diagnosegrund="nur-sonstige-bezeichnungen">UnklarG</gesetz>
    </inhalt>
</praefixstrukturen>
```

- Ein `<gesetz>` enthält den Kurztitel aus dem Importindex und entweder einen
  Strukturbefund oder einen Ermittlungsstatus (`leer` oder `gescheitert`). Nur bei einem
  Befund bedeutet fehlendes `praefixstruktur` den Wert `paragraph`. Werte,
  Status- und Diagnoseattribute sowie ihre Suchwirkung beschreibt die
  [zentrale Attributtabelle](../entwicklerlauf.md). BW darf keine
  Gliederungsartikel enthalten.
- Pflicht sind Version 1, je ein direktes `infos` und `inhalt`, im Kopf je
  ein `normgeber` und `verarbeitungszeit`. Das Schema erlaubt dieselben Normgeber-Codes wie der Importindex, etwa
  `de-by`. Die App unterstützt weiterhin ausschließlich `de-bund` und `de-bw`;
  ihr Leser verlangt den exakt zum erwarteten Dateinamen passenden Normgeber. Die Verarbeitungszeit ist
  UTC mit `Z`, sekundengenau; sie ändert sich nur bei inhaltlicher Änderung.
- `ermittlungsstatus`, `fehlerart` und `diagnosegrund` sind Werkzeugstatus,
  keine Aussagen über die Gültigkeit oder Vollständigkeit des amtlichen Textes.
  `ermittlungsstatus="leer"` bedeutet ein erfolgreich gelesenes, vollständig
  elementloses Darstellungsmodell; `gescheitert` einen fehlgeschlagenen Versuch.
  Beide stehen ohne Präfixstruktur. Nur `gescheitert` trägt eine `fehlerart`:
  `identifikation` (Zuordnung fehlgeschlagen), `tablink-zeitueberschreitung`
  (Zeitlimit beim Tab-Link-Abruf), `keine-normen` (keine Normen gefunden) oder
  `gesetz-laden` (sonstiger Fehler beim Laden).
- `diagnosegrund` steht optional bei `praefixstruktur="unklar"` und bezeichnet
  den automatisch festgestellten Befund: `keine-elemente`, `nur-ueberschriften`,
  `keine-zaehlbaren-normen`, `unbezeichnete-normen`,
  `nur-sonstige-bezeichnungen`, `gemischte-praefixe` oder
  `sonstige-bezeichnungen`. Er hat keine eigene Suchwirkung und ist keine
  gesicherte Aussage über die Ursache in der Quelle.
- Der Standardwert „Paragraph“ wird durch Weglassen von `praefixstruktur`
  geschrieben; `praefixstruktur="paragraph"` ist im Schema nicht zulässig.
- Schlüsselvergleich ohne Beachtung der Groß-/Kleinschreibung; ein umbenannter
  Kurztitel gilt wieder als ungeprüft. Der Schreiber sortiert nach
  kleingeschriebenem Kurztitel, bei Gleichheit nach Original; verglichen wird
  in einfacher Zeichenreihenfolge ohne Spracheinstellungen.
- Der Leser ignoriert leere Kurztitel und liest bei Duplikaten den ersten
  Eintrag mit Warnung. Ein unbekannter Attributwert ergibt `unklar` mit
  Warnung. Falsche Version, falscher Normgeber, ungültiger Kopf oder
  Gliederungsartikel in BW machen die Datei ungültig. Unbekannte Elemente
  werden ignoriert; bekannte Einträge werden nur als direkte Kinder gelesen.
- Das Schema prüft den gültigen Formatbestand; Ressourcenprüfungen prüfen
  zusätzlich Dateinamen, Normgeber, Duplikate und Sortierung. Ein fehlendes
  Ressourcenverzeichnis ist erlaubt. Begriffe und Bestimmung:
  [Präfixstruktur](../entwicklerlauf.md).
