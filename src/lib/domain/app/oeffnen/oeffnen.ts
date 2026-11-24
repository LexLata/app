// oeffnen.ts
// Gemeinsame Gesetzes- und Normsuche mit Importvorschlägen und kuratiertem Normgebervorrang.
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import {
  sortiereNachAnzeige,
  vergleicheNachAnzeige,
  type Anzeigezeitpunkte,
} from './oeffnenAnzeige';

import {
  IMPORTINDEX_KATEGORIEN,
  NORMGEBER_DE_BUND,
  NORMGEBER_DE_BW,
  NORMGEBER_EU,
} from '@/lib/domain/normgeber';
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import { type Praefixstruktur } from '@/lib/domain/praefixstruktur';
import type { Suchverzeichniseintrag, LesbarerSuchverzeichniseintrag } from './suchverzeichnis';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { bildeNormtreffer, type SucheTrefferNorm } from './oeffnenNormtreffer';
export { loeseNormzielAuf } from './oeffnenNormtreffer';
import { filtereUndSortiereNachTitel, vergleicheSuchNormgeber } from './oeffnenTitel';
import { findeGesetz, gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { bereiteImportindexVor } from './oeffnenVorberechnung';
import type { ImportindexSucheEintrag } from '@/lib/domain/importindexSucheEintrag';

import { type Suchname } from './oeffnenNamen';
import { parseSuchanfrage, anfrageFuerKurztitel, type Suchanfrage } from './oeffnenAnfrage';

// Typen

/** Quellengruppe für Suchangebote und Hinweistext; der tatsächliche Normgeber
 * kommt bei Europa-Angeboten aus dem Eintrag. `eu` umfasst CELEX und Bundles. */
export type ImportindexQuelle = ImportindexKategorie;

export const IMPORTINDEX_QUELLE_TEXT: Record<ImportindexQuelle, string> = {
  [NORMGEBER_DE_BUND]: 'gesetze-im-internet.de',
  [NORMGEBER_DE_BW]: 'landesrecht-bw.de',
  [NORMGEBER_EU]: 'eur-lex.europa.eu',
};

/** Ein einzelner Treffer des Öffnen-Overlays: entweder ein bereits installiertes
 *  Gesetz oder ein noch nicht installiertes Importangebot aus den Indizes. */
export type SucheTreffer =
  | {
      art: 'installiert';
      gesetzesreferenz: Gesetzesreferenz;
      langtitel: string;
      gefundenUeber?: string;
      /** Fehlt norm, wird das Gesetz ohne Norm geöffnet. */
      norm?: SucheTrefferNorm;
    }
  | {
      art: 'index';
      eintrag: ImportindexSucheEintrag;
      quelle: ImportindexQuelle;
      gefundenUeber?: string;
    };

type ImportindexEintraege = Record<ImportindexKategorie, ImportindexSucheEintrag[]>;

// Alle Suchanfragen werden nach vollständiger Sortierung auf höchstens 30 Treffer begrenzt.
const MAX_TREFFER = 30;

/** Anzeige eines Importangebots ohne Kenntnis seiner einzelnen Normen. */
export function indexNormAnzeige(
  anfrage: Suchanfrage,
  praefixstruktur?: Praefixstruktur,
  kurztitel?: string,
) {
  if (kurztitel) anfrage = anfrageFuerKurztitel(anfrage, kurztitel) ?? anfrage;
  if (praefixstruktur === 'ohne-praefix') return { normLabel: undefined, artikelNummer: null };
  const artikelNummer =
    anfrage.artikelNummer && praefixstruktur === 'gliederungsartikel'
      ? anfrage.artikelNummer
      : null;
  const nummer = artikelNummer ? anfrage.normNummer : (anfrage.artikelNummer ?? anfrage.normNummer);
  const praefix =
    praefixstruktur === 'artikel' || praefixstruktur === 'gliederungsartikel'
      ? 'Art.'
      : praefixstruktur === 'regel'
        ? 'Regel'
        : praefixstruktur === 'nummer'
          ? 'Nr.'
          : '§';
  return {
    normLabel: nummer ? `${artikelNummer ? '§' : praefix} ${nummer}` : undefined,
    artikelNummer,
  };
}

/** Jede Gesetzesangabe braucht eine Importindexprüfung, auch bei einem importierten Namenstreffer.
 * Andere Normgeber können denselben Kurztitel anbieten; reine Normsuche braucht keinen Importindex. */
export function brauchtImportindexPruefung(suchtext: string): boolean {
  const anfrage = parseSuchanfrage(suchtext);
  // Der Parser kennt noch keine Kurztitel: „2004/38/EG“ kann zunächst als
  // Normnummer erscheinen. Solche Zahlentitel brauchen den Index zur Auflösung.
  return (
    !!anfrage.gesetzQuery ||
    [anfrage.artikelNummer, anfrage.normNummer].some(
      (nummer) => nummer !== null && !/^\d+[a-z]?\.?$/i.test(nummer),
    )
  );
}

// Haupt-Trefferberechnung

/** Das längste bekannte Kurztitelsuffix grenzt den Titel von der Normangabe ab.
 * Exakte Gesetzesangaben stehen vor dem bisherigen Namen-Fallback. */
export function berechneTreffer(
  suchtext: string,
  eintraege: readonly Suchverzeichniseintrag[],
  aktivesGesetz: GesetzDarstellung | null,
  importindexEintraege: ImportindexEintraege | null,
  euDurchfuehrungsaktSuche = false,
  anzeigezeitpunkte?: Anzeigezeitpunkte,
  aktivesElementId?: string | null,
): SucheTreffer[] {
  const gesetze = sortiereNachAnzeige(
    eintraege.filter((e): e is LesbarerSuchverzeichniseintrag => e.status === 'in-ordnung'),
    anzeigezeitpunkte,
  );
  const anzeige = vergleicheNachAnzeige(anzeigezeitpunkte);
  const aktiverEintrag = aktivesGesetz ? findeGesetz(gesetze, aktivesGesetz) : undefined;
  const q = kurztitelVergleichsform(suchtext).trim();
  if (!q)
    return gesetze
      .slice(0, MAX_TREFFER)
      .map((gesetz) => ({ art: 'installiert', ...trefferKopfangaben(gesetz) }));
  const anfrage = parseSuchanfrage(suchtext);
  const vorbereitung = importindexEintraege
    ? IMPORTINDEX_KATEGORIEN.map((quelle) =>
        bereiteImportindexVor(importindexEintraege[quelle], quelle),
      )
    : [];
  const eu = vorbereitung.find((v) => v.kandidaten[0]?.quelle === NORMGEBER_EU);
  const sichtbar = (k: { durchfuehrungsakt: boolean; titel: { kurz: string } }) =>
    euDurchfuehrungsaktSuche || !k.durchfuehrungsakt || k.titel.kurz === q;
  const referenzen = new Set(gesetze.map(gesetzesreferenzSchluessel));
  let laenge = 0;
  let gesetzQuery = anfrage.gesetzQuery;
  const passend = (namen: Suchname[]) => {
    let bester: Suchname | undefined;
    for (const name of namen) {
      const n = name.name.trim().length;
      if (n > (bester?.name.trim().length ?? 0) && anfrageFuerKurztitel(anfrage, name.name))
        bester = name;
    }
    if (bester && bester.name.trim().length > laenge) {
      laenge = bester.name.trim().length;
      gesetzQuery = bester.name;
    }
    return bester;
  };
  const namen = new Map<SucheTreffer, Suchname>();
  const gesetzesnamen = new Map<LesbarerSuchverzeichniseintrag, Suchname>();
  const treffernamen = new Map<string, Suchname>();
  gesetze.forEach((g) => {
    const k =
      g.normgeber === NORMGEBER_EU
        ? eu?.nachReferenz.get(gesetzesreferenzSchluessel(g))
        : undefined;
    const name = passend(k && sichtbar(k) ? k.namen : [{ name: g.kurztitel }]);
    if (name) {
      gesetzesnamen.set(g, name);
      treffernamen.set(gesetzesreferenzSchluessel(g), name);
    }
  });
  const angebote: SucheTreffer[] = [];
  const titel = new Map<SucheTreffer, { kurz: string; lang: string }>();
  sammleIndexangebote(vorbereitung, sichtbar, passend, referenzen, angebote, namen, titel);
  const suchname = (t: SucheTreffer) =>
    t.art === 'installiert'
      ? treffernamen.get(gesetzesreferenzSchluessel(t.gesetzesreferenz))
      : namen.get(t);
  const exakt = (t: SucheTreffer) => suchname(t)?.name.trim().length === laenge;
  const normgeber = (t: SucheTreffer) =>
    t.art === 'installiert' ? t.gesetzesreferenz.normgeber : (t.eintrag.normgeber ?? t.quelle);
  const rang = (a: SucheTreffer, b: SucheTreffer) =>
    vergleicheSuchNormgeber(normgeber(a), normgeber(b), gesetzQuery);
  const exakteInstallierte = gesetze
    .filter((g) => gesetzesnamen.get(g)?.name.trim().length === laenge)
    .sort((a, b) => anzeige(a, b) || vergleicheSuchNormgeber(a.normgeber, b.normgeber, gesetzQuery))
    .flatMap((g) =>
      bildeNormtreffer(
        anfrage,
        g,
        true,
        gesetzesnamen.get(g)?.gefundenUeber,
        g === aktiverEintrag ? aktivesElementId : undefined,
        g === aktiverEintrag ? aktivesGesetz : null,
      ),
    );
  // Vor der Titelrelevanz gilt bei exakten Namen die feste Quellenreihenfolge.
  const quellen = [NORMGEBER_DE_BUND, NORMGEBER_EU, NORMGEBER_DE_BW];
  const exakteAngebote = angebote
    .filter(exakt)
    .sort((a, b) => {
      if (a.art !== 'index' || b.art !== 'index') return 0;
      return quellen.indexOf(a.quelle) - quellen.indexOf(b.quelle);
    })
    .sort(rang);
  const normaleInstallierte = berechneNormUndTitelTreffer(
    suchtext,
    gesetze,
    aktivesGesetz,
    aktiverEintrag,
    anzeige,
    aktivesElementId,
  );
  const normaleAngebote = anfrage.gesetzQuery
    ? filtereUndSortiereNachTitel(
        angebote,
        kurztitelVergleichsform(anfrage.gesetzQuery),
        (t) => titel.get(t) ?? { kurz: '', lang: '' },
        (a, b) => vergleicheSuchNormgeber(normgeber(a), normgeber(b), anfrage.gesetzQuery),
      )
    : [];
  const titelExakt = (t: SucheTreffer) =>
    kurztitelVergleichsform(
      t.art === 'installiert' ? t.gesetzesreferenz.kurztitel : t.eintrag.kurztitel,
    ).trim() === kurztitelVergleichsform(anfrage.gesetzQuery);
  const normal = [
    ...normaleInstallierte.filter(titelExakt),
    ...normaleAngebote.filter(titelExakt),
    ...normaleInstallierte.filter((t) => !titelExakt(t)),
    ...normaleAngebote.filter((t) => !titelExakt(t)),
  ];
  return [...exakteInstallierte, ...exakteAngebote, ...normal.filter((t) => !exakt(t))]
    .slice(0, MAX_TREFFER)
    .map((t) => {
      const name = suchname(t);
      return name?.gefundenUeber ? { ...t, gefundenUeber: name.gefundenUeber } : t;
    });
}

function sammleIndexangebote(
  vorbereitung: ReturnType<typeof bereiteImportindexVor>[],
  sichtbar: (k: ReturnType<typeof bereiteImportindexVor>['kandidaten'][number]) => boolean,
  passend: (namen: Suchname[]) => Suchname | undefined,
  referenzen: Set<string>,
  angebote: SucheTreffer[],
  namen: Map<SucheTreffer, Suchname>,
  titel: Map<SucheTreffer, { kurz: string; lang: string }>,
) {
  for (const v of vorbereitung)
    for (const k of v.kandidaten) {
      if (!sichtbar(k)) continue;
      const name = passend(k.namen);
      if (referenzen.has(k.referenz)) continue;
      const treffer: SucheTreffer = { art: 'index', eintrag: k.eintrag, quelle: k.quelle };
      angebote.push(treffer);
      titel.set(treffer, k.titel);
      if (name) namen.set(treffer, name);
    }
}

/** Exakte Kurztitel stehen vor Teiltreffern, importierte vor namensgleichen Angeboten.
 * Für beide Bestände gilt derselbe Normgebervorrang; weitere Angebote nur im Namen-Fallback.
 * Reine Normsuche bevorzugt das aktive Gesetz, dann alle; Titelrelevanz bleibt erhalten.
 * Wird nur für nicht leere Suchanfragen aufgerufen; die Begrenzung erfolgt im Aufrufer. */
function berechneNormUndTitelTreffer(
  suchtext: string,
  gesetze: LesbarerSuchverzeichniseintrag[],
  aktivesGesetz: GesetzDarstellung | null,
  aktiverEintrag: LesbarerSuchverzeichniseintrag | undefined,
  anzeige: (a: Gesetzesreferenz, b: Gesetzesreferenz) => number,
  aktivesElementId?: string | null,
): SucheTreffer[] {
  const q = suchtext.trim();

  const anfrage = parseSuchanfrage(q);
  const gesetzQ = kurztitelVergleichsform(anfrage.gesetzQuery);
  // Reine Zahlen-/Erwägungsgrund-Eingabe ohne Gesetzesangabe (z.B. „433",
  // „229 3" oder „e1"): primär nur im aktiven Gesetz, Fallback auf alle
  // Gesetze siehe unten.
  const nurZahlModus =
    !gesetzQ &&
    (anfrage.normNummer !== null ||
      anfrage.artikelNummer !== null ||
      anfrage.erwaegungsgrundNummer !== null);

  let kandidaten: LesbarerSuchverzeichniseintrag[];

  if (!gesetzQ) {
    // Keine Gesetzesangabe → bei reiner Zahlen-Suche zunächst nur das aktive
    // Gesetz (Fallback auf alle Gesetze weiter unten). Ist kein Gesetz aktiv
    // (leerer Tab) oder ist gar keine Zahl angegeben, sofort alle Gesetze.
    kandidaten = nurZahlModus && aktiverEintrag ? [aktiverEintrag] : gesetze;
  } else {
    kandidaten = filtereUndSortiereNachTitel(
      gesetze,
      gesetzQ,
      (g) => ({
        kurz: kurztitelVergleichsform(g.kurztitel).trim(),
        lang: kurztitelVergleichsform(g.langtitel),
      }),
      (a, b) => vergleicheSuchNormgeber(a.normgeber, b.normgeber, gesetzQ),
      anzeige,
    );
  }

  const suche = (liste: LesbarerSuchverzeichniseintrag[], gemeint: boolean): SucheTreffer[] =>
    liste.flatMap((g) =>
      bildeNormtreffer(
        anfrage,
        g,
        gemeint || kurztitelVergleichsform(g.kurztitel).trim() === gesetzQ,
        undefined,
        g === aktiverEintrag ? aktivesElementId : undefined,
        g === aktiverEintrag ? aktivesGesetz : null,
      ),
    );
  const treffer = suche(kandidaten, nurZahlModus && !!aktiverEintrag);
  // Nur ein tatsächlicher Treffer im aktiven Gesetz verhindert den Rückfall.
  return nurZahlModus && aktiverEintrag && treffer.length === 0 ? suche(gesetze, false) : treffer;
}

function trefferKopfangaben(gesetz: { kurztitel: string; normgeber: string; langtitel: string }) {
  return {
    gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
    langtitel: gesetz.langtitel,
  };
}
