// verweismarkierungAktionen.persistieren.ts
//
// Aus speichereVerweismarkierung (verweismarkierungAktionen.ts) ausgelagert, um
// dessen Cognitive Complexity zu senken (siehe Kopfkommentar dort) – der
// zweite, von der Zielnormen-Auflösung (verweismarkierungAktionen.zitatAufloesung.ts)
// unabhängige Teil: Textbezug/Elementstand berechnen und anschließend
// persistieren (Bearbeiten eines bestehenden Verweises ODER Anlegen eines
// neuen). `SpeichernErgebnisVerweismarkierung` ist bewusst HIER definiert (nicht in
// verweismarkierungAktionen.ts) und wird von dort re-exportiert – so bleibt
// die Importrichtung einseitig (aktionen.ts → persistieren.ts) und es
// entsteht kein Kreis, den dependency-cruiser (no-circular: 'error') melden
// würde.

import {
  gemeinsameBearbeitungsWerte,
  type BearbeitungsStaende,
  type VerweisBearbeitenWerte,
} from '@/lib/markierungen/eintrag/eintrag.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import type {
  Elementstand,
  MarkierungsEintrag,
  VerweisInhalt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  ausgangsstelleNichtEindeutigMeldung,
  findeElementZuBezeichnung,
  markierungsBezug,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type {
  GesetzDarstellung,
  Gesetzesreferenz,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import type {
  KommentarKontext,
  VerweismarkierungKontext,
} from '@/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import type {
  AktualisierenErgebnis,
  HinzufuegenErgebnis,
  MarkierungsAktion,
} from '@/lib/markierungen/eintrag/eintrag.index';
import type { ZitatFehler } from './verweismarkierungAktionen.zitatAufloesung';
import type { MarkierungsSpeicherAbschluss } from './markierungsUebertragung';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';

export type SpeichernErgebnisVerweismarkierung =
  | { art: 'fehler'; fehler: ZitatFehler[]; ablehnungsgrund?: 'ausgangsstelle-nicht-eindeutig' }
  /** Entspricht dem "!ergebnis.erfolgreich || !ergebnis.aktion"-Fall in der
   *  ursprünglichen Funktion: kein Fehler anzuzeigen, aber auch keine
   *  weitere Aktion (Fenster bleibt offen, laeuft wird zurückgesetzt). */
  | { art: 'keineAktion' }
  /** Erfolgreicher Abschluss ohne erneutes Schreiben oder Historienaktion. */
  | { art: 'erfolg'; unveraendert: true }
  | MarkierungsSpeicherAbschluss;

export type PersistierenErgebnis =
  | Exclude<SpeichernErgebnisVerweismarkierung, MarkierungsSpeicherAbschluss>
  | { art: 'erfolg'; aktion?: MarkierungsAktion; unveraendert?: true };

/** Der gezielte Zugriff darf Ladefehler der benötigten Ausgangsquelle nicht
 * als fehlendes Gesetz behandeln und dadurch einen vorhandenen Elementstand löschen. */
