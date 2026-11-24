// aktionsMeldungsBanner.ts
// Zeigt das Ergebnis eines abgeschlossenen Oberflächenvorgangs (Bannerart
// Vorgangsergebnis) als ein Banner: Meldungen mit Grund und Betroffenem werden
// über gliedereMeldungen gegliedert, Folgemeldungen hängen als Hinweis am
// übernommenen Gesetz, Meldungen ohne Grund stehen als eigener Satz.
import {
  KONFLIKTPRUEFUNG_OFFEN_SATZ,
  MELDUNGSGRUND_HINWEIS,
  type AktionsMeldung,
} from '@/lib/domain/app/aktionsMeldung';
import {
  anzahlSicherungen,
  sicherungenImDatenordnerSatz,
  DATEIBEFUNDGRUPPEN,
  FEHLERGRUPPEN,
  meldungsgruppe,
} from '@/lib/domain/app/meldungsgruppen';
import {
  gliedereMeldungen,
  type Gliederungseintrag,
  type Gliederungskategorie,
  type Meldungsgliederung,
} from '@/lib/domain/app/meldungsgliederung';
import { zeigeBanner, type BannerTyp } from './bannerStore';

/** Für die Anzeige nötiger Teil einer Meldung (auch aus Hilfsfenstern übertragbar). */
export type Vorgangsmeldung = Pick<
  AktionsMeldung,
  'text' | 'typ' | 'grund' | 'betroffen' | 'detail' | 'sicherung'
>;

/** Banner gliedern ab mehr als 3 sichtbaren Einträgen. */
const BANNER_SCHWELLE = 3;

/** Übernommene Gesetze eines Vorgangs (Erfolgsteil); an ihren Namen hängen die
 *  Folgemeldungen als Hinweis. */
export interface Vorgangserfolg {
  /** Kurztitel in Eingangsreihenfolge. */
  namen: readonly string[];
  /** Gruppenüberschrift, z. B. „Importiert“ (Singular bei 1). */
  ueberschrift: (anzahl: number) => string;
  /** Satzform, z. B. „AAG und BGB automatisch aktualisiert.“ */
  satz?: (aufzaehlung: string, anzahl: number) => string;
}

function kategorien(erfolg: Vorgangserfolg | undefined): Gliederungskategorie[] {
  return [
    ...(erfolg
      ? [
          {
            schluessel: 'gesetze',
            ueberschrift: 'Gesetze',
            gruppen: [
              { schluessel: 'erfolg', ueberschrift: erfolg.ueberschrift, satz: erfolg.satz },
            ],
          },
        ]
      : []),
    { schluessel: 'fehler', ueberschrift: 'Fehler', gruppen: FEHLERGRUPPEN },
    { schluessel: 'dateien', ueberschrift: 'Dateien', gruppen: DATEIBEFUNDGRUPPEN },
  ];
}

function schwersterTyp(meldungen: readonly Vorgangsmeldung[]): BannerTyp {
  return meldungen.some((m) => m.typ === 'fehler')
    ? 'fehler'
    : meldungen.some((m) => m.typ === 'warnung')
      ? 'warnung'
      : 'info';
}

/** Kann die Meldung keiner Gruppe und keinem übernommenen Gesetz zugeordnet
 *  werden, erscheint ihr Rohtext als eigener Satz. */
function istUngegliedert(m: Vorgangsmeldung, erfolgsnamen: ReadonlySet<string>): boolean {
  if (!m.grund || m.grund === 'konfliktpruefungOffen') return m.grund === undefined;
  return !m.betroffen || (!meldungsgruppe(m.grund) && !erfolgsnamen.has(m.betroffen));
}

function gliederungseintraege(
  meldungen: readonly Vorgangsmeldung[],
  erfolg: Vorgangserfolg | undefined,
): Gliederungseintrag[] {
  const erfolgsnamen = new Set(erfolg?.namen ?? []);
  const hinweise = new Map<string, string[]>();
  const sonstige: Gliederungseintrag[] = [];
  for (const m of meldungen) {
    const zuordnung = meldungsgruppe(m.grund);
    if (m.grund === 'konfliktpruefungOffen') sonstige.push({ satz: KONFLIKTPRUEFUNG_OFFEN_SATZ });
    else if (m.grund && !zuordnung && m.betroffen && erfolgsnamen.has(m.betroffen)) {
      // Folgemeldung: Hinweis in Klammern am übernommenen Gesetz.
      const folgehinweis = MELDUNGSGRUND_HINWEIS[m.grund];
      const liste = hinweise.get(m.betroffen) ?? [];
      if (!liste.includes(folgehinweis)) liste.push(folgehinweis);
      hinweise.set(m.betroffen, liste);
    } else if (zuordnung && m.betroffen)
      sonstige.push({
        kategorie: zuordnung.kategorie,
        gruppe: zuordnung.gruppe.schluessel,
        name: m.betroffen,
        detail: m.detail,
      });
    else sonstige.push({ satz: m.text });
  }
  // Allgemeine Sätze gleichen Wortlauts nur einmal.
  const allgemeineSaetze = [...new Set(sonstige.flatMap((e) => ('satz' in e ? [e.satz] : [])))];
  const gruppiert = sonstige.filter((e) => !('satz' in e));
  return [
    ...allgemeineSaetze.map((satz) => ({ satz })),
    ...(erfolg?.namen ?? []).map((name) => ({
      kategorie: 'gesetze',
      gruppe: 'erfolg',
      name,
      hinweise: hinweise.get(name) ?? [],
    })),
    ...gruppiert,
    ...sicherungsHinweis(
      meldungen,
      gruppiert.some((e) => e.kategorie === 'dateien'),
    ),
  ];
}

