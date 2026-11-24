// Kommagrenzen: Fortsetzung, sichere Folgenorm oder Mehrdeutigkeitskandidat.
// Zusatzart, Verfeinerungskette und Pluralsymbol bestimmen die Einordnung;
// die Existenzprüfung eines Zusatzes übernimmt anschließend der Aufrufer.
// behandleKomma wird über zitatParser.normgrenzen.ts weiterexportiert.

import type {
  Token,
  InterneZusatzArt,
  ZusatzArt,
} from '@/lib/markierungen/zitat/zitatParser.tokenizer';
import type { AmbiguerPunkt, RohNormZitat } from '@/lib/markierungen/zitat/zitatParser.types';
import {
  hatWeiterenKandidatenImCluster,
  nachTrennern,
  VERFEINERUNGS_EBENE,
  sammleVerfeinerungskette,
  istOrdnungszahlVorAltVarGr,
} from '@/lib/markierungen/zitat/zitatParser.helpers';
import type { NormKontext, NormState } from '@/lib/markierungen/zitat/zitatParser.normzustand';
import { neueNorm, neueVerankerteNorm } from '@/lib/markierungen/zitat/zitatParser.normzustand';

/**
 * Kontext-Snapshot für einen AmbiguerPunkt der Art `art` (siehe
 * AmbiguerPunkt.absatzKontext/satzKontext/nummerKontext/unterabsatzKontext
 * in zitatParser.types.ts): übernimmt nur übergeordnete Kontextwerte,
 * da die aktuelle Ebene selbst geprüft wird.
 */
function kontextFuer(
  state: Pick<
    NormState,
    'aktiverAbsatzWert' | 'aktiverUnterabsatzWert' | 'aktiverSatzWert' | 'aktiverNummerWert'
  >,
  art: InterneZusatzArt,
): Pick<AmbiguerPunkt, 'absatzKontext' | 'unterabsatzKontext' | 'satzKontext' | 'nummerKontext'> {
  return {
    absatzKontext: art === 'absatz' ? undefined : state.aktiverAbsatzWert,
    unterabsatzKontext:
      art === 'satz' || art === 'nummer' || art === 'litera'
        ? state.aktiverUnterabsatzWert
        : undefined,
    satzKontext: art === 'nummer' || art === 'litera' ? state.aktiverSatzWert : undefined,
    nummerKontext: art === 'litera' ? state.aktiverNummerWert : undefined,
  };
}

/**
 * Gemeinsame Schwellenwert-Logik für Var/Gr (Schwelle 10) und Alt/Hs
 * (Schwelle 3, siehe Aufrufer in behandleKomma): Zahl unter der Schwelle →
 * plausibel noch Fortsetzung derselben Norm (kein neuer Eintrag), Zahl ab
 * der Schwelle → neue Norm. Bewusst `anzeigeWert` für BOTH normzahlRoh UND
 * anzeigeText (nicht dezimalWert) – Var/Gr/Alt/Hs sind nie römisch, beide
 * Werte sind hier identisch, sammleVerfeinerungskette braucht hier (anders
 * als beim prüfbaren Zweig unten) keinen Dezimalwert-Vergleich. Legt eine
 * neue Norm über legeAlsNeueNormAn (s.u.) an, statt den neueNorm()-Aufruf
 * samt Feldzuweisung erneut auszuschreiben.
 */
function pruefeSchwellenwertFortsetzung(
  ctx: NormKontext,
  naechste: Token,
  dezimalWert: string,
  anzeigeWert: string,
  naechsterIndex: number,
  schwelle: number,
): number {
  if (Number(dezimalWert) < schwelle) return naechsterIndex;
  return legeAlsNeueNormAn(ctx, naechste, anzeigeWert, anzeigeWert, naechsterIndex);
}

