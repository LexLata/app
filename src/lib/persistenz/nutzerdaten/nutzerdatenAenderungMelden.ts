// Meldet erfolgreiche Nutzerdatenänderungen nach Freigabe der Dateisperre.
// Meldungs- und Warnungsfehler ändern den Erfolg der Speicherung nicht.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';

export async function nutzerdatenAenderungMelden(
  ereignis: 'favoriten-geaendert' | 'lesezeichen-geaendert' | 'gesetzeskurzbefehle-geaendert',
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  try {
    const { emitTo } = await import('@tauri-apps/api/event');
    await emitTo('*', ereignis);
  } catch (fehler) {
    console.error('Nutzerdaten gespeichert, Änderungsmeldung fehlgeschlagen:', fehler);
    meldePersistenzBefund(
      {
        typ: 'warnung',
        art: 'hinweis',
        anlass: 'synchronisation',
        aenderungsstand: 'vollstaendig',
        text: 'Die Daten wurden gespeichert. Geöffnete Fenster zeigen den aktuellen Stand möglicherweise erst nach erneutem Öffnen.',
      },
      meldungEmpfangen,
    );
  }
}
