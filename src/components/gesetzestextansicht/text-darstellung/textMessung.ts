// textMessung.ts
// Private Canvasmessung und begrenzte Caches je aufgelöster Schriftfamilie.

import { SATZNUMMER_VERKLEINERUNG } from '@/lib/stil/gesetzTextDarstellung';

export const MESS_CACHE_MAX_EINTRAEGE = 40_000;

/** Füllstand der Messzwischenspeicher einer Ansicht; Zeichen zählen die gespeicherten Schlüssel. */
interface Messstand {
  grenze: number;
  spalten: { eintraege: number; zeichen: number };
  zeilen: { eintraege: number; zeichen: number };
}

export interface TextMessung {
  readonly schriftFamilie: string;
  meldeMessstand: (anlass: string) => void;
  /** Für die Speichermessung; zählt die Schlüssel bei jedem Aufruf neu. */
  holeMessstand: () => Messstand;
  spaltenBreite: (text: string, schrift: number) => number;
  breiteSpalteFuerBezeichnungen: (bezeichnungen: string[], schrift: number) => number;
  satzNummerBreite: (anzahlSaetze: number, schrift: number) => number;
  /** Reine Glyphenbreite ohne Puffer, etwa einer nicht umbrechenden Bezeichnung. */
  textBreite: (text: string, schrift: number, stil?: Schriftstil) => number;
  zeilenFuerText: (
    text: string | undefined,
    breite: number,
    schrift: number,
    optionen?: ZeilenOptionen,
  ) => number;
}

export type Schriftstil = 'bold' | 'italic';

interface ZeilenOptionen {
  /** CSS-Schriftstil des Texts, etwa fett gesetzte Titel. */
  stil?: Schriftstil;
  /** Breite eines nicht umbrechenden Vorlaufs in derselben ersten Zeile (z.B. Normbezeichnung). */
  vorlaufBreite?: number;
  /** Regelsatz der Silbentrennung; nur bei wirksamem `hyphens: auto` setzen, sonst ohne Trennung.
   * Siehe silbentrennstellen(). */
  silbentrennung?: Trennsprache;
  /** "\n" als harten Umbruch zählen, wie die Darstellung mit `white-space: pre-wrap` (Normtext,
   * "\n" nur aus <zeilenumbruch/>). Ohne die Option gilt Leerraum wie bei `white-space: normal`:
   * Umbrüche und Leerraumfolgen wirken als ein Leerzeichen (Titel, Überschriften). */
  harteUmbrueche?: boolean;
}

