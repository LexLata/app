// MarkierungskonfliktFenster.helpers.ts
//
// Reine Typen/Funktionen ohne JSX, ausgelagert aus MarkierungskonfliktFenster.tsx
// (500-Zeilen-Richtwert) – von der Hauptdatei, der Listen-Darstellung
// (KonfliktListe.tsx) UND der Konfliktseitenleiste
// (Konfliktseitenleiste.tsx) gemeinsam genutzt.

import type {
  AnzeigeGesetzKonflikte,
  AnzeigeKonfliktEintrag,
  MarkierungsAuswahl,
} from '@/lib/markierungen/markierungen.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel, istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { ImportBerichtEintrag } from '@/lib/markierungen/markierungen.index';
import { konfliktTexte } from './konfliktTexte';
import { FEHLERTEXT_KEINE_VERBINDUNG } from '@/lib/import/import.index';

// Eine einzelne darstellbare Konfliktzeile UNTER einem Markierungseintrag –
// bei Verweismarkierungen mit mehreren gleichzeitigen Konflikten (eigener Bezugskonflikt + je
// Zielgesetz Zielkonflikte) entsteht pro Konflikt-Tag eine eigene Zeile (siehe
// Absprache), daher die Auffächerung hier statt direkt in AnzeigeKonfliktEintrag.
type Zeilenart =
  | 'bezugstextFehltOderUnpassend'
  | 'pauschalerBezugFehlt'
  | 'pauschalerBezugUnpassend'
  | 'ausgangsstelleNichtEindeutig'
  | 'zielGesetzFehlt'
  | 'zielNormUnpassend'
  | 'zielNormNichtEindeutig'
  | 'zielNormFehlt';

const SYMBOL_VON_ZEILENART: Record<Zeilenart, KonfliktZeile['symbol']> = {
  bezugstextFehltOderUnpassend: 'fragezeichen',
  pauschalerBezugFehlt: 'kreuz',
  pauschalerBezugUnpassend: 'fragezeichen',
  ausgangsstelleNichtEindeutig: 'fragezeichen',
  zielGesetzFehlt: 'kreuz',
  zielNormUnpassend: 'pfeil',
  zielNormNichtEindeutig: 'pfeil',
  zielNormFehlt: 'kreuz',
};

export interface KonfliktZeile {
  schluessel: string;
  zeilenart: Zeilenart;
  verweisziele: ZielBezeichnungAnzeige[];
  symbol: 'kreuz' | 'fragezeichen' | 'pfeil';
  zielgesetz?: Gesetzesreferenz;
  vorschau: string;
  vorschauPunkt: string;
  erlaeuterung: string;
}

/** Zählt die darstellbaren Konfliktzeilen unabhängig vom Aufklappen der Gesetzesgruppen. */
export function anzahlMarkierungskonflikte(gesetze: AnzeigeGesetzKonflikte[]): number {
  return gesetze.reduce(
    (anzahl, gesetz) =>
      anzahl +
      (gesetz.fehlendesGesetz
        ? 1
        : Number(!!gesetz.nichtamtlicheTitelXmlFehlt) +
          gesetz.eintraege.reduce((summe, eintrag) => summe + zeilenVonEintrag(eintrag).length, 0)),
    0,
  );
}

/** Volle Bezeichnung eines betroffenen Verweisziels. */
interface ZielBezeichnungAnzeige {
  bezeichnung: string;
}

const ZIEL_REIHENFOLGE: Partial<Record<Zeilenart, number>> = {
  zielGesetzFehlt: 0,
  zielNormUnpassend: 1,
  zielNormNichtEindeutig: 2,
  zielNormFehlt: 3,
};

/** Gemeinsame Ordnung für Darstellung und Nachfolgeauswahl. */
export function vergleicheZeilen(a: KonfliktZeile, b: KonfliktZeile): number {
  if (!!a.zielgesetz !== !!b.zielgesetz) return a.zielgesetz ? 1 : -1;
  if (a.zielgesetz && b.zielgesetz) {
    const gesetz =
      a.zielgesetz.kurztitel.localeCompare(b.zielgesetz.kurztitel, 'de') ||
      a.zielgesetz.normgeber.localeCompare(b.zielgesetz.normgeber, 'de');
    if (gesetz) return gesetz;
    const art = (ZIEL_REIHENFOLGE[a.zeilenart] ?? 0) - (ZIEL_REIHENFOLGE[b.zeilenart] ?? 0);
    if (art) return art;
  }
  return a.schluessel.localeCompare(b.schluessel, 'de');
}