export function behandleKomma(ctx: NormKontext, ti: number): number {
  const { tokens, ambiguitaeten } = ctx;
  const kandidatIndex = nachTrennern(tokens, ti + 1);
  const { state, zitate } = ctx;
  const offenerIndex = state.offenerIndex;
  if (offenerIndex !== null && zitate[offenerIndex]!.ohneZiel) return kandidatIndex;
  const naechste = tokens[kandidatIndex];
  // Ohne Anker übernimmt der Dispatcher den Kandidaten; römische Absätze
  // bleiben dann Zusatzangaben ohne Ziel statt mehrdeutiger Normen.
  if (!naechste || offenerIndex === null) return kandidatIndex;
  // Nur der Tokenizer setzt roemischWert, stets mit art='zusatz' und
  // norm='absatz'. Canon-Klassifizierung entfernt ihn beim Symbolwechsel;
  // andere Umklassifizierungen betreffen keine römischen Token. Zusätzliche
  // art-/norm-Prüfungen sind deshalb redundant; Zusatzwörter wie "Abs."
  // haben zwar norm='absatz', aber keinen roemischWert.
  const istRoemisch = naechste.roemischWert !== undefined;
  // Litera-Fortsetzungen werden unmittelbar konsumiert. Andere Buchstaben
  // übernimmt der Dispatcher ohne Zustandsänderung (behandleBuchstabe).
  // So bleibt auch der bisherige Folgeindex dieses Handlers erhalten.
  if (naechste.art === 'buchstabe') {
    return state.zusatzArt === 'litera' ? kandidatIndex + 1 : kandidatIndex;
  }
  if (naechste.art !== 'zahl' && !istRoemisch) return kandidatIndex;

  // "n. Alt"/"n. Var"/"n. Gr"/"n. Hs" auch NACH einem Komma (z.B. "434 I 1, 9.
  // Var"): die Ordnungszahl gehört zur nachfolgenden Alt/Var/Gr-Zusatzangabe
  // und darf nicht als eigenständiger Existenz-Kandidat gegen die vorherige
  // Zusatzart (hier "Satz") geprüft werden – sonst hängt das Ergebnis
  // zufällig davon ab, ob z.B. zufällig ein gleichnamiger Satz existiert
  // (siehe istOrdnungszahlVorAltVarGr oben, "812 1. Alt").
  //
  // warOrdnungszahl wird ausschließlich auf Zahl-Token gesetzt und von
  // der Canon-Klassifizierung nicht übertragen. Der Helfer prüft dieses
  // Flag selbst; eine zusätzliche art-Prüfung ist daher redundant.
  if (istOrdnungszahlVorAltVarGr(naechste.warOrdnungszahl, tokens[kandidatIndex + 1])) {
    return kandidatIndex + 1;
  }

  // Anzeige bleibt die Original-Schreibweise ("III") für Fehlermeldungen
  // (siehe RohNormZitat.anzeigeText); für Existenzprüfung/Normauflösung wird
  // dagegen der Dezimalwert gebraucht (pruefeZusatzangabe, verweisZuXmlId
  // vergleichen gegen Ziffernfolgen).
  const anzeigeWert = naechste.wert;
  const dezimalWert = istRoemisch ? String(naechste.roemischWert) : naechste.wert;
  // Römische Zahlen sind nach der Tokenklassifizierung immer ein Absatz –
  // das überschreibt eine ggf. andere zuvor aktive Zusatzart.
  const effektiveZusatzArt: InterneZusatzArt | undefined = istRoemisch ? 'absatz' : state.zusatzArt;

  const zielIndex = offenerIndex;

  if (effektiveZusatzArt === undefined) {
    // dezimalWert === anzeigeWert hier immer identisch (istRoemisch wäre
    // sonst effektiveZusatzArt='absatz', s.o.) – legeAlsNeueNormAn statt
    // erneutem neueNorm()-Aufruf samt Feldzuweisung.
    return legeAlsNeueNormAn(ctx, naechste, anzeigeWert, anzeigeWert, kandidatIndex + 1);
  }

  if (effektiveZusatzArt === 'variante' || effektiveZusatzArt === 'gruppe') {
    return pruefeSchwellenwertFortsetzung(
      ctx,
      naechste,
      dezimalWert,
      anzeigeWert,
      kandidatIndex + 1,
      10,
    );
  }

  if (effektiveZusatzArt === 'alternative' || effektiveZusatzArt === 'halbsatz') {
    // Wie bei Var/Gruppe (dort Schwelle 10): eine kleine Zahl direkt nach
    // Alt/Hs + Komma ist plausibel noch eine weitere Alternative/ein
    // weiterer Halbsatz derselben Norm (z.B. "280 Alt. 1, 2" = Alt. 1 und
    // Alt. 2 desselben § 280), keine neue Norm. Alternativen/Halbsätze sind
    // praktisch nie höher als 2, daher hier die niedrigere Schwelle 3 (ab 3
    // handelt es sich um eine neue Normzahl, siehe Gegenbeispiel "280 Alt.
    // 1, 3" = § 280, § 3).
    return pruefeSchwellenwertFortsetzung(
      ctx,
      naechste,
      dezimalWert,
      anzeigeWert,
      kandidatIndex + 1,
      3,
    );
  }

  // Alle nicht prüfbaren Zusatzarten sind oben abschließend behandelt;
  // es bleiben Absatz, Unterabsatz, Satz, Nummer und Litera.
  return behandlePruefbareKommaGrenze(ctx, tokens, kandidatIndex + 1, ambiguitaeten, {
    naechste,
    zielIndex,
    effektiveZusatzArt,
    dezimalWert,
    anzeigeWert,
  });
}

