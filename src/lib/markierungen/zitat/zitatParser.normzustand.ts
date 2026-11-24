// Gemeinsamer Normzustand der Normgrenzenhandler und Funktionen zum Öffnen
// von Normkandidaten, Einträgen ohne Ziel und Verweisen auf ganze Gesetze.
// Beim Öffnen werden Textbereiche geschlossen; Kurztitel ordnet der Worthandler zu.

import type {
  Token,
  InterneZusatzArt,
  ZusatzArt,
} from '@/lib/markierungen/zitat/zitatParser.tokenizer';
import { VERFEINERUNGS_EBENE } from '@/lib/markierungen/zitat/zitatParser.helpers';
import type { AmbiguerPunkt, RohNormZitat } from '@/lib/markierungen/zitat/zitatParser.types';

// ---------------------------------------------------------------------------
// Gemeinsame Bausteine der vier norm-öffnenden Funktionen (unten)
// ---------------------------------------------------------------------------

export interface NormState {
  /** Index des ersten Eintrags, der noch einen Kurztitel erhalten kann. */
  gesetzesabschnittStart: number;
  // Die Norm, gegen die NICHT-mehrdeutige Zusatzinfo (Var/Alt/Hs/Gr)
  // aktuell läuft. Bei mehrdeutigen Art.-Kandidaten wird
  // dieser Zeiger BEWUSST NICHT verändert (siehe neueVerankerteNorm) –
  // weitere Kommas in derselben Kette prüfen dann weiterhin gegen die
  // ursprüngliche Norm, nicht gegen den unsicheren Kandidaten.
  offenerIndex: number | null;
  pluralModus: boolean;
  /** Einzelpräfix für folgende Zahlen einer Kette, ohne Artikelzahl-Fortgeltung. */
  aktiverPraefix: string[] | undefined;
  zusatzArt: InterneZusatzArt | undefined;
  // Hierarchischer Kontext für die aktuell offene Norm (siehe
  // AmbiguerPunkt.absatzKontext/satzKontext/nummerKontext in
  // zitatParser.types.ts): die zuletzt im Zitat-Text EXPLIZIT genannten
  // Absatz-/Satz-/Nummer-Werte, undefined = noch keiner genannt. Wird bei
  // jeder neuen (nicht: verankerten) Norm zurückgesetzt, da der Kontext pro
  // Norm gilt.
  aktiverAbsatzWert: string | undefined;
  aktiverUnterabsatzWert: string | undefined;
  aktiverSatzWert: string | undefined;
  aktiverNummerWert: string | undefined;
  // "Satz-Kurzform" (z.B. "434 III 2" = "§ 434 Abs. 3 S. 2", sehr verbreitete
  // Zitierkonvention): eine bloße Zahl UNMITTELBAR nach einem soeben
  // etablierten Absatz-Wert (ohne "S."-Wort) gilt als Satz-Wert. Das Flag ist
  // nur für GENAU das nächste Token gültig (siehe Dispatch und Zahlhandler) – jedes andere Token dazwischen (Komma, weiteres Zusatzwort,
  // …) verwirft die Kurzform-Erwartung wieder.
  satzKurzformErwartet: boolean;
}

const KONTEXT_EBENEN = [
  { art: 'absatz', feld: 'aktiverAbsatzWert' },
  { art: 'unterabsatz', feld: 'aktiverUnterabsatzWert' },
  { art: 'satz', feld: 'aktiverSatzWert' },
  { art: 'nummer', feld: 'aktiverNummerWert' },
] as const;

/** Setzt die genannte Ebene; nur ihre übergeordneten Kontextwerte bleiben erhalten. */
export function setzeEbene(
  state: NormState,
  art: Exclude<ZusatzArt, 'litera'>,
  wert: string,
): void {
  for (const ebene of KONTEXT_EBENEN) {
    if (ebene.art === art) state[ebene.feld] = wert;
    if (VERFEINERUNGS_EBENE[ebene.art] > VERFEINERUNGS_EBENE[art]) {
      state[ebene.feld] = undefined;
    }
  }
}

