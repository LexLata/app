// konfliktMeldungen.ts
// Vorhandene lokale Meldungsflächen und Hauptfensterhinweise je Konfliktaktion.
import { erzeugeAktionsMeldungsSammlung } from '@/lib/domain/app/aktionsMeldung';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import {
  hinweisAusMeldungen,
  sendeHauptfensterHinweis,
} from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';

export { erzeugeAktionsMeldungsSammlung };

export async function schliesseKonfliktMeldungenAb(
  sammlung: ReturnType<typeof erzeugeAktionsMeldungsSammlung>,
  erfolgreich: boolean,
  gespeichert = false,
): Promise<string | null> {
  const abschluss = await sammlung.warteAufAbschluss(30_000);
  const meldungen: AktionsMeldung[] = [...sammlung.meldungen()];
  if (abschluss === 'wartefrist')
    meldungen.push({
      text: 'Die Prüfung auf Markierungskonflikte konnte nicht zuverlässig abgeschlossen werden. Bitte „Alle Markierungen neu prüfen“ ausführen.',
      typ: 'warnung',
      art: 'fehler',
      anlass: 'pruefabschluss',
      aenderungsstand: 'keine',
    });
  const lokaleFehler = meldungen.filter(
    (m) => m.art === 'fehler' && (!erfolgreich || (!gespeichert && m.aenderungsstand === 'keine')),
  );
  const hinweise = meldungen.filter((m) => !lokaleFehler.includes(m));
  // Alle Meldungen der Aktion gemeinsam: ergibt im Hauptfenster genau ein Banner.
  const hinweis = hinweisAusMeldungen(
    hinweise.map((m) =>
      gespeichert && m.anlass === 'pruefabschluss'
        ? {
            ...m,
            grund: 'konfliktpruefungOffen' as const,
            text: 'Die Änderung wurde gespeichert. Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.',
          }
        : m,
    ),
  );
  if (hinweis) {
    try {
      await sendeHauptfensterHinweis(hinweis);
    } catch (fehler) {
      console.error('Konfliktaktionshinweis konnte nicht übergeben werden:', fehler);
    }
  }
  return [...new Set(lokaleFehler.map((m) => m.text))].join(' ') || null;
}
