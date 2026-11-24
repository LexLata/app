// markierungskonflikteXML.ts
//
// Reine, zustandslose Bau- und Parse-Funktionen für MarkierungskonflikteXML
// (markierungskonflikte.xml) – kein Datei-I/O, kein Modulzustand. Teil des
// Submoduls markierungs-xml; Speicherung der Konflikte liegt in
// lib/markierungen/markierungskonflikte/konfliktspeicher.

// Baut einen Block mit dem Tag der Markierungsart. Der eigene Konflikt bleibt ohne Gesetzattribut.
// Zielkonflikte tragen das gesetz-Attribut; veränderte und fehlende Zielnormen
// desselben Gesetzes stehen in getrennten Konfliktelementen. Die Zielnormen
// werden bei der Anzeige aus der Markierung neu bestimmt, nicht hier gespeichert.

import type {
  EigenerKonflikt,
  GesetzKonflikte,
  KonfliktEintrag,
  MarkierungsEintrag,
  ZielKonflikt,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  vergleicheMarkierungsposition,
  ausgangsnormSchluessel,
  berechneZielKonflikte,
  bestimmeIdentifizierendeFelder,
  identitaetsSchluessel,
  pruefeMarkierung,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  escapeXML,
  liesXmlWurzel,
  optionaleXmlAttribut,
  xmlKind,
  xmlKinder,
  xmlText,
} from '@/lib/utils/xmlVerarbeitung';
import {
  ausgangsstelleTag,
  bauTextstelleZeilen,
  liesAusgangsstelle,
  liesZeichenbereich,
  TAG_VON_TYP,
  TYP_VON_TAG,
} from './markierungsXML';
import { parseTextpfad, liesXmlBereich } from './markierungsXML.textpfad';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import { textpfadSchluessel } from '@/lib/domain/textpfad/textpfad.index';
import { gesetzesreferenzSchluessel, liesPflichtNormgeber } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

export const XML_KONFLIKTART = {
  gesetzFehlt: 'gesetz-fehlt',
  nichtamtlicheTitelXmlFehlt: 'nichtamtliche-titel-xml-fehlt',
  bezugstextFehltOderUnpassend: 'bezugstext-fehlt-oder-unpassend',
  pauschalerBezugFehlt: 'pauschaler-bezug-fehlt',
  pauschalerBezugUnpassend: 'pauschaler-bezug-unpassend',
  zielGesetzFehlt: 'ziel-gesetz-fehlt',
  zielNormUnpassend: 'ziel-norm-unpassend',
  zielNormFehlt: 'ziel-norm-fehlt',
} as const;

function liesXmlKonfliktart(wert: string) {
  return Object.keys(XML_KONFLIKTART)
    .filter((wert): wert is keyof typeof XML_KONFLIKTART => Object.hasOwn(XML_KONFLIKTART, wert))
    .find((art) => XML_KONFLIKTART[art] === wert);
}

function baueMarkierungBlock(k: KonfliktEintrag): string {
  const zeilen: string[] = [`        <${TAG_VON_TYP[k.markierungstyp]}>`];
  if (k.eigenerKonflikt)
    zeilen.push(`            <konflikt typ="${XML_KONFLIKTART[k.eigenerKonflikt]}"/>`);
  // Ein Zielgesetz kann getrennte Einträge für veränderte und fehlende Zielnormen haben.
  for (const z of k.zielKonflikte) {
    zeilen.push(
      `            <konflikt typ="${XML_KONFLIKTART[z.typ]}" gesetz="${escapeXML(z.gesetz.kurztitel)}"${optionaleXmlAttribut('normgeber', z.gesetz.normgeber)}/>`,
    );
  }
  zeilen.push(`            ${ausgangsstelleTag(k)}`);
  if (k.textstelle) {
    zeilen.push(
      '            <textstelle>',
      bauTextstelleZeilen(k.textstelle),
      '            </textstelle>',
    );
  } else if (k.markierungstyp === 'kommentar') {
    zeilen.push(`            <kommentartext>${escapeXML(k.kommentarText ?? '')}</kommentartext>`);
  } else if (
    // Stryker disable next-line ConditionalExpression: äquivalent geprüft –
    // dieser Zweig ist nur erreichbar, wenn k.textstelle falsy UND
    // markierungstyp !== 'kommentar' ist; laut Domäne (MarkierungsEintrag:
    // Textstelle ist bei 'unterstreichung'/'hervorhebung' im gültigen Speichervertrag
    // immer vorhanden) bleibt dann als markierungstyp nur noch 'verweismarkierung' übrig –
    // die Bedingung ist an dieser Stelle also immer erfüllt.
    k.markierungstyp === 'verweismarkierung'
  ) {
    zeilen.push(`            <verweistext>${escapeXML(k.verweistext ?? '')}</verweistext>`);
  }
  zeilen.push(`        </${TAG_VON_TYP[k.markierungstyp]}>`);
  return zeilen.join('\n');
}

