# Nutzerdaten: Favoriten, Lesezeichen, Gesetzeskurzbefehle, Einstellungen

Diese Datei hält die XML-Verträge der Nutzerdaten fest; Übersicht: [XML-Formate](../xml-formate.md).

## Favoriten

Bau/Parse: [src/lib/persistenz/nutzerdaten/favoritenSpeicher.ts](../../../src/lib/persistenz/nutzerdaten/favoritenSpeicher.ts).
Dateiname: `favoriten/{Kurztitel}_{Normgeber}-favoriten.xml`.

Die Zuordnung `<gesetz>` trägt Normgeber und Kurztitel; das Attribut
`normgeber` ist an jeder Gesetzesreferenz Pflicht. Einträge ohne Normgeber werden nicht geladen und über den bestehenden Persistenzhinweis gemeldet.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<favoriten version="1">
    <infos>
        <gesetz normgeber="de-bund">BGB</gesetz>
        <verarbeitungszeit>2026-09-20T10:15:30Z</verarbeitungszeit>
    </infos>
    <inhalt>
        <eintrag><bezeichnung>§ 433</bezeichnung></eintrag>
        <eintrag><bezeichnung>§ 434</bezeichnung></eintrag>
    </inhalt>
</favoriten>
```

## Lesezeichen

Bau/Parse: [src/lib/persistenz/nutzerdaten/lesezeichenSpeicher.ts](../../../src/lib/persistenz/nutzerdaten/lesezeichenSpeicher.ts).
AppData-Pfad: `lesezeichen/lesezeichen.xml` (gesetzesübergreifend).
Exportdateiname: `lesezeichen.xml`. Vergleiche, Gruppierung und
Öffnen vergleichen den Normgeber exakt und den Kurztitel ohne Beachtung der
Groß-/Kleinschreibung.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<lesezeichen version="1">
    <infos>
        <verarbeitungszeit>2026-09-20T10:15:30Z</verarbeitungszeit>
    </infos>
    <inhalt>
        <eintrag>
            <bezeichnung>§ 433</bezeichnung>
            <gesetz normgeber="de-bund">BGB</gesetz>
        </eintrag>
    </inhalt>
</lesezeichen>
```

### Speicherregel für Favoriten und Lesezeichen

