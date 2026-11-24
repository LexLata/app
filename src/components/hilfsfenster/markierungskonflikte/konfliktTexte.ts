// Reine Texte für Konfliktzeilen, Aktionen und Rückmeldungen im Markierungskonflikte-Fenster.

// Die Textfunktionen benötigen nur die fachlichen Anzeigeangaben, keine UI-Auswahltypen.

import type {
  AnzeigeKonfliktEintrag,
  MarkierungsSchreibErgebnis,
  VerknuepfungsBericht,
  VerknuepfungsZahlen,
} from '@/lib/markierungen/markierungen.index';
import { formatiereFundstelle } from '@/lib/markierungen/markierungen.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { kuerzeAnWortgrenze } from '@/lib/utils/textKuerzung';

type ZielKonfliktAnzeige = AnzeigeKonfliktEintrag['zielKonflikte'][number];
type TextZeilenart =
  | NonNullable<AnzeigeKonfliktEintrag['eigenerKonflikt']>
  | ZielKonfliktAnzeige['typ']
  | 'ausgangsstelleNichtEindeutig'
  | 'zielNormNichtEindeutig';
type TextZielnorm = Pick<ZielKonfliktAnzeige['bezeichnungenAnzeige'][number], 'bezeichnung'>;
interface KonfliktTexte {
  vorschau: string;
  vorschauPunkt: string;
  erlaeuterung: string;
}

function plural(anzahl: number, einzahl: string, mehrzahl: string): string {
  return anzahl === 1 ? einzahl : mehrzahl;
}
function anzahlText(anzahl: number, einzahl: string, mehrzahl: string): string {
  return `${anzahl} ${plural(anzahl, einzahl, mehrzahl)}`;
}
export function verknuepfungsBeschriftung(anzahl: number): string {
  return `Mit ${plural(anzahl, 'aktueller Norm', 'aktuellen Normen')} verknüpfen`;
}
export function entfernungsBeschriftung(anzahl: number): string {
  return `${plural(anzahl, 'Verknüpfung', 'Verknüpfungen')} entfernen`;
}
export function entfernungsBestaetigung(anzahl: number) {
  return {
    titel: entfernungsBeschriftung(anzahl),
    text: `Wenn die markierte Norm nicht mit ${plural(anzahl, 'der Zielnorm', 'den Zielnormen')} verknüpft ist, wird nicht geprüft, ob ${plural(anzahl, 'die Zielnorm sich verändert', 'die Zielnormen sich verändern')}. ${plural(anzahl, 'Verknüpfung', 'Verknüpfungen')} wirklich entfernen?`,
  };
}
const UNVERAENDERT =
  'Keine Verknüpfung geändert; unveränderte oder nicht mehr zuordenbare Markierungen wurden übersprungen.';
const markierungenText = (n: number) => anzahlText(n, 'Markierung', 'Markierungen');
const zieleText = (n: number) => anzahlText(n, 'Zielnorm', 'Zielnormen');
const ausgangText = (n: number) => anzahlText(n, 'Elementstand', 'Elementstände');