function zielZeilenarten(ziel: AnzeigeKonfliktEintrag['zielKonflikte'][number]): Zeilenart[] {
  return ziel.typ === 'zielNormFehlt' && ziel.bezeichnungenAnzeige.length
    ? [
        ...(ziel.bezeichnungenAnzeige.some((z) => z.befund === 'nichtEindeutig')
          ? ['zielNormNichtEindeutig' as const]
          : []),
        ...(ziel.bezeichnungenAnzeige.some((z) => z.befund !== 'nichtEindeutig')
          ? ['zielNormFehlt' as const]
          : []),
      ]
    : [ziel.typ];
}

export function zeilenVonEintrag(eintrag: AnzeigeKonfliktEintrag): KonfliktZeile[] {
  // Eigene Zeilen behalten ihren Schlüssel beim Typwechsel. Zielzeilen tragen
  // die Zeilenart im Schlüssel; entfällt eine, bestimmt die Ordnung die Nachfolge.
  const basis = eintrag.schluessel;
  const zeilen: KonfliktZeile[] = [];
  if (eintrag.eigenerKonflikt) {
    const zeilenart =
      eintrag.eigenerKonflikt !== 'pauschalerBezugUnpassend' &&
      (eintrag.ausgangsTrefferzahl ?? 0) > 1
        ? 'ausgangsstelleNichtEindeutig'
        : eintrag.eigenerKonflikt;
    zeilen.push({
      schluessel: `${basis}:eigen`,
      zeilenart,
      verweisziele: [],
      symbol: SYMBOL_VON_ZEILENART[zeilenart],
      ...konfliktTexte(eintrag, zeilenart, []),
    });
  }
  for (const ziel of eintrag.zielKonflikte) {
    const arten = zielZeilenarten(ziel);
    for (const zeilenart of arten) {
      const verweisziele = ziel.bezeichnungenAnzeige
        .filter((z) =>
          zeilenart === 'zielNormNichtEindeutig'
            ? z.befund === 'nichtEindeutig'
            : zeilenart === 'zielNormFehlt'
              ? z.befund !== 'nichtEindeutig'
              : true,
        )
        .map(({ bezeichnung }) => ({ bezeichnung }));
      zeilen.push({
        schluessel: `${basis}:ziel:${gesetzesreferenzSchluessel(ziel.gesetz)}:${zeilenart}`,
        zeilenart,
        zielgesetz: ziel.gesetz,
        verweisziele,
        symbol: SYMBOL_VON_ZEILENART[zeilenart],
        ...konfliktTexte(eintrag, zeilenart, verweisziele, ziel.gesetz),
      });
    }
  }
  return zeilen.sort(vergleicheZeilen);
}

// Auswahlzustand für die Konfliktseitenleiste rechts (siehe Absprache: die zuletzt
// angeklickte Markierung/der zuletzt angeklickte Markierungsdatensatz ist
// ausgewählt und blau hervorgehoben).
export type Auswahl =
  | { art: 'datensatz'; gesetz: Gesetzesreferenz }
  | {
      art: 'zeile';
      gesetz: Gesetzesreferenz;
      eintrag: AnzeigeKonfliktEintrag;
      zeile: KonfliktZeile;
    }
  // nichtamtlicheTitelXmlFehlt (siehe markierungskonfliktPruefung.ts) – bezieht sich auf
  // das GANZE Gesetz, nicht auf eine einzelne Markierung, daher weder
  // 'eintrag' noch 'zeile'. Anders als 'datensatz' (gesetzFehlt, eigene
  // Überschrift statt aufklappbarer Liste) wird diese Zeile INNERHALB der
  // aufgeklappten Liste dargestellt wie ein normaler Konflikt (siehe
  // Absprache) – daher eine eigene Art statt Wiederverwendung von 'datensatz'.
  | { art: 'nichtamtlicheTitelXmlFehlt'; gesetz: Gesetzesreferenz };

// Wandelt die UI-seitige Auswahl in die vom Modul erwartete
// MarkierungsAuswahl um (für loescheAusgewaehlt). Bewusst NICHT identisch
// mit Auswahl: 'zeile' trägt hier den vollen AnzeigeKonfliktEintrag/
// KonfliktZeile für die Darstellung, das Modul braucht davon nur
// kurztitel+schluessel und nennt diesen Fall 'markierung' (siehe
// MarkierungsAuswahl in konfliktaktionen.ts).
export function zuMarkierungsAuswahl(a: Auswahl): MarkierungsAuswahl {
  switch (a.art) {
    case 'datensatz':
      return { art: 'datensatz', gesetz: a.gesetz };
    case 'nichtamtlicheTitelXmlFehlt':
      return { art: 'nichtamtlicheTitelXmlFehlt', gesetz: a.gesetz };
    case 'zeile':
      return {
        art: 'markierung',
        gesetz: a.gesetz,
        schluessel: a.eintrag.schluessel,
      };
  }
}

