// Alle wartenden Aktionsaufrufer erhalten Befunde und Folgeläufe desselben Dateilaufs.
import {
  erfasseAktionsFolgelauf,
  type AktionsMeldung,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
export function erzeugeGesetzLaufMeldungen(bestandAktiv = () => true) {
  let aktiv = true;
  const standardGemeldet = new Set<AktionsMeldung>();
  const empfaenger = new Set<AktionsMeldungEmpfaenger>();
  const meldungen: AktionsMeldung[] = [];
  const folgelaeufe: Promise<unknown>[] = [];
  const empfangen: AktionsMeldungEmpfaenger = (meldung) => {
    if (!aktiv || !bestandAktiv()) return;
    meldungen.push(meldung);
    for (const empfang of empfaenger) meldePersistenzBefund(meldung, empfang);
  };
  empfangen.folgelaufErfassen = (lauf) => {
    if (!aktiv || !bestandAktiv()) return;
    folgelaeufe.push(lauf);
    for (const empfang of empfaenger) erfasseAktionsFolgelauf(empfang, lauf);
  };
  const titelEmpfangen: AktionsMeldungEmpfaenger = (meldung) => {
    empfangen(meldung);
    if (aktiv && bestandAktiv() && !empfaenger.size) {
      standardGemeldet.add(meldung);
      meldePersistenzBefund(meldung);
    }
  };
  titelEmpfangen.folgelaufErfassen = empfangen.folgelaufErfassen;
  return {
    empfangen,
    titelEmpfangen,
    meldeStandard() {
      if (!aktiv || !bestandAktiv() || empfaenger.size) return;
      for (const meldung of meldungen)
        if (meldung.anlass !== 'lesen' && !standardGemeldet.has(meldung)) {
          standardGemeldet.add(meldung);
          meldePersistenzBefund(meldung);
        }
    },
    beenden() {
      aktiv = false;
      empfaenger.clear();
    },
    hatEmpfaenger: () => empfaenger.size > 0,
    anschliessen(empfang?: AktionsMeldungEmpfaenger) {
      if (!aktiv || !bestandAktiv() || !empfang || empfaenger.has(empfang)) return;
      empfaenger.add(empfang);
      for (const meldung of meldungen) meldePersistenzBefund(meldung, empfang);
      for (const lauf of folgelaeufe) erfasseAktionsFolgelauf(empfang, lauf);
    },
  };
}