// nichtamtlicheTitelXmlFehlt (siehe markierungskonfliktPruefung.ts) gilt fürs GANZE Gesetz,
// nicht für eine einzelne Markierung – deshalb kein Markierungsblock,
// sondern ein eigenständiges <konflikt typ="nichtamtliche-titel-xml-fehlt"/> DIREKT unter <gesetz>,
// vor den Markierungsblöcken (siehe Vorlage des Nutzers). Kann zusammen
// mit ganz normalen Markierungsblöcken auftreten (anders als gesetzFehlt).
export function baueGesetzBlock(g: GesetzKonflikte): string {
  if (g.fehlendesGesetz) {
    return [
      `    <gesetz kurztitel="${escapeXML(g.gesetz.kurztitel)}"${optionaleXmlAttribut('normgeber', g.gesetz.normgeber)}>`,
      `        <konflikt typ="${XML_KONFLIKTART.gesetzFehlt}"/>`,
      '    </gesetz>',
    ].join('\n');
  }
  return [
    `    <gesetz kurztitel="${escapeXML(g.gesetz.kurztitel)}"${optionaleXmlAttribut('normgeber', g.gesetz.normgeber)}>`,
    g.nichtamtlicheTitelXmlFehlt
      ? `        <konflikt typ="${XML_KONFLIKTART.nichtamtlicheTitelXmlFehlt}"/>`
      : undefined,
    g.eintraege.length > 0
      ? [...g.eintraege].sort(vergleicheMarkierungsposition).map(baueMarkierungBlock).join('\n')
      : undefined,
    '    </gesetz>',
  ]
    .filter((z): z is string => z !== undefined)
    .join('\n');
}

export interface GeparsterKonfliktEintrag {
  /** Alle bereits vorhandenen Zielkonflikte dieses Eintrags, VOR der
   *  Bereinigung um `betroffene` (siehe patchReferenzierendesGesetz). */
  eigenerKonflikt: EigenerKonflikt | undefined;
  zielKonflikte: ZielKonflikt[];
  /** Zum Abgleich mit identitaetsSchluessel() einer live geladenen
   *  MarkierungsEintrag – siehe dort. */
  schluessel: string;
}

/**
 * nichtamtlicheTitelXmlFehlt (siehe markierungskonfliktPruefung.ts) steht auf Gesetz-Ebene,
 * NICHT innerhalb eines Markierungsblocks (siehe baueGesetzBlock) – daher
 * hier ein einfacher Test auf den gesamten <gesetz>-Blockinhalt statt Teil
 * von parseKonfliktEintraege().
 */
export function parseNichtamtlicheTitelXmlFehlt(gesetzBlockRoh: string): boolean {
  return xmlKinder(liesXmlWurzel(gesetzBlockRoh, 'gesetz'), 'konflikt').some(
    (el) => el.getAttribute('typ') === XML_KONFLIKTART.nichtamtlicheTitelXmlFehlt,
  );
}

