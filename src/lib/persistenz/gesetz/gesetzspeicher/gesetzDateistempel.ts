// Enger nativer Sammelzugriff; keine Pfade und keine unvollständigen Ergebnisse.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import type { Dateistempel, Suchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { gruppiereDateinamen } from './gesetzSpeicher.dateien';
import { istRecord, normalisierteDateiBasis } from '@/lib/persistenz/kern/kern.index';

export function istDateistempel(wert: unknown): wert is Dateistempel {
  return (
    istRecord(wert) &&
    typeof wert.groesse === 'string' &&
    /^(0|[1-9]\d*)$/.test(wert.groesse) &&
    typeof wert.aenderungszeit === 'string' &&
    /^(0|-?[1-9]\d*)$/.test(wert.aenderungszeit)
  );
}
export function gleicherDateistempel(a: Dateistempel, b: Dateistempel): boolean {
  return a.groesse === b.groesse && a.aenderungszeit === b.aenderungszeit;
}
/** Nur diese Fehler belegen einen nicht vollständig lesbaren Gesetzesordner. */
export class GesetzDateistempelFehler extends Error {
  constructor(ursache: unknown) {
    super(String(ursache), { cause: ursache });
  }
}
export async function leseGesetzDateistempel() {
  try {
    return await leseVollstaendigeListe();
  } catch (ursache) {
    throw new GesetzDateistempelFehler(ursache);
  }
}
async function leseVollstaendigeListe() {
  const dateien = await rufeBefehl('gesetz_dateistempel_lesen');
  if (
    !Array.isArray(dateien) ||
    !dateien.every(
      (d) =>
        istRecord(d) &&
        typeof d.name === 'string' &&
        d.name.toLowerCase().endsWith('.xml') &&
        !/[/\\]/.test(d.name) &&
        istDateistempel(d.dateistempel),
    )
  ) {
    throw new Error('Ungültige Dateistempelliste.');
  }
  return dateien;
}

/** Bestätigt nur die eindeutige aktuelle Gesetzdatei, unabhängig vom Gesamt-Abgleichstand. */
export async function istSuchverzeichniseintragAktuell(
  eintrag: Suchverzeichniseintrag,
): Promise<boolean> {
  if (eintrag.status !== 'in-ordnung') return false;
  try {
    const dateien = await leseGesetzDateistempel();
    const namen = gruppiereDateinamen(dateien).get(normalisierteDateiBasis(eintrag));
    if (namen?.length !== 1) return false;
    const datei = dateien.find((kandidat) => kandidat.name === namen[0]);
    return !!datei && gleicherDateistempel(eintrag.dateistempel, datei.dateistempel);
  } catch {
    // Ein nicht bestätigbarer Stempel darf kein möglicherweise altes Normziel freigeben.
    return false;
  }
}