/** Nur gespeicherte Änderungen zählen; Fehler und Nachfehler bleiben ausdrücklich sichtbar. */
export function formatiereVerknuepfungsBericht(bericht: VerknuepfungsBericht) {
  const z = bericht.zahlen;
  const meldung =
    z.markierungen > 0
      ? `${ausgangText(z.elementstaende)} und ${zieleText(z.verweisziele)} in ${markierungenText(z.markierungen)} neu verknüpft.`
      : UNVERAENDERT;
  const rest = bericht.unbearbeiteteGesetze.length
    ? ` Noch nicht bearbeitet: ${bericht.unbearbeiteteGesetze.map((g) => g.kurztitel).join(', ')}.`
    : '';
  const fehler =
    bericht.fehler.length > 0
      ? `Die Aktion wurde nicht vollständig abgeschlossen (${bericht.fehler.map((f) => f.gesetz.kurztitel).join(', ')}). Bereits gespeicherte Änderungen bleiben erhalten.${rest} Vorhandene Befunde können überholt sein.`
      : null;
  return { meldung, fehler };
}
export function formatiereEinzelVerknuepfung(
  ergebnis: MarkierungsSchreibErgebnis<VerknuepfungsZahlen>,
  art: 'ausgang' | 'ziel' | 'entfernen',
) {
  if (ergebnis.status === 'fehlgeschlagen')
    return {
      meldung: null,
      fehler: 'Die Änderung konnte nicht gespeichert werden. Vorhandene Befunde bleiben erhalten.',
    };
  const z = ergebnis.ergebnis;
  let meldung = UNVERAENDERT;
  if (ergebnis.status === 'geaendert' && z.markierungen > 0) {
    meldung =
      art === 'ausgang'
        ? `${ausgangText(z.elementstaende)} in ${markierungenText(z.markierungen)} neu verknüpft.`
        : art === 'entfernen'
          ? `${plural(z.verweisziele, 'Verknüpfung', 'Verknüpfungen')} zu ${zieleText(z.verweisziele)} in ${markierungenText(z.markierungen)} entfernt.`
          : `${zieleText(z.verweisziele)} in ${markierungenText(z.markierungen)} neu verknüpft.`;
  }
  const fehler =
    ergebnis.nachgelagerterFehler !== undefined
      ? 'Die anschließende Prüfung oder Synchronisierung ist fehlgeschlagen. Bereits gespeicherte Änderungen bleiben erhalten. Vorhandene Befunde können überholt sein.'
      : null;
  return { meldung, fehler };
}

export function kuerzeVorschautext(text: string): string {
  return kuerzeAnWortgrenze(text, 30);
}

const MARKIERUNG = {
  unterstreichung: ['Unterstreichung', 'die Unterstreichung', 'Unterstrichener Text'],
  hervorhebung: ['Hervorhebung', 'die Hervorhebung', 'Hervorgehobener Text'],
  kommentar: ['Kommentar', 'der Kommentar', 'Kommentierter Text'],
  verweismarkierung: ['Verweis', 'der Verweis', 'Bezugstext des Verweises'],
} as const;

function bereichText(e: AnzeigeKonfliktEintrag): [string, string] {
  if (e.ausgangsstelle.typ === 'ueberschrift')
    return e.bereich === 'bezeichnung'
      ? ['Die Überschriftenbezeichnung', 'die']
      : ['Der Überschriftentitel', 'den'];
  switch (e.bereich) {
    case 'amtlicherTitel':
      return ['Der Normtitel', 'den'];
    case 'nichtamtlicherTitel':
      return ['Der nichtamtliche Titel', 'den'];
    case 'bezeichnung':
      return ['Die Normbezeichnung', 'die'];
    case undefined:
      return ['Der Normtext', 'den'];
  }
}

function bezugErlaeuterung(e: AnzeigeKonfliktEintrag): string {
  const [bereich, pronomen] = bereichText(e);
  const grund = e.bereich === 'nichtamtlicherTitel' ? e.nichtamtlicherTitelGrund : undefined;
  const grundText = {
    normWeggefallen: 'die Norm weggefallen ist',
    normHatAmtlichenTitel: 'die Norm jetzt einen amtlichen Titel hat',
    normNichtImGesetz: 'die Norm nicht mehr im Gesetz vorhanden ist',
  };
  const ende = grund
    ? `wird nicht mehr angezeigt, weil ${grundText[grund]}`
    : 'fehlt oder hat sich verändert';
  const satz1 = `${bereich}, auf ${pronomen} sich ${MARKIERUNG[e.markierungstyp][1]} bezieht, ${ende}.`;
  if (e.bezugstext === undefined) return satz1;
  const fundstelle =
    !e.bereich && !(e.ausgangsstelle.typ === 'ueberschrift') && e.textpfad
      ? formatiereFundstelle(e.textpfad, {
          abkuerzungenAktiv: true,
          ohnePunkt: false,
          roemischeAbsaetze: false,
        })
      : '';
  return `${satz1} Die Markierung bezieht sich auf „${e.bezugstext}“${fundstelle ? ` in ${fundstelle}` : ''}.`;
}

type ZeilenTexte = { konflikt: string; punkt: string; erlaeuterung: string };

