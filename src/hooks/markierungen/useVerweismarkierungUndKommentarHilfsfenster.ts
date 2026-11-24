// Verknüpft Markierungsanfragen und die laufende Ausgangsstellenprüfung mit Hilfsfenstern.
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
// Statt dynamisch: useMarkierungenDeaktiviert.ts wird bereits über App.tsx
// (Hook-Aufruf beim Root-Component) statisch/eager geladen – ein dynamischer
// Import hier brachte keinen Chunk-Splitting-Vorteil, nur die
// Vite-Warnung INEFFECTIVE_DYNAMIC_IMPORT.

import type { useAppTabs as Tabsteuerung } from '@/hooks/tabs/useAppTabs';
import {
  erzeugeAktionsMeldungsSammlung,
  type AktionsMeldung,
} from '@/lib/domain/app/aktionsMeldung';
import type { EinklappZustand, Tab } from '@/lib/domain/appTypes';
import { sicherungsHinweis } from '@/lib/domain/app/meldungsgruppen';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type {
  KommentarKontext,
  MarkierungsEintrag,
  VerweismarkierungKontext,
} from '@/lib/markierungen/markierungen.index';
import { istMarkierungsAusgangsstelleZuordenbar } from '@/lib/markierungen/markierungen.index';
import { hoereGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import {
  erzeugeBannerMeldungsSammlung,
  zeigeMeldungenNachZustaendigkeit,
} from '@/lib/banner/banner.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';

/** Lesebefunde beim Öffnen eines Hilfsfensters: Dateibefunde ins
 *  Dateibefund-Banner, die übrigen einer Öffnung zusammen als ein
 *  Vorgangsergebnis; spätere nach Ende der Folgeläufe gesammelt. */
async function mitOeffnungsmeldungen<T>(
  oeffnen: (meldungEmpfangen: AktionsMeldungEmpfaenger) => Promise<T>,
): Promise<T> {
  const sammlung = erzeugeBannerMeldungsSammlung();
  try {
    return await oeffnen(sammlung.meldungEmpfangen);
  } finally {
    zeigeMeldungenNachZustaendigkeit(sammlung.abschliessen());
  }
}
import { useEffect, useRef, useState, type RefObject } from 'react';
import { zeigeMarkierungenDeaktiviertBanner } from '@/hooks/einstellungen/useMarkierungenDeaktiviert';
import {
  bearbeiteVerweismarkierung,
  bereiteNeueMarkierungsAnfrageVor,
  loeseAusgangsBezeichnungAuf,
} from './useVerweismarkierungUndKommentarHilfsfenster.ausgangskontext';
import {
  oeffneKommentarFenster,
  oeffneVerweismarkierungFenster,
} from './useVerweismarkierungUndKommentarHilfsfenster.oeffnen';

/** Flüchtiges Prüfergebnis für die Bezugsteuerung. Die Speicherung prüft erneut;
 * dieser Zustand ersetzt weder den Gesetzesbestand noch gespeicherte Ausgangsdaten. */
export function useMarkierungsAusgangsstellePruefung(
  kontext: VerweismarkierungKontext | KommentarKontext | null,
  ladeGesetz: GesetzLader | undefined,
  hinweiseUebergeben?: (meldungen: AktionsMeldung[], oeffner: string) => Promise<void>,
) {
  // Jeder Prüflauf sammelt seine eigenen Meldungen. Nur angenommene Hinweise
  // dürfen das schließende Fenster überleben; Folgen werden vorher begrenzt ausgewertet.
  const laufendePruefungen = useRef(new Set<Promise<void>>());
  const [pruefung, setPruefung] = useState<{
    kontext: typeof kontext;
    laeuft: boolean;
    zuordenbar: boolean;
    fehler: string | null;
    aktionsFehler: string | null;
  } | null>(null);
  useEffect(() => {
    if (!kontext?.bearbeiten || !ladeGesetz) return;
    const ladeAusgangsgesetz = ladeGesetz;
    let aktiv = true;
    let generation = 0;
    async function pruefe() {
      const lauf = ++generation;
      const sammlung = erzeugeAktionsMeldungsSammlung();
      let zuordenbar = false;
      let fehler: string | null = null;
      setPruefung({ kontext, laeuft: true, zuordenbar: false, fehler: null, aktionsFehler: null });
      try {
        zuordenbar = await istMarkierungsAusgangsstelleZuordenbar(
          kontext!,
          ladeAusgangsgesetz,
          sammlung.meldungEmpfangen,
        );
      } catch {
        fehler =
          'Die Ausgangsquelle konnte nicht zuverlässig gelesen werden. Bitte beheben Sie den Ladefehler und versuchen Sie es erneut.';
      }
      // Erst nach dem direkten Arbeitsaufruf warten, auch bei dessen Fehler.
      // Die Quellheilung kann Folgeaufträge aus derselben Prüfqueue starten.
      const abschluss = await sammlung.warteAufAbschluss(30_000);
      const meldungen = [...sammlung.meldungen()];
      if (abschluss === 'wartefrist')
        meldungen.push({
          text: 'Die Prüfung auf Markierungskonflikte konnte nicht zuverlässig abgeschlossen werden. Bitte im Markierungskonfliktfenster „Alle Markierungen neu prüfen“ ausführen.',
          typ: 'warnung',
          art: 'hinweis',
          anlass: 'pruefabschluss',
          // Das Ende eines Folgelaufs belegt keine Quelländerung. Nur bereits
          // gemeldete Änderungen rechtfertigen einen Hinweis im Hauptfenster.
          aenderungsstand: meldungen.some((meldung) => meldung.aenderungsstand !== 'keine')
            ? 'teilweise'
            : 'keine',
        });
      if (aktiv && lauf === generation)
        setPruefung({ kontext, laeuft: false, zuordenbar, fehler, aktionsFehler: null });
      await verarbeiteMeldungen(meldungen, lauf);
    }
    async function verarbeiteMeldungen(meldungen: AktionsMeldung[], lauf: number) {
      if (!hinweiseUebergeben) return;
      const lokaleMeldungen = meldungen.filter(
        (meldung) => meldung.art === 'fehler' || meldung.aenderungsstand === 'keine',
      );
      if (aktiv && lauf === generation && lokaleMeldungen.length)
        setPruefung((stand) =>
          stand?.kontext === kontext
            ? {
                ...stand,
                aktionsFehler: [
                  ...lokaleMeldungen.map((meldung) => meldung.text),
                  sicherungsHinweis(lokaleMeldungen),
                ]
                  .filter(Boolean)
                  .join('\n'),
              }
            : stand,
        );
      const hinweise = meldungen.filter(
        (meldung) => meldung.art === 'hinweis' && meldung.aenderungsstand !== 'keine',
      );
      if (!hinweise.length) return;
      try {
        // Auch eine überholte Runde kann bereits Dateien gesichert haben.
        // Ihr tatsächlicher Änderungsbefund darf deshalb nicht entfallen.
        await hinweiseUebergeben(hinweise, kontext!.openerLabel);
      } catch (fehler) {
        console.error(
          'Hinweise der Ausgangsstellenprüfung konnten nicht übergeben werden:',
          fehler,
        );
      }
    }
    const geaendert = () => {
      const lauf = pruefe();
      laufendePruefungen.current.add(lauf);
      void lauf.finally(() => laufendePruefungen.current.delete(lauf));
    };
    const anmeldungen = [
      hoereGlobal('gesetze-geaendert', (event) => {
        if (event.payload.length) geaendert();
      }),
      hoereGlobal('gesetze-geloescht', geaendert),
    ];
    for (const anmeldung of anmeldungen)
      void anmeldung.bereit.catch((fehler) =>
        console.error('Ausgangsstellenprüfung konnte Änderungen nicht abonnieren:', fehler),
      );
    // Erfasst auch Änderungen durch externe Bearbeiter beim erneuten Fokussieren.
    window.addEventListener('focus', geaendert);
    geaendert();
    return () => {
      aktiv = false;
      anmeldungen.forEach((anmeldung) => anmeldung.abmelden());
      window.removeEventListener('focus', geaendert);
    };
  }, [kontext, ladeGesetz, hinweiseUebergeben]);
  const aktuell = pruefung?.kontext === kontext ? pruefung : null;
  const pruefungLaeuft = !!kontext?.bearbeiten && (!aktuell || aktuell.laeuft);
  return {
    bezugErhalten:
      !!kontext?.bearbeiten &&
      !!aktuell &&
      !aktuell.laeuft &&
      !aktuell.zuordenbar &&
      !aktuell.fehler,
    bezugPruefungLaeuft: pruefungLaeuft,
    bezugPrueffehler: aktuell?.fehler ?? null,
    // Optionale Titel-/Fremdquellenfehler sind lokale Aktionsfehler; sie
    // ändern weder die Zuordenbarkeit noch den gespeicherten Textbezug.
    aktionsFehler: aktuell?.aktionsFehler ?? null,
    warteAufAbschluss: async () => {
      while (laufendePruefungen.current.size) await Promise.all([...laufendePruefungen.current]);
    },
  };
}

interface VerweismarkierungUndKommentarFensterOptionen {
  ladeGesetz: GesetzLader;
  holeTabGesetz: ReturnType<typeof Tabsteuerung>['holeTabGesetz'];
  tabsRef: RefObject<Tab[]>;
  aktiverTabIdRef: RefObject<string | null>;
  /** Nur für handleVerweismarkierungAnfrage/handleKommentarAnfrage gebraucht:
   *  liefert das aktive Element (Norm ODER Überschrift), wenn ohne
   *  Textauswahl ausgelöst wird – analog zu aktivesElementBezeichnungErmitteln in
   *  useLesezeichenUndFavoriten.ts. */
  einklappZustandRef: RefObject<Record<string, EinklappZustand>>;
  /** Einstellung "Markierungen deaktivieren" (siehe useMarkierungenDeaktiviert.ts). */
  markierungenDeaktiviertRef: RefObject<boolean>;
}

export function useVerweismarkierungUndKommentarHilfsfenster({
  holeTabGesetz,
  ladeGesetz,
  tabsRef,
  aktiverTabIdRef,
  einklappZustandRef,
  markierungenDeaktiviertRef,
}: VerweismarkierungUndKommentarFensterOptionen) {
  async function oeffneNeueMarkierungsAnfrage(
    oeffnen: (
      anfrage: Omit<VerweismarkierungKontext, 'openerLabel' | 'gesetz' | 'bearbeiten'>,
      gesetz: Gesetzesreferenz,
    ) => Promise<void>,
  ) {
    const tab = aktiverTabIdRef.current
      ? tabsRef.current.find((kandidat) => kandidat.id === aktiverTabIdRef.current)
      : null;
    if (markierungenDeaktiviertRef.current) {
      if (holeTabGesetz(tab)) await zeigeMarkierungenDeaktiviertBanner();
      return;
    }
    const tabGesetz = holeTabGesetz(tab);
    if (!tab || !tabGesetz) return;

    let anfrage: Awaited<ReturnType<typeof bereiteNeueMarkierungsAnfrageVor>>;
    try {
      anfrage = await bereiteNeueMarkierungsAnfrageVor(tabGesetz, tab, einklappZustandRef);
    } catch (fehler) {
      // Der geschützte Lader hat den Dateifehler bereits als Banner angezeigt.
      // Die Anfrage endet hier, damit Menü und Tastenkürzel keine abgelehnte
      // Promise zurücklassen und kein Fenster ohne Konkurrenzprüfung öffnet.
      console.error('Markierungen konnten vor dem Öffnen nicht geprüft werden:', fehler);
      return;
    }
    if (anfrage)
      await oeffnen(anfrage, {
        kurztitel: tabGesetz.kurztitel,
        normgeber: tabGesetz.normgeber,
      });
  }

  // Trigger für ⌘K / Menü „Verweismarkierung": öffnet ein EIGENES Fenster (siehe
  // VerweismarkierungKontext-Kommentar in markierungen.hilfsfensterKontext.ts), statt sofort zu speichern.
  // Die Auswahl wird – falls vorhanden – SOFORT erfasst, weil sie spätestens
  // beim Fokussieren des Hilfsfensters verloren geht (Browser-Selektion ist
  // fensterspezifisch). Liegt keine identifizierbare Textauswahl vor, wird
  // stattdessen das aktive Element des Tabs (Norm ODER Überschrift, siehe
  // aktivesElementBezeichnungErmitteln in useLesezeichenUndFavoriten.ts) als Ziel eines
  // ALLGEMEINEN Verweises herangezogen.
  async function handleVerweismarkierungAnfrage() {
    await oeffneNeueMarkierungsAnfrage(async (anfrage, gesetz) => {
      await oeffneVerweismarkierungFenster({ openerLabel: '', gesetz, ...anfrage }, false);
    });
  }

  // Trigger für "Verweis bearbeiten" (Rechtsklick auf den Zitat-Text
  // eines bestehenden 'verweismarkierung'-Eintrags im Gesetzes-View, siehe
  // markierungContext.ts: onMarkierungRechtsklick). Öffnet
  // dasselbe Hilfsfenster wie handleVerweismarkierungAnfrage, aber vorausgefüllt
  // mit den bisherigen Werten (kontext.bearbeiten, siehe markierungen.hilfsfensterKontext.ts) – die
  // eigentliche Auflösung/Speicherung übernimmt VerweismarkierungFenster.tsx wie
  // gehabt. `eintrag` stammt direkt aus MarkierungCtx.markierungenNachXmlId
  // (bereits geladene, ECHTE persistierte Markierung – getaggte Verweise aus
  // dem Quell-XML dürfen hier nicht ankommen, siehe Aufrufer-Filter).
  const handleVerweismarkierungBearbeiten = (
    gesetz: Gesetzesreferenz,
    eintrag: MarkierungsEintrag,
  ) =>
    mitOeffnungsmeldungen((meldungEmpfangen) =>
      bearbeiteVerweismarkierung(gesetz, ladeGesetz, eintrag, meldungEmpfangen),
    );

  // Trigger für ⇧⌘K / Menü „Kommentar": öffnet ein EIGENES Fenster (analog zu
  // handleVerweismarkierungAnfrage) – strukturell schlanker, da kein Zitat-Parsing
  // und keine Ziel-Auflösung nötig sind (reiner Freitext-Kommentar).
  async function handleKommentarAnfrage() {
    await oeffneNeueMarkierungsAnfrage(async (anfrage, gesetz) => {
      const kontext: KommentarKontext = { openerLabel: '', gesetz, ...anfrage };
      await oeffneKommentarFenster(kontext, false);
    });
  }

  // Trigger für "Kommentar bearbeiten" (Klick auf das Infosymbol ⓘ eines
  // bestehenden 'kommentar'-Eintrags im Gesetzes-View, siehe
  // textBlatt.tsx / markierung/markierungsAnzeige.tsx:
  // onKommentarKlick). Öffnet SOFORT dasselbe Hilfsfenster wie
  // handleKommentarAnfrage, aber vorausgefüllt mit den bisherigen Werten –
  // anders als beim Verweismarkierung kein Zwischenschritt über ein Kontextmenü.
  async function handleKommentarBearbeiten(
    { kurztitel, normgeber }: Gesetzesreferenz,
    eintrag: MarkierungsEintrag,
  ) {
    const gesetz = { kurztitel, normgeber };
    if (eintrag.kommentarText === undefined) return; // Sicherheitsnetz – sollte bei typ 'kommentar' nie fehlen

    const ausgangsBezeichnung = await mitOeffnungsmeldungen((meldungEmpfangen) =>
      loeseAusgangsBezeichnungAuf(gesetz, ladeGesetz, eintrag.ausgangsstelle, meldungEmpfangen),
    );

    // Nur Startkontext für Darstellung/Neuanlage; Speicherung lädt und prüft
    // die Ausgangsstelle erneut und leitet nichts aus diesem alten Stand ab.
    const tab = aktiverTabIdRef.current
      ? tabsRef.current.find((t) => t.id === aktiverTabIdRef.current)
      : null;
    const aktivesGesetz =
      holeTabGesetz(tab) && tab?.gesetzesreferenz && istGleichesGesetz(tab.gesetzesreferenz, gesetz)
        ? holeTabGesetz(tab)
        : undefined;
    const { findeElementZuBezeichnung } = await import('@/lib/markierungen/markierungen.index');
    const aktuellesElement = aktivesGesetz
      ? findeElementZuBezeichnung(aktivesGesetz, eintrag.ausgangsstelle)
      : undefined;

    const kontext: KommentarKontext = {
      openerLabel: '',
      gesetz,
      ausgangsstelle: eintrag.ausgangsstelle,

      ausgangsBezeichnung,
      aktuellesElement,
      bearbeiten: {
        textbezug: eintrag.bezug.textstelle
          ? { textstelle: eintrag.bezug.textstelle, bezugstext: eintrag.bezug.bezugstext }
          : undefined,
        kommentarText: eintrag.kommentarText,
        vorher: {
          kommentarText: eintrag.kommentarText,
          elementstand: eintrag.bezug.elementstand,
        },
      },
    };

    await oeffneKommentarFenster(kontext, true);
  }

  return {
    handleVerweismarkierungAnfrage,
    handleVerweismarkierungBearbeiten,
    handleKommentarAnfrage,
    handleKommentarBearbeiten,
  };
}