export function erstelleTextMessung(
  schriftFamilie: string,
  grenze: number = MESS_CACHE_MAX_EINTRAEGE,
): TextMessung {
  const zaehler = {
    spalten: { fehlgriffe: 0 },
    zeilen: { fehlgriffe: 0 },
  };
  let meldung: ReturnType<typeof setTimeout> | undefined;
  function meldeMessstand(anlass: string) {
    if (!import.meta.env.DEV) return;
    console.info(
      `[perf] Messzwischenspeicher ${schriftFamilie} ${anlass}: Spalten ${spaltenBreiteCache.groesse()}/${grenze}, ${zaehler.spalten.fehlgriffe} Fehlgriffe, ${spaltenBreiteCache.verdraengungen()} Verdrängungen; Zeilen ${zeilenFuerTextCache.groesse()}/${grenze}, ${zaehler.zeilen.fehlgriffe} Fehlgriffe, ${zeilenFuerTextCache.verdraengungen()} Verdrängungen (kumulativ seit Aufbau)`,
    );
  }
  function fehlgriff(art: 'spalten' | 'zeilen') {
    if (!import.meta.env.DEV) return;
    zaehler[art].fehlgriffe++;
    if (meldung !== undefined) clearTimeout(meldung);
    meldung = setTimeout(() => {
      meldung = undefined;
      meldeMessstand('nach Messruhe');
    }, 500);
  }
  let messCanvasKontext: CanvasRenderingContext2D | null | undefined;
  function ermittleMessKontext(): CanvasRenderingContext2D | null {
    if (messCanvasKontext !== undefined) return messCanvasKontext;
    messCanvasKontext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    return messCanvasKontext;
  }
  // Puffer zum nachfolgenden Text – measureText liefert die reine Glyphenbreite
  // ohne jeden Abstand, daher hier fest ergänzt (schriftgrößenabhängig, damit
  // er bei größerer Leseschrift mitskaliert).
  const SPALTENBREITE_PUFFER_FAKTOR = 0.35;

  // Eintragsgrenze je Cache, keine Byte-Grenze: lange Texte brauchen mehr Speicher. Bei voller
  // Grenze wird nur der älteste Eintrag (Einfügereihenfolge) verdrängt, nicht der ganze Cache
  // geleert; so bleiben die zuletzt gemessenen Texte ohne neue Canvas-Messung erhalten. Jede
  // Ansicht hat eigene Caches, sodass andere Ansichten unberührt bleiben. Ein vollständiger
  // Durchlauf durch das BGB erzeugt rund 8.700 Zeileneinträge (Messung Stufe 1).

  const spaltenBreiteCache = erstelleMessZwischenspeicher(grenze);

  // Schätzbreite einer Spalte basierend auf dem längsten anzuzeigenden Text.
  function spaltenBreite(text: string, schrift: number): number {
    const teilschluessel = String(schrift);
    const cached = spaltenBreiteCache.hole(text, teilschluessel);
    if (cached !== undefined) return cached;

    if (import.meta.env.DEV) fehlgriff('spalten');
    const kontext = ermittleMessKontext();
    let breite: number;
    if (kontext) {
      kontext.font = `${schrift}px ${schriftFamilie}`;
      breite = kontext.measureText(text).width + schrift * SPALTENBREITE_PUFFER_FAKTOR;
    } else {
      // Fallback ohne DOM (z.B. Tests): grobe Schätzung wie zuvor.
      breite = text.length * schrift * 0.55 + schrift * SPALTENBREITE_PUFFER_FAKTOR;
    }
    spaltenBreiteCache.setze(text, teilschluessel, breite);
    return breite;
  }

  // Breite der Spalte für eine LISTE von Bezeichnungen (z.B.
  // alle Absatz-Bezeichnungen "(1)"/"(2)", alle Unterabsatz-Marken "[1]"/"[2]", alle
  // Eintrag-Bezeichnungen "1."/"2."/"a)") – misst nur die LÄNGSTE, da alle
  // Einträge derselben Spalte gemeinsam linksbündig ausgerichtet werden.
  // Extrahiert aus vormals vier fast identischen Stellen in
  // absatzBausteine.tsx/satzEintragBausteine.tsx
  // (AbsatzListe, UnterabsatzListe, EintragListe, EintragZeile) – überall
  // exakt dasselbe "längste finden, dann spaltenBreite()"-Muster, nur mit
  // unterschiedlicher Quelle für die Bezeichnungen-Liste.
  function breiteSpalteFuerBezeichnungen(bezeichnungen: string[], schrift: number): number {
    const laengste = bezeichnungen.reduce((a, b) => (a.length >= b.length ? a : b), '');
    return spaltenBreite(laengste, schrift);
  }

  // Breite der hochgestellten Satz-Nummer (z.B. "¹", "²" vor mehreren Sätzen
  // in einem Absatz/Unterabsatz/Eintrag) – 0, wenn nur ein Satz vorliegt (dann
  // wird ohnehin keine Nummer angezeigt, siehe SaetzeListe.zeigeNummern in
  // satzEintragBausteine.tsx). Extrahiert aus vormals drei
  // identischen Stellen (AbsatzBlock, UnterabsatzListe, EintragZeile). Gemessen wird mit
  // der verkleinerten Ziffer; echte Hochziffern der Serifenschrift lassen sich im Canvas
  // nicht messen, sind aber ähnlich breit.
  function satzNummerBreite(anzahlSaetze: number, schrift: number): number {
    return anzahlSaetze > 1
      ? spaltenBreite(String(anzahlSaetze), schrift * SATZNUMMER_VERKLEINERUNG)
      : 0;
  }

  function textBreite(text: string, schrift: number, stil?: Schriftstil): number {
    const teilschluessel = `${stil ?? ''}|${schrift}|glyphen`;
    const cached = spaltenBreiteCache.hole(text, teilschluessel);
    if (cached !== undefined) return cached;
    if (import.meta.env.DEV) fehlgriff('spalten');
    const kontext = ermittleMessKontext();
    let breite: number;
    if (kontext) {
      kontext.font = schriftAngabe(schrift, stil);
      breite = kontext.measureText(text).width;
    } else {
      breite = text.length * schrift * 0.55;
    }
    spaltenBreiteCache.setze(text, teilschluessel, breite);
    return breite;
  }

  function schriftAngabe(schrift: number, stil?: Schriftstil): string {
    return `${stil ? `${stil} ` : ''}${schrift}px ${schriftFamilie}`;
  }

  // ---------------------------------------------------------------------------
  // Zeilenumbruch-Simulation für Fließtext (Höhenschätzung im Virtualizer)
  // ---------------------------------------------------------------------------
  // Gleicher Grund wie bei spaltenBreite oben: eine Zeichen-Heuristik trifft bei
  // Proportionalschrift nur ungefähr, und bei den sehr langen EGBGB-Normen
  // summierte sich der Fehler zu spürbaren Scroll-Sprüngen. Hier daher eine
  // echte, wortweise Zeilenumbruch-Simulation über measureText() statt einer
  // Zeichen-pro-Zeile-Schätzung. Wortweise (nicht zeichenweise) genügt für die
  // Zeilenumbruch-Entscheidung und ist deutlich billiger als eine volle
  // Canvas-Textmessung des Gesamttexts. Ergebnis wird pro (Text, Breite,
  // Schriftgröße)-Kombination gecacht – wichtig, weil dieselbe Norm beim
  // erneuten Scrollen/während der Korrekturschleife in springeZuIndex mehrfach
  // neu geschätzt wird.
  const zeilenFuerTextCache = erstelleMessZwischenspeicher(grenze);

  // Breite wird vor dem Cache-Key auf 2px gerundet: Breiten aus der
  // verschachtelten Label-/Einzug-Berechnung in virtualizer.ts
  // unterscheiden sich oft nur um Bruchteile eines Pixels (unterschiedliche
  // Bezeichnungslängen), ohne dass sich die tatsächliche Zeilenzahl ändert –
  // ohne Rundung würde der Cache für nahezu identische Breiten nie greifen.
  function zeilenFuerText(
    text: string | undefined,
    breite: number,
    schrift: number,
    optionen: ZeilenOptionen = {},
  ): number {
    if (!text) return 0;
    const { stil, silbentrennung, harteUmbrueche = false } = optionen;
    const breiteGerundet = Math.max(1, Math.round(breite / 2) * 2);
    const vorlauf = Math.round(optionen.vorlaufBreite ?? 0);
    const teilschluessel = `${schrift}|${breiteGerundet}|${stil ?? ''}|${vorlauf}|${silbentrennung ?? ''}|${harteUmbrueche ? 'h' : ''}`;
    const cached = zeilenFuerTextCache.hole(text, teilschluessel);
    if (cached !== undefined) return cached;

    if (import.meta.env.DEV) fehlgriff('zeilen');
    const kontext = ermittleMessKontext();
    if (kontext) kontext.font = schriftAngabe(schrift, stil);
    // Harte Zeilenumbrüche (aus <zeilenumbruch/>, im Text als "\n") zeigt die Darstellung mit
    // `white-space: pre-wrap`: Jeder Teil beginnt eine neue Zeile, ein leerer Teil zwischen zwei
    // Umbrüchen ist eine Leerzeile, ein abschließender Umbruch erzeugt keine sichtbare Zeile.
    // Der Vorlauf steht nur vor dem ersten Teil. Ohne harte Umbrüche ist der Text ein Teil.
    const teile = harteUmbrueche ? text.split('\n') : [text];
    if (teile.length > 1 && teile[teile.length - 1] === '') teile.pop();
    const zeilen = teile.reduce((summe, teil, index) => {
      const teilVorlauf = index === 0 ? vorlauf : 0;
      if (kontext) {
        return (
          summe +
          zaehleZeilen(
            // Nur an normalen Leerzeichen und Tabs: Durch geschützte Leerzeichen (U+00A0, U+202F)
            // verbundene Wörter bleiben wie in der Darstellung (umbruchschutz.tsx) eine Gruppe.
            teil.split(harteUmbrueche ? /[ \t]+/ : /[ \t\r\n\f]+/).filter(Boolean),
            breiteGerundet,
            teilVorlauf,
            (t) => kontext.measureText(t).width,
            silbentrennung,
          )
        );
      }
      // Fallback ohne DOM (z.B. Tests): grobe Zeichen-Heuristik wie zuvor; der Vorlauf zählt
      // als Zeichen derselben Durchschnittsbreite, Schriftstil und Silbentrennung entfallen.
      const zeichen = teil.length + teilVorlauf / (schrift * 0.55);
      return (
        summe + Math.max(1, Math.ceil(zeichen / Math.max(20, breiteGerundet / (schrift * 0.55))))
      );
    }, 0);
    zeilenFuerTextCache.setze(text, teilschluessel, zeilen);
    return zeilen;
  }

  return {
    schriftFamilie,
    meldeMessstand,
    holeMessstand: () => ({
      grenze,
      spalten: spaltenBreiteCache.fuellstand(),
      zeilen: zeilenFuerTextCache.fuellstand(),
    }),
    spaltenBreite,
    breiteSpalteFuerBezeichnungen,
    satzNummerBreite,
    textBreite,
    zeilenFuerText,
  };
}

