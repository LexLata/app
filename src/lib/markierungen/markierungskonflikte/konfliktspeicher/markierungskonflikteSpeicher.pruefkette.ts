// Serialisiert Prüfaufträge und koordiniert Sperre, Quellenwarten und Quellheilung.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { erzeugeAktionsMeldungsWeiterleitung } from '@/lib/domain/app/aktionsMeldung';
import type { AktionsMeldung, AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import {
  MARKIERUNGSKONFLIKTE_DATEI,
  erhalteVollbedarf,
  meldePruefstandFehler,
} from '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import { mitDateiSperre, meldePersistenzBefund } from '@/lib/persistenz/kern/kern.index';
import { alsFehler } from '@/lib/utils/fehler';

import {
  benoetigtVollpruefung,
  fuehrePruefungMitFehlerabschluss,
  fuehreVollpruefungAus,
  ladePruefstandMitFehlerabschluss,
  meldePruefungsfehler,
} from './markierungskonflikteSpeicher.pruefdurchlauf';
import {
  HeilbareQuelle,
  bestaetigeHeilbareQuellen,
  heilbareQuellenAusFehler,
  heileQuellen,
} from './markierungskonflikteSpeicher.quellheilung';
import { liesPruefungsKette, setzePruefungsKette } from './markierungskonflikteSpeicher.zustand';

/**
 * Reiht `lauf` in die fensterlokale Warteschlange ein. Der tatsächlich
 * ausgeführte Auftrag übernimmt die prozessweite Sperre für markierungskonflikte.xml
 * und erhält deren Token für Schreib-/Löschzugriffe auf diese Datei.
 * Die Sperre schützt Prüfstand und Schreiben über Fenster hinweg; Prüfläufe
 * unterbrechen sie nur für das Lesen ihrer Quellen und lesen neu, wenn sich
 * währenddessen Vorgänge oder die Konfliktdatei geändert haben
 * (liesQuellenOhneKonfliktsperre). Die lokale Kette erhält Reihenfolge und
 * Fehlerfortsetzung.
 * Exportiert, damit markierungskonflikteAnzeige.ts
 * (verifiziereBekannteKonflikte) dieselbe Warteschlange nutzen kann,
 * statt eine eigene, potenziell parallel laufende zu haben. `pruefungsKette`
 * liegt ausschließlich in der Zustandsdatei; diese Datei schreibt die Fortsetzung.
 * Anzeigeaufträge nutzen `fehlerabschluss` für denselben dauerhaften Fehlerstand.
 * `automatisch` heilt nur bei erfolgreicher nativer Wiederholungsübernahme;
 * manuelle Heilung bleibt auch nach verbrauchtem automatischem Budget möglich.
 * Nach Heilung und eigenem oder fremdem Neuaufbau ist undefined ein Auftrag zum frischen Nachladen,
 * kein leeres fachliches Ergebnis. `lauf` erhält den Empfänger dieses Prüfversuchs;
 * seine vorläufigen Prüfabschlussfehler werden erst am Gesamtabschluss gemeldet.
 * `fehlerMeldungen` sammelt bei übergebener Liste für eine anschließende Wiederholung.
 */
export function reiheInPruefungsKetteEin<T>(
  lauf: (token: string, empfangen: AktionsMeldungEmpfaenger) => Promise<T>,
  fehlerWeitergeben = false,
  quellenAbwarten: boolean | 'bei-vollbedarf' = false,
  quellheilung: boolean | 'uebernommen' | 'automatisch' = false,
  fehlerabschluss = false,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  fehlerMeldungen?: AktionsMeldung[],
): Promise<T | undefined> {
  // Zwischenfehler dürfen technischen Fehlerstatus schreiben; erst der gesamte
  // Auftrag entscheidet nach Heilung über einen endgültigen Handlungsaufruf.
  const vorlaeufig: AktionsMeldung[] = [];
  let auftragAbgeschlossen = false;
  let andererFehlerGemeldet = false;
  const weiterleiten: AktionsMeldungEmpfaenger = (meldung) => {
    if (!auftragAbgeschlossen && meldung.anlass === 'pruefabschluss' && meldung.typ === 'fehler') {
      vorlaeufig.push(meldung);
      return;
    }
    if (meldung.art === 'fehler') andererFehlerGemeldet = true;
    meldePersistenzBefund(meldung, meldungEmpfangen);
  };
  const empfangen =
    erzeugeAktionsMeldungsWeiterleitung(meldungEmpfangen, weiterleiten) ?? weiterleiten;
  const ergebnis = liesPruefungsKette().then(async () => {
    const erneut = Symbol('laufende Quellen');
    let heilungsfehler: unknown;
    let heilungBegonnen = false;
    let heilungAusstehend = false;
    let quellen: HeilbareQuelle[] = [];
    async function leseQuellabschluss(token: string): Promise<'pruefen' | 'warten' | 'erledigt'> {
      if (!quellenAbwarten && !heilungBegonnen && !heilungAusstehend) return 'pruefen';
      // Beschädigten Bestand vor der Freigabe sichern. Nach jedem Warten
      // wird unter der neu übernommenen Sperre erneut frisch geladen.
      const stand = await ladePruefstandMitFehlerabschluss(token, empfangen);
      const nativ = await erhalteVollbedarf(token, stand);
      if (
        nativ.offeneQuellen > 0 &&
        (heilungBegonnen ||
          heilungAusstehend ||
          quellenAbwarten === true ||
          benoetigtVollpruefung(stand, nativ.vollbedarf))
      )
        return 'warten';
      // Ein erledigter Fremdneuaufbau erfüllt auch nach eigener Behandlung
      // den automatischen Auftrag. Bewusste manuelle Vollprüfungen bleiben voll.
      if (
        quellheilung !== true &&
        (heilungAusstehend || heilungBegonnen) &&
        stand.pruefstatus === 'aktuell' &&
        !nativ.vollbedarf &&
        nativ.offeneQuellen === 0
      )
        return 'erledigt';
      return 'pruefen';
    }
    async function uebernehmeHeilung(token: string): Promise<void> {
      quellen = await bestaetigeHeilbareQuellen(quellen, empfangen);
      // Erst nach Quellenabschluss übernehmen; verbrauchtes Budget eröffnet
      // keine zweite automatische Behandlung. Manuelle Aufträge bleiben möglich.
      if (quellheilung !== 'uebernommen') {
        const uebernommen = await rufeBefehl('pruefvorgang_wiederholung_uebernehmen', {
          konfliktToken: token,
        });
        if (quellheilung === 'automatisch' && !uebernommen) throw heilungsfehler;
      }
      heilungAusstehend = false;
      heilungBegonnen = true;
    }
    for (;;) {
      const wert = await mitDateiSperre(
        MARKIERUNGSKONFLIKTE_DATEI,
        async (token) => {
          const abschluss = await leseQuellabschluss(token);
          if (abschluss !== 'pruefen') return abschluss === 'warten' ? erneut : undefined;
          try {
            if (heilungAusstehend) {
              await uebernehmeHeilung(token);
              return erneut;
            }
            vorlaeufig.length = 0;
            if (heilungBegonnen) {
              await fuehrePruefungMitFehlerabschluss(
                token,
                (stand) => fuehreVollpruefungAus(token, stand, empfangen),
                empfangen,
              );
              return undefined;
            }
            return fehlerabschluss
              ? await fuehrePruefungMitFehlerabschluss(
                  token,
                  () => lauf(token, empfangen),
                  empfangen,
                )
              : await lauf(token, empfangen);
          } catch (fehler) {
            if (heilungAusstehend || heilungBegonnen) throw fehler;
            quellen = heilbareQuellenAusFehler(fehler);
            if (!quellheilung || quellen.length === 0) throw fehler;
            heilungsfehler = fehler;
            heilungAusstehend = true;
            return erneut;
          }
        },
        empfangen,
      );
      if (wert !== erneut) return wert;
      if (heilungBegonnen && quellen.length > 0) {
        // Auch Quellabschlüsse gehören zum vorläufigen Heilungsversuch;
        // der Empfänger erhält weiterhin ihren Folgelaufvertrag.
        await heileQuellen(quellen, heilungsfehler, empfangen);
        quellen = [];
      }
      // Quellabschlüsse brauchen dieselbe Konfliktsperre und umgehen unsere lokale Kette.
      try {
        await rufeBefehl('pruefvorgang_quellen_abwarten', {});
      } catch (fehler) {
        try {
          await mitDateiSperre(
            MARKIERUNGSKONFLIKTE_DATEI,
            (token) =>
              fuehrePruefungMitFehlerabschluss(
                token,
                () => Promise.reject(alsFehler(fehler)),
                empfangen,
              ),
            empfangen,
          );
        } catch (abschlussfehler) {
          console.error('Quellenwarten konnte nicht abgeschlossen werden:', abschlussfehler);
        }
        meldePruefstandFehler(empfangen);
        throw fehler;
      }
    }
  });
  // Die interne Kette fängt immer ab, auch wenn der manuelle Aufrufer
  // sein eigenes ablehnendes Promise erhält. Folgeläufe bleiben serialisiert.
  // Der Empfänger kann über Quelländerungen in späteren Prüfaufträgen weiterleben.
  // Nach diesem Auftrag sammeln jene Aufträge ihre Zwischenfehler selbst; deren
  // endgültige Meldungen müssen den ursprünglichen Empfänger erreichen. Eine
  // eigene nachgelagerte Wiederholung erhält ebenfalls einen neuen Sammelbereich.
  const abgeschlossen = ergebnis
    .finally(() => {
      auftragAbgeschlossen = true;
    })
    .catch((fehler: unknown) => {
      if (fehlerMeldungen) fehlerMeldungen.push(...vorlaeufig);
      else if (vorlaeufig.length > 0)
        for (const meldung of vorlaeufig) meldePersistenzBefund(meldung, meldungEmpfangen);
      else if (!andererFehlerGemeldet) meldePruefungsfehler(fehler, meldungEmpfangen);
      throw fehler;
    });
  const abgefangen = abgeschlossen.catch((e) => {
    console.error('Markierungskonflikt-Prüfung fehlgeschlagen:', e);
    return undefined;
  });
  setzePruefungsKette(abgefangen.then(() => undefined));
  return fehlerWeitergeben ? abgeschlossen : abgefangen;
}
