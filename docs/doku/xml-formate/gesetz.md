# Gesetz (kanonisch)

Teil der [XML-Formate](../xml-formate.md). Bau: [src/lib/import/basis/gesetzesXMLBauer.ts](../../../src/lib/import/basis/gesetzesXMLBauer.ts),
[xmlSerialisierung.ts](../../../src/lib/import/basis/xmlSerialisierung.ts). Parse: [src/lib/darstellung/gesetzesXMLParser.ts](../../../src/lib/darstellung/gesetzesXMLParser.ts).
Fließtextregeln: [Textaufbereitung](textaufbereitung.md).

## Lese- und Schreibschema

Das [Leseschema](../../schema/gesetz.rng) schützt bekannte Angaben und erlaubt
unbekannte Elemente und Attribute an Erweiterungsstellen. Das zusätzliche
[Schreibschema](../../schema/gesetz-schreibschema.rng) beschreibt den vollständigen
Neuaufbau durch den GesetzesXML-Bauer: ausschließlich bekannte Kopfangaben,
Überschriften und Normen sowie die erzeugten Textstrukturen. Normen benötigen
eine `id`, Gliederungskennzahlen bestehen aus Dreierblöcken; die Werte von
`status`, Norm-`typ` und Absatz-`typ` sind auf `weggefallen`,
`erwaegungsgrund` und `zwischenueberschrift` beschränkt.

Innerhalb von `<text>` stehen entweder Absätze, Unterabsätze, Sätze oder
Fließtext mit Inline-Elementen und gegebenenfalls Listen. Verschiedene
Blockarten dürfen nicht als Geschwister gemischt werden. Absätze können
Unterabsätze, diese Sätze enthalten; Sätze enthalten Text und geschachtelte
Nummern/Litera, deren Einträge wiederum Sätze enthalten können. Ein Absatz
oder ein weiterer Satz innerhalb eines Satzes ist ausgeschlossen. Als
Inline-Elemente sind `<verweis>` und `<zeilenumbruch>` vorgesehen.

Die Nachbereitung schreibschemakonformer Dateien bleibt schreibschemakonform.
Sie erhält aber auch unbekannte Angaben tolerant gelesener Dateien. Solche
Ausgaben müssen nur dem Leseschema entsprechen; die Nachbereitung ist kein
vollständiger Neuaufbau des gesamten Dokuments. Beide Schemas werden in Tests
geprüft, nicht beim Öffnen eines Gesetzes in der App.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gesetz version="1">
    <infos>
        <langtitel>Bürgerliches Gesetzbuch</langtitel>
        <kurztitel>BGB</kurztitel>
        <fundstelle>BGBl. I S. 42</fundstelle>
        <ausfertigung>1896-08-18</ausfertigung>
        <stand>
            <aenderungsvermerk>Zuletzt geändert durch …</aenderungsvermerk>
            <neugefasst>Neugefasst durch Bek. v. 2.1.2002 I 42, 2909</neugefasst>
        </stand>
        <datenquelle name="Gesetze im Internet"/>
        <normgeber>de-bund</normgeber>
        <!-- optional; kein Importer schreibt es, nur von Hand bei
             fremdsprachigen Texten: -->
        <sprache>de</sprache>
        <verarbeitungszeit>2026-09-20T10:15:30Z</verarbeitungszeit>
        <letzteNeuerung>2026-09-18T08:00:00Z</letzteNeuerung>
    </infos>
    <inhalt>
        <gliederung gliederungskennzahl="001">
            <bezeichnung>Buch 1</bezeichnung>
            <titel>Allgemeiner Teil</titel>
        </gliederung>
        <norm id="433">
            <bezeichnung>§ 433</bezeichnung>
            <titel>Vertragstypische Pflichten beim Kaufvertrag</titel>
            <text>
                <absatz zahl="(1)">
                    <satz zahl="1">Durch den Kaufvertrag wird der Verkäufer
                        einer Sache verpflichtet, dem Käufer die Sache zu
                        übergeben, siehe auch
                        <verweis norm="§ 434">§ 434</verweis>.
                        <zeilenumbruch/>Weiterer Satzinhalt.</satz>
                    <nummer zahl="1.">
                        <satz zahl="1">Ein Listeneintrag.</satz>
                        <satz zahl="2">Innerer Satz eines Listeneintrags.</satz>
                    </nummer>
                    <litera buchstabe="a)">Untereintrag.</litera>
                </absatz>
            </text>
            <fussnoten>Freitext-Fußnote zur gesamten Norm.</fussnoten>
        </norm>
    </inhalt>
