// Reiner Suchvertrag der Importangebote; Importabläufe bleiben im Importmodul.
import type { Normgeber } from './gesetzTypes';
import type { Praefixstruktur } from './praefixstruktur';

export interface ImportindexSucheEintrag {
  /** Ursprünglicher Kurztitel vor der kuratierten Überlagerung; nur für die Suche. */
  abgeleiteterKurztitel?: string;
  alternativen?: string[];
  typ?: string;
  normgeber?: Normgeber;
  kurztitel: string;
  langtitel: string;
  abrufkennung: string;
  praefixstruktur?: Praefixstruktur;
}

/** Einträge eines Importindex ohne weiteren Eintrag mit gleichem Kurztitel und gleicher Abrufkennung.
 * Solche Mehrfacheinträge sind verschiedene Fassungen, von denen sich keine gezielt
 * importieren lässt; sie bleiben im Importindex, werden aber nicht als Importangebot geführt.
 * Verschiedene Kurztitel derselben Abrufkennung (z. B. EU-Kurzbezeichnung neben
 * Fundstelle) führen zum selben Gesetz und bleiben Importangebote. */
export function eindeutigAbrufbareEintraege<
  T extends Pick<ImportindexSucheEintrag, 'kurztitel' | 'abrufkennung'>,
>(eintraege: readonly T[]): T[] {
  const schluessel = (e: T) => `${e.kurztitel}\u0000${e.abrufkennung}`;
  const anzahl = new Map<string, number>();
  for (const e of eintraege) anzahl.set(schluessel(e), (anzahl.get(schluessel(e)) ?? 0) + 1);
  return eintraege.filter((e) => anzahl.get(schluessel(e)) === 1);
}
