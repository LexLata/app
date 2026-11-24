// kommentarAktionen.ts
//
// Kernlogik von speichern() aus KommentarFenster.tsx ausgelagert (analog zum
// bereits etablierten Muster in verweismarkierungAktionen.ts) – als
// Funktion mit explizit übergebenem Kontext statt Closure über
// Komponenten-State. Die Komponente selbst bleibt für State-Updates
// (setLaeuft/setFehler/…) zuständig und ruft diese Funktion nur noch auf –
// siehe dortige Wrapper-Funktion speichern(). Überlappungsablehnungen werden
// als Fehler für die lokale Formularmeldung zurückgegeben.

import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import { ersetzeUnzulaessigeXmlZeichen } from '@/lib/utils/xmlVerarbeitung';
import {
  gemeinsameBearbeitungsWerte,
  type KommentarBearbeitenWerte,
} from '@/lib/markierungen/eintrag/eintrag.index';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import {
  baueTextbezugUndElementstand,
  findeMarkierungsAusgangselement,
  ladeGesetzeMitGepruefterAusgangsquelle,
} from './verweismarkierungAktionen.persistieren';
import { berechneElementstand } from '@/lib/domain/gesetzDarstellungAuswertung';
import type { Elementstand } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  ausgangsstelleNichtEindeutigMeldung,
  findeElementZuBezeichnung,
  markierungsBezug,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { schliesseGespeicherteMarkierungsAktionAb } from './markierungsUebertragung';
import type { MarkierungsSpeicherAbschluss } from './markierungsUebertragung';
import type { MarkierungsAktion } from '@/lib/markierungen/eintrag/eintrag.index';
import type { KommentarKontext } from '@/lib/markierungen/hilfsfenster-aktionen/markierungen.hilfsfensterKontext';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import { aktuellerTextAnPfad } from '@/lib/domain/textpfad/textpfad.index';

export type SpeichernErgebnisKommentar =
  | { art: 'fehler'; text: string; ablehnungsgrund?: 'ausgangsstelle-nicht-eindeutig' }
  /** Entspricht dem "!ergebnis.erfolgreich || !ergebnis.aktion"-Fall in der
   *  ursprünglichen Funktion: kein Fehler anzuzeigen, aber auch keine
   *  weitere Aktion (Fenster bleibt offen, laeuft wird zurückgesetzt). */
  | { art: 'keineAktion' }
  /** Erfolgreicher Abschluss ohne erneutes Schreiben oder Historienaktion. */
  | { art: 'erfolg'; unveraendert: true }
  | MarkierungsSpeicherAbschluss;

type PersistierenErgebnis =
  | Exclude<SpeichernErgebnisKommentar, MarkierungsSpeicherAbschluss>
  | { art: 'erfolg'; aktion?: MarkierungsAktion; unveraendert?: true };

/**
 * Persistiert den Kommentar (Bearbeiten-Modus: aktualisiereKommentar; sonst:
 * hinzufuegenMarkierung) – inkl. Sync-Events ans Aufrufer-Fenster
 * (bestätigte Historienübernahme und 'markierungen-geaendert') und selektiver
 * Markierungskonflikt-Prüfung (löst hinzufuegenMarkierung/aktualisiereKommentar
 * bereits selbst zentral aus, siehe dort). Wirft NICHT bei erwartbaren
 * Ablehnungen (Duplikat, Überlappung durch Wettlauf) – die werden über SpeichernErgebnisKommentar
 * gemeldet; ein Aufrufer-Fenster-Schluss (schliessen()) bleibt bewusst
 * Sache der Komponente, nicht dieser Funktion.
 */
