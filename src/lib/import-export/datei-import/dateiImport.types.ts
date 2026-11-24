// dateiImport.types.ts
// Aus dateiImport.ts ausgelagert (500-Zeilen-Richtgröße): die
// öffentlichen Typen (Konflikte, Berichtseinträge, Fehler, Gesamtergebnis)
// und die Gliederung des Importberichts (gliedereImportbericht). Beides wird
// sowohl intern von dateiImport.ts (Klassifizierung schreibt BerichtEintrag
// und ImportFehler) als auch von DateiImportOverlay.tsx (rendert die
// Gliederung, nutzt die Konflikt-Typen) gebraucht – daher als gemeinsame,
// reine Typ-/Gliederungs-Datei ohne I/O.

import {
  KONFLIKTPRUEFUNG_OFFEN_SATZ,
  MELDUNGSGRUND_HINWEIS,
  type AktionsMeldung,
  type MeldungsGrund,
} from '@/lib/domain/app/aktionsMeldung';
import {
  anzahlSicherungen,
  meldungsgruppe,
  sicherungenImDatenordnerSatz,
} from '@/lib/domain/app/meldungsgruppen';
import {
  gliedereMeldungen,
  type Gliederungseintrag,
  type Gliederungsgruppe,
  type Gliederungskategorie,
  type Meldungsgliederung,
} from '@/lib/domain/app/meldungsgliederung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { normalisierteDateiBasis, referenzAusDateiBasis } from '@/lib/persistenz/kern/kern.index';

/** Ordnet eine Meldung über `betroffen` genau einem übernommenen Gesetz zu:
 *  Dateiname `<Dateibasis>.xml` über die vollständige Dateibasis (Kurztitel und
 *  Normgeber), sonst der Kurztitel, sofern er nur ein Gesetz bezeichnet.
 *  Mehrdeutige oder fremde Meldungen bleiben ohne Gesetz (undefined). */
export function betroffenesGesetz<T extends { referenz: Gesetzesreferenz }>(
  betroffen: string | undefined,
  gesetze: readonly T[],
): T | undefined {
  if (betroffen === undefined) return undefined;
  const ref = /\.xml$/i.test(betroffen) ? referenzAusDateiBasis(betroffen.slice(0, -4)) : null;
  const treffer = ref
    ? gesetze.filter((g) => normalisierteDateiBasis(g.referenz) === normalisierteDateiBasis(ref))
    : gesetze.filter((g) => g.referenz.kurztitel === betroffen);
  return treffer.length === 1 ? treffer[0] : undefined;
}

/** Meldung ohne Ergebnis als Importfehler `meldung`; mit Grund bildet die
 *  Gliederung den Satz, sonst bleibt der Rohtext. */
export function meldungAlsImportFehler(m: AktionsMeldung, datei?: string): ImportFehler {
  return {
    grund: 'meldung',
    ...(datei ? { datei } : {}),
    ...(m.sicherung ? { sicherung: m.sicherung } : {}),
    ...(m.grund
      ? { meldungsgrund: m.grund, ...(m.detail ? { detail: m.detail } : {}) }
      : { detail: m.text }),
  };
}

/** Flüchtige Herkunft und Eingangsdiagnose; bleibt bei späteren Entscheidungen erhalten. */
interface ImportDateiBefunde {
  /** Flüchtiger Anzeigeanschluss; Meldungen bleiben direkt in diesem Bericht. */
  abschluss?: {
    abonnieren: (beobachten: () => void) => () => void;
    /** Noch offene Folgeläufe (z. B. Markierungsprüfung) dieses Eintrags. */
    hatOffeneFolgelaeufe: () => boolean;
  };
  quelle?: string;
  meldungen?: AktionsMeldung[];
  ausgeschlosseneMarkierungen?: number;
  /** Lesbare Nachbareinträge bleiben nutzbar; ausgeschlossene Eingänge verhindern einen uneingeschränkten Erfolg. */
  eingangUnvollstaendig?: boolean;
}

export interface RohDatei {
  quelle?: string;
  name: string;
  inhalt: string;
}

/** Gesetz-Konflikt: Bestand vorhanden UND inhaltlich verändert (ohne
 *  verarbeitungszeit-Tag verglichen, siehe gesetzesXMLOhneVeraenderlicheFelder). „Ersetzen" im Overlay
 *  schreibt neuesXML/neuesGesetz unverändert über speichereGesetz.
 *  neuesGesetz enthält die zu speichernde Gesetzesreferenz. */