export function erzeugeNormState(): NormState {
  return {
    gesetzesabschnittStart: 0,
    offenerIndex: null,
    // Stryker disable next-line BooleanLiteral: einzige Variante false → true äquivalent –
    // pluralModus wird ausschließlich innerhalb eines bereits offenen
    // Norm-Kontexts gelesen (behandleKomma, legeAlsNeueNormAn), der stets
    // erst durch neueNorm/neueOhneZielZitat/neuesGanzesGesetzZitat entsteht und
    // dabei pluralModus explizit setzt. Der Initialwert wird daher nie
    // gelesen, bevor er überschrieben wurde.
    pluralModus: false,
    aktiverPraefix: undefined,
    zusatzArt: undefined,
    aktiverAbsatzWert: undefined,
    aktiverUnterabsatzWert: undefined,
    aktiverSatzWert: undefined,
    aktiverNummerWert: undefined,
    // Stryker disable next-line BooleanLiteral: einzige Variante false → true äquivalent – wird am
    // ersten Zahlhandler gelesen und sofort auf false zurückgesetzt; alle
    // übrigen Token verwerfen es bereits im Dispatch. Bei der ersten Zahl ist
    // offenerIndex noch garantiert null, sodass ein etwaiger (fälschlich)
    // wahrer Kandidatenwert in behandleZahlMitOffenerNorm ohnehin nie
    // ausgewertet wird (siehe Guard `offenerIndex === null` dort).
    satzKurzformErwartet: false,
  };
}

/**
 * Bündelt die für die norm-öffnenden Funktionen (unten) und die
 * Token-Handler (siehe zitatParser.normgrenzen.ts) gemeinsam benötigten,
 * über den gesamten Parse-Lauf unveränderlichen Referenzen (Text,
 * Tokens, Zitat- und Ambiguitätenlisten) sowie den veränderlichen NormState – ein Objekt
 * statt einzelner Parameter an jeder Funktion.
 */
export interface NormKontext {
  readonly text: string;
  readonly tokens: Token[];
  readonly ambiguitaeten: AmbiguerPunkt[];
  readonly zitate: RohNormZitat[];
  readonly state: NormState;
}

/**
 * Schließt den Textbereich des vorherigen Eintrags (falls vorhanden) und
 * hängt einen neuen RohNormZitat-Platzhalter an – gemeinsame Kachelungs-
 * Logik aller vier normöffnenden Funktionen. `zusatzFelder` ergänzt/
 * überschreibt die Grundfelder (z.B. `ohneZiel`, `gesetzRoh`, `ganzesGesetz`).
 */
function oeffneZitatEintrag(
  ctx: NormKontext,
  startOffset: number,
  zusatzFelder: Partial<RohNormZitat> = {},
): number {
  const { zitate, text } = ctx;
  const index = zitate.length;
  if (index > 0) zitate[index - 1]!.textEnde = startOffset; // beweisbar sicher: index-1 < zitate.length
  zitate.push({
    normzahlRoh: '',
    anzeigeText: '',
    textStart: startOffset,
    textEnde: text.length,
    ...zusatzFelder,
  });
  return index;
}

/**
 * Setzt den hierarchischen Kontext (siehe NormState.aktiverAbsatzWert/...)
 * samt zusatzArt zurück – von neueNorm, neueOhneZielZitat und
 * neuesGanzesGesetzZitat gleichermaßen genutzt. neueVerankerteNorm ruft dies BEWUSST NICHT auf (siehe deren
 * Dokumentation unten).
 */
function setzeKontextZurueck(state: NormState): void {
  state.zusatzArt = undefined;
  state.aktiverAbsatzWert = undefined;
  state.aktiverUnterabsatzWert = undefined;
  state.aktiverSatzWert = undefined;
  state.aktiverNummerWert = undefined;
}