function parseZielKonflikteUndEigen(block: Element): {
  eigenerKonflikt: EigenerKonflikt | undefined;
  zielKonflikte: ZielKonflikt[];
} {
  let eigenerKonflikt: EigenerKonflikt | undefined;
  const zielKonflikte: ZielKonflikt[] = [];
  for (const el of xmlKinder(block, 'konflikt')) {
    const gesetz = el.getAttribute('gesetz');
    const wort = liesXmlKonfliktart(el.getAttribute('typ') ?? '');
    if (gesetz !== null) {
      if (!el.hasAttribute('normgeber')) continue;
      const typ =
        wort === 'zielGesetzFehlt' || wort === 'zielNormUnpassend' || wort === 'zielNormFehlt'
          ? wort
          : undefined;
      if (typ)
        zielKonflikte.push({
          gesetz: {
            kurztitel: gesetz,
            normgeber: liesPflichtNormgeber(el.getAttribute('normgeber') ?? undefined),
          },
          typ,
        });
    } else if (
      wort === 'bezugstextFehltOderUnpassend' ||
      wort === 'pauschalerBezugFehlt' ||
      wort === 'pauschalerBezugUnpassend'
    )
      eigenerKonflikt = wort;
  }
  return { eigenerKonflikt, zielKonflikte };
}

function bestimmeSchluesselRest(markierungstyp: string, block: Element): string {
  const zeichenbereich = liesZeichenbereich(xmlKind(block, 'textstelle'), 'zeichenbereich');
  const pfad = parseTextpfad(xmlKind(block, 'textstelle'));
  if (zeichenbereich && pfad)
    return `z:${zeichenbereich[1]}-${zeichenbereich[2]}|${textpfadSchluessel(pfad)}`;
  if (markierungstyp === 'kommentar') return `t:${xmlText(block, 'kommentartext') ?? ''}`;
  return `v:${xmlText(block, 'verweistext') ?? ''}`;
}

export type GespeicherterKonfliktEintrag = GeparsterKonfliktEintrag &
  Pick<KonfliktEintrag, 'ausgangsstelle'> & {
    markierungstyp: string;
  } & Pick<Textpfad, 'bereich'>;

/** Wie beim Markierungsleser werden unbekannte Bereichsangaben ignoriert. */
function parseGespeichertenBereich(block: Element): Textpfad['bereich'] {
  const bereich = xmlText(xmlKind(block, 'textstelle'), 'bereich');
  return liesXmlBereich(bereich);
}

function parseEinzelnenKonfliktBlock(block: Element): GespeicherterKonfliktEintrag | undefined {
  if (
    xmlKinder(block, 'konflikt').some(
      (el) => el.hasAttribute('gesetz') && !el.hasAttribute('normgeber'),
    )
  )
    return undefined;
  const kennung = liesAusgangsstelle(block);
  if (!kennung) return undefined;
  const { eigenerKonflikt, zielKonflikte } = parseZielKonflikteUndEigen(block);
  const tag = block.tagName;
  if (!Object.hasOwn(TYP_VON_TAG, tag)) return undefined;
  const markierungstyp = TYP_VON_TAG[tag];
  if (!markierungstyp) return undefined;
  const textstelle = xmlKind(block, 'textstelle');
  if (
    (textstelle || markierungstyp === 'unterstreichung' || markierungstyp === 'hervorhebung') &&
    (!liesZeichenbereich(textstelle, 'zeichenbereich') || !parseTextpfad(textstelle))
  )
    return undefined;
  const rest = bestimmeSchluesselRest(markierungstyp, block);
  return {
    ...kennung,
    markierungstyp,
    bereich: parseGespeichertenBereich(block),
    eigenerKonflikt,
    zielKonflikte,
    schluessel: `${ausgangsnormSchluessel(kennung)}|${markierungstyp}|${rest}`,
  };
}

export function parseKonfliktEintraege(gesetzBlockRoh: string): GespeicherterKonfliktEintrag[] {
  const gesetz = liesXmlWurzel(gesetzBlockRoh, 'gesetz');
  if (!gesetz.hasAttribute('normgeber')) return [];
  return Array.from(gesetz.children)
    .filter((el) => Object.hasOwn(TYP_VON_TAG, el.tagName))
    .map(parseEinzelnenKonfliktBlock)
    .filter((e): e is GespeicherterKonfliktEintrag => e !== undefined);
}