export interface GesetzKonflikt extends ImportDateiBefunde {
  art: 'gesetz';
  kurztitel: string;
  neuesXML: string;
  neuesGesetz: Gesetzesreferenz;
  bestehendeVerarbeitungszeit?: Date;
  importierteVerarbeitungszeit?: Date;
}

/** Konflikt bei Favoriten/Lesezeichen/Gesetzeskurzbefehle/Markierungen/
 *  nichtamtlichen Titeln: die Zieldatei existiert bereits UND unterscheidet
 *  sich (abgesehen vom geaendert-Tag) inhaltlich. importInhalt ist der rohe,
 *  noch nicht geschriebene XML-Text der importierten Datei. */
export interface DateiKonflikt extends ImportDateiBefunde {
  art:
    | 'favoriten'
    | 'lesezeichen'
    | 'gesetzeskurzbefehle'
    | 'markierung'
    | 'nichtamtlicheTitel'
    | 'einstellungen';
  /** Für die alphabetisch sortierte Konfliktliste, z.B. "BGB Markierungen"
   *  (siehe Absprache). */
  anzeigename: string;
  /** Nur bei 'favoriten'/'markierung'/'nichtamtlicheTitel' gesetzt (Ersetzen
   *  ist dort pro Gesetz nötig); zugleich der bloße Name für den
   *  Importbericht (siehe Konfliktauflösung in dateiImport.aktionen.ts). */
  kurztitel?: string;
  gesetz?: Gesetzesreferenz;
  importInhalt: string;
}

export type ImportAktion = 'ersetzen' | 'zusammenfuehren';

export type ImportKonflikt = GesetzKonflikt | DateiKonflikt;

// ---------------------------------------------------------------------------
// Importbericht: Kategorien/Aktionen
// ---------------------------------------------------------------------------

type BerichtKategorie =
  | 'gesetz'
  | 'markierung'
  | 'favoriten'
  | 'nichtamtlicheTitel'
  | 'lesezeichen'
  | 'gesetzeskurzbefehle'
  | 'einstellungen'
  | 'index';
type BerichtAktion = 'neu' | 'zusammengefuehrt' | 'ersetzt' | 'unveraendert' | 'nichtUebernommen';

export interface BerichtEintrag extends ImportDateiBefunde {
  kategorie: BerichtKategorie;
  aktion: BerichtAktion;
  name: string;
}

/** Fehlgeschlagene Speicherung mit noch laufendem Abschluss. Der bestehende
 * Fehlerweg bleibt abgelehnt; sein Bericht kann verspätete Befunde aufnehmen. */
export class ImportAbschlussFehler extends Error {
  constructor(
    fehler: Error,
    readonly bericht: BerichtEintrag,
  ) {
    super(fehler.message, { cause: fehler });
  }
}

export interface DateiImportErgebnis {
  konflikte: ImportKonflikt[];
  berichtEintraege: BerichtEintrag[];
  /** Dateien, die nicht verarbeitet werden konnten, und Abbruch des ganzen
   *  Vorgangs – getrennt von den kategorisierten Ergebnissen. */
  fehler: ImportFehler[];
}

type ImportFehlerGrund =
  | 'formatUnbekannt'
  | 'zipVerschachtelt'
  | 'lesefehler'
  | 'nachbereitung'
  | 'unerwartet'
  | 'meldung'
  | 'importAbgebrochen';

/** Strukturierter Fehler des Datei-Imports; die Anzeige gruppiert nach `grund`. */
export interface ImportFehler {
  grund: ImportFehlerGrund;
  /** Herkunft der Datei (wie `quelle`); fehlt nur bei `importAbgebrochen`. */
  datei?: string;
  gesetz?: string;
  /** Technische Ursache; sichtbar nur, wenn die Gruppe genau einen Eintrag hat. */
  detail?: string;
  /** Nur bei `meldung`: Grund der Meldung zur Gruppierung; ohne Grund eigener Satz. */
  meldungsgrund?: MeldungsGrund;
  /** Nur bei `meldung`: entstandene Sicherung (relativ zum Datenordner); nie im Text. */
  sicherung?: string;
}

/** Fortschritt eines Datei-Imports. `erledigt` zählt die abgeschlossenen
 *  Dateien der jeweiligen Phase; `datei` ist die als Nächstes bearbeitete
 *  Datei und fehlt bei der Schlussmeldung (`erledigt === gesamt`). */
