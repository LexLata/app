// Ein regulärer ESLint-Bestandsaudit mit unabhängiger Kontrolle lokaler Textanzeige-Ausnahmen.
import { ESLint } from 'eslint';
import {
  istProduktionsdatei,
  pruefeAusnahmedateien,
} from '../automatisch/textanzeige-ausnahmen.mjs';

try {
  const eslint = new ESLint();
  const ergebnisse = await eslint.lintFiles(['.']);
  const produktionsdateien = ergebnisse.map((e) => e.filePath).filter(istProduktionsdatei);
  if (produktionsdateien.length === 0) throw new Error('Kein Produktionsbestand geprüft.');
  for (const filePath of produktionsdateien) {
    const config = await eslint.calculateConfigForFile(filePath);
    if (config?.rules?.['lexlata/textanzeige-verbindlich']?.[0] !== 2) {
      throw new Error(`Textanzeigeregel nicht aktiviert: ${filePath}`);
    }
  }
  const formatter = await eslint.loadFormatter('stylish');
  const bericht = formatter.format(ergebnisse);
  if (bericht) console.log(bericht);
  if (ergebnisse.some((e) => e.fatalErrorCount > 0))
    throw new Error('ESLint-Rohprüfung fehlgeschlagen.');
  const { ausnahmen, fehler } = await pruefeAusnahmedateien(produktionsdateien);
  console.log(`Textanzeige-Ausnahmen: ${ausnahmen.length}`);
  for (const ausnahme of ausnahmen) {
    console.log(
      `${ausnahme.datei}:${ausnahme.zeile}:${ausnahme.spalte}: ${ausnahme.gueltig ? 'gültig' : 'UNGÜLTIG'} — ${ausnahme.begruendung}`,
    );
  }
  for (const meldung of fehler) console.error(meldung);
  // Nur Schutz-/Ausnahmefehler ändern den Status des vollständigen Bestandsaudits.
  // Sonstige ESLint-Befunde bleiben sichtbar, ohne dessen beratenden Maßstab zu ändern.
  const schutzfehler = ergebnisse.some((e) =>
    e.messages.some((m) => m.ruleId === 'lexlata/textanzeige-verbindlich' && m.severity === 2),
  );
  const sonstigeBefunde = ergebnisse.some((e) => e.errorCount > 0 || e.warningCount > 0);
  if (!schutzfehler && fehler.length === 0 && sonstigeBefunde)
    console.log('Sonstige ESLint-Befunde bleiben beratend.');
  process.exitCode = fehler.length > 0 || schutzfehler ? 1 : sonstigeBefunde ? 3 : 0;
} catch (fehler) {
  console.error(fehler);
  process.exitCode = 2;
}
