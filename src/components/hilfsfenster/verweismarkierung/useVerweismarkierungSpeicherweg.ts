// Verarbeitet Speichern und Import im Verweisfenster; besitzt keine eigenen Effekte.
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import { useGespeichertenFensterAbschluss } from '@/hooks/fenster/useFensterSchliessenAbsichern';
import {
  erzeugeAktionsMeldungsSammlung,
  type AktionsMeldung,
} from '@/lib/domain/app/aktionsMeldung';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type {
  MarkierungsUebertragung,
  SpeichernErgebnisVerweismarkierung,
  VerweismarkierungKontext,
  ZitatFehler,
} from '@/lib/markierungen/markierungen.index';
import {
  speichereVerweismarkierung,
  versucheFehlendeGesetzeImportieren,
} from '@/lib/markierungen/markierungen.index';
import { istDateiSperreWartefrist } from '@/lib/persistenz/kern/kern.index';
import { useRef } from 'react';
import {
  sammleMarkierungsFensterFolgebefunde,
  warteAufMarkierungsFensterFolgebefunde,
} from '@/components/hilfsfenster/gemeinsam/markierungsFolgelauf';
import { uebergebeMarkierungsFensterHinweise } from '@/components/hilfsfenster/gemeinsam/markierungsHinweise';

import { bereiteSpeicherMeldungenAuf, verarbeiteImportMeldungen } from './verweisImportMeldungen';

import type { Dispatch, SetStateAction } from 'react';

type SpeicherwegOptionen = {
  ladeGesetz: GesetzLader | undefined;
  kontext: VerweismarkierungKontext | null;
  zitatText: string;
  textbezug: boolean;
  fehler: ZitatFehler[];
  setFehler: Dispatch<SetStateAction<ZitatFehler[]>>;
  setLaeuft: Dispatch<SetStateAction<boolean>>;
  setImportFehlgeschlagen: Dispatch<SetStateAction<boolean>>;
  setAktualisierungsHinweis: Dispatch<SetStateAction<string | null>>;
  setGespeicherterStand: Dispatch<SetStateAction<{ text: string; textbezug: boolean } | null>>;
  abschlussSteuerung: ReturnType<typeof useGespeichertenFensterAbschluss<MarkierungsUebertragung>>;
  istSchliessvorgangAktiv: () => boolean;
  schliesseBewusst: () => Promise<boolean>;
};

type VerweisAbschlussStand = false | 'gespeichert' | 'unveraendert';

type ImportMeldungsBefunde = Awaited<ReturnType<typeof verarbeiteImportMeldungen>>;

export async function uebergebeHinweise(
  meldungen: AktionsMeldung[],
  oeffner: string,
  verweisAbschluss: VerweisAbschlussStand = false,
) {
  const ersterSatz =
    verweisAbschluss === 'unveraendert'
      ? 'Der Verweis ist unverändert.'
      : verweisAbschluss
        ? 'Der Verweis wurde gespeichert.'
        : 'Eine Quelldatei wurde geändert.';
  await uebergebeMarkierungsFensterHinweise(
    meldungen,
    oeffner,
    ersterSatz,
    !!verweisAbschluss,
    'Hinweis des Verweisfensters nicht angenommen:',
  );
}

