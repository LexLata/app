// Start und Auslöser der Markierungskonfliktprüfung; gemeinsamer Zustand in .zustand.ts.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { erfasseAktionsFolgelauf } from '@/lib/domain/app/aktionsMeldung';
import {
  beiMarkierungGeaendert,
  beiMarkierungenBulkGeaendert,
} from '@/lib/markierungen/eintrag/eintrag.index';
import {
  MARKIERUNGSKONFLIKTE_DATEI,
  erhalteVollbedarf,
  ladePruefstand,
  meldePruefstandFehler,
  pruefvorgangsAktion,
  schreibeGesetzKonflikte,
  statusNachTeilabschluss,
} from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import {
  beiNichtamtlicheTitelGeschrieben,
  beiSpeicherBatchAbgeschlossen,
} from '@/lib/persistenz/gesetz/gesetz.index';
import type { PruefpflichtigerQuellabschluss } from '@/lib/persistenz/kern/kern.index';
import {
  mitDateiSperre,
  registrierePruefpflichtigeAenderung,
} from '@/lib/persistenz/kern/kern.index';

import {
  fuehrePruefungMitFehlerabschluss,
  fuehreVollpruefungAus,
  ladePruefstandMitFehlerabschluss,
} from './markierungskonflikteSpeicher.pruefdurchlauf';
import { reiheInPruefungsKetteEin } from './markierungskonflikteSpeicher.pruefkette';
import {
  pruefeEinmaligeVollwiederholung,
  pruefeErforderlicheVollpruefung,
} from './markierungskonflikteSpeicher.pruefsteuerung';
import {
  pruefeEineMarkierungSelektiv,
  pruefeMarkierungenSelektiv,
} from './markierungskonflikteSpeicher.selektiv';
import {
  erhalteStartAbschluss,
  erhalteStartVorbereitung,
  istInitialisiert,
  liesStartVorbereitung,
  setzeInitialisiert,
} from './markierungskonflikteSpeicher.zustand';

/** Vor eigenen Quellenänderungen ausschließlich den geschützten Prüfstand lesen. */
export async function bereiteMarkierungsStartPruefungVor(): Promise<void> {
  const vorbereiteterStart = erhalteStartVorbereitung(() =>
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (getCurrentWindow().label !== 'main') return false;
      } catch {
        // Browser-Vorschau hat keinen nativen Prüfstand.
        return false;
      }
      return mitDateiSperre(MARKIERUNGSKONFLIKTE_DATEI, async (token) => {
        const stand = await ladePruefstandMitFehlerabschluss(token);
        if (stand.pruefstatus === 'aktuell') return false;
        await pruefvorgangsAktion('vollbedarf', token);
        return true;
      });
    })(),
  );
  await vorbereiteterStart;
}

/** Nach dem App-Start einmalig, auch nach dessen Fehler; kein Renderhindernis. */
export function pruefeMarkierungenBeimStart(): Promise<void> {
  const abgeschlossenerStart = erhalteStartAbschluss(() =>
    (async () => {
      // Ein Mount ohne die tatsächliche Startvorbereitung löst keinen Startlauf aus.
      const vorbereiteterStart = liesStartVorbereitung();
      if (!vorbereiteterStart || !(await vorbereiteterStart.catch(() => true))) return;
      const fehlerMeldungen: AktionsMeldung[] = [];
      await reiheInPruefungsKetteEin(
        (token, empfangen) =>
          fuehrePruefungMitFehlerabschluss(
            token,
            async (stand) => {
              // Frisch entscheiden: ein anderes Fenster kann inzwischen fertig sein.
              if ((await erhalteVollbedarf(token, stand)).vollbedarf)
                await fuehreVollpruefungAus(token, stand, empfangen);
            },
            empfangen,
          ),
        true,
        true,
        true,
        false,
        undefined,
        fehlerMeldungen,
      ).catch(async (fehler: unknown) => {
        if (!(await pruefeEinmaligeVollwiederholung(fehler, undefined, fehlerMeldungen)))
          throw fehler;
      });
    })(),
  );
  return abgeschlossenerStart;
}