interface PruefbareKommaDaten {
  naechste: Token;
  zielIndex: number;
  effektiveZusatzArt: InterneZusatzArt;
  dezimalWert: string;
  anzeigeWert: string;
}

/**
 * Legt einen Kandidaten als eigenständige, NICHT mehrdeutige neue Norm an
 * (weder §§/Artt.-Restzwang noch strukturell unmögliche Verfeinerungskette
 * treffen zu). Gemeinsamer Endpunkt für den Plural- und den Singular-Zweig
 * in behandlePruefbareKommaGrenze sowie für den undefined-Zweig und
 * pruefeSchwellenwertFortsetzung in behandleKomma.
 */
function legeAlsNeueNormAn(
  ctx: NormKontext,
  naechste: Token,
  dezimalWert: string,
  anzeigeWert: string,
  naechsterIndex: number,
): number {
  const normKandidaten = folgenormKandidaten(ctx, dezimalWert);
  const index = neueNorm(ctx, naechste.start, ctx.state.pluralModus, ctx.state.aktiverPraefix);
  ctx.zitate[index]!.normzahlRoh = dezimalWert;
  ctx.zitate[index]!.anzeigeText = anzeigeWert;
  if (normKandidaten) ctx.zitate[index]!.normKandidaten = normKandidaten;
  return naechsterIndex;
}

/** Die erste Deutung trägt den Gliederungsartikel auch durch längere
 * Zahlenketten. Ein Kurztitel schließt diesen Kontext wie die Zusatzanker. */
function folgenormKandidaten(ctx: NormKontext, zahl: string): RohNormZitat['normKandidaten'] {
  const anker = ctx.state.offenerIndex === null ? undefined : ctx.zitate[ctx.state.offenerIndex];
  if (!anker || anker.gesetzRoh !== undefined) return undefined;
  const teile = (anker.normKandidaten?.[0]?.normzahlRoh ?? anker.normzahlRoh).split(' ');
  if (teile.length !== 2) return undefined;
  return [
    { normzahlRoh: `${teile[0]} ${zahl}`, praefix: ['Art.', '§'] },
    { normzahlRoh: zahl, praefix: ['Art.'] },
  ];
}

interface MehrdeutigerKandidatDaten {
  naechste: Token;
  zielIndex: number;
  effektiveZusatzArt: InterneZusatzArt;
  dezimalWert: string;
  anzeigeWert: string;
  verfeinerungskette: Array<{ art: ZusatzArt; wert: string }>;
}

/**
 * Legt einen Kandidaten als verankerten, MEHRDEUTIGEN Kandidaten an – echte
 * Existenzprüfung durch den Aufrufer nötig (siehe AmbiguerPunkt-Kommentar in
 * zitatParser.ts). Gemeinsamer Endpunkt für den Plural- und den
 * Singular-Zweig in behandlePruefbareKommaGrenze.
 */
function legeAlsMehrdeutigenKandidatenAn(
  ctx: NormKontext,
  naechsterIndex: number,
  ambiguitaeten: AmbiguerPunkt[],
  daten: MehrdeutigerKandidatDaten,
): number {
  const { naechste, zielIndex, effektiveZusatzArt, dezimalWert, anzeigeWert, verfeinerungskette } =
    daten;
  const index = neueVerankerteNorm(ctx, naechste.start);
  ctx.zitate[index]!.normzahlRoh = dezimalWert;
  ctx.zitate[index]!.anzeigeText = anzeigeWert;
  const normKandidaten = folgenormKandidaten(ctx, dezimalWert);
  if (normKandidaten) ctx.zitate[index]!.normKandidaten = normKandidaten;
  ambiguitaeten.push({
    index,
    vorherigerIndex: zielIndex,
    art: effektiveZusatzArt as ZusatzArt,
    wert: dezimalWert,
    ...kontextFuer(ctx.state, effektiveZusatzArt),
    verfeinerung: verfeinerungskette.length > 0 ? verfeinerungskette : undefined,
  });
  return naechsterIndex;
}

