// Reiner, vorgangsbezogener Vertrag für Meldungen aus gemeinsamer Arbeitslogik.
// Der Aufrufer sammelt synchron; Anzeige und Hinweisübergabe erfolgen getrennt.
import { DATEIBEFUNDGRUPPEN } from './meldungsgruppen';

/** Fachlicher Grund einer Meldung für die gegliederte Anzeige. Meldungen ohne
 * Grund erscheinen weiter als eigener Satz (`text`). */
export type MeldungsGrund =
  | 'euOriginalStattKonsolidiert'
  | 'euKonsolidiertStattOriginal'
  | 'euOhneErwaegungsgruende'
  | 'titelNichtErgaenzt'
  | 'verweiserkennungEingeschraenkt'
  | 'normNichtGefunden'
  | 'abschlussFehlgeschlagen'
  | 'konfliktpruefungOffen'
  | 'schemaversionAbweichend'
  | 'markierungNichtLesbar'
  | 'keineVerbindung'
  | 'beschaeftigt'
  | 'downloadFehlgeschlagen'
  | 'aktualisierungFehlgeschlagen'
  // Dateibefunde (Probleme mit lokalen Dateien)
  | 'imDatenordnerGesichert'
  | 'gesichertNichtEntfernt'
  | 'wegenSchemaversionGesichert'
  | 'dateiFehlt'
  | 'dateiLeer'
  | 'nichtLesbar'
  | 'sicherungFehlgeschlagen'
  | 'bereinigt'
  | 'nichtBereinigt'
  | 'nichtSpeicherbar';

/** Gründe der Dateibefunde; ohne Vorgangsempfänger sammelt sie ein
 * gemeinsames, sich erweiterndes Banner. */
const DATEIBEFUND_GRUENDE: ReadonlySet<MeldungsGrund> = new Set(
  DATEIBEFUNDGRUPPEN.map((g) => g.schluessel),
);

export function istDateibefund(meldung: Pick<AktionsMeldung, 'grund'>): boolean {
  return meldung.grund !== undefined && DATEIBEFUND_GRUENDE.has(meldung.grund);
}

/** Hinweis in Klammern hinter dem Namen eines übernommenen Eintrags. */
export const MELDUNGSGRUND_HINWEIS: Record<MeldungsGrund, string> = {
  euOriginalStattKonsolidiert:
    'Originaltext statt konsolidierter Fassung; spätere Änderungen können fehlen',
  euKonsolidiertStattOriginal: 'konsolidierte Fassung statt Originaltext',
  euOhneErwaegungsgruende: 'ohne Erwägungsgründe',
  titelNichtErgaenzt: 'ohne nichtamtliche Titel',
  verweiserkennungEingeschraenkt: 'Verweise möglicherweise unvollständig erkannt',
  normNichtGefunden: 'gewünschte Norm nicht gefunden',
  abschlussFehlgeschlagen: 'gespeichert, Abschluss fehlgeschlagen',
  konfliktpruefungOffen: 'Prüfung auf Markierungskonflikte nicht abgeschlossen',
  schemaversionAbweichend: 'Schemaversion abweichend',
  markierungNichtLesbar: 'Markierungen nicht lesbar',
  keineVerbindung: 'keine Verbindung',
  beschaeftigt: 'gerade anderweitig in Bearbeitung',
  downloadFehlgeschlagen: 'Download fehlgeschlagen',
  aktualisierungFehlgeschlagen: 'Aktualisierung fehlgeschlagen',
  imDatenordnerGesichert: 'wegen Beschädigung gesichert',
  gesichertNichtEntfernt: 'wegen Beschädigung gesichert, aber nicht entfernt',
  wegenSchemaversionGesichert: 'wegen abweichender Schemaversion gesichert',
  dateiFehlt: 'Datei fehlt',
  dateiLeer: 'Datei leer',
  nichtLesbar: 'nicht lesbar',
  sicherungFehlgeschlagen: 'Sicherung fehlgeschlagen',
  bereinigt: 'ungültige Angaben entfernt',
  nichtBereinigt: 'konnte nicht bereinigt werden',
  nichtSpeicherbar: 'konnte nicht gespeichert werden',
};

/** Allgemeiner Satz, wenn die Konfliktprüfung eines Vorgangs offen blieb. */
export const KONFLIKTPRUEFUNG_OFFEN_SATZ =
  'Die Prüfung auf Markierungskonflikte konnte nicht abgeschlossen werden. Bitte „Alle Markierungen neu prüfen“ ausführen.';

export type AktionsMeldung = {
  /** Vollständiger Einzelsatz; angezeigt nur, wenn die Meldung keiner Gruppe zugeordnet
   * werden kann (kein Grund bzw. kein Betroffener). Sonst bildet die Gliederung den Satz. */
  text: string;
  grund?: MeldungsGrund;
  /** Betroffenes Gesetz (Kurztitel) bzw. Datei, sofern die Meldung eines betrifft. */
  betroffen?: string;
  /** Technisches Detail (Ursache); sichtbar nur, wenn es allein in seiner Gruppe steht. */
  detail?: string;
  /** Sicherungsdatei relativ zum Datenordner; nur für „Datenordner öffnen“, nie im Text. */
  sicherung?: string;
  typ: 'info' | 'warnung' | 'fehler';
  art: 'fehler' | 'hinweis';
  anlass:
    | 'import'
    | 'dateisperre'
    | 'lesen'
    | 'sicherung'
    | 'pruefbedarf'
    | 'pruefabschluss'
    | 'synchronisation';
  /** Stand des gemeldeten Vorgangs: Eine Sicherung allein ist nur eine
   * Teiländerung; sie bestätigt nicht die anschließende eigentliche Speicherung. */
  aenderungsstand: 'keine' | 'teilweise' | 'vollstaendig';
};