</gesetz>
```

Weitere Strukturbeispiele (aus verschiedenen Gesetzen, kein zusammengehöriger
Datensatz):

```xml
<!-- Gliederungsartikel -->
<norm id="1" gliederungskennzahl="001">
    <bezeichnung>Art. 1</bezeichnung>
    <titel>Inkrafttreten</titel>
    <text><satz zahl="1">Beispieltext.</satz></text>
</norm>

<!-- EU-Erwägungsgrund -->
<norm id="E1" typ="erwaegungsgrund">
    <bezeichnung>E1</bezeichnung>
    <text><satz zahl="1">Beispieltext.</satz></text>
</norm>
```

## Infos

- Beim Dateiimport und Laden sind ein nichtleerer `<kurztitel>` und ein gültiger `<normgeber>` Pflicht.
  `<langtitel>` ist optional; `<gesetz>` und `<infos>`
  bleiben erforderlich.
  Die Kopfangaben haben jeweils eine Bedeutung; Fundstelle und Datenquelle
  bleiben getrennt, damit amtliche Veröffentlichung und digitale Herkunft nicht
  verwechselt werden.

| Angabe                    | Bedeutung und Form                                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kurztitel`               | Kurztitel, Pflicht; bildet mit `normgeber` die Gesetzesreferenz.                                                                                                                          |
| `normgeber`               | Code des Normgebers, Pflicht.                                                                                                                                                             |
| `langtitel`               | Optionaler Langtitel.                                                                                                                                                                     |
| `fundstelle`              | Amtliche Veröffentlichung (z. B. „BGBl. I S. 42“, „ABl. L 119 vom 4.5.2016, S. 1“), keine Internetadresse; bei EU nur übernommen, wenn in der Eingabe lesbar.                             |
| `ausfertigung`            | Datum der Ausfertigung, bei EU Datum des Rechtsakts; gültiges ISO-Datum, gegebenenfalls verkürzt (`1949`, `1949-05`), sonst weggelassen.                                                  |
| `stand/aenderungsvermerk` | Amtlicher Änderungsvermerk der Quelle im Wortlaut, keine von der App formulierte Fassungsangabe.                                                                                          |
| `stand/neugefasst`        | Amtliche Freitextangabe zum Neufassungsstand, kein Datumsfeld.                                                                                                                            |
| `fassung`                 | EU-Fassungsangabe: `art="konsolidiert"` oder `art="original"`, optional `stichtag` als Datum und `erwaegungsgruendeErgaenzt="true"` nur bei Ergänzung; keine Ergänzung bei falsch.        |
| `datenquelle`             | Fundort der digitalen Fassung; optionale Attribute `name` (Anzeigename) und `url` (Seite des Gesetzes bei der Quelle). URL nur, wo bekannt: EU und EMRK; Bund und BW schreiben keine URL. |
| `verarbeitungszeit`       | Letzte Verarbeitung oder Aktualitätsprüfung, auch ohne Inhaltsänderung; UTC-Zeitstempel.                                                                                                  |
| `letzteNeuerung`          | Letzte von der App gespeicherte Inhaltsänderung; UTC-Zeitstempel. Bei mitgelieferten Dateien wie EMRK zugleich Versionsmarke für das Ersetzen installierter Kopien.                       |
| `sprache`                 | Optionaler Sprachcode, nur von Hand gepflegt.                                                                                                                                             |
| `normpraefix`             | Optionales Normpräfix-Profil, nur von Hand gepflegt; siehe [Normpraefix](#normpraefix).                                                                                                   |

### Zeitfelder

Ohne gültige Zeitangabe bleibt der Zeitpunkt unbekannt. Bei unveränderter
Aktualisierung bleibt das vorhandene XML erhalten und nur `verarbeitungszeit`
wird aufgefrischt. Der Inhaltsvergleich ignoriert beide Zeitfelder; geänderte
Verweis-Taggung zählt als Inhaltsänderung. Manuell importiertes XML behält einen
vorhandenen gültigen Änderungszeitpunkt; die Richtigkeit wird nicht geprüft
(ein falscher Zukunftswert kann spätere Aktualisierungen verzögern).
Beim Import mitgelieferter Gesetzesdateien entscheidet die in der Tabelle
beschriebene Versionsmarke, wenn beide Dateien sie gültig tragen; sonst gilt
`verarbeitungszeit` (fehlend = 0). Gleich aktuelle oder ältere Dateien werden
nicht übernommen. Die mitgelieferte EMRK trägt `letzteNeuerung`.

## Normgeber und Gesetzesreferenz

- `<normgeber>` ist ein Code mit 1 bis 20 Zeichen gemäß
  `^[a-z0-9]+(-[a-z0-9]+)*$`: Kleinbuchstaben und Ziffern, getrennt durch
  einzelne Bindestriche, etwa `de-bund`, `at-bund` oder `de-by`.
  Fehlende und ungültige Werte werden als Formatfehler abgelehnt; alte
  gespeicherte Schreibweisen mit Großbuchstaben werden nicht übersetzt.
- Das [Register](../../../src/lib/domain/normgeber.ts) enthält bekannte Codes
  und Anzeigenamen: `de-bund` → „Bund“, `de-bw` → „Baden-Württemberg“,
  `eu` → „EU“, `europarat` → „Europarat“. Andere gültige Codes erscheinen
  unverändert, auch `unbekannt`. Anzeigenamen werden nicht gespeichert.
  `bund` und `bw` sind eigene gültige Codes ohne Alias oder automatische
  Übersetzung nach `de-bund` beziehungsweise `de-bw`.
- Dateiimport akzeptiert jeden gültigen Code. Internet-/Importindex-Import
  gibt es für `de-bund`, `de-bw` und `eu`, Import mitgelieferter Gesetzesdateien für `europarat`
  (EMRK). Andere Codes sind für diese Importwege nicht verfügbar.
  Ohne Importwahl wird Bund versucht, BW nur bei fehlendem Bundeseintrag im
  Importindex. Netzwerk- und Sperrfehler lösen keinen BW-Versuch aus.
  Datenordner und Importindex-Kategorien verwenden dieselben Codes;
  `europarat` hat keine Importindex-Kategorie. `datenquelle/@name` bleibt Anzeigetext.
- Eine Gesetzesreferenz besteht aus Normgeber und Kurztitel. Der Normgeber
  wird exakt verglichen, der Kurztitel ohne Beachtung der Schreibweise.
- Online-Aktualisierung gibt es für `de-bund`, `de-bw` und `eu`; automatische
  Reparatur nur für `de-bund` und `de-bw`. Die Reparatur braucht einen eindeutig
  lesbaren, zum Ziel passenden Normgeber.
- Bei anderen Normgebern werden bei aktivierter Nachbereitung
  Sätze und Verweise mit Eigenzuordnung getaggt, ohne externe
  Referenzverzeichnisse zu lesen. Der Tagger ordnet Verweise ohne erkannte
  externe Gesetzeszuordnung dem eigenen Gesetz zu; bei fremden Gesetzesnamen
  sind dadurch falsche Eigenzuordnungen möglich.

## Dateiname und Identität

- Dateiname: `<Kurztitel>_<Normgeber>.xml` (`BGB_de-bund.xml`, `PolG_de-bw.xml`,
  `DSGVO_eu.xml`). Das Suffix `_unbekannt` bezeichnet den Normgeber „unbekannt“. Der letzte Unterstrich
  trennt den Normgeber; Unterstriche im Kurztitel bleiben erhalten. `A/B` und
  `A_B` bleiben verschieden.
- Umkehrbare Prozentkodierung für `% < > : " / \ | ? *`, Steuerzeichen
  U+0000–U+001F sowie abschließende Punkte und Leerzeichen. Reservierte
  Windows-Gerätenamen werden durch Kodierung des ersten Zeichens abgesichert.
- Vorhandene Dateien werden bei exakt gleichem Normgeber und unabhängig
  von der Schreibweise des Kurztitels gefunden (auch Nutzerdateien ohne Gesetz auf dem Gerät); Lesen, Ändern und
  Löschen verwenden den tatsächlichen Pfad. Mehrere konkurrierende Dateien
  derselben Referenz werden gemeldet und nicht verwendet.
- Die Gesetzesinfos müssen dieselbe Identität wie der Dateiname tragen;
  Abweichungen sind ein Ladebefund. Die Persistenz leitet den Dateinamen aus der Gesetzesreferenz ab;
  `GesetzDarstellung` trägt keine eigene Kennung.
- Tiefenlinks haben das Format `lexlata://normgeber/kurztitel[/norm]`, etwa
  `lexlata://de-bund/bgb/433`. Nur beim Lesen von Links wird der Normgeber
  kleingeschrieben: `DE-Bund` wird `de-bund`, `Bund` bleibt der eigene Code
  `bund`. Danach gilt dasselbe Muster.
- Ungültige Links erhalten einen Formathinweis mit Gesetzes-/Normlink- und
  Öffnen-Linkbeispiel. Ein gültiges, nicht auflösbares Ziel erhält einen Hinweis,
  Normgeber, Kurztitel und gegebenenfalls Normangabe zu prüfen. Konkrete
  Ladefehler, etwa fehlende Internetverbindung, behalten ihre aussagekräftigere
  Meldung. Dies gilt für Desktop und Mobile, beim App-Start und bei laufender App.
  Öffnen-Links und interne Konfliktklicks: [Adressierungsformat](../adressierungsformat-eingefroren.md).

## Struktur

Das Element `text` bezeichnet je nach Kontext Regelungstext einer Norm oder
Überschrift;
sein Name allein bestimmt seine Bedeutung nicht.

**Norm und Gliederung.** Der Gesetzesrumpf steht unter `<inhalt>`, der Text
einer Norm unter `<norm><text>`, der Normtitel in `<titel>`.
Auch Überschriften dürfen `<gliederung><text>` tragen. Dieser Text wird wie
Normtext angezeigt und mit der Überschrift eingeklappt; er ist nicht markierbar.
Die Volltextsuche findet ihn über die nächste Norm.

- `gliederungskennzahl` besteht aus nichtleeren Dreierblöcken von Ziffern;
  die Ebene ist die Länge geteilt durch drei. Sie ist innerhalb des Gesetzes
  eindeutig. Der Aufbau der Gliederung ergibt sich aus Reihenfolge und Ebene,
  nicht aus einem Präfix der Kennzahl; es gibt keine Präfixgarantie.
  Nur amtlich vergebene Kennzahlen sind über Aktualisierungen hinweg stabil;
  erzeugte Kennzahlen können sich durch Einfügungen ändern. Ein gemeinsamer
  [Zähler](../../../src/lib/domain/gliederungskennzahl.ts) für Bund, BW und EU
  reserviert amtliche Kennzahlen und vergibt freie Werte in Zehnerschritten;
  ab der hundertsten Gliederung derselben Ebene wird die Vergabe ausdrücklich abgelehnt.
- Gliederungsartikel sind Normen mit `gliederungskennzahl`; sobald es eine gibt,
  wird `hatGliederungsartikel` abgeleitet.
- `typ="erwaegungsgrund"` kennzeichnet Erwägungsgründe. Der Leser kennt nur
  diesen Wert; `typ`, `status` und `absatz/@typ` sind offene Wertelisten.
  Unbekannte Werte gelten als normale Norm beziehungsweise normaler Absatz,
  ohne die Sonderdarstellung bekannter Werte.
- App-vergebene Norm-IDs enthalten keinen Kurztitel-Präfix; manuell importierte
  IDs bleiben erhalten.

`norm/@vorgaenger` speichert optional den Hinweis auf den früheren Artikel
(z. B. „Artikel 6 EGV“). Der Hinweis wird weder angezeigt noch durchsucht.

`<absatz typ="zwischenueberschrift">Erste Lesung</absatz>` steht als eigener
Absatz ohne `zahl` und ohne `<satz>`-Kinder im Normtext. Sein Text wird kursiv
mit Abstand davor und ohne Nummernspalte angezeigt und bleibt durchsuchbar.
Die Nachbereitung erhält den Absatztyp und zerlegt den Text nicht in Sätze.

**Normstatus.** Eine weggefallene Norm trägt `status="weggefallen"`. Der
Import erkennt die Wortlaute `(weggefallen)`, `(gegenstandslos)`,
`(aufgehoben)` und `(entfallen)` im Titel. Steht nur dieser Wortlaut im Inhalt
und fehlt ein Titel, wird er als Titel gespeichert und der doppelte Normtext
entfällt; tatsächlicher Text daneben bleibt erhalten und wird angezeigt. Die
verkürzte Anzeige gilt nur bei diesem Status, fehlenden Absätzen und ohne Zusatztext. GesetzesXML mit solchem Titel ohne Status erhält keine automatische Statusdeutung.

**Verweise.** Ein getaggter Eigenverweis trägt nur `norm`
(`<verweis norm="…">`); ohne `gesetz` gilt das eigene Gesetz. Ein Fremdverweis
trägt `gesetz` und `normgeber` (`<verweis gesetz="…" normgeber="…" norm="…">`).
Die lange Form eines Eigenverweises mit vollständiger Gesetzesreferenz wird
weiter gelesen, aber vom Import nicht mehr geschrieben. Bei erneutem Taggen
werden vorhandene Verweis-Tags entfernt und neu geschrieben; so erhalten auch
bestehende Eigenverweise die kurze Form. Wie bei
[Verweismarkierungen](markierungen.md#gesetzesangaben) entfällt die
Gesetzesangabe bei Zielen im selben Gesetz; dort fehlt das Element `<gesetz>`.
Ein fremder Verweis mit `gesetz`, aber ohne `normgeber` bleibt beim Lesen
gewöhnlicher Text; das Schema erlaubt dieses fehlende Attribut weiterhin.
Der Markierungstyp heißt dagegen `verweismarkierung`.

**Absätze, Sätze, Listen.** Diese Angaben bestimmen die Textpfade von
Markierungen und getaggten Verweisen.

Vertrags- und Charta-Präambeln des Formex-Imports bilden genau eine Norm
`Präambel`. Ihre ursprünglichen Textabsätze bleiben als eigene `<absatz>` ohne
`zahl` erhalten, auch bei nur einem Absatz und bei der Satz-Nachbereitung.
Sie haben keine Unterabsatzbezeichnungen; der Wiederholungsindex unterscheidet
sie ausschließlich intern. Das Import-Zwischenmodell kennzeichnet die zu
erhaltenden Grenzen mit `absatzgrenzeErhalten`, ohne zusätzliches XML-Attribut.

- `absatz/@zahl`, `nummer/@zahl`, `litera/@buchstabe` tragen die gedruckten
  Labels samt Satzzeichen (`(1)`, `1.`, `a)`, `aa)`, `-`); es sind freie Texte.
  Der Bauer ordnet mit einer Ziffer beginnende Listenlabels `nummer`, andere
  `litera` zu.
- `unterabsatz/@zahl` ist eine optionale Bezeichnung als freier Text; Konvention
  ist `[1]`, `[2]` usw. Die Anzeige und der Textpfad übernehmen sie unverändert;
  nur das Zitat entfernt die eckigen Klammern.
- `satz/@zahl` bezeichnet optional eine laufende Position ab 1
  (Schreibform `[1-9][0-9]*`, sonst schemaungültig). Die
  Satznummerierung beginnt je Unterabsatz neu. Einzelne Sätze ohne Liste haben
  üblicherweise keinen Satzwrapper. Der Leser nimmt auf Absatzebene das
  Satzattribut, in Listeneinträgen die Position als Fallback.
- `<unterabsatz>` steht innerhalb eines Absatzes oder bei unnummeriertem Inhalt
  unmittelbar unter `<text>`; bei einem Satz enthält er direkt Mixed Content,
  bei mehreren `<satz>`-Kinder.
- Listen können verschachtelt sein. Bei einem einzigen Satz steht der Text
  direkt unter `<nummer>`/`<litera>`, bei mehreren reinen Sätzen stehen dort
  `<satz>`-Kinder.
- Ein ausdrücklich vorhandenes `<satz>`-Kind in `<nummer>`/`<litera>` bleibt
  auch als einzelner innerer Satz erhalten; sein `zahl` bezeichnet den inneren
  Satz, fehlt es, gilt die Position (bei einem Satz: 1). Direkter Eintragstext
  ohne Satzkind erhält keinen inneren Satzpfad. Eine einzelne Satzstruktur
  erzeugt keine sichtbare Satznummer; leere Zusatzkinder ändern die Pfade nicht.
  Für zusätzlichen Text zwischen Satzkindern gibt es keine Textzuordnung.
- Kein `wiederholung`-Attribut im Gesetz-XML: wiederholte Listenbezeichnungen
  werden nach Reihenfolge gezählt. Das Attribut im Markierungsformat speichert
  die gewählte Wiederholung im Textpfad.

**Zuordnung zum Modell.** Das XML-Attribut `zahl` hat zwei Bedeutungen:
Bei Absatz, Unterabsatz und Nummer trägt es eine Bezeichnung, bei Satz eine
gezählte Position. Das Modell, der Textpfad und die Anzeige übernehmen die
Unterabsatz-Bezeichnung samt Klammern unverändert.

| Begriff           | Modellfeld                                                | Beispielwert                           | GesetzesXML                 | Textpfad / MarkierungsXML                        |
| ----------------- | --------------------------------------------------------- | -------------------------------------- | --------------------------- | ------------------------------------------------ |
| Absatz            | `AbsatzDarstellung.bezeichnung`                           | `(1)`; fehlt bei unnummeriertem Absatz | `absatz/@zahl`              | `absatz` / `<absatz>(1)</absatz>`                |
| Unterabsatz       | `UnterabsatzDarstellung.bezeichnung`                      | `[1]`, `[2]`, … als Text               | `unterabsatz/@zahl`         | `unterabsatz` / `<unterabsatz>[2]</unterabsatz>` |
| Satz              | `SatzDarstellung.zahl`                                    | Position ab 1                          | `satz/@zahl`                | `satz`, `satzInEintrag` / `<satz>1</satz>`       |
| Nummer            | `ListenEintragDarstellung.bezeichnung`, `ebene: 'nummer'` | `1.`                                   | `nummer/@zahl`              | `eintraege[]` / `<nummer>1.</nummer>`            |
| Litera            | `ListenEintragDarstellung.bezeichnung`, `ebene: 'litera'` | `a)`                                   | `litera/@buchstabe`         | `eintraege[]` / `<litera>a)</litera>`            |
| Norm, Überschrift | `bezeichnung`                                             | `§ 433`, `Erster Teil`                 | Kindelement `<bezeichnung>` | Bereich `bezeichnung`                            |

**`<fussnoten>`** ist ein Freitext je Norm.

### Normpraefix

`<normpraefix>Can.</normpraefix>` ist ein optionales, von Hand gepflegtes
direktes Kind von `<infos>`; es wird weder abgeleitet noch geschrieben und darf
höchstens einmal vorkommen (verschachtelte Metadaten zählen nicht). Groß-/
Kleinschreibung und umschließender Leerraum werden ignoriert.

- Canon-Aliase: `can.`, `canon`, `c.`, `Kan.`, `Kanon`, `cann.`, `canons`,
  `canones`, `cc.`, `Kanones` (kanonisch `Can.`); `can` ohne Punkt ist kein Alias.
- Paragraph-Aliase: `§`, `§§`. Artikel-Aliase: `Art.`, `Art`, `Artikel`,
  `Artt`, `Artikels`, `Artikeln`.
- Unbekannte Textwerte sind im Schema zulässig; der Leser ignoriert sie mit
  einer Logwarnung.
- Nur die Familie Canon aktiviert die Canon-Grammatik: beim Tagging für das
  aktuelle Gesetz und beim Anlegen von Markierungsverweisen für das Zielgesetz.
  `§`, `Art.` und ein fehlendes Feld aktivieren sie nicht. Ohne Gesetzesangabe
  gilt das Profil des Ausgangsgesetzes, bei ausdrücklicher Angabe
  ausschließlich das des Zielgesetzes; fehlende Zielgesetze aktivieren sie nicht.
- Canon-Absatzangaben (`§ 1`, `§§ 1`) und Nummer-Angaben (`n.`, `nn.`)
  eröffnen keine weitere Zielnorm.

## Bekannte Grenzen des Inhaltsmodells

- **Überschrifttext:** Ohne nachfolgende Norm ist er nicht durchsuchbar.
  Fußnoten unter `<gliederung>` werden nicht angezeigt und vom Anzeigemodell
  nicht übernommen; die Volltextsuche berücksichtigt sie nicht.

- **Tabellen:** Es gibt kein Tabellenformat und kein Reserve-Tag für
  nicht-textuelle Inhalte; es müsste Textpfade und Markierbarkeit regeln. Die
  Importer bilden Tabellen nicht allgemein ab: Bund verarbeitet nur direkte
  `<P>`-Kinder von `<Content>` (sonstige Blöcke entfallen, Text kann ohne
  Tabellenstruktur übrig bleiben), BW überspringt Tabellen samt Inhalt. Der
  Formex-Import von EU-Recht übernimmt Text innerhalb solcher Strukturen
  gegebenenfalls ohne Tabellenstruktur. Die Erhaltung beliebiger Tabellen ist weder
  zugesichert noch durch Tests belegt.
- **Fußnoten:** Nur ein Freitext je Norm. Bund übernimmt den Text; BW und EU
  importieren den Fußnotenapparat nicht (BW entfernt Referenzlinks, EU filtert
  die Marker). Ein verknüpftes Fußnotenmodell fehlt.
- **Hervorhebung, Hoch-/Tiefstellung, Bilder** haben keine Modellstruktur; Text
  kann erhalten bleiben, die ursprüngliche Darstellung nicht.
- **Zusatztext:** Unbekannte Blöcke in `<text>` werden als eigener Zusatztext
  an ihrer Position zwischen den Absätzen angezeigt und von der Volltextsuche
  gefunden. Ein Treffer springt zum Text, markiert ihn aber nicht. Zusatztext
  ist nicht markierbar und gehört weder zur Absatzzählung noch zu deren
  Wiederholungsindizes; bestehende Textstellen bleiben unverändert.
  Die Anzeige hält ihn getrennt von den Absätzen; er wird nie in GesetzesXML
  geschrieben. Tabellen können dabei ihren Zusammenhang verlieren, weil
  Text ohne Tabellenstruktur angezeigt wird.

Bei handgefertigten GesetzesXML muss die Bezeichnung jeder Norm innerhalb des
Gesetzes eindeutig sein; mehrfach bezeichnete Normen sind nicht markierbar.
Präambeln bestehen aus `<absatz>` ohne `zahl`. Enthält ein Gesetz mehrere
Protokolle, erhalten deren Präambeln eindeutige Bezeichnungen, etwa
`Präambel P4`. Eigenverweise tragen nur `norm`; Ziele auf Protokollartikel
enthalten den Protokollzusatz, etwa `<verweis norm="Art. 1P4">Artikel 1</verweis>`
für `Artikel 1P4`. Verweise auf die Konvention behalten das Ziel ohne Zusatz.