export function auswahlSchluessel(a: Auswahl): string {
  if (a.art === 'datensatz') return `datensatz:${gesetzesreferenzSchluessel(a.gesetz)}`;
  if (a.art === 'nichtamtlicheTitelXmlFehlt')
    return `nichtamtlicheTitelXmlFehlt:${gesetzesreferenzSchluessel(a.gesetz)}`;
  return `zeile:${gesetzesreferenzSchluessel(a.gesetz)}:${a.zeile.schluessel}`;
}

// Erneuert die Auswahl; verschwundene Zeilen werden nur innerhalb derselben Markierung ersetzt.
export function aktualisiereAuswahl(a: Auswahl, gesetze: AnzeigeGesetzKonflikte[]): Auswahl | null {
  const gesetz = gesetze.find((g) => istGleichesGesetz(g.gesetz, a.gesetz));
  if (!gesetz) return null;
  if (a.art === 'datensatz') return gesetz.fehlendesGesetz ? a : null;
  if (a.art === 'nichtamtlicheTitelXmlFehlt') return gesetz.nichtamtlicheTitelXmlFehlt ? a : null;
  const eintrag = gesetz.eintraege.find((e) => e.schluessel === a.eintrag.schluessel);
  if (!eintrag) return null;
  const zeilen = zeilenVonEintrag(eintrag);
  const treffer =
    zeilen.find((z) => z.schluessel === a.zeile.schluessel) ??
    zeilen.find((z) => vergleicheZeilen(z, a.zeile) > 0) ??
    zeilen.at(-1);
  return treffer ? { art: 'zeile', gesetz: a.gesetz, eintrag, zeile: treffer } : null;
}
// ---------------------------------------------------------------------------
// Gruppierte Darstellung des Internet-Import-Berichts (Sammel-Import über
// "Fehlende Rechtstexte aus dem Internet importieren", siehe
// importFehlenderNormen() in konfliktaktionen.ts)
// ---------------------------------------------------------------------------

/** "A" | "A und B" | "A, B und C" – analog zum bauKlausel()-Muster in
 *  dateiImport.ts, hier aber unabhängig davon neu implementiert (siehe
 *  Absprache: eigene, kleinere Dimension – Ergebnisart statt Datei-Kategorie
 *  – eine gemeinsame Nutzung hätte beide Callsites unnötig verrenkt). */
function undListe(namen: string[]): string {
  if (namen.length === 0) return '';
  // namen[0] beweisbar sicher durch die length === 1-Prüfung direkt davor.
  if (namen.length === 1) return namen[0]!;
  return `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`;
}

/**
 * Fasst einen Import-Bericht zu wenigen zusammenfassenden Zeilen zusammen,
 * statt jedes Gesetz einzeln aufzulisten (siehe Absprache):
 * - Erfolgreiche Importe: eine Zeile ("✓ HGB (und GG) importiert").
 * - 'nichtImIndex': eine Zeile ("HGB und GG wurden nicht im Importindex
 *   gefunden.").
 * - 'keineVerbindung': eine Zeile je unterschiedlicher Meldung, damit die
 *   betroffenen Quellen sichtbar bleiben, ohne Wiederholung pro Gesetz.
 * - 'sonstiger': bewusst NICHT gruppiert, jede Zeile einzeln mit ihrem
 *   konkreten Text, da diese Fehler inhaltlich unterschiedlich und für sich
 *   aussagekräftig sind (z.B. ZIP-Entpacken fehlgeschlagen, XML nicht
 *   lesbar).
 */
export function formatiereInternetImportBericht(eintraege: ImportBerichtEintrag[]): string[] {
  const zeilen: string[] = [];

  const erfolgreiche = eintraege.filter((e) => e.erfolg).map((e) => e.gesetz.kurztitel);
  if (erfolgreiche.length > 0) {
    zeilen.push(`✓ ${undListe(erfolgreiche)} importiert.`);
  }

  const nichtImIndex = eintraege
    .filter((e) => e.kategorie === 'nichtImIndex')
    .map((e) => e.gesetz.kurztitel);
  if (nichtImIndex.length > 0) {
    const verb = nichtImIndex.length === 1 ? 'wurde' : 'wurden';
    zeilen.push(`${undListe(nichtImIndex)} ${verb} nicht im Importindex gefunden.`);
  }

  const verbindungsMeldungen = new Set(
    eintraege
      .filter((e) => e.kategorie === 'keineVerbindung')
      .map((e) => e.fehler || FEHLERTEXT_KEINE_VERBINDUNG),
  );
  zeilen.push(...verbindungsMeldungen);

  for (const e of eintraege) {
    if (e.kategorie === 'sonstiger' && e.fehler) {
      zeilen.push(`✗ ${e.gesetz.kurztitel}: ${e.fehler}`);
    }
  }

  return zeilen;
}