export interface DateiImportFortschritt {
  phase: 'lesen' | 'verarbeiten';
  erledigt: number;
  gesamt: number;
  datei?: string;
}

export type DateiImportFortschrittEmpfaenger = (fortschritt: DateiImportFortschritt) => void;

const KATEGORIE_REIHENFOLGE: readonly BerichtKategorie[] = [
  'gesetz',
  'markierung',
  'favoriten',
  'nichtamtlicheTitel',
  'lesezeichen',
  'gesetzeskurzbefehle',
  'einstellungen',
  'index',
];

const KATEGORIE_LABEL: Record<BerichtKategorie, string> = {
  gesetz: 'Gesetze',
  markierung: 'Markierungen',
  favoriten: 'Favoriten',
  nichtamtlicheTitel: 'Nichtamtliche Titel',
  lesezeichen: 'Lesezeichen',
  gesetzeskurzbefehle: 'Gesetzeskurzbefehle',
  einstellungen: 'Einstellungen',
  index: 'Importindizes',
};

/** Kategorien, deren Name selbst schon ein Plural-Substantiv ist (nicht ein
 *  pro-Gesetz-Kurztitel wie bei Gesetze/Markierungen/Favoriten) – Gesetzeskurzbefehle,
 *  Lesezeichen und Einstellungen sind jeweils EINE einzelne App-weite
 *  Datei/Wertebündel, deren "existiert schon"-Aussage grammatisch trotzdem
 *  den Plural verlangt. */
const IMMER_PLURAL_KATEGORIEN: ReadonlySet<BerichtKategorie> = new Set([
  'gesetzeskurzbefehle',
  'lesezeichen',
  'einstellungen',
]);

const AKTION_REIHENFOLGE: readonly BerichtAktion[] = [
  'neu',
  'zusammengefuehrt',
  'ersetzt',
  'unveraendert',
  'nichtUebernommen',
];

function aktionsUeberschrift(
  aktion: BerichtAktion,
  kategorie: BerichtKategorie,
  anzahl: number,
): string {
  switch (aktion) {
    case 'neu':
      return 'Neu importiert';
    case 'zusammengefuehrt':
      return 'Zusammengeführt';
    case 'ersetzt':
      return 'Ersetzt';
    case 'nichtUebernommen':
      return 'Nicht übernommen; Bestand unverändert';
    case 'unveraendert': {
      const verb =
        IMMER_PLURAL_KATEGORIEN.has(kategorie) || anzahl > 1 ? 'Existieren' : 'Existiert';
      return kategorie === 'index'
        ? `${verb} schon in mindestens genauso neuer Fassung`
        : `${verb} schon in dieser Version`;
    }
  }
}

/** Satzform „<Namen> <Aktion>.“ */
function bauKlausel(
  aktion: BerichtAktion,
  kategorie: BerichtKategorie,
  liste: string,
  anzahl: number,
): string {
  switch (aktion) {
    case 'nichtUebernommen':
      return `${liste} nicht übernommen; Bestand unverändert.`;
    case 'neu':
      return `${liste} neu importiert.`;
    case 'zusammengefuehrt':
      return `${liste} zusammengeführt.`;
    case 'ersetzt':
      return `${liste} ersetzt.`;
    case 'unveraendert': {
      const plural = IMMER_PLURAL_KATEGORIEN.has(kategorie) || anzahl > 1;
      const verb = plural ? 'existieren' : 'existiert';
      const rest =
        kategorie === 'index'
          ? 'schon in mindestens genauso neuer Fassung.'
          : 'schon in dieser Version.';
      return `${liste} ${verb} ${rest}`;
    }
  }
}

/** Mehr sichtbare Einträge ergeben die Gliederungsform. */
const BERICHT_SCHWELLE = 5;

const FEHLER_KATEGORIE = 'fehler';

const FEHLER_UEBERSCHRIFT: Record<
  Exclude<ImportFehlerGrund, 'meldung' | 'importAbgebrochen'>,
  string
> = {
  formatUnbekannt: 'Dateiformat nicht erkannt',
  zipVerschachtelt: 'ZIP-Archive in ZIP-Archiven werden nicht unterstützt',
  lesefehler: 'Nicht lesbar',
  nachbereitung: 'Nachbereitung fehlgeschlagen',
  unerwartet: 'Unbekannter Fehler bei der Verarbeitung',
};

