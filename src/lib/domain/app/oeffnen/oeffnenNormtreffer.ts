// oeffnenNormtreffer.ts
// Hauptnorm-Auflösung und geordnete Treffer eines einzelnen Gesetzes.
import { ermittleUmfassendenGliederungsartikel } from '@/lib/domain/gesetzHierarchie';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
export interface SucheTrefferNorm {
  xmlId: string;
  bezeichnung: string;
  artikelNummer: string | null;
}
import type { LesbarerSuchverzeichniseintrag } from './suchverzeichnis';
import {
  findeSuchNormnummer,
  findeSuchArtikelNorm,
  findeSuchArtikelKontextNorm,
} from './oeffnenNormnummer';
import { anfrageFuerKurztitel, type Suchanfrage } from './oeffnenAnfrage';

function normziel(
  gesetz: LesbarerSuchverzeichniseintrag,
  xmlId: string | null,
  artikelNummer: string | null,
): SucheTrefferNorm | null {
  if (!xmlId) return null;
  const norm = gesetz.normen.find((norm) => norm.xmlId === xmlId);
  return norm ? { xmlId: norm.xmlId, bezeichnung: norm.bezeichnung, artikelNummer } : null;
}

/** Gemeinsame Suchauflösung; reine Zahleneingaben behalten die strenge Artikelsuche. */
function loeseHauptnormAuf(
  anfrage: Suchanfrage,
  gesetz: LesbarerSuchverzeichniseintrag,
  uebrig = false,
) {
  if (!anfrage.normNummer && !anfrage.erwaegungsgrundNummer) return null;
  const eintrag = gesetz;
  if (anfrage.erwaegungsgrundNummer) {
    const gesucht = `e${anfrage.erwaegungsgrundNummer}`.toLowerCase();
    return normziel(
      gesetz,
      eintrag.normen.find(
        (n) => n.art === 'erwaegungsgrund' && n.bezeichnung.toLowerCase() === gesucht,
      )?.xmlId ?? null,
      null,
    );
  }
  let artikelNummer = anfrage.artikelNummer;
  let nummer = anfrage.normNummer;
  if (!nummer) return null;
  if (eintrag.praefixstruktur === 'ohne-praefix') return null;
  if (artikelNummer) {
    const xmlId = eintrag.hatGliederungsartikel
      ? findeSuchArtikelNorm(eintrag, nummer, artikelNummer)
      : null;
    if (xmlId) return normziel(gesetz, xmlId, artikelNummer);
    if (!anfrage.gesetzQuery) return null;
    nummer = artikelNummer;
    artikelNummer = null;
  }
  return normziel(
    gesetz,
    findeSuchNormnummer(eintrag, nummer, uebrig, anfrage.normPraefix),
    artikelNummer,
  );
}

function nebennormziele(
  anfrage: Suchanfrage,
  gesetz: LesbarerSuchverzeichniseintrag,
  nurErste = false,
): SucheTrefferNorm[] {
  if (
    !anfrage.normNummer ||
    anfrage.normPraefix ||
    anfrage.artikelNummer ||
    anfrage.erwaegungsgrundNummer
  )
    return [];
  const nummer = anfrage.normNummer.toLowerCase().replace(/\.$/, '');
  const ziele: SucheTrefferNorm[] = [];
  for (const norm of gesetz.normen) {
    if (norm.nebennormzahl !== nummer) continue;
    ziele.push({ xmlId: norm.xmlId, bezeichnung: norm.bezeichnung, artikelNummer: null });
    if (nurErste) break;
  }
  return ziele;
}

/** Ein Einzelziel bevorzugt immer die Hauptnorm. */
export function loeseNormzielAuf(
  anfrage: Suchanfrage,
  gesetz: LesbarerSuchverzeichniseintrag,
  gefundenUeber?: string,
) {
  anfrage = anfrageFuerKurztitel(anfrage, gefundenUeber ?? gesetz.kurztitel) ?? anfrage;
  if (!anfrage.normNummer && !anfrage.erwaegungsgrundNummer) return null;
  if (gesetz.praefixstruktur === 'ohne-praefix') return null;
  return loeseHauptnormAuf(anfrage, gesetz) ?? nebennormziele(anfrage, gesetz, true)[0] ?? null;
}

/** Gemeinte Gesetze erhalten alle Nebennormen; übrige erhalten höchstens einen streng passenden Treffer. */
export function bildeNormtreffer(
  anfrage: Suchanfrage,
  gesetz: LesbarerSuchverzeichniseintrag,
  gemeint: boolean,
  gefundenUeber?: string,
  aktivesElementId?: string | null,
  aktivesGesetz?: GesetzDarstellung | null,
) {
  anfrage = anfrageFuerKurztitel(anfrage, gefundenUeber ?? gesetz.kurztitel) ?? anfrage;
  if (!anfrage.normNummer && !anfrage.erwaegungsgrundNummer)
    return [trefferKopf(gesetz, gefundenUeber)];
  if (gesetz.praefixstruktur === 'ohne-praefix')
    return anfrage.gesetzQuery ? [trefferKopf(gesetz, gefundenUeber)] : [];
  let kontextnorm: SucheTrefferNorm | null = null;
  if (
    aktivesGesetz &&
    gemeint &&
    gesetz.hatGliederungsartikel &&
    anfrage.normPraefix === 'paragraph' &&
    anfrage.normNummer &&
    !anfrage.artikelNummer &&
    !anfrage.erwaegungsgrundNummer
  ) {
    const artikel = ermittleUmfassendenGliederungsartikel(aktivesGesetz.elemente, aktivesElementId);
    const artikelNummer = artikel?.bezeichnung.match(/\d+[a-z]?/i)?.[0] ?? null;
    if (artikelNummer)
      kontextnorm = normziel(
        gesetz,
        findeSuchArtikelKontextNorm(gesetz, anfrage.normNummer, artikelNummer),
        artikelNummer,
      );
  }
  const hauptnorm = kontextnorm ?? loeseHauptnormAuf(anfrage, gesetz, !gemeint);
  // Übrige Gesetze brauchen bei einer Hauptnorm keine Nebennormsuche.
  const nebennormen = !gemeint && hauptnorm ? [] : nebennormziele(anfrage, gesetz, !gemeint);
  const normen = gemeint
    ? [...(hauptnorm ? [hauptnorm] : []), ...nebennormen]
    : [hauptnorm ?? nebennormen[0]].filter((norm): norm is SucheTrefferNorm => !!norm);
  if (!normen.length) return [];
  const treffer = trefferKopf(gesetz, gefundenUeber);
  return normen.map((norm) => ({ ...treffer, norm }));
}

function trefferKopf(gesetz: LesbarerSuchverzeichniseintrag, gefundenUeber?: string) {
  return {
    art: 'installiert' as const,
    gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
    langtitel: gesetz.langtitel,
    ...(gefundenUeber ? { gefundenUeber } : {}),
  };
}