// Baut EINEN KonfliktEintrag aus einer LIVE geladenen MarkierungsEintrag
// plus bereits berechnetem eigenerKonflikt/zielKonflikte – identische Logik
// wird sowohl beim Neuberechnen in patchReferenzierendesGesetz als auch beim
// 1:1-Übernehmen unveränderter Einträge in patchEigenenEintrag gebraucht
// (zwei echte Anwendungsfälle, siehe Projektkonvention "keine Abstraktion
// ohne zwei echte Anwendungsfälle"), daher hier als gemeinsamer Helfer. Die
// textstelle/kommentarText/verweistext-Aufteilung selbst ist in
// bestimmeIdentifizierendeFelder ausgelagert (dritter echter Anwendungsfall
// dort: pruefeMarkierung und markierungskonflikteAnzeige.ts brauchen exakt
// dieselbe Logik).
function baueKonfliktEintragAusLive(
  live: MarkierungsEintrag,
  eigenerKonflikt: EigenerKonflikt | undefined,
  zielKonflikte: ZielKonflikt[],
): KonfliktEintrag {
  return {
    eigenerKonflikt: eigenerKonflikt || undefined,
    zielKonflikte,
    ausgangsstelle: live.ausgangsstelle,

    markierungstyp: live.typ,
    ...bestimmeIdentifizierendeFelder(live),
  };
}

// 'Eintrag'-Teil von patchReferenzierendesGesetz: berechnet den gepatchten
// KonfliktEintrag für GENAU EINE live geladene MarkierungsEintrag, oder
// undefined, wenn dafür (mehr) kein Konflikt besteht (siehe die beiden
// continue-Fälle im ursprünglichen Funktionskommentar unten).
function patchEinzelnenReferenzierendenEintrag(
  eintrag: MarkierungsEintrag,
  bestehendeNachSchluessel: Map<string, GeparsterKonfliktEintrag>,
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  betroffene: Set<string>,
): KonfliktEintrag | undefined {
  const schluessel = identitaetsSchluessel(eintrag);
  const bestehenderEintrag = bestehendeNachSchluessel.get(schluessel);
  // Zielkonflikte zu ANDEREN (nicht betroffenen) Gesetzen aus dem
  // bestehenden Eintrag unverändert übernehmen, nur die zu `betroffene`
  // werden unten durch das frische Ergebnis ersetzt.
  const zielKonflikteAndere =
    bestehenderEintrag?.zielKonflikte.filter(
      (z) => !betroffene.has(gesetzesreferenzSchluessel(z.gesetz)),
    ) ?? [];
  const zielKonflikteNeu = berechneZielKonflikte(eintrag, eigenesGesetz, alleGesetze, betroffene);

  const eigenerKonflikt = bestehenderEintrag?.eigenerKonflikt;
  const zielKonflikte = [...zielKonflikteAndere, ...zielKonflikteNeu];
  // Weder eigenerKonflikt noch (weder vorher noch jetzt) ein Zielkonflikt:
  // nichts zu tun. Deckt auch den Fall "Eintrag existierte vorher nicht UND
  // zielKonflikteNeu leer" mit ab (dann ist bestehenderEintrag undefined,
  // also eigenerKonflikt zwangsläufig undefined und zielKonflikteAndere leer).
  if (!eigenerKonflikt && zielKonflikte.length === 0) return undefined; // vollständig aufgelöst

  return baueKonfliktEintragAusLive(eintrag, eigenerKonflikt, zielKonflikte);
}

/**
 * Patcht den <gesetz>-Block EINES referenzierenden (selbst NICHT
 * betroffenen) Gesetzes: entfernt aus allen bestehenden Einträgen die
 * Zielkonflikte zu `betroffene` und berechnet sie anhand der aktuell
 * geladenen Markierungen neu – der eigene Konflikt (eigener Bezugskonflikt) sowie
 * Zielkonflikte zu anderen, unveränderten Gesetzen bleiben dabei unangetastet
 * (siehe Absprache). Gibt undefined zurück, wenn danach kein Konflikt mehr
 * übrig bleibt (Block wird dann aus markierungskonflikte.xml entfernt).
 */
