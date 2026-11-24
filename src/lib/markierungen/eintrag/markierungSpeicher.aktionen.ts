// Entfernt einzelne Markierungen und aktualisiert Kommentar oder Verweis über ihre Identität.

import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  identitaetsSchluessel,
  markierungsBezug,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { AktualisierenErgebnis, Elementstand, VerweisInhalt } from './markierungSpeicher';
import { ermittleMarkierungsDateipfad, mitMarkierungsQuelle } from './markierungSpeicher';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import { schreibeMarkierungsXML } from './markierungSpeicher.schreiben';
import { baueXML } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { ladeEintraegeUnterSperre } from './markierungSpeicher.lesen';
import {
  eintraegeSindGleich,
  uebernehmeZeitstempel,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

export type BearbeitungsStaende = { vorher: MarkierungsEintrag; nachher: MarkierungsEintrag };

async function aktualisiereEintragMitIdentitaet(
  gesetz: Gesetzesreferenz,
  zielSchluessel: string,
  typ: 'verweismarkierung' | 'kommentar',
  aenderungen: () =>
    | { typ: 'kommentar'; bezug: MarkierungsEintrag['bezug']; kommentarText: string }
    | {
        typ: 'verweismarkierung';
        bezug: MarkierungsEintrag['bezug'];
        verweisinhalt: VerweisInhalt;
      },
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  staendeEmpfangen?: (staende: BearbeitungsStaende) => void,
): Promise<AktualisierenErgebnis> {
  return mitMarkierungsQuelle(
    gesetz,
    async (token, vorgang, geaendert) => {
      const bisherige = await ladeEintraegeUnterSperre(
        gesetz,
        token,
        vorgang,
        geaendert,
        meldungEmpfangen,
      );
      const index = bisherige.findIndex(
        (eintrag) => eintrag.typ === typ && identitaetsSchluessel(eintrag) === zielSchluessel,
      );
      if (index === -1) return 'nichtGefunden';

      const aktualisiert = [...bisherige];
      const vorher = bisherige[index];
      if (!vorher) return 'nichtGefunden';
      const neu = uebernehmeZeitstempel(
        gesetz,
        vorher,
        { ausgangsstelle: vorher.ausgangsstelle, ...aenderungen() },
        new Date(),
      );
      aktualisiert[index] = neu;
      if (eintraegeSindGleich(gesetz, aktualisiert, bisherige)) return 'unveraendert';
      await schreibeMarkierungsXML(
        await ermittleMarkierungsDateipfad(gesetz),
        baueXML(gesetz, aktualisiert),
        token,
        vorgang,
      );
      staendeEmpfangen?.({ vorher, nachher: neu });
      geaendert(identitaetsSchluessel(neu));
      return 'geaendert';
    },
    undefined,
    false,
    meldungEmpfangen,
  );
}

/**
 * Entfernt GENAU EINEN Eintrag wieder (Gegenstück zu hinzufuegenMarkierung –
 * wird für Rückgängig einer 'hinzufuegen'-Aktion gebraucht, siehe
 * fuehreRueckgaengigAus unten). Identifikation über identitaetsSchluessel()
 * (siehe markierungskonfliktPruefung.ts) – bezeichnung + praefix + typ + entweder
 * Zeichen-Bereich (mit Textbezug) oder kommentarText/verweistext (ohne
 * Textbezug, siehe istIdentischeAllgemeineMarkierung oben). Bewusst NICHT
 * mehr nur bezeichnung + Textpfad + Zeichen-Bereich wie zuvor: bei
 * Einträgen OHNE Textbezug (kein Zeichen-Bereich) können mehrere,
 * inhaltlich unterschiedliche allgemeine Kommentare/Verweise an derselben
 * Norm liegen (siehe Absprache) – ohne den Text im Vergleich hätte
 * Array.findIndex bei zwei solchen Einträgen immer den FALSCHEN treffen
 * können (reproduzierter Bug, analog zum bereits bekannten Bug bei
 * mehreren Verweismarkierungen ohne Absätze). Gibt `false` zurück, wenn keine
 * passende Stelle gefunden wurde (z.B. Datei zwischenzeitlich extern
 * geändert) – analog zu aktualisiereZielnorm.
 */
export async function entferneMarkierung(
  gesetz: Gesetzesreferenz,
  ziel: MarkierungsEintrag,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<boolean> {
  return mitMarkierungsQuelle(
    gesetz,
    async (token, vorgang, geaendert) => {
      const bisherige = await ladeEintraegeUnterSperre(
        gesetz,
        token,
        vorgang,
        geaendert,
        meldungEmpfangen,
      );
      const zielSchluessel = identitaetsSchluessel(ziel);
      const index = bisherige.findIndex((e) => identitaetsSchluessel(e) === zielSchluessel);
      if (index === -1) return false;
      const aktualisiert = bisherige.filter((_, i) => i !== index);
      await schreibeMarkierungsXML(
        await ermittleMarkierungsDateipfad(gesetz),
        baueXML(gesetz, aktualisiert),
        token,
        vorgang,
      );
      // Zentraler Trigger (analog zu nichtamtlicheTitelSpeicher.ts/
      // markierungSpeicher.dateiImport.ts): entfernt einen ggf. bestehenden
      // Konflikteintrag zu GENAU dieser Markierung aus markierungskonflikte.xml
      // (siehe aktualisiereEinzelneMarkierung – der Eintrag fehlt danach einfach in den
      // live geladenen Einträgen). Deckt damit sowohl das direkte Löschen einer
      // Markierung (Rechtsklick im Gesetzestext) als auch Undo/Redo darüber ab,
      // ohne dass jeder Aufrufer selbst daran denken muss – Meldung über
      // markierungSpeicher.ereignisse.ts statt eines direkten Imports, da
      // markierungskonflikteSpeicher.ts umgekehrt bereits wertseitig aus dieser
      // Datei importiert (zirkulärer Modul-Import sonst).
      geaendert(zielSchluessel);
      return true;
    },
    undefined,
    false,
    meldungEmpfangen,
  );
}

/**
 * Überschreibt verweisinhalt (+ elementstand) eines BESTEHENDEN
 * 'verweismarkierung'-Eintrags (Verweismarkierung bearbeiten, siehe VerweismarkierungFenster.tsx).
 * Identifikation über identitaetsSchluessel() (siehe
 * markierungskonfliktPruefung.ts) aus `bisherigerEintrag` – WIE DIE STELLE VOR
 * DIESEM AUFRUF AUF DER PLATTE STAND (bezeichnung + praefix + Textstelle
 * BEI Textbezug, sonst zusätzlich verweisinhalt). Ohne den Inhalt (bei
 * textbezugslosen Verweisen) mit im Vergleich träfe findIndex bei mehreren
 * UNTERSCHIEDLICHEN allgemeinen Verweisen an derselben Norm immer den
 * ERSTEN, unabhängig davon, welcher tatsächlich bearbeitet wurde
 * (reproduzierter Bug, analog zu entferneMarkierung).
 * `bisherigerEintrag` ist bewusst VOM neu zu schreibenden `neuerTextbezug`/
 * `verweisinhalt` getrennt: bei Undo/Redo (siehe fuehreRueckgaengigAus/
 * fuehreWiederholenAus in markierungSpeicher.undo.ts) unterscheiden sich
 * "wie die Stelle GERADE auf der Platte liegt" (Such-Kriterium) und "welcher
 * Wert geschrieben werden soll" (vorher- bzw. nachher-Wert), falls
 * Textbezug oder verweisinhalt selbst Teil der Änderung waren.
 * `neuerTextbezug` ersetzt textstelle/bezugstext vollständig
 * (undefined = Umwandlung in einen allgemeinen Verweis, siehe Absprache:
 * Textbezug → allgemein ist erlaubt, umgekehrt nicht – das UI verhindert den
 * umgekehrten Fall bereits, diese Funktion selbst prüft es nicht nochmal).
 * Gibt `nichtGefunden` zurück, wenn keine passende Stelle gefunden wurde (z.B. Datei
 * zwischenzeitlich extern geändert).
 */
export async function aktualisiereZielnorm(
  gesetz: Gesetzesreferenz,
  bisherigerEintrag: Pick<MarkierungsEintrag, 'ausgangsstelle' | 'bezug' | 'verweisinhalt'>,
  verweisinhalt: VerweisInhalt,
  neuerTextbezug: { textstelle?: Textstelle; bezugstext?: string },
  elementstand?: Elementstand,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  staendeEmpfangen?: (staende: BearbeitungsStaende) => void,
): Promise<AktualisierenErgebnis> {
  const zielSchluessel = identitaetsSchluessel({
    ...bisherigerEintrag,
    typ: 'verweismarkierung',
  });
  return aktualisiereEintragMitIdentitaet(
    gesetz,
    zielSchluessel,
    'verweismarkierung',
    () => ({
      typ: 'verweismarkierung',
      bezug: markierungsBezug({ ...neuerTextbezug, elementstand }),

      verweisinhalt,
    }),
    meldungEmpfangen,
    staendeEmpfangen,
  );
}

/**
 * Überschreibt kommentarText (+ ggf. Textbezug) eines BESTEHENDEN
 * 'kommentar'-Eintrags (Kommentar bearbeiten, siehe KommentarFenster.tsx).
 * Strukturell eine schlankere Variante von aktualisiereZielnorm: keine
 * Ziel-Auflösung nötig (Freitext), daher kein verweisinhalt/Elementstand/
 * Import-Mechanismus – aber dieselbe Identifikations-Logik über
 * identitaetsSchluessel() aus `bisherigerEintrag`, aus demselben Grund wie
 * dort: mehrere unterschiedliche Kommentare an derselben Norm müssen
 * unterscheidbar bleiben. Gibt `nichtGefunden` zurück, wenn keine passende Stelle
 * gefunden wurde.
 */
export async function aktualisiereKommentar(
  gesetz: Gesetzesreferenz,
  bisherigerEintrag: Pick<MarkierungsEintrag, 'ausgangsstelle' | 'bezug' | 'kommentarText'>,
  kommentarText: string,
  neuerTextbezug: {
    textstelle?: Textstelle;
    bezugstext?: string;
    elementstand?: Elementstand;
  },
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
  staendeEmpfangen?: (staende: BearbeitungsStaende) => void,
): Promise<AktualisierenErgebnis> {
  const zielSchluessel = identitaetsSchluessel({
    ...bisherigerEintrag,
    typ: 'kommentar',
  });
  return aktualisiereEintragMitIdentitaet(
    gesetz,
    zielSchluessel,
    'kommentar',
    () => ({
      typ: 'kommentar',
      bezug: markierungsBezug(neuerTextbezug),

      kommentarText,
    }),
    meldungEmpfangen,
    staendeEmpfangen,
  );
}
