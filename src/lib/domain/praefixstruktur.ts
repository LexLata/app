// praefixstruktur.ts
// Bestimmt aus dem Darstellungsmodell die Präfixstruktur für die Vorschau noch nicht importierter Gesetze.
import { normTextLaenge } from './gesetzDarstellungAuswertung';
import type { GesetzDarstellung, NormDarstellung } from './gesetzTypes';
import { normPraefixQuelle, type NormPraefixFamilie } from './basis/normPraefixe';

export type Praefixstruktur =
  | Exclude<NormPraefixFamilie, 'canon'>
  | 'gliederungsartikel'
  | 'regel'
  | 'nummer'
  | 'arabisch'
  | 'alphabetisch'
  | 'roemisch'
  | 'ohne-praefix'
  | 'artikel-und-paragraphen'
  | 'unklar';
// Automatisch feststellbare Befunde; keine Behauptung über Ursachen in der Quelle.
export const praefixstrukturDiagnosegruende = {
  'keine-elemente': 'Keine Elemente im Darstellungsmodell',
  'nur-ueberschriften': 'Nur Überschriften im Darstellungsmodell',
  'keine-zaehlbaren-normen': 'Nur ausgeschlossene Normen oder Erwägungsgründe',
  'unbezeichnete-normen': 'Die zählbaren Normen haben keine Bezeichnung',
  'nur-sonstige-bezeichnungen': 'Keine unterstützten Normbezeichnungen',
  'gemischte-praefixe': 'Gemischte Präfixe unterhalb der 90-Prozent-Schwelle',
  'sonstige-bezeichnungen': 'Sonstige Bezeichnungen verhindern die 90-Prozent-Schwelle',
} as const;
export type PraefixstrukturDiagnosegrund = keyof typeof praefixstrukturDiagnosegruende;
type Ergebnis =
  | { ermittlungsstatus: 'leer'; praefixstruktur?: never; diagnosegrund?: never }
  | {
      ermittlungsstatus?: never;
      praefixstruktur: Exclude<Praefixstruktur, 'unklar'>;
      diagnosegrund?: never;
    }
  | {
      ermittlungsstatus?: never;
      praefixstruktur: 'unklar';
      diagnosegrund: PraefixstrukturDiagnosegrund;
    };
const ausgeschlossen =
  /^(?:Anlagen?|Anhang|Muster|Formblatt|Tabelle|Eingangsformel|Schlussformel|Schlußformel|Inhaltsübersicht|Inhaltsverzeichnis|Präambel|Vorspruch)(?![\p{L}\p{N}_])/iu;
// Vollständige römische Zahlen von I bis MMMCMXCIX, mit optionalem Schlusspunkt.
// Nur Dateneinordnung; die gemeinsame Such- und Zitiergrammatik bleibt unverändert.
const roemischeZahl =
  '(?=[MDCLXVI])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})\\.?';
const roemisch = new RegExp(`^${roemischeZahl}(?: und ${roemischeZahl})?$`);
// Beide Verbraucher umfassen zusammen sämtliche Artikel-Schreibweisen der Tabelle.
const artikel = new RegExp(
  `^(?:${normPraefixQuelle('zitat', 'artikel')}|${normPraefixQuelle('tagger', 'artikel')})(?=\\s|\\d|$)`,
  'i',
);

// A. und B. belegen gemeinsam eine alphabetische Folge. Einmal je Modell
// ermitteln, damit die Einordnung der einzelnen Normen konstanten Aufwand hat.
export function hatAlphabetischenKontext(
  normen: readonly Pick<NormDarstellung, 'bezeichnung' | 'art'>[],
): boolean {
  return ['A.', 'B.'].every((name) =>
    normen.some((n) => n.art !== 'erwaegungsgrund' && n.bezeichnung.trim() === name),
  );
}

