// Normgrenzen und Zusatzanker: Handler pro Tokenart mit gemeinsamem NormKontext.
// Der Worthandler ordnet Kurztitel den Zielen im offenen Gesetzesabschnitt zu. Kommagrenzen liegen in .komma.ts und
// werden hier weiterexportiert.
//
// Alle Handler erhalten (ctx, ti) und liefern den nächsten zu verarbeitenden
// Tokenindex. Jede Rückgabe liegt hinter dem aktuellen Token.

import type { Token, InterneZusatzArt } from '@/lib/markierungen/zitat/zitatParser.tokenizer';
import {
  fuehrendeSonstigeVerschieben,
  leseSymbolFolge,
  leseMehrwortKurztitel,
  istOrdnungszahlVorAltVarGr,
} from '@/lib/markierungen/zitat/zitatParser.helpers';
import type { NormKontext } from '@/lib/markierungen/zitat/zitatParser.normzustand';
import {
  setzeEbene,
  neueNorm,
  neueOhneZielZitat,
  neuesGanzesGesetzZitat,
} from '@/lib/markierungen/zitat/zitatParser.normzustand';

export function behandleSemikolon(ctx: NormKontext, ti: number): number {
  ctx.state.gesetzesabschnittStart = ctx.zitate.length;
  ctx.state.offenerIndex = null;
  ctx.state.zusatzArt = undefined;
  ctx.state.aktiverPraefix = undefined;
  return ti + 1;
}

export function behandleSymbol(ctx: NormKontext, ti: number): number {
  const { tokens } = ctx;
  const erstesSymbol = tokens[ti]!; // ti bezeichnet das aktuelle Token des Dispatchers
  let symbolIndex = ti;
  // Überzählige Paragraphenzeichen ohne eigene Zahl gehören zum letzten
  // Paragraphensymbol mit Zahl. Andere Token und Symbole bleiben Grenzen.
  // Symbolnormen stammen ausschließlich aus Tokenisierung und Canon-Klassifizierung:
  // §/§§/Art/Artt/Can/Cann. Teiltreffer an Regexankern sind daher ausgeschlossen.
  if (erstesSymbol.norm === '§' || erstesSymbol.norm === '§§') {
    let letzterIndex = ti;
    while (
      tokens[letzterIndex + 1]?.art === 'symbol' &&
      (tokens[letzterIndex + 1]!.norm === '§' || tokens[letzterIndex + 1]!.norm === '§§')
    ) {
      letzterIndex++;
    }
    if (tokens[letzterIndex + 1]?.art === 'zahl') symbolIndex = letzterIndex;
  }
  const tok = tokens[symbolIndex]!;
  // Ein neues Symbol begrenzt die rückwirkende Gesetzeszuordnung. Ein
  // Binnenparagraph wird mit leseSymbolFolge konsumiert und erreicht diesen
  // Handler nicht eigenständig.
  ctx.state.gesetzesabschnittStart = ctx.zitate.length;

  const plural = tok.norm === '§§' || tok.norm === 'Artt' || tok.norm === 'Cann';
  const { teile, praefix, naechsterIndex } = leseSymbolFolge(tokens, symbolIndex);
  const index = neueNorm(
    ctx,
    fuehrendeSonstigeVerschieben(tokens, ti, erstesSymbol.start),
    plural,
    praefix,
  );

  // Normzahl (ggf. zweiteilig für Gliederungsartikel-Binnenparagraphen, z.B.
  // "Art. 229 § 2 EGBGB" bzw. bereits im Zwei-Token-Format "229 2") – siehe
  // leseSymbolFolge in zitatParser.helpers.ts.
  // index-Zugriffe hier beweisbar sicher: index kommt direkt aus neueNorm(),
  // das den Eintrag unmittelbar zuvor per push() angelegt hat.
  ctx.zitate[index]!.normzahlRoh = teile.join(' ');
  const normAnzeige = teile.join(' § ');
  ctx.zitate[index]!.anzeigeText = teile.length > 0 ? `${tok.wert} ${normAnzeige}` : tok.wert;
  return naechsterIndex;
}

