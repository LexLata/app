// Unterscheidet gespeicherte Markierungen und aus dem Gesetz-XML abgeleitete Verweise.
import type { GetaggterVerweis } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/markierungen.index';

export type Textauszeichnung =
  | { typ: 'markierung'; markierung: MarkierungsEintrag }
  | { typ: 'getaggterVerweis'; verweis: GetaggterVerweis };

/** Klickziele behalten die jeweilige fachliche Zielbeschreibung. */
export type VerweisKlickziel =
  | Verweisziel
  | {
      typ: 'getaggterVerweis';
      zielBezeichnung: GetaggterVerweis['zielBezeichnung'];
      zielgesetz?: GetaggterVerweis['zielgesetz'];
    };
