# Glossar: Navigation

- Normzeile = Normbezeichnung und Titel (amtlicher Normtitel oder nichtamtlicher Titel) als Darstellungselement; bleibt bei eingeklapptem Normtext sichtbar
- Vorläufiges aktives Element = das Element, das während des Scrollens vorgemerkt wird, bevor es zum aktiven Element wird
- Scroll-Nachführung = wird das aktive Element nach Nutzerscrollen weder mit Normzeile noch mit Normtext angezeigt, wird das oberste sichtbare Element aktiv

## Verlauf

Die Regeln stehen in `docs/doku/verlauf.md`.

- Sprung = Wechsel des aktiven Elements durch Zielwahl (Öffnen-Overlay, Verweis, Favorit, Lesezeichen, Kurzbefehl, Gesetzesübersicht, StrukturKontextLeiste ua.); trägt das Ziel in den Verlauf ein. Abgrenzung: Schritt
- Schritt = Wechsel des aktiven Elements im Lesefluss (Pfeilnavigation, Aufklappen nach rechts, Text- oder Titelklick, Scroll-Nachführung); wird nicht sofort, sondern erst nach einer Verweildauer in den Verlauf eingetragen. Abgrenzung: Sprung
- Zeiger = aktuelle Position im Verlauf; 0 ist der neueste Eintrag
- abgewichene Stelle = aktives Element, das vom Verlaufseintrag am Zeiger abweicht, typischerweise nach Schritten
- verlassene Stelle = aktives Element, das eine Navigation (Sprung, „Zurück“) hinter sich lässt
- Nachtragen = weicht das aktive Element vom Eintrag am Zeiger ab, trägt ein Sprung zuerst die verlassene Stelle (bzw. beim Verweisklick das angeklickte Element) und dann sein Ziel in den Verlauf ein
- Rückkehrmarke = vorübergehend gemerkte verlassene Stelle (zB nach „Zurück“ von einer abgewichenen Stelle), zu der „Vorwärts“ zurückführt; kein Verlaufseintrag; verfällt bei jeder weiteren Navigation

## Klappen

- Klappstufe = Einer von vier Zuständen der Ansicht: 1 alles offen, 2 nur Normzeilen (Normtext zu), 3 nur Überschriften, 4 nur oberste Überschriften
- Mischzustand = Zustand, der keiner Klappstufe entspricht, weil einzelne Elemente von Hand auf- oder zugeklappt wurden
- Elternüberschrift = die Überschrift, unter der ein Element unmittelbar eingeordnet ist