function behandleZahlOhneOffeneNorm(
  ctx: NormKontext,
  tokens: Token[],
  ti: number,
  tok: Token,
): void {
  // "n. Alt"/... GANZ OHNE vorangehende Norm (z.B. bloßes "1. Alt"): die
  // Ordnungszahl gehört zur Alt/Var/Gr-Zusatzangabe, ist also KEINE Normzahl
  // – die Regel „1 GG" gilt hier nicht. Bleibt wie ein alleinstehendes
  // "Abs. 3"/"III" reine Zusatzinfo ohne Ziel, statt fälschlich als Verweis
  // auf Norm "1" interpretiert zu werden.
  if (istOrdnungszahlVorAltVarGr(tok.warOrdnungszahl, tokens[ti + 1])) {
    neueOhneZielZitat(ctx, fuehrendeSonstigeVerschieben(tokens, ti, tok.start));
    return;
  }
  // Zahl ohne vorangehendes Symbol (Regel „1 GG" bzw. „einfach 1", oder nach
  // ';' ohne erneutes Symbol, z.B. "§§ 1 Abs. 1, 2; 3").
  const index = neueNorm(ctx, fuehrendeSonstigeVerschieben(tokens, ti, tok.start), false);
  ctx.zitate[index]!.normzahlRoh = tok.wert;
  ctx.zitate[index]!.anzeigeText = tok.wert;
}

function behandleZahlMitOffenerNorm(
  ctx: NormKontext,
  tokens: Token[],
  ti: number,
  tok: Token,
  offenerIndex: number,
  satzKurzformKandidat: boolean,
): void {
  const { state, zitate } = ctx;
  // beweisbar sicher: offenerIndex zeigt immer auf einen bereits per push()
  // angelegten Eintrag, zitate schrumpft nie.
  const aktuell = zitate[offenerIndex]!;
  const vorheriges = tokens[ti - 1]!; // Eine offene Norm setzt ein vorangehendes Token voraus.

  // Satz-Kurzform (siehe NormState.satzKurzformErwartet, z.B. "434 III 2" =
  // "§ 434 Abs. 3 S. 2"): bloße Zahl UNMITTELBAR nach einem soeben
  // etablierten Absatz-Wert, ohne "S."-Wort dazwischen.
  if (satzKurzformKandidat) {
    setzeEbene(state, 'satz', tok.wert);
    state.zusatzArt = 'satz';
    return;
  }

  // Direkter Wert zu einem unmittelbar vorangehenden Abs/S/Nr-Wort-Token
  // (z.B. "Abs 3", "S 2", "Nr 1") – wird als aktiver Kontextwert für die
  // hierarchische Existenzprüfung mehrdeutiger Kommagrenzen gemerkt (siehe
  // AmbiguerPunkt.absatzKontext/... in zitatParser.types.ts und
  // normStrukturPruefung.ts). "lit" fällt hier NICHT darunter: Litera-Werte
  // sind Buchstaben (eigenes 'wort'-Token), keine Zahlen.
  //
  // Diese Normwerte treten ausschließlich an Zusatz-Token auf; eine
  // zusätzliche Prüfung der Tokenart wäre daher redundant.
  if (
    vorheriges.norm === 'absatz' ||
    vorheriges.norm === 'unterabsatz' ||
    vorheriges.norm === 'satz' ||
    vorheriges.norm === 'nummer'
  ) {
    setzeEbene(state, vorheriges.norm, tok.wert);
    if (vorheriges.norm === 'absatz') {
      state.satzKurzformErwartet = true; // "Abs 3 2" soll wie "III 2" funktionieren
    }
    return;
  }

  // "n. Alt"/"n. Var"/"n. Gr"/"n. Hs" (z.B. "812 1. Alt"): die Ordnungszahl
  // VOR Alt/Var/Gr gehört zu dieser Zusatzangabe, ist KEIN zweites
  // Binnenparagraph-Token (siehe unten, "freistehende Zahl ohne erkennbare
  // Rolle") – sonst würde "1" fälschlich in normzahlRoh aufgenommen und
  // "812 1" als (nicht existierende) Norm gesucht, statt die nachfolgende
  // Alt/Var/Gr-Zusatzangabe zu bilden.
  //
  // Diese Stelle behandelt die Kurzform des Binnenparagraphen ohne eigenes
  // §; leseSymbolFolge liest nur explizite Symbolfolgen.
  //
  // normzahlRoh ist leer, eine arabische Normzahl oder eine aus zwei
  // solchen Zahlen zusammengesetzte Angabe. Nur Zahl-Token können denselben
  // wert besitzen: andere Token beginnen mit Buchstaben oder Zeichen;
  // römische Absatz-Token behalten ihre römische Schreibweise. Bekannte
  // Kurztitel beginnen ebenfalls mit einem Buchstaben. Daher genügt unten
  // der Wertvergleich; eine zusätzliche Tokenartprüfung wäre redundant.
  // vorheriges existiert: Eine offene Norm setzt ein vorheriges Token voraus.
  // Die Zusatzartprüfung bleibt nötig, wenn eine Zusatznummer zufällig mit
  // der Normzahl übereinstimmt (z.B. "§ 5 Nr. 5 2").
  if (
    state.zusatzArt === undefined &&
    aktuell.normzahlRoh === vorheriges.wert &&
    !istOrdnungszahlVorAltVarGr(tok.warOrdnungszahl, tokens[ti + 1])
  ) {
    // Zweites Zahlen-Token direkt hinter dem ersten, ohne Symbol/Komma/
    // Zusatz dazwischen: Zwei-Token-Format für Gliederungsartikel-
    // Binnenparagraphen ohne führendes Symbol (z.B. bloßes "229 2").
    aktuell.normzahlRoh += ' ' + tok.wert;
    // Die bloße zweite Zahl nennt kein eigenes Präfix. Das erste Artikelpräfix
    // bleibt am Rohzitat, gilt aber nicht als Symbol der folgenden Zahlen.
    state.aktiverPraefix = undefined;
    aktuell.anzeigeText += ' ' + tok.wert;
  }
  // Andernfalls: freistehende Zahl ohne erkennbare Rolle (z.B. die "1" in
  // "1. Alt", oder jede Zahl innerhalb eines ohneZiel-Zitats) – für die
  // Grenz-Erkennung selbst ohne Bedeutung, wird ignoriert; die Kategorie
  // liefert das nachfolgende Zusatz-Token.
}

