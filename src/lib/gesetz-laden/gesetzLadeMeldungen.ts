// Fensterlokale Sammelmeldungen oberhalb der Persistenz. Reparierbare
// Gesetzdateien sammelt ein sich erweiterndes Banner „nicht geladene Gesetze“
// mit „Alle aktualisieren“; übrige Ladebefunde gehen an das Dateibefund-Banner.
// Vollobjekte liegen im Fensterbestand.
import { NORMGEBER_DE_BUND } from '@/lib/domain/normgeber';
import type { GesetzLadeBefund, GesetzZustandsBefund } from '@/lib/persistenz/gesetz/gesetz.index';
import {
  gesetzBefundAlsMeldung,
  warteAufSpeicherBatchAbschluss,
} from '@/lib/persistenz/gesetz/gesetz.index';
import { repariereGesetze } from '@/lib/import/import.index';
import type { GesetzReparaturErgebnis, GesetzReparaturZiel } from '@/lib/import/import.index';
import {
  bannerAktualisieren,
  bannerSchliessen,
  erzeugeErweiterbaresBanner,
  gliedereVorgangsergebnis,
  gliederungAlsText,
  meldeDateibefund,
  type BannerInhalt,
  type Vorgangserfolg,
  type Vorgangsmeldung,
} from '@/lib/banner/banner.index';
import type { Meldungsgliederung } from '@/lib/domain/app/meldungsgliederung';

type ReparaturZaehler = { current: number };

const ERNEUT_LADBAR_SATZ = 'Sie können aus ihrer bekannten Internet-Quelle erneut geladen werden.';
/** Bis zu so vielen Gesetzen stehen die Namen im Satz, darüber gegliedert. */
const NAMEN_IM_SATZ = 3;

/** Dateibefund ohne Pfad; die Ursache steht im Detail, Sicherungspfade nur in der Konsole.
 * Betroffen ist der Dateiname, nach einer Reparatur der Gesetzesname. */
function beschreibeBefund(befund: GesetzZustandsBefund, name?: string): Vorgangsmeldung {
  if ('sicherungspfad' in befund)
    console.info(`${befund.dateiBasis}: Sicherung ${befund.sicherungspfad}`);
  const meldung = gesetzBefundAlsMeldung(befund);
  if (name === undefined || !('dateiBasis' in befund)) return meldung;
  return {
    ...meldung,
    betroffen: name,
    text: meldung.text.replace(`${befund.dateiBasis}.xml`, name),
  };
}

function zielName(ziel: GesetzReparaturZiel): string {
  return `${ziel.kurztitel} (${ziel.quelle === NORMGEBER_DE_BUND ? 'Bund' /* normgeber-anzeige: Anzeigename der Herkunft, keine Gesetzesreferenz. */ : 'Landesrecht BW'})`;
}

function zielSchluessel(ziel: GesetzReparaturZiel): string {
  return JSON.stringify([ziel.dateiBasis, ziel.quelle, ziel.kurztitel]);
}

/** Problem eines Reparaturziels als gegliederte Meldung; undefined bei Erfolg. */
function beschreibeReparatur(ergebnis: GesetzReparaturErgebnis): Vorgangsmeldung | undefined {
  const name = zielName(ergebnis.ziel);
  switch (ergebnis.status) {
    case 'repariert':
    case 'bereits_gueltig':
      return undefined;
    case 'beschaeftigt':
      return {
        typ: 'warnung',
        grund: 'beschaeftigt',
        betroffen: name,
        text: `${name}: gerade anderweitig in Bearbeitung. Ein erneuter Versuch ist möglich.`,
      };
    case 'verbindungsfehler':
      return {
        typ: 'warnung',
        grund: 'keineVerbindung',
        betroffen: name,
        detail: ergebnis.fehler.meldung,
        text: `${name}: keine Verbindung (${ergebnis.fehler.meldung}). Ein erneuter Versuch ist möglich.`,
      };
    case 'fehler':
      return ergebnis.fehler.grund === 'download'
        ? {
            typ: 'warnung',
            grund: 'downloadFehlgeschlagen',
            betroffen: name,
            detail: ergebnis.fehler.meldung,
            text: `${name}: Download fehlgeschlagen (${ergebnis.fehler.meldung}). Die Datei bleibt erhalten. Ein erneuter Versuch ist möglich.`,
          }
        : {
            typ: 'warnung',
            grund: 'aktualisierungFehlgeschlagen',
            betroffen: name,
            detail: ergebnis.fehler.meldung,
            text: `${name}: Aktualisierung fehlgeschlagen (${ergebnis.fehler.meldung}).`,
          };
    case 'archiviert':
    case 'fehlt':
    case 'gesichert_aber_nicht_entfernt':
    case 'leer':
    case 'sicherung_fehlgeschlagen':
    case 'unlesbar':
      return beschreibeBefund({ ...ergebnis, dateiBasis: ergebnis.ziel.dateiBasis }, name);
  }
}

