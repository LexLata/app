// oeffnenVorberechnung.ts
// Abgeleitete Indexdaten gelten ausschließlich für die Identität ihres Quellarrays.
import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import {
  eindeutigAbrufbareEintraege,
  type ImportindexSucheEintrag,
} from '@/lib/domain/importindexSucheEintrag';
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { istDurchfuehrungsakt } from '@/lib/domain/euRechtsakt';
import { suchnamenFuerEintrag } from './oeffnenNamen';

export function bereiteImportindexVor(
  eintraege: ImportindexSucheEintrag[],
  quelle: ImportindexKategorie,
) {
  let nachQuelle = vorbereitungen.get(eintraege);
  if (!nachQuelle) {
    nachQuelle = new Map();
    vorbereitungen.set(eintraege, nachQuelle);
  }
  const vorhanden = nachQuelle.get(quelle);
  if (vorhanden) return vorhanden;
  const kandidaten = eindeutigAbrufbareEintraege(eintraege).map((eintrag) => ({
    eintrag,
    quelle,
    normgeber: quelle === NORMGEBER_EU ? (eintrag.normgeber ?? quelle) : quelle,
    referenz: gesetzesreferenzSchluessel({
      kurztitel: eintrag.kurztitel.trim(),
      normgeber: eintrag.normgeber ?? quelle,
    }),
    titel: {
      kurz: kurztitelVergleichsform(eintrag.kurztitel).trim(),
      lang: kurztitelVergleichsform(eintrag.langtitel),
    },
    namen: suchnamenFuerEintrag(eintrag, quelle),
    durchfuehrungsakt: quelle === NORMGEBER_EU && istDurchfuehrungsakt(eintrag.typ),
  }));
  const nachReferenz = new Map<string, (typeof kandidaten)[number]>();
  for (const kandidat of kandidaten) {
    const referenz = gesetzesreferenzSchluessel({
      kurztitel: kandidat.eintrag.kurztitel,
      normgeber: kandidat.eintrag.normgeber ?? quelle,
    });
    if (!nachReferenz.has(referenz)) nachReferenz.set(referenz, kandidat);
  }
  const ergebnis = { kandidaten, nachReferenz };
  nachQuelle.set(quelle, ergebnis);
  return ergebnis;
}
type Vorbereitung = {
  kandidaten: {
    eintrag: ImportindexSucheEintrag;
    quelle: ImportindexKategorie;
    normgeber: string;
    referenz: string;
    titel: { kurz: string; lang: string };
    namen: ReturnType<typeof suchnamenFuerEintrag>;
    durchfuehrungsakt: boolean;
  }[];
  nachReferenz: Map<string, Vorbereitung['kandidaten'][number]>;
};
const vorbereitungen = new WeakMap<
  ImportindexSucheEintrag[],
  Map<ImportindexKategorie, Vorbereitung>
>();
