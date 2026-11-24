// Wiederaufnehmbarer Abgleich: Gesetzdateien außerhalb, frische Metadaten innerhalb der Cache-Sperre.
import {
  leiteSuchverzeichniseintragAb,
  type Suchverzeichniseintrag,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { normalisierteDateiBasis, referenzAusDateiBasis } from '@/lib/persistenz/kern/kern.index';
import { sendeGlobal } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import {
  GesetzDateistempelFehler,
  gleicherDateistempel,
  leseGesetzDateistempel,
} from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzDateistempel';
import { meldeGesetzBefundeAnEmpfaenger } from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicher.befunde';
import { leseGesetz } from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicher.einzelweg';
import { gruppiereDateinamen } from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicher.dateien';
import { leseGesetzdatei } from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicher';
import {
  fehlertext,
  type GesetzLadeBefund,
} from '@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicher.typen';
import {
  aendereSuchverzeichnis,
  entwerteSuchverzeichnis,
  leseSuchverzeichnis,
  type Suchverzeichnis,
} from './suchverzeichnisDatei';

type Gesetzdatei = Awaited<ReturnType<typeof leseGesetzDateistempel>>[number];
export interface SuchverzeichnisFortschritt {
  erledigt: number;
  gesamt: number;
}
export interface SuchverzeichnisAbgleichErgebnis extends Suchverzeichnis {
  befunde: GesetzLadeBefund[];
  /** Zusätzliche Meldungen; Gesetz-Ladebefunde stehen ausschließlich in befunde. */
  meldungen: AktionsMeldung[];
  aenderungen: Gesetzesreferenz[];
  /** Abgleich-/Cachefehler sind keine Gesetz-Ladebefunde. */
  fehler?: string;
}
function referenz(datei: Gesetzdatei): Gesetzesreferenz | null {
  return referenzAusDateiBasis(datei.name.slice(0, -4));
}
function schluessel(e: { kurztitel?: string; normgeber?: string }): string | undefined {
  return e.kurztitel && e.normgeber
    ? normalisierteDateiBasis({ kurztitel: e.kurztitel, normgeber: e.normgeber })
    : undefined;
}
function passt(e: Suchverzeichniseintrag, datei: Gesetzdatei): boolean {
  const ref = referenz(datei);
  return (
    schluessel(e) === schluessel(ref ?? {}) &&
    gleicherDateistempel(e.dateistempel, datei.dateistempel)
  );
}
/** `auflistung`: die Ordnerauflistung, aus der `datei` stammt; sie wird
 * weitergereicht, statt den Ordner je Datei erneut aufzulisten. */
async function einlesen(
  datei: Gesetzdatei,
  auflistung: ReadonlyMap<string, string[]>,
  befunde: GesetzLadeBefund[],
  meldungen: AktionsMeldung[],
): Promise<Suchverzeichniseintrag> {
  const ref = referenz(datei);
  if (ref) {
    const aktionsmeldungen: AktionsMeldung[] = [];
    const geladen = await leseGesetz(
      ref,
      (meldung) => aktionsmeldungen.push(meldung),
      auflistung.get(normalisierteDateiBasis(ref)) ?? [datei.name],
    );
    const befundmeldungen: AktionsMeldung[] = [];
    meldeGesetzBefundeAnEmpfaenger(geladen.befunde, (meldung) => befundmeldungen.push(meldung));
    // Dieselben Ladebefunde nicht zusätzlich als Aktionsmeldung weiterreichen.
    // Optionale Titel- und sonstige unabhängige Meldungen bleiben erhalten.
    meldungen.push(
      ...aktionsmeldungen.filter(
        (meldung) =>
          !befundmeldungen.some(
            (befund) =>
              befund.text === meldung.text &&
              befund.typ === meldung.typ &&
              befund.art === meldung.art &&
              befund.anlass === meldung.anlass &&
              befund.aenderungsstand === meldung.aenderungsstand,
          ),
      ),
    );
    befunde.push(...geladen.befunde);
    if (geladen.status === 'geladen')
      return leiteSuchverzeichniseintragAb(geladen.gesetz, datei.dateistempel);
  } else {
    const geladen = await leseGesetzdatei(
      datei.name.slice(0, -4),
      `gesetze/${datei.name}`,
      (meldung) => meldungen.push(meldung),
    );
    if (geladen.befund) befunde.push(geladen.befund);
  }
  return { status: 'nicht-lesbar', ...(ref ?? {}), dateistempel: { ...datei.dateistempel } };
}
/** Zeitbudget, nach dem die Schleife ohne Einlesen spätestens abgibt. */
const ABGABE_BUDGET_MS = 8;
/** Höchstzahl der Nachleserunden für zwischenzeitlich geänderte Dateien. */
const NACHLESE_RUNDEN = 3;
/** Übernimmt ein Paket gelesener Einträge in den Stand. Frische Speicherungen und
 * Löschungen gewinnen auch im angehaltenen Paket: Eine inzwischen entfernte Datei
 * (gelöscht oder wegen Beschädigung gesichert, auch durch paralleles Laden) bereinigt
 * der Abschluss; eine geänderte Datei kommt in `geaendert` zum Nachlesen. */
function uebernehmePaket(
  stand: { eintraege: Suchverzeichniseintrag[] },
  paket: readonly { datei: Gesetzdatei; eintrag: Suchverzeichniseintrag }[],
  aktuell: ReadonlyMap<string, Gesetzdatei>,
  geaendert: Set<string>,
  aenderungen: Map<string, Gesetzesreferenz>,
) {
  const ersetzen = new Map<string, Suchverzeichniseintrag>();
  for (const { datei, eintrag } of paket) {
    const jetzt = aktuell.get(datei.name);
    if (!jetzt) continue;
    if (!gleicherDateistempel(jetzt.dateistempel, datei.dateistempel)) {
      geaendert.add(datei.name);
      continue;
    }
    geaendert.delete(datei.name);
    const key = schluessel(eintrag);
    if (key === undefined) {
      stand.eintraege = stand.eintraege.filter((e) => !passt(e, datei));
      stand.eintraege.push(eintrag);
    } else ersetzen.set(key, eintrag);
    const ref = referenz(datei);
    if (ref) aenderungen.set(normalisierteDateiBasis(ref), ref);
  }
  stand.eintraege = stand.eintraege.filter((e) => !ersetzen.has(schluessel(e) ?? ''));
  stand.eintraege.push(...ersetzen.values());
  stand.eintraege.sort((a, b) => (a.kurztitel ?? '').localeCompare(b.kurztitel ?? '', 'de'));
}
/** Abgabe an den Hauptfaden nur nach echter Arbeit oder verbrauchtem Zeitbudget;
 * übersprungene Dateien kosten sonst je Datei einen Timer-Umlauf. */
function erzeugeAbgabe() {
  let letzteAbgabe = performance.now();
  return async (gearbeitet: boolean) => {
    if (!gearbeitet && performance.now() - letzteAbgabe < ABGABE_BUDGET_MS) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    letzteAbgabe = performance.now();
  };
}
/** Zu durchlaufende Dateien: mit `nur` ausschließlich diese, bevorzugte zuerst. */
function waehleDateien(
  alleDateien: readonly Gesetzdatei[],
  bevorzugt: readonly Gesetzesreferenz[],
  nur: readonly Gesetzesreferenz[] | undefined,
): Gesetzdatei[] {
  const dateiSchluessel = (d: Gesetzdatei) => schluessel(referenz(d) ?? {}) ?? '';
  const nurSchluessel = nur && new Set(nur.map(normalisierteDateiBasis));
  const dateien = nurSchluessel
    ? alleDateien.filter((d) => nurSchluessel.has(dateiSchluessel(d)))
    : [...alleDateien];
  const bevorzugte = new Set(bevorzugt.map(normalisierteDateiBasis));
  return dateien.sort(
    (a, b) =>
      Number(bevorzugte.has(dateiSchluessel(b))) - Number(bevorzugte.has(dateiSchluessel(a))),
  );
}
function istUnveraendertInOrdnung(
  bisher: Suchverzeichniseintrag | undefined,
  datei: Gesetzdatei,
): boolean {
  return !!bisher && passt(bisher, datei) && bisher.status === 'in-ordnung';
}
/** Zwischenzeitlich geänderte Dateien mit frischen Stempeln gezielt nachlesen,
 * statt den Abgleich unvollständig stehen zu lassen; höchstens NACHLESE_RUNDEN Runden.
 * `geaendert` behält danach nur die weiterhin geänderten Dateien. */
async function liesGeaenderteNach(
  geaendert: Set<string>,
  lies: (datei: Gesetzdatei, auflistung: ReadonlyMap<string, string[]>) => Promise<void>,
  veroeffentliche: () => Promise<void>,
) {
  for (let runde = 0; runde < NACHLESE_RUNDEN && geaendert.size; runde++) {
    const dateien = await leseGesetzDateistempel();
    const frisch = new Map(dateien.map((d) => [d.name, d]));
    const auflistung = gruppiereDateinamen(dateien);
    for (const name of [...geaendert]) {
      const datei = frisch.get(name);
      // Entfernte Dateien bereinigt der Abschluss.
      if (datei) await lies(datei, auflistung);
      else geaendert.delete(name);
    }
    await veroeffentliche();
  }
}
/** Entfernt Einträge ohne Datei und setzt `abgeglichen`, wenn jede Datei genau einen
 * Eintrag hat und keine Datei zwischenzeitlich geändert blieb. */
async function schliesseAbgleichAb(
  aenderungen: Map<string, Gesetzesreferenz>,
  zwischenzeitlichGeaendert: boolean,
) {
  await aendereSuchverzeichnis(true, async (stand) => {
    const aktuell = await leseGesetzDateistempel();
    stand.eintraege = stand.eintraege.filter((e) => {
      const vorhanden = aktuell.some((d) =>
        schluessel(e) === undefined ? passt(e, d) : schluessel(referenz(d) ?? {}) === schluessel(e),
      );
      if (!vorhanden && e.kurztitel && e.normgeber)
        aenderungen.set(schluessel(e) ?? '', { kurztitel: e.kurztitel, normgeber: e.normgeber });
      return vorhanden;
    });
    stand.eintraege.sort((a, b) => (a.kurztitel ?? '').localeCompare(b.kurztitel ?? '', 'de'));
    stand.abgeglichen =
      !zwischenzeitlichGeaendert &&
      [...gruppiereDateinamen(aktuell).values()].every((namen) => namen.length === 1) &&
      aktuell.every((d) => stand.eintraege.some((e) => passt(e, d)));
  });
}
/** Laufender Vollabgleich dieses Fensters; weitere Vollabgleiche warten auf ihn,
 * statt parallel dieselben Dateien zu lesen. */
let laufenderVollabgleich: Promise<SuchverzeichnisAbgleichErgebnis> | null = null;
type AbgleichOptionen = {
  bevorzugt?: readonly Gesetzesreferenz[];
  /** Nur diese Gesetzesdateien gezielt neu lesen (kein Vollabgleich). */
  nur?: readonly Gesetzesreferenz[];
  fortschritt?: (stand: SuchverzeichnisFortschritt) => void;
  veroeffentlicht?: () => void;
};
/** Fortschritt meldet abgeschlossene Einzelschritte, bevorzugte Referenzen kommen zuerst.
 * Vollabgleiche desselben Fensters laufen nacheinander, nie parallel. */
export function gleicheSuchverzeichnisAb(
  optionen: AbgleichOptionen = {},
): Promise<SuchverzeichnisAbgleichErgebnis> {
  if (optionen.nur) return fuehreAbgleichDurch(optionen);
  const vorher = laufenderVollabgleich;
  const lauf = (async () => {
    if (vorher) await vorher.catch(() => undefined);
    return fuehreAbgleichDurch(optionen);
  })();
  laufenderVollabgleich = lauf;
  void lauf
    .catch(() => undefined)
    .finally(() => {
      if (laufenderVollabgleich === lauf) laufenderVollabgleich = null;
    });
  return lauf;
}
async function fuehreAbgleichDurch({
  bevorzugt = [],
  nur,
  fortschritt,
  veroeffentlicht,
}: AbgleichOptionen): Promise<SuchverzeichnisAbgleichErgebnis> {
  const beginn = performance.now();
  const befunde: GesetzLadeBefund[] = [];
  const meldungen: AktionsMeldung[] = [];
  const aenderungen = new Map<string, Gesetzesreferenz>();
  // Zwischen Lesen und Veröffentlichen geänderte Dateien (Name); nach der
  // Schleife gezielt nachgelesen.
  const geaendert = new Set<string>();
  let eingelesen = 0;
  let anzahlDateien = 0;
  let abgleichfehler: string | undefined;
  try {
    const alleDateien = await leseGesetzDateistempel();
    const dateien = waehleDateien(alleDateien, bevorzugt, nur);
    anzahlDateien = dateien.length;
    const gruppiert = gruppiereDateinamen(alleDateien);
    const start = await aendereSuchverzeichnis(true, (stand) => {
      stand.eintraege.sort((a, b) => (a.kurztitel ?? '').localeCompare(b.kurztitel ?? '', 'de'));
      stand.abgeglichen = false;
    });
    // Erster Eintrag sofort, dann 2/4/8 …: Wiederaufnahme am letzten Paket,
    // insgesamt linearer JSON-Umfang statt vollständiger Serialisierung je Gesetz.
    let paketgroesse = 1;
    let paket: Array<{ datei: Gesetzdatei; eintrag: Suchverzeichniseintrag }> = [];
    async function veroeffentlichePaket() {
      if (!paket.length) return;
      await aendereSuchverzeichnis(true, async (stand) => {
        const aktuell = new Map((await leseGesetzDateistempel()).map((d) => [d.name, d]));
        uebernehmePaket(stand, paket, aktuell, geaendert, aenderungen);
      });
      veroeffentlicht?.();
      try {
        // Metadatenfortschritt auch für andere Fenster; keine geladenen XML-Bestände entwerten.
        await sendeGlobal('gesetze-geaendert', []);
      } catch {
        /* Veröffentlicht bleibt veröffentlicht; der Gesamtabschluss sendet erneut. */
      }
      paket = [];
      paketgroesse *= 2;
    }
    const startNachReferenz = new Map(start?.eintraege.map((e) => [schluessel(e), e]));
    let erledigt = 0;
    const gibAb = erzeugeAbgabe();
    fortschritt?.({ erledigt, gesamt: dateien.length });
    for (const datei of dateien) {
      const key = schluessel(referenz(datei) ?? {});
      const konkurrierend = key !== undefined && (gruppiert.get(key)?.length ?? 0) > 1;
      const bisher = startNachReferenz.get(key);
      const lesen = !!nur || konkurrierend || !istUnveraendertInOrdnung(bisher, datei);
      if (lesen) {
        paket.push({ datei, eintrag: await einlesen(datei, gruppiert, befunde, meldungen) });
        eingelesen++;
        if (paket.length >= paketgroesse) await veroeffentlichePaket();
      }
      erledigt++;
      fortschritt?.({ erledigt, gesamt: dateien.length });
      await gibAb(lesen);
    }
    await veroeffentlichePaket();
    await liesGeaenderteNach(
      geaendert,
      async (datei, auflistung) => {
        paket.push({ datei, eintrag: await einlesen(datei, auflistung, befunde, meldungen) });
        eingelesen++;
      },
      veroeffentlichePaket,
    );
    await schliesseAbgleichAb(aenderungen, geaendert.size > 0);
  } catch (fehler) {
    abgleichfehler = fehlertext(fehler);
    if (fehler instanceof GesetzDateistempelFehler)
      befunde.push({ status: 'ordner_unlesbar', fehler: abgleichfehler });
    await entwerteSuchverzeichnis();
  }
  console.info(
    `Suchverzeichnis-Abgleich: ${anzahlDateien} Dateien, ${eingelesen} eingelesen, ${Math.round(performance.now() - beginn)} ms`,
  );
  const refs = [...aenderungen.values()];
  if (refs.length) {
    try {
      await sendeGlobal('gesetze-geaendert', refs);
    } catch {
      /* Ein Transportfehler ändert den bereits gesicherten Verzeichnisstand nicht. */
    }
  }
  return {
    ...(await leseSuchverzeichnis()),
    befunde,
    meldungen,
    aenderungen: refs,
    ...(abgleichfehler === undefined ? {} : { abgeglichen: false, fehler: abgleichfehler }),
  };
}

/** Dauerhaft gespeicherte Verweise benötigen einen vollständig abgeglichenen Stand.
 * Ein gültiger Stand verursacht weder Abgleich noch Gesetzeszugriffe. */
export async function leseAbgeglichenesSuchverzeichnis(): Promise<Suchverzeichnis> {
  // Ein laufender Vollabgleich (z. B. beim Start) wird abgewartet und geteilt.
  if (laufenderVollabgleich) await laufenderVollabgleich.catch(() => undefined);
  const stand = await leseSuchverzeichnis();
  if (stand.abgeglichen) return stand;
  const abgeglichen = await (laufenderVollabgleich ?? gleicheSuchverzeichnisAb());
  if (!abgeglichen.abgeglichen)
    throw new Error(
      'Das Suchverzeichnis konnte für die Verweiserkennung nicht vollständig abgeglichen werden.',
    );
  return abgeglichen;
}