export function neueNorm(
  ctx: NormKontext,
  startOffset: number,
  plural: boolean,
  praefix?: string[],
): number {
  const { state } = ctx;
  const index = oeffneZitatEintrag(ctx, startOffset);
  state.offenerIndex = index;
  state.pluralModus = plural;
  state.aktiverPraefix = praefix?.length ? praefix.slice(-1) : undefined;
  if (praefix?.length) ctx.zitate[index]!.praefix = praefix;
  setzeKontextZurueck(state);
  return index;
}

// Wie neueNorm, aber ohne offenerIndex/zusatzArt/pluralModus zu verändern
// (siehe NormState.offenerIndex-Kommentar oben) – der hierarchische Kontext
// (aktiverAbsatzWert/...) bleibt aus demselben Grund ebenfalls unverändert:
// weitere Kommas in derselben Kette prüfen weiter gegen den Kontext der
// ANKER-Norm, nicht gegen den unsicheren Kandidaten.
export function neueVerankerteNorm(ctx: NormKontext, startOffset: number): number {
  const index = oeffneZitatEintrag(ctx, startOffset);
  if (ctx.state.aktiverPraefix) ctx.zitate[index]!.praefix = ctx.state.aktiverPraefix;
  return index;
}

// Öffnet eine neue Zitat-"Norm" für reine Zusatzinfo OHNE Anker (siehe
// RohNormZitat.ohneZiel) – nutzt DENSELBEN Kachelungs-Mechanismus wie
// neueNorm (schließt den Textbereich des vorherigen Eintrags automatisch),
// damit auch nachträglich folgende echte Normen lückenlos daran anschließen,
// OHNE diesen Text fälschlich mit zu übernehmen (siehe behandleSymbol in
// zitatParser.normgrenzen.ts, das unabhängig vom aktuellen offenerIndex
// immer eine neue echte Norm samt eigenem Textbereich beginnt). Einträge
// ohne Ziel erhalten keinen Kurztitel vom Worthandler.
export function neueOhneZielZitat(ctx: NormKontext, startOffset: number): number {
  const { state } = ctx;
  const index = oeffneZitatEintrag(ctx, startOffset, { ohneZiel: true });
  state.offenerIndex = index;
  // Stryker disable next-line BooleanLiteral: einzige Variante false → true äquivalent – ohneZiel-Einträge
  // werden in behandleKomma vor der Pluralabfrage übersprungen. Die nächste
  // echte Norm bzw. ein ganzes Gesetz setzt pluralModus erneut explizit.
  state.pluralModus = false;
  state.aktiverPraefix = undefined;
  // Stryker disable next-line CallExpression: einzige Variante entfernt den Aufruf – bei einem ersten
  // Eintrag sind die Kontextwerte bereits leer. Nach Semikolon können tiefere
  // Werte erhalten sein; ohneZiel-Einträge erzeugen jedoch keine Ambiguitäten,
  // und die nächste echte Norm bzw. ein ganzes Gesetz setzt den Kontext zurück.
  setzeKontextZurueck(state);
  return index;
}

// Öffnet ein Zitat für einen Verweis auf ein ganzes Gesetz ohne Normangabe,
// etwa einen Kurztitel ohne ausstehende Normzahl – strukturell wie neueNorm
// (offenerIndex zeigt darauf, damit z.B. ein Komma danach wie gewohnt eine
// neue eigenständige Norm eröffnen kann). Der Worthandler schließt danach
// den Gesetzesabschnitt, damit spätere Kurztitel diesen nicht überschreiben.
export function neuesGanzesGesetzZitat(
  ctx: NormKontext,
  startOffset: number,
  kurztitel: string,
): number {
  const { state } = ctx;
  const index = oeffneZitatEintrag(ctx, startOffset, {
    anzeigeText: kurztitel,
    gesetzRoh: kurztitel,
    ganzesGesetz: true,
  });
  state.offenerIndex = index;
  state.pluralModus = false;
  state.aktiverPraefix = undefined;
  setzeKontextZurueck(state);
  return index;
}
