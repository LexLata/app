// meldungsgliederung.ts
// Gemeinsame Gliederung von Ergebnis- und Fehlermeldungen (Importbericht,
// später Banner). Reine Funktion ohne Anzeigebezug: Sie ordnet Einträge nach
// Kategorie und Gruppe (Aktion bzw. Grund), zählt die sichtbaren Einträge und
// wählt danach Satz- oder Gliederungsform. Die Darstellung übernimmt
// MeldungsgliederungAnzeige.

/** Feste Reihenfolge und Überschriften der Gruppen einer Kategorie. */
export interface Gliederungsgruppe {
  schluessel: string;
  /** Überschrift abhängig von der Anzahl (Singular bei 1). */
  ueberschrift: (anzahl: number) => string;
  /** Satzform der Gruppe (Namen ohne Detail); ohne Angabe „<Überschrift>: <Namen>.“
   *  Ein Detail hängt die Gliederung in Klammern an das Satzende. */
  satz?: (aufzaehlung: string, anzahl: number) => string;
}

export interface Gliederungskategorie {
  schluessel: string;
  ueberschrift: string;
  gruppen: readonly Gliederungsgruppe[];
}

/** Ein Betroffener (Gesetz, Datei …) in einer Gruppe oder ein allgemeiner
 *  Satz. Sätze mit Kategorie stehen am Ende dieser Kategorie, ohne Kategorie
 *  vor allen Kategorien. Beide zählen je als ein sichtbarer Eintrag. */
export type Gliederungseintrag =
  | {
      kategorie: string;
      gruppe: string;
      name: string;
      hinweise?: readonly string[];
      detail?: string;
    }
  | { kategorie?: string; satz: string };

export interface GegliederterName {
  name: string;
  hinweise: string[];
  /** Nur gesetzt, wenn die Gruppe genau einen Eintrag hat. */
  detail?: string;
}

export interface GegliederteGruppe {
  schluessel: string;
  ueberschrift: string;
  anzahl: number;
  namen: GegliederterName[];
  /** Die Gruppe als ein Satz (für die Satzform). */
  satz: string;
}

export interface GegliederteKategorie {
  schluessel: string;
  ueberschrift: string;
  gruppen: GegliederteGruppe[];
  saetze: string[];
}

export interface Meldungsgliederung {
  form: 'saetze' | 'gliederung';
  allgemein: string[];
  kategorien: GegliederteKategorie[];
  /** Alle sichtbaren Einträge (Namen in Gruppen und Sätze). */
  anzahl: number;
}

/** „AAG, BGB und StGB“ */
function zaehleAuf(teile: readonly string[]): string {
  return new Intl.ListFormat('de', { style: 'long', type: 'conjunction' }).format(teile);
}

/** Name mit Hinweisen in Klammern und ggf. Detail nach Doppelpunkt. */
export function formatiereGegliedertenNamen(n: GegliederterName): string {
  const hinweise = n.hinweise.length ? ` (${n.hinweise.join('; ')})` : '';
  return `${n.name}${hinweise}${n.detail ? `: ${n.detail}` : ''}`;
}

type NamensEintrag = Extract<Gliederungseintrag, { name: string }>;

/** Namen einer Gruppe in Eingangsreihenfolge, Duplikate einmal; Detail nur bei
 *  genau einem Namen. */
function sammleNamen(eintraege: readonly NamensEintrag[]): GegliederterName[] {
  const namen: { name: string; hinweise: string[]; detail?: string }[] = [];
  const gesehen = new Set<string>();
  for (const e of eintraege) {
    const hinweise = [...(e.hinweise ?? [])];
    const schluessel = JSON.stringify([e.name, hinweise]);
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    namen.push({ name: e.name, hinweise, detail: e.detail });
  }
  return namen.map(({ detail, ...n }) => (namen.length === 1 && detail ? { ...n, detail } : n));
}

function gliedereGruppe(
  gruppe: Gliederungsgruppe,
  eintraege: readonly NamensEintrag[],
): GegliederteGruppe | undefined {
  const namen = sammleNamen(eintraege.filter((e) => e.gruppe === gruppe.schluessel));
  if (namen.length === 0) return undefined;
  const anzahl = namen.length;
  const ueberschrift = gruppe.ueberschrift(anzahl);
  // Im Satz steht das Detail (nur bei einem Namen) in Klammern am Satzende.
  const aufzaehlung = zaehleAuf(
    namen.map((n) => formatiereGegliedertenNamen({ ...n, detail: undefined })),
  );
  const satz = gruppe.satz ? gruppe.satz(aufzaehlung, anzahl) : `${ueberschrift}: ${aufzaehlung}.`;
  const detail = namen[0]?.detail?.trim().replace(/\.+$/, '');
  return {
    schluessel: gruppe.schluessel,
    ueberschrift,
    anzahl,
    namen,
    satz: detail ? `${satz.replace(/\.$/, '')} (${detail}).` : satz,
  };
}

function gliedereKategorie(
  kategorie: Gliederungskategorie,
  eintraege: readonly Gliederungseintrag[],
): GegliederteKategorie | undefined {
  const zutreffend = eintraege.filter((e) => e.kategorie === kategorie.schluessel);
  const benannt = zutreffend.filter((e): e is NamensEintrag => 'name' in e);
  const gruppen = kategorie.gruppen.flatMap((g) => gliedereGruppe(g, benannt) ?? []);
  const saetze = zutreffend.flatMap((e) => ('name' in e ? [] : [e.satz]));
  if (gruppen.length === 0 && saetze.length === 0) return undefined;
  return {
    schluessel: kategorie.schluessel,
    ueberschrift: kategorie.ueberschrift,
    gruppen,
    saetze,
  };
}

/** Gliedert die Einträge. Kategorien und Gruppen erscheinen in der Reihenfolge
 *  von `kategorien`; Namen in Eingangsreihenfolge, Duplikate (gleicher Name,
 *  gleiche Hinweise) einmal. Mehr als `schwelle` sichtbare Einträge ergeben die
 *  Gliederungsform. Einträge unbekannter Kategorien oder Gruppen werden
 *  ignoriert. */
export function gliedereMeldungen(
  eintraege: readonly Gliederungseintrag[],
  optionen: { schwelle: number; kategorien: readonly Gliederungskategorie[] },
): Meldungsgliederung {
  const allgemein = eintraege.flatMap((e) =>
    !('name' in e) && e.kategorie === undefined ? [e.satz] : [],
  );
  const kategorien = optionen.kategorien.flatMap((k) => gliedereKategorie(k, eintraege) ?? []);
  const anzahl =
    allgemein.length +
    kategorien.reduce(
      (summe, k) => summe + k.saetze.length + k.gruppen.reduce((s, g) => s + g.anzahl, 0),
      0,
    );
  return {
    form: anzahl > optionen.schwelle ? 'gliederung' : 'saetze',
    allgemein,
    kategorien,
    anzahl,
  };
}
