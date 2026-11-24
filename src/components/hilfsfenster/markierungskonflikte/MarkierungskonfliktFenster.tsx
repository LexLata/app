// MarkierungskonfliktFenster.tsx
//
// Eigenständiges, skalierbares Fenster (KEIN Overlay – siehe Absprache: der
// Nutzer soll Konfliktliste und Gesetzestext gleichzeitig sehen können), das
// alle Markierungs-XMLs mit Markierungskonflikten auflistet UND (siehe
// konfliktaktionen.ts) Aktionen zu deren Auflösung anbietet.
// Wird geöffnet über markierungskonflikteSpeicher.ts: meldeNeueMarkierungskonflikte
// (automatisch, nur bei echter Zunahme neuer Konflikte) oder über den
// Menüpunkt "Aktualisieren von Markierungen" (menu.rs, nur macOS – siehe
// dortiger Kommentar). Label-Routing: main.tsx, Fenster-Erzeugung: fenster.rs:
// markierungskonflikte_fenster_oeffnen (Singleton, festes Label
// "markierungskonflikte").
//
// Lädt seine Daten selbst beim Mount (ladeMarkierungskonflikteFuerAnzeige in
// markierungskonflikteAnzeige.ts) – kein Kontext-Transfer wie beim Verweismarkierung-/
// Kommentar-Fenster nötig, da keine Startdaten von außen gebraucht werden.
//
// Zweispaltiges Layout (siehe Absprache): links die bestehende Konfliktliste
// (KonfliktListe.tsx), rechts eine Konfliktseitenleiste mit Aktionen zur
// zuletzt angeklickten Zeile (Konfliktseitenleiste.tsx,
// `ausgewaehlt`-State unten). Jede einzelne Konfliktzeile ist dabei
// EIGENSTÄNDIG auswählbar – bezieht sich eine Markierung auf mehrere
// Zielgesetze, hat also jede der daraus entstehenden Zeilen ihre eigenen, nur
// auf dieses eine Zielgesetz bezogenen Aktionen.
//
// Diese Datei enthält nur noch die Orchestrierung (Laden, Sync-Listener,
// Auswahl-State und allgemeines Verknüpfungsangebot) – die Darstellung selbst liegt in den Companion-Dateien
// KonfliktListe.tsx und Konfliktseitenleiste.tsx, gemeinsame Typen/Helfer in MarkierungskonfliktFenster.helpers.ts (alle drei
// ausgelagert, 500-Zeilen-Richtwert).
//
// Synchronisation: schreibeGesetzKonflikte() (markierungskonflikteSpeicher.ts) ist
// der EINZIGE Schreibpfad für markierungskonflikte.xml und sendet dort nach
// jeder Änderung das Broadcast-Event 'markierungskonflikte-geaendert' – dieses
// Fenster hört selbst darauf (siehe Effekt unten) und lädt sich dann neu.
// Das deckt WIRKLICH JEDE Änderung ab, unabhängig davon, wodurch sie
// ausgelöst wurde: lokale Konfliktaktionen hier, "Verweis bearbeiten" (läuft
// in einem separaten Hilfsfenster), ein Gesetz-Speichern/-Löschen im
// Hauptfenster, ein Sammel-Update oder ein Datei-Import.
import { useGeladeneGesetze } from '@/hooks/tabs/useGeladeneGesetze';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { erzeugeAktionsMeldungsSammlung, schliesseKonfliktMeldungenAb } from './konfliktMeldungen';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactElement } from 'react';
import { useFensterSchliessenAbsichern } from '@/hooks/fenster/useFensterSchliessenAbsichern';
import { useSchliessenAnfrageSchliesstFenster } from '@/hooks/fenster/useSchliessenAnfrageSchliesstFenster';
import { useAppAkzentfarbe } from '@/hooks/einstellungen/useAppAkzentfarbe';
import type { MarkierungskonfliktAnzeigeErgebnis } from '@/lib/markierungen/markierungen.index';
import {
  ermittleAktuelleVerknuepfungsMoeglichkeit,
  ladeMarkierungskonflikteFuerAnzeige,
} from '@/lib/markierungen/markierungen.index';
import { useFensterSichtbarMachen } from '@/hooks/fenster/useFensterSichtbarMachen';
import { MarkierungskonfliktErklaerung } from './MarkierungskonfliktErklaerung';
import { UeberlagerterScrollbereich } from '@/components/scrollbereich/UeberlagerterScrollbereich';
import { GesetzZeile } from '@/components/hilfsfenster/markierungskonflikte/KonfliktListe';
import { Konfliktseitenleiste } from '@/components/hilfsfenster/markierungskonflikte/Konfliktseitenleiste';
import {
  type Auswahl,
  aktualisiereAuswahl,
  anzahlMarkierungskonflikte,
} from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { hinweisboxPadding } from '@/lib/stil/paddingRollen';
import { nativenFenstertitelSetzen } from '@/lib/plattform/tauriHelpers';

