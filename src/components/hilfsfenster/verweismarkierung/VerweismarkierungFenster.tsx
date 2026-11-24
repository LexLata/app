// VerweismarkierungFenster.tsx
//
// Root-Komponente des eigenständigen Verweismarkierung-Hilfsfensters (siehe
// main.tsx: Label-Routing "verweismarkierung-*", fenster.rs:
// verweismarkierung_fenster_oeffnen, useMarkierungen.ts: handleVerweismarkierungAnfrage).
// Bewusst ein EIGENES Fenster statt eines Overlays im Hauptfenster: der
// Nutzer soll währenddessen frei im Hauptfenster weiternavigieren können, um
// z.B. die Zielnorm nachzuschlagen (siehe Absprache).
//
// Ablauf: Kontext abholen (verweismarkierungKontextAbholen) → EIN Zitat-Freitext
// eingeben (z.B. "§§ 280 Abs. 1, 3, 281 ZPO") → Enter/"Fertig" parst den Text
// (zitatParser.ts) und löst JEDE erkannte Normzahl einzeln auf (im
// Ausgangsgesetz, falls kein eigenes Gesetz erkannt wurde, sonst in einem
// über den Fensterbestand gezielt geladenen Fremdgesetz) → speichert die Markierung
// direkt über hinzufuegenMarkierung (dieselbe Persistenz-API wie
// Unterstreichen/Hervorheben) → überträgt die tatsächliche Rückgängig-Aktion
// mit Bestätigung an das aufrufende Fenster und meldet die Anzeigeänderung
// allen Hauptfenstern → schließt nach bestätigtem Abschluss. Speicher- und
// Importablauf liegen im effektfreien useVerweismarkierungSpeicherweg.
import { useGeladeneGesetze } from '@/hooks/tabs/useGeladeneGesetze';
import { verweismarkierungKontextAbholen } from '@/lib/markierungen/markierungen.index';

import {
  uebergebeHinweise,
  useVerweismarkierungSpeicherweg,
} from './useVerweismarkierungSpeicherweg';

import { FensterLadeAnzeige } from '@/components/hilfsfenster/gemeinsam/FensterLadeAnzeige';
import VerweismarkierungFormular from '@/components/hilfsfenster/verweismarkierung/VerweismarkierungFormular';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';
import { useAppAkzentfarbe } from '@/hooks/einstellungen/useAppAkzentfarbe';
import { useFensterEnterTaste } from '@/hooks/fenster/useFensterEnterTaste';
import {
  useFensterSchliessenAbsichern,
  useGespeichertenFensterAbschluss,
} from '@/hooks/fenster/useFensterSchliessenAbsichern';
import { useFensterSichtbarMachen } from '@/hooks/fenster/useFensterSichtbarMachen';
import { useSchliessenAnfrageSchliesstFenster } from '@/hooks/fenster/useSchliessenAnfrageSchliesstFenster';
import type {
  MarkierungsUebertragung,
  VerweismarkierungKontext,
  ZitatFehler,
} from '@/lib/markierungen/markierungen.index';
import {
  verwerfeMarkierungsUebertragung,
  wiederholeMarkierungsUebertragung,
} from '@/lib/markierungen/markierungen.index';

import { useEffect, useRef, useState } from 'react';

import { useMarkierungsAusgangsstellePruefung } from '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster';

