# Umbruchschutz

Diese Datei hält Ziel, Prüfmeldungen und zulässige Unterdrückungen des
Umbruchschutzes fest.

- **Ziel:** Zusammengehörige Normangaben wie „§ 9“ sollen bei der Anzeige nicht auseinandergerissen werden. Der Schutz verändert nur die Darstellung; gespeicherter Text, Eingaben, Suche und fachliches Kopieren behalten die Originaldaten. Regeln: [Textnachbearbeitung](../../src/lib/domain/basis/textNachbearbeitung.ts).
- **Anzeigewege:** [Textanzeige](../../src/components/textanzeige/textanzeige.index.ts), [Gesetzestext und Markierungen](../../src/components/gesetzestextansicht/markierung/markierung.index.ts) sowie [native Übergaben](../../src/lib/plattform/tauriHelpers.ts).
- **Meldungen:** Die [ESLint-Regel](../../eslint-rules/textanzeige-verbindlich.cjs) meldet Text, sichtbare Attribute sowie native, DOM- und Canvas-Ausgaben außerhalb geprüfter Anzeigewege; ebenso unklare Ausgabe-Props. Die [Ausnahmekontrolle](../../scripts/automatisch/textanzeige-ausnahmen.mjs) meldet ungültige, leere oder mehrere Ausgaben verdeckende Unterdrückungen. Der [Auditbericht](../../scripts/audit/audit-eslint.mjs) führt Befunde und Ausnahmen in `.reports/eslint.txt` auf.
- **Unterdrückung:** Nur `eslint-disable-next-line` für `lexlata/textanzeige-verbindlich`, für genau eine tatsächlich gemeldete Ausgabe. Die Begründung nennt einen zulässigen Grund und die konkrete Stelle: „Bereits geschützt“, „Keine Textanzeige“ oder „Reines Symbol“. Eine Unterdrückung darf keinen fehlenden Schutz ersetzen.
