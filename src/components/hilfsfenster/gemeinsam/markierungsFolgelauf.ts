// markierungsFolgelauf.ts
// Begrenzter Folgelaufabschluss außerhalb der Prüfqueue für beide Markierungsfenster.
import type {
  AktionsMeldung,
  erzeugeAktionsMeldungsSammlung,
} from '@/lib/domain/app/aktionsMeldung';

// Importabschlüsse behalten ihre gesetzesbezogenen Originalbündel. Die
// Wartefrist liefert deshalb einen getrennten, zunächst neutralen Befund.
export async function warteAufMarkierungsFensterFolgebefunde(
  sammlung: ReturnType<typeof erzeugeAktionsMeldungsSammlung>,
) {
  const abschluss = await sammlung.warteAufAbschluss(30_000);
  return {
    meldungen: sammlung.meldungen(),
    fristMeldung:
      abschluss === 'wartefrist'
        ? ({
            text: 'Die Prüfung auf Markierungskonflikte konnte nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.',
            typ: 'warnung',
            art: 'hinweis',
            anlass: 'pruefabschluss',
            aenderungsstand: 'keine',
          } satisfies AktionsMeldung)
        : undefined,
  };
}

export async function sammleMarkierungsFensterFolgebefunde(
  sammlung: ReturnType<typeof erzeugeAktionsMeldungsSammlung>,
  gespeichert: boolean,
  vorausgehendeMeldungen: readonly AktionsMeldung[] = [],
): Promise<AktionsMeldung[]> {
  // Erst nach Arbeitsende warten, auch nach einer Ausnahme. Quellabschlüsse
  // können Folgeaufträge in derselben Prüfqueue anmelden.
  const folgebefunde = await warteAufMarkierungsFensterFolgebefunde(sammlung);
  const meldungen = [...vorausgehendeMeldungen, ...folgebefunde.meldungen];
  if (folgebefunde.fristMeldung)
    meldungen.push({
      ...folgebefunde.fristMeldung,
      // Nur das eigene Speicherergebnis oder gemeldete Änderungen belegen
      // einen Änderungsstand; weder Folgelaufende noch dessen Frist tun dies.
      aenderungsstand: gespeichert
        ? 'vollstaendig'
        : meldungen.some((meldung) => meldung.aenderungsstand !== 'keine')
          ? 'teilweise'
          : 'keine',
    });
  return meldungen;
}