type Miss = (text: string) => number;

// Wortweiser Umbruch: Ein Wort, das nicht mehr in die Zeile passt, beginnt eine neue Zeile.
// Das Leerzeichen hinter einem Wort zählt nur, wenn ein weiteres Wort in derselben Zeile folgt;
// am Zeilenende hängt es im Browser über den Rand (`white-space: pre-wrap`) und braucht keinen
// Platz. Der Vorlauf steht ohne Umbruchgelegenheit vor dem ersten Wort: Dieses kann nur per
// Silbentrennung, nicht als Ganzes in die nächste Zeile wandern. Ein nach der Trennung
// verbleibender Rest wird nicht erneut getrennt (Wörter länger als eine Zeile sind selten).
function zaehleZeilen(
  woerter: string[],
  breite: number,
  vorlauf: number,
  miss: Miss,
  silbentrennung: Trennsprache | undefined,
): number {
  let leerzeichen: number | undefined;
  let zeilen = 1;
  // Breite der Zeile bis zum Ende ihres letzten Worts; der Wortabstand kommt erst mit dem
  // nächsten Wort in derselben Zeile hinzu.
  let zeilenBreite = vorlauf;
  let woerterInZeile = 0;
  for (const wort of woerter) {
    const abstand = woerterInZeile > 0 ? (leerzeichen ??= miss(' ')) : 0;
    const wortBreite = miss(wort);
    const passt = zeilenBreite + abstand + wortBreite <= breite;
    const rest =
      // Geschützte Wortgruppen bleiben wie die nowrap-Gruppen der Darstellung ungeteilt.
      silbentrennung && !/[\u00a0\u202f]/.test(wort) && zeilenBreite > 0 && !passt
        ? trenneInZeile(wort, breite - zeilenBreite - abstand, miss, REGELSAETZE[silbentrennung])
        : undefined;
    if (rest !== undefined) {
      zeilen++;
      zeilenBreite = miss(rest);
      woerterInZeile = 1;
    } else if (!passt && woerterInZeile > 0) {
      zeilen++;
      zeilenBreite = wortBreite;
      woerterInZeile = 1;
    } else {
      zeilenBreite += abstand + wortBreite;
      woerterInZeile++;
    }
  }
  return zeilen;
}