const pruefpflichtEmpfaenger = {
  vormerken: (meldungEmpfangen?: AktionsMeldungEmpfaenger) =>
    mitDateiSperre(
      MARKIERUNGSKONFLIKTE_DATEI,
      async (token) => {
        const stand = await ladePruefstand(token, meldungEmpfangen);
        await erhalteVollbedarf(token, stand);
        const vorgang = await rufeBefehl('pruefvorgang_registrieren', { konfliktToken: token });
        try {
          await schreibeGesetzKonflikte(
            stand.gesetzKonflikte,
            token,
            {
              pruefstatus: stand.pruefstatus === 'fehlgeschlagen' ? 'fehlgeschlagen' : 'ausstehend',
              erweiterungen: stand.erweiterungen,
            },
            meldungEmpfangen,
          );
          return vorgang;
        } catch (fehler) {
          try {
            await pruefvorgangsAktion('abbrechen', token, [vorgang]);
          } catch (abbruchfehler) {
            console.error('Nativer Prüfvorgangsabbruch fehlgeschlagen:', abbruchfehler);
          }
          throw fehler;
        }
      },
      meldungEmpfangen,
    ),
  abschliessen: (
    vorgang: string,
    ergebnis: PruefpflichtigerQuellabschluss,
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ) =>
    mitDateiSperre(
      MARKIERUNGSKONFLIKTE_DATEI,
      async (token) => {
        try {
          const stand = await ladePruefstand(token, meldungEmpfangen);
          await erhalteVollbedarf(token, stand);
          let nativ = await pruefvorgangsAktion(
            ergebnis === 'fehlgeschlagen' ? 'fehler' : 'quelle_abschliessen',
            token,
            [vorgang],
          );
          if (ergebnis === 'geaendert') return;
          if (ergebnis === 'unveraendert')
            nativ = await pruefvorgangsAktion('teilpruefung_abschliessen', token, [vorgang]);
          const pruefstatus =
            ergebnis === 'fehlgeschlagen' && nativ.vollbedarf
              ? 'fehlgeschlagen'
              : statusNachTeilabschluss(stand, nativ);
          try {
            await schreibeGesetzKonflikte(
              stand.gesetzKonflikte,
              token,
              {
                pruefstatus,
                erweiterungen: stand.erweiterungen,
              },
              meldungEmpfangen,
            );
            return (
              ergebnis === 'unveraendert' && nativ.vollbedarf && pruefstatus !== 'fehlgeschlagen'
            );
          } catch (fehler) {
            try {
              await pruefvorgangsAktion('fehler', token);
            } catch (abschlussfehler) {
              console.error('Nativer Prüfstand-Fehlerabschluss fehlgeschlagen:', abschlussfehler);
            }
            meldePruefstandFehler(meldungEmpfangen);
            throw fehler;
          }
        } catch (fehler) {
          // Auch ohne lesbaren Status die eigene Quellphase beenden. Fremde Verweise
          // werden nativ zurückgewiesen und verändern dabei keinerlei Vorgänge.
          try {
            await pruefvorgangsAktion('fehler', token, [vorgang]);
          } catch (abschlussfehler) {
            console.error('Nativer Quellfehlerabschluss fehlgeschlagen:', abschlussfehler);
          }
          throw fehler;
        }
      },
      meldungEmpfangen,
    ).then(
      (vollpruefungErforderlich) => {
        // Der Quellabschluss umgeht die Queue. Folgeläufe nur erfassen,
        // niemals hier abwarten: Quellheilung kann selbst Teil dieser Queue sein.
        if (ergebnis === 'fehlgeschlagen')
          void pruefeEinmaligeVollwiederholung(undefined, meldungEmpfangen);
        if (vollpruefungErforderlich) {
          const folgelauf = pruefeErforderlicheVollpruefung(meldungEmpfangen).catch(
            () => undefined,
          );
          erfasseAktionsFolgelauf(meldungEmpfangen, folgelauf);
        }
      },
      (fehler: unknown) => {
        void pruefeEinmaligeVollwiederholung(fehler, meldungEmpfangen);
        throw fehler;
      },
    ),
};

/** Registriert die automatischen Prüftrigger einmal pro Fenster, ohne Datei-I/O.
 * Vor Oberfläche und App-Start synchron aufrufen; wiederholte Aufrufe sind wirkungslos.
 */
