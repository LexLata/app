# GLOSSAR

Weitere Begriffe nach Thema in `docs/glossar/`; bei Arbeit im Thema zusätzlich lesen:

- `markierungen.md`: Markierungs-Datenmodell und Konfliktbegriffe (auch bei Markierungs-Oberfläche in components und hooks)
- `oeffnen-und-import.md`: Suchtreffer, Importangebote, Quelldateien, EU-Rechtsbegriffe
- `navigation.md`: Verlauf (Sprung, Schritt, Nachtragen), Normzeile, Klappen
- `laden-und-tabs.md`: Laden bei Bedarf, Suchverzeichnisabgleich, App-Start, Fensterstart, Tabs

## Rechtstext und Struktur

- Überschrift = gliederung-Tag mit gliederungskennzahl
- Gliederungskennzahl = eindeutige Kennzahl im GesetzesXML aus Blöcken zu je drei Ziffern; bezeichnet die Gliederungsposition
- Norm = einzelne Einheit des Rechtstextes, etwa §, Artikel, Canon oder Erwägungsgrund
- Element = Überschrift oder Norm
- XML-ID = Kennung eines Elements; bei einer Norm der Wert ihres id-Attributs, bei einer Überschrift aus ihrer Gliederungskennzahl abgeleitet (nicht in der Datei gespeichert)
- Normbezeichnung = vollständige Bezeichnung einer Norm wie im Zitat, ohne Gesetzesangabe, zB § 433, Art. 229 § 3, Anhang 1 oder E25
- Normpräfix = Kennzeichen vor der Normzahl, zB § oder Art.
- Normzahl = Zahl einer Norm mit möglichem Buchstabenzusatz, ohne Normpräfix, zB 433 oder 23a
- Normtitel = amtlicher Titel einer Norm (`<titel>`); in der Einführung meint "Normtitel" Normzeile bzw. Norm
- Normtext = Text einer Norm (Absätze, Sätze) ohne Normbezeichnung und Titel
- Präfixstruktur = ob das Gesetz überwiegend §§, Artikel oder Artikel mit untergeordneten §§ verwendet
- Gliederungsartikel = Norm mit gliederungskennzahl; hat sie §§ unter sich, wird sie wie eine Überschrift angezeigt (überschriftartig)
- (getaggter) Verweis = im GesetzesXML getaggter Verweis, der Bestandteil des Rechtstextes ist
- Verweisziel = konkrete Norm oder ganzes Gesetz, auf das ein getaggter Verweis oder eine Verweismarkierung verweist
- weggefallene Norm = im GesetzesXML mit status="weggefallen" gekennzeichnete Norm
- Sammelnorm = Norm, die mehrere aufeinanderfolgende Normen unter einer Bezeichnung zusammenfasst, zB „§§ 3 bis 6“; meist bei weggefallenen Normen
- Zusatztext = sichtbarer Text eines Rechtstexts, den die App nicht als Absatz kennt (zB eine Tabelle zwischen Absätzen)

## Daten und Dateien

- GesetzesXML = unser kanonisches XML
- Gesetz = ein als Einheit dargestellter Rechtstext; andere Rechtstexte, etwa Verordnungen und Richtlinien, werden im Programm wie Gesetze behandelt
- Normgeber = Staat, Bundesland oder inter-/supranationale Organisation, dem der Rechtstext zuzuordnen ist
- Kurztitel = kurze Bezeichnung eines Gesetzes, zB BGB
- Langtitel = vollständiger Titel eines Gesetzes
- Gesetzesreferenz = Normgeber und Kurztitel zusammen; identifiziert ein Gesetz
- Ausfertigung = Datum der Ausfertigung eines Gesetzes
- Neugefasst = Freitextangabe zum Neufassungsstand eines Gesetzes
- nichtamtlicher Titel = selbst erstellter Titel für eine Norm, die im GesetzesXML keinen amtlichen Titel (keinen titel-Tag) hat
- nichtamtlicheTitelXML = Datei in der für ein spezifisches Gesetz nichtamtliche Titel gespeichert werden
- Importindex = Verzeichnis der zum Import verfügbaren Rechtstexte eines Normgebers mit Abrufkennungen, Lang- und Kurztiteln
- Suchverzeichnis = abgeleitete Datei mit einem Eintrag je installiertem Gesetz; Grundlage des Öffnen-Overlays und der Gesetzeslisten
- Backup = vom Programm selbst im Datenordner geführte Kopie von Nutzerdaten zur Wiederherstellung nach Datenverlust. Abgrenzung: Export (vom Nutzer ausgelöst)
- Sicherung = vom Programm im Datenordner abgelegter Originalstand einer Datei (.bak), bevor es sie wegen Beschädigung oder abweichender Schemaversion überschreibt, ersetzt oder automatisch löscht
- abgeleitete Daten = aus den Gesetzesdateien jederzeit neu erzeugbare Daten, z. B. das Suchverzeichnis. Abgrenzung: Nutzerdaten
- Entwicklerlauf = per npm-Befehl gestarteter Lauf, der Quelldateien beschafft, GesetzesXML erzeugt oder Präfixstrukturen auswertet; kein Teil der Nutzerfunktionen
- Schemaversion = die Version eines LexLata-Formats steht im Wurzelelement der XML (zB version="1"); Abgrenzung: Version der XML-Deklaration; App-Version
- App-Version = die installierte Version von LexLata selbst, angezeigt als Versionsnummer (z. B. 1.4.2). Abgrenzung: Schemaversion
- App-Update = neue App-Version von LexLata, die die App über die GitHub-Releases findet und nach Bestätigung installiert. Abgrenzung: Aktualisierung (Gesetze)