export async function speichereKommentar(
  kontext: KommentarKontext,
  ladeGesetz: GesetzLader,
  kommentarTextRoh: string,
  textbezug: boolean,
  signal?: AbortSignal,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<SpeichernErgebnisKommentar> {
  const text = ersetzeUnzulaessigeXmlZeichen(kommentarTextRoh).trim();

  const gesetze = await ladeGesetzeMitGepruefterAusgangsquelle(
    kontext.gesetz,
    ladeGesetz,
    meldungEmpfangen,
  );
  if (!kontext.bearbeiten && !findeMarkierungsAusgangselement(kontext, gesetze)) {
    return {
      art: 'fehler',
      text: ausgangsstelleNichtEindeutigMeldung,
      ablehnungsgrund: 'ausgangsstelle-nicht-eindeutig',
    };
  }
  const { neuerTextbezug: bezug, elementstand } = baueTextbezugUndElementstand(
    kontext,
    textbezug,
    gesetze,
    {
      findeElementZuBezeichnung,
      aktuellerTextAnPfad,
      berechneElementstand,
    },
  );
  const neuerTextbezug = { ...bezug, elementstand };

  const ergebnis = kontext.bearbeiten
    ? await speichereBearbeiteten(
        kontext,
        kontext.bearbeiten,
        text,
        neuerTextbezug,
        meldungEmpfangen,
      )
    : await speichereNeuen(kontext, text, neuerTextbezug, meldungEmpfangen);
  if (ergebnis.art !== 'erfolg' || !ergebnis.aktion) return ergebnis;

  return schliesseGespeicherteMarkierungsAktionAb(ergebnis.aktion, kontext.openerLabel, signal);
}

// Bearbeiten-Zweig: NUR kommentarText (+Textbezug) am bestehenden Eintrag
// überschreiben – Matching erfolgt über identitaetsSchluessel() aus dem
// URSPRÜNGLICHEN (unveränderten) Stand, siehe markierungSpeicher.ts:
// aktualisiereKommentar – bei textbezugslosen Kommentaren INKLUSIVE des
// ursprünglichen kommentarText: ohne ihn würden zwei unterschiedliche
// allgemeine Kommentare an derselben Norm beim Bearbeiten des zweiten
// fälschlich den ersten überschreiben (reproduzierter Bug). Ausgelagert aus
// speichereKommentar, damit dessen Cognitive Complexity nicht durch beide
// (Bearbeiten/Neu-)Zweige gemeinsam getrieben wird.
async function speichereBearbeiteten(
  kontext: KommentarKontext,
  bearbeiten: NonNullable<KommentarKontext['bearbeiten']>,
  text: string,
  neuerTextbezug: {
    textstelle?: Textstelle;
    bezugstext?: string;
    elementstand?: Elementstand;
  },
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<PersistierenErgebnis> {
  const { aktualisiereKommentar } = await import('@/lib/markierungen/eintrag/eintrag.index');
  let vorher: KommentarBearbeitenWerte = {
    ...bearbeiten.vorher,
    textstelle: bearbeiten.textbezug?.textstelle,
    bezugstext: bearbeiten.textbezug?.bezugstext,
  };
  let nachher: KommentarBearbeitenWerte = {
    kommentarText: text,
    textstelle: neuerTextbezug.textstelle,
    bezugstext: neuerTextbezug.bezugstext,
    elementstand: neuerTextbezug.elementstand,
  };
  const erfolgreich = await aktualisiereKommentar(
    kontext.gesetz,
    {
      ausgangsstelle: kontext.ausgangsstelle,

      bezug: markierungsBezug({
        ...bearbeiten.textbezug,
        elementstand: bearbeiten.vorher.elementstand,
      }),
      kommentarText: bearbeiten.vorher.kommentarText,
    },
    text,
    {
      textstelle: neuerTextbezug.textstelle,
      bezugstext: neuerTextbezug.bezugstext,
      elementstand: neuerTextbezug.elementstand,
    },
    meldungEmpfangen,
    (gespeichert) => {
      if (gespeichert.vorher.typ !== 'kommentar' || gespeichert.nachher.typ !== 'kommentar')
        throw new Error('Der gespeicherte Markierungstyp passt nicht zur Bearbeitung.');
      vorher = {
        ...gemeinsameBearbeitungsWerte(gespeichert.vorher),
        kommentarText: gespeichert.vorher.kommentarText,
      };
      nachher = {
        ...gemeinsameBearbeitungsWerte(gespeichert.nachher),
        kommentarText: gespeichert.nachher.kommentarText,
      };
    },
  );
  if (erfolgreich === 'unveraendert') return { art: 'erfolg', unveraendert: true };
  if (erfolgreich === 'nichtGefunden') {
    return {
      art: 'fehler',
      text: 'Dieser Kommentar wurde zwischenzeitlich verändert oder gelöscht und kann nicht gespeichert werden.',
    };
  }

  return {
    art: 'erfolg',
    aktion: {
      art: 'kommentarBearbeiten',
      gesetz: kontext.gesetz,
      ziel: {
        ausgangsstelle: kontext.ausgangsstelle,
      },
      vorher,
      nachher,
    },
  };
}

// Neuanlegen-Zweig. Ausgelagert aus speichereKommentar (siehe
// speichereBearbeiteten).
async function speichereNeuen(
  kontext: KommentarKontext,
  text: string,
  neuerTextbezug: {
    textstelle?: Textstelle;
    bezugstext?: string;
    elementstand?: Elementstand;
  },
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<PersistierenErgebnis> {
  const { hinzufuegenMarkierung } = await import('@/lib/markierungen/eintrag/eintrag.index');
  const neuerEintrag = {
    typ: 'kommentar' as const,
    ausgangsstelle: kontext.ausgangsstelle,

    bezug: markierungsBezug(neuerTextbezug),

    kommentarText: text,
  };
  // Ein bestehender Verweismarkierung/Kommentar an der Auswahl wurde bereits VOR
  // dem Öffnen dieses Fensters ausgeschlossen (siehe useMarkierungen.ts:
  // handleKommentarAnfrage) – hier greift daher nur noch der seltene
  // Wettlauf-Fall ODER die Konkurrenz mit einer bestehenden Unterstreichung/
  // Hervorhebung (wird automatisch entfernt, siehe Konkurrenz-Regeln in
  // markierungSpeicher.ts).
  const ergebnis = await hinzufuegenMarkierung(kontext.gesetz, neuerEintrag, meldungEmpfangen);
  // 'duplikat' (inhaltlich identischer allgemeiner Kommentar existiert
  // bereits, siehe istIdentischeAllgemeineMarkierung) wird – anders als
  // 'ueberlappung' – NICHT als flüchtiges Banner, sondern inline im
  // Formular angezeigt (siehe Absprache).
  if (ergebnis.ablehnungsgrund === 'ausgangsstelle-nicht-eindeutig') {
    return {
      art: 'fehler',
      ablehnungsgrund: ergebnis.ablehnungsgrund,
      text: ausgangsstelleNichtEindeutigMeldung,
    };
  }
  if (ergebnis.ablehnungsgrund === 'duplikat') {
    return {
      art: 'fehler',
      text: 'Ein identischer Kommentar existiert bereits.',
    };
  }
  if (ergebnis.ablehnungsgrund === 'ueberlappung') {
    return {
      art: 'fehler',
      text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.',
    };
  }
  if (!ergebnis.erfolgreich || !ergebnis.aktion) {
    return { art: 'keineAktion' };
  }
  return { art: 'erfolg', aktion: ergebnis.aktion };
}