// Gemeinsame Einordnung für die Ermittlung und die lokale Ursachendiagnose.
export function ordnePraefixstrukturNormEin(
  norm: Pick<NormDarstellung, 'bezeichnung' | 'art'>,
  alphabetischerKontext = false,
):
  | 'paragraph'
  | 'artikel'
  | 'regel'
  | 'nummer'
  | 'arabisch'
  | 'alphabetisch'
  | 'roemisch'
  | 'ausgeschlossen'
  | 'erwaegungsgrund'
  | 'sonstige' {
  if (norm.art === 'erwaegungsgrund') return 'erwaegungsgrund';
  const bezeichnung = norm.bezeichnung.trim();
  if (ausgeschlossen.test(bezeichnung)) return 'ausgeschlossen';
  if (bezeichnung.startsWith('§')) return 'paragraph';
  if (artikel.test(bezeichnung)) return 'artikel';
  if (/^Regel\s+\d/i.test(bezeichnung)) return 'regel';
  if (/^Nr\.?\s+\d/i.test(bezeichnung)) return 'nummer';
  if (/^\d+[a-z]?\.(?: bis \d+[a-z]?\.)?$/.test(bezeichnung)) return 'arabisch';
  // Nur im belegten alphabetischen Kontext werden C./D. umgeordnet.
  if (alphabetischerKontext && /^[A-D]\.$/.test(bezeichnung)) return 'alphabetisch';
  if (roemisch.test(bezeichnung)) return 'roemisch';
  return 'sonstige';
}

function diagnosegrund(fakten: {
  elemente: number;
  normen: number;
  gezaehlt: number;
  familien: number;
  unbezeichnet: number;
}): PraefixstrukturDiagnosegrund {
  if (fakten.elemente === 0) return 'keine-elemente';
  if (fakten.normen === 0) return 'nur-ueberschriften';
  if (fakten.gezaehlt === 0) return 'keine-zaehlbaren-normen';
  if (fakten.unbezeichnet === fakten.gezaehlt) return 'unbezeichnete-normen';
  if (fakten.familien === 0) return 'nur-sonstige-bezeichnungen';
  if (fakten.familien > 1) return 'gemischte-praefixe';
  return 'sonstige-bezeichnungen';
}

function zaehleNormen(gesetz: GesetzDarstellung) {
  const anzahl = {
    arabisch: 0,
    alphabetisch: 0,
    paragraph: 0,
    artikel: 0,
    roemisch: 0,
    regel: 0,
    nummer: 0,
    sonstige: 0,
  };
  let normen = 0;
  let unbezeichnet = 0;
  let ohnePraefix = 0;
  let ausnahmen = 0;
  const alphabetischerKontext = hatAlphabetischenKontext(
    gesetz.elemente.flatMap((el) => (el.typ === 'norm' ? [el.data] : [])),
  );
  for (const element of gesetz.elemente) {
    if (element.typ !== 'norm') continue;
    normen++;
    const einordnung = ordnePraefixstrukturNormEin(element.data, alphabetischerKontext);
    if (einordnung === 'ausgeschlossen') ausnahmen++;
    if (einordnung === 'ausgeschlossen' || einordnung === 'erwaegungsgrund') continue;
    anzahl[einordnung]++;
    const bezeichnung = element.data.bezeichnung.trim();
    if (!bezeichnung) unbezeichnet++;
    if (bezeichnung === 'Einziger Paragraph' || (!bezeichnung && normTextLaenge(element.data) > 0))
      ohnePraefix++;
  }
  return { anzahl, normen, unbezeichnet, ohnePraefix, ausnahmen };
}

export function ermittlePraefixstruktur(gesetz: GesetzDarstellung): Ergebnis {
  if (gesetz.hatGliederungsartikel) return { praefixstruktur: 'gliederungsartikel' };
  if (gesetz.elemente.length === 0) return { ermittlungsstatus: 'leer' };
  const { anzahl, normen, unbezeichnet, ohnePraefix, ausnahmen } = zaehleNormen(gesetz);
  const gezaehlt = Object.values(anzahl).reduce((summe, n) => summe + n, 0);
  if (anzahl.artikel > 0 && anzahl.paragraph > 0)
    return { praefixstruktur: 'artikel-und-paragraphen' };
  if ((normen > 0 && ausnahmen === normen) || (gezaehlt > 0 && ohnePraefix === gezaehlt))
    return { praefixstruktur: 'ohne-praefix' };
  const familien = [
    'paragraph',
    'artikel',
    'roemisch',
    'regel',
    'nummer',
    'arabisch',
    'alphabetisch',
  ] as const;
  for (const praefixstruktur of familien) {
    if (gezaehlt > 0 && 10 * anzahl[praefixstruktur] >= 9 * gezaehlt) return { praefixstruktur };
  }
  return {
    praefixstruktur: 'unklar',
    diagnosegrund: diagnosegrund({
      elemente: gesetz.elemente.length,
      normen,
      gezaehlt,
      unbezeichnet,
      familien: familien.filter((familie) => anzahl[familie] > 0).length,
    }),
  };
}
