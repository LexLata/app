// Fügt Unterstreichungen und Hervorhebungen hinzu; prüft Überlappungen und kombiniert oder teilt Bestände.

import { isoZeitstempel } from '@/lib/utils/xmlVerarbeitung';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type {
  Gesetzesreferenz,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  ausgangsnormSchluessel,
  identitaetsSchluessel,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import { aktuellerTextAnPfad, pfadGleich } from '@/lib/domain/textpfad/textpfad.index';
import { sicherstelleOrdner } from '@/lib/markierungen/eintrag/markierungSpeicher';
import { ladeEintraegeUnterSperre } from '@/lib/markierungen/eintrag/markierungSpeicher.lesen';
import { schreibeEintraege } from '@/lib/markierungen/eintrag/markierungSpeicher.aendern';
import { mitGepruefterAusgangsstelle } from './markierungSpeicher.anlegen';
import type {
  MarkierungErsetzenAktion,
  MarkierungHinzufuegenAktion,
} from '@/lib/markierungen/eintrag/markierungSpeicher.undo';

/**
 * Reine Bereichs-Overlap-Prüfung für zwei Zeichen-Bereiche derselben
 * Norm/Überschrift und desselben Textpfad – ohne jede Rücksicht auf Typen.
 * Kernberechnung von pruefeMarkierungAnStelle(), zusätzlich direkt genutzt
 * von der Datei-Import-Zusammenführung (siehe zusammenfuehrenMarkierungen)
 * – dort gilt aber eine andere Typ-Einschränkung (jede Markierung mit
 * Textbezug gilt als „Dopplung (+)“, siehe Absprache), daher bleibt die
 * typspezifische Filterung Sache des jeweiligen Aufrufers. Exportiert für
 * markierungSpeicher.dateiImport.ts (zusammenfuehrenMarkierungen dort).
 */
export function bereichUeberlappt(
  a: Pick<MarkierungsEintrag, 'ausgangsstelle' | 'bezug'>,
  b: Pick<MarkierungsEintrag, 'ausgangsstelle' | 'bezug'>,
): boolean {
  // Pauschale Markierungen besitzen keinen Zeichenbereich und überlappen nicht.
  if (a.bezug.typ === 'pauschal') return false;
  if (b.bezug.typ === 'pauschal') return false;
  return (
    ausgangsnormSchluessel(a) === ausgangsnormSchluessel(b) &&
    pfadGleich(a.bezug.textstelle.pfad, b.bezug.textstelle.pfad) &&
    a.bezug.textstelle.zeichenbereichStart < b.bezug.textstelle.zeichenbereichEnde &&
    a.bezug.textstelle.zeichenbereichEnde > b.bezug.textstelle.zeichenbereichStart
  );
}

/** Ergebnis von pruefeMarkierungAnStelle() – siehe dort. */
export interface MarkierungsPruefungsErgebnis {
  /** ALLE bestehenden Einträge JEDES Typs, die den geprüften Bereich
   *  überlappen. Genutzt von der Auswahlleiste (siehe
   *  auswahlleiste.tsx /
   *  useAuswahlleiste.ts), um zu bestimmen, ob das "Markierung
   *  entfernen"-Symbol angezeigt werden soll und welche Einträge es
   *  entfernt (bis zu zwei: eine Unterstreichung/Hervorhebung UND ein
   *  Verweis/Kommentar können denselben Bereich gleichzeitig belegen,
   *  siehe Konkurrenz-Regeln oben). */
  ueberlappende: MarkierungsEintrag[];
  /** true = eine der ueberlappenden Markierungen ist BESTÄNDIG ('verweismarkierung'
   *  oder 'kommentar' – NICHT 'unterstreichung'/'hervorhebung', siehe Konkurrenz-
   *  Regeln in markierungSpeicher.ts). hinzufuegenMarkierung() blockiert in
   *  diesem Fall JEDE neue Markierung an der Stelle – unabhängig von deren
   *  eigenem Typ (siehe dort: der Vorab-Filter dort prüft nur den Typ der
   *  BESTEHENDEN Einträge, nie den der neuen). Zweifach genutzt:
   *  (1) useVerweismarkierungUndKommentarHilfsfenster.ts: pruefeKonkurrenzUndZeigeBanner
   *  prüft dies VOR dem Öffnen der Verweismarkierung-/Kommentar-Hilfsfenster – ein
   *  Öffnen wäre sonst sinnlos, der Aufrufer zeigt stattdessen
   *  zeigeUeberlappungsBanner(). (2) useAuswahlleiste.ts/
   *  auswahlleiste.tsx: graut ALLE VIER
   *  Hinzufügen-Symbole (U/H/§/💬) aus – analog zu `ueberspannt`, bleiben
   *  aber klickbar, die jeweiligen Handler zeigen beim Klick selbst das
   *  Banner (siehe useMarkierungen.ts: markieren()). */
  blockiertNeueMarkierung: boolean;
}

/**
 * EINE Prüfung für beide Fragen, die sich rund um eine Textauswahl stellen
 * (vormals zwei getrennte Funktionen ueberlapptBestaendigeMarkierung/
 * findeUeberlappendeMarkierungen mit je einem eigenen Scan über `bisherige`
 * – blockiertNeueMarkierung ist dabei immer eine reine Teilmengen-Auswertung
 * von ueberlappende, ein zweiter Scan war nie nötig): welche
 * Bestands-Markierungen überlappen den Bereich (→ Button-Zustand, z.B.
 * "Entfernen"-Symbol in der Auswahlleiste), und würde das Anlegen EINER
 * NEUEN Markierung JEDEN TYPS an dieser Stelle blockiert (→ ausgegraute
 * Hinzufügen-Symbole UND Fehlermeldung/Banner beim tatsächlichen Drücken).
 * Der Vergleich MUSS zusätzlich zum Textpfad auch `bezeichnung` prüfen
 * (welche Norm/Überschrift) – pfadGleich allein vergleicht nur die Position
 * INNERHALB einer Norm (z.B. "Abs. 1"), die aber in verschiedenen Normen
 * desselben Gesetzes zufällig identisch sein kann.
 */
export function pruefeMarkierungAnStelle(
  bisherige: MarkierungsEintrag[],
  bereich: Pick<MarkierungsEintrag, 'ausgangsstelle' | 'bezug'>,
): MarkierungsPruefungsErgebnis {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: äquivalent –
  // bereichUeberlappt() hat denselben Guard und liefert für undefined ohnehin
  // false (s. Mutation-Testing-Analyse vom 2026-08-28).
  if (bereich.bezug.typ === 'pauschal') {
    return { ueberlappende: [], blockiertNeueMarkierung: false };
  }
  const ueberlappende = bisherige.filter((e) => bereichUeberlappt(e, bereich));
  const blockiertNeueMarkierung = ueberlappende.some(
    (e) => e.typ === 'verweismarkierung' || e.typ === 'kommentar',
  );
  return { ueberlappende, blockiertNeueMarkierung };
}

/**
 * Prüft, ob zwei Markierungen OHNE Textbezug (allgemeiner Verweis oder
 * Kommentar) inhaltlich identisch sind: gleiche Norm/Überschrift
 * (bezeichnung), gleicher Typ und gleicher Text. Pauschale Markierungen haben
 * keinen strukturellen Textpfad. Nur für den
 * textbezugslosen Fall relevant: bei Textbezug blockiert die bestehende
 * Überlappungsprüfung in hinzufuegenMarkierung() bereits JEDE
 * Positions-Überschneidung von 'verweismarkierung'/'kommentar' (siehe Konkurrenz-
 * Regeln oben) – zwei exakt identische Einträge an derselben Zeichenstelle
 * sind dadurch strukturell schon ausgeschlossen, ein Duplikats-Check wäre
 * dort nie erreichbar. Deshalb hier bewusst KEIN eigener Textstelle-Guard:
 * die Funktion wird ausschließlich aus dem textbezugslosen Zweig heraus
 * aufgerufen (siehe hinzufuegenMarkierung unten sowie
 * zusammenfuehrenMarkierungen in markierungSpeicher.dateiImport.ts).
 * Einheitlich für Verweis UND Kommentar statt zweier getrennter Prüfungen.
 */
export function istIdentischeAllgemeineMarkierung(
  a: MarkierungsEintrag,
  neu: MarkierungsEintrag,
): boolean {
  if (
    a.typ !== neu.typ ||
    ausgangsnormSchluessel(a) !== ausgangsnormSchluessel(neu) ||
    !pfadGleich(
      a.bezug.textstelle?.pfad ?? { typ: 'normtext' },
      neu.bezug.textstelle?.pfad ?? { typ: 'normtext' },
    )
  )
    return false;
  if (a.typ === 'verweismarkierung')
    return a.verweisinhalt?.verweistext === neu.verweisinhalt?.verweistext;
  return a.typ === 'kommentar' && a.kommentarText === neu.kommentarText;
}

/**
 * Zeigt das Warnungs-Banner „Es kann nicht mehrere Markierungen an der
 * gleichen Stelle geben." (5s) – zentrale Textzuordnung für die
 * Aufrufstellen (useMarkierungen.ts und
 * useVerweismarkierungUndKommentarHilfsfenster.ts). Überlappungsablehnungen der Hilfsfenster werden per
 * markierung-wegen-ueberlappung-abgelehnt an useMarkierungen.ts gemeldet. NUR für
 * ablehnungsgrund 'ueberlappung' gedacht – 'duplikat' wird von den
 * Hilfsfenstern bewusst NICHT über ein Banner, sondern inline im Formular
 * angezeigt (siehe dortige Fehleranzeige, Absprache), daher kein Parameter/
 * kein Eintrag für 'duplikat' hier.
 */
export async function zeigeUeberlappungsBanner(): Promise<void> {
  const { zeigeBanner } = await import('@/lib/banner/banner.index');
  zeigeBanner({
    art: 'bedienhinweis',
    text: 'Es kann nicht mehrere Markierungen an der gleichen Stelle geben.',
    typ: 'warnung',
  });
}

/**
 * Ergebnis von hinzufuegenMarkierung – siehe Konkurrenz-Regeln in
 * markierungSpeicher.ts.
 */
export interface HinzufuegenErgebnis {
  /** false = komplett blockiert (bestehender 'verweismarkierung'/'kommentar' im Weg
   *  ODER exaktes Duplikat eines textbezugslosen Verweises/Kommentars),
   *  nichts wurde geschrieben. */
  erfolgreich: boolean;
  /** Gesetzt, wenn der Aufrufer eine Ablehnung anzeigen soll – NUR
   *  beim kompletten Blockieren (erfolgreich: false). Wird eine
   *  Unterstreichung/Hervorhebung dagegen (teilweise) ersetzt/entfernt oder
   *  kombiniert: keine Ablehnung – das ist eine bewusste, klar sichtbare
   *  Ersetzung, kein stilles Scheitern (siehe Absprache).
   *  'ueberlappung' = ein bestehender 'verweismarkierung'/'kommentar' liegt an der
   *    Textstelle im Weg → Aufrufer zeigt zeigeUeberlappungsBanner().
   *  'duplikat' = ein inhaltlich identischer Verweis/Kommentar OHNE
   *    Textbezug existiert bereits (siehe istIdentischeAllgemeineMarkierung)
   *    → Aufrufer (VerweismarkierungFenster/KommentarFenster) zeigt das INLINE im
   *    Formular an, kein Banner (siehe Absprache). */
  /** Auch die strikte Ausgangsstellenprüfung des Anlegepfads verwendet diesen Vertrag. */
  ablehnungsgrund?: 'ueberlappung' | 'duplikat' | 'ausgangsstelle-nicht-eindeutig';
  /** Für den Undo-Stack des Aufrufers (siehe useMarkierungen.ts,
   *  VerweismarkierungFenster.tsx, KommentarFenster.tsx) – fehlt, wenn
   *  erfolgreich: false. 'ersetzen', wenn dabei bestehende Einträge entfernt
   *  ODER in eine größere Range zusammengeführt wurden, sonst 'hinzufuegen'. */
  aktion?: MarkierungHinzufuegenAktion | MarkierungErsetzenAktion;
}

/**
 * Fügt eine neue Markierung (Unterstreichung, Hervorhebung, Verweismarkierung oder
 * Kommentar) für das angegebene Gesetz hinzu und schreibt die Datei
 * vollständig neu (sortiert nach bezeichnung, dann Position). Löst dabei
 * Konkurrenzen mit bestehenden Markierungen am selben Textpfad auf (siehe
 * Konkurrenz-Regeln in markierungSpeicher.ts):
 *   - überlappt ein bestehender 'verweismarkierung'/'kommentar': komplett blockiert.
 *   - deckt eine bestehende 'unterstreichung'/'hervorhebung' DESSELBEN Typs die
 *     GESAMTE neue Auswahl bereits vollständig ab (und überlappt sonst
 *     nichts anderes): TOGGLE-AUS – die Markierung wird stattdessen aus
 *     genau diesem Bereich entfernt (siehe Absprache: erneutes Hervorheben/
 *     Unterstreichen einer bereits markierten Stelle hebt sie auf).
 *   - überlappt eine bestehende 'unterstreichung'/'hervorhebung' DESSELBEN Typs
 *     (aber deckt die Auswahl NICHT vollständig ab): wird in `eintrag`s
 *     Bereich eingeschmolzen (Kombinieren).
 *   - überlappt eine bestehende 'unterstreichung'/'hervorhebung' ANDEREN Typs: wird
 *     im überlappenden Teil entfernt (ggf. Rest links/rechts erhalten) –
 *     eine bewusste Ersetzung, kein Fehler (kein Banner, siehe Absprache).
 * Mehrere überlappende Alt-Einträge werden dabei gemeinsam behandelt (z.B.
 * zwei durch eine Lücke getrennte gleichartige Bereiche, die durch die neue,
 * längere Auswahl beide erfasst werden, verschmelzen zu einem Eintrag).
 *
 * Ausgangsstelle und Bezug werden innerhalb der gehaltenen Quellsperren frisch
 * aus dem gespeicherten Gesetz bestimmt. Dasselbe aktuelle Element dient dem
 * Kombinieren und Aufsplitten; angezeigte, möglicherweise veraltete Daten
 * werden nicht zum Speichern verwendet.
 */
export async function hinzufuegenMarkierung(
  gesetz: Gesetzesreferenz,
  eintrag: MarkierungsEintrag,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<HinzufuegenErgebnis> {
  return mitGepruefterAusgangsstelle(
    gesetz,
    eintrag,
    async (eintrag, aktuellesElement, token, vorgang, geaendert): Promise<HinzufuegenErgebnis> => {
      const jetzt = new Date();
      const { geaendert: _geaendert, ...inhalt } = eintrag;
      eintrag = { ...inhalt, erstellt: isoZeitstempel(jetzt) };
      await sicherstelleOrdner();
      const bisherige = await ladeEintraegeUnterSperre(
        gesetz,
        token,
        vorgang,
        geaendert,
        meldungEmpfangen,
      );

      // Allgemeine Markierung ohne Textbezug (kein Zeichen-Bereich) kann nichts
      // überlappen – wohl aber inhaltlich identisch zu einer bestehenden sein
      // (siehe istIdentischeAllgemeineMarkierung).
      if (eintrag.bezug.typ === 'pauschal') {
        if (bisherige.some((e) => istIdentischeAllgemeineMarkierung(e, eintrag))) {
          return { erfolgreich: false, ablehnungsgrund: 'duplikat' };
        }
        await schreibeEintraege(gesetz, [...bisherige, eintrag], token, vorgang);
        geaendert(identitaetsSchluessel(eintrag));
        return {
          erfolgreich: true,
          aktion: { art: 'hinzufuegen', gesetz, eintrag },
        };
      }

      const ueberlappend = bisherige.filter(
        (e) =>
          bereichUeberlappt(e, eintrag) ||
          ((eintrag.typ === 'unterstreichung' || eintrag.typ === 'hervorhebung') &&
            e.typ === eintrag.typ &&
            e.bezug.typ === 'bezugstext' &&
            ausgangsnormSchluessel(e) === ausgangsnormSchluessel(eintrag) &&
            pfadGleich(e.bezug.textstelle.pfad, eintrag.bezug.textstelle.pfad) &&
            (e.bezug.textstelle.zeichenbereichEnde ===
              eintrag.bezug.textstelle.zeichenbereichStart ||
              e.bezug.textstelle.zeichenbereichStart ===
                eintrag.bezug.textstelle.zeichenbereichEnde)),
      );

      if (ueberlappend.length === 0) {
        await schreibeEintraege(gesetz, [...bisherige, eintrag], token, vorgang);
        geaendert(identitaetsSchluessel(eintrag));
        return {
          erfolgreich: true,
          aktion: { art: 'hinzufuegen', gesetz, eintrag },
        };
      }

      if (ueberlappend.some((e) => e.typ === 'verweismarkierung' || e.typ === 'kommentar')) {
        return { erfolgreich: false, ablehnungsgrund: 'ueberlappung' };
      }

      // Nur 'unterstreichung'/'hervorhebung' überlappen.
      const gleicherTyp = ueberlappend.filter((e) => e.typ === eintrag.typ);
      const andererTyp = ueberlappend.filter((e) => e.typ !== eintrag.typ);

      // Toggle-Aus: die neue Auswahl liegt AUSSCHLIESSLICH (keine andersartige
      // Überlappung) innerhalb bereits gleichartig markierter Bereiche, die sie
      // lückenlos abdecken → entfernen statt erweitern.
      if (
        andererTyp.length === 0 &&
        deckenVollstaendigAb(
          gleicherTyp,
          eintrag.bezug.textstelle.zeichenbereichStart,
          eintrag.bezug.textstelle.zeichenbereichEnde,
        )
      ) {
        const { entfernt, rest } = splitAlteEintraegeImBereich(
          gleicherTyp,
          eintrag.bezug.textstelle.zeichenbereichStart,
          eintrag.bezug.textstelle.zeichenbereichEnde,
          aktuellesElement,
          true,
          jetzt,
        );
        const unveraendert = bisherige.filter((e) => !entfernt.includes(e));
        await schreibeEintraege(gesetz, [...unveraendert, ...rest], token, vorgang);
        geaendert();
        return {
          erfolgreich: true,
          aktion: { art: 'ersetzen', gesetz, rest, entfernt },
        };
      }

      // Gleichartige Bereiche werden zu EINEM Eintrag zusammengeführt,
      // andersartige (teilweise) entfernt.
      let neuerStart = eintrag.bezug.textstelle.zeichenbereichStart;
      let neuerEnde = eintrag.bezug.textstelle.zeichenbereichEnde;
      for (const alt of gleicherTyp) {
        neuerStart = Math.min(neuerStart, alt.bezug.textstelle!.zeichenbereichStart);
        neuerEnde = Math.max(neuerEnde, alt.bezug.textstelle!.zeichenbereichEnde);
      }
      // bezugstext für den KOMBINIERTEN Bereich frisch aus dem aktuellen Text
      // ableiten (siehe Docstring oben) statt eintrag.bezugstext (nur der Text
      // der NEUEN, ggf. kürzeren Auswahl) unverändert zu übernehmen – sonst
      // deckt bezugstext den gespeicherten Zeichen-Bereich nicht mehr ab.
      const neueTextstelle: Textstelle = {
        ...eintrag.bezug.textstelle,
        zeichenbereichStart: neuerStart,
        zeichenbereichEnde: neuerEnde,
      };
      const neuerBezugstext = aktuellesElement
        ? aktuellerTextAnPfad(aktuellesElement, neueTextstelle)
        : undefined;
      const neuerEintrag: MarkierungsEintrag = {
        ...eintrag,
        erstellt: isoZeitstempel(jetzt),
        bezug: {
          typ: 'bezugstext',
          textstelle: neueTextstelle,
          bezugstext: neuerBezugstext ?? eintrag.bezug.bezugstext,
        },
      };

      const { entfernt, rest } = splitAlteEintraegeImBereich(
        andererTyp,
        eintrag.bezug.textstelle.zeichenbereichStart,
        eintrag.bezug.textstelle.zeichenbereichEnde,
        aktuellesElement,
        false,
        jetzt,
      );
      const alleEntfernt = [...gleicherTyp, ...entfernt];
      const unveraendert = bisherige.filter((e) => !alleEntfernt.includes(e));
      await schreibeEintraege(gesetz, [...unveraendert, ...rest, neuerEintrag], token, vorgang);
      geaendert();

      return {
        erfolgreich: true,
        aktion: {
          art: 'ersetzen',
          gesetz,
          neu: neuerEintrag,
          rest,
          entfernt: alleEntfernt,
        },
      };
    },
    meldungEmpfangen,
  );
}

/** Prüft, ob die überlappenden Einträge den Bereich lückenlos abdecken. */
export function deckenVollstaendigAb(
  eintraege: MarkierungsEintrag[],
  start: number,
  ende: number,
): boolean {
  if (eintraege.length === 0) return false;
  const sortiert = [...eintraege].sort(
    (a, b) => a.bezug.textstelle!.zeichenbereichStart - b.bezug.textstelle!.zeichenbereichStart,
  );
  let abgedecktBis = start;
  for (const e of sortiert) {
    if (e.bezug.textstelle!.zeichenbereichStart > abgedecktBis) return false; // Lücke
    abgedecktBis = Math.max(abgedecktBis, e.bezug.textstelle!.zeichenbereichEnde);
    if (abgedecktBis >= ende) return true;
  }
  // Unerreichbar mit true: abgedecktBis wächst monoton und wird nach JEDEM
  // Update sofort oben geprüft – verlässt die Schleife regulär, war die
  // Bedingung dort zuletzt bereits false (s. Mutation-Testing-Analyse vom
  // 2026-08-28, Mutanten 236/237 waren dadurch äquivalent).
  return false;
}

/**
 * Beim Toggle-Aus werden zusätzlich normale und geschützte Leerzeichen
 * an den Schnittkanten entfernt; Zeilenumbrüche bleiben erhalten.
 * Entfernt aus jedem `alt`-Eintrag den mit [start, ende) überlappenden Teil
 * – ggf. bleiben links/rechts der Auswahl Rest-Stücke übrig (Aufsplitten).
 * bezugstext der Rest-Stücke wird bei gegebenem `aktuellesElement` frisch
 * aus dem aktuellen Text abgeleitet (aktuellerTextAnPfad) statt – wie zuvor
 * immer – aus dem bezugstext DES ALTEN Eintrags herausgeschnitten: war
 * dieser bereits veraltet (Bezugstextkonflikt), wäre sonst auch das Rest-Stück
 * weiterhin falsch (siehe Docstring von hinzufuegenMarkierung). Ohne
 * `aktuellesElement` bleibt das Schneiden aus dem Alt-bezugstext als
 * Fallback erhalten (gleiches Koordinatensystem: bezugstext beginnt bei
 * alt.textstelle.zeichenbereichStart). Gibt sowohl die vollständigen ORIGINAL-Alt-Einträge
 * (für Undo, siehe MarkierungErsetzenAktion.entfernt) als auch die neu
 * geschriebenen Rest-Stücke zurück.
 */
export function splitAlteEintraegeImBereich(
  alt: MarkierungsEintrag[],
  start: number,
  ende: number,
  aktuellesElement?: NormDarstellung | UeberschriftDarstellung,
  entferneAngrenzendeRaeume = false,
  jetzt = new Date(),
): { entfernt: MarkierungsEintrag[]; rest: MarkierungsEintrag[] } {
  const rest: MarkierungsEintrag[] = [];
  for (const eintrag of alt) {
    if (eintrag.bezug.typ !== 'bezugstext') continue;
    if (eintrag.bezug.textstelle.zeichenbereichStart < start) {
      const bezugstext = aktuellesElement
        ? aktuellerTextAnPfad(aktuellesElement, {
            ...eintrag.bezug.textstelle,
            zeichenbereichEnde: start,
          })
        : undefined;
      rest.push({
        ...eintrag,
        erstellt: isoZeitstempel(jetzt),
        bezug: {
          typ: 'bezugstext',
          textstelle: { ...eintrag.bezug.textstelle, zeichenbereichEnde: start },
          bezugstext:
            bezugstext ??
            eintrag.bezug.bezugstext.slice(0, start - eintrag.bezug.textstelle.zeichenbereichStart),
        },
      });
    }
    if (eintrag.bezug.textstelle.zeichenbereichEnde > ende) {
      const bezugstext = aktuellesElement
        ? aktuellerTextAnPfad(aktuellesElement, {
            ...eintrag.bezug.textstelle,
            zeichenbereichStart: ende,
          })
        : undefined;
      rest.push({
        ...eintrag,
        erstellt: isoZeitstempel(jetzt),
        bezug: {
          typ: 'bezugstext',
          textstelle: { ...eintrag.bezug.textstelle, zeichenbereichStart: ende },
          bezugstext:
            bezugstext ??
            eintrag.bezug.bezugstext.slice(ende - eintrag.bezug.textstelle.zeichenbereichStart),
        },
      });
    }
  }
  if (entferneAngrenzendeRaeume) bereinigeSchnittkanten(rest, start, ende);
  return {
    entfernt: alt,
    rest: rest.filter(
      (e) => e.bezug.textstelle!.zeichenbereichStart < e.bezug.textstelle!.zeichenbereichEnde,
    ),
  };
}

/** Bereinigt nur die neu entstandenen Schnittkanten, innerhalb der Alt-Markierung. */
function bereinigeSchnittkanten(rest: MarkierungsEintrag[], start: number, ende: number): void {
  for (const eintrag of rest) {
    if (eintrag.bezug.bezugstext === undefined) continue;
    if (eintrag.bezug.textstelle.zeichenbereichEnde === start) {
      const text = eintrag.bezug.bezugstext.replace(/[ \u00a0]+$/, '');
      eintrag.bezug.textstelle = {
        ...eintrag.bezug.textstelle,
        zeichenbereichEnde:
          eintrag.bezug.textstelle.zeichenbereichEnde -
          (eintrag.bezug.bezugstext.length - text.length),
      };
      eintrag.bezug.bezugstext = text;
    }
    if (eintrag.bezug.textstelle.zeichenbereichStart === ende) {
      const text = eintrag.bezug.bezugstext.replace(/^[ \u00a0]+/, '');
      eintrag.bezug.textstelle = {
        ...eintrag.bezug.textstelle,
        zeichenbereichStart:
          eintrag.bezug.textstelle.zeichenbereichStart +
          (eintrag.bezug.bezugstext.length - text.length),
      };
      eintrag.bezug.bezugstext = text;
    }
  }
}
