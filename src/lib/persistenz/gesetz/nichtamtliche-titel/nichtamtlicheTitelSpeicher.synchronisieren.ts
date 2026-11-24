// Dateiimport und Synchronisieren nichtamtlicher Titel mit dem Resource-Bundle.
import { NICHTAMTLICHE_TITEL_SUFFIX } from '@/lib/persistenz/kern/kern.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  appDatenExistiert,
  appDatenLesenOderNull,
  appDatenSchreiben,
  ermittleGesetzDateipfad,
  nichtamtlicheTitelRessourcenPfad,
} from '@/lib/persistenz/kern/kern.index';
import { ressourcenPfad as resolveResource } from '@/lib/plattform/dateipfade';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

import {
  NICHTAMTLICHE_TITEL_ORDNER,
  mitTitelQuelle,
  sicherstelleOrdner,
} from './nichtamtlicheTitelSpeicher';
// ---------------------------------------------------------------------------
// Datei-Import/-Export (dateiImport.ts/exportSpeicher.ts) – analog zu
// leseMarkierungenRohtext/ersetzeMarkierungenDatei (markierungSpeicher.
// dateiImport.ts): Rohtext für den Inhaltsvergleich, sowie vollständiges
// Ersetzen nach Nutzerentscheidung "Ersetzen" im DateiImportOverlay. Ein
// "Zusammenführen" ist hier bewusst NICHT vorgesehen (siehe Absprache) – bei
// einer Dopplung gibt es im DateiImportOverlay nur den Ersetzen-Button.
// ---------------------------------------------------------------------------

/** Liest den rohen nichtamtlicheTitel-XML-Text eines Gesetzes, oder null,
 *  wenn keine Datei existiert. */
export async function leseNichtamtlicheTitelRohtext(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<string | null> {
  return appDatenLesenOderNull(
    await ermittleGesetzDateipfad(gesetz, NICHTAMTLICHE_TITEL_ORDNER, NICHTAMTLICHE_TITEL_SUFFIX),
    meldungEmpfangen,
  );
}

/** Ersetzt die nichtamtlicheTitel-Datei eines Gesetzes vollständig durch
 *  importInhalt (Erst-Import ODER Datei-Import-"Ersetzen"). Meldet den
 *  Schreibvorgang über meldeNichtamtlicheTitelGeschrieben – markierungen
 *  hängt sich dort ein, um die Markierungskonflikt-Prüfung anzustoßen (siehe
 *  markierungskonflikteSpeicher.ts), OHNE dass diese Datei markierungen selbst
 *  importieren muss. Ursache statt Symptom: statt dass jeder Aufrufer eines
 *  nichtamtlicheTitel-Schreibvorgangs (Datei-Import, Resource-Sync beim
 *  App-Start, Resource-Sync in speichereGesetz()) selbst daran denken muss,
 *  passiert die Meldung hier EINMAL zentral, direkt an der Quelle jeder
 *  tatsächlichen Änderung. Der optionale Empfänger erhält Speicherbefunde;
 *  zielGeschrieben bestätigt synchron nur dieses Zieldateischreiben, vor Folgefehlern. */
export async function ersetzeNichtamtlicheTitelDatei(
  gesetz: Gesetzesreferenz,
  importInhalt: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  zielGeschrieben?: () => void,
): Promise<void> {
  await mitTitelQuelle(
    gesetz,
    async (token, vorgang, melde) => {
      await sicherstelleOrdner();
      await appDatenSchreiben(
        await ermittleGesetzDateipfad(
          gesetz,
          NICHTAMTLICHE_TITEL_ORDNER,
          NICHTAMTLICHE_TITEL_SUFFIX,
        ),
        importInhalt,
        token,
        vorgang,
      );
      zielGeschrieben?.();
      melde('geaendert');
    },
    meldungEmpfangen,
  );
}

// ---------------------------------------------------------------------------
// Resource-Sync (App.tsx-Start + gesetzSpeicher.ts::speichereGesetz) – siehe
// Datei-Kopf. Reine Existenzprüfung, kein Datums-/Versionsvergleich wie bei
// importindexVorinstallation.ts: eine bereits in AppData vorhandene Datei (ob vom
// Nutzer importiert/bearbeitet oder aus einer früheren Synchronisierung)
// bleibt IMMER unangetastet.
// ---------------------------------------------------------------------------

/** Kopiert die mitgelieferte nichtamtlicheTitel-XML für EIN Gesetz aus dem
 *  Resource-Bundle nach AppData – aber NUR, wenn dort noch keine Datei für
 *  dieses Gesetz existiert. Gibt true zurück, wenn tatsächlich kopiert
 *  wurde (für den Aufrufer, um ggf. einen Reload anzustoßen), sonst false. */
export async function synchronisiereEinNichtamtlicheTitel(
  gesetz: Gesetzesreferenz,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  const pfad = await ermittleGesetzDateipfad(
    gesetz,
    NICHTAMTLICHE_TITEL_ORDNER,
    NICHTAMTLICHE_TITEL_SUFFIX,
  );
  const vorhanden = await appDatenExistiert(pfad);
  if (vorhanden) return false;

  const ressourcenPfad = nichtamtlicheTitelRessourcenPfad(gesetz);
  if (ressourcenPfad === null) return false;
  let inhalt: string;
  try {
    const trenner = ressourcenPfad.lastIndexOf('/');
    const ordner = await resolveResource(ressourcenPfad.slice(0, trenner));
    const name = ressourcenPfad.slice(trenner + 1).toLowerCase();
    const treffer = (await readDir(ordner)).filter(
      (eintrag) => !eintrag.isDirectory && eintrag.name.toLowerCase() === name,
    );
    if (treffer.length !== 1) return false;
    inhalt = await readTextFile(`${ordner}/${treffer[0]!.name}`);
  } catch {
    return false; // keine mitgelieferte Datei für dieses Gesetz (Normalfall)
  }

  return mitTitelQuelle(
    gesetz,
    async (token, vorgang, melde) => {
      const aktuellerPfad = await ermittleGesetzDateipfad(
        gesetz,
        NICHTAMTLICHE_TITEL_ORDNER,
        NICHTAMTLICHE_TITEL_SUFFIX,
      );
      if (await appDatenExistiert(aktuellerPfad)) return false;
      await sicherstelleOrdner();
      await appDatenSchreiben(aktuellerPfad, inhalt, token, vorgang);
      melde('geaendert');
      return true;
    },
    meldungEmpfangen,
  );
}

/** Wie synchronisiereEinNichtamtlicheTitel, aber für mehrere Gesetze in
 *  einem Rutsch (App-Start, siehe App.tsx). Gibt true zurück, sobald
 *  MINDESTENS eine Datei neu kopiert wurde – der Aufrufer nutzt das, um die
 *  Gesetzeliste einmal neu zu laden, damit die Titel ohne Neustart
 *  sichtbar werden. */
export async function synchronisiereNichtamtlicheTitelFuerGesetze(
  gesetze: Gesetzesreferenz[],
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  let geaendert = false;
  for (const k of gesetze) {
    if (await synchronisiereEinNichtamtlicheTitel(k, meldungEmpfangen)) geaendert = true;
  }
  return geaendert;
}