export async function ladeGesetzeMitGepruefterAusgangsquelle(
  gesetz: Gesetzesreferenz,
  ladeGesetz: GesetzLader,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<GesetzDarstellung[]> {
  const ergebnis = await ladeGesetz(gesetz, meldungEmpfangen);
  if (ergebnis.status === 'nicht-lesbar')
    throw new Error(
      'Die Ausgangsquelle konnte nicht zuverlässig gelesen werden. Bitte beheben Sie den Ladefehler und versuchen Sie es erneut.',
    );
  return ergebnis.status === 'geladen' ? [ergebnis.gesetz] : [];
}

/** Derselbe gezielte Zugriff und strikte Maßstab wie beim Speichern; Ladefehler
 * werden weitergegeben und dürfen im Formular nicht als fehlende Stelle gelten. */
export async function istMarkierungsAusgangsstelleZuordenbar(
  kontext: VerweismarkierungKontext | KommentarKontext,
  ladeGesetz: GesetzLader,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  const alle = await ladeGesetzeMitGepruefterAusgangsquelle(
    kontext.gesetz,
    ladeGesetz,
    meldungEmpfangen,
  );
  return !!findeMarkierungsAusgangselement(kontext, alle);
}

/** Verwendet denselben strikten Auflöser wie die Vorabprüfung. */
export function findeMarkierungsAusgangselement(
  kontext: Pick<KommentarKontext, 'gesetz' | 'ausgangsstelle'>,
  alle: GesetzDarstellung[],
): NormDarstellung | UeberschriftDarstellung | undefined {
  const gesetz = alle.find((g) => istGleichesGesetz(g, kontext.gesetz));
  return gesetz ? findeElementZuBezeichnung(gesetz, kontext.ausgangsstelle) : undefined;
}

export interface TextbezugErgebnis {
  neuerTextbezug: { textstelle?: Textstelle; bezugstext?: string };
  elementstand?: Elementstand;
}

export interface TextbezugDomainFns {
  findeElementZuBezeichnung: (
    gesetz: GesetzDarstellung,
    ausgangsstelle: Ausgangsstelle,
  ) => NormDarstellung | UeberschriftDarstellung | undefined;
  aktuellerTextAnPfad: (
    element: NormDarstellung | UeberschriftDarstellung,
    textstelle: Textstelle,
  ) => string | undefined;
  berechneElementstand: (element: NormDarstellung | UeberschriftDarstellung) => Elementstand;
}

/**
 * Vereinheitlicht die beiden möglichen Quellen für Textbezug-Daten (beim
 * Erstellen die Live-Auswahl aus kontext.auswahl, beim Bearbeiten der
 * bisherige Textbezug aus kontext.bearbeiten – nur eine der beiden ist
 * jemals gesetzt), berechnet daraus den frischen bezugstext (siehe
 * aktuellerTextAnPfad-Docstring am ursprünglichen Aufrufort) sowie – bei
 * allgemeinem Zitat ohne Textbezug – die elementstand der Ausgangsstelle.
 */
export function baueTextbezugUndElementstand(
  kontext: Pick<
    VerweismarkierungKontext | KommentarKontext,
    'gesetz' | 'ausgangsstelle' | 'auswahl' | 'bearbeiten'
  >,
  textbezugAngefordert: boolean,
  alle: GesetzDarstellung[],
  domainFns: TextbezugDomainFns,
): TextbezugErgebnis {
  const textbezugQuelle = kontext.auswahl ?? kontext.bearbeiten?.textbezug;
  const hatTextbezug = textbezugAngefordert && !!textbezugQuelle;

  const ausgangsgesetz = alle.find((g) => istGleichesGesetz(g, kontext.gesetz));
  const ausgangsElement = ausgangsgesetz
    ? domainFns.findeElementZuBezeichnung(ausgangsgesetz, kontext.ausgangsstelle)
    : undefined;

  // Ohne eindeutige Ausgangsstelle bleibt der vollständige gespeicherte
  // Bezug erhalten, auch wenn das Formular zuvor eine Umwandlung angefordert hat.
  // Nur Kommentartext bzw. Verweisziele dürfen dann geändert werden.
  if (!ausgangsElement && kontext.bearbeiten) {
    const { elementstand } = kontext.bearbeiten.vorher;
    return {
      neuerTextbezug: {
        textstelle: kontext.bearbeiten.textbezug?.textstelle,
        bezugstext: kontext.bearbeiten.textbezug?.bezugstext,
      },
      elementstand,
    };
  }

  let elementstand: Elementstand | undefined;
  if (!hatTextbezug && ausgangsElement) {
    elementstand = domainFns.berechneElementstand(ausgangsElement);
  }

  const frischerBezugstext =
    hatTextbezug && ausgangsElement
      ? domainFns.aktuellerTextAnPfad(ausgangsElement, textbezugQuelle!.textstelle)
      : undefined;

  return {
    neuerTextbezug: {
      textstelle: hatTextbezug ? textbezugQuelle!.textstelle : undefined,
      bezugstext: hatTextbezug ? (frischerBezugstext ?? textbezugQuelle!.bezugstext) : undefined,
    },
    elementstand,
  };
}

/**
 * Bearbeiten: NUR zielnorm (+elementstand+Textbezug) am bestehenden
 * Eintrag überschreiben – Matching erfolgt über identitaetsSchluessel() aus
 * dem URSPRÜNGLICHEN (unveränderten) Stand (siehe markierungSpeicher.ts:
 * aktualisiereZielnorm) – bei textbezugslosen Verweisen INKLUSIVE des
 * ursprünglichen verweistext: ohne ihn würden zwei unterschiedliche
 * allgemeine Verweise an derselben Norm beim Bearbeiten des zweiten fälschlich
 * den ersten überschreiben (reproduzierter Bug). Gibt die gespeicherte Aktion zurück; IPC folgt erst im Orchestrator.
 */
export async function persistiereBearbeiten(
  kontext: Pick<VerweismarkierungKontext, 'gesetz' | 'ausgangsstelle' | 'openerLabel'> & {
    bearbeiten: NonNullable<VerweismarkierungKontext['bearbeiten']>;
  },
  verweisinhalt: VerweisInhalt,
  neuerTextbezug: TextbezugErgebnis['neuerTextbezug'],
  elementstand: Elementstand | undefined,
  aktualisiereZielnorm: (
    gesetz: Gesetzesreferenz,
    vorherigeIdentitaet: {
      ausgangsstelle: Ausgangsstelle;
      bezug: MarkierungsEintrag['bezug'];
      verweisinhalt: VerweisInhalt;
    },
    verweisinhalt: VerweisInhalt,
    neuerTextbezug: { textstelle?: Textstelle; bezugstext?: string },
    elementstand: Elementstand | undefined,
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
    staendeEmpfangen?: (staende: BearbeitungsStaende) => void,
  ) => Promise<AktualisierenErgebnis>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<PersistierenErgebnis> {
  let vorher: VerweisBearbeitenWerte = {
    ...kontext.bearbeiten.vorher,
    textstelle: kontext.bearbeiten.textbezug?.textstelle,
    bezugstext: kontext.bearbeiten.textbezug?.bezugstext,
  };
  let nachher: VerweisBearbeitenWerte = {
    verweisinhalt: verweisinhalt,
    textstelle: neuerTextbezug.textstelle,
    bezugstext: neuerTextbezug.bezugstext,
    elementstand: elementstand,
  };
  const erfolgreich = await aktualisiereZielnorm(
    kontext.gesetz,
    {
      ausgangsstelle: kontext.ausgangsstelle,

      bezug: markierungsBezug({
        ...kontext.bearbeiten.textbezug,
        elementstand: kontext.bearbeiten.vorher.elementstand,
      }),
      verweisinhalt: kontext.bearbeiten.vorher.verweisinhalt,
    },
    verweisinhalt,
    {
      textstelle: neuerTextbezug.textstelle,
      bezugstext: neuerTextbezug.bezugstext,
    },
    elementstand,
    meldungEmpfangen,
    (gespeichert) => {
      if (
        gespeichert.vorher.typ !== 'verweismarkierung' ||
        gespeichert.nachher.typ !== 'verweismarkierung'
      )
        throw new Error('Der gespeicherte Markierungstyp passt nicht zur Bearbeitung.');
      vorher = {
        ...gemeinsameBearbeitungsWerte(gespeichert.vorher),
        verweisinhalt: gespeichert.vorher.verweisinhalt,
      };
      nachher = {
        ...gemeinsameBearbeitungsWerte(gespeichert.nachher),
        verweisinhalt: gespeichert.nachher.verweisinhalt,
      };
    },
  );
  if (erfolgreich === 'unveraendert') return { art: 'erfolg', unveraendert: true };
  if (erfolgreich === 'nichtGefunden') {
    return {
      art: 'fehler',
      fehler: [
        {
          art: 'sonst',
          text: 'Dieser Verweis konnte nicht mehr gefunden werden – wurde er zwischenzeitlich entfernt?',
        },
      ],
    };
  }
  return {
    art: 'erfolg',
    aktion: {
      art: 'verweisBearbeiten',
      gesetz: kontext.gesetz,
      ziel: {
        ausgangsstelle: kontext.ausgangsstelle,
      },
      vorher,
      nachher,
    },
  };
}

/**
 * Neuen Verweis anlegen. Ein bestehender Verweismarkierung/Kommentar an der
 * Auswahl wurde bereits VOR dem Öffnen dieses Fensters ausgeschlossen (siehe
 * useMarkierungen.ts: handleVerweismarkierungAnfrage) – hier greift daher nur noch
 * der seltene Wettlauf-Fall (Markierung zwischen Öffnen und Speichern von
 * anderswo hinzugekommen) ODER die Konkurrenz mit einer bestehenden
 * Unterstreichung/Hervorhebung (wird von hinzufuegenMarkierung automatisch
 * entfernt, siehe Konkurrenz-Regeln in markierungSpeicher.ts). Gibt die tatsächlich gespeicherte Aktion zurück (siehe persistiereBearbeiten).
 */
export async function persistiereNeuenVerweis(
  kontext: Pick<
    VerweismarkierungKontext,
    'gesetz' | 'ausgangsstelle' | 'aktuellesElement' | 'openerLabel'
  >,
  verweisinhalt: VerweisInhalt,
  neuerTextbezug: TextbezugErgebnis['neuerTextbezug'],
  elementstand: Elementstand | undefined,
  hinzufuegenMarkierung: (
    gesetz: Gesetzesreferenz,
    neuerEintrag: MarkierungsEintrag,
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ) => Promise<HinzufuegenErgebnis>,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<PersistierenErgebnis> {
  const neuerEintrag = {
    typ: 'verweismarkierung' as const,
    ausgangsstelle: kontext.ausgangsstelle,

    bezug: markierungsBezug({ ...neuerTextbezug, elementstand }),

    verweisinhalt,
  };
  const ergebnis = await hinzufuegenMarkierung(kontext.gesetz, neuerEintrag, meldungEmpfangen);

  // 'duplikat' (inhaltlich identischer allgemeiner Verweis existiert
  // bereits, siehe istIdentischeAllgemeineMarkierung) wird wie eine
  // Überlappung als reguläre
  // ZitatFehler INLINE im Formular angezeigt (siehe Absprache, gleiches
  // Muster wie "Gesetz fehlt"/"Norm existiert nicht" in zitatAufloesung.ts).
  if (ergebnis.ablehnungsgrund === 'ausgangsstelle-nicht-eindeutig') {
    return {
      art: 'fehler',
      ablehnungsgrund: ergebnis.ablehnungsgrund,
      fehler: [{ art: 'sonst', text: ausgangsstelleNichtEindeutigMeldung }],
    };
  }
  if (ergebnis.ablehnungsgrund === 'duplikat') {
    return {
      art: 'fehler',
      fehler: [{ art: 'sonst', text: 'Ein identischer Verweis existiert bereits.' }],
    };
  }
  if (ergebnis.ablehnungsgrund === 'ueberlappung') {
    return {
      art: 'fehler',
      fehler: [
        { art: 'sonst', text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.' },
      ],
    };
  }
  if (!ergebnis.erfolgreich || !ergebnis.aktion) {
    return { art: 'keineAktion' };
  }
  return { art: 'erfolg', aktion: ergebnis.aktion };
}