/** Rest des Worts hinter der längsten Trennstelle, deren Stück samt Strich in die Restbreite passt. */
function trenneInZeile(
  wort: string,
  restBreite: number,
  miss: Miss,
  regeln: Regelsatz,
): string | undefined {
  const passend = silbentrennstellen(wort, regeln)
    .reverse()
    .find(
      ({ position, strich }) => miss(wort.slice(0, position) + (strich ? '-' : '')) <= restBreite,
    );
  return passend && wort.slice(passend.position);
}

// ---------------------------------------------------------------------------
// Näherung der Silbentrennung für `hyphens: auto`
// ---------------------------------------------------------------------------
// Der Browser trennt mit eigenen Wörterbüchern; die genauen Trennstellen sind von hier aus nicht
// abfragbar. Die Näherung folgt je Sprache einem einfachen Regelsatz nach Sprechsilben: Steht
// zwischen zwei Vokalen ein einzelner Konsonant, kommt er auf die neue Zeile; von mehreren
// Konsonanten nur der letzte Laut. Lautgruppen gelten als ein Laut und bleiben zusammen; zwischen
// Vokalen ohne Konsonant wird nicht getrennt. Nach einem vorhandenen Bindestrich wird ohne weiteren
// Strich umbrochen. Die Mindestlängen entsprechen dem Beispielwert von CSS
// `hyphenate-limit-chars: 5 2 2` (Wort mindestens 5, vor und nach der Trennstelle mindestens 2
// Zeichen) – eine Annahme über die Voreinstellung der Darstellungs-Engines, kein frei gewählter
// Faktor. Zeichen außerhalb von Buchstabenfolgen (Ziffern, Satzzeichen) trennen nie.
// Zusammensetzungen und Wörterbuchausnahmen werden nicht erkannt. Andere Sprachen schätzt der
// Aufrufer ohne Trennung (virtualizer.ts); ein weiterer Regelsatz wird in REGELSAETZE ergänzt.
export type Trennsprache = 'de' | 'fr' | 'es';

