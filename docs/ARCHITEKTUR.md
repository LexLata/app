# Architektur von LexLata

## Einstieg und Zuständigkeiten

[Start](../src/main.tsx) initialisiert das Fenster und wählt dessen Wurzel. Auf dem Desktop verbindet [App](../src/App.tsx) Tabsteuerung, Öffnen, Markierungen und Fensterstart mit Hauptansicht und Overlays. [Tabsteuerung](../src/hooks/tabs/useAppTabs.ts) besitzt Tabs und bindet Verlauf und Fensterbestand ein. `src/mobile/MobileApp.tsx` nutzt gemeinsame Fachmodule ohne Desktop-Tabs und Mehrfenstersteuerung.

Schichten: Oberfläche (`components`), Zustand und Abläufe (`hooks`), Fachlogik und Plattform (`lib`). Hooks verwenden keine Oberflächen; `lib` verwendet weder Hooks noch Oberflächen. Domain enthält Modelle und Regeln. Domain, Darstellung und Helfer bleiben unabhängig von React, Tauri und Fachabläufen. Begriffe: [Glossar](GLOSSAR.md).

- [Gemeinsame Suchlogik](../src/lib/domain/app/oeffnen/oeffnen.index.ts): Eingabe, Rangfolge und Normziele für Öffnen-Overlay, Mobile und Öffnen-Links.
- [Import](../src/lib/import/import.index.ts): Beschaffung, Konvertierung, Nachbereitung und Aktualisierung. [Import/Export](../src/lib/import-export/import-export.index.ts): Dateiaustausch mit Konfliktentscheidungen.
- [Markierungen](../src/lib/markierungen/markierungen.index.ts): Änderungen, Speicherung, Rückgängig/Wiederholen, Hilfsfensteraktionen und Zitate. `markierungs-xml` besitzt MarkierungsXML und MarkierungskonflikteXML. [Konfliktprüfung](doku/markierungskonflikte.md).
- [Gesetzestextansicht](../src/components/gesetzestextansicht/gesetzestextansicht.index.ts): Struktur, Kontext, Auswahl und virtualisierte Textdarstellung mit abbrechbarer Navigation. Sichtbare Textausgaben bündelt `src/components/textanzeige/`; Darstellungsvorgaben: `src/lib/stil/`.

## Daten und Zustandsgrenzen

GesetzesXML und Nutzerdatendateien im App-Datenordner sind fensterübergreifend maßgeblich. Das [Suchverzeichnis](doku/abgeleitete-daten.md) wird aus Gesetzesdateien abgeleitet und kann neu aufgebaut werden. Dateiverträge: [XML-Formate](doku/xml-formate.md).

- [Persistenzkern](../src/lib/persistenz/kern/kern.index.ts): Pfade, Dateioperationen und Sperren. [Gesetzspeicher](../src/lib/persistenz/gesetz/gesetz.index.ts): GesetzesXML, nichtamtlicheTitelXML und Suchverzeichnis. `src/lib/persistenz/nutzerdaten/`: Favoriten, Lesezeichen, Gesetzeskurzbefehle und zuletzt aktive Elemente. [Datenverlustschutz](doku/schutz-vor-datenverlust.md).
- [Fensterbestand](../src/lib/gesetz-laden/gesetz-laden.index.ts): geladene Darstellungsdaten je Gesetzesreferenz, gebündelte Ladezugriffe, Titelabgleich, Behalten und Vorladen. Die Haltegrenze entlädt keine Gesetze offener Tabs.
- Tabs halten Gesetzesreferenz und Ladezustand; mehrere Tabs können dieselben Daten im Fensterbestand verwenden. Verlauf, Scroll- und Klappzustand gehören zum jeweiligen Tab. Markierungshistorie und Banner sind ebenfalls fensterlokal. [Tabs und Verlauf](doku/verlauf.md).
- [Tab-Bereithaltung und Verlauf-Bereithaltung](../src/hooks/tabs/useTabBereithaltung.ts) halten bereits aufgebaute Gesetzestextansichten in React `Activity`. Ihr Budget betrifft aufgebaute Ansichten, getrennt von den Gesetzesdaten im Fensterbestand. Ansichten gelten nur für ihren Datenstand.
- [Einstellungen](../src/lib/einstellungen/einstellungen.index.ts) liegen in localStorage mit Dateibackup. [Fenstersitzungen](../src/lib/persistenz/fenster/fenster.index.ts) verwenden localStorage; geschlossene Tabs bilden einen gemeinsamen Stapel.

## Vom Öffnen zur Anzeige

1. Das Öffnen-Overlay berechnet mit der gemeinsamen Suchlogik Treffer aus Suchverzeichnis und Importindizes. Ein Importangebot wird zunächst importiert; sein Normziel wird danach aufgelöst.
2. Die [Öffnungssteuerung](../src/hooks/tabs/useGesetzOeffnen.ts) lädt bzw. importiert zuerst; erst bei Erfolg wählt sie den Tab und schreibt den Verlauf fort. Fehler zeigen nur ein Banner. Neuere Öffnungen lösen ältere ab. Sie bedient auch Verweise, Favoriten, Lesezeichen und Links. Adressierung: [Normadressierung](doku/adressierungsformat-eingefroren.md).
3. Der Fensterbestand lädt über den Gesetzspeicher. [Darstellung](../src/lib/darstellung/darstellung.index.ts) übersetzt GesetzesXML in Darstellungsdaten; beim Laden werden nichtamtliche Titel abgeglichen. Der Tab verweist auf den geladenen Stand; die Ansicht zeigt ihn und führt den Sprung aus.

Beim [Fensterstart](doku/app-start.md) werden gespeicherte Tabs als Referenzen wiederhergestellt und der aktive Tab zuerst geladen. Rust vergibt den Besitz der gemeinsamen App-Start-Aufgaben, darunter die Vorbereitung von Suchverzeichnis und Importindizes.

## Dateiänderungen und Fensterkommunikation

Speicherwege melden Gesetzesänderungen und Löschungen global. Jeder Fensterbestand entwertet betroffene Ladezugriffe, lädt benötigte Daten erneut und benachrichtigt seine Verbraucher. Die Tabanbindung übernimmt neue Datenstände; die Gesetzverwaltung schließt Tabs gelöschter Gesetze. Das Suchverzeichnis wird gesondert abgeglichen.

[Fensterkommunikation](../src/lib/plattform/fensterkommunikation/fensterkommunikation.index.ts) trennt globale Bestandsmeldungen von gerichteten Fensteraktionen. Rust koordiniert appweit Dateisperren, Importvorgänge, Fensterübergaben, Startaufgaben, den App-Update-Zustand und die Beenden-Anfrage; die fachlichen Abläufe bleiben in TypeScript. Getypte native Aufrufe: `src/lib/plattform/tauri-befehle/`. Tabübertragungen laden das Gesetz im Zielfenster und übernehmen den Sitzungszustand.

Menüstatus und -aktionen sind dem zuständigen Fenster zugeordnet; auf macOS ist das Menü appweit. `src/lib/plattform/tastenkuerzel/` bündelt Tastenkürzel.

## Modulgrenzen und Prüfung

Module sind von außen nur über ihr Interface zugänglich; dieses reicht keine fremden Zuständigkeiten durch und bietet nur genutzte Namen an. Laufzeitkreise sind verboten. Bereichsregeln und Strukturprüfungen: [Modulstruktur](doku/modulstruktur.md). `npm run pruefen` prüft Code und Dokumentation einschließlich der Grenze von 6.000 Zeichen für diese Übersicht.