function zielTexte(
  e: AnzeigeKonfliktEintrag,
  art: TextZeilenart,
  verweisziele: TextZielnorm[],
  zielgesetz?: Gesetzesreferenz,
): ZeilenTexte {
  const verweis = e.verweistext === undefined ? 'der Verweis' : `der Verweis „${e.verweistext}“`;
  const ziel = formatiereZielVerweisText(
    zielgesetz?.kurztitel ?? '',
    art === 'zielGesetzFehlt' ? [] : verweisziele,
  );
  const anzahl = Math.max(1, verweisziele.length);
  const zieltyp = plural(anzahl, 'Zielnorm', 'Zielnormen');
  const zielangabe = verweisziele.length ? ` ${ziel}` : '';
  let befund: string;
  let erlaeuterung: string;
  if (art === 'zielGesetzFehlt') {
    befund = 'Gesetz nicht auf dem Gerät';
    const wortlaut = e.verweistext === undefined ? '' : ` „${e.verweistext}“`;
    erlaeuterung = `Der Verweis${wortlaut} bezieht sich auf ein Gesetz, das nicht auf dem Gerät ist.`;
  } else if (art === 'zielNormNichtEindeutig') {
    befund = `${zieltyp} nicht eindeutig`;
    erlaeuterung = `${plural(anzahl, 'Zur Zielnorm', 'Zu den Zielnormen')}${zielangabe}, auf die sich ${verweis} bezieht, passen ${plural(anzahl, '', 'jeweils ')}mehrere Normen. Sie ${plural(anzahl, 'kann', 'können')} deshalb nicht neu verknüpft werden.`;
  } else {
    const fehlt = art === 'zielNormFehlt';
    befund = `${zieltyp} ${fehlt ? plural(anzahl, 'fehlt', 'fehlen') : 'verändert'}`;
    const ende = fehlt
      ? plural(anzahl, 'fehlt', 'fehlen')
      : plural(anzahl, 'hat sich verändert', 'haben sich verändert');
    erlaeuterung = `Die ${zieltyp}${zielangabe}, auf die sich ${verweis} bezieht, ${ende}.`;
  }
  return { konflikt: `Verweis auf ${ziel}: ${befund}`, punkt: `${ziel}: ${befund}`, erlaeuterung };
}

function eigeneTexte(e: AnzeigeKonfliktEintrag, art: TextZeilenart): ZeilenTexte {
  const [typ, , texttyp] = MARKIERUNG[e.markierungstyp];
  const ausgang = 'Ausgangsstelle';
  if (art === 'bezugstextFehltOderUnpassend') {
    const text = e.bezugstext === undefined ? '' : ` „${kuerzeVorschautext(e.bezugstext)}“`;
    return {
      konflikt: `${texttyp}${text} verändert`,
      punkt: `${e.markierungstyp === 'verweismarkierung' ? 'Bezugstext' : texttyp}${text} verändert`,
      erlaeuterung: bezugErlaeuterung(e),
    };
  }
  if (art === 'ausgangsstelleNichtEindeutig') {
    const konflikt = `${typ}, ${ausgang} nicht eindeutig`;
    return {
      konflikt,
      punkt: konflikt,
      erlaeuterung:
        e.ausgangsstelle.typ === 'ueberschrift'
          ? 'Zur Ausgangsstelle passen mehrere Überschriften im Gesetz.'
          : `Zur Ausgangsstelle ${e.bezeichnungAnzeige} passen mehrere Normen im Gesetz.`,
    };
  }
  const fehlt = art === 'pauschalerBezugFehlt';
  const konflikt = `${typ}, ${ausgang} ${fehlt ? 'fehlt' : 'verändert'}`;
  return {
    konflikt,
    punkt: konflikt,
    erlaeuterung: `Die ${ausgang}, an der der ${typ} steht, ${fehlt ? 'fehlt' : 'hat sich verändert'}.`,
  };
}

