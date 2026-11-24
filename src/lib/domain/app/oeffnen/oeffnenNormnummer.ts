// oeffnenNormnummer.ts
// Exakte Einzelzahl-Auflösung der Hauptnormen.
import type { NormPraefixFamilie } from '@/lib/domain/basis/normPraefixe';
import type { Suchdaten } from './suchverzeichnis';
import { liegtInSuchbereich } from './suchverzeichnis';
import { berechneId } from '@/lib/domain/norm/norm.index';

export function findeSuchNormnummer(
  eintrag: Suchdaten,
  nummer: string,
  uebrig = false,
  familie?: NormPraefixFamilie,
): string | null {
  const gesucht = nummer.toLowerCase().replace(/\.$/, '');
  let erster: string | null = null;
  for (const norm of eintrag.normen) {
    if (
      (!uebrig || !familie || norm.normPraefixFamilie === familie) &&
      (!uebrig ||
        !eintrag.hatGliederungsartikel ||
        norm.istArtikel ||
        norm.art === 'gliederungsartikel') &&
      norm.normzahlen.length > 0 &&
      (norm.normzahlen.includes(gesucht) || liegtInSuchbereich(norm, gesucht))
    ) {
      // Ohne Gliederungsartikel ist der erste Treffer endgültig; sonst
      // hat ein späterer Artikel weiterhin Vorrang vor dem ersten Paragraphen.
      if (!eintrag.hatGliederungsartikel || norm.istArtikel) return norm.xmlId;
      erster ??= norm.xmlId;
    }
  }
  return erster;
}

export function findeSuchArtikelNorm(
  eintrag: Suchdaten,
  nummer: string,
  artikel: string,
): string | null {
  const suche = berechneId(nummer).toLowerCase();
  const artikelId = berechneId(artikel).toLowerCase();
  const kandidat = `${artikelId}-${suche}`;
  return (
    eintrag.normen.find((norm) => norm.xmlId.toLowerCase() === kandidat)?.xmlId ??
    eintrag.normen.find(
      (norm) =>
        norm.art !== 'gliederungsartikel' &&
        norm.artikelkennzeichen === artikelId &&
        liegtInSuchbereich(norm, suche),
    )?.xmlId ??
    eintrag.normen.find((norm) => norm.xmlId.toLowerCase().startsWith(kandidat))?.xmlId ??
    null
  );
}

/** Kontextsuche verlangt die ganze Normzahl innerhalb genau dieses Gliederungsartikels. */
export function findeSuchArtikelKontextNorm(
  eintrag: Suchdaten,
  nummer: string,
  artikel: string,
): string | null {
  const gesucht = nummer.toLowerCase().replace(/\.$/, '');
  const artikelId = berechneId(artikel).toLowerCase();
  return (
    eintrag.normen.find(
      (norm) =>
        norm.art !== 'gliederungsartikel' &&
        norm.artikelkennzeichen === artikelId &&
        norm.normzahlen.length > 0 &&
        (norm.normzahlen.includes(gesucht) || liegtInSuchbereich(norm, gesucht)),
    )?.xmlId ?? null
  );
}
