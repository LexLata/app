// Fensterlokaler Bestand: Einzelzugriff, Tab-Schutz und Ereignisentwertung gehören zusammen.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { leseGesetz, type GesetzLeseErgebnis } from '@/lib/persistenz/gesetz/gesetz.index';
import { hoereGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { gleicheGesetzesdatenAb } from './gesetzesdaten';
import { gleicheGesetzTitelAb } from './gesetzTitelabgleich';
import { meldeGesetzLadeBefunde } from './gesetzLadeMeldungen';
import { zeigeBanner } from '@/lib/banner/banner.index';
import { erzeugeGesetzLaufMeldungen } from './gesetzLaufMeldungen';
import { holeLadegrenzen, HILFSFENSTER_HALTEGRENZE } from './ladegrenzen';
import { warteAufLeerlauf } from './leerlauf';
export interface GeladeneGesetzeOptionen {
  fenstertyp?: 'hauptfenster' | 'hilfsfenster';
  haltegrenze?: number;
  vorladegrenze?: number;
}
/**
 * Zustand eines geladenen Gesetzes; vorgeladen: im Hintergrund geladen und seither nicht benutzt;
 * behalten: ohne offenen Tab innerhalb der Haltegrenze geladen.
 */
type Bestandszustand = 'in Tabs' | 'vorgeladen' | 'behalten';
/** Lesende Auskunft über die geladenen Gesetze des Fensterbestands. */
export interface Bestandsauskunft {
  fenstertyp: 'hauptfenster' | 'hilfsfenster';
  gesetze: Array<{ gesetz: GesetzDarstellung; zustand: Bestandszustand }>;
}
/** Benutzt: von Tab oder Funktion angefordert; ohne Behalten: nur gelesen (Volltextsuche). */
type Anforderung = 'benutzt' | 'vorladen' | 'ohne-behalten';
interface Bestandsaenderung {
  geladen?: GesetzDarstellung;
  geloescht?: Gesetzesreferenz[];
}
interface Eintrag {
  referenz: Gesetzesreferenz;
  tabs: number;
  behaltenGewuenscht: boolean;
  generation: number;
  laeufe: number;
  geloescht: boolean;
  aktuellGeladen?: boolean;
  gesetz?: GesetzDarstellung;
  /** Erneuert sich nur bei fachlicher Änderung oder erneutem Laden von `gesetz`. */
  datenstand?: number;
  lauf?: Promise<GesetzLeseErgebnis>;
  meldungen?: ReturnType<typeof erzeugeGesetzLaufMeldungen>;
  aktuell?: Promise<GesetzLeseErgebnis>;
  /** Durch Vorladen angefordert und seither nicht benutzt. */
  vorgeladen: boolean;
}
export function erzeugeGeladeneGesetze(optionen: GeladeneGesetzeOptionen = {}) {
  const grenzen = holeLadegrenzen();
  const hilfsfenster = optionen.fenstertyp === 'hilfsfenster';
  const haltegrenze = hilfsfenster
    ? HILFSFENSTER_HALTEGRENZE
    : Math.max(0, optionen.haltegrenze ?? grenzen.haltegrenze);
  const eintraege = new Map<string, Eintrag>();
  const behalten = new Set<Eintrag>();
  const empfaenger = new Set<(aenderung?: Bestandsaenderung) => void>();
  const vorAustausch = new Set<(gesetz: GesetzDarstellung) => void>();
  const reparaturen = { current: 0 };
  let aktiv = true;
  const leerlaufAbbruch = new AbortController();
  let stand = 0;
  let datenstaende = 0;
  function melden(aenderung?: Bestandsaenderung) {
    stand++;
    for (const empfangen of empfaenger) empfangen(aenderung);
  }
  function holeEintrag(referenz: Gesetzesreferenz) {
    const schluessel = gesetzesreferenzSchluessel(referenz);
    let eintrag = eintraege.get(schluessel);
    if (!eintrag) {
      eintrag = {
        referenz: { kurztitel: referenz.kurztitel, normgeber: referenz.normgeber },
        tabs: 0,
        behaltenGewuenscht: false,
        generation: 0,
        laeufe: 0,
        geloescht: false,
        vorgeladen: false,
      };
      eintraege.set(schluessel, eintrag);
    }
    return eintrag;
  }
  function begrenzen(eintrag: Eintrag) {
    behalten.delete(eintrag);
    if (eintrag.gesetz && !eintrag.tabs) {
      if (eintrag.behaltenGewuenscht) behalten.add(eintrag);
      else eintrag.gesetz = undefined;
    }
    while (behalten.size > haltegrenze) {
      const aeltester = behalten.values().next().value;
      if (!aeltester) break;
      behalten.delete(aeltester);
      aeltester.gesetz = undefined;
      aeltester.behaltenGewuenscht = false;
    }
  }
  function uebernehmeGelesenesGesetz(
    eintrag: Eintrag,
    gesetz: GesetzDarstellung,
    generation: number,
  ) {
    const bisher = eintrag.gesetz;
    const abgleich = gleicheGesetzesdatenAb(bisher, gesetz);
    if (!abgleich.fachlichGeaendert) {
      eintrag.gesetz = abgleich.gesetz;
      return abgleich.gesetz;
    }
    if (bisher) for (const vorbereiten of vorAustausch) vorbereiten(gesetz);
    // Beobachter dürfen nur sichern: ein zwischenzeitlicher Wechsel oder Unmount
    // gewinnt trotzdem vor diesem Austausch.
    if (!aktiv || generation !== eintrag.generation) return undefined;
    setzeGesetz(eintrag, gesetz);
    return gesetz;
  }
  /** Fachlich neue Daten erhalten einen neuen Datenstand. */
  function setzeGesetz(eintrag: Eintrag, gesetz: GesetzDarstellung) {
    eintrag.gesetz = gesetz;
    eintrag.datenstand = ++datenstaende;
  }
  function laden(
    eintrag: Eintrag,
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
    fortsetzung?: ReturnType<typeof erzeugeGesetzLaufMeldungen>,
  ): Promise<GesetzLeseErgebnis> {
    eintrag.meldungen?.anschliessen(meldungEmpfangen);
    if (eintrag.lauf) return eintrag.lauf;
    const meldungen = fortsetzung ?? erzeugeGesetzLaufMeldungen(() => aktiv);
    meldungen.anschliessen(meldungEmpfangen);
    eintrag.meldungen = meldungen;
    const generation = eintrag.generation;
    const empfangen: AktionsMeldungEmpfaenger = (meldung) => {
      if (aktiv && generation === eintrag.generation) meldungen.empfangen(meldung);
    };
    empfangen.folgelaufErfassen = meldungen.empfangen.folgelaufErfassen;
    eintrag.laeufe++;
    const lauf = (async (): Promise<GesetzLeseErgebnis> => {
      let ergebnis: GesetzLeseErgebnis;
      try {
        ergebnis = await leseGesetz(eintrag.referenz, empfangen);
        if (aktiv && generation === eintrag.generation && ergebnis.status === 'geladen')
          await gleicheGesetzTitelAb(
            ergebnis.gesetz,
            meldungen.titelEmpfangen,
            () => !aktiv || meldungen.hatEmpfaenger(),
          );
      } catch {
        ergebnis = { status: 'nicht-lesbar', befunde: [] };
      }
      const verworfenesErgebnis = ():
        GesetzLeseErgebnis | Promise<GesetzLeseErgebnis> | undefined => {
        if (!aktiv) return { status: 'nicht-lesbar', befunde: [] };
        // Auch während des Titelabgleichs oder eines Austauschbeobachters kann
        // ein neueres Änderungs-/Löschereignis diesen Lauf entwerten.
        if (generation !== eintrag.generation)
          return eintrag.geloescht
            ? { status: 'fehlt', befunde: [] }
            : (eintrag.aktuell ?? laden(eintrag, meldungEmpfangen, meldungen));
      };
      const verworfen = verworfenesErgebnis();
      if (verworfen) return verworfen;
      eintrag.lauf = undefined;
      if (ergebnis.status === 'geladen') {
        const gesetz = uebernehmeGelesenesGesetz(eintrag, ergebnis.gesetz, generation);
        if (!gesetz) return verworfenesErgebnis() ?? { status: 'nicht-lesbar', befunde: [] };
        ergebnis = { ...ergebnis, gesetz };
        eintrag.aktuellGeladen = true;
      }
      // Nicht lesbare Dateien behalten den letzten brauchbaren Stand für offene Tabs.
      else if (ergebnis.status === 'fehlt') eintrag.gesetz = undefined;
      meldungen.meldeStandard();
      if (!meldungen.hatEmpfaenger()) meldeGesetzLadeBefunde(ergebnis.befunde, reparaturen);
      begrenzen(eintrag);
      melden(ergebnis.status === 'geladen' ? { geladen: ergebnis.gesetz } : undefined);
      return ergebnis;
    })().finally(() => {
      eintrag.laeufe--;
      if (eintrag.meldungen === meldungen && !eintrag.lauf) eintrag.meldungen = undefined;
      // Ergebnis-Promises nur für noch wartende alte Läufe halten; sonst würden
      // entladene Gesetze über die bereits erfüllten Promises weiterleben.
      if (!eintrag.laeufe) eintrag.aktuell = undefined;
    });
    eintrag.lauf = lauf;
    eintrag.aktuell = lauf;
    return lauf;
  }
  function aendern(referenzen: Gesetzesreferenz[], geloescht: boolean) {
    if (!referenzen.length) return;
    for (const referenz of referenzen) {
      const eintrag = eintraege.get(gesetzesreferenzSchluessel(referenz));
      if (!eintrag) continue;
      const betroffen = !!(eintrag.gesetz || eintrag.lauf);
      eintrag.generation++;
      eintrag.aktuellGeladen = false;
      eintrag.geloescht = geloescht;
      eintrag.lauf = undefined;
      eintrag.aktuell = undefined;
      if (geloescht) {
        eintrag.gesetz = undefined;
        behalten.delete(eintrag);
      } else if (betroffen) void laden(eintrag, undefined, eintrag.meldungen);
    }
    // Auch Verzeichnisverbraucher erfahren Änderungen an nicht geladenen Referenzen.
    melden(geloescht ? { geloescht: referenzen } : undefined);
  }
  const anmeldungen = [
    hoereGlobal('gesetze-geaendert', (event) => aendern(event.payload, false)),
    hoereGlobal('gesetze-geloescht', (event) => aendern(event.payload, true)),
  ];
  let anmeldefehler = false;
  const bereit = Promise.all(anmeldungen.map((anmeldung) => anmeldung.bereit)).then(
    () => {},
    (fehler: unknown) => {
      anmeldefehler = true;
      for (const anmeldung of anmeldungen) anmeldung.abmelden();
      if (!aktiv) return;
      console.error('Bestandsereignisse konnten nicht angemeldet werden:', fehler);
      zeigeBanner({
        art: 'systemfehler',
        typ: 'fehler',
        text: 'Die Beobachtung von Gesetzesänderungen konnte nicht angemeldet werden. Gesetze können in diesem Fenster derzeit nicht geladen werden. Bitte öffnen Sie das Fenster erneut.',
      });
    },
  );
  async function fordereAn(
    referenz: Gesetzesreferenz,
    anforderung: Anforderung,
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ): Promise<GesetzLeseErgebnis> {
    // Ohne beide Listener wäre zwischen Dateilesen und Anmeldung eine Änderung
    // unsichtbar. Verbraucher müssen diese Lebensdauergrenze nicht selbst beachten.
    await bereit;
    if (anmeldefehler || !aktiv) return { status: 'nicht-lesbar', befunde: [] };
    const eintrag = holeEintrag(referenz);
    if (anforderung === 'benutzt') eintrag.vorgeladen = false;
    // Vorladen kennzeichnet nur, was sonst weder geladen noch zum Behalten angefordert ist.
    else if (
      anforderung === 'vorladen' &&
      !eintrag.gesetz &&
      !eintrag.tabs &&
      !eintrag.behaltenGewuenscht
    )
      eintrag.vorgeladen = true;
    if (anforderung !== 'ohne-behalten') eintrag.behaltenGewuenscht = true;
    if (!aktiv) return Promise.resolve({ status: 'nicht-lesbar', befunde: [] });
    if (eintrag.geloescht) return Promise.resolve({ status: 'fehlt', befunde: [] });
    if (eintrag.lauf) {
      eintrag.meldungen?.anschliessen(meldungEmpfangen);
      return eintrag.lauf;
    }
    if (eintrag.gesetz && eintrag.aktuellGeladen) {
      begrenzen(eintrag);
      return Promise.resolve({ status: 'geladen', gesetz: eintrag.gesetz, befunde: [] });
    }
    return laden(eintrag, meldungEmpfangen);
  }
  return {
    bereit,
    ladeGesetz: (
      referenz: Gesetzesreferenz,
      meldungEmpfangen?: AktionsMeldungEmpfaenger,
      optionen?: { behalten: false },
    ): Promise<GesetzLeseErgebnis> =>
      fordereAn(
        referenz,
        optionen?.behalten === false ? 'ohne-behalten' : 'benutzt',
        meldungEmpfangen,
      ),
    /** Bestätigte lokale Löschung gilt auch bei fehlgeschlagenem Ereignisversand. */
    entferneGesetze: (referenzen: Gesetzesreferenz[]) => aendern(referenzen, true),
    /** Synchroner Übergang bereits geprüfter Gesetze aus den bisherigen Öffnen-Pfaden. */
    uebernehmeGeladenes(gesetz: GesetzDarstellung) {
      if (!aktiv) return;
      const eintrag = holeEintrag(gesetz);
      eintrag.vorgeladen = false;
      eintrag.behaltenGewuenscht = true;
      eintrag.generation++;
      eintrag.lauf = undefined;
      eintrag.aktuell = undefined;
      eintrag.geloescht = false;
      const abgleich = gleicheGesetzesdatenAb(eintrag.gesetz, gesetz);
      if (abgleich.fachlichGeaendert) setzeGesetz(eintrag, gesetz);
      else eintrag.gesetz = abgleich.gesetz;
      eintrag.aktuellGeladen = true;
      begrenzen(eintrag);
      melden();
    },
    holeGeladenes(referenz: Gesetzesreferenz) {
      return eintraege.get(gesetzesreferenzSchluessel(referenz))?.gesetz;
    },
    /** Datenstand des geladenen Gesetzes; bleibt bei reinen Metadatenänderungen gleich. */
    holeDatenstand(referenz: Gesetzesreferenz) {
      const eintrag = eintraege.get(gesetzesreferenzSchluessel(referenz));
      return eintrag?.gesetz ? eintrag.datenstand : undefined;
    },
    meldeOffenenTab(referenz: Gesetzesreferenz) {
      const eintrag = holeEintrag(referenz);
      eintrag.vorgeladen = false;
      eintrag.tabs++;
      eintrag.behaltenGewuenscht = true;
      behalten.delete(eintrag);
    },
    meldeGeschlossenenTab(referenz: Gesetzesreferenz) {
      const eintrag = holeEintrag(referenz);
      eintrag.tabs = Math.max(0, eintrag.tabs - 1);
      begrenzen(eintrag);
      melden();
    },
    async vorladen(referenzen: readonly Gesetzesreferenz[]) {
      if (hilfsfenster || !aktiv) return;
      for (const referenz of referenzen.slice(0, optionen.vorladegrenze ?? grenzen.vorladegrenze)) {
        await warteAufLeerlauf(leerlaufAbbruch.signal);
        if (!aktiv) return;
        await fordereAn(referenz, 'vorladen');
      }
    },
    /** Tabbesitzer sichern ihre Stellen gegen den bisherigen Bestand, ohne erneut zu übernehmen. */
    vorAustauschAbonnieren(vorbereiten: (gesetz: GesetzDarstellung) => void) {
      vorAustausch.add(vorbereiten);
      return () => {
        vorAustausch.delete(vorbereiten);
      };
    },
    abonnieren(empfangen: (aenderung?: Bestandsaenderung) => void) {
      empfaenger.add(empfangen);
      return () => {
        empfaenger.delete(empfangen);
      };
    },
    holeStand: () => stand,
    holeBestandsauskunft(): Bestandsauskunft {
      return {
        fenstertyp: hilfsfenster ? 'hilfsfenster' : 'hauptfenster',
        gesetze: [...eintraege.values()].flatMap(({ gesetz, tabs, vorgeladen }) =>
          gesetz
            ? [{ gesetz, zustand: tabs ? 'in Tabs' : vorgeladen ? 'vorgeladen' : 'behalten' }]
            : [],
        ),
      };
    },
    beenden() {
      aktiv = false;
      leerlaufAbbruch.abort();
      for (const anmeldung of anmeldungen) anmeldung.abmelden();
      for (const eintrag of eintraege.values()) eintrag.meldungen?.beenden();
      eintraege.clear();
      behalten.clear();
      empfaenger.clear();
      vorAustausch.clear();
    },
  };
}

export type GesetzLader = ReturnType<typeof erzeugeGeladeneGesetze>['ladeGesetz'];
