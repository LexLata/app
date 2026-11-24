// praefixlauf.ts
// Wellenweise Prüfung; allein die Umgebung liest und ersetzt Repository-Dateien.
import {
  meldeLaufErgebnis,
  meldeLaufFortschritt,
} from '@/lib/import/quelldateien/quelldateien.index';
import { beobachtePraefixlauf } from '@/lib/import/quelldateien/quelldateien.index';
import { ermittlePraefixstruktur } from '@/lib/domain/praefixstruktur';
import { berechneImportParallelitaet } from '@/lib/import/basis/basis.index';
import {
  fuehreWellenlaufAus,
  type WellenlaufErgebnis,
} from '@/lib/import/quelldateien/quelldateien.index';
import type { PraefixlaufAuftrag } from '@/lib/plattform/praefixlaufAuftrag';
import type {
  PraefixlaufBericht,
  PraefixlaufUmgebung,
  PraefixlaufLadeErgebnis,
} from './praefixlauf.types';
import { type PraefixstrukturEintrag } from './praefixstrukturXml';
import { erzeugePraefixlistenSchreiber } from './praefixlistenSchreiber';

export async function fuehrePraefixlaufAus(
  auftrag: Extract<PraefixlaufAuftrag, { modus: 'praefix' }>,
  umgebung: PraefixlaufUmgebung,
  meldeBericht?: (bericht: PraefixlaufBericht) => void,
): Promise<PraefixlaufBericht> {
  if (!Number.isSafeInteger(auftrag.anzahl) || auftrag.anzahl < 1)
    throw new Error('Anzahl muss eine positive ganze Zahl sein');
  const normgeber = auftrag.normgeber;
  const schreiber = erzeugePraefixlistenSchreiber(normgeber, await umgebung.leseListe(), (xml) =>
    umgebung.schreibeListe(xml),
  );
  const eintraege = schreiber.eintraege;
  const geprueft = new Set(eintraege.map((e) => e.kurztitel.toLowerCase()));
  const alle = await umgebung.ladeKandidaten(auftrag.normgeber);
  const haeufigkeit = new Map<string, number>();
  for (const e of alle) {
    const k = e.kurztitel.toLowerCase();
    haeufigkeit.set(k, (haeufigkeit.get(k) ?? 0) + 1);
  }
  const bericht: PraefixlaufBericht = {
    geprueft: {
      'ohne-praefix': 0,
      'artikel-und-paragraphen': 0,
      paragraph: 0,
      artikel: 0,
      gliederungsartikel: 0,
      roemisch: 0,
      arabisch: 0,
      alphabetisch: 0,
      regel: 0,
      nummer: 0,
      leer: 0,
      unklar: 0,
    },
    gespeichert: 0,
    uebersprungen: [],
    fehlgeschlagen: [],
    teilerfolge: [],
    verbleibendUngeprueft: 0,
  };
  try {
    const benannt = auftrag.kurztitel && new Set(auftrag.kurztitel.map((k) => k.toLowerCase()));
    const gesehen = new Set<string>();
    let kandidaten = alle.filter((e) => {
      const k = e.kurztitel.toLowerCase();
      if (gesehen.has(k) || (benannt && !benannt.has(k))) return false;
      gesehen.add(k);
      const gespeichert = eintraege.find((eintrag) => eintrag.kurztitel.toLowerCase() === k);
      if (auftrag.gescheitert) return gespeichert?.ermittlungsstatus === 'gescheitert';
      if (geprueft.has(k)) {
        if (benannt) bericht.uebersprungen.push(e.kurztitel);
        return false;
      }
      return true;
    });
    if (auftrag.gescheitert) kandidaten = kandidaten.slice(0, auftrag.anzahl);
    let abbruch: unknown;
    let schreibkette: Promise<unknown> = Promise.resolve();

    async function speichere(eintrag: PraefixstrukturEintrag): Promise<boolean> {
      const schreiben = schreibkette.then(async () => {
        if (abbruch !== undefined) return false;
        await schreiber.speichern([eintrag]);
        geprueft.add(eintrag.kurztitel.toLowerCase());
        return true;
      });
      schreibkette = schreiben;
      return schreiben;
    }
    async function merkeFehler(
      kurztitel: string,
      meldung: string,
      identifikation = false,
    ): Promise<void> {
      const fehlerart = identifikation
        ? 'identifikation'
        : meldung.includes('Tab-Link') && meldung.includes('Zeitüberschreitung')
          ? 'tablink-zeitueberschreitung'
          : meldung.includes('Keine Normen')
            ? 'keine-normen'
            : 'gesetz-laden';
      bericht.fehlgeschlagen.push({ kurztitel, meldung });
      await speichere({ kurztitel, ermittlungsstatus: 'gescheitert', fehlerart });
    }
    const stand = await umgebung.leseDateistand(auftrag.normgeber);
    const quellen = new Set(stand.quellen.map((k) => k.toLowerCase()));
    const quelleVorhanden = (kurztitel: string) =>
      !auftrag.gescheitert && quellen.has(kurztitel.toLowerCase());
    let erreichbarkeit: Promise<void> | undefined;
    function pruefeNetz(): Promise<void> {
      return (erreichbarkeit ??= umgebung.pruefeErreichbarkeit(auftrag.normgeber).then((fehler) => {
        if (fehler) throw new Error(fehler);
      }));
    }
    async function pruefe(e: (typeof kandidaten)[number]): Promise<WellenlaufErgebnis> {
      if (abbruch !== undefined) return 'uebersprungen';
      const diagnose = beobachtePraefixlauf(e.kurztitel, (zeile) => umgebung.ausgabe(zeile));
      const beginn = performance.now();
      const dauer = () => `(${((performance.now() - beginn) / 1000).toFixed(2)} s)`;
      try {
        await diagnose.schritt('Beginn');
        if (haeufigkeit.get(e.kurztitel.toLowerCase())! > 1) {
          await merkeFehler(e.kurztitel, 'Kurztitel nicht eindeutig', true);
          await meldeLaufErgebnis(umgebung, `${e.kurztitel}: Kurztitel nicht eindeutig`);
          return 'fehler';
        }
        if (abbruch !== undefined) return 'uebersprungen';
        if (!quelleVorhanden(e.kurztitel)) await pruefeNetz();
        const ergebnis: PraefixlaufLadeErgebnis = await umgebung.ladeGesetz(
          auftrag.normgeber,
          e,
          diagnose.schritt,
          quelleVorhanden(e.kurztitel),
        );
        if (ergebnis.fehler !== undefined) {
          await merkeFehler(e.kurztitel, ergebnis.fehler);
          await meldeLaufErgebnis(umgebung, `${e.kurztitel}: ${ergebnis.fehler} ${dauer()}`);
          return 'fehler';
        }
        if (ergebnis.gesetzesXMLGeloescht)
          (bericht.zusatzzeilen ??= []).push(`${e.kurztitel}: Bisheriges GesetzesXML gelöscht.`);
        await diagnose.schritt('Präfixstruktur bestimmen');
        const befund = ermittlePraefixstruktur(ergebnis.gesetz);
        const wert = befund.ermittlungsstatus ?? befund.praefixstruktur;
        await diagnose.schritt('Warte auf Listenschreibung');
        await diagnose.schritt('Liste schreiben');
        if (!(await speichere({ kurztitel: e.kurztitel, ...befund }))) return 'uebersprungen';
        bericht.geprueft[wert]++;
        bericht.gespeichert++;
        await meldeLaufErgebnis(umgebung, `${e.kurztitel}: ${wert} ${dauer()}`);
        return 'erfolg';
      } catch (fehler) {
        abbruch ??= fehler;
        throw fehler;
      } finally {
        diagnose.beenden();
      }
    }
    await fuehreWellenlaufAus(
      kandidaten,
      auftrag.anzahl,
      berechneImportParallelitaet(normgeber),
      pruefe,
      meldeLaufFortschritt(umgebung),
    );
    await schreibkette;
    return bericht;
  } finally {
    bericht.verbleibendUngeprueft = alle.filter(
      (e) => !geprueft.has(e.kurztitel.toLowerCase()),
    ).length;
    meldeBericht?.(bericht);
  }
}
