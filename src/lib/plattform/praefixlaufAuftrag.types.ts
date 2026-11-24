// praefixlaufAuftrag.types.ts
// Gemeinsamer Modusvertrag ohne Rückabhängigkeit auf native Befehle.
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import type { ImportindexKategorie } from '@/lib/domain/normgeber';
type Auswahl = { kurztitel?: string[]; debug?: boolean };
export type PraefixlaufAuftrag =
  | (Auswahl & {
      modus: 'praefix';
      normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW;
      anzahl: number;
      gescheitert?: boolean;
      neu?: never;
    })
  | (Auswahl & {
      modus: 'auswerten';
      normgeber: typeof NORMGEBER_DE_BUND | typeof NORMGEBER_DE_BW;
      anzahl?: never;
      gescheitert?: never;
      neu?: never;
    })
  | (Auswahl & {
      modus: 'quelldateien';
      normgeber: ImportindexKategorie;
      anzahl: number;
      gescheitert?: never;
      neu?: true;
    })
  | (Auswahl & {
      modus: 'gesetzesxml';
      normgeber: ImportindexKategorie;
      anzahl: number;
      gescheitert?: never;
      neu?: true;
    });