/** Genau einmal am Ende der Hinweis auf die Sicherungen (Singular/Plural);
 *  bei Dateibefunden in deren Kategorie, sonst als allgemeiner Satz. */
function sicherungsHinweis(
  meldungen: readonly Vorgangsmeldung[],
  mitDateibefunden: boolean,
): Gliederungseintrag[] {
  const anzahl = anzahlSicherungen(meldungen);
  if (anzahl === 0) return [];
  const satz = sicherungenImDatenordnerSatz(anzahl);
  return [mitDateibefunden ? { kategorie: 'dateien', satz } : { satz }];
}

/** Bildet das Vorgangsergebnis als Bannerinhalt; undefined, wenn nichts zu
 *  melden ist. Eine einzelne Meldung ohne zuordenbaren Grund erscheint als ihr
 *  Rohtext; Meldungen mit Grund und Betroffenem bilden stets gegliederte Sätze. */
export function gliedereVorgangsergebnis(
  meldungen: readonly Vorgangsmeldung[],
  erfolg?: Vorgangserfolg,
): { text: string; typ: BannerTyp; befund: boolean; gliederung?: Meldungsgliederung } | undefined {
  const mitErfolg = erfolg?.namen.length ? erfolg : undefined;
  if (!meldungen.length && !mitErfolg) return undefined;
  const typ = schwersterTyp(meldungen);
  const befund = meldungen.length > 0;
  for (const m of meldungen) if (m.detail) console.info(`${m.betroffen ?? ''}: ${m.detail}`);
  const texte = [...new Set(meldungen.map((m) => m.text))];
  const erfolgsnamen = new Set(mitErfolg?.namen ?? []);
  // Einzelner Rohtext, sofern kein weiteres Gesetz zu nennen ist.
  const nurBetroffener =
    !mitErfolg || (mitErfolg.namen.length === 1 && mitErfolg.namen[0] === meldungen[0]?.betroffen);
  const [einzigerText] = texte;
  if (
    texte.length === 1 &&
    einzigerText !== undefined &&
    nurBetroffener &&
    meldungen.every((m) => istUngegliedert(m, erfolgsnamen))
  ) {
    // Rohtext als vollständiger Satz, ggf. mit dem Hinweis auf die Sicherung.
    const anzahl = anzahlSicherungen(meldungen);
    const text = anzahl ? `${einzigerText} ${sicherungenImDatenordnerSatz(anzahl)}` : einzigerText;
    return { text, typ, befund };
  }
  const gliederung = gliedereMeldungen(gliederungseintraege(meldungen, mitErfolg), {
    schwelle: BANNER_SCHWELLE,
    kategorien: kategorien(mitErfolg),
  });
  return { text: gliederungAlsText(gliederung), typ, befund, gliederung };
}

/** Klartext einer Gliederung in Satzform (Banner-`text`, ohne Zeilenblock). */
export function gliederungAlsText(gliederung: Meldungsgliederung): string {
  return [
    ...gliederung.allgemein,
    ...gliederung.kategorien.flatMap((k) => [...k.gruppen.map((g) => g.satz), ...k.saetze]),
  ].join(' ');
}

/** Ein Banner je Vorgang: ohne Befund (nur Erfolgsteil) 5 s, sonst bleibt. */
export function zeigeAktionsMeldungsBanner(
  meldungen: readonly Vorgangsmeldung[],
  erfolg?: Vorgangserfolg,
): void {
  const ergebnis = gliedereVorgangsergebnis(meldungen, erfolg);
  if (!ergebnis) return;
  zeigeBanner({
    art: ergebnis.befund ? 'vorgangsergebnis' : 'erfolg',
    text: ergebnis.text,
    typ: ergebnis.typ,
    gliederung: ergebnis.gliederung,
  });
}
