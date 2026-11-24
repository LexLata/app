// Ermittelt Ausgangskontext und Konkurrenzbefunde und bereitet Bearbeitungsanfragen vor.

// Statt dynamisch: useMarkierungenDeaktiviert.ts wird bereits über App.tsx
// (Hook-Aufruf beim Root-Component) statisch/eager geladen – ein dynamischer
// Import hier brachte keinen Chunk-Splitting-Vorteil, nur die
// Vite-Warnung INEFFECTIVE_DYNAMIC_IMPORT.

import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { type AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { EinklappZustand, Tab } from '@/lib/domain/appTypes';
import type {
  DarstellungsElement,
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import type {
  MarkierungsEintrag,
  VerweismarkierungKontext,
} from '@/lib/markierungen/markierungen.index';
import {
  ausgangsstelleNichtEindeutigMeldung,
  findeElementZuBezeichnung,
} from '@/lib/markierungen/markierungen.index';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import { ermittleAuswahl } from '@/lib/domain/textpfad/textpfad.index';
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import { type RefObject } from 'react';
import { oeffneVerweismarkierungFenster } from './useVerweismarkierungUndKommentarHilfsfenster.oeffnen';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';

type AuswahlFeld = {
  textstelle: Textstelle;
  bezugstext: string;
};

interface AusgangsErmittlung {
  auswahl?: AuswahlFeld;
  /** Norm/Überschrift der Auswahl – nur gesetzt, wenn `auswahl` gesetzt ist
   *  (siehe VerweismarkierungKontext.aktuellesElement/KommentarKontext.aktuellesElement). */
  element?: NormDarstellung | UeberschriftDarstellung;
  ausgangsstelle: Ausgangsstelle;
  ausgangsXmlId: string;
}

/** Leitet aus einem gefundenen Element (Norm oder Überschrift) die
 *  Roh-Bezeichnung und die xmlId ab – identische Ableitung für beide Fälle
 *  in ermittleAusgangskontext (Auswahl-Treffer bzw. aktives Element). */
function ermittleBezeichnungUndXmlId(
  gesetz: GesetzDarstellung,
  gefunden: DarstellungsElement,
): {
  ausgangsstelle: Ausgangsstelle | null;
  xmlId: string;
} {
  return { ausgangsstelle: ausgangsnormKennung(gesetz, gefunden), xmlId: gefunden.data.xmlId };
}

/** Ermittelt Auswahl bzw. Zielelement für einen neuen Verweismarkierung/Kommentar
 *  – gemeinsame Logik von handleVerweismarkierungAnfrage/handleKommentarAnfrage:
 *  1. Identifizierbare Textauswahl vorhanden → deren Element/Position.
 *  2. Keine nutzbare Auswahl → aktives Element des Tabs (Norm oder
 *     Überschrift, siehe aktivesElementBezeichnungErmitteln in
 *     useLesezeichenUndFavoriten.ts).
 *  Gibt 'ueberspannt-mehrere' zurück, wenn die Auswahl ein erkennbarer
 *  Fehlversuch war (Banner-Fall, siehe Aufrufer), oder null, wenn gar kein
 *  Ziel ermittelbar ist (Aufrufer bricht dann still ab). */
function ermittleAusgangskontext(
  gesetz: GesetzDarstellung,
  tab: Tab,
  einklappZustandRef: RefObject<Record<string, EinklappZustand>>,
): AusgangsErmittlung | 'ueberspannt-mehrere' | null {
  const auswahlErgebnis = ermittleAuswahl(window.getSelection());
  if ('fehler' in auswahlErgebnis && auswahlErgebnis.fehler === 'ueberspannt-mehrere') {
    return 'ueberspannt-mehrere';
  }

  let auswahl: AuswahlFeld | undefined;
  let element: NormDarstellung | UeberschriftDarstellung | undefined;
  let ausgangsstelle: Ausgangsstelle | null = null;
  let ausgangsXmlId: string | null = null;

  if (!('fehler' in auswahlErgebnis)) {
    const gefunden = gesetz.elemente.find((e) => e.data.xmlId === auswahlErgebnis.xmlId);
    if (gefunden) {
      auswahl = {
        textstelle: auswahlErgebnis.textstelle,
        bezugstext: auswahlErgebnis.bezugstext,
      };
      element = gefunden.data;
      const bez = ermittleBezeichnungUndXmlId(gesetz, gefunden);
      ausgangsstelle = bez.ausgangsstelle;
      ausgangsXmlId = bez.xmlId;
    }
  }

  // Keine (nutzbare) Auswahl: allgemeiner Verweis/Kommentar auf das aktive Element.
  if (!auswahl) {
    const schluessel = tab.id + '-' + gesetzesreferenzSchluessel(gesetz);
    const aktivesElementId = einklappZustandRef.current[schluessel]?.aktivesElementId;
    const gefunden = aktivesElementId
      ? gesetz.elemente.find((e) => e.data.id === aktivesElementId)
      : undefined;
    if (!gefunden) return null;
    const bez = ermittleBezeichnungUndXmlId(gesetz, gefunden);
    ausgangsstelle = bez.ausgangsstelle;
    ausgangsXmlId = bez.xmlId;
  }

  if (!ausgangsstelle || !ausgangsXmlId) return null;
  return {
    auswahl,
    element,
    ausgangsstelle,
    ausgangsXmlId,
  };
}

/** Kapselt die gemeinsame Abbruch-, Banner- und Auflösungsfolge beim
 *  Neu-Anlegen eines Verweises oder Kommentars. */
export async function bereiteNeueMarkierungsAnfrageVor(
  gesetz: GesetzDarstellung,
  tab: Tab,
  einklappZustandRef: RefObject<Record<string, EinklappZustand>>,
): Promise<Omit<VerweismarkierungKontext, 'openerLabel' | 'gesetz' | 'bearbeiten'> | null> {
  const ergebnis = ermittleAusgangskontext(gesetz, tab, einklappZustandRef);
  if (ergebnis === 'ueberspannt-mehrere') {
    await zeigeUeberspanntBanner();
    return null;
  }
  if (!ergebnis) return null;
  const { auswahl, element, ausgangsstelle, ausgangsXmlId } = ergebnis;
  if (!findeElementZuBezeichnung(gesetz, ausgangsstelle)) {
    const { zeigeBanner } = await import('@/lib/banner/banner.index');
    zeigeBanner({
      art: 'bedienhinweis',
      text: ausgangsstelleNichtEindeutigMeldung,
      typ: 'warnung',
    });
    return null;
  }
  if (await pruefeKonkurrenzUndZeigeBanner(gesetz, auswahl, ausgangsstelle)) return null;

  const { vollstaendigeBezeichnung } = await import('@/lib/domain/norm/norm.index');
  return {
    ausgangsstelle,
    ausgangsBezeichnung:
      ausgangsstelle.typ === 'ueberschrift'
        ? gesetz.elemente.find(
            (el) =>
              el.typ === 'ueberschrift' &&
              el.data.gliederungskennzahl === bezeichnungAusgangsstelle(ausgangsstelle),
          )?.data.bezeichnung
        : (vollstaendigeBezeichnung(gesetz, ausgangsXmlId) ?? undefined),
    auswahl,
    aktuellesElement: element,
  };
}

/** Zeigt das Banner für den 'ueberspannt-mehrere'-Fehlerfall (siehe
 *  ermittleAusgangskontext) – identisch für Verweismarkierung und Kommentar. */
async function zeigeUeberspanntBanner() {
  const { zeigeBanner } = await import('@/lib/banner/banner.index');
  zeigeBanner({
    art: 'bedienhinweis',
    text: 'Eine Markierung kann nicht über mehrere Normteile hinweg reichen.',
    typ: 'warnung',
  });
}

/** Prüft die Konkurrenz-Regel (siehe markierungSpeicher.hinzufuegen.ts:
 *  pruefeMarkierungAnStelle) für einen neuen Verweismarkierung/Kommentar MIT
 *  Textbezug: ein bestehender 'verweismarkierung'/'kommentar' an der Auswahl
 *  blockiert das Öffnen des Hilfsfensters komplett und zeigt in diesem
 *  Fall selbst das Banner. Ohne Textbezug (auswahl undefined) kann nichts
 *  überlappen. Gibt true zurück, wenn blockiert wurde (Aufrufer bricht dann ab). */
async function pruefeKonkurrenzUndZeigeBanner(
  gesetz: GesetzDarstellung,
  auswahl: AuswahlFeld | undefined,
  ausgangsstelle: Ausgangsstelle,
): Promise<boolean> {
  if (!auswahl) return false;
  const { ladeMarkierungen, pruefeMarkierungAnStelle, zeigeUeberlappungsBanner } =
    await import('@/lib/markierungen/markierungen.index');
  const bisherige = await ladeMarkierungen(gesetz);
  const { blockiertNeueMarkierung } = pruefeMarkierungAnStelle(bisherige, {
    ausgangsstelle,
    bezug: { typ: 'bezugstext', textstelle: auswahl.textstelle, bezugstext: '' },
  });
  if (!blockiertNeueMarkierung) return false;
  await zeigeUeberlappungsBanner();
  return true;
}

/** Löst die Anzeige-Bezeichnung einer Ausgangsstelle für "…bearbeiten"-Fälle
 *  auf (bearbeiteVerweismarkierung/handleKommentarBearbeiten): dort liegt (anders
 *  als beim Neu-Anlegen) noch kein geladenes GesetzDarstellung-Objekt vor.
 *  Best-effort – schlägt die Auflösung fehl, bleibt das Ergebnis undefined,
 *  die Hilfsfenster fallen dann auf die rohe Bezeichnung zurück. */
export async function loeseAusgangsBezeichnungAuf(
  gesetz: Gesetzesreferenz,
  ladeGesetz: GesetzLader,
  ausgangsstelle: Ausgangsstelle,
  meldungEmpfangen: AktionsMeldungEmpfaenger,
): Promise<string | undefined> {
  try {
    const { findeElementZuBezeichnung } = await import('@/lib/markierungen/markierungen.index');
    const { vollstaendigeBezeichnung } = await import('@/lib/domain/norm/norm.index');
    const ergebnis = await ladeGesetz(gesetz, meldungEmpfangen);
    const gefundenesGesetz = ergebnis.status === 'geladen' ? ergebnis.gesetz : undefined;
    const xmlId = gefundenesGesetz
      ? findeElementZuBezeichnung(gefundenesGesetz, ausgangsstelle)?.xmlId
      : null;
    if (!gefundenesGesetz || !xmlId) return undefined;
    return ausgangsstelle.typ === 'ueberschrift'
      ? gefundenesGesetz.elemente.find(
          (el) =>
            el.typ === 'ueberschrift' &&
            el.data.gliederungskennzahl === bezeichnungAusgangsstelle(ausgangsstelle),
        )?.data.bezeichnung
      : (vollstaendigeBezeichnung(gefundenesGesetz, xmlId) ?? undefined);
  } catch {
    return undefined; // Fallback auf die rohe Bezeichnung im Fenster
  }
}

/**
 * Öffnet das Verweismarkierung-Fenster vorausgefüllt zum Bearbeiten eines
 * bestehenden 'verweismarkierung'-Eintrags. Aus dem Hook oben herausgezogen (dort nur
 * noch ein Delegat) – die Funktion nutzte ohnehin keine Hook-Closures
 * (kein tabsRef/aktiverTabIdRef/einklappZustandRef), daher risikolos auf
 * Modul-Ebene verschiebbar. Zweiter echter Anwendungsfall neben
 * useVerweismarkierungUndKommentarHilfsfenster.ts (Rechtsklick "Bearbeiten" im
 * Gesetzestext): MarkierungskonfliktFenster.tsx nutzt sie für die
 * Konfliktaktion "Verweis bearbeiten" bei Konflikttyp zielNormUnpassend/zielNormFehlt.
 */
export async function bearbeiteVerweismarkierung(
  { kurztitel, normgeber }: Gesetzesreferenz,
  ladeGesetz: GesetzLader,
  eintrag: MarkierungsEintrag,
  meldungEmpfangen: AktionsMeldungEmpfaenger,
) {
  const gesetz = { kurztitel, normgeber };
  if (!eintrag.verweisinhalt) return; // Sicherheitsnetz – sollte bei typ 'verweismarkierung' nie fehlen

  const ausgangsBezeichnung = await loeseAusgangsBezeichnungAuf(
    gesetz,
    ladeGesetz,
    eintrag.ausgangsstelle,
    meldungEmpfangen,
  );

  const kontext: VerweismarkierungKontext = {
    openerLabel: '',
    gesetz,
    ausgangsstelle: eintrag.ausgangsstelle,
    ausgangsBezeichnung,
    bearbeiten: {
      textbezug: eintrag.bezug.textstelle
        ? { textstelle: eintrag.bezug.textstelle, bezugstext: eintrag.bezug.bezugstext }
        : undefined,
      zitatText: eintrag.verweisinhalt.verweistext,
      // Vollständiger Vorher-Zustand für die Undo-Historie dieses Fensters,
      // siehe VerweismarkierungKontext.bearbeiten.vorher-Kommentar.
      vorher: {
        verweisinhalt: eintrag.verweisinhalt,
        elementstand: eintrag.bezug.elementstand,
      },
    },
  };

  await oeffneVerweismarkierungFenster(kontext, true);
}
