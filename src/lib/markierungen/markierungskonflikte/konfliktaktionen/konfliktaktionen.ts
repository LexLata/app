// Gemeinsames Nachladen, Fenstersynchronisierung und Abschlussmeldungen der Konfliktaktionen.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { ladeEintraege } from '@/lib/markierungen/eintrag/eintrag.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { AnzeigeGesetzKonflikte } from '@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';

/** Sendet die Änderungsmeldung an offene Hauptfenster. Wartet die
 * Ereignisübertragung ab, nicht das Neuladen der empfangenden Fenster. */
export async function synceMarkierungsAenderung(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  geaendert = true,
): Promise<void> {
  const { emitTo } = await import('@tauri-apps/api/event');
  try {
    await emitTo({ kind: 'Any' }, 'markierungen-geaendert', { gesetz });
  } catch (fehler) {
    if (!meldungEmpfangen) throw fehler;
    meldePersistenzBefund(
      {
        text: geaendert
          ? 'Die Markierungen wurden geändert. Andere Fenster konnten nicht über die Änderung benachrichtigt werden.'
          : 'Andere Fenster konnten nicht über den aktuellen Markierungsstand benachrichtigt werden.',
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'synchronisation',
        aenderungsstand: geaendert ? 'vollstaendig' : 'keine',
      },
      meldungEmpfangen,
    );
  }
}

/** Nach einer bestätigten Löschung bleibt ein Prüfproblem ein Folgehinweis. */
export async function pruefeNachLoeschung(
  pruefen: () => Promise<unknown>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  geaendert = true,
): Promise<void> {
  try {
    await pruefen();
  } catch (fehler) {
    if (!meldungEmpfangen) throw fehler;
    meldePersistenzBefund(
      {
        text: `${geaendert ? 'Die Markierungen wurden gelöscht. ' : ''}Die Prüfung auf Markierungskonflikte konnte nicht zuverlässig abgeschlossen werden. Bitte „Alle Markierungen neu prüfen“ ausführen.`,
        typ: 'warnung',
        art: geaendert ? 'hinweis' : 'fehler',
        anlass: 'pruefabschluss',
        aenderungsstand: geaendert ? 'vollstaendig' : 'keine',
      },
      meldungEmpfangen,
    );
  }
}

/** Lädt die volle MarkierungsEintrag zu einem AnzeigeKonfliktEintrag.schluessel
 *  nach (siehe dort) – Ausgangspunkt für praktisch jede Konfliktaktion. */
export async function ladeLiveEintrag(
  gesetz: Gesetzesreferenz,
  schluessel: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<MarkierungsEintrag | undefined> {
  const alle = await ladeEintraege(gesetz, meldungEmpfangen);
  return alle.find((e) => identitaetsSchluessel(e) === schluessel);
}

/** Dedupliziert fehlende Ausgangs- und Zielgesetze nach vollständiger Referenz. */
export function ermittleFehlendeGesetze(gesetze: AnzeigeGesetzKonflikte[]): Gesetzesreferenz[] {
  const fehlende = new Map<string, Gesetzesreferenz>();
  const merke = (gesetz: Gesetzesreferenz) =>
    fehlende.set(gesetzesreferenzSchluessel(gesetz), gesetz);
  for (const g of gesetze) {
    if (g.fehlendesGesetz) merke(g.gesetz);
    for (const eintrag of g.eintraege) {
      for (const ziel of eintrag.zielKonflikte) {
        if (ziel.typ === 'zielGesetzFehlt') merke(ziel.gesetz);
      }
    }
  }
  return [...fehlende.values()];
}