export function patchReferenzierendesGesetz(
  rohBlock: string | undefined,
  eintraege: MarkierungsEintrag[],
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  betroffene: Set<string>,
): GesetzKonflikte | undefined {
  // Stryker disable next-line ArrayDeclaration: äquivalent geprüft – der
  // Inhalt des []-Fallbacks wirkt sich nie auf ein beobachtbares Ergebnis
  // aus, da `bestehende` unten nur in `bestehendeNachSchluessel` (keyed by
  // e.schluessel) landet und identitaetsSchluessel() nie undefined liefert.
  const bestehende = rohBlock ? parseKonfliktEintraege(rohBlock) : [];
  const bestehendeNachSchluessel = new Map(bestehende.map((e) => [e.schluessel, e]));
  // nichtamtlicheTitelXmlFehlt wird hier NICHT neu berechnet (dafür bräuchte es u.a.
  // nichtamtlicheTitelVorhanden, was patchReferenzierendesGesetz bewusst
  // nicht bekommt – es geht hier nur um Zielkonflikte zu `betroffene`,
  // siehe Funktionskommentar): der bestehende Zustand bleibt unverändert
  // erhalten, exakt wie eigenerKonflikt pro Eintrag unten.
  const nichtamtlicheTitelXmlFehlt = rohBlock ? parseNichtamtlicheTitelXmlFehlt(rohBlock) : false;

  const neueEintraege: KonfliktEintrag[] = [];
  for (const eintrag of eintraege) {
    const patched = patchEinzelnenReferenzierendenEintrag(
      eintrag,
      bestehendeNachSchluessel,
      eigenesGesetz,
      alleGesetze,
      betroffene,
    );
    if (patched) neueEintraege.push(patched);
  }

  // Bestehende Einträge, zu denen KEINE live geladene Markierung mehr
  // existiert (Markierung wurde zwischenzeitlich gelöscht): deren
  // Zielkonflikte zu `betroffene` sind damit ebenfalls hinfällig – bleiben
  // aber nur relevant, falls sie AUSSCHLIESSLICH `betroffene` betrafen (sonst
  // wären sie oben schon über eine andere, noch existierende Markierung
  // verarbeitet worden). Da die Markierung selbst nicht mehr existiert, kann
  // so ein Eintrag ohnehin nicht mehr korrekt neu gebaut werden (keine
  // aktuelle textstelle verfügbar) – er wird daher schlicht fallengelassen,
  // unabhängig davon, ob er noch unbetroffene Zielkonflikte enthielt.

  if (neueEintraege.length === 0 && !nichtamtlicheTitelXmlFehlt) return undefined;
  return {
    gesetz: {
      kurztitel: eigenesGesetz.kurztitel,
      normgeber: eigenesGesetz.normgeber,
    },
    nichtamtlicheTitelXmlFehlt: nichtamtlicheTitelXmlFehlt || undefined,
    eintraege: neueEintraege,
  };
}

/**
 * Patcht GENAU EINEN Markierungsblock im `<gesetz>`-Block DES EIGENEN
 * Gesetzes (nicht referenzierend, siehe patchReferenzierendesGesetz oben) –
 * für die gezielte Einzeleintrags-Prüfung nach Konfliktaktionen im
 * Markierungskonflikte-Fenster, bei denen genau EIN Eintrag sich geändert hat
 * (siehe markierungskonflikteSpeicher.ts: pruefeEineMarkierungSelektiv). Alle
 * ANDEREN Einträge des Blocks behalten ihren bisherigen Konfliktstatus
 * (eigenerKonflikt/zielKonflikte werden 1:1 aus dem Rohtext übernommen,
 * NICHT neu berechnet) – nur bezeichnung/markierungstyp/textstelle/
 * kommentarText/verweistext müssen aus den LIVE geladenen Einträgen
 * nachgezogen werden, da der Rohtext-Parser diese Felder nicht liefert
 * (siehe GeparsterKonfliktEintrag).
 *
 * Der XML-Schreiber ordnet Überschriften nach Gliederungskennzahl vor Normen;
 * innerhalb der Norm gelten Präfix und Textposition. Die Eingabereihenfolge
 * beeinflusst die gespeicherte Reihenfolge nicht.
 *
 * `geaenderterSchluessel` identifiziert den einzigen Eintrag, der frisch
 * bewertet wird: existiert er noch unter `alleLiveEintraege` (Bearbeiten-
 * Fall, z.B. "Mit aktueller Norm verknüpfen"), wird er über pruefeMarkierung()
 * neu geprüft; existiert er dort nicht mehr (Löschen-Fall – er taucht dann
 * gar nicht erst in der Schleife unten auf), wird sein bisheriger
 * Konflikt-Datensatz automatisch ersatzlos weggelassen, OHNE erneute Prüfung
 * (für eine nicht mehr existierende Markierung gäbe es nichts sinnvoll neu
 * zu bewerten).
 *
 * `nichtamtlicheTitelXmlFehlt` wird IMMER frisch vom Aufrufer übergeben (siehe
 * dort: billige Berechnung über die volle, ohnehin geladene Eintragsliste
 * des Gesetzes) – nichtamtlicheTitelXmlFehlt hängt an ALLEN Markierungen des Gesetzes, nicht
 * nur am gepatchten Einzeleintrag, kann sich also auch bei einer
 * Einzelaktion mit ändern (z.B. letzte Markierung im nichtamtlichen Titel einzeln
 * gelöscht).
 *
 * Gibt undefined zurück, wenn danach kein Konflikt mehr übrig bleibt (Block
 * wird dann aus markierungskonflikte.xml entfernt).
 */
