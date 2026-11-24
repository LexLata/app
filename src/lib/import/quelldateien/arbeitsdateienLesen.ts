// arbeitsdateienLesen.ts
// Lesender Zugriff auf den Dateistand und vorhandene GesetzesXML im Repository.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

export const leseArbeitsdateistand = () => rufeBefehl('praefixlauf_dateistand');
export async function leseArbeitsGesetzesXML(kurztitel: string): Promise<string> {
  const xml = await rufeBefehl('praefixlauf_arbeitsdatei_lesen', { art: 'gesetzesxml', kurztitel });
  if (xml === null) throw new Error(`${kurztitel}: GesetzesXML fehlt beim Lesen.`);
  return xml;
}

// Der einmal eingelesene Dateistand bleibt die Namensquelle auch nach Löschung:
// erneutes Schreiben verwendet dieselbe physische Schreibweise.
export function erzeugeArbeitsdateinamen() {
  const namen = new Map<string, Map<string, string>>();
  return {
    uebernehme(stand: Awaited<ReturnType<typeof leseArbeitsdateistand>>) {
      for (const [art, titel] of Object.entries({
        quelle: stand.quellen,
        herkunft: stand.quellen,
        gesetzesxml: stand.gesetzesxml,
        original: stand.original,
        konsolidiert: stand.konsolidiert,
      })) {
        const index = new Map<string, string>();
        for (const name of titel ?? []) {
          const schluessel = name.toLowerCase();
          if (index.has(schluessel))
            throw new Error(`Mehrdeutiger Arbeitsdateibestand (${art}): ${name}`);
          index.set(schluessel, name);
        }
        namen.set(art, index);
      }
    },
    fuer(art: string, kurztitel: string) {
      let index = namen.get(art);
      if (!index) {
        index = new Map();
        namen.set(art, index);
      }
      const schluessel = kurztitel.toLowerCase();
      const name = index.get(schluessel) ?? kurztitel;
      index.set(schluessel, name);
      return name;
    },
  };
}