function fehlerText(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}

/** Zustand des offenen Banners „nicht geladene Gesetze“ dieses Fensters. */
type NichtGeladen = {
  bannerId: string;
  laufendeReparaturen: ReparaturZaehler;
  /** Ziele, für die (noch) ein Reparaturversuch möglich ist. */
  erneutVersuchen: GesetzReparaturZiel[];
  /** Noch nicht versuchte Ziele (Schlüssel). */
  unversucht: Set<string>;
  probleme: Map<string, Vorgangsmeldung>;
  vorgangsfehler: string[];
  laeuft: boolean;
};

const erweitereNichtGeladene = erzeugeErweiterbaresBanner<NichtGeladen>('nichtGeladeneGesetze');

const nichtGeladenSatz = (aufzaehlung: string, anzahl: number) =>
  `${anzahl === 1 ? 'Dieses Gesetz konnte' : 'Diese Gesetze konnten'} nicht geladen werden: ${aufzaehlung}.`;

const nichtGeladenGruppe = (namen: readonly string[]): Vorgangserfolg => ({
  namen,
  ueberschrift: () => 'Nicht geladen',
  satz: nichtGeladenSatz,
});

/** Bannerinhalt: noch nicht versuchte Gesetze als Gruppe, Reparaturprobleme
 * nach Grund, Vorgangsfehler als allgemeine Sätze. */
function bannerinhalt(zustand: NichtGeladen): { text: string; gliederung?: Meldungsgliederung } {
  const namen = zustand.erneutVersuchen
    .filter((z) => zustand.unversucht.has(zielSchluessel(z)))
    .map(zielName);
  const probleme = [...zustand.probleme.values()];
  const nurNichtGeladen = probleme.length === 0 && zustand.vorgangsfehler.length === 0;
  if (nurNichtGeladen && namen.length <= NAMEN_IM_SATZ)
    return {
      text: `${nichtGeladenSatz(new Intl.ListFormat('de', { style: 'long', type: 'conjunction' }).format(namen), namen.length)} ${ERNEUT_LADBAR_SATZ}`,
    };
  const allgemein: string[] = nurNichtGeladen
    ? [`${namen.length} Gesetze konnten nicht geladen werden. ${ERNEUT_LADBAR_SATZ}`]
    : zustand.vorgangsfehler;
  const meldungen: Vorgangsmeldung[] = [
    ...allgemein.map((text): Vorgangsmeldung => ({ text, typ: 'warnung' })),
    ...probleme,
  ];
  const ergebnis = gliedereVorgangsergebnis(meldungen, nichtGeladenGruppe(namen));
  if (!ergebnis) return { text: '' };
  return ergebnis.gliederung
    ? { text: gliederungAlsText(ergebnis.gliederung), gliederung: ergebnis.gliederung }
    : { text: ergebnis.text };
}

function aktualisiereBanner(zustand: NichtGeladen) {
  if (
    zustand.probleme.size === 0 &&
    zustand.erneutVersuchen.length === 0 &&
    zustand.vorgangsfehler.length === 0
  ) {
    bannerSchliessen(zustand.bannerId);
    return;
  }
  const inhalt = bannerinhaltMitAktion(zustand);
  bannerAktualisieren(zustand.bannerId, {
    ...inhalt,
    gliederung: inhalt.gliederung ?? null,
    aktion: inhalt.aktion ?? null,
  });
}

/** Vollständiger Bannerinhalt; „Alle aktualisieren“ solange Wiederholbares verbleibt. */
function bannerinhaltMitAktion(zustand: NichtGeladen): BannerInhalt {
  return {
    ...bannerinhalt(zustand),
    typ: 'warnung',
    ...(zustand.erneutVersuchen.length > 0
      ? { aktion: { label: 'Alle aktualisieren', onClick: () => void aktualisieren(zustand) } }
      : {}),
  };
}

