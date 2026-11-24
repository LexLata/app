// Optionale mitgelieferte Titel ergänzen ein gültiges Gesetz ohne zweiten Gesetzesdateizugriff.
import {
  erzeugeAktionsMeldungsWeiterleitung,
  type AktionsMeldungEmpfaenger,
} from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  hatNormenOhneTitel,
  synchronisiereEinNichtamtlicheTitel,
  synchronisiereNichtamtlicheTitelFuerGesetze,
  ladeNichtamtlicheTitel,
  wendeNichtamtlicheTitelAn,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import { getSnapshot, zeigeBanner } from '@/lib/banner/banner.index';
function titelabgleichFehlertext(gesetz: Gesetzesreferenz) {
  return `Die nichtamtlichen Titel für „${gesetz.kurztitel}“ konnten nicht abgeglichen werden. Das Gesetz bleibt ohne diese Ergänzungen nutzbar.`;
}
function meldeGlobalenTitelabgleichFehler(gesetz: Gesetzesreferenz) {
  const text = titelabgleichFehlertext(gesetz);
  const lesefehler = `Die Titeldatei für „${gesetz.kurztitel}“ konnte nicht gelesen werden. Ihre Titel werden derzeit nicht angezeigt.`;
  if (!getSnapshot().some((b) => b.text === text || b.text === lesefehler))
    zeigeBanner({ art: 'systemfehler', typ: 'fehler', text });
}
/** Optionale Titelkopie für Referenzen, ohne das Gesetz selbst zu laden. */
export async function gleicheGesetzHintergrundtitelAb(gesetz: Gesetzesreferenz): Promise<boolean> {
  try {
    return await synchronisiereEinNichtamtlicheTitel(gesetz);
  } catch {
    meldeGlobalenTitelabgleichFehler(gesetz);
    return false;
  }
}
export async function gleicheGesetzTitelAb(
  gesetz: GesetzDarstellung,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  hatLokaleEmpfaenger = () => !!meldungEmpfangen,
) {
  if (!hatNormenOhneTitel(gesetz)) return;
  let gemeldet = false;
  const empfangen = erzeugeAktionsMeldungsWeiterleitung(meldungEmpfangen, (meldung) => {
    gemeldet = true;
    meldePersistenzBefund(meldung, meldungEmpfangen);
  });
  try {
    if (await synchronisiereNichtamtlicheTitelFuerGesetze([gesetz], empfangen)) {
      const titel = await ladeNichtamtlicheTitel(gesetz, empfangen);
      if (titel) wendeNichtamtlicheTitelAn(gesetz, titel);
    }
  } catch {
    const text = titelabgleichFehlertext(gesetz);
    if (meldungEmpfangen && hatLokaleEmpfaenger()) {
      if (!gemeldet)
        meldePersistenzBefund(
          {
            typ: 'fehler',
            art: 'fehler',
            anlass: 'synchronisation',
            aenderungsstand: 'keine',
            text,
          },
          meldungEmpfangen,
        );
      return;
    }
    meldeGlobalenTitelabgleichFehler(gesetz);
  }
}