/** Dateiname, wie der Nutzer ihn sieht: ohne Archiv- und Ordnerpfad, dekodiert. */
export function anzeigeDateiname(datei: string): string {
  const letzter =
    datei
      .split(/[/\\→]/)
      .pop()
      ?.trim() || datei;
  try {
    return decodeURIComponent(letzter);
  } catch {
    return letzter;
  }
}

function berichtKategorien(): Gliederungskategorie[] {
  return KATEGORIE_REIHENFOLGE.map((kategorie) => ({
    schluessel: kategorie,
    ueberschrift: KATEGORIE_LABEL[kategorie],
    gruppen: AKTION_REIHENFOLGE.map((aktion): Gliederungsgruppe => ({
      schluessel: aktion,
      ueberschrift: (anzahl) => aktionsUeberschrift(aktion, kategorie, anzahl),
      satz: (liste, anzahl) => bauKlausel(aktion, kategorie, liste, anzahl),
    })),
  }));
}

const FEHLER_GRUENDE = Object.keys(FEHLER_UEBERSCHRIFT).filter(
  (g): g is keyof typeof FEHLER_UEBERSCHRIFT => g in FEHLER_UEBERSCHRIFT,
);

function fehlerKategorie(fehler: readonly ImportFehler[]): Gliederungskategorie {
  const gruppen: Gliederungsgruppe[] = FEHLER_GRUENDE.map((grund) => ({
    schluessel: grund,
    ueberschrift: () => FEHLER_UEBERSCHRIFT[grund],
  }));
  const meldungsgruende = new Set(
    fehler.flatMap((f) => (f.grund === 'meldung' && f.meldungsgrund ? [f.meldungsgrund] : [])),
  );
  for (const grund of meldungsgruende) {
    const gruppe = meldungsgruppe(grund)?.gruppe;
    const text = MELDUNGSGRUND_HINWEIS[grund];
    gruppen.push({
      ueberschrift: () => text.charAt(0).toUpperCase() + text.slice(1),
      ...gruppe,
      schluessel: `meldung:${grund}`,
    });
  }
  return { schluessel: FEHLER_KATEGORIE, ueberschrift: 'Fehler', gruppen };
}

function eigeneHinweise(e: BerichtEintrag): string[] {
  const hinweise: string[] = [];
  if (e.ausgeschlosseneMarkierungen)
    hinweise.push(
      e.ausgeschlosseneMarkierungen === 1
        ? '1 Markierung nicht lesbar'
        : `${e.ausgeschlosseneMarkierungen} Markierungen nicht lesbar`,
    );
  if (e.eingangUnvollstaendig && ['neu', 'zusammengefuehrt', 'ersetzt'].includes(e.aktion))
    hinweise.push('unvollständig übernommen');
  return hinweise;
}

function hinweiseUndDetail(
  e: BerichtEintrag,
  allein: boolean,
  saetze: Gliederungseintrag[],
): { hinweise: string[]; detail?: string; konfliktpruefungOffen: boolean } {
  const hinweise = eigeneHinweise(e);
  const details: string[] = [];
  let konfliktpruefungOffen = false;
  for (const m of e.meldungen ?? []) {
    if (m.grund === 'konfliktpruefungOffen') konfliktpruefungOffen = true;
    else if (m.grund === 'markierungNichtLesbar') {
      // Einzelgründe zur Anzahl „<n> Markierungen nicht lesbar“.
      if (!e.ausgeschlosseneMarkierungen) hinweise.push(MELDUNGSGRUND_HINWEIS[m.grund]);
      details.push(m.text);
    } else if (m.grund) hinweise.push(MELDUNGSGRUND_HINWEIS[m.grund]);
    else if (allein) hinweise.push(m.text);
    else saetze.push({ kategorie: e.kategorie, satz: `${e.name}: ${m.text}` });
  }
  return {
    hinweise: [...new Set(hinweise)],
    ...(details.length ? { detail: details.join(' ') } : {}),
    konfliktpruefungOffen,
  };
}