Die gespeicherte Bezeichnung folgt der gemeinsamen
[Bezeichnungsregel](markierungen.md#bezeichnungen). Alle Schreibwege speichern
die volle Bezeichnung der aufgelösten Norm, auch bei loser Eingabe oder Import.
Die Seitenleisten zeigen eine verkürzte Form, etwa „433“ statt „§ 433“ oder
„229 3“ statt „Art. 229 § 3“. Diese Anzeige und die Sperre mehrdeutiger
verkürzter Formen sind Oberflächenregeln.
Gleichheit und doppelte Einträge bleiben ein Zeichenvergleich; abweichende
Schreibweisen können daher nebeneinander stehen. Erwägungsgründe werden über
ihre eigene Bezeichnung aufgelöst; fehlt der Erwägungsgrund, gibt es keinen
unscharfen Fallback.

## Gesetzeskurzbefehle

Bau/Parse: [src/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher.ts](../../../src/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher.ts).
Dateiname: `einstellungen/gesetzeskurzbefehle.xml`. Der alte Pfad
`einstellungen/Kurzbefehle.xml` wird weder gelesen, verändert noch gelöscht.
Ein ausschließlich alter Bestand ergibt einen leeren neuen Bestand; XML mit
Wurzel `kurzbefehle` wird beim Import nicht als Gesetzeskurzbefehlformat erkannt.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gesetzeskurzbefehle version="1">
    <infos>
        <verarbeitungszeit>2026-09-20T10:15:30Z</verarbeitungszeit>
    </infos>
    <inhalt>
        <gesetzeskurzbefehl>
            <gesetz normgeber="de-bund">BGB</gesetz>
            <taste primaer="true">B</taste>
        </gesetzeskurzbefehl>
    </inhalt>
</gesetzeskurzbefehle>
```

- Schreiben und Löschen erhalten eine vollständige Gesetzesreferenz. Die
  Gesetzeskurzbefehlstabelle im Code verwendet `gesetzesreferenzSchluessel()`; das Auslösen
  eines Gesetzeskurzbefehls findet das Gesetz auf dem Gerät anhand dieses
  schreibungsunabhängigen Schlüssels.
- `primaer`, `sekundaer`, `shift` und `alt` stehen nur als wahre Attribute an
  `<taste>`. Primär bedeutet auf macOS Command, auf Linux/Windows Strg;
  sekundär jeweils die andere Taste. Die Zuordnung bleibt beim Austausch
  erhalten.

## Einstellungen-Export

Bau/Parse: [einstellungenXML.ts](../../../src/lib/einstellungen/einstellungenXML.ts).
Export und automatisches Backup verwenden dasselbe flache Format (kein
`<infos>`/`<inhalt>`). Wiederherstellung und Grenzen des Backups:
[Schutz vor Datenverlust](../schutz-vor-datenverlust.md#verlust-der-webview-einstellungen).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<einstellungen version="1">
    <verarbeitungszeit>2026-09-20T10:15:30Z</verarbeitungszeit>
    <farbschema>dunkel</farbschema>
</einstellungen>
```

Die feste Zuordnung der XML-Tags zu den internen Speicherschlüsseln verhindert,
dass eine interne Umbenennung das Austauschformat verändert. **Die 29
Tag-Namen (einschließlich `verarbeitungszeit`) und die rohen localStorage-Strings sind Bestandteil des Formats und
eingefroren.** Die 28 Einstellungswerte werden unverändert übernommen (auch JSON-Zeichenketten);
nicht explizit gesetzte Werte werden ausgelassen, der Export ergänzt keine
Defaults.

Die fünf ersetzten Optionen verwenden ausschließlich die unten genannten
Tags und `lexlata.<tag>`-Schlüssel. Die früheren Tags
`markierungenAktiviert`, `strukturLeisteSkalierung`, `gesetzestextAkzent`,
`zeilenlaengeBreite` und `tastaturHinweiseAusblenden` werden weder gelesen noch übernommen; ihre gespeicherten
Schlüssel bleiben auch bei Import und Reset unberührt. Ohne neuen Wert gelten
die bisherigen Standards. `markierungenDeaktiviert` hat den Standard `false`:
Die Checkbox „Markierungen deaktivieren“ ist nicht angehakt, Markierungen sind
sichtbar und anlegbar. `true` hakt sie an, blendet Markierungen aus und sperrt
das Anlegen; gespeicherte Markierungen bleiben erhalten.

Die Tabelle nennt die vorgesehenen Rohwerte. Der negativ benannte Name
`markierungenDeaktiviert` bedeutet bei `true` das Abschalten und Ausblenden.

Import und Export übernehmen die
Strings unverändert, es gibt keine Importvalidierung; die Hooks behandeln
unbekannte Werte unterschiedlich: Boolesche Werte sind nur bei `true` wahr,
Zahlen werden mit `Number` gelesen, mehrere Auswahlen werden ohne Prüfung
übernommen. Farben fallen auf `blau`, ein unbekanntes Aktualisierungsintervall
auf `woechentlich`, eine unbekannte Linux-Titelleistenpräferenz auf keine
Entscheidung zurück.

| XML-Tag                        | Vorgesehener Rohwert                                                                                                 | Bedeutung von `true`                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `verarbeitungszeit`            | UTC-Zeitstempel der Erzeugung; kein Einstellungswert                                                                 | Nicht boolesch                                                        |
| `farbschema`                   | `system`, `hell`, `dunkel`                                                                                           | Nicht boolesch                                                        |
| `appAkzentfarbe`               | `blau`, `lila`, `pink`, `rot`, `orange`, `gelb`, `gruen`, `grau`                                                     | Nicht boolesch                                                        |
| `gesetzestextAkzentfarbe`      | dieselben acht Farbwerte                                                                                             | Nicht boolesch                                                        |
| `hervorhebungsfarbe`           | dieselben acht Farbwerte                                                                                             | Nicht boolesch                                                        |
| `schriftgroesse`               | Zahl als String, ohne Wertebereichsprüfung beim Lesen                                                                | Nicht boolesch                                                        |
| `leistenSchriftgroesse`        | Zahl als String, ohne Wertebereichsprüfung beim Lesen                                                                | Nicht boolesch                                                        |
| `schriftart`                   | `sans`, `serif`                                                                                                      | Nicht boolesch                                                        |
| `zeilenabstand`                | Zahl als String, ohne Wertebereichsprüfung beim Lesen                                                                | Nicht boolesch                                                        |
| `satzNeuZeile`                 | `true`, `false`                                                                                                      | Jeden Satz in neuer Zeile beginnen (sonst fortlaufend)                |
| `blocksatz`                    | `true`, `false`                                                                                                      | Blocksatz verwenden                                                   |
| `silbentrennung`               | `true`, `false`                                                                                                      | Silbentrennung verwenden                                              |
| `randbreite`                   | `schmal`, `normal`, `breit`                                                                                          | Nicht boolesch                                                        |
| `strukturKontextLeisteGroesse` | `klein`, `normal`, `gross`                                                                                           | Nicht boolesch                                                        |
| `lesbareZeilenlaenge`          | `true`, `false`                                                                                                      | Zeilenlänge begrenzen                                                 |
| `lesbareZeilenlaengeBreite`    | `schmal`, `normal`, `breit`                                                                                          | Nicht boolesch                                                        |
| `uiGroesse`                    | `klein`, `normal`, `gross`                                                                                           | Nicht boolesch                                                        |
| `markierungenDeaktiviert`      | `true`, `false`                                                                                                      | Markierungen ausblenden und Anlegen sperren; Bestand erhalten         |
| `minimalistischerModus`        | `true`, `false`                                                                                                      | Minimalistischen Modus verwenden                                      |
| `euFassung`                    | `konsolidiert-mit-erwaegungsgruenden` (Standard), `konsolidiert`, `original`; betrifft Erstimport und Aktualisierung | Nicht boolesch                                                        |
| `euDurchfuehrungsaktSuche`     | `true`, `false` (Standard); blendet unscharfe Durchführungsakte-Angebote ein                                         | Unscharfe Angebote von Durchführungsakten anzeigen                    |
| `nachbereitungBeiImport`       | `aus`, `verweise`, `saetze`, `saetze-und-verweise`                                                                   | Nicht boolesch                                                        |
| `seitenleistenTastenkuerzel`   | `true`, `false`                                                                                                      | Anzeige und Kürzel in den Seitenleisten aktivieren (Standard `false`) |
| `autoAktualisierungIntervall`  | `taeglich`, `woechentlich`, `zweiwoechentlich`, `nie`                                                                | Nicht boolesch                                                        |
| `linuxTitelleistenPraeferenz`  | `nativ`, `eigene`; leer oder ungültig bedeutet keine Entscheidung                                                    | Nicht boolesch                                                        |
| `plattformfremdeUiAnzeigen`    | `true`, `false`                                                                                                      | Plattformfremde Oberflächenelemente anzeigen                          |
| `zitatAbkuerzungenAktiv`       | `true`, `false`                                                                                                      | Abkürzungen beim Zitieren verwenden                                   |
| `zitatOhnePunkt`               | `true`, `false`                                                                                                      | Schlusspunkt im Zitat weglassen                                       |
| `zitatRoemischeAbsaetze`       | `true`, `false`                                                                                                      | Absätze im Zitat römisch schreiben                                    |
| `leistenTauschen`              | `true`, `false`                                                                                                      | Seitenleisten tauschen                                                |
| `appUpdatesAutomatischSuchen`  | `true` (Standard, auch bei fehlendem Element), `false`                                                               | Automatisch nach Updates suchen                                       |

Bei der Linux-Titelleistenpräferenz ist der frühere Wert `custom` ungültig und führt wie ein fehlender Wert zur Erstabfrage. Export und Import erhalten rohe Textwerte unverändert; auch nach einem solchen Austausch wird daraus keine Wahl der eigenen Titelleiste. Das Schema lässt weiterhin rohe Textwerte zu.

Quellen: Zuordnung in `einstellungenSpeicher.ts`, Leser in
[src/hooks/einstellungen/](../../../src/hooks/einstellungen), Auswahltypen in [gesetzTextDarstellung.ts](../../../src/lib/stil/gesetzTextDarstellung.ts) und
[farbpalette.ts](../../../src/lib/einstellungen/farbpalette.ts).
