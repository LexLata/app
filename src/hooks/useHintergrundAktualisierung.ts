// useHintergrundAktualisierung.ts
//
// Führt die "Alle aktualisieren"-Logik aus AktualisierenOverlay.tsx
// automatisch im Hintergrund aus, statt nur auf Nutzeraktion zu warten –
// gesteuert über die Einstellung "Automatische Aktualisierung"
// (useAutoAktualisierungsIntervall.ts). Nutzt dieselben Importoperationen
// wie der Overlay (siehe lib/import/import.index.ts); Kandidatenauswahl
// und Aktualisierung liegen im Importmodul.
//
// Terminierung: Jedes Gesetz wird anhand seiner eigenen Verarbeitungszeit
// geprüft. Ohne Prüfzeit ist es fällig; ohne fällige Gesetze gibt es weder
// Vorgangsregistrierung noch Importindexzugriff.
//
// Fensterübergreifende Koordination: Mehrere Fenster können (v. a. beim
// App-Start durch Session-Wiederherstellung) nahezu gleichzeitig mounten und
// würden ohne Koordination gleichzeitig dieselben Gesetze prüfen. Ein
// Rust-seitige Vorgangsregistrierung (siehe commands.rs:
// ImportAktualisierungVorgaenge) stellt sicher, dass jeweils nur ein Fenster
// einen automatischen Durchlauf ausführt; eine als veraltet geltende
// Registrierung (>1h, siehe
// IMPORT_AKTUALISIERUNG_STALE_SCHWELLE_MS in commands.rs) kann übernommen
// werden, falls das prüfende Fenster mitten im Durchlauf abgestürzt ist.
// Dieselbe Registrierung nutzen auch alle MANUELLEN Import-/
// Aktualisierungsvorgänge (AktualisierenOverlay.tsx,
// OeffnenOverlay.tsx, VerweismarkierungFenster.tsx, useGesetzOeffnen.ts) beim
// Start ihres jeweiligen Vorgangs – nur die automatische Operation prüft
// laufende Registrierungen und weicht zurück. Manuelle Vorgänge blockieren
// sich nicht gegenseitig. Die erste Prüfung und der Stundentimer warten
// auf den abgeschlossenen Fensterstart und weitere zehn Sekunden.
// Bestandsänderungen lösen keine zusätzliche automatische Prüfung aus.
//
// Rückgabe: ob der erste Durchlauf dieses Fensters beendet oder nicht fällig
// ist (abgeschaltet, nichts fällig oder leerer abgeglichener Bestand). Darauf
// wartet die automatische Updateprüfung (useAppUpdate.ts).
//
// Ergebnis-Verteilung: Das prüfende Fenster patcht seine eigene Liste/offene
// Tabs NICHT mehr direkt (kein gesetzNeuLaden-Callback mehr nötig) – das
// erledigt inzwischen zentral der 'gesetze-geaendert'-Broadcast in
// gesetzSpeicher.ts (ausgelöst durch speichereGesetz() innerhalb von
// aktualisiereGesetze), auf den auch dieses Fenster selbst
// hört (useGesetzVerwaltung.ts). Reine Info-Refreshs ohne Inhaltsänderung
// (Kategorie 'unveraendert') sind davon bewusst NICHT abgedeckt (siehe
// gesetzSpeicherEreignisse.ts) und laufen daher weiterhin über den separaten,
// leichten onInfoAktualisiert-Pfad. Zusätzlich wird ein eigenes, ebenfalls
// fensterweit gesendetes Event für die Banner-Benachrichtigung ausgelöst.
// bannerStore.ts ist bewusst fensterlokal (siehe dortiger Kommentar) – daher
// hört JEDES Fenster (nicht nur das prüfende) auf dieses Event und zeigt den
// Banner selbst an, statt den Store fensterübergreifend zu machen.

import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import {
  erzeugeBannerMeldungsSammlung,
  zeigeAktionsMeldungsBanner,
  zeigeBanner,
  type Vorgangserfolg,
} from '@/lib/banner/banner.index';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { messeAsync } from '@/lib/utils/perfMessung';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { ermittleFaelligeGesetze, aktualisiereGesetzeAutomatisch } from '@/lib/import/import.index';
import {
  leseAutoAktualisierungsIntervall,
  INTERVALL_MS,
} from '@/hooks/einstellungen/useAutoAktualisierungsIntervall';

// Wie oft (während die App läuft) erneut geprüft wird, ob die Fälligkeits-
// Schwelle inzwischen erreicht ist – reiner Datums-Vergleich, kein
// Netzwerkzugriff, daher unbedenklich häufig. Deckt den Fall ab, dass die
// App über den nächsten fälligen Zeitpunkt hinweg durchgehend geöffnet
// bleibt (ohne Neustart, der die Prüfung ohnehin beim Mount auslöst).
const START_WARTEZEIT_MS = 10_000;
const PRUEF_INTERVALL_MS = 60 * 60 * 1000; // 1 Stunde

