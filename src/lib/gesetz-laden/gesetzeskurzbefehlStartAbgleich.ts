// Bereinigt erst nach dem Abgleich und nur nach frischer Bestätigung einer fehlenden Datei.
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { bereinigeGesetzeskurzbefehleBeimStart } from '@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher';
import {
  leseSuchverzeichnis,
  pruefeGesetzExistenz,
  mitSuchverzeichnisFuerKurzbefehlsbereinigung,
  type Suchverzeichnis,
} from '@/lib/persistenz/gesetz/gesetz.index';

export async function bereinigeGesetzeskurzbefehleNachAbgleich() {
  const verzeichnis = await leseSuchverzeichnis();
  if (!verzeichnis.abgeglichen) return;
  await bereinigeGesetzeskurzbefehleBeimStart(
    async (gesetz) => {
      const frisch = await leseSuchverzeichnis();
      if (!fehltImAbgeglichenenVerzeichnis(frisch, gesetz)) return false;
      return (await pruefeGesetzExistenz(gesetz)) === 'fehlt';
    },
    (uebernehmen) =>
      mitSuchverzeichnisFuerKurzbefehlsbereinigung(async (frisch) => {
        // Schließt auch Entwertung während einer späteren oder der eigenen Einzelprüfung aus.
        await uebernehmen((gesetz) => fehltImAbgeglichenenVerzeichnis(frisch, gesetz));
      }),
  );
}

function fehltImAbgeglichenenVerzeichnis(stand: Suchverzeichnis, gesetz: Gesetzesreferenz) {
  return (
    stand.abgeglichen &&
    !stand.eintraege.some(
      (eintrag) =>
        eintrag.kurztitel &&
        eintrag.normgeber &&
        gesetzesreferenzSchluessel({
          kurztitel: eintrag.kurztitel,
          normgeber: eintrag.normgeber,
        }) === gesetzesreferenzSchluessel(gesetz),
    )
  );
}
