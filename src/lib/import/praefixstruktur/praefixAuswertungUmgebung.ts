// praefixAuswertungUmgebung.ts
// Ausschließlich lesender GesetzesXML-Zugriff und atomare Präfixlistenschreibung.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { alleImportindexEintraege } from '@/lib/import/importindex/importindex.index';
import {
  erzeugeArbeitsdateinamen,
  leseArbeitsdateistand,
  leseArbeitsGesetzesXML,
} from '@/lib/import/quelldateien/quelldateien.index';
import type { PraefixAuswertungUmgebung } from './praefixAuswertung';

export function erzeugeTauriPraefixAuswertungUmgebung(): PraefixAuswertungUmgebung {
  const dateinamen = erzeugeArbeitsdateinamen();
  return {
    leseListe: () => rufeBefehl('praefixlauf_datei_lesen'),
    schreibeListe: (xml) => rufeBefehl('praefixlauf_datei_schreiben', { xml }),
    async leseDateistand() {
      const stand = await leseArbeitsdateistand();
      dateinamen.uebernehme(stand);
      return stand;
    },
    leseGesetzesXML: (kurztitel) =>
      leseArbeitsGesetzesXML(dateinamen.fuer('gesetzesxml', kurztitel)),
    ladeKandidaten: alleImportindexEintraege,
    ausgabe: (zeile) => rufeBefehl('praefixlauf_ausgabe', { zeile }),
  };
}