export default function MarkierungskonfliktFenster() {
  return (
    <UiGroesseProvider>
      <MarkierungskonfliktFensterInhalt />
    </UiGroesseProvider>
  );
}

function MarkierungskonfliktFensterInhalt() {
  const bestand = useGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  const uiFaktor = useUiSkalierungsFaktor();
  const textRollen = useTextRollen();
  const [anzeige, setAnzeige] = useState<
    | (MarkierungskonfliktAnzeigeErgebnis & {
        verknuepfungsMoeglichkeit: { moeglich: boolean; fehler: string | null };
      })
    | null
  >(null);
  const [wirdGeladen, setWirdGeladen] = useState(false);
  const ladeablauf = useRef({ generation: 0, lauf: null as Promise<boolean> | null });
  const [ladeFehler, setLadeFehler] = useState(false);
  const [ladeFehlerText, setLadeFehlerText] = useState<string | null>(null);
  // Fenster wird in fenster/menu_sync.rs (markierungskonflikte_fenster_oeffnen)
  // bewusst UNSICHTBAR erzeugt – siehe useFensterSichtbarMachen.ts für
  // Details. Unabhängig von den Fokus-/Event-Listenern weiter unten (reiner
  // einmaliger show()-Aufruf, kein gemeinsamer State).
  useFensterSichtbarMachen({
    breite: Math.round(820 * uiFaktor),
    hoehe: Math.round(682 * uiFaktor),
  });
  // Setzt die App-Akzentfarbe als CSS-Variablen für DIESES Fenster – jedes
  // Tauri-Fenster hat ein eigenes `document`, daher reicht der Aufruf in
  // App.tsx nicht für dieses Hilfsfenster.
  useAppAkzentfarbe();

  const gesetze = anzeige?.gesetze ?? null;
  const pruefstatus = ladeFehler ? null : (anzeige?.pruefstatus ?? null);
  const [ausgewaehlt, setAusgewaehlt] = useState<Auswahl | null>(null);
  // Zentral gehalten (statt lokal pro GesetzZeile) statt eines reinen Initial-
  // werts, damit ein Gesetz nach einem erfolgreichen Import (siehe
  // wartetAufAufklappen unten) auch nach dem ersten Mount noch automatisch
  // aufklappen kann – ein lokaler useState(initialAufgeklappt) in GesetzZeile
  // reagiert dagegen nicht mehr auf spätere Reloads (Bugfix).
  const [aufgeklappt, setAufgeklappt] = useState<Set<string>>(new Set());
  // Kurztitel, die nach einem erfolgreichen Import (siehe Konfliktseitenleiste:
  // onErfolgreicherImport) automatisch aufgeklappt werden sollen, sobald sie
  // nach dem Reload konkrete Konflikte zeigen. Puffer nötig, weil zwischen
  // "Import erfolgreich" und "neue Konfliktdaten sind da" noch der Broadcast-
  // Reload (markierungskonflikte-geaendert → neuLaden) dazwischenliegt.
  const setWartetAufAufklappen = useState<Set<string>>(new Set())[1];
  // Für "Alle Markierungen neu prüfen" (Konfliktseitenleiste): analog zum initialen Laden
  // (Effekt unten) soll danach ebenfalls das erste Gesetz mit konkreten
  // Konflikten aufklappen, aber NUR wenn noch nichts aufgeklappt ist (der
  // Nutzer könnte ja schon manuell etwas anderes aufgeklappt haben – das
  // soll nicht überschrieben werden). Ein Ref statt State genügt, da reines
  // einmaliges Konsumieren beim nächsten neuLaden() reicht und kein eigenes
  // Rerender auslösen muss.
  const aufklappenNachAllePruefungRef = useRef(false);

  const nachfehlerRef = useRef(false);
  const [aktionsAbschlussOffen, setAktionsAbschlussOffen] = useState(false);

  // Flüchtige Lebensdauer einschließlich Folgeläufen und nativer Hinweisannahme.
  const abschluesse = useRef(new Set<Promise<unknown>>());
  const registriereAbschluss = useCallback((lauf: Promise<unknown>) => {
    abschluesse.current.add(lauf);
    void lauf.finally(() => abschluesse.current.delete(lauf)).catch(() => {});
  }, []);
  const schliessschutz = useFensterSchliessenAbsichern(
    false,
    setLadeFehlerText,
    () => Promise.resolve(true),
    async () => {
      while (abschluesse.current.size > 0) await Promise.allSettled([...abschluesse.current]);
      return true;
    },
  );

  function onAktionsNachfehler(): void {
    nachfehlerRef.current = true;
    setAktionsAbschlussOffen(true);
  }

  // Ein laufender Auftrag nimmt weitere Auslöser auf. Überholte Zwischenstände
  // werden verworfen; Liste und allgemeines Aktionsangebot werden gemeinsam übernommen.
  function neuLaden(): Promise<boolean> {
    if (nachfehlerRef.current) return Promise.resolve(false);
    const ablauf = ladeablauf.current;
    ablauf.generation++;
    if (ablauf.lauf) return ablauf.lauf;
    setWirdGeladen(true);
    ablauf.lauf = arbeiteLadeauftraegeAb().finally(() => {
      ablauf.lauf = null;
      setWirdGeladen(false);
    });
    registriereAbschluss(ablauf.lauf);
    return ablauf.lauf;
  }

  async function ladeVerknuepfungsMoeglichkeit(
    gesetze: MarkierungskonfliktAnzeigeErgebnis['gesetze'],
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ): Promise<{ moeglich: boolean; fehler: string | null }> {
    return ermittleAktuelleVerknuepfungsMoeglichkeit(gesetze, meldungEmpfangen)
      .then((angebot) => ({
        moeglich: angebot.moeglich,
        fehler:
          angebot.fehler.length > 0
            ? `Die Verknüpfungsmöglichkeiten konnten nicht vollständig geladen werden (${angebot.fehler.map((f) => f.gesetz.kurztitel).join(', ')}).`
            : null,
      }))
      .catch((fehler: unknown) => {
        console.error('Verknüpfungsmöglichkeiten konnten nicht geladen werden:', fehler);
        return {
          moeglich: false,
          fehler: 'Die Verknüpfungsmöglichkeiten konnten nicht geladen werden.',
        };
      });
  }

  async function arbeiteLadeauftraegeAb(): Promise<boolean> {
    for (;;) {
      const ergebnis = await bearbeiteLadeauftrag(ladeablauf.current.generation);
      if (ergebnis !== null) return ergebnis;
    }
  }

  async function bearbeiteLadeauftrag(generation: number): Promise<boolean | null> {
    const sammlung = erzeugeAktionsMeldungsSammlung();
    const geladen = await ladeMarkierungskonflikteFuerAnzeige(sammlung.meldungEmpfangen)
      .then((ergebnis) => ({ ergebnis }))
      .catch((fehler: unknown) => ({ fehler }));
    if ('fehler' in geladen) {
      const lokal = await schliesseKonfliktMeldungenAb(sammlung, false);
      if (nachfehlerRef.current) return false;
      if (generation !== ladeablauf.current.generation) return null;
      setLadeFehlerText(lokal);
      console.error('Markierungskonflikte konnten nicht geladen werden:', geladen.fehler);
      setLadeFehler(true);
      // Bereits sichtbare Befunde und ihre Auswahl bleiben beim Ladefehler erhalten.
      return false;
    }
    if (nachfehlerRef.current || generation !== ladeablauf.current.generation) {
      await schliesseKonfliktMeldungenAb(sammlung, true);
      if (nachfehlerRef.current) return false;
      return null;
    }
    const { ergebnis } = geladen;
    const verknuepfungsMoeglichkeit =
      ergebnis.pruefstatus === 'ausstehend'
        ? { moeglich: false, fehler: null }
        : await ladeVerknuepfungsMoeglichkeit(ergebnis.gesetze, sammlung.meldungEmpfangen);
    const lokal = await schliesseKonfliktMeldungenAb(sammlung, true);
    if (nachfehlerRef.current) return false;
    if (generation !== ladeablauf.current.generation) return null;
    setLadeFehlerText(lokal);
    uebernehmeAnzeige(
      ergebnis,
      lokal ? { moeglich: false, fehler: lokal } : verknuepfungsMoeglichkeit,
    );
    return (
      ergebnis.pruefstatus === 'aktuell' &&
      verknuepfungsMoeglichkeit.fehler === null &&
      lokal === null
    );
  }

  function uebernehmeAnzeige(
    ergebnis: MarkierungskonfliktAnzeigeErgebnis,
    verknuepfungsMoeglichkeit: { moeglich: boolean; fehler: string | null },
  ): void {
    const neu = ergebnis.gesetze;
    setLadeFehler(false);
    setAnzeige({ ...ergebnis, verknuepfungsMoeglichkeit });
    void nativenFenstertitelSetzen(
      `Markierungskonflikte (${anzahlMarkierungskonflikte(neu)})`,
    ).catch((fehler: unknown) => {
      console.error('Fenstertitel der Markierungskonflikte konnte nicht gesetzt werden:', fehler);
    });
    if (aufklappenNachAllePruefungRef.current) {
      aufklappenNachAllePruefungRef.current = false;
      setAufgeklappt((vorher) => {
        if (vorher.size > 0) return vorher; // Nutzer hat schon etwas aufgeklappt – nicht überschreiben.
        const erstes = neu.find(
          (g) => !g.fehlendesGesetz && (g.eintraege.length > 0 || g.nichtamtlicheTitelXmlFehlt),
        );
        return erstes ? new Set([gesetzesreferenzSchluessel(erstes.gesetz)]) : vorher;
      });
    }
    setWartetAufAufklappen((wartend) => {
      if (wartend.size === 0) return wartend;
      const nochWartend = new Set(wartend);
      const neuAufklappen: string[] = [];
      for (const kurztitel of wartend) {
        const g = neu.find((x) => gesetzesreferenzSchluessel(x.gesetz) === kurztitel);
        if (g && !g.fehlendesGesetz && (g.eintraege.length > 0 || g.nichtamtlicheTitelXmlFehlt)) {
          neuAufklappen.push(kurztitel);
          nochWartend.delete(kurztitel);
        }
      }
      if (neuAufklappen.length > 0) {
        setAufgeklappt((vorher) => new Set([...vorher, ...neuAufklappen]));
      }
      return nochWartend;
    });
    // Auswahl mit den frischen Daten erneuern. Entfällt die Zeile, wird die
    // nächste verbleibende Zeile desselben Verweises ausgewählt, sonst die
    // davor. Das aktualisiert nur die Konfliktseitenleiste und navigiert nicht im Hauptfenster.
    setAusgewaehlt((vorher) => (vorher ? aktualisiereAuswahl(vorher, neu) : null));
  }

  useEffect(() => {
    aufklappenNachAllePruefungRef.current = true;
    void neuLaden();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Initiales Laden und Aufklappen nur beim Mount; weiteres Laden erfolgt gezielt über Prüfereignisse und Konfliktaktionen.
  }, []);

  function onAufgeklapptAendern(gesetz: Gesetzesreferenz, wert: boolean): void {
    const kurztitel = gesetzesreferenzSchluessel(gesetz);
    setAufgeklappt((vorher) => {
      const neu = new Set(vorher);
      if (wert) neu.add(kurztitel);
      else neu.delete(kurztitel);
      return neu;
    });
  }

  function onErfolgreicherImport(gesetz: Gesetzesreferenz): void {
    const kurztitel = gesetzesreferenzSchluessel(gesetz);
    setWartetAufAufklappen((vorher) => new Set(vorher).add(kurztitel));
  }

  async function onAlleGeprueft(): Promise<void> {
    nachfehlerRef.current = false;
    setAktionsAbschlussOffen(false);
    aufklappenNachAllePruefungRef.current = true;
    if (!(await neuLaden()))
      throw new Error('Die aktualisierte Konfliktanzeige konnte nicht vollständig geladen werden.');
  }

  const aufKonflikteGeaendert = useEffectEvent((status?: string) => {
    if (status === 'ausstehend') {
      // Der gespeicherte Status sperrt sofort; Quellen und Liste erst nach Abschluss nachladen.
      setAnzeige((vorher) => (vorher ? { ...vorher, pruefstatus: 'ausstehend' } : vorher));
      ladeablauf.current.generation++;
      if (!anzeige) void neuLaden();
      return;
    }
    void neuLaden();
  });

  // Zentraler Sync-Punkt: schreibeGesetzKonflikte() (markierungskonflikteSpeicher.ts)
  // ist der EINZIGE Schreibpfad für markierungskonflikte.xml und sendet dort
  // nach jeder Änderung 'markierungskonflikte-geaendert' – UNABHÄNGIG davon, ob
  // die Änderung von einer Markierungs-XML-Aktion hier im Fenster, einem
  // Gesetz-Speichern/-Löschen, einem Sammel-Update oder einem Datei-Import
  // ausgelöst wurde. Ausstehende Stände sperren nur die Aktionen; nach dem
  // Prüfabschluss wird die Anzeige zusammenhängend nachgeladen.
  useEffect(() => {
    let abbau: (() => void) | undefined;
    void (async () => {
      // Globales listen() statt getCurrentWindow().listen(): schreibeGesetzKonflikte()
      // sendet per emitTo('*', …) (Broadcast an ALLE Fenster) – dasselbe Muster,
      // auf das im Projekt sonst überall mit dem globalen listen() aus
      // @tauri-apps/api/event reagiert wird (siehe useGesetzVerwaltung.ts,
      // useLesezeichenUndFavoriten.ts). getCurrentWindow().listen() ist im
      // Projekt sonst nur für gezielt (nicht per '*') adressierte Events in
      // Verwendung (siehe useTiefenLinks.ts) und war hier vermutlich die
      // Ursache dafür, dass dieses Fenster Änderungen zuverlässig verpasste.
      try {
        const { listen } = await import('@tauri-apps/api/event');
        abbau = await listen<{ pruefstatus?: string }>(
          'markierungskonflikte-geaendert',
          (event) => {
            aufKonflikteGeaendert(event?.payload?.pruefstatus);
          },
        );
      } catch (fehler) {
        console.error(
          'Listener für Markierungskonflikt-Updates konnte nicht eingerichtet werden:',
          fehler,
        );
      }
    })();
    return () => abbau?.();
  }, []);

  // ⌘W schließt dieses Fenster komplett statt (wie im Hauptfenster) nur
  // einen Tab – siehe useSchliessenAnfrageSchliesstFenster.ts.
  useSchliessenAnfrageSchliesstFenster(async () => {
    await schliessschutz.bewusstSchliessen(async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
      return true;
    });
  });

  const gesetzZeilen: ReactElement[] = (gesetze ?? []).map((g) => (
    <GesetzZeile
      key={gesetzesreferenzSchluessel(g.gesetz)}
      gesetz={g}
      aufgeklappt={aufgeklappt.has(gesetzesreferenzSchluessel(g.gesetz))}
      onAufgeklapptAendern={onAufgeklapptAendern}
      ausgewaehlt={ausgewaehlt}
      onAuswaehlen={setAusgewaehlt}
    />
  ));

  return (
    <MarkierungskonfliktErklaerung>
      <div
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'row',
          background: 'var(--bg-panel)',
          fontFamily: 'var(--schrift)',
          overflow: 'hidden',
        }}
      >
        <UeberlagerterScrollbereich beschriftung="Markierungskonflikte">
          <>
            {ladeFehler ? (
              <div style={{ ...textRollen.fehlertext, padding: hinweisboxPadding(uiFaktor) }}>
                <TextAnzeige
                  text={
                    ladeFehlerText ??
                    'Die Markierungskonflikte konnten nicht geladen werden. Bitte alle Markierungen erneut prüfen.'
                  }
                />
              </div>
            ) : null}
            {gesetze === null && !ladeFehler ? (
              <div
                style={{
                  padding: hinweisboxPadding(uiFaktor),
                  ...textRollen.standardtext,
                  color: 'var(--text-sekundaer)',
                }}
              >
                <TextAnzeige text="Wird geladen…" />
              </div>
            ) : null}
            {pruefstatus === 'ausstehend' ? (
              <div
                style={{
                  ...textRollen.standardtext,
                  color: 'var(--text-sekundaer)',
                  padding: hinweisboxPadding(uiFaktor),
                }}
              >
                <TextAnzeige text="Die Prüfung steht noch aus. Vorhandene Befunde können überholt sein." />
              </div>
            ) : null}
            {pruefstatus === 'fehlgeschlagen' ? (
              <div style={{ ...textRollen.fehlertext, padding: hinweisboxPadding(uiFaktor) }}>
                <TextAnzeige text="Die Prüfung ist fehlgeschlagen. Vorhandene Befunde können überholt sein. Bitte alle Markierungen erneut prüfen." />
              </div>
            ) : null}
            {aktionsAbschlussOffen ? (
              <div style={{ ...textRollen.fehlertext, padding: hinweisboxPadding(uiFaktor) }}>
                <TextAnzeige text="Nach der Aktion ist kein verlässlicher Prüfabschluss bestätigt. Vorhandene Befunde können überholt sein. Bitte alle Markierungen erneut prüfen." />
              </div>
            ) : null}
            {!aktionsAbschlussOffen && pruefstatus === 'aktuell' && gesetze?.length === 0 ? (
              <div
                style={{
                  padding: hinweisboxPadding(uiFaktor),
                  ...textRollen.leererZustandText,
                }}
              >
                <TextAnzeige text="Keine Markierungskonflikte vorhanden." />
              </div>
            ) : null}
            {gesetzZeilen}
          </>
        </UeberlagerterScrollbereich>
        <Konfliktseitenleiste
          ladeGesetz={bestand?.ladeGesetz}
          auswahl={ausgewaehlt}
          gesetze={gesetze ?? []}
          verknuepfungsMoeglichkeit={
            anzeige?.verknuepfungsMoeglichkeit ?? { moeglich: false, fehler: null }
          }
          wirdGeladen={
            wirdGeladen ||
            anzeige?.pruefstatus === 'ausstehend' ||
            !schliessschutz.bereit ||
            schliessschutz.schliessvorgangAktiv
          }
          darfAktionStarten={() =>
            schliessschutz.bereit && !schliessschutz.istSchliessvorgangAktiv()
          }
          registriereAbschluss={registriereAbschluss}
          onErfolgreicherImport={onErfolgreicherImport}
          onAlleGeprueft={onAlleGeprueft}
          onAktionsNachfehler={onAktionsNachfehler}
          aktionsAbschlussOffen={aktionsAbschlussOffen}
        />
      </div>
    </MarkierungskonfliktErklaerung>
  );
}
