// Gemeinsame Startaufgaben; Rust vergibt den Besitzer und bestätigt nur dessen aktuellen Schritt.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import {
  hoereImEigenenFenster,
  sendeGlobal,
} from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { synchronisiereStartupImportindizes } from '@/lib/import/import.index';
import { leseSuchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  bereiteSuchverzeichnisVor,
  gleicheGesetzHintergrundtitelAb,
  bereinigeGesetzeskurzbefehleNachAbgleich,
} from '@/lib/gesetz-laden/gesetz-laden.index';
import {
  pruefeMarkierungenBeimStart,
  pruefeErforderlicheVollpruefung,
} from '@/lib/markierungen/markierungen.index';
import { messeMitHauptfaden } from '@/lib/utils/perfMessung';

/** Zahl der gemeinsamen Startaufgaben; Rust (commands/startaufgaben.rs) zählt
 *  dieselben Schritte. `startaufgaben_fortschritt` erreicht diesen Wert, wenn alle
 *  abgeschlossen sind. */
export const STARTAUFGABEN_ANZAHL = 5;

async function gleicheHintergrundtitelAb(aktiv: () => boolean) {
  for (const eintrag of (await leseSuchverzeichnis()).eintraege) {
    if (!aktiv()) return;
    if (eintrag.status !== 'in-ordnung' || !eintrag.hatNormenOhneTitel) continue;
    const referenz = { kurztitel: eintrag.kurztitel, normgeber: eintrag.normgeber };
    if (await gleicheGesetzHintergrundtitelAb(referenz)) {
      // Die Datei ändert sich ohne XML-Laden. Bereits geladene Bestände wenden
      // ihre Titel über den bestehenden Änderungsweg erneut an.
      await sendeGlobal('gesetze-geaendert', [referenz]);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** Erst nach Sitzungswiederherstellung anmelden; jeder Aufruf gehört einem Fensterkontext. */
export function empfangeAppStartAufgaben(
  importindizesBereit: () => void,
  importindizesFehler: (fehler: unknown) => void = () => {},
) {
  const anmeldung = crypto.randomUUID();
  let aktiv = true;
  let laeuft = false;
  let erneut = false;
  let angemeldet = false;
  let importindexVorbereitungBeendet = false;
  function meldeImportindizesBereit() {
    if (!aktiv || importindexVorbereitungBeendet) return;
    importindexVorbereitungBeendet = true;
    importindizesBereit();
  }
  function meldeImportindexFehler(fehler: unknown) {
    if (!aktiv || importindexVorbereitungBeendet) return;
    importindexVorbereitungBeendet = true;
    importindizesFehler(fehler);
  }
  async function pruefeImportindexFortschritt() {
    if ((await rufeBefehl('startaufgaben_fortschritt')) >= 1) meldeImportindizesBereit();
  }
  let abschluss = Promise.resolve();
  const schritte = [
    synchronisiereStartupImportindizes,
    async () => {
      if (!(await bereiteSuchverzeichnisVor()))
        throw new Error('Der Suchverzeichnisabgleich konnte nicht abgeschlossen werden.');
      // Auch ein leerer oder unveränderter Bestand hat nun einen bestätigten
      // Verzeichnisstand; andere Fenster müssen ihre Vorbereitungsanzeige auffrischen.
      if (aktiv) await sendeGlobal('gesetze-geaendert', []);
    },
    async () => gleicheHintergrundtitelAb(() => aktiv),
    async () => {
      await messeMitHauptfaden('Markierungsprüfung', pruefeMarkierungenBeimStart);
      // Ein Nachfolgefenster hat keine main-Startvorbereitung. Der bestehende
      // strenge Weg entscheidet frisch über noch offenen Vollbedarf und wartet
      // dabei auch auf fremde Quellen und Prüfungen.
      await pruefeErforderlicheVollpruefung();
    },
    bereinigeGesetzeskurzbefehleNachAbgleich,
  ];
  async function fuehreSchritteAus() {
    await pruefeImportindexFortschritt();
    let auftrag = await rufeBefehl('startaufgaben_lesen', { anmeldung });
    while (aktiv && auftrag) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!aktiv) return;
      const schritt = schritte[auftrag.schritt];
      if (!schritt) throw new Error('Unbekannte App-Startaufgabe');
      await schritt();
      if (!aktiv) return;
      const importindexSchritt = auftrag.schritt === 0;
      auftrag = await rufeBefehl('startaufgaben_abschliessen', { anmeldung, ...auftrag });
      if (importindexSchritt) {
        if (auftrag) meldeImportindizesBereit();
        else await pruefeImportindexFortschritt();
      }
    }
  }
  async function abarbeiten() {
    if (!aktiv) return;
    laeuft = true;
    try {
      do {
        erneut = false;
        await fuehreSchritteAus();
      } while (aktiv && erneut);
    } finally {
      laeuft = false;
    }
  }
  const wecken = () => {
    if (laeuft) {
      erneut = true;
      return;
    }
    abschluss = abarbeiten().catch((fehler: unknown) => {
      meldeImportindexFehler(fehler);
      console.error('App-Startaufgaben fehlgeschlagen:', fehler);
    });
  };
  const listener = hoereImEigenenFenster('startaufgaben-verfuegbar', wecken);
  const bereit = listener.bereit
    .then(async () => {
      if (!aktiv) return;
      await rufeBefehl('startaufgaben_anmelden', { anmeldung });
      angemeldet = true;
      if (!aktiv) await rufeBefehl('startaufgaben_abmelden', { anmeldung });
      else wecken();
    })
    .catch((fehler: unknown) => {
      meldeImportindexFehler(fehler);
      throw fehler;
    });
  return {
    bereit,
    abmelden: () => {
      aktiv = false;
      listener.abmelden();
      if (angemeldet) void rufeBefehl('startaufgaben_abmelden', { anmeldung }).catch(console.error);
      return abschluss;
    },
  };
}