function fehlerEintrag(f: ImportFehler): Gliederungseintrag {
  const name = f.datei ? anzeigeDateiname(f.datei) : (f.gesetz ?? '');
  if (f.grund === 'importAbgebrochen')
    return { satz: `Der Datei-Import wurde abgebrochen${f.detail ? `: ${f.detail}` : '.'}` };
  if (f.grund === 'meldung' && !f.meldungsgrund)
    return { kategorie: FEHLER_KATEGORIE, satz: [name, f.detail].filter(Boolean).join(': ') };
  return {
    kategorie: FEHLER_KATEGORIE,
    gruppe: f.grund === 'meldung' ? `meldung:${f.meldungsgrund}` : f.grund,
    name: f.gesetz && f.datei ? `${name} (${f.gesetz})` : name,
    ...(f.detail ? { detail: f.detail } : {}),
  };
}

/** Genau einmal am Ende der Hinweis auf die Sicherungen (Singular/Plural): bei
 *  Fehlern mit Sicherung in der Fehlerkategorie, sonst in der Kategorie des
 *  ersten Eintrags, an dessen Meldungen eine Sicherung hängt. */
function sicherungsHinweis(
  eintraege: readonly BerichtEintrag[],
  fehler: readonly ImportFehler[],
): Gliederungseintrag[] {
  const fehlerMitSicherung = fehler.flatMap((f) =>
    f.grund === 'meldung'
      ? [{ grund: f.meldungsgrund, betroffen: f.datei, sicherung: f.sicherung }]
      : [],
  );
  const eintraegeMitSicherung = eintraege.filter((e) => anzahlSicherungen(e.meldungen ?? []) > 0);
  const anzahl = anzahlSicherungen([
    ...fehlerMitSicherung,
    ...eintraegeMitSicherung.flatMap((e) =>
      (e.meldungen ?? []).map((m) => ({ ...m, betroffen: m.betroffen ?? e.name })),
    ),
  ]);
  if (anzahl === 0) return [];
  const kategorie =
    anzahlSicherungen(fehlerMitSicherung) > 0
      ? FEHLER_KATEGORIE
      : (eintraegeMitSicherung[0]?.kategorie ?? FEHLER_KATEGORIE);
  return [{ kategorie, satz: sicherungenImDatenordnerSatz(anzahl) }];
}

/**
 * Gliedert Berichtseinträge (je Kategorie nach Aktion, Name = Kurztitel) und
 * Fehler (nach Grund, Name = Dateiname, wie der Nutzer ihn sieht). Hinweise
 * stehen am Namen in seiner Aktionsgruppe; Meldungen ohne Grund erscheinen als
 * Hinweis nur bei einer Gruppe mit genau einem Eintrag, sonst als eigener Satz
 * am Ende der Kategorie. Wird bei jedem Rendern frisch gebildet, weil späte
 * Meldungen Einträge noch ergänzen.
 */
export function gliedereImportbericht(
  eintraege: readonly BerichtEintrag[],
  fehler: readonly ImportFehler[],
): Meldungsgliederung {
  const namenJeGruppe = new Map<string, Set<string>>();
  for (const e of eintraege) {
    const schluessel = `${e.kategorie}|${e.aktion}`;
    namenJeGruppe.set(schluessel, (namenJeGruppe.get(schluessel) ?? new Set()).add(e.name));
  }
  const saetze: Gliederungseintrag[] = [];
  let konfliktpruefungOffen = false;
  const gliederung: Gliederungseintrag[] = eintraege.map((e) => {
    const allein = namenJeGruppe.get(`${e.kategorie}|${e.aktion}`)?.size === 1;
    const befund = hinweiseUndDetail(e, allein, saetze);
    konfliktpruefungOffen ||= befund.konfliktpruefungOffen;
    return {
      kategorie: e.kategorie,
      gruppe: e.aktion,
      name: e.name,
      hinweise: befund.hinweise,
      ...(befund.detail ? { detail: befund.detail } : {}),
    };
  });
  const fehlerEintraege = fehler.map(fehlerEintrag);
  const abbrueche = fehlerEintraege.filter((f) => !('name' in f) && f.kategorie === undefined);
  const uebrigeFehler = fehlerEintraege.filter((f) => !abbrueche.includes(f));
  const allgemein: Gliederungseintrag[] = [
    ...abbrueche,
    ...(konfliktpruefungOffen ? [{ satz: KONFLIKTPRUEFUNG_OFFEN_SATZ }] : []),
  ];
  return gliedereMeldungen(
    [
      ...allgemein,
      ...gliederung,
      ...uebrigeFehler,
      ...saetze,
      ...sicherungsHinweis(eintraege, fehler),
    ],
    {
      schwelle: BERICHT_SCHWELLE,
      kategorien: [...berichtKategorien(), fehlerKategorie(fehler)],
    },
  );
}
