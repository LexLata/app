# Glossar: Öffnen und Import

Ergänzt `docs/GLOSSAR.md` (Öffnen-Overlay, Importindex, Präfixstruktur).

## Suchergebnis

- Treffer = Ergebnis im Öffnen-Overlay: entweder ein installiertes Gesetz oder ein Importangebot
- installiertes Gesetz = bereits importiertes, lokal vorhandenes Gesetz
- Importangebot = Treffer für einen noch nicht installierten Rechtstext, der aus dem Importindex stammt und über das Öffnen-Overlay importiert werden kann
- Suchanfrage = Eingabe im Öffnen-Overlay; besteht aus Normeingabe, Gesetzeseingabe oder beidem, z. B. „433 bgb“
- Normeingabe = Teil der Suchanfrage, der die Norm bezeichnet, z. B. 433, 229 3 oder e25
- Hauptnorm = Norm mit Normpräfix (§, Art., Can., Regel, Nr.). Sie wird über ihre ganze Normzahl gefunden. Abgrenzung: Nebennorm, Erwägungsgrund
- Nebennorm = Norm ohne Normpräfix, zB Anlage 1, Anhang 1 oder Muster 1. Sie wird nur über die erste Zahl ihrer Bezeichnung gefunden. Abgrenzung = Hauptnorm, Erwägungsgrund
- Gesetzeseingabe = Teil der Suchanfrage, der das Gesetz bezeichnet (Kurz- oder Langtitel oder ein Teil davon), z. B. bgb
- PräfixstrukturXML = enthält für einen Normgeber die Präfixstruktur geprüfter Gesetze
- Öffnen-Link = öffentlicher Link lexlata://oeffnen/<Text>, der auf Desktop dieselbe Auflösung wie das Öffnen-Overlay auslöst

## Import

- Quelldatei = von einer Datenquelle abgerufene Datei, aus der GesetzesXML erzeugt wird
- Datenquelle = Fundort der digitalen Fassung eines Gesetzes, mit Anzeigename und optional Adresse (zB „Gesetze im Internet“, „EUR-Lex“). Abgrenzung: Fundstelle (amtliche Veröffentlichung, nie eine Internetadresse)
- Abrufkennung = Kennung, unter der eine Datenquelle ein Gesetz zum Abruf bereithält (Verzeichnisname bei Gesetze im Internet, Permalink-Kürzel in Baden-Württemberg, CELEX-Nummer bei EU-Recht, Dateiname bei mitgelieferten Ressourcen); nicht je Importindex-Eintrag eindeutig
- Nachbereitung = Sätze und Verweise im GesetzesXML taggen
- Grundbestand = kuratierte Liste der wichtigsten Gesetze je Normgeber; Grundlage für Entwicklerlauf und Datenbankindex
- Datei-Import = Import ausgewählter oder abgelegter Dateien über „Dateien importieren“, im Unterschied zum Import über das Öffnen-Overlay.
- Importkonflikte = Bereich im Fenster des Datei-Imports, in dem die noch offenen Konflikte zur Entscheidung stehen
- Importbericht = die Ergebnisübersicht eines Datei-Imports

## EU-Recht

- CELEX-Nummer = eindeutige, unveränderliche Kennung eines EU-Rechtsakts (z. B. 32016R0679); dient im Importindex Europarecht als Abrufkennung des Basisakts
- Basisakt = der ursprünglich veröffentlichte EU-Rechtsakt; seine CELEX-Nummer bleibt auch nach Änderungen gleich
- konsolidierte Fassung (EU) = vom Amt für Veröffentlichungen erstellter, rechtlich unverbindlicher Text des Basisakts mit allen Änderungen; hat eine eigene CELEX-Nummer mit Datum
- konsolidierte Fassung mit Erwägungsgründen (EU) = konsolidierte Fassung (EU), der die Erwägungsgründe aus dem Originaltext (EU) vorangestellt sind, soweit sie in der konsolidierten Fassung fehlen
- Originaltext (EU) = Wortlaut des Basisakts, wie er im Amtsblatt veröffentlicht wurde (mit Erwägungsgründen, ohne spätere Änderungen)
- Formex = XML-Format, in dem EU-Rechtsakte bei EUR-Lex vorliegen; einzige Quelle für den EU-Import
- Durchführungsrechtsakt = Durchführungsverordnung oder -richtlinie der Kommission; ist im Importindex Europarecht enthalten, wird im Öffnen-Overlay standardmäßig ausgeblendet
- kuratierte Kurztitel = von Hand gepflegte Liste, die bestimmten EU-Rechtsakten einen eigenen Kurztitel zuordnet; überlagert die aus der CELEX-Nummer abgeleiteten Kurztitel im Importindex Europarecht
