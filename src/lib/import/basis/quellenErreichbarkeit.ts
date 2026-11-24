// quellenErreichbarkeit.ts
//
// Eine Erreichbarkeitsprüfung je Importquelle (Normgeber): zentrale Zuordnung
// Normgeber → geprüfte Adresse, damit alle Importwege dieselbe Adresse und
// denselben Fehlertext verwenden. Fehlerverhalten siehe pruefeErreichbarkeit.

import {
  NORMGEBER_DE_BUND,
  NORMGEBER_DE_BW,
  NORMGEBER_EU,
  type ImportindexKategorie,
} from '@/lib/domain/normgeber';
import { pruefeErreichbarkeit } from '@/lib/import/basis/internetVerbindung';

const ERREICHBARKEITS_URL: Record<ImportindexKategorie, string> = {
  [NORMGEBER_DE_BUND]: 'https://www.gesetze-im-internet.de/Teilliste_A.html',
  [NORMGEBER_DE_BW]: 'https://www.landesrecht-bw.de/',
  // Die Portalseite leitet auf op.europa.eu um; geprüft wird der benötigte Cellar-Dienst.
  [NORMGEBER_EU]: 'https://publications.europa.eu/webapi/rdf/sparql?query=ASK%7B%7D',
};

/** Prüft die Quelle des Normgebers; `fehler` enthält den Verbindungstext bei Ausfall. */
export function pruefeQuelleErreichbar(
  normgeber: ImportindexKategorie,
): Promise<{ fehler?: string }> {
  return pruefeErreichbarkeit(ERREICHBARKEITS_URL[normgeber]);
}