export function useVerweismarkierungSpeicherweg({
  ladeGesetz,
  kontext,
  zitatText,
  textbezug,
  fehler,
  setFehler,
  setLaeuft,
  setImportFehlgeschlagen,
  setAktualisierungsHinweis,
  setGespeicherterStand,
  abschlussSteuerung,
  istSchliessvorgangAktiv,
  schliesseBewusst,
}: SpeicherwegOptionen) {
  const { beschaeftigtRef } = abschlussSteuerung;
  // Merkt sich (kleingeschrieben) alle Kurztitel, für die bereits ein
  // ECHTER Import-Versuch fehlgeschlagen ist (siehe importVersuchen unten) –
  // damit speichern() beim erneuten Parsen (z.B. nach "Gesetz importieren"
  // bei mehreren betroffenen Gesetzen, von denen nur eines fehlschlägt)
  // die passendere Meldung "X konnte nicht importiert werden." statt der
  // generischen "X ist nicht auf dem Gerät." zeigen kann (siehe
  // Absprache). Bewusst ein Ref statt State: wird innerhalb derselben
  // async-Funktion (importVersuchen) direkt vor dem synchron folgenden
  // speichern(false)-Aufruf gelesen – ein State-Update wäre zu diesem
  // Zeitpunkt noch nicht committed (Ref-Muster gegen Stale-Closures, siehe
  // enterTasteRef oben). Wird bei jeder Zitat-Änderung zurückgesetzt (siehe
  // fehlerZuruecksetzen), da eine neue Eingabe wieder als ungetestet gilt.
  // Bindet automatisch gewählte Ziele bis der Verweistext geändert wird.
  const gewaehltRef = useRef(new Map<string, Gesetzesreferenz>());
  const fehlgeschlageneImportsRef = useRef<Map<string, string | undefined>>(new Map());

  function speicherErgebnisVerarbeiten(ergebnis: SpeichernErgebnisVerweismarkierung): boolean {
    if (!abschlussSteuerung.montiertRef.current) {
      if (ergebnis.art === 'erfolg' || ergebnis.art === 'uebertragungOffen')
        abschlussSteuerung.uebernehmeSpeicherAbschluss(ergebnis);
      return false;
    }
    if (ergebnis.art === 'fehler') {
      setFehler(ergebnis.fehler);
      return false;
    }
    if (ergebnis.art === 'keineAktion') return false;
    setGespeicherterStand({ text: zitatText, textbezug });
    return abschlussSteuerung.uebernehmeSpeicherAbschluss(ergebnis);
  }

  async function verarbeiteSpeicherMeldungen(
    meldungen: AktionsMeldung[],
    verweisAbschluss: VerweisAbschlussStand,
    zitatFehler: ZitatFehler[] = [],
    importBefunde?: ImportMeldungsBefunde,
  ) {
    if (!kontext) return;
    const aufbereitung = importBefunde
      ? importBefunde.fuerSpeicherabschluss(meldungen, !!verweisAbschluss, zitatFehler)
      : bereiteSpeicherMeldungenAuf(meldungen, !!verweisAbschluss, zitatFehler);
    if (abschlussSteuerung.montiertRef.current && aufbereitung.lokal.length)
      setFehler(aufbereitung.lokal);
    await uebergebeHinweise(aufbereitung.hinweise, kontext.openerLabel, verweisAbschluss);
  }

  async function fuehreSpeicherungAus(
    signal: AbortSignal,
    ohneElementstand: boolean,
    importBefunde?: ImportMeldungsBefunde,
  ): Promise<boolean> {
    if (!kontext || !ladeGesetz) return false;
    const sammlung = erzeugeAktionsMeldungsSammlung();
    async function verarbeiteNachFolgelauf(
      verweisAbschluss: VerweisAbschlussStand,
      zitatFehler: ZitatFehler[] = [],
    ) {
      const meldungen = await sammleMarkierungsFensterFolgebefunde(
        sammlung,
        verweisAbschluss === 'gespeichert',
        importBefunde?.verbleibendeMeldungen,
      );
      await verarbeiteSpeicherMeldungen(meldungen, verweisAbschluss, zitatFehler, importBefunde);
    }
    let ergebnis: SpeichernErgebnisVerweismarkierung;
    try {
      ergebnis = await speichereVerweismarkierung(
        kontext,
        ladeGesetz,
        zitatText,
        textbezug,
        ohneElementstand,
        fehlgeschlageneImportsRef.current,
        gewaehltRef.current,
        signal,
        sammlung.meldungEmpfangen,
      );
    } catch (ausnahme) {
      console.error('Verweis konnte nicht gespeichert werden:', ausnahme);
      await verarbeiteNachFolgelauf(false, [
        {
          art: 'sonst',
          text: istDateiSperreWartefrist(ausnahme)
            ? 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.'
            : 'Der Verweis konnte nicht gespeichert werden.',
        },
      ]);
      return false;
    }
    const schliessenErlaubt = speicherErgebnisVerarbeiten(ergebnis);
    const verweisAbschluss =
      ergebnis.art === 'erfolg' && 'unveraendert' in ergebnis
        ? 'unveraendert'
        : ergebnis.art === 'erfolg' || ergebnis.art === 'uebertragungOffen'
          ? 'gespeichert'
          : false;
    await verarbeiteNachFolgelauf(
      verweisAbschluss,
      ergebnis.art === 'fehler' ? ergebnis.fehler : [],
    );
    return schliessenErlaubt;
  }

  async function speichern(
    ohneElementstand: boolean,
    ausSchliessdialog = false,
    importBefunde?: ImportMeldungsBefunde,
  ): Promise<boolean> {
    if (!kontext) return false;
    const freigabe = abschlussSteuerung.pruefeSpeicherStart(
      istSchliessvorgangAktiv(),
      ausSchliessdialog,
      schliesseBewusst,
    );
    if (freigabe !== null) return freigabe;
    if (!zitatText.trim()) {
      setFehler([{ art: 'sonst', text: 'Bitte einen Verweis eingeben.' }]);
      return false;
    }
    setImportFehlgeschlagen(false);
    return abschlussSteuerung.fuehreSpeichervorgangAus(
      (signal) => fuehreSpeicherungAus(signal, ohneElementstand, importBefunde),
      ausSchliessdialog,
      schliesseBewusst,
    );
  }

  // Importiert/aktualisiert ALLE Gesetze, die in der aktuellen Fehlerliste
  // als Ursache auftauchen (siehe kurztitel bei den 'gesetz'/'norm'-
  // Fehlereinträgen in speichern()) – bei mehreren betroffenen Gesetzen (z.B.
  // "§ 1 ZPO, § 1 StPO" beide noch nicht importiert) ein Button für beide
  // (siehe Absprache: Button-Text differenziert nur zwischen "importieren"/
  // "aktualisieren"/"beides", nicht nach EINEM konkreten Gesetz). Kernlogik
  // in versucheFehlendeGesetzeImportieren (verweismarkierungAktionen.ts) ausgelagert –
  // diese Funktion bleibt für die State-Updates zuständig.
  async function importVersuchen() {
    if (
      !abschlussSteuerung.montiertRef.current ||
      !kontext ||
      !ladeGesetz ||
      beschaeftigtRef.current ||
      abschlussSteuerung.abschlussRef.current !== 'bearbeiten' ||
      istSchliessvorgangAktiv()
    )
      return;
    beschaeftigtRef.current = true;
    setLaeuft(true);
    setAktualisierungsHinweis(null);
    const zielKurztitel = [
      ...new Map(
        fehler
          .filter((f): f is typeof f & { gesetz: Gesetzesreferenz } => !!f.gesetz)
          .map((f) => [gesetzesreferenzSchluessel(f.gesetz), f.gesetz]),
      ).values(),
    ];
    if (zielKurztitel.length === 0) {
      beschaeftigtRef.current = false;
      setLaeuft(false);
      return;
    }

    const sammlung = erzeugeAktionsMeldungsSammlung();
    try {
      const ergebnis = await versucheFehlendeGesetzeImportieren(
        zielKurztitel,
        ladeGesetz,
        sammlung.meldungEmpfangen,
      );
      // Erst nach direktem Arbeitsende außerhalb der Queue warten. Die
      // Originalbündel werden währenddessen um ihre späten Befunde ergänzt.
      const { fristMeldung } = await warteAufMarkierungsFensterFolgebefunde(sammlung);
      const importBefunde = await verarbeiteImportMeldungen(
        ergebnis,
        fehler,
        kontext.openerLabel,
        fristMeldung,
      );
      const { mindestensEinErfolg, aktualisierungsHinweis, neuFehlgeschlagen } = ergebnis;
      if (!abschlussSteuerung.montiertRef.current) return;
      for (const f of neuFehlgeschlagen)
        fehlgeschlageneImportsRef.current.set(gesetzesreferenzSchluessel(f.gesetz), f.fehler);
      setAktualisierungsHinweis(aktualisierungsHinweis);

      if (mindestensEinErfolg) {
        // speichern(false) prüft die Auflösung erneut von vorne (inkl.
        // Gesetz-Suche pro Zitat) – setzt bei erneutem Scheitern fehler selbst
        // selbst neu (z.B. wenn nur EINES von mehreren Gesetzen erfolgreich
        // importiert wurde), daher hier kein manuelles Zurücksetzen nötig.
        // Anderes Fenster (App-Hauptfenster) erfährt von den neu importierten/
        // aktualisierten Gesetzen zentral über den 'gesetze-geaendert'-Broadcast
        // in gesetzSpeicher.ts (ausgelöst durch speichereGesetz(), das die
        // Import-Aufrufe in versucheFehlendeGesetzeImportieren bereits durchlaufen haben).
        beschaeftigtRef.current = false;
        await speichern(false, false, importBefunde);
      } else {
        setLaeuft(false);
        // Meldungen für die tatsächlich fehlgeschlagenen Kurztitel aktualisieren
        // (siehe fehlgeschlageneImportsRef oben) – speichern() wird hier NICHT
        // erneut aufgerufen (kompletter Fehlschlag, nichts Neues zu prüfen),
        // daher wird die bestehende Fehlerliste direkt gepatcht, statt dass die
        // ursprüngliche "ist nicht auf dem Gerät"-Meldung unverändert
        // stehen bleibt (siehe Absprache).
        setFehler((bisherige) =>
          bisherige.map((f) => {
            if (f.art !== 'gesetz' || !f.gesetz) return f;
            const kurztitelKlein = gesetzesreferenzSchluessel(f.gesetz);
            if (!fehlgeschlageneImportsRef.current.has(kurztitelKlein)) return f;
            const konkreterFehler = fehlgeschlageneImportsRef.current.get(kurztitelKlein);
            return {
              ...f,
              text: konkreterFehler ?? `${f.gesetz.kurztitel} konnte nicht importiert werden.`,
            };
          }),
        );
        // Import/Aktualisierung ist komplett fehlgeschlagen (z.B. Kürzel in
        // keinem Importindex gefunden) – Button bleibt sichtbar, aber deaktiviert,
        // bis sich die Eingabe ändert (siehe onChange-Reset unten).
        setImportFehlgeschlagen(true);
      }
      if (
        !abschlussSteuerung.montiertRef.current ||
        abschlussSteuerung.abschlussRef.current !== 'bearbeiten'
      )
        return;
      // Bei einer erneuten Zitatprüfung verarbeitet deren Abschluss alle
      // verbleibenden Befunde. Ohne Speicherweg bleiben sie hier lokal.
      if (!mindestensEinErfolg && importBefunde.lokal.length)
        setFehler((bisherige) => [...bisherige, ...importBefunde.lokal]);
    } catch (ausnahme) {
      console.error('Import/Aktualisierung fehlgeschlagen:', ausnahme);
      const meldungen = await sammleMarkierungsFensterFolgebefunde(sammlung, false);
      await verarbeiteSpeicherMeldungen(meldungen, false, fehler);
      if (!abschlussSteuerung.montiertRef.current) return;
      setLaeuft(false);
      setAktualisierungsHinweis(null);
      setFehler((bisherige) => [
        ...bisherige,
        { art: 'sonst', text: 'Der Import konnte nicht durchgeführt werden.' },
      ]);
    } finally {
      beschaeftigtRef.current = false;
      if (abschlussSteuerung.montiertRef.current) setLaeuft(false);
    }
  }

  function importZuruecksetzen() {
    setImportFehlgeschlagen(false);
    fehlgeschlageneImportsRef.current = new Map();
    gewaehltRef.current.clear();
  }
  return {
    speichern,
    importVersuchen,
    importZuruecksetzen,
  };
}