export default function VerweismarkierungFenster() {
  const bestand = useGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  const [kontext, setKontext] = useState<VerweismarkierungKontext | null>(null);
  const [zitatText, setZitatText] = useState('');
  const [textbezug, setTextbezug] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  // Eine oder mehrere präzise Fehlermeldungen (siehe Absprache: "wenn es
  // mehrere Fehler gibt, kommen mehrere Fehlermeldungen") – ersetzt das
  // frühere Einzelfeld fehlerArt. Der Button-Text (Formular) wird direkt aus
  // den enthaltenen `art`-Werten abgeleitet (siehe VerweismarkierungFormular.tsx).
  const [fehler, setFehler] = useState<ZitatFehler[]>([]);
  // Text zu Datei-Vergleichsergebnissen (siehe importVersuchen): wird hinter
  // der bestehenden Fehlermeldung angezeigt (z.B. "§ 999 existiert nicht in
  // GG." + "Keine Neuerungen."), nicht mehr als eigenes Banner.
  const [aktualisierungsHinweis, setAktualisierungsHinweis] = useState<string | null>(null);
  // Eigenständig von fehler: wird true, wenn importVersuchen() selbst
  // scheitert (Kürzel im Importindex nicht gefunden) – der Import/Aktualisieren-
  // Button bleibt dann sichtbar (fehler ändert sich nicht), aber deaktiviert,
  // bis das auslösende Feld bearbeitet wird (siehe Reset unten).
  const [importFehlgeschlagen, setImportFehlgeschlagen] = useState(false);
  const [gespeicherterStand, setGespeicherterStand] = useState<{
    text: string;
    textbezug: boolean;
  } | null>(null);
  const abschlussSteuerung = useGespeichertenFensterAbschluss<MarkierungsUebertragung>(
    wiederholeMarkierungsUebertragung,
    verwerfeMarkierungsUebertragung,
    setLaeuft,
    () => setFehler([]),
  );
  const zitatTextRef = useRef<HTMLTextAreaElement>(null);
  // Hält die jeweils aktuelle enterTaste-Funktion für den global registrierten
  // Enter-Handler unten (Ref-Muster gegen stale closures, siehe
  // gesetzeskurzbefehleRef/gesetzeRef). NICHT direkt im Handler-Closure verwenden:
  // die Inputs werden während laeuft per disabled deaktiviert, wodurch der
  // Browser den Fokus verliert und ihn nach dem Reaktivieren NICHT von
  // selbst zurückgibt – ein pro-Input registrierter onKeyDown liefe dann bei
  // einem zweiten Enter-Druck (Cursor "im selben Feld") ins Leere, weil kein
  // Input mehr fokussiert ist. Ein einzelner window-Listener (wie der
  // Escape-Handler) ist davon unabhängig.
  // Misst die tatsächliche Inhaltshöhe für die dynamische Fenstergröße (siehe
  // Effekt unten) – z.B. wenn "Trotzdem speichern" den Warnungsblock einblendet.
  const inhaltRef = useRef<HTMLDivElement>(null);
  // Schutz gegen React StrictMode (Dev-Modus): Effekte laufen dort Mount →
  // simuliertes Unmount → Remount. verweismarkierung_kontext_abholen ENTFERNT den
  // Eintrag serverseitig (.remove(), siehe commands.rs) – ohne diesen Guard
  // würde der erste (verworfene) Lauf den Kontext bereits abholen und
  // löschen, der zweite Lauf fände dann nichts mehr und kontext bliebe für
  // immer null ("Wird geladen …" hängt). Analog zu initialRestoreLief in
  // App.tsx bzw. dem Ref-Muster in useFensterUebertragung.ts.
  const kontextAbgeholtRef = useRef(false);

  // Fenster wird in fenster/hilfsfenster.rs (verweismarkierung_fenster_oeffnen) bewusst
  // UNSICHTBAR erzeugt – siehe useFensterSichtbarMachen.ts für Details.
  useFensterSichtbarMachen();

  const { speichern, importVersuchen, importZuruecksetzen } = useVerweismarkierungSpeicherweg({
    ladeGesetz: bestand?.ladeGesetz,
    kontext,
    zitatText,
    textbezug,
    fehler,
    setFehler,
    setLaeuft,
    setImportFehlgeschlagen,
    setAktualisierungsHinweis,
    setGespeicherterStand,
    abschlussSteuerung,
    istSchliessvorgangAktiv: () => istSchliessvorgangAktiv(),
    schliesseBewusst: () => bewusstSchliessen(schliessen),
  });

  // Setzt die App-Akzentfarbe als CSS-Variablen für DIESES Fenster – jedes
  // Tauri-Fenster hat ein eigenes `document`, daher reicht der Aufruf in
  // App.tsx nicht für dieses Hilfsfenster.
  useAppAkzentfarbe();

  useEffect(() => {
    if (kontextAbgeholtRef.current) return;
    kontextAbgeholtRef.current = true;
    void verweismarkierungKontextAbholen().then((k) => {
      if (!abschlussSteuerung.montiertRef.current) return;
      setKontext(k);
      if (!k) return;
      // Bearbeiten-Modus: bisherige Eingabewerte vorausfüllen (siehe
      // useMarkierungen.ts: handleVerweismarkierungBearbeiten). textbezug=false,
      // wenn der bisherige Verweis KEINEN Textbezug hatte – dann bleibt die
      // Checkbox ohnehin ausgeblendet (siehe JSX unten), der Wert ist hier
      // also nur für den Fall relevant, dass doch einer vorliegt.
      if (k.bearbeiten) {
        setZitatText(k.bearbeiten.zitatText);
        setTextbezug(!!k.bearbeiten.textbezug);
      }
    });
  }, [abschlussSteuerung.montiertRef]);

  const ausgangsPruefung = useMarkierungsAusgangsstellePruefung(
    kontext,
    bestand?.ladeGesetz,
    uebergebeHinweise,
  );
  const {
    bewusstSchliessen,
    bereit,
    registrierungsFehler,
    schliessvorgangAktiv,
    istSchliessvorgangAktiv,
  } = useFensterSchliessenAbsichern(
    gespeicherterStand
      ? zitatText !== gespeicherterStand.text || textbezug !== gespeicherterStand.textbezug
      : zitatText.trim() !== (kontext?.bearbeiten?.zitatText ?? '').trim(),
    (meldung) => {
      if (abschlussSteuerung.montiertRef.current) setFehler([{ art: 'sonst', text: meldung }]);
    },
    () => speichern(false, true),
    async (frage, signal) => {
      await ausgangsPruefung.warteAufAbschluss();
      if (signal?.aborted) return false;
      return abschlussSteuerung.vorSchliessen(frage, signal);
    },
    abschlussSteuerung.laufendesSpeichernVorSchliessen,
  );
  // Esc und ⌘W lösen wie das Fensterkreuz den abgesicherten Listener aus.
  useSchliessenAnfrageSchliesstFenster(async () => {
    await schliessen();
  });

  // Setzt Fehleranzeige + Import-Button-Zustand zurück auf den Ausgangszustand
  // (siehe onChange von normzahl/gesetzFeld unten).
  function fehlerZuruecksetzen() {
    setFehler([]);
    importZuruecksetzen();
  }

  // Enter im Zitat-Textfeld: normalerweise "Fertig" (parsen + speichern),
  // bei aktivem Gesetz/Norm-Fehler stattdessen der Import/Aktualisieren-
  // Button (der an dieser Stelle den "Fertig"-Button ersetzt). WICHTIG: das
  // Zitat wird bei JEDER Änderung komplett neu geparst (siehe Absprache) –
  // es gibt keinen inkrementellen Zustand, der hier fortgeführt werden müsste.
  function enterTaste() {
    if (istSchliessvorgangAktiv() || abschlussSteuerung.beschaeftigtRef.current) return;
    if (abschlussSteuerung.abschlussRef.current !== 'bearbeiten') {
      if (abschlussSteuerung.abschlussRef.current === 'offen')
        void abschlussSteuerung.erneutVersuchen(() => bewusstSchliessen(schliessen));
      else void speichern(false);
      return;
    }
    if (fehler.some((f) => f.art === 'gesetz' || f.art === 'norm')) {
      if (!importFehlgeschlagen) void importVersuchen();
    } else {
      void speichern(false);
    }
  }
  // Globaler Enter-Handler.
  // document.activeElement wird bewusst NICHT auf ein bestimmtes Input
  // geprüft: nach einem fehlgeschlagenen Versuch (disabled-Flackern durch
  // laeuft) ist ggf. gar kein Element mehr fokussiert. Buttons werden
  // ausgenommen, da sie Enter bereits nativ als Klick behandeln – sonst
  // würde z.B. "Abbrechen" per Enter sowohl nativ schließen als auch
  // zusätzlich enterTaste() auslösen.
  useFensterEnterTaste(enterTaste);

  async function schliessen(): Promise<boolean> {
    try {
      // Der CloseRequested-Listener übernimmt Nachfrage und Speicher-Wartezeit.
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
      return true;
    } catch (fehler) {
      console.error('Verweisfenster konnte nicht geschlossen werden:', fehler);
      if (abschlussSteuerung.montiertRef.current)
        setFehler([{ art: 'sonst', text: 'Das Fenster konnte nicht geschlossen werden.' }]);
      return false;
    }
  }

  async function abbrechen() {
    await bewusstSchliessen(schliessen);
  }

  if (!kontext || !bereit) {
    return (
      <UiGroesseProvider>
        <FensterLadeAnzeige fehler={registrierungsFehler} />
      </UiGroesseProvider>
    );
  }

  return (
    <UiGroesseProvider>
      <VerweismarkierungFormular
        kontext={kontext}
        zitatText={zitatText}
        textbezug={ausgangsPruefung.bezugErhalten ? !!kontext.bearbeiten?.textbezug : textbezug}
        ausgangsPruefung={ausgangsPruefung}
        laeuft={laeuft}
        schliessvorgangAktiv={schliessvorgangAktiv}
        gespeichert={abschlussSteuerung.abschluss !== 'bearbeiten'}
        uebertragungOffen={abschlussSteuerung.abschluss === 'offen'}
        onWiederholen={() =>
          abschlussSteuerung.erneutVersuchen(() => bewusstSchliessen(schliessen))
        }
        onTrotzdemSchliessen={() =>
          abschlussSteuerung.trotzdemSchliessen(() => bewusstSchliessen(schliessen))
        }
        fehler={
          abschlussSteuerung.abschluss === 'bearbeiten' && ausgangsPruefung.aktionsFehler
            ? [...fehler, { art: 'sonst', text: ausgangsPruefung.aktionsFehler }]
            : fehler
        }
        importFehlgeschlagen={importFehlgeschlagen}
        zitatTextRef={zitatTextRef}
        inhaltRef={inhaltRef}
        onZitatTextChange={(wert) => {
          if (
            abschlussSteuerung.beschaeftigtRef.current ||
            abschlussSteuerung.abschlussRef.current !== 'bearbeiten' ||
            istSchliessvorgangAktiv()
          )
            return;
          // Jede Änderung macht die bisherige Fehlermeldung ungültig – das
          // Zitat wird beim nächsten Enter/Fertig ohnehin komplett neu geparst
          // (siehe Absprache), ein feingranulares Zurücksetzen nach Fehlerart
          // wie beim früheren Mehrfeld-Formular ist daher nicht mehr nötig.
          fehlerZuruecksetzen();
          setZitatText(wert);
        }}
        onTextbezugChange={(wert) => {
          if (
            !abschlussSteuerung.beschaeftigtRef.current &&
            abschlussSteuerung.abschlussRef.current === 'bearbeiten' &&
            !istSchliessvorgangAktiv()
          )
            setTextbezug(wert);
        }}
        onAbbrechen={abbrechen}
        onTrotzdemSpeichern={() => speichern(true)}
        onImportVersuchen={importVersuchen}
        onFertig={() => speichern(false)}
        onEnter={enterTaste}
        aktualisierungsHinweis={aktualisierungsHinweis}
      />
    </UiGroesseProvider>
  );
}
