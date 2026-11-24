# LexLata

LexLata ist eine Desktop-Anwendung zum Lesen, Durchsuchen und Annotieren von Rechtstexten:

- Bundesrecht (gesetze-im-internet.de)
- Landesrecht Baden-Württemberg (landesrecht-bw.de)
- EU-Recht (EUR-Lex)

**Status: Alpha.** Die App befindet sich in aktiver Entwicklung. Es ist nicht ausgeschlossen, dass Gesetze und Nutzerdaten durch ein Update verloren gehen. Daten können jedoch jederzeit exportiert werden.

## Funktionen

- Import und automatische Aktualisierung von Gesetzestexten aus amtlichen Quellen
- Übersichtliche Darstellung, dynamisches Inhaltsverzeichnis durch Zuklappen von Ebenen
- Markierungen (Unterstreichung, Hervorhebung, Verweise, Kommentare) anlegen und Konflikte bei Veränderung des Gesetzes erkennen
- Lesezeichen, Favoriten und Gesetzeskurzbefehle
- Tabs mit Verlauf

## Hinweise

- **Keine Rechtsberatung.** Die Texte sind Abrufe der genannten Portale und keine amtliche Fassung; maßgeblich sind die Veröffentlichungen der jeweiligen Stellen. Keine Gewähr für Richtigkeit, Vollständigkeit und Aktualität.
- **Datenschutz:** Die App sammelt keine Nutzungsdaten. Beim Import werden die Portale abgerufen. Details: [DATENSCHUTZ.md](DATENSCHUTZ.md).

## Plattformunterstützung

| System  | Voraussetzung                                                |
| ------- | ------------------------------------------------------------ |
| macOS   | 12 (Monterey) oder neuer – primär entwickelt und getestet    |
| Windows | 10 (Version 1809+) oder 11                                   |
| Linux   | webkit2gtk ≥ 2.40, z. B. Ubuntu 22.04, Debian 12, Fedora 37+ |

## Selbst bauen

Voraussetzungen: [Node.js](https://nodejs.org), [Rust](https://rustup.rs) und die [Tauri-Systemabhängigkeiten](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run tauri dev      # Entwicklung
npm run tauri build    # Installationspakete
```

## Lizenz

Copyright (C) 2026 LexLata (lexlata@mailbox.org)

Der Quelltext steht unter der [GNU Affero General Public License v3.0 oder später](LICENSE) (AGPL-3.0-or-later). Lizenzen der Drittkomponenten: [THIRD-PARTY-LICENSES](THIRD-PARTY-LICENSES).

Ausgenommen sind Name und Logo (`src-tauri/icons/` ohne `icons/menu/`) sowie die nichtamtlichen Titel (`src-tauri/resources/nichtamtliche-titel/`); hierfür werden keine Nutzungsrechte eingeräumt.