export function initialisiereMarkierungen(): void {
  if (istInitialisiert()) return;
  registrierePruefpflichtigeAenderung(pruefpflichtEmpfaenger);
  setzeInitialisiert();
  // Der Zähler/Debounce, der erkennt, wann ein Speicher-/Lösch-Batch auf
  // Gesetze zur Ruhe gekommen ist, liegt jetzt zentral in
  // gesetzSpeicherEreignisse.ts (zweiter Anwendungsfall dort: der
  // 'gesetze-geaendert'-Broadcast in gesetzSpeicher.ts). Diese Datei meldet
  // sich dort nur noch als Abonnent an, um wie bisher EINMAL pro Batch
  // selektiv zu prüfen.
  beiSpeicherBatchAbgeschlossen(async (betroffene, vorgaenge, ausloeser) => {
    if (!ausloeser) return pruefeMarkierungenSelektiv(betroffene, { vorgaenge });
    // Jede auslösende Aktion erhält nur ihre eigene Quellenmenge. Die bestehende
    // Prüfqueue serialisiert die Läufe; kein globaler Empfängerwechsel.
    const gruppen = new Map<AktionsMeldungEmpfaenger | undefined, typeof ausloeser>();
    for (const ausloesend of ausloeser) {
      const gruppe = gruppen.get(ausloesend.meldungEmpfangen) ?? [];
      gruppe.push(ausloesend);
      gruppen.set(ausloesend.meldungEmpfangen, gruppe);
    }
    // Gruppenläufe sind beim jeweiligen Besitzer registriert; ihre Ablehnung
    // darf nicht zusätzlich als gemeinsamer Batchfehler alle Besitzer treffen.
    await Promise.allSettled(
      [...gruppen].map(([meldungEmpfangen, gruppe]) => {
        const lauf = pruefeMarkierungenSelektiv(
          gruppe.map((a) => a.gesetz),
          {
            vorgaenge: gruppe.flatMap((a) => (a.vorgang ? [a.vorgang] : [])),
            meldungEmpfangen,
          },
        );
        erfasseAktionsFolgelauf(meldungEmpfangen, lauf);
        return lauf;
      }),
    );
  });

  // Dritter Auslöser (siehe Kopfkommentar): Import EINER einzelnen
  // nichtamtlicheTitel-XML. nichtamtlicheTitelSpeicher.ts (persistenz) meldet
  // dies über beiNichtamtlicheTitelGeschrieben(), statt dass diese Datei (bzw.
  // nichtamtlicheTitelSpeicher.ts) einen zirkulären Gegen-Import bräuchte.
  beiNichtamtlicheTitelGeschrieben((gesetzesreferenz, vorgang, meldungEmpfangen) => {
    return pruefeMarkierungenSelektiv([gesetzesreferenz], {
      nurEigeneMarkierungen: true,
      vorgaenge: vorgang ? [vorgang] : [],
      meldungEmpfangen,
    });
  });

  // Vierter Auslöser (siehe Kopfkommentar): EIN einzelner Markierungs-Eintrag
  // wurde geschrieben (entferneMarkierung/aktualisiereZielnorm/
  // aktualisiereKommentar in markierungSpeicher.ts, Undo-Wiederherstellung in
  // markierungSpeicher.undo.ts). Meldung über markierungSpeicher.ereignisse.ts
  // statt eines direkten Imports von dort – diese Datei importiert bereits
  // wertseitig aus markierungSpeicher.ts (zirkulärer Modul-Import sonst).
  beiMarkierungGeaendert((gesetzesreferenz, schluessel, vorgang, meldungEmpfangen) => {
    return pruefeEineMarkierungSelektiv(gesetzesreferenz, schluessel, vorgang, meldungEmpfangen);
  });

  // Fünfter Auslöser: MEHRERE Markierungs-Einträge desselben Gesetzes wurden
  // auf einmal geschrieben (Datei-Import, Kombinieren/Aufsplitten in
  // markierungSpeicher.hinzufuegen.ts) – aus demselben Grund wie oben über
  // markierungSpeicher.ereignisse.ts statt eines direkten Imports gemeldet.
  beiMarkierungenBulkGeaendert((gesetzesreferenz, vorgang, meldungEmpfangen) => {
    return pruefeMarkierungenSelektiv([gesetzesreferenz], {
      nurEigeneMarkierungen: true,
      vorgaenge: vorgang ? [vorgang] : [],
      meldungEmpfangen,
    });
  });
}

export {
  pruefeAlleMarkierungen,
  pruefeErforderlicheVollpruefung,
} from './markierungskonflikteSpeicher.pruefsteuerung';
export { pruefeMarkierungenSelektiv } from './markierungskonflikteSpeicher.selektiv';
