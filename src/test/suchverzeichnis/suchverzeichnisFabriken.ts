// Eingabe- und Trefferformen des Öffnen-Overlays für bestehende Verhaltensbeispiele.
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { leiteSuchverzeichniseintragAb } from '@/lib/domain/app/oeffnen/oeffnen.index';

export function alsSuchverzeichniseintrag(gesetz: GesetzDarstellung) {
  return leiteSuchverzeichniseintragAb(gesetz, { groesse: '1', aenderungszeit: '1' });
}
export function alsSuchverzeichniseintraege(gesetze: readonly GesetzDarstellung[]) {
  return gesetze.map(alsSuchverzeichniseintrag);
}
export function suchtrefferKopfangaben(gesetz: Gesetzesreferenz & { langtitel: string }) {
  return {
    gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
    langtitel: gesetz.langtitel,
  };
}

export function suchverzeichnisTestdatei(gesetze: readonly GesetzDarstellung[]) {
  return JSON.stringify({
    version: 1,
    abgeglichen: true,
    eintraege: alsSuchverzeichniseintraege(gesetze),
  });
}
