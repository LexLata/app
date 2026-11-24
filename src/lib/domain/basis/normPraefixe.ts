// Gemeinsame Schreibweisen der Normpräfixe. Verbraucher wählen ihren bisherigen
// Erkennungsumfang; zusätzliche Canon-Schreibweisen ändern keine §-/Art.-Grammatik.
export type NormPraefixFamilie = 'paragraph' | 'artikel' | 'canon';

type Verbraucher = 'aufloesung' | 'abstand' | 'tagger' | 'zitat';
interface Schreibweise {
  text: string;
  familie: NormPraefixFamilie;
  plural: boolean;
  verbraucher: readonly Verbraucher[];
}

const alle: readonly Verbraucher[] = ['aufloesung', 'abstand', 'tagger', 'zitat'];
const tabelle: readonly Schreibweise[] = [
  { text: '§', familie: 'paragraph', plural: false, verbraucher: alle },
  { text: '§§', familie: 'paragraph', plural: true, verbraucher: ['abstand', 'tagger', 'zitat'] },
  {
    text: 'Art.',
    familie: 'artikel',
    plural: false,
    verbraucher: ['aufloesung', 'abstand', 'zitat'],
  },
  {
    text: 'Art',
    familie: 'artikel',
    plural: false,
    verbraucher: ['aufloesung', 'abstand', 'zitat'],
  },
  { text: 'Artikel', familie: 'artikel', plural: false, verbraucher: alle },
  { text: 'Artt', familie: 'artikel', plural: true, verbraucher: ['zitat'] },
  { text: 'Artikels', familie: 'artikel', plural: false, verbraucher: ['tagger'] },
  { text: 'Artikeln', familie: 'artikel', plural: true, verbraucher: ['tagger'] },
  ...['can.', 'canon', 'c.', 'Kan.', 'Kanon'].map((text): Schreibweise => ({
    text,
    familie: 'canon',
    plural: false,
    verbraucher: alle,
  })),
  ...['cann.', 'canons', 'canones', 'cc.', 'Kanones'].map((text): Schreibweise => ({
    text,
    familie: 'canon',
    plural: true,
    verbraucher: alle,
  })),
];

export function familieVonText(text: string): NormPraefixFamilie | undefined {
  return tabelle.find((eintrag) => eintrag.text.toLowerCase() === text.trim().toLowerCase())
    ?.familie;
}

export function kanonischesPraefix(familie: NormPraefixFamilie): string {
  return { paragraph: '§', artikel: 'Art.', canon: 'Can.' }[familie];
}

/** Regex-Quelle ohne Flags/Anker; längere Aliase zuerst, ohne Capture-Gruppen.
 * c./cc. benötigen am Einsatzort eine folgende Normzahl. Canon-Grammatik
 * aktivieren Tagger/Zitatparser erst anhand ihres jeweiligen Gesetzesprofils. */
export function normPraefixQuelle(
  verbraucher: Verbraucher,
  familie?: NormPraefixFamilie,
  plural?: boolean,
): string {
  const texte = tabelle
    .filter(
      (eintrag) =>
        eintrag.verbraucher.includes(verbraucher) &&
        (!familie || eintrag.familie === familie) &&
        (plural === undefined || eintrag.plural === plural),
    )
    .map((eintrag) => eintrag.text)
    .sort((a, b) => b.length - a.length)
    .map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return `(?:${texte.join('|')})`;
}
