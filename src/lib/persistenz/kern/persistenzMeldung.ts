// Liefert Persistenzmeldungen an den Vorgangsaufrufer; für noch nicht migrierte
// Hauptfensteraufrufe bleibt die bestehende Banneranzeige der Standard.
import {
  istDateibefund,
  type AktionsMeldung,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import { meldeDateibefund, zeigeBanner } from '@/lib/banner/banner.index';

export function meldePersistenzBefund(
  meldung: AktionsMeldung,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): void {
  try {
    if (meldungEmpfangen) meldungEmpfangen(meldung);
    else if (istDateibefund(meldung)) meldeDateibefund(meldung);
    else zeigeBanner({ art: 'dateibefunde', typ: meldung.typ, text: meldung.text });
  } catch (fehler) {
    // Eine defekte Anzeige darf weder den ursprünglichen I/O-Fehler verdecken
    // noch eine bereits ausgeführte Sicherung/Änderung zum Speicherfehler machen.
    console.error('Persistenzmeldung konnte nicht übernommen werden:', fehler);
  }
}
