// useTextDarstellung.ts
// Globale gespeicherte Textpräferenzen und Synchronisierung; Anwendung erfolgt lokal in den Ansichten.

import {
  SCHRIFT_KEY,
  LEISTEN_SCHRIFT_KEY,
  SCHRIFTART_KEY,
  ZEILENABSTAND_KEY,
  BLOCKSATZ_KEY,
  SATZ_NEU_ZEILE_KEY,
  SILBENTRENNUNG_KEY,
  RANDBREITE_KEY,
  STRUKTURKONTEXTLEISTE_GROESSE_KEY,
  LESBARE_ZEILENLAENGE_KEY,
  LESBARE_ZEILENLAENGE_BREITE_KEY,
} from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

// Die gemeinsamen Speicherschlüssel liegen unter lib/einstellungen;
// Export, Import und Reset verwenden dieselben Adressen ohne die
// Zeichenketten dort ein zweites Mal zu deklarieren (siehe dortiger
// Kopfkommentar).

import {
  type LesbareZeilenlaengeBreite,
  type Randbreite,
  type Skalierungsstufe,
  type Schriftart,
  SCHRIFTGROESSE_DEFAULT,
  LEISTEN_SCHRIFT_DEFAULT,
  SCHRIFTART_DEFAULT,
  ZEILENABSTAND_DEFAULT,
  SILBENTRENNUNG_DEFAULT,
  BLOCKSATZ_DEFAULT,
  SATZ_NEU_ZEILE_DEFAULT,
  RANDBREITE_DEFAULT,
  STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT,
  LESBARE_ZEILENLAENGE_DEFAULT,
  LESBARE_ZEILENLAENGE_BREITE_DEFAULT,
} from '@/lib/stil/gesetzTextDarstellung';

export function useTextDarstellung() {
  const [schriftgroesse, setSchriftgroesse] = useLocalStorageState<number>(
    SCHRIFT_KEY,
    SCHRIFTGROESSE_DEFAULT,
    { parse: Number },
  );
  const [leistenSchriftgroesse, setLeistenSchriftgroesse] = useLocalStorageState<number>(
    LEISTEN_SCHRIFT_KEY,
    LEISTEN_SCHRIFT_DEFAULT,
    { parse: Number },
  );
  const [schriftart, setSchriftart] = useLocalStorageState<Schriftart>(
    SCHRIFTART_KEY,
    SCHRIFTART_DEFAULT,
    { parse: (roh) => roh as Schriftart },
  );
  const [zeilenabstand, setZeilenabstand] = useLocalStorageState<number>(
    ZEILENABSTAND_KEY,
    ZEILENABSTAND_DEFAULT,
    { parse: Number },
  );

  const [satzNeuZeile, setSatzNeuZeile] = useLocalStorageState<boolean>(
    SATZ_NEU_ZEILE_KEY,
    SATZ_NEU_ZEILE_DEFAULT,
    { parse: (roh) => roh === 'true' },
  );

  const [blocksatz, setBlocksatz] = useLocalStorageState<boolean>(
    BLOCKSATZ_KEY,
    BLOCKSATZ_DEFAULT,
    {
      parse: (roh) => roh === 'true',
    },
  );

  const [silbentrennung, setSilbentrennung] = useLocalStorageState<boolean>(
    SILBENTRENNUNG_KEY,
    SILBENTRENNUNG_DEFAULT,
    { parse: (roh) => roh === 'true' },
  );

  const [randbreite, setRandbreite] = useLocalStorageState<Randbreite>(
    RANDBREITE_KEY,
    RANDBREITE_DEFAULT,
    { parse: (roh) => roh as Randbreite },
  );

  const [strukturKontextLeisteGroesse, setStrukturKontextLeisteGroesse] =
    useLocalStorageState<Skalierungsstufe>(
      STRUKTURKONTEXTLEISTE_GROESSE_KEY,
      STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT,
      { parse: (roh) => roh as Skalierungsstufe },
    );

  const [lesbareZeilenlaenge, setLesbareZeilenlaenge] = useLocalStorageState<boolean>(
    LESBARE_ZEILENLAENGE_KEY,
    LESBARE_ZEILENLAENGE_DEFAULT,
    { parse: (roh) => roh === 'true' },
  );

  const [lesbareZeilenlaengeBreite, setLesbareZeilenlaengeBreite] =
    useLocalStorageState<LesbareZeilenlaengeBreite>(
      LESBARE_ZEILENLAENGE_BREITE_KEY,
      LESBARE_ZEILENLAENGE_BREITE_DEFAULT,
      { parse: (roh) => roh as LesbareZeilenlaengeBreite },
    );

  return {
    schriftgroesse,
    setSchriftgroesse,
    leistenSchriftgroesse,
    setLeistenSchriftgroesse,
    schriftart,
    setSchriftart,
    zeilenabstand,
    setZeilenabstand,
    satzNeuZeile,
    setSatzNeuZeile,
    blocksatz,
    setBlocksatz,
    silbentrennung,
    setSilbentrennung,
    randbreite,
    setRandbreite,
    strukturKontextLeisteGroesse,
    setStrukturKontextLeisteGroesse,
    lesbareZeilenlaenge,
    setLesbareZeilenlaenge,
    lesbareZeilenlaengeBreite,
    setLesbareZeilenlaengeBreite,
  };
}