async function aktualisieren(zustand: NichtGeladen): Promise<void> {
  if (zustand.laeuft || zustand.erneutVersuchen.length === 0) return;
  zustand.laeuft = true;
  zustand.laufendeReparaturen.current += 1;
  const versuchteZiele = zustand.erneutVersuchen;
  zustand.vorgangsfehler = [];
  try {
    bannerAktualisieren(zustand.bannerId, {
      laedt: true,
      text: 'Gesetze werden aktualisiert …',
      gliederung: null,
    });
    const ergebnisse = await repariereGesetze(versuchteZiele);
    const verblieben: GesetzReparaturZiel[] = [];
    for (const ziel of versuchteZiele) {
      const schluessel = zielSchluessel(ziel);
      zustand.unversucht.delete(schluessel);
      const zielErgebnisse = ergebnisse.filter(
        (eintrag) =>
          eintrag.ziel.dateiBasis === ziel.dateiBasis &&
          eintrag.ziel.quelle === ziel.quelle &&
          eintrag.ziel.kurztitel === ziel.kurztitel,
      );
      const ergebnis = zielErgebnisse.length === 1 ? zielErgebnisse[0] : undefined;
      if (!ergebnis) {
        zustand.probleme.set(schluessel, {
          typ: 'warnung',
          grund: 'aktualisierungFehlgeschlagen',
          betroffen: zielName(ziel),
          detail: 'kein eindeutiges Ergebnis',
          text: `${zielName(ziel)}: Für den Reparaturversuch liegt kein eindeutiges Ergebnis vor. Ein erneuter Versuch ist möglich.`,
        });
        verblieben.push(ziel);
        continue;
      }
      const problem = beschreibeReparatur(ergebnis);
      if (problem) zustand.probleme.set(schluessel, problem);
      else zustand.probleme.delete(schluessel);
      if (
        ergebnis.status === 'verbindungsfehler' ||
        ergebnis.status === 'beschaeftigt' ||
        (ergebnis.status === 'fehler' && ergebnis.fehler.grund === 'download')
      ) {
        verblieben.push(ziel);
      }
    }
    zustand.erneutVersuchen = verblieben;
  } catch (fehler) {
    zustand.vorgangsfehler = [
      `Die Aktualisierung konnte nicht abgeschlossen werden: ${fehlerText(fehler)}. Für ungeklärte Ziele ist ein erneuter Versuch möglich.`,
    ];
  } finally {
    try {
      // Der Broadcast im 200-ms-Nachlauf darf die eigene Ergebnisanzeige
      // nicht durch zusätzliche Reparaturbanner verdoppeln.
      await warteAufSpeicherBatchAbschluss();
    } catch (fehler) {
      zustand.vorgangsfehler = [
        ...zustand.vorgangsfehler,
        `Der Speicherabschluss konnte nicht bestätigt werden: ${fehlerText(fehler)}.`,
      ];
    } finally {
      zustand.laufendeReparaturen.current -= 1;
      zustand.laeuft = false;
      bannerAktualisieren(zustand.bannerId, { laedt: false });
    }
    aktualisiereBanner(zustand);
  }
}

/** Reparierbare Gesetzdateien sammelt ein sich erweiterndes Banner mit
 * „Alle aktualisieren“; bekannte Ziele einmal. Ein geschlossenes Banner
 * beginnt beim nächsten Befund neu. Während eines Reparaturlaufs (laufender
 * Zähler) wird nichts gemeldet. */
function meldeNichtGeladeneGesetze(
  ziele: readonly GesetzReparaturZiel[],
  laufendeReparaturen: ReparaturZaehler,
): void {
  if (ziele.length === 0) return;
  let erweitert: NichtGeladen | undefined;
  const id = erweitereNichtGeladene((offen) => {
    // Während eines Reparaturlaufs wird das offene Banner nicht erweitert.
    if (offen?.laeuft) return undefined;
    const bekannt = new Set(offen?.erneutVersuchen.map(zielSchluessel));
    const neu = ziele.filter((z) => !bekannt.has(zielSchluessel(z)));
    if (neu.length === 0) return undefined;
    const zustand: NichtGeladen = offen ?? {
      bannerId: '',
      laufendeReparaturen,
      erneutVersuchen: [],
      unversucht: new Set(),
      probleme: new Map(),
      vorgangsfehler: [],
      laeuft: false,
    };
    for (const ziel of neu) {
      zustand.unversucht.add(zielSchluessel(ziel));
      zustand.probleme.delete(zielSchluessel(ziel));
    }
    zustand.erneutVersuchen = [...zustand.erneutVersuchen, ...neu];
    erweitert = zustand;
    return { inhalt: bannerinhaltMitAktion(zustand), daten: zustand };
  });
  // Reparaturläufe zeigen ihren Stand in genau diesem Banner (geschlossen: ohne Wirkung).
  if (id !== undefined && erweitert) erweitert.bannerId = id;
}

/** Der Suchverzeichnisabgleich meldet sichtbare Dateibefunde hier.
 * Der Ref wird auch hier geprüft: ein zuvor begonnener Ladevorgang kann seine
 * Befunde erst während einer inzwischen gestarteten Reparatur zurückgeben. */
export function meldeGesetzLadeBefunde(
  befunde: GesetzLadeBefund[],
  laufendeReparaturen: ReparaturZaehler,
): void {
  if (laufendeReparaturen.current > 0) return;
  meldeNichtGeladeneGesetze(
    befunde
      .filter((befund) => befund.status === 'reparierbar')
      .map(({ dateiBasis, kurztitel, quelle }) => ({ dateiBasis, kurztitel, quelle })),
    laufendeReparaturen,
  );
  for (const befund of befunde) {
    if (befund.status === 'reparierbar') continue;
    meldeDateibefund(beschreibeBefund(befund));
  }
}