const BANNER_EVENT = 'hintergrund-aktualisierung-abgeschlossen';

interface HintergrundAktualisierungsBanner {
  aktualisiert: string[];
  meldungen: AktionsMeldung[];
}

const AUTOMATISCH_AKTUALISIERT: Vorgangserfolg['ueberschrift'] = () => 'Automatisch aktualisiert';

function meldeImportindexFehler(importindexFehlerAngezeigtRef: RefObject<boolean>) {
  console.error(
    'Automatische Aktualisierung nicht möglich: Der Importindex konnte nicht gelesen werden.',
  );
  if (!importindexFehlerAngezeigtRef.current) {
    importindexFehlerAngezeigtRef.current = true;
    zeigeBanner({
      art: 'systemfehler',
      text: 'Automatische Aktualisierung nicht möglich: Der Importindex konnte nicht gelesen werden.',
      typ: 'fehler',
    });
  }
}

interface UseHintergrundAktualisierungParams {
  startAbgeschlossen: boolean;
  /** Suchverzeichnis abgeglichen: Ein leeres `gesetze` heißt dann „nichts zu prüfen“. */
  bestandAbgeglichen?: boolean;
  gesetze: LesbarerSuchverzeichniseintrag[];
  onInfoAktualisiert: (aktualisierteGesetze: GesetzDarstellung[]) => void;
}

