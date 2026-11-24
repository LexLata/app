// Die drei fachlichen Fälle einer Ausgangsstelle und ihre gemeinsamen Anzeigezugriffe.

export type Ausgangsstelle =
  | { typ: 'norm'; bezeichnung: string }
  | { typ: 'erwaegungsgrund'; bezeichnung: string }
  | { typ: 'ueberschrift'; gliederungskennzahl: string };

/** Bezeichnung oder Gliederungskennzahl zur Anzeige und für vorhandene Textübergaben. */
export function bezeichnungAusgangsstelle(stelle: Ausgangsstelle): string {
  return stelle.typ === 'ueberschrift' ? stelle.gliederungskennzahl : stelle.bezeichnung;
}
