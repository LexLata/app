// markierungsHinweise.ts
// Flüchtige Hinweise beider Markierungsformulare vor Fensterabschluss übergeben.
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import {
  hinweisAusMeldungen,
  sendeHauptfensterHinweis,
} from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';

export async function uebergebeMarkierungsFensterHinweise(
  meldungen: AktionsMeldung[],
  oeffner: string,
  ersterSatz: string,
  abgeschlossen: boolean,
  diagnose: string,
) {
  // Alle Meldungen gemeinsam: ergibt im Hauptfenster genau ein Banner.
  const hinweis = hinweisAusMeldungen(
    meldungen.map((meldung) => ({
      ...meldung,
      text:
        meldung.anlass === 'pruefabschluss'
          ? `${ersterSatz} Die Prüfung auf Markierungskonflikte konnte jedoch nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.`
          : abgeschlossen && meldung.art === 'fehler'
            ? `${ersterSatz} Beim Laden der Quelldateien wurde gemeldet: ${meldung.text}`
            : meldung.text,
      grund: meldung.anlass === 'pruefabschluss' ? 'konfliktpruefungOffen' : meldung.grund,
    })),
  );
  if (!hinweis) return;
  try {
    await sendeHauptfensterHinweis(hinweis, oeffner);
  } catch (fehler) {
    // Hinweistransport ändert weder Ausgangsstellenprüfung noch Eingaben.
    console.error(diagnose, fehler);
  }
}