export function useHintergrundAktualisierung({
  gesetze,
  startAbgeschlossen,
  bestandAbgeglichen = false,
  onInfoAktualisiert,
}: UseHintergrundAktualisierungParams): boolean {
  const importindexFehlerAngezeigtRef = useRef(false);
  const bereitRef = useRef(false);
  const [bereit, setBereit] = useState(false);
  useEffect(() => {
    if (!startAbgeschlossen) return;
    const timer = setTimeout(() => {
      bereitRef.current = true;
      setBereit(true);
    }, START_WARTEZEIT_MS);
    return () => {
      clearTimeout(timer);
      bereitRef.current = false;
    };
  }, [startAbgeschlossen]);

  // Immer aktueller Spiegel von gesetze für den Timer-Callback (gleiches
  // Ref-Spiegel-Muster wie tabsRef/aktiverTabIdRef in useAppTabs.ts) – der
  // setInterval-Callback wird einmalig registriert und darf keine veraltete
  // gesetze-Liste aus dem Erstellungszeitpunkt verwenden.
  const gesetzeRef = useRef(gesetze);
  useEffect(() => {
    gesetzeRef.current = gesetze;
  }, [gesetze]);

  // Ebenso für die Callback-Prop, da sie sich bei jedem Render von App.tsx
  // neu erzeugt (Closure aus gesetzInfoAktualisieren dort) und der Timer
  // sonst mit einer veralteten Version arbeiten würde.
  const onInfoAktualisiertRef = useRef(onInfoAktualisiert);
  useEffect(() => {
    onInfoAktualisiertRef.current = onInfoAktualisiert;
  }, [onInfoAktualisiert]);

  async function pruefeUndFuehreAusFallsFaellig() {
    if (!bereitRef.current) return;
    const intervall = leseAutoAktualisierungsIntervall();
    if (intervall === 'nie') return;

    const faelligeGesetze = ermittleFaelligeGesetze(
      gesetzeRef.current,
      INTERVALL_MS[intervall],
      Date.now(),
    );
    if (faelligeGesetze.length === 0) return;

    const meldungen = erzeugeBannerMeldungsSammlung();
    try {
      const vorgang = await messeAsync('Automatische Aktualisierung', () =>
        aktualisiereGesetzeAutomatisch(faelligeGesetze, meldungen.meldungEmpfangen),
      );
      if (vorgang.art === 'zurueckgestellt' || vorgang.art === 'keineVerbindung') return;
      if (vorgang.art === 'importindexNichtLesbar') {
        meldeImportindexFehler(importindexFehlerAngezeigtRef);
        return;
      }
      const { aktualisierteReferenzen, unveraenderteGesetze } = vorgang.ergebnis;

      if (unveraenderteGesetze.length > 0) onInfoAktualisiertRef.current(unveraenderteGesetze);

      // Andere Fenster (und dieses Fenster selbst über useGesetzVerwaltung.ts)
      // erfahren von tatsächlich geänderten Gesetzen zentral über den
      // 'gesetze-geaendert'-Broadcast in gesetzSpeicher.ts (ausgelöst durch
      // speichereGesetz() innerhalb von aktualisiereGesetze) –
      // kein eigener Reload/Tab-Patch hier mehr nötig.

      // Banner nur bei tatsächlicher Änderung oder Befund – ein rein
      // bestätigender "keine Neuerungen"-Banner wäre bei wöchentlichem
      // Standardintervall nur Hintergrundrauschen (Annahme, siehe Absprache).
      // Gegliedert wird erst im empfangenden Fenster.
      const payload: HintergrundAktualisierungsBanner = {
        aktualisiert: aktualisierteReferenzen.map((referenz) => referenz.kurztitel),
        meldungen: [...meldungen.abschliessen()],
      };
      if (payload.aktualisiert.length > 0 || payload.meldungen.length > 0) {
        const { emitTo } = await import('@tauri-apps/api/event');
        await emitTo('*', BANNER_EVENT, payload);
      }
    } catch {
      // Kein Tauri-Kontext (z. B. Web-Vorschau) oder Netzwerkfehler – die
      // automatische Aktualisierung ist rein optional, ein Fehlschlag darf
      // die App nicht stören. Der nächste Timer-Tick versucht es erneut.
    } finally {
      meldungen.abschliessen();
    }
  }

  // Beim Neustart prüfen (sobald die Gesetzeliste geladen ist – siehe unten)
  // und danach stündlich erneut (deckt eine durchgehend über den
  // Fälligkeitszeitpunkt hinweg geöffnete App ab, siehe Kommentar bei
  // PRUEF_INTERVALL_MS).
  //
  // WICHTIG: `gesetze` ist beim allerersten Mount noch leer ([]) – die Liste
  // wird erst asynchron NACH dem Mount von der Platte geladen (siehe
  // App.tsx: ladeGesetzeUndGebenZurueck in initialRestore). Eine Prüfung
  // direkt beim Mount fände daher noch keine Kandidaten und bräche sofort
  // ab, ohne dass danach je nachgeholt würde (bis zum nächsten Stunden-Tick,
  // dem eigentlichen Bug). Die "Neustart"-Prüfung wird daher stattdessen
  // ausgelöst, sobald `gesetze` zum ERSTEN MAL befüllt ist –
  // anfangspruefungGelaufenRef verhindert Wiederholung bei jeder weiteren
  // gesetze-Änderung (z.B. durch spätere Importe).
  const anfangspruefungGelaufenRef = useRef(false);
  const [ersterDurchlaufBeendet, setErsterDurchlaufBeendet] = useState(false);
  useEffect(() => {
    if (!bereit || anfangspruefungGelaufenRef.current) return;
    if (gesetze.length === 0) {
      // Leerer abgeglichener Bestand: nichts fällig. Ein späterer Import
      // löst die Anfangsprüfung weiterhin aus.
      if (bestandAbgeglichen) setErsterDurchlaufBeendet(true);
      return;
    }
    anfangspruefungGelaufenRef.current = true;
    void pruefeUndFuehreAusFallsFaellig().finally(() => setErsterDurchlaufBeendet(true));
  }, [gesetze, bereit, bestandAbgeglichen]);

  useEffect(() => {
    const timer = setInterval(() => {
      void pruefeUndFuehreAusFallsFaellig();
    }, PRUEF_INTERVALL_MS);
    return () => clearInterval(timer);
  }, []);

  // Banner-Anzeige: JEDES Fenster hört auf dieses Event, nicht nur das
  // prüfende (bannerStore.ts ist bewusst fensterlokal).
  //
  // abgebrochen-Flag statt des sonst üblichen einfachen unlisten-Musters:
  // unter React StrictMode (main.tsx) läuft dieser Effekt in der Entwicklung
  // zweimal (mount → cleanup → erneuter mount). Löst die cleanup-Funktion des
  // ERSTEN Durchlaufs aus, BEVOR das listen()-Promise aufgelöst ist, bliebe
  // unlisten zu diesem Zeitpunkt undefined – der erste Listener würde nie
  // abgemeldet, wodurch zwei Listener aktiv blieben und jedes Event doppelt
  // verarbeitet würde (genau der gemeldete Bug). Löst abgebrochen bereits
  // vor der Zuweisung aus, wird der frisch erhaltene Listener stattdessen
  // sofort wieder abgemeldet.
  useEffect(() => {
    let abgebrochen = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<HintergrundAktualisierungsBanner>(BANNER_EVENT, (event) => {
          zeigeAktionsMeldungsBanner(event.payload.meldungen, {
            namen: event.payload.aktualisiert,
            ueberschrift: AUTOMATISCH_AKTUALISIERT,
            satz: (aufzaehlung) => `${aufzaehlung} automatisch aktualisiert.`,
          });
        });
        if (abgebrochen) {
          fn();
          return;
        }
        unlisten = fn;
      } catch (fehler) {
        console.error(
          'Listener für Aktualisierungs-Banner konnte nicht eingerichtet werden:',
          fehler,
        );
      }
    })();
    return () => {
      abgebrochen = true;
      unlisten?.();
    };
  }, []);

  return ersterDurchlaufBeendet;
}