export function behandleZahl(ctx: NormKontext, ti: number): number {
  const { tokens } = ctx;
  const tok = tokens[ti]!; // ti bezeichnet das aktuelle Token des Dispatchers
  const { offenerIndex, satzKurzformErwartet } = ctx.state;
  ctx.state.satzKurzformErwartet = false;
  if (offenerIndex === null) {
    behandleZahlOhneOffeneNorm(ctx, tokens, ti, tok);
  } else {
    behandleZahlMitOffenerNorm(ctx, tokens, ti, tok, offenerIndex, satzKurzformErwartet);
  }
  return ti + 1;
}

export function behandleBuchstabe(ctx: NormKontext, ti: number): number {
  const tok = ctx.tokens[ti]!; // ti bezeichnet das aktuelle Token des Dispatchers
  // Einzelner/verdoppelter Kleinbuchstabe (siehe Tokenizer:
  // LITERA_BUCHSTABE_MUSTER) – ausschließlich als Litera-WERT relevant, NIE
  // als Kurztitel (auch ohne vorangehendes "lit").
  // Ohne offene Norm: eigenständiger Verweis OHNE Ziel – insbesondere NICHT
  // der 'wort'-Behandlung überlassen, die es sonst fälschlich als
  // Gesetz-Kurztitel einträgt. MIT offener Norm (z.B. der erste Litera-Wert
  // direkt hinter "lit"): reine Zusatzangabe ohne eigene tiefere Ebene –
  // anders als Abs/S/Nr gibt es unterhalb von Litera nichts zu merken, der
  // Token wird einfach konsumiert.
  if (ctx.state.offenerIndex === null) {
    neueOhneZielZitat(ctx, tok.start);
  }
  return ti + 1;
}