/**
 * Zweiter Teil von behandleKomma: NUR der Fall "prüfbare Zusatzinfo"
 * (absatz/unterabsatz/satz/nummer/litera, siehe Ablaufkommentar in
 * zitatParser.ts). Prüft Verfeinerungsketten und den Pluralzwang, bevor
 * ein sicherer oder mehrdeutiger Normkandidat angelegt wird.
 */
function behandlePruefbareKommaGrenze(
  ctx: NormKontext,
  tokens: Token[],
  naechsterIndex: number,
  ambiguitaeten: AmbiguerPunkt[],
  { naechste, zielIndex, effektiveZusatzArt, dezimalWert, anzeigeWert }: PruefbareKommaDaten,
): number {
  const { state } = ctx;

  // Präzisiert eine direkt folgende Abs/S/Nr/lit-Angabe den Kandidaten selbst
  // (z.B. "434 Abs 1, 2 Abs 3" → "Abs 3" präzisiert die "2")? Ist die erste
  // Ebene dieser Kette NICHT echt tiefer als effektiveZusatzArt (z.B. Absatz
  // gefolgt von Absatz), ist das strukturell unmöglich (Absätze haben keine
  // Absätze) – der Kandidat kann dann gar keine Fortsetzung sein und wird
  // ohne Prüfung direkt zur neuen Norm (siehe AmbiguerPunkt.verfeinerung).
  const verfeinerungskette = sammleVerfeinerungskette(tokens, naechsterIndex);
  // verfeinerungskette[0] beweisbar sicher durch die length > 0-Prüfung
  // direkt davor (TS verknüpft das nur nicht automatisch).
  const verfeinerungUngueltig =
    verfeinerungskette.length > 0 &&
    VERFEINERUNGS_EBENE[verfeinerungskette[0]!.art] <=
      VERFEINERUNGS_EBENE[effektiveZusatzArt as ZusatzArt];

  const kandidatDaten: MehrdeutigerKandidatDaten = {
    naechste,
    zielIndex,
    effektiveZusatzArt,
    dezimalWert,
    anzeigeWert,
    verfeinerungskette,
  };

  if (state.pluralModus) {
    // §§ / Artt. verlangen mindestens zwei Normen: nur das LETZTE
    // verbleibende Komma-Element im Cluster ist dadurch zwingend und somit
    // ohne Prüfung sicher (siehe Ablaufkommentar in zitatParser.ts).
    // Gibt es danach noch (mind.) einen weiteren Kandidaten, ist der
    // aktuelle nicht mehr erzwungen und wird – wie bei Art. Singular – als
    // AmbiguerPunkt gegen die Anker-Norm geprüft. Schlägt die Prüfung fehl,
    // bleibt er (kein Zurückfalten) als eigenständige Norm stehen; die
    // normale Normauflösung meldet dann ggf. "existiert nicht" – keine
    // gesonderte Fehlerbehandlung hier nötig.
    const istMehrdeutig =
      !verfeinerungUngueltig && hatWeiterenKandidatenImCluster(tokens, naechsterIndex);
    if (istMehrdeutig) {
      return legeAlsMehrdeutigenKandidatenAn(ctx, naechsterIndex, ambiguitaeten, kandidatDaten);
    }
    return legeAlsNeueNormAn(ctx, naechste, dezimalWert, anzeigeWert, naechsterIndex);
  }

  // Ab hier: § Singular, Art. Singular und "kein Symbol" verhalten sich
  // identisch – mehrdeutig, echte Existenzprüfung durch den Aufrufer nötig
  // (siehe AmbiguerPunkt-Kommentar in zitatParser.ts). pluralModus ist an
  // dieser Stelle bereits false (siehe if (state.pluralModus) oben), es
  // bleibt also nur noch dieser eine Fall übrig.
  if (verfeinerungUngueltig) {
    return legeAlsNeueNormAn(ctx, naechste, dezimalWert, anzeigeWert, naechsterIndex);
  }
  return legeAlsMehrdeutigenKandidatenAn(ctx, naechsterIndex, ambiguitaeten, kandidatDaten);
}
