# XML-Formate der App – Referenz

Verbindliche Referenz für die von der App geschriebenen und mitgelieferten
XML-Formate (Ist-Zustand); der Datenbankindex ist ein Entwurf. Beispiele erläutern einzelne Strukturen;
Einrückung von Mixed Content ist keine Vorlage zum Umformatieren von Dateien.
Begriffe: [GLOSSAR](../GLOSSAR.md).

Das abgeleitete Suchverzeichnis ist die JSON-Ausnahme und kein XML-Format;
Dateivertrag und Wiederaufbau: [Abgeleitete Daten](abgeleitete-daten.md).

## Formate

| Format                   | Wurzel                 | Datei                                                                                                                             | Details                                                                      | Schema                                                         |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Gesetz                   | `gesetz`               | `gesetze/{Kurztitel}_{Normgeber}.xml`; Ressource: `europa/EMRK_europarat.xml`                                                     | [gesetz.md](xml-formate/gesetz.md)                                           | [gesetz.rng](../schema/gesetz.rng)                             |
| Markierungen             | `markierungen`         | `markierungen/{Kurztitel}_{Normgeber}-markierungen.xml`                                                                           | [markierungen.md](xml-formate/markierungen.md)                               | [markierungen.rng](../schema/markierungen.rng)                 |
| Markierungskonflikte     | `markierungskonflikte` | `markierungskonflikte.xml` (AppData-Wurzel)                                                                                       | [markierungen.md](xml-formate/markierungen.md#markierungskonflikte)          | [markierungskonflikte.rng](../schema/markierungskonflikte.rng) |
| Favoriten                | `favoriten`            | `favoriten/{Kurztitel}_{Normgeber}-favoriten.xml`                                                                                 | [nutzerdaten.md](xml-formate/nutzerdaten.md#favoriten)                       | [favoriten.rng](../schema/favoriten.rng)                       |
| Lesezeichen              | `lesezeichen`          | `lesezeichen/lesezeichen.xml`                                                                                                     | [nutzerdaten.md](xml-formate/nutzerdaten.md#lesezeichen)                     | [lesezeichen.rng](../schema/lesezeichen.rng)                   |
| Gesetzeskurzbefehle      | `gesetzeskurzbefehle`  | `einstellungen/gesetzeskurzbefehle.xml`                                                                                           | [nutzerdaten.md](xml-formate/nutzerdaten.md#gesetzeskurzbefehle)             | [gesetzeskurzbefehle.rng](../schema/gesetzeskurzbefehle.rng)   |
| Einstellungen            | `einstellungen`        | Export und `einstellungen/einstellungen-backup.xml`                                                                               | [nutzerdaten.md](xml-formate/nutzerdaten.md#einstellungen-export)            | [einstellungen.rng](../schema/einstellungen.rng)               |
| Importindex              | `importindex`          | `importindizes/de-bund.xml`, `importindizes/de-bw.xml`, `importindizes/eu.xml`                                                    | [indizes-und-titel.md](xml-formate/indizes-und-titel.md#importindex)         | [importindex.rng](../schema/importindex.rng)                   |
| Nichtamtliche Titel      | `nichtamtlicheTitel`   | `nichtamtliche-titel/{Kurztitel}_{Normgeber}-nichtamtliche-titel.xml`; Ressource unter `src-tauri/resources/nichtamtliche-titel/` | [indizes-und-titel.md](xml-formate/indizes-und-titel.md#nichtamtliche-titel) | [nichtamtliche-titel.rng](../schema/nichtamtliche-titel.rng)   |
| PräfixstrukturXML        | `praefixstrukturen`    | Ressource `praefixstrukturen/de-bund.xml` unter `src-tauri/resources/`, `de-bw.xml`                                               | [indizes-und-titel.md](xml-formate/indizes-und-titel.md#präfixstrukturxml)   | [praefixstrukturen.rng](../schema/praefixstrukturen.rng)       |
| Datenbankindex (Entwurf) | `datenbankindex`       | `datenbankindex.xml`                                                                                                              | [indizes-und-titel.md](xml-formate/indizes-und-titel.md#datenbankindex)      | [datenbankindex.rng](../schema/datenbankindex.rng)             |
| Grundbestand             | `grundbestand`         | frei wählbar (Entwicklerlauf); mitgeliefert: `docs/doku/testdaten/wichtigste-gesetze.xml`                                         | [indizes-und-titel.md](xml-formate/indizes-und-titel.md#grundbestand)        | [grundbestand.rng](../schema/grundbestand.rng)                 |

Querschnittsthema: [Textaufbereitung](xml-formate/textaufbereitung.md)
(Leerraum und Zeichenkoordinaten im Fließtext; Teil des Markierungsformats,
eingefroren).

## Projektweite Regeln

- **Namen:** Wurzelelemente, Tags und Attribute sind lowercase und
  zusammengeschrieben, wenn der Name im Deutschen ein einziges Wort wäre
  (`markierungskonflikte`, `gliederungskennzahl`). CamelCase gilt für Namen aus
  zwei Wörtern, die zusammengeschrieben schwer lesbar wären
  (`nichtamtlicheTitel`), und für Qualifizierer-Suffixe (`kurztitelArt`,
  `duplikatVon`, `bwZusatz`). Aufzählungswerte bestehen aus Kleinbuchstaben;
  mehrere Wörter werden mit Bindestrichen getrennt (`amtlicher-titel`,
  `delegierte-verordnung`). Ein deutsches Kompositum zählt als ein Wort
  (`zwischenueberschrift`).
- **Zeichen:** Element- und Attributnamen sind ASCII. Umlaute in Text und
  Attributwerten sind zulässig.
- **Escaping:** Manuell gebautes XML immer mit `escapeXML` bzw.
  `optionaleXmlAttribut` aus [src/lib/utils/xmlVerarbeitung.ts](../../src/lib/utils/xmlVerarbeitung.ts) (5 Entities:
  `& < > " '`), auch bei unkritischen Werten. Manuelle String-Leser dekodieren
  mit `unescapeXML`; DOM-Leser erhalten dekodierte Werte und dürfen nicht
  erneut entmaskieren. Bereits maskierte Abschnitte nicht nochmals maskieren.
- **Gesetzesreferenz:** Besteht aus Normgeber und Kurztitel. Ein Verweis nur
  auf ein Gesetz steht als `<gesetz normgeber="…">Kurztitel</gesetz>`.
  Trägt das Element bereits Text oder Unterelemente, stehen `kurztitel` und
  `normgeber` als Attribute am `<gesetz>`; an anderen Elementen heißen die
  Attribute `gesetz` und `normgeber`. Die Beschreibung des Gesetzes selbst
  (Kopf und Verzeichniseinträge) verwendet `<kurztitel>` und `<normgeber>`
  als Unterelemente. So bleibt der Gesetzesbezug erkennbar, ohne den übrigen
  Inhalt des Elements zu verdrängen.
- **Boolesche Merkmale** sind Attribute am fachlichen Element und werden nur
  bei wahr geschrieben (z. B. `primaer="true"`); fehlt das
  Attribut, gilt falsch. Der Bereich einer Markierung ist eine Auswahl aus drei
  Werten, kein boolesches Merkmal.
- **Version:** Alle zwölf Schemas verlangen `version="1"` am Wurzelelement.
  Eine vorhandene andere Version erzeugt beim Lesen einen Hinweis; Lesen und
  Bearbeiten bleiben möglich. Ein fehlendes Attribut erzeugt keinen Hinweis.
  Vor dem ersten Überschreiben von Markierungen, Favoriten, Lesezeichen und
  Gesetzeskurzbefehlen mit abweichender Version wird die bestehende Datei
  vollständig als `.bak` kopiert; erst danach wird mit Version 1 geschrieben.
  Lesen, Sichern und Schreiben erfolgen unter derselben Dateisperre. Scheitert
  die Sicherung, unterbleibt das Schreiben; scheitert erst das Schreiben,
  bleibt die Sicherung erhalten. Die Regel prüft bewusst jede vorhandene
  Version ungleich 1; bei einer zweiten Formatversion muss sie auf „höher als
  die bekannte“ umgestellt werden. Die Regel setzt voraus, dass Dateien einer
  neueren Formatversion nur durch Import oder Wiederherstellung eintreffen; vor
  einer Synchronisation zwischen Geräten oder einer zweiten Formatversion ist sie
  neu zu entscheiden.
  Ausgenommen sind Gesetze, Importindizes und nichtamtliche Titel (erneut
  beschaffbar), Markierungskonflikte (abgeleitet), Einstellungen (Export und
  Backup), Präfixstrukturen (weisen fehlende oder abweichende Version zurück),
  der nicht implementierte Datenbankindex und der Grundbestand (weist
  fehlende oder abweichende Version zurück).
  Für Markierungen, Favoriten, Lesezeichen und Gesetzeskurzbefehle erhöht jede
  neue gespeicherte Angabe die Version: zusätzliche Elemente oder Attribute,
  neue Markierungsarten und neue Werte. Ihre Schreiber bauen die Dateien aus
  dem Modell neu auf. Ältere App-Versionen würden unbekannte Angaben beim
  Speichern still verlieren; die abweichende Version löst den beschriebenen
  Hinweis und die Sicherung vor dem Überschreiben aus.
  Für Gesetze, Importindizes, nichtamtliche Titel und Präfixstrukturen (erneut
  beschaffbar), Markierungskonflikte (abgeleitet) sowie Einstellungen (Export
  und Backup, keine Fortschreibung derselben Datei) bleiben additive
  Ergänzungen ohne Versionsänderung zulässig. Bei geänderter Bedeutung oder
  neuen Pflichtangaben steigt auch für diese Formate die Version.
  Unveränderliche Version-1-Markierungsdateien liegen in
  [src/test/musterdateien/markierungen-v1](../../src/test/musterdateien/markierungen-v1);
  jede künftige App-Version muss sie lesen können
  ([Lesetest](../../src/lib/markierungen/markierungs-xml/markierungsXML.musterdateien.test.ts)).
  Der Formatumbau vor dem Release
  behält Version 1; Alpha-Dateien werden nicht migriert. Dateien unter alten
  Namen werden nicht mehr gefunden. Der gesonderte Schutz beschädigter
  Dateien steht im [Datenverlustschutz](schutz-vor-datenverlust.md).

Die Tabelle nennt relative AppData-Pfade; Kurztitel werden gemäß
[Dateiidentität](xml-formate/gesetz.md#dateiname-und-identität) kodiert und behalten
ihre Schreibweise, Ordner und Zusätze sind klein mit Bindestrichen.
ZIP-Kategorien behalten ihre Anzeigenamen (etwa `Gesetze/`, `Markierungen/`);
Lesezeichen liegen in der ZIP-Wurzel. Der Einstellungenexport heißt
`Einstellungen/Einstellungen.xml` und hat keinen dauerhaften AppData-Pfad.

### Zeitstempel

- Alle Zeitstempel: ISO-8601, UTC, mit `Z`, ohne Millisekunden
  (`2026-09-20T10:15:30Z`).
- `<verarbeitungszeit>`: Verarbeitungszeitpunkt der App; Schreiber verwenden
  `isoZeitstempel()` aus `xmlVerarbeitung.ts`. Bedeutung je Format: siehe Tabelle.
- `<letzteNeuerung>`: Zeitpunkt der letzten gespeicherten Inhaltsänderung
  eines Gesetzes; setzt der Code.
- `<geaendert>` bei nichtamtlichen Titeln und beim
  [Grundbestand](xml-formate/indizes-und-titel.md#grundbestand): von Hand gepflegter
  Bearbeitungszeitpunkt.
  Zeitstempel von Markierungen: [Markierungsregel](xml-formate/markierungen.md#zeitstempel).
- Fachliche Datumsfelder sind keine Zeitstempel: `<stand><aenderungsvermerk>`
  ist Text („Geändert 2023“), `<ausfertigung>` ein Datum ohne Uhrzeit.
- Lesen: Ein vollständiger Datum-Uhrzeit-Wert in `<verarbeitungszeit>` oder
  `<letzteNeuerung>` ohne Zeitzone gilt als UTC; eine explizite Zeitzone bleibt
  maßgeblich; ein ungültiger Wert ergibt keinen Zeitpunkt. `<geaendert>` nichtamtlicher Titel wird nicht als Datum geparst; `<geaendert>` des
  Grundbestands muss die Form oben haben, sonst wird die Liste abgewiesen.

| Format                                                    | Bedeutung von `verarbeitungszeit`                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Gesetz                                                    | Letzte Verarbeitung bzw. Aktualitätsprüfung, auch ohne Inhaltsänderung.                                                      |
| Markierungen, Favoriten, Lesezeichen, Gesetzeskurzbefehle | Erzeugung des XML beim Speichern des jeweiligen Bestands.                                                                    |
| Importindex                                               | Erstellung bzw. Auffrischung des Importindex, auch ohne Inhaltsänderung; bloßes Kopieren der Ressource erhält den Zeitpunkt. |
| Einstellungen                                             | Export: Erstellung des Exports; Backup: Zeitpunkt des Schreibens (letzte Veränderung der Datei).                             |
| PräfixstrukturXML                                         | Letzte inhaltliche Änderung der geprüften Liste.                                                                             |
| Datenbankindex (Entwurf)                                  | Vorgesehen: Erzeugung der Datei bei inhaltlicher Änderung.                                                                   |

Markierungskonflikte haben keinen solchen Zeitstempel.

### Erweiterbarkeit

- Leser ignorieren unbekannte Elemente und Attribute. Bekannte Angaben werden
  nur als direkte Kinder an ihrer vorgesehenen Position gelesen; bekannte Tags
  innerhalb zusätzlicher Metadaten sind keine regulären Einträge. Kommentare
  tragen keine Einträge bei.
- `<infos>` ist offen: neue optionale Tags können als zusätzliche Geschwister
  ergänzt werden, ohne Dateien zu brechen (Leser lesen direkte Kinder, nicht
  positionsbasiert).
- Zusätzliche Metadaten stehen außerhalb des Fließtexts. Unbekannte direkte
  Rumpfkinder eines Gesetzes werden mit Kurztitel und Tagname als Warnung
  gemeldet und nicht dargestellt. Unbekannte Formatierungshüllen im Fließtext
  behalten Textinhalt, Inline-Verweise und ausdrückliche Umbrüche.
- Erweiterungen dürfen Absätze, Sätze, Aufzählungen, Textpfade und
  Zeichenpositionen nicht verändern; ein zusätzlicher Tag allein garantiert
  keine kompatible Erweiterung.
- Schreiber dürfen additive Angaben ergänzen; bei Markierungen, Favoriten,
  Lesezeichen und Gesetzeskurzbefehlen erfordert jede neue gespeicherte Angabe
  eine höhere Version gemäß der Versionsregel oben. Nur für die dort genannten
  anderen Formate sind additive Ergänzungen ohne Versionsänderung zulässig.
  Beim Neuaufbau aus dem Modell werden unbekannte Metadaten grundsätzlich nicht
  übernommen. Ausnahme:
  Status- und Befundänderungen der Markierungskonflikte bewahren unbekannte
  Wurzelattribute und zusätzliche Wurzelkinder; unveränderte Gesetzesblöcke
  werden wörtlich übernommen (Details im [Konfliktformat](xml-formate/markierungen.md#prüfstatus)).
  Änderungen am vorhandenen XML, etwa Zeitstempelpatches und
  attributerhaltende Importindex-Abgleiche, sind ebenfalls kein Neuaufbau.

## Schemas und Prüfungen

Die zwölf Format-Schemas (Tabelle oben) beschreiben gültige aktuelle Dateien.
Für GesetzesXML ergänzt das strenge [Schreibschema](../schema/gesetz-schreibschema.rng)
das tolerante [Leseschema](../schema/gesetz.rng): Es prüft vollständig neu
erzeugte Ausgaben des Bauers und deren Nachbereitung. Das Leseschema erlaubt
zusätzliche Metadaten und unbekannte Textblöcke; bleiben solche Erweiterungen
bei der Nachbereitung erhalten, gilt für die Ausgabe weiterhin das Leseschema. Die Schemaprüfung läuft nur in Tests mit `xmllint-wasm` und
ist Teil von `npm run pruefen`. Sie prüft die mitgelieferten XML-Dateien und
die Ausgaben der Schreiber; für den Datenbankindex gibt es nur Entwurfsbeispiele.
Er gehört nicht zu den Release-Verträgen; maßgeblich ist sein [Entwurfsstatus](xml-formate/indizes-und-titel.md#datenbankindex). Negativproben sichern Pflichtangaben,
bekannte Einzelangaben und zulässige Werte. Unbekannte Metadaten und Attribute
sind an den vorgesehenen Erweiterungsstellen erlaubt, ersetzen aber keine
Pflichtangaben.

Die Laufzeitleser sind toleranter als die Schemas (insbesondere beim Hinweis
auf abweichende Version). Fachliche Beziehungen – etwa die Auflösung eines
Verweises oder die Übereinstimmung von Dateiname und Gesetzesinfos – prüfen
Anwendung und eigene Tests, nicht die Schemas.
