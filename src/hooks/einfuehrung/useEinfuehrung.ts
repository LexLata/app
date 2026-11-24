// useEinfuehrung.ts
//
// Verwaltet den Ablauf der Einführung (Onboarding-Tutorial), die beim ersten
// Start der App als Schicht über die restliche Oberfläche gelegt wird (siehe
// EinfuehrungsOverlay.tsx). Reine Ablaufsteuerung – die Sprechblasen-Texte
// und Ziel-Zuordnungen selbst leben in EinfuehrungsOverlay.teilaktionen.ts, die
// Darstellung in EinfuehrungsOverlay.tsx.
//
// Teilaktionsnummerierung (0-indiziert, siehe EinfuehrungsOverlay.teilaktionen.ts
// für die zugehörigen Texte):
//   0  Öffnen-Overlay öffnen (Klick auf Lupe)
//   1  Norm eingeben + Enter
//   2  Favorit setzen
//   3  Favorit entfernen
//   4  Lesezeichen setzen
//   5  Einzelnes Element einklappen (Normzeile/Überschrift anklicken)
//   6  Global zuklappen
//   7  Global aufklappen
//   8  Abschluss (kein Ziel-Element, eigener Text + „Fertig"-Button)
//
// Die Fortschritts-ERKENNUNG (wann eine Teilaktion als erledigt gilt) lebt
// bewusst NICHT hier, sondern in App.tsx: dort sind bereits alle relevanten
// Signale (favoritenStatus, klappstufenStatus, aktivesOverlay, gesetzOffen,
// istAktuellLesezeichen, onEinklappZustandChange) als State/Callback
// vorhanden – ein zweites Abbild dieser Signale hier hineinzuziehen, würde
// nur eine überflüssige Zwischenschicht schaffen. Dieser Hook stellt daher
// nur naechsteTeilaktion()/beenden() bereit, die App.tsx aus den jeweiligen
// Effekten heraus aufruft.
//
// Persistenz: EIN einzelnes boolesches Flag über useLocalStorageState
// (Muster wie useMinimalistischerModus.ts u.a.) – der Teilaktionsindex selbst
// ist bewusst NICHT persistent (In-Session-State reicht: bricht der Nutzer
// mitten in der Einführung ab, ohne "Überspringen" zu drücken, z.B. durch
// Fenster schließen, beginnt sie beim nächsten Start bei Teilaktion 0 neu,
// statt an einer u.U. nicht mehr passenden Stelle fortzufahren).
import { LETZTE_TEILAKTION, istErlaubt } from '@/lib/domain/einfuehrung/einfuehrung.index';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import { MARKIERUNGSKONFLIKT_ERKLAERUNG_GELESEN_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useCallback, useEffect, useState } from 'react';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';
import { getName } from '@tauri-apps/api/app';

export function useEinfuehrung() {
  const [abgeschlossen, setAbgeschlossen] = useLocalStorageState(
    'einfuehrung.abgeschlossen',
    false,
    { parse: (roh) => roh === 'true' },
  );
  const [, setErklaerungGelesen] = useLocalStorageState(
    MARKIERUNGSKONFLIKT_ERKLAERUNG_GELESEN_KEY,
    false,
    { parse: (roh) => roh === 'true' },
  );
  const [teilaktion, setTeilaktion] = useState(0);

  // Für den Abschlusstext ("Viel Freude mit {appName}.") – der Produktname
  // steht zentral in src-tauri/tauri.conf.json (productName) und wird hier
  // zur Laufzeit ausgelesen, statt ihn als Freitext zu duplizieren: ändert
  // sich der Name künftig, muss nur die conf angepasst werden.
  const [appName, setAppName] = useState('Gesetze');
  useEffect(() => {
    let abgebrochen = false;
    getName()
      .then((name) => {
        if (!abgebrochen) setAppName(name);
      })
      // Kein Tauri-Kontext (z.B. reiner Browser-Dev-Modus) – Fallback bleibt
      // der oben gesetzte Default.
      .catch(() => {});
    return () => {
      abgebrochen = true;
    };
  }, []);

  const aktiv = !abgeschlossen;
  const fertig = teilaktion > LETZTE_TEILAKTION;

  // Native Menüleiste (nur macOS, siehe menu.rs-Kopfkommentar) für die
  // Dauer der Einführung sperren – sonst könnte der Nutzer z. B. über
  // "Einstellungen" am Tutorial vorbei in den Minimalistischen Modus
  // wechseln. Best-effort wie das übrige Tauri-Invoke-Muster im Projekt
  // (siehe markierungskonflikteSpeicher.fensterOeffnen.ts): schlägt der Aufruf fehl
  // (kein Tauri-Kontext, z.B. Browser-Dev-Modus, oder Windows/Linux ohne
  // native Menüleiste), bleibt das folgenlos.
  useEffect(() => {
    let abgebrochen = false;
    void (async () => {
      try {
        if (!abgebrochen) await rufeBefehl('menueleiste_aktivieren', { aktiv: !aktiv });
      } catch {
        // siehe Kommentar oben
      }
    })();
    return () => {
      abgebrochen = true;
    };
  }, [aktiv]);

  // zielTeilaktion erlaubt einen direkten Sprung (statt nur +1) – aktuell nur
  // gebraucht, wenn die Norm bei Teilaktion 2 (Favorit hinzufügen) bereits
  // Favorit ist: der Klick entfernt ihn dann faktisch, Teilaktion 3 (Favorit
  // entfernen) würde denselben Vorgang nur wiederholen und wird daher
  // übersprungen (siehe App.tsx: favoritSpeichernMitEinfuehrung).
  const naechsteTeilaktion = useCallback((zielTeilaktion?: number) => {
    setTeilaktion((s) => zielTeilaktion ?? s + 1);
  }, []);

  const beenden = useCallback(() => {
    setAbgeschlossen(true);
  }, [setAbgeschlossen]);

  // Menü Hilfe > "Einführung erneut durchführen" (siehe menu.rs). Setzt
  // sowohl das persistente Flag als auch den In-Session-Teilaktion zurück,
  // damit die Einführung wirklich wieder bei Teilaktion 0 beginnt.
  const neuStarten = useCallback(() => {
    setErklaerungGelesen(false);
    setAbgeschlossen(false);
    setTeilaktion(0);
  }, [setAbgeschlossen, setErklaerungGelesen]);

  const sperren = {
    normAuswahlGesperrt: aktiv && !istErlaubt(teilaktion, 'norm-wechseln'),
    ueberschriftenGesperrt: aktiv && !istErlaubt(teilaktion, 'ueberschrift-waehlen'),
    einklappenGesperrt: aktiv && !istErlaubt(teilaktion, 'titel-ein-ausklappen'),
  };

  return { aktiv, teilaktion, fertig, appName, naechsteTeilaktion, beenden, neuStarten, sperren };
}