## Markierungen und Annotationen

- Markierung – vier Typen können vom Nutzer angelegt werden
  1. Unterstreichung
  2. Hervorhebung = farblich hinterlegt
  3. Verweismarkierung = hat kein, ein oder mehrere Verweisziele; in der Bedienoberfläche kurz „Verweis"
  4. Kommentar = freier Text
- MarkierungsXML = Datei in der Markierungen für ein spezifisches Gesetz gespeichert werden
- Markierungskonflikt = eine Markierung passt nicht mehr zu ihrer Ausgangsstelle (GesetzesXML oder nichtamtlicheTitelXML) oder einem verknüpften Verweisziel, oder eine dafür benötigte Datei fehlt (siehe docs/doku/markierungskonflikte.md)
- MarkierungskonflikteXML = Datei, in der Markierungskonflikte gesetzesübergreifend gespeichert werden

## Bedienoberfläche

- Tastenkürzel = feste Tastenkombination für eine Appaktion
- Hauptfenster = Fenster mit der Hauptansicht; Overlays und Banner erscheinen darin darüber; mehrere Hauptfenster sind möglich
- Hilfsfenster = eigenständige Fenster mit ergänzender Aufgabe (zB Einstellungen, Kommentarfenster)

- Hauptansicht = Tableiste, Seitenleisten und Gesetzestextansicht (ohne geöffnetes Gesetz die Willkommensansicht). Abgrenzung: Overlay und Banner (liegen darüber)
- Gesetzestextansicht = Darstellung des Gesetzes eines Tabs, je Tab eine eigene, mit StrukturKontextLeiste und Auswahlleiste
- StrukturKontextLeiste = obere Leiste, zeigt dem Nutzer, unter welchen Überschriften er sich befindet
- Auswahlleiste = die Leiste erscheint über der Auswahl im Gesetzestext, bietet Markier- und Kopierfunktionen
- Zitat = Normangabe als Text, z.B. "§ 433 Abs. 1 BGB", kann über die Auswahlleiste kopiert werden. Abgrenzung: Verweismarkierung (gespeichert) und getaggter Verweis (Teil des Rechtstextes)
- Favoriten = werden pro Gesetz gespeichert
- Lesezeichen = werden gesetzesübergreifend gespeichert
- Seitenleiste der Hauptansicht = Leiste am linken oder rechten Rand der Hauptansicht; nimmt Favoritenleiste, Lesezeichenleiste und Schnellaktionen auf
- Seitenleisten-Tastenkürzel = Tastenkürzel zum Öffnen von Favoriten (Buchstaben) und Lesezeichen (⌥+Ziffer); nur bei aktivierter Einstellung wirksam
- Schnellaktionen = Symbole in der Seitenleiste der Hauptansicht für die wichtigsten Appaktionen
- Einführung = geführter Ablauf zur Bedienung der Hauptansicht, in dem je Schritt nur die erklärte Aktion bedienbar ist
- aktives Element = das durch Aufruf, Klick, Scrollen oä aktivierte Element; wird zB zum Speichern von Favoriten und Lesezeichen verwendet

- Overlay = vorübergehende Ebene innerhalb des Hauptfensters, die zusätzliche Inhalte oder Bedienmöglichkeiten über der Hauptansicht zeigt
- Öffnen-Overlay = Overlay zum Öffnen eines Gesetzes oder einer Norm durch Eingabe; importiert bei Bedarf. In der Bedienoberfläche „Gesetz oder Norm öffnen“
- Volltextsuche = Suche nach Text in den Normen eines Gesetzes oder aller installierten Gesetze
- Gesetzesübersicht = Overlay zur Verwaltung der Gesetze (Öffnen, Löschen, Exportieren, Gesetzeskurzbefehle)
- Gesetzeskurzbefehl = benutzerdefinierte Tastenkombination zum Öffnen eines bestimmten Gesetzes; in der Gesetzesübersicht kurz „Kurzbefehl"
- Banner = vorübergehende Benachrichtigung innerhalb eines Hauptfensters
- Verlauf = je Tab geführte Liste der zuletzt besuchten Elemente
- Sitzungswiederherstellung = Fenster, Position, Größe und Tabs der letzten Sitzung beim App-Start wiederherstellen. Abgrenzung: Backup-Wiederherstellung (nach Datenverlust); Wiederöffnen eines geschlossenen Tabs (⇧⌘T)