interface Regelsatz {
  vokal: RegExp;
  /** Konsonantenfolgen, die als ein Laut gelten; längere vor kürzeren. */
  lautgruppen: readonly string[];
}

// Konsonant + l oder r: im Französischen und Spanischen untrennbar (pa-trie, ha-blar).
const MIT_L_ODER_R = ['bl', 'cl', 'fl', 'gl', 'pl', 'br', 'cr', 'dr', 'fr', 'gr', 'pr', 'tr'];

const REGELSAETZE: Record<Trennsprache, Regelsatz> = {
  // Amtliche Regelung der deutschen Rechtschreibung (§§ 107–112): Ge-richt, Verwal-tung;
  // ch, ck, sch, ph, th bleiben zusammen (Wä-sche, Zu-cker).
  de: { vokal: /[aeiouäöüy]/i, lautgruppen: ['sch', 'ch', 'ck', 'ph', 'th'] },
  // Französische Silbentrennung nach Sprechsilben (Grevisse, Le bon usage, „division des mots“):
  // ein Konsonant zur Folgesilbe (vé-ri-té), Konsonant + l/r und ch, ph, th, gn untrennbar
  // (pa-trie, ar-bre, si-gner); von drei Konsonanten bleiben zwei vorn (cons-tant).
  fr: {
    vokal: /[aeiouyàâäéèêëîïôöùûüÿœæ]/i,
    lautgruppen: ['ch', 'ph', 'th', 'gn', ...MIT_L_ODER_R, 'vr'],
  },
  // Spanische Silbentrennung (Ortografía de la lengua española, RAE 2010, Kap. 4): ein Konsonant
  // zur Folgesilbe, ch, ll, rr und Konsonant + l/r untrennbar (pe-rro, ca-lle, ha-blar); von drei
  // Konsonanten bleiben zwei vorn (ins-tan-te).
  es: { vokal: /[aeiouáéíóúü]/i, lautgruppen: ['ch', 'll', 'rr', ...MIT_L_ODER_R] },
};

const BUCHSTABE = /\p{L}/u;
const MINDEST_WORTLAENGE = 5;
const MINDEST_TEILLAENGE = 2;

interface Trennstelle {
  /** Index des ersten Zeichens der neuen Zeile. */
  position: number;
  strich: boolean;
}