export function behandleZusatz(ctx: NormKontext, ti: number): number {
  const tok = ctx.tokens[ti]!; // ti bezeichnet das aktuelle Token des Dispatchers
  const { state } = ctx;
  if (state.offenerIndex === null) {
    // Zusatzinfo ohne vorangehende Norm (z.B. alleinstehendes/führendes
    // "Abs. 3") – eigenständiger Verweis OHNE Ziel (soll
    // speicherbar und unverändert anzeigbar sein, aber nicht verlinken).
    // neueOhneZielZitat übernimmt dieselbe Kachelung wie neueNorm, damit
    // weder davor noch danach eine Lücke entsteht.
    neueOhneZielZitat(ctx, tok.start);
    return ti + 1;
  }
  state.zusatzArt = tok.norm as InterneZusatzArt;
  // Römische Zahl (siehe Tokenizer) ist der Absatz-Wert selbst, kein
  // separates Zahl-Token nötig (anders als bei "Abs 3", wo der Wert erst im
  // nächsten Token kommt, siehe behandleZahl oben).
  if (tok.roemischWert !== undefined) {
    setzeEbene(state, 'absatz', String(tok.roemischWert));
    state.satzKurzformErwartet = true;
  }
  return ti + 1;
}

export function behandleWort(ctx: NormKontext, ti: number): number {
  const { tokens, text } = ctx;
  const tok = tokens[ti]!; // ti bezeichnet das aktuelle Token des Dispatchers
  // Mehrteiliger Kurztitel (z.B. "SGB 2", "SGB XIV"): jedes
  // DIREKT folgende Wort- oder Zahl-Token OHNE andere Tokenart dazwischen
  // gehört noch zum Kurztitel (siehe leseMehrwortKurztitel in
  // zitatParser.helpers.ts). Alle Grenzfälle (Komma, Semikolon, §/§§/Art./
  // Artt., Abs/S/Nr/lit/Var/Gr/Hs/Alt, "und"/"analog"/"vgl"/"sh"/"siehe"/
  // iVm/aE, siehe SONSTIGE_WOERTER im Tokenizer) sind bereits eigene
  // Tokenarten und stoppen die Kette dadurch von selbst.
  const { kurztitel, naechsterIndex } = leseMehrwortKurztitel(tokens, tok, ti, text);

  let hatWartendesZiel = false;
  for (let index = ctx.state.gesetzesabschnittStart; index < ctx.zitate.length; index++) {
    const zitat = ctx.zitate[index]!; // index liegt innerhalb der dichten Zitatliste
    if (!zitat.ohneZiel) {
      zitat.gesetzRoh = kurztitel;
      hatWartendesZiel = true;
    }
  }
  ctx.state.gesetzesabschnittStart = ctx.zitate.length;
  // Eine bekannte vollständige Spanne konsumiert keine folgende Normzahl.
  if (tok.bekannterKurztitel) ctx.state.offenerIndex = null;

  if (hatWartendesZiel) {
    // Ein Kurztitel schließt auch den Anker für Zusatzmehrdeutigkeiten.
    ctx.state.zusatzArt = undefined;
    ctx.state.aktiverPraefix = undefined;
    return naechsterIndex;
  }
  // Keine wartende Normzahl: das Wort steht für sich – Verweis auf ein ganzes
  // Gesetz (siehe Ablaufkommentar in zitatParser.ts und
  // neuesGanzesGesetzZitat).
  neuesGanzesGesetzZitat(ctx, fuehrendeSonstigeVerschieben(tokens, ti, tok.start), kurztitel);
  if (tok.bekannterKurztitel) ctx.state.offenerIndex = null;
  ctx.state.gesetzesabschnittStart = ctx.zitate.length;
  return naechsterIndex;
}

export * from '@/lib/markierungen/zitat/zitatParser.normgrenzen.komma';
