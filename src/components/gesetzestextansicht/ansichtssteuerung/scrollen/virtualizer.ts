// virtualizer.ts
// Konstanten und Höhenschätzfunktionen für den Virtualizer.
// Keine React-Abhängigkeiten – reine Rechenlogik.
import { messeAufruf } from '@/lib/utils/perfMessung';

import type {
  DarstellungsElement,
  NormDarstellung,
  SatzDarstellung,
  ListenEintragDarstellung,
  UnterabsatzDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';
import {
  ermittleUeberschriftTopPad,
  ermittleUeberschriftPaddingBottom,
  NORM_BEZEICHNUNG_ABSTAND,
  ueberschriftTrenner,
} from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
import type { ScrollSteuerungOptionen } from './ScrollSteuerung.types';
import type {
  Schriftstil,
  TextMessung,
  Trennsprache,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import {
  gliedereFortlaufendeSaetze,
  normKurzzeilenTitel,
} from '@/lib/domain/gesetzDarstellungAuswertung';
import {
  SCHRIFTGROESSE_DEFAULT,
  GESETZESTEXT_ABSATZABSTAND,
} from '@/lib/stil/gesetzTextDarstellung';

import { SCROLL_MARGIN } from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
export { SCROLL_MARGIN } from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';
export interface HoehenKontext {
  messung: TextMessung;
  inhaltEinzug: number;
  satzNeuZeile: boolean;
  textAlign: 'left' | 'justify';
  hyphens: 'auto' | 'none';
  lang: string | undefined;
  eingeklappteUeberschriften: ReadonlySet<string>;
  eingeklappteNormen: ReadonlySet<string>;
  // IDs von Überschriften, die hierarchisch unter einem überschriftsartigen
  // Gliederungsartikel liegen (z.B. Unterabschnitte in Art. 229 EGBGB) –
  // identisch zu unterArtikelIds in Gesetzestextansicht.tsx.
  unterArtikelIds: ReadonlySet<string>;
  /** Einstellung "Zeilenabstand" (useTextDarstellung.ts), 1.0–2.0 in
   *  0,2-Schritten, Default 1.2. Ersetzt den früher festen Faktor in
   *  schaetzeHoehe (siehe dort) – muss mit dem tatsächlich gerenderten
   *  lineHeight (CSS-Var --zeilen-abstand in absatzBausteine.tsx/
   *  satzEintragBausteine.tsx) übereinstimmen. */
  zeilenabstand: number;
  /** Für die Höhenschätzung freigegebene Textspaltenbreite: nach Resize
   *  erst nach 150 ms Ruhe unter gehaltenem Scrollanker aktualisiert.
   *  Der CSS-Textfluss verwendet während der Geste bereits die neue Breite. */
  textSpalteBreite: number;
}
// Fließtext-Zeilenzahl wird über zeilenFuerText (echte, gecachte
// measureText-basierte wortweise Zeilenumbruch-Näherung, siehe
// textMessung.ts) ermittelt statt über eine Zeichen-pro-Zeile-
// Heuristik. Sprachabhängige Trennstellen, Blocksatz, geschützte Leerzeichen
// und Browser-Fontmetriken werden nicht exakt simuliert. Reale Messwerte
// ersetzen die Schätzung; Trennung/Sprache/Ausrichtung sichern deren Gültigkeit.
// Die dafür verwendete Breite wird unten pro
// Verschachtelungsebene aus der tatsächlich verfügbaren Breite hergeleitet
// (siehe zeilenFuerEintraege/zeilenFuerUnterabsaetze) – spaltenBreite() misst
// dabei nur die kurzen, stark wiederholten Label-Texte (Nummern/Buchstaben).

// Untergrenze für die "verfügbare Breite" nach Abzug von Label-/Einzugsspalten
// – verhindert absurd hohe Zeilenschätzungen bei sehr tiefer Verschachtelung
// mit langen Bezeichnungen (die reale Flexbox würde ohnehin umbrechen/
// überlaufen, aber eine Schätzung von z.B. 3px Breite wäre nutzlos).
const MIN_VERFUEGBARE_BREITE = 40;

// Spiegelt die Breitenreduktion durch SatzZeile in
// satzEintragBausteine.tsx: eine Nummern-Spalte links vom
// Satztext, wenn mehr als ein Satz vorliegt.
/** Schätzt die Höhe eines Elements für den Virtualizer, in ganzen Pixeln wie die Messung
 * (offsetHeight bzw. gerundete ResizeObserver-Größe): Nur eine gleiche Zahl erspart der
 * Bibliothek Neuberechnung und Scrollkorrektur. */
export function schaetzeHoehe(
  el: DarstellungsElement,
  schrift: number,
  kontext: HoehenKontext,
): number {
  return messeAufruf('Höhenschätzung', () =>
    Math.round(schaetzeElementHoehe(el, schrift, kontext)),
  );
}

/** Abstand von der Oberkante eines Elements bis zur Unterkante seines vollständigen Titels:
 * Normen mit 16 px Innenabstand (mit Trenner 7 + 8 + 1 px, ebenso 16), Überschriften mit ihrem
 * ebenenabhängigen topPad; die Titelzeilen wie in schaetzeElementHoehe. */
export function schaetzeTitelUnten(
  el: DarstellungsElement,
  schrift: number,
  kontext: HoehenKontext,
): number {
  if (el.typ === 'norm')
    return 16 + normTitelHoehe(el.data, normKurzzeilenTitel(el.data), schrift, kontext);
  const kopf = ueberschriftKopf(el.data, schrift, kontext);
  return kopf.topPad + kopf.titelHoehe;
}

function titelBreiteFuer(kontext: HoehenKontext): number {
  return Math.max(MIN_VERFUEGBARE_BREITE, kontext.textSpalteBreite - kontext.inhaltEinzug);
}

// Spiegelt die Titelzeile in normBlock.tsx: lineHeight 1.3 unabhängig vom Fließtext; die
// Bezeichnung bricht nie um (nowrap, 6 px Abstand) und hängt ohne Umbruchgelegenheit am Titel.
// Normale Titel sind fett, in der Kurzzeile (weggefallen bzw. ohne veröffentlichten Text) kursiv.
function normTitelHoehe(
  norm: NormDarstellung,
  kurzzeilenTitel: string | undefined,
  schrift: number,
  kontext: HoehenKontext,
): number {
  const zeilenHoehe = schrift * 1.3;
  const titel =
    kurzzeilenTitel ?? (norm.titelIstNichtamtlich && norm.titel ? `[${norm.titel}]` : norm.titel);
  if (!titel) return zeilenHoehe;
  const zeilen = kontext.messung.zeilenFuerText(titel, titelBreiteFuer(kontext), schrift, {
    stil: kurzzeilenTitel !== undefined ? 'italic' : 'bold',
    vorlaufBreite:
      kontext.messung.textBreite(norm.bezeichnung, schrift, 'bold') + NORM_BEZEICHNUNG_ABSTAND,
  });
  return Math.max(1, zeilen) * zeilenHoehe;
}

// Spiegelt UeberschriftZeile in ueberschriftZeile.tsx: topPad hängt von ebene und
// istUntergeordnet ab, die Schriftgröße von istUntergeordnet. Trenner (zeigeTrenner) bleibt
// unberücksichtigt – er verteilt topPad nur auf Linie+Rest um, ändert die Gesamthöhe aber nicht.
// Umbruch wie gerendert: fett, Bezeichnung, Trenner und Titel als ein Text ohne Silbentrennung.
// schriftFaktor skaliert TOP_PAD/PADDING_BOTTOM proportional zur Schriftgröße, siehe
// ermittleUeberschriftTopPad() in Gesetzestextansicht.layout.ts.
function ueberschriftKopf(u: UeberschriftDarstellung, schrift: number, kontext: HoehenKontext) {
  const istUntergeordnet = kontext.unterArtikelIds.has(u.id);
  const schriftFaktor = schrift / SCHRIFTGROESSE_DEFAULT;
  const topPad = ermittleUeberschriftTopPad({ ebene: u.ebene, istUntergeordnet, schriftFaktor });
  const fontGroesse = istUntergeordnet ? schrift : schrift * 1.1;
  const text = u.titel
    ? `${u.bezeichnung}${ueberschriftTrenner(u.bezeichnung)}${u.titel}`
    : u.bezeichnung;
  const zeilen = Math.max(
    1,
    kontext.messung.zeilenFuerText(text, titelBreiteFuer(kontext), fontGroesse, { stil: 'bold' }),
  );
  return { topPad, titelHoehe: zeilen * fontGroesse * 1.35, schriftFaktor };
}

/** Regelsatz zum Sprachcode samt Varianten wie „de-DE“; ohne Angabe gilt die Sprache der App
 * (Deutsch). */
function trennsprache(lang: string | undefined): Trennsprache | undefined {
  const sprache = (lang ?? 'de').split('-')[0]?.toLowerCase();
  return sprache === 'de' || sprache === 'fr' || sprache === 'es' ? sprache : undefined;
}

function schaetzeElementHoehe(
  el: DarstellungsElement,
  schrift: number,
  kontext: HoehenKontext,
): number {
  const { spaltenBreite } = kontext.messung;
  // Normtext erbt hyphens aus gesetzTextInhaltStil; Titel und Überschriften trennen nie. Die
  // Näherung kennt Regelsätze für Deutsch, Französisch und Spanisch; andere Sprachen werden ohne
  // Trennung geschätzt.
  const silbentrennung = kontext.hyphens === 'auto' ? trennsprache(kontext.lang) : undefined;
  const zeilenFuerText = (
    text: string | undefined,
    breite: number,
    schrift: number,
    stil?: Schriftstil,
  ) =>
    kontext.messung.zeilenFuerText(text, breite, schrift, {
      ...(stil && { stil }),
      ...(silbentrennung && { silbentrennung }),
      // Normtext steht in gesetzTextInhaltStil (pre-wrap); "\n" stammt nur aus <zeilenumbruch/>,
      // Quell-Leerraum fasst der Parser zusammen.
      harteUmbrueche: true,
    });
  function satzListenNrBreite(anzahlSaetze: number, schrift: number): number {
    return anzahlSaetze > 1 ? spaltenBreite(String(anzahlSaetze), schrift * 0.6) : 0;
  }

  // Rekursiv, da ListenEintragDarstellung verschachtelte untereintraege und
  // optional eigene saetze haben kann (siehe types.ts). breite ist die für
  // DIESE Ebene verfügbare Breite (bereits um alle Vorfahren-Label-/
  // Einzugsspalten reduziert) – spiegelt EintragZeile in
  // satzEintragBausteine.tsx.
  function zeilenFuerEintrag(
    eintrag: ListenEintragDarstellung,
    einzug: number,
    nrBreite: number,
    breite: number,
    schrift: number,
  ): number {
    const verfuegbar = Math.max(MIN_VERFUEGBARE_BREITE, breite - einzug - nrBreite);
    let zeilen = 0;
    if (eintrag.saetze && eintrag.saetze.length > 0) {
      zeilen += zeilenFuerSaetze(eintrag.saetze, verfuegbar, schrift);
    } else {
      zeilen += zeilenFuerText(eintrag.text, verfuegbar, schrift);
    }
    // Die Bezeichnung steht in der ersten Reihe des Eintrags und belegt auch ohne Text daneben
    // eine Zeile (EintragZeile in satzEintragBausteine.tsx).
    if (zeilen === 0 && eintrag.bezeichnung) zeilen = 1;
    zeilen += zeilenFuerText(eintrag.fortsetzung, verfuegbar, schrift);
    if (eintrag.untereintraege.length > 0) {
      zeilen += zeilenFuerEintraege(eintrag.untereintraege, einzug + nrBreite, breite, schrift);
    }
    return zeilen;
  }

  // Spiegelt EintragListe: eine gemeinsame Label-Spalte (nrBreite) für alle
  // Geschwister dieser Ebene, ermittelt aus der längsten bezeichnung – wird
  // sowohl für die oberste Eintrag-Ebene (einzug=0) als auch für
  // untereintraege (einzug bereits um den Elternteil erhöht) verwendet, exakt
  // wie im Rendering (EintragListe bzw. der untereintraege-Zweig in
  // EintragZeile).
  function zeilenFuerEintraege(
    eintraege: ListenEintragDarstellung[],
    einzug: number,
    breite: number,
    schrift: number,
  ): number {
    const laengste = eintraege
      .map((e) => e.bezeichnung)
      .reduce((a, b) => (a.length >= b.length ? a : b), '');
    const nrBreite = spaltenBreite(laengste, schrift);
    let zeilen = 0;
    for (const eintrag of eintraege)
      zeilen += zeilenFuerEintrag(eintrag, einzug, nrBreite, breite, schrift);
    return zeilen;
  }

  // satz.eintraege (Listeneinträge innerhalb eines Satzes) fehlten in der alten
  // Schätzung komplett, obwohl sie bei Normen mit Aufzählungen (z. B. § 312 BGB)
  // einen erheblichen Teil der tatsächlichen Höhe ausmachen. breite ist die für
  // DIESEN Satz verfügbare Breite (siehe SatzZeile: eintraege liegen in
  // derselben Spalte wie der Satztext, keine weitere Reduktion nötig).
  function zeilenFuerSatz(satz: SatzDarstellung, breite: number, schrift: number): number {
    let zeilen = zeilenFuerText(satz.text, breite, schrift);
    zeilen += zeilenFuerText(satz.fortsetzung, breite, schrift);
    if (satz.eintraege.length > 0)
      zeilen += zeilenFuerEintraege(satz.eintraege, 0, breite, schrift);
    return zeilen;
  }

  // Spiegelt UnterabsatzListe: eine gemeinsame "[n]"-Label-Spalte für alle
  // Unterabsätze, darunter je Unterabsatz ggf. eine eigene Satz-Nummern-Spalte
  // (wie bei AbsatzBlock ohne Unterabsätze).
  function zeilenFuerUnterabsaetze(
    unterabsaetze: UnterabsatzDarstellung[],
    breite: number,
    schrift: number,
  ): number {
    const laengsteNr = unterabsaetze
      .map((ua) => ua.bezeichnung)
      .reduce((a, b) => (a.length >= b.length ? a : b), '');
    const uaNrBreite = spaltenBreite(laengsteNr, schrift);
    const verfuegbar = Math.max(MIN_VERFUEGBARE_BREITE, breite - uaNrBreite);
    let zeilen = 0;
    for (const ua of unterabsaetze) zeilen += zeilenFuerSaetze(ua.saetze, verfuegbar, schrift);
    return zeilen;
  }

  // Spiegelt SaetzeListe in beiden Satzanordnungen. breite ist die Breite rechts
  // neben allen Bezeichnungsspalten. Neue Zeile je Satz: eigene Satznummernspalte.
  // Fortlaufend: Blöcke aus gliedereFortlaufendeSaetze ohne Nummernspalte; die
  // kleinen Nummern zählen näherungsweise als Textzeichen.
  function zeilenFuerSaetze(saetze: SatzDarstellung[], breite: number, schrift: number): number {
    if (kontext.satzNeuZeile) {
      const satzNrBreite = satzListenNrBreite(saetze.length, schrift);
      const verfuegbar = Math.max(MIN_VERFUEGBARE_BREITE, breite - satzNrBreite);
      return saetze.reduce((s, satz) => s + zeilenFuerSatz(satz, verfuegbar, schrift), 0);
    }
    return gliedereFortlaufendeSaetze(saetze).reduce((zeilen, block) => {
      if (block.art === 'aufzaehlung')
        return zeilen + zeilenFuerEintraege(block.satz.eintraege, 0, breite, schrift);
      const text = block.teile
        .map(({ art, satz, nummer }) =>
          art === 'fortsetzung'
            ? satz.fortsetzung
            : `${saetze.length > 1 ? nummer : ''}${satz.text}`,
        )
        .join(' ');
      return zeilen + zeilenFuerText(text, breite, schrift);
    }, 0);
  }

  // Zwischenüberschriften: Sätze als ein kursiver Fließtext.
  function inlineText(saetze: SatzDarstellung[]): string {
    return saetze
      .map((satz, index) => `${saetze.length > 1 ? index + 1 : ''}${satz.text}`)
      .join(' ');
  }

  const zeilHoehe = schrift * kontext.zeilenabstand;
  function textHoehe(text: Pick<NormDarstellung, 'absaetze' | 'zusatztexte'>): number {
    // Spiegelt AbsatzListe: gemeinsame Bezeichnungsspalte ("(1)", "(2)", …), wenn
    // mehr als ein benannter Absatz vorliegt – reduziert die für JEDEN
    // Absatz verfügbare Breite (Satz- wie Unterabsatz-Zweig).
    const nummeriertCount = text.absaetze.filter((a) => a.bezeichnung != null).length;
    const laengsteAbsBezeichnung = text.absaetze
      .map((a) => a.bezeichnung ?? '')
      .reduce((a, b) => (a.length >= b.length ? a : b), '');
    const absNrBreite = nummeriertCount > 1 ? spaltenBreite(laengsteAbsBezeichnung, schrift) : 0;
    const breiteJeAbsatz = Math.max(
      MIN_VERFUEGBARE_BREITE,
      kontext.textSpalteBreite - kontext.inhaltEinzug - absNrBreite,
    );
    const zeilen = text.absaetze.reduce((sum, a) => {
      let absatzZeilen: number;
      if (a.zwischenueberschrift) {
        const breite = Math.max(
          MIN_VERFUEGBARE_BREITE,
          kontext.textSpalteBreite - kontext.inhaltEinzug,
        );
        absatzZeilen = zeilenFuerText(inlineText(a.saetze), breite, schrift, 'italic');
      } else if (a.unterabsaetze && a.unterabsaetze.length > 0) {
        absatzZeilen = zeilenFuerUnterabsaetze(a.unterabsaetze, breiteJeAbsatz, schrift);
      } else {
        absatzZeilen = zeilenFuerSaetze(a.saetze, breiteJeAbsatz, schrift);
      }
      return sum + Math.max(1, absatzZeilen);
    }, 0);
    // Ein Abstand nach dem Titel und je einer vor jedem weiteren Absatz.
    const zusatztexte = text.zusatztexte ?? [];
    const zusatzZeilen = zusatztexte.reduce(
      (sum, z) =>
        sum +
        zeilenFuerText(
          z.text,
          Math.max(MIN_VERFUEGBARE_BREITE, kontext.textSpalteBreite - kontext.inhaltEinzug),
          schrift,
        ),
      0,
    );
    const absatzAbstand =
      (text.absaetze.length + zusatztexte.length) * zeilHoehe * GESETZESTEXT_ABSATZABSTAND;
    return (zeilen + zusatzZeilen) * zeilHoehe + absatzAbstand;
  }
  switch (el.typ) {
    case 'ueberschrift': {
      const u = el.data;
      const { topPad, titelHoehe, schriftFaktor } = ueberschriftKopf(u, schrift, kontext);
      return (
        topPad +
        titelHoehe +
        ermittleUeberschriftPaddingBottom(schriftFaktor) +
        (u.text && !kontext.eingeklappteUeberschriften.has(u.id) ? textHoehe(u.text) : 0)
      );
    }
    case 'norm': {
      const kurzzeilenTitel = normKurzzeilenTitel(el.data);
      if (kurzzeilenTitel !== undefined)
        return normTitelHoehe(el.data, kurzzeilenTitel, schrift, kontext) + 20;
      // Eingeklappte Norm: NormBlock rendert nur die Titelzeile (kein
      // AbsatzListe-Body) – strukturell identisch zum weggefallen-Fall,
      // daher dieselbe Formel statt der vollen absaetze-Berechnung unten.
      if (kontext.eingeklappteNormen.has(el.data.id))
        return normTitelHoehe(el.data, undefined, schrift, kontext) + 20;
      return normTitelHoehe(el.data, undefined, schrift, kontext) + textHoehe(el.data) + 20;
    }
  }
}

// Geschätzter DOM-scrollTop für einen Element-Index (Summe estimateSize + SCROLL_MARGIN).
// Explizit parametrisiert statt als Closure – kann daher auch außerhalb der
// Hauptkomponente (z. B. in useGesetzSprung) verwendet werden.
export function schaetzeScrollTop(
  bis: number,
  sichtbareElemente: readonly DarstellungsElement[],
  schrift: number,
  kontext: HoehenKontext,
): number {
  let offset = SCROLL_MARGIN;
  for (let i = 0; i < bis && i < sichtbareElemente.length; i++) {
    // Schleifen-Invariante: i < sichtbareElemente.length (Teil der for-Bedingung).
    offset += schaetzeHoehe(sichtbareElemente[i]!, schrift, kontext);
  }
  return offset;
}

// ---------------------------------------------------------------------------
// Virtualizer-Key (statt Index)
// ---------------------------------------------------------------------------
// @tanstack/react-virtual cacht gemessene Höhen standardmäßig pro INDEX. Das
// bricht in zwei Fällen:
// 1. Sobald irgendwo im Dokument eine Überschrift ein-/aufgeklappt wird,
//    ändert sich die Länge/Reihenfolge von sichtbareElemente (siehe
//    berechneVisibleElemente) – Index 50 ist danach ein anderes Element als
//    vorher, der Cache wendet aber weiter dessen alte Höhe an.
// 2. Wird der Einklapp-Zustand eines NICHT gemounteten Elements geändert
//    (z.B. durch useKlappstufenNavigation/usePfeilNavigation, die ganze
//    Bereiche auf einmal setzen), bleibt die gecachte Höhe vom alten Zustand
//    stehen – measureElement/ResizeObserver feuert ja erst, wenn das Element
//    tatsächlich wieder gemountet wird.
// Die id des Elements ist über die Lebensdauer dieser Gesetzestextansicht-Instanz
// stabil (siehe gesetzTypes.ts) und macht den Key unabhängig vom Index. Das
// ':zu'-Suffix sorgt zusätzlich dafür, dass eine Änderung des EIGENEN
// Einklapp-Zustands (verändert die eigene Render-Höhe, siehe schaetzeHoehe)
// einen neuen Key erzeugt – der alte, jetzt falsche Cache-Eintrag wird vom
// Virtualizer dadurch verworfen, bis zur nächsten echten Messung greift die
// (jetzt zustands-bewusste) Schätzung aus schaetzeHoehe.
// textVersion sorgt zusätzlich für dieselbe Cache-Invalidierung, wenn sich
// der wirksame Darstellungsstand ändert: Schriftgröße/-familie, Zeilenabstand,
// verfügbare Textbreite, Inhaltseinzug, Satzanordnung, Ausrichtung,
// Silbentrennung oder Sprache. Sie können die gerenderte Höhe beeinflussen;
// konservativ gilt ein neuer Stand deshalb für alle Elemente. Ein Wechsel erzeugt
// daher für ALLE Keys gleichzeitig einen neuen Wert und verwirft so den
// kompletten alten Höhen-Cache des Virtualizers.
// Schlüssel-Speicher: Die Bibliothek fragt bei jeder Neuberechnung der Positionstabelle die
// Schlüssel aller folgenden Elemente erneut ab (U1b), im Stufe-2-Messlauf bis zu 60.000-mal je
// Bild. Jeder Schlüssel wird daher je Funktion einmal gebildet und gehalten; dieselbe
// Zeichenkette macht auch die Suche im Höhencache der Bibliothek billiger. Rein abgeleitet: Die
// Funktion entsteht neu, sobald sich ein Eingang ändert (useTextVirtualizer.ts).
/** Erzeugt die für eine Höhenidentität wiederverwendbare Key-Funktion. */
export function erstelleItemKeyFunktion(
  elemente: readonly DarstellungsElement[],
  ueberschriften: ReadonlySet<string>,
  normen: ReadonlySet<string>,
  identitaet: string,
) {
  const schluessel: (string | undefined)[] = [];
  return (index: number): string => {
    const gehalten = schluessel[index];
    if (gehalten !== undefined) return gehalten;
    const el = elemente[index];
    if (!el) throw new RangeError(`Textindex ${index} fehlt.`);
    const eingeklappt = (el.typ === 'ueberschrift' ? ueberschriften : normen).has(el.data.id);
    return (schluessel[index] = `${el.data.id}:${eingeklappt ? 'zu:' : ''}${identitaet}`);
  };
}

export function erstelleHoehenKontext(
  optionen: ScrollSteuerungOptionen,
  breite: number,
): HoehenKontext {
  const { geometrie, messung } = optionen;
  return {
    eingeklappteUeberschriften: optionen.eingeklappteUeberschriften,
    eingeklappteNormen: optionen.eingeklappteNormen,
    unterArtikelIds: optionen.unterArtikelIds,
    zeilenabstand: geometrie.zeilenabstand,
    textSpalteBreite: breite,
    messung,
    inhaltEinzug: geometrie.inhaltEinzug,
    satzNeuZeile: geometrie.satzNeuZeile,
    lang: geometrie.lang,
    hyphens: geometrie.hyphens,
    textAlign: geometrie.textAlign,
  };
}

/** Identischer Geometriestand für Höhenkeys und laufende Scrollfortsetzungen. */
export function ermittleHoehenIdentitaet(kontext: HoehenKontext, schrift: number): string {
  return JSON.stringify([
    schrift,
    kontext.messung.schriftFamilie,
    kontext.zeilenabstand,
    kontext.textSpalteBreite,
    kontext.inhaltEinzug,
    kontext.satzNeuZeile,
    kontext.textAlign,
    kontext.hyphens,
    kontext.lang,
  ]);
}

/** Schätzung nur für den ersten Renderbereich; die Zielposition wird anschließend echt gemessen. */
export function schaetzeInitialOffset(
  optionen: Pick<
    import('./ScrollSteuerung.types').ScrollSteuerungOptionen,
    'initialZielId' | 'initialPosition' | 'sichtbareElemente' | 'geometrie'
  >,
  kontext: HoehenKontext,
): number {
  const { initialZielId, initialPosition, sichtbareElemente, geometrie } = optionen;
  const index = initialZielId
    ? sichtbareElemente.findIndex((el) => el.data.id === initialZielId)
    : (initialPosition?.index ?? -1);
  return index >= 0 && index < sichtbareElemente.length
    ? schaetzeScrollTop(index, sichtbareElemente, geometrie.schriftgroesse, kontext) +
        (initialZielId ? 0 : (initialPosition?.offsetInItem ?? 0))
    : 0;
}