function silbentrennstellen(wort: string, regeln: Regelsatz): Trennstelle[] {
  const stellen: Trennstelle[] = [];
  // Buchstabenfolgen einzeln betrachten; ein Bindestrich dazwischen ist eine Trennstelle ohne Strich.
  let beginn = 0;
  for (let i = 0; i <= wort.length; i++) {
    const zeichen = wort.charAt(i);
    if (i < wort.length && BUCHSTABE.test(zeichen)) continue;
    stellen.push(...trennstellenInFolge(wort.slice(beginn, i), beginn, regeln));
    if (zeichen === '-' && i > 0 && i < wort.length - 1) {
      stellen.push({ position: i + 1, strich: false });
    }
    beginn = i + 1;
  }
  return stellen;
}

function trennstellenInFolge(folge: string, versatz: number, regeln: Regelsatz): Trennstelle[] {
  if (folge.length < MINDEST_WORTLAENGE) return [];
  const vokale = Array.from({ length: folge.length }, (_, i) => i).filter((i) =>
    regeln.vokal.test(folge.charAt(i)),
  );
  return vokale
    .slice(1)
    .map((vokal, n) => [vokale[n] ?? vokal, vokal] as const)
    .filter(([vorher, vokal]) => vokal - vorher > 1)
    .map(([vorher, vokal]) => beginnDesLetztenLauts(folge, vorher + 1, vokal, regeln.lautgruppen))
    .filter((p) => p >= MINDEST_TEILLAENGE && folge.length - p >= MINDEST_TEILLAENGE)
    .map((p) => ({ position: versatz + p, strich: true }));
}

/** Konsonantenfolge [von, bis) in Laute zerlegen; liefert den Beginn des letzten Lauts. */
function beginnDesLetztenLauts(
  folge: string,
  von: number,
  bis: number,
  lautgruppen: readonly string[],
): number {
  let beginn = von;
  for (let j = von; j < bis;) {
    beginn = j;
    const gruppe = lautgruppen.find(
      (g) => j + g.length <= bis && folge.slice(j, j + g.length).toLowerCase() === g,
    );
    j += gruppe?.length ?? 1;
  }
  return beginn;
}

// Zweistufiger Messzwischenspeicher: Text → (Teilschlüssel aus Schriftgröße und ggf. gerundeter
// Breite) → Wert. Treffer kommen ohne Zusammenbau eines Schlüssels aus dem Volltext aus; die
// Schriftfamilie ist je Textmessung fest und daher nicht Teil des Schlüssels.
function erstelleMessZwischenspeicher(grenze: number) {
  const nachText = new Map<string, Map<string, number>>();
  // Ringpuffer der Schlüssel in Einfügereihenfolge; bei voller Grenze steht an `naechster`
  // der älteste Eintrag. Werte werden nur bei Fehlgriffen gesetzt, also nie doppelt.
  const reiheText: string[] = [];
  const reiheTeil: string[] = [];
  let naechster = 0;
  let eintraege = 0;
  let verdraengungen = 0;
  function verdraenge(text: string, teil: string) {
    const teile = nachText.get(text);
    teile?.delete(teil);
    if (teile?.size === 0) nachText.delete(text);
    eintraege--;
    if (import.meta.env.DEV) verdraengungen++;
  }
  return {
    hole: (text: string, teil: string) => nachText.get(text)?.get(teil),
    setze(text: string, teil: string, wert: number) {
      const aeltesterText = reiheText[naechster];
      const aeltesterTeil = reiheTeil[naechster];
      if (eintraege >= grenze && aeltesterText !== undefined && aeltesterTeil !== undefined) {
        verdraenge(aeltesterText, aeltesterTeil);
      }
      let teile = nachText.get(text);
      if (!teile) nachText.set(text, (teile = new Map<string, number>()));
      teile.set(teil, wert);
      eintraege++;
      reiheText[naechster] = text;
      reiheTeil[naechster] = teil;
      naechster = (naechster + 1) % grenze;
    },
    groesse: () => eintraege,
    verdraengungen: () => verdraengungen,
    /** Zeichen zählen Texte und Teilschlüssel. */
    fuellstand() {
      let zeichen = 0;
      for (const [text, teile] of nachText) {
        for (const teil of teile.keys()) zeichen += text.length + teil.length;
      }
      return { eintraege, zeichen };
    },
  };
}
