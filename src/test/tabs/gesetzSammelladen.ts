// Szenariohilfe: orchestriert ausschließlich öffentliche Einzelzugriffe, kein eigener Ladepfad.
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import {
  appDatenOrdnerLesen,
  referenzAusDateiBasis,
  sicherstelleOrdner,
} from '@/lib/persistenz/kern/kern.index';
import {
  leseGesetz,
  meldeGesetzBefundeAnEmpfaenger,
  type GesetzLadeBefund,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { messeAsync, messeMitHauptfaden } from '@/lib/utils/perfMessung';
export async function ladeAlleGesetze(
  meldeBefunde?: (befunde: GesetzLadeBefund[]) => void | Promise<void>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung[]> {
  let befundeAnzahl = 0;
  return messeMitHauptfaden('Vollladen', () =>
    messeAsync(
      'ladeAlleGesetze',
      async () => {
        const gesetze: GesetzDarstellung[] = [];
        const befunde: GesetzLadeBefund[] = [];
        try {
          await sicherstelleOrdner('gesetze');
          for (const datei of await appDatenOrdnerLesen('gesetze')) {
            if (datei.isDirectory || !datei.name?.toLowerCase().endsWith('.xml')) continue;
            const referenz = referenzAusDateiBasis(datei.name.slice(0, -4));
            if (!referenz) continue;
            const ergebnis = await messeAsync(
              `Gesetz vollständig: ${datei.name.slice(0, -4)}`,
              () => leseGesetz(referenz, meldungEmpfangen),
            );
            if (ergebnis.status === 'geladen') gesetze.push(ergebnis.gesetz);
            else befunde.push(...ergebnis.befunde);
          }
        } catch (fehler) {
          befunde.push({
            status: 'ordner_unlesbar',
            fehler: String(fehler instanceof Error ? fehler.message : fehler),
          });
        }
        // Einzelzugriffe melden ihre eigenen Dateibefunde; der Ordnerzugriff gehört dieser Szenariohilfe.
        meldeGesetzBefundeAnEmpfaenger(
          befunde.filter((befund) => befund.status === 'ordner_unlesbar'),
          meldungEmpfangen,
        );
        try {
          await meldeBefunde?.(befunde);
        } catch {
          /* Meldungen ändern das Leseergebnis nicht. */
        }
        befundeAnzahl = befunde.length;
        return gesetze.sort((a, b) => a.kurztitel.localeCompare(b.kurztitel, 'de'));
      },
      (gesetze) => `${gesetze.length} Gesetze, ${befundeAnzahl} Befunde`,
    ),
  );
}