// 'Eintrag'-Teil von patchEigenenEintrag: liefert die (0, 1 oder mehrere)
// KonfliktEintrag-Objekte für GENAU EINE live geladene MarkierungsEintrag –
// entweder frisch geprüft (der eine geänderte Eintrag) oder 1:1 aus dem alten
// Block übernommen (alle anderen, siehe Funktionskommentar unten).
function patchEinzelnenEigenenEintrag(
  live: MarkierungsEintrag,
  geaenderterSchluessel: string,
  bestehendeNachSchluessel: Map<string, GeparsterKonfliktEintrag>,
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  nichtamtlicheTitelVorhanden: Set<string>,
): KonfliktEintrag[] {
  const schluessel = identitaetsSchluessel(live);
  if (schluessel === geaenderterSchluessel) {
    return pruefeMarkierung(live, eigenesGesetz, alleGesetze, nichtamtlicheTitelVorhanden);
  }
  const alt = bestehendeNachSchluessel.get(schluessel);
  if (!alt) return []; // dieser Eintrag hatte bisher gar keinen Konflikt
  return [baueKonfliktEintragAusLive(live, alt.eigenerKonflikt, alt.zielKonflikte)];
}

export function patchEigenenEintrag(
  rohBlock: string | undefined,
  gesetz: Gesetzesreferenz,
  geaenderterSchluessel: string,
  alleLiveEintraege: MarkierungsEintrag[],
  eigenesGesetz: GesetzDarstellung,
  alleGesetze: GesetzDarstellung[],
  nichtamtlicheTitelVorhanden: Set<string>,
  nichtamtlicheTitelXmlFehlt: boolean,
): GesetzKonflikte | undefined {
  // Stryker disable next-line ArrayDeclaration: äquivalent geprüft, siehe
  // Begründung bei der gleichen Konstruktion in patchReferenzierendesGesetz
  // oben.
  const bestehende = rohBlock ? parseKonfliktEintraege(rohBlock) : [];
  const bestehendeNachSchluessel = new Map(bestehende.map((e) => [e.schluessel, e]));

  const neueEintraege: KonfliktEintrag[] = [];
  for (const live of alleLiveEintraege) {
    neueEintraege.push(
      ...patchEinzelnenEigenenEintrag(
        live,
        geaenderterSchluessel,
        bestehendeNachSchluessel,
        eigenesGesetz,
        alleGesetze,
        nichtamtlicheTitelVorhanden,
      ),
    );
  }

  if (neueEintraege.length === 0 && !nichtamtlicheTitelXmlFehlt) return undefined;
  return {
    gesetz,
    nichtamtlicheTitelXmlFehlt: nichtamtlicheTitelXmlFehlt || undefined,
    eintraege: neueEintraege,
  };
}

/** Liest die vollständige Gesetzesreferenz eines Konfliktcontainers. */
export function gesetzesreferenzAusBlock(roh: string): Gesetzesreferenz {
  const el = liesXmlWurzel(roh, 'gesetz');
  return {
    kurztitel: el.getAttribute('kurztitel') ?? '',
    normgeber: liesPflichtNormgeber(el.getAttribute('normgeber') ?? undefined),
  };
}
