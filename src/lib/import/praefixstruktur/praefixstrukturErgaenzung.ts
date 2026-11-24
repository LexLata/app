// praefixstrukturErgaenzung.ts
// Liest die mitgelieferte Liste ohne Cache und ergänzt das Importangebot.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import { exists, readTextFile } from '@tauri-apps/plugin-fs';
import { ressourcenPfad } from '@/lib/plattform/dateipfade';
import type {
  ImportindexKategorie,
  ImportindexSucheEintrag,
} from '@/lib/import/importindex/importindex.index';
import { liesPraefixstrukturXml } from './praefixstrukturXml';

/** Nur eine erfolgreich gelesene gültige Ressource gilt als vollständig. */
export async function ergaenzePraefixstrukturMitDiagnose(
  normgeber: ImportindexKategorie,
  eintraege: ImportindexSucheEintrag[],
): Promise<{ eintraege: ImportindexSucheEintrag[]; vollstaendig: boolean }> {
  try {
    const pfad = await ressourcenPfad(`resources/praefixstrukturen/${normgeber}.xml`);
    if (!(await exists(pfad))) throw new Error(`Erforderliche Ressource fehlt: ${pfad}`);
    const liste = liesPraefixstrukturXml(
      await readTextFile(pfad),
      normgeber === NORMGEBER_DE_BUND ? NORMGEBER_DE_BUND : NORMGEBER_DE_BW,
    );
    const nachKurztitel = new Map(
      liste.eintraege
        .filter((e) => e.ermittlungsstatus === undefined)
        .map(({ kurztitel, praefixstruktur }) => [kurztitel.toLowerCase(), praefixstruktur]),
    );
    return {
      vollstaendig: true,
      eintraege: eintraege.map((eintrag) => {
        const praefixstruktur = nachKurztitel.get(eintrag.kurztitel.toLowerCase());
        return praefixstruktur === undefined ? eintrag : { ...eintrag, praefixstruktur };
      }),
    };
  } catch (fehler) {
    console.error(`PräfixstrukturXML ${normgeber} konnte nicht gelesen werden:`, fehler);
    return { eintraege, vollstaendig: false };
  }
}