/** Empfänger des einzelnen Aufrufs, kein global umgeschalteter Anzeigezustand.
 * Muss synchron sammeln, ohne I/O. Insbesondere keine Hinweisübergabe starten. */
export type AktionsMeldungEmpfaenger = ((meldung: AktionsMeldung) => void) & {
  /** Optionaler, flüchtiger Abschlussvertrag desselben Vorgangs. Registrieren
   * wartet niemals auf den Lauf; insbesondere nicht innerhalb einer Prüfqueue. */
  folgelaufErfassen?: (lauf: Promise<unknown>) => void;
};

/** Erfasst einen bereits gestarteten Folgelauf beim ausdrücklich übergebenen
 * Vorgang. Ohne Abschlussvertrag bleibt das bisherige Aufruferverhalten bestehen. */
export function erfasseAktionsFolgelauf(
  empfangen: AktionsMeldungEmpfaenger | undefined,
  lauf: Promise<unknown>,
): void {
  void lauf.catch(() => undefined);
  try {
    empfangen?.folgelaufErfassen?.(lauf);
  } catch (fehler) {
    console.error('Aktionsfolgelauf konnte nicht erfasst werden:', fehler);
  }
}

/** Erhält den Abschlussvertrag, wenn eine vorhandene Meldungsweiterleitung
 * Texte ergänzt oder Einzelbefunde bündelt. Verarbeitung und Folgeläufe
 * gehören weiterhin demselben ausdrücklich übergebenen Vorgang. */
export function erzeugeAktionsMeldungsWeiterleitung(
  empfangen: AktionsMeldungEmpfaenger | undefined,
  verarbeite: (meldung: AktionsMeldung) => void,
): AktionsMeldungEmpfaenger | undefined {
  if (!empfangen) return undefined;
  const weiterleitung: AktionsMeldungEmpfaenger = verarbeite;
  weiterleitung.folgelaufErfassen = (lauf) => erfasseAktionsFolgelauf(empfangen, lauf);
  return weiterleitung;
}

/** Nur flüchtige Meldungen und laufende Aufträge, kein fachlicher Prüfstand.
 * Der Formularaufrufer wartet erst NACH seinem Arbeitsaufruf, außerhalb der
 * Prüfqueue. „abgeschlossen“ bestätigt ausschließlich das Ende der Folgeläufe,
 * nicht Speichererfolg, Konfliktfreiheit, Historienübernahme oder Transport.
 * Bei „wartefrist“ muss der Aufrufer den ungesicherten Prüfabschluss vor einem
 * Absenderschließen berücksichtigen; laufende Arbeit wird nicht abgebrochen.
 */
export function erzeugeAktionsMeldungsSammlung(meldungen: AktionsMeldung[] = []) {
  const beobachter = new Set<() => void>();
  const benachrichtigen = () => {
    for (const beobachten of beobachter) beobachten();
  };
  const folgelaeufe = new Set<Promise<void>>();
  const meldungEmpfangen: AktionsMeldungEmpfaenger = (meldung) => {
    meldungen.push(meldung);
    benachrichtigen();
  };
  meldungEmpfangen.folgelaufErfassen = (lauf) => {
    // Beide Enden beobachten; der Arbeitsaufruf behält seine Fehlerbehandlung.
    const beobachtet = lauf.then(
      () => undefined,
      (fehler: unknown) => {
        const grund = fehler instanceof Error ? fehler.message : String(fehler);
        if (meldungen.some((m) => m.typ === 'fehler' && m.text.includes(grund))) return;
        meldungEmpfangen({
          typ: 'fehler',
          art: 'hinweis',
          anlass: 'pruefabschluss',
          aenderungsstand: 'keine',
          text: `Der nachgelagerte Abschluss ist fehlgeschlagen: ${grund}. Bitte vollständig neu prüfen.`,
        });
      },
    );
    folgelaeufe.add(beobachtet);
    void beobachtet.then(() => {
      folgelaeufe.delete(beobachtet);
      benachrichtigen();
    });
  };
  return {
    meldungEmpfangen,
    /** Anzeigeempfänger lösen sich beim Schließen; fachliche Arbeit läuft weiter. */
    abonnieren(beobachten: () => void): () => void {
      beobachter.add(beobachten);
      return () => {
        beobachter.delete(beobachten);
      };
    },
    hatOffeneFolgelaeufe: () => folgelaeufe.size > 0,
    meldungen: (): readonly AktionsMeldung[] => [...meldungen],
    async warteAufAbschluss(wartefristMs: number): Promise<'abgeschlossen' | 'wartefrist'> {
      if (!Number.isFinite(wartefristMs) || wartefristMs < 0)
        throw new Error('Die Abschlusswartefrist muss endlich und nicht negativ sein.');
      let timer: ReturnType<typeof setTimeout> | undefined;
      const wartefrist = new Promise<'wartefrist'>((resolve) => {
        timer = setTimeout(() => resolve('wartefrist'), wartefristMs);
      });
      const abschluss = async (): Promise<'abgeschlossen'> => {
        // Ein Lauf kann vor seinem Ende weitere Folgeläufe registrieren.
        while (folgelaeufe.size > 0) await Promise.all([...folgelaeufe]);
        return 'abgeschlossen';
      };
      try {
        return await Promise.race([abschluss(), wartefrist]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