export function konfliktTexte(
  e: AnzeigeKonfliktEintrag,
  art: TextZeilenart,
  verweisziele: TextZielnorm[],
  zielgesetz?: Gesetzesreferenz,
): KonfliktTexte {
  const name =
    e.ausgangsstelle.typ === 'ueberschrift'
      ? kuerzeVorschautext(e.bezeichnungAnzeige)
      : e.bezeichnungAnzeige;
  const texte = zielgesetz ? zielTexte(e, art, verweisziele, zielgesetz) : eigeneTexte(e, art);
  return {
    vorschau: `${name}: ${texte.konflikt}`,
    vorschauPunkt: texte.punkt,
    erlaeuterung: texte.erlaeuterung,
  };
}

/** Gruppiert volle Bezeichnungen für den gemeinsamen Verweistext. */
function formatiereZielVerweisText(gesetzName: string, eintraege: TextZielnorm[]): string {
  if (eintraege.length === 0) return gesetzName;

  const einstufigReihenfolge: string[] = [];
  const einstufigNachPraefix = new Map<string, string[]>();
  const mehrstufigReihenfolge: string[] = [];
  const mehrstufigNachAussen = new Map<string, { praefix: string; zahlen: string[] }>();
  const rohe: string[] = [];

  for (const e of eintraege) {
    const teile = e.bezeichnung
      .trim()
      .match(/^(?:(Art\.?|Artikel)\s*(\d+[a-z]*)\s+)?(.+?)\s*(\d+[a-z]*)$/i);
    if (!teile || /^(?:\d|E\d)/i.test(e.bezeichnung.trim())) {
      rohe.push(e.bezeichnung);
      continue;
    }
    const letzteZahl = teile[4]!;
    const letzterPraefix = teile[3]!.trim();
    if (!teile[1]) {
      if (!einstufigNachPraefix.has(letzterPraefix)) {
        einstufigNachPraefix.set(letzterPraefix, []);
        einstufigReihenfolge.push(letzterPraefix);
      }
      einstufigNachPraefix.get(letzterPraefix)!.push(letzteZahl);
      continue;
    }
    const aussen = `${teile[1]} ${teile[2]}`;
    if (!mehrstufigNachAussen.has(aussen)) {
      mehrstufigNachAussen.set(aussen, { praefix: letzterPraefix, zahlen: [] });
      mehrstufigReihenfolge.push(aussen);
    }
    mehrstufigNachAussen.get(aussen)!.zahlen.push(letzteZahl);
  }

  const symbol = (praefix: string, anzahl: number) =>
    praefix === '§' && anzahl > 1 ? '§§' : praefix;

  const teile: string[] = [];
  for (const praefix of einstufigReihenfolge) {
    const zahlen = einstufigNachPraefix.get(praefix)!;
    teile.push(`${symbol(praefix, zahlen.length)} ${zahlen.join(', ')}`);
  }
  for (const aussen of mehrstufigReihenfolge) {
    const { praefix, zahlen } = mehrstufigNachAussen.get(aussen)!;
    teile.push(`${aussen} ${symbol(praefix, zahlen.length)} ${zahlen.join(', ')}`);
  }
  if (rohe.length > 0) teile.push(rohe.join(', '));

  return `${teile.join(', ')} ${gesetzName}`;
}

export function verweisKopfzeile(e: AnzeigeKonfliktEintrag): string {
  const name =
    e.ausgangsstelle.typ === 'ueberschrift'
      ? kuerzeVorschautext(e.bezeichnungAnzeige)
      : e.bezeichnungAnzeige;
  return `${name}: Verweis${e.verweistext === undefined ? '' : ` „${kuerzeVorschautext(e.verweistext)}“`}:`;
}

export const gesetzFehltTexte = {
  vorschau: 'Gesetz nicht auf dem Gerät',
  erlaeuterung: (kurztitel: string) =>
    `${kurztitel} ist nicht auf diesem Gerät. Markierungen dazu können erst nach einem Import geprüft werden.`,
};
export const nichtamtlicheTitelFehlenTexte = {
  vorschau: 'Nichtamtliche Titel nicht auf dem Gerät',
  erlaeuterung:
    'Die Datei mit den nichtamtlichen Titeln zu diesem Gesetz ist nicht auf diesem Gerät. Markierungen nichtamtlicher Titel können deshalb nicht geprüft werden.',
};
