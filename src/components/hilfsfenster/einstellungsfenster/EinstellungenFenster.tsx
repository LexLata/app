// EinstellungenFenster.tsx
//
// Eigenständiges, skalierbares Fenster (KEIN Overlay mehr – siehe
// Absprache: der Nutzer soll die Wirkung einer Änderung direkt im
// Hauptfenster sehen können, daher auch KEINE eigenen Vorschau-Blöcke mehr
// in den einzelnen Abschnitten). Label-Routing: main.tsx, Fenster-Erzeugung:
// fenster/hilfsfenster.rs: einstellungen_fenster_oeffnen (Singleton, festes Label
// "einstellungen").
//
// Anders als VerweismarkierungFenster/KommentarFenster gibt es hier KEINEN
// Kontext-Transfer beim Öffnen: dieses Fenster ruft alle Einstellungs-Hooks
// (useTextDarstellung.ts, useFarbschema.ts, usw.) SELBST auf, statt Werte
// als Props zu bekommen – Single Source of Truth bleibt in jedem Fall
// localStorage (siehe Kopfkommentar useLocalStorageState.ts), jedes Fenster
// liest/schreibt unabhängig. Die Live-Wirkung im jeweils ANDEREN Fenster
// kommt über das native `storage`-Event zustande, auf das
// useLocalStorageState.ts seit diesem Fenster zusätzlich hört – siehe
// dortigen Kommentar. Das ist bewusst NICHT
// getestet worden, ob es zwischen zwei Tauri-Fenstern zuverlässig auslöst;
// bei Auffälligkeiten (Hauptfenster übernimmt Änderungen aus diesem Fenster
// nicht live) ist das der erste Verdächtige.
//
// STRUKTUR (Absprache Einstellungen-Umstrukturierung): vier Kategorien
// (Allgemein/Gesetzestext/Werkzeuge/Erweitert, je AllgemeinAbschnitt.tsx/
// GesetzestextAbschnitt.tsx/WerkzeugeAbschnitt.tsx/ErweitertAbschnitt.tsx),
// links davon eine Inhaltsverzeichnis-Seitenleiste mit lokalen Fehlermeldungen
// (EinstellungenSeitenleiste.tsx) mit Klick-Navigation und
// Scroll-Spy-Hervorhebung (useAktiverEinstellungenAbschnitt.ts). Diese
// Komponente bleibt weiterhin die einzige Stelle, die alle
// Einstellungs-Hooks aufruft – die vier Kategorie-Komponenten sind reine,
// zustandslose Darstellung.

import { useLeistenTauschen } from '@/hooks/einstellungen/useLeistenTauschen';
import { useEuFassung } from '@/hooks/einstellungen/useEuFassung';
import { useEuDurchfuehrungsaktSuche } from '@/hooks/einstellungen/useEuDurchfuehrungsaktSuche';
import { nativeBestaetigung } from '@/lib/plattform/tauriHelpers';
import { useEffect, useRef, useState } from 'react';
import { useFensterSichtbarMachen } from '@/hooks/fenster/useFensterSichtbarMachen';
import { AllgemeinAbschnitt } from '@/components/hilfsfenster/einstellungsfenster/AllgemeinAbschnitt';
import { GesetzestextAbschnitt } from '@/components/hilfsfenster/einstellungsfenster/GesetzestextAbschnitt';
import { WerkzeugeAbschnitt } from '@/components/hilfsfenster/einstellungsfenster/WerkzeugeAbschnitt';
import { ErweitertAbschnitt } from '@/components/hilfsfenster/einstellungsfenster/ErweitertAbschnitt';
import { EinstellungenKategorieAbschnitt } from '@/components/hilfsfenster/einstellungsfenster/EinstellungenKategorieAbschnitt';
import {
  EinstellungenSeitenleiste,
  type EinstellungenKategorie,
} from '@/components/hilfsfenster/einstellungsfenster/EinstellungenSeitenleiste';
import { useAppAkzentfarbe } from '@/hooks/einstellungen/useAppAkzentfarbe';
import { useAutoAktualisierungsIntervall } from '@/hooks/einstellungen/useAutoAktualisierungsIntervall';
import { useAppUpdatesAutomatischSuchen } from '@/hooks/einstellungen/useAppUpdatesAutomatischSuchen';
import { useFarbschema } from '@/hooks/einstellungen/useFarbschema';
import { useGesetzestextAkzentfarbe } from '@/hooks/einstellungen/useGesetzestextAkzentfarbe';
import { useHervorhebungsfarbe } from '@/hooks/einstellungen/useHervorhebungsfarbe';
import { useLinuxTitelleistenPraeferenz } from '@/hooks/einstellungen/useLinuxTitelleistenPraeferenz';
import { useMarkierungenDeaktiviert } from '@/hooks/einstellungen/useMarkierungenDeaktiviert';
import { useMinimalistischerModus } from '@/hooks/einstellungen/useMinimalistischerModus';
import { useNachbereitungBeiImport } from '@/hooks/einstellungen/useNachbereitungBeiImport';
import { usePlattformfremdeUiAnzeigen } from '@/hooks/einstellungen/usePlattformfremdeUiAnzeigen';
import { useSeitenleistenTastenkuerzel } from '@/hooks/einstellungen/useSeitenleistenTastenkuerzel';
import { useZitatAbkuerzungen } from '@/hooks/einstellungen/useZitatAbkuerzungen';
import { useTextDarstellung } from '@/hooks/einstellungen/useTextDarstellung';
import { useAktiverEinstellungenAbschnitt } from '@/hooks/einstellungen/useAktiverEinstellungenAbschnitt';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';
import {
  useUiGroesseEinstellung,
  useUiSkalierungsFaktor,
} from '@/hooks/einstellungen/useUiGroesse';
import { overlayAussenPadding } from '@/lib/stil/paddingRollen';
import { useSchliessenAnfrageSchliesstFenster } from '@/hooks/fenster/useSchliessenAnfrageSchliesstFenster';
import { useBeendenAnfrage } from '@/hooks/fenster/useBeendenAnfrage';
import { usePlattform } from '@/hooks/utils/usePlattform';
import {
  registriereEinstellungenBackupMeldung,
  setzeEinstellungenZurueck,
} from '@/lib/einstellungen/einstellungen.index';

const KATEGORIEN: readonly EinstellungenKategorie[] = [
  { id: 'allgemein', titel: 'Allgemein' },
  { id: 'gesetzestext', titel: 'Gesetzestext' },
  { id: 'werkzeuge', titel: 'Werkzeuge' },
  { id: 'erweitert', titel: 'Erweitert' },
];
const KATEGORIE_IDS = KATEGORIEN.map((k) => k.id);

export default function EinstellungenFenster() {
  return (
    <UiGroesseProvider>
      <EinstellungenFensterInhalt />
    </UiGroesseProvider>
  );
}

function EinstellungenFensterInhalt() {
  const { istLinux } = usePlattform();
  const [zuruecksetzenLaeuft, setZuruecksetzenLaeuft] = useState(false);
  const [backupFehler, setBackupFehler] = useState<string>();
  const [zuruecksetzFehler, setZuruecksetzFehler] = useState<string>();
  useEffect(() => registriereEinstellungenBackupMeldung(setBackupFehler), []);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Fenster wird in fenster/hilfsfenster.rs (einstellungen_fenster_oeffnen) bewusst
  // UNSICHTBAR erzeugt – siehe useFensterSichtbarMachen.ts für Details.
  useFensterSichtbarMachen();

  // ⌘W schließt dieses Fenster komplett statt (wie im Hauptfenster) nur
  // einen Tab – siehe useSchliessenAnfrageSchliesstFenster.ts.
  useSchliessenAnfrageSchliesstFenster();
  // Ohne ungespeicherte Eingaben sofort bereit.
  useBeendenAnfrage();

  const { markierungenDeaktiviert, setMarkierungenDeaktiviert } = useMarkierungenDeaktiviert();
  const { minimalistischerModus, setMinimalistischerModus } = useMinimalistischerModus();
  const { euFassung, setEuFassung } = useEuFassung();
  const { euDurchfuehrungsaktSuche, setEuDurchfuehrungsaktSuche } = useEuDurchfuehrungsaktSuche();
  const { nachbereitungBeiImport, setNachbereitungBeiImport } = useNachbereitungBeiImport();
  const { linuxTitelleistenPraeferenz, setLinuxTitelleistenPraeferenz } =
    useLinuxTitelleistenPraeferenz();
  const { plattformfremdeUiAnzeigen, setPlattformfremdeUiAnzeigen } =
    usePlattformfremdeUiAnzeigen();
  const { leistenTauschen, setLeistenTauschen } = useLeistenTauschen();
  const { seitenleistenTastenkuerzel, setSeitenleistenTastenkuerzel } =
    useSeitenleistenTastenkuerzel();
  const {
    abkuerzungenAktiv: zitatAbkuerzungenAktiv,
    setAbkuerzungenAktiv: setZitatAbkuerzungenAktiv,
    ohnePunkt: zitatOhnePunkt,
    setOhnePunkt: setZitatOhnePunkt,
    roemischeAbsaetze: zitatRoemischeAbsaetze,
    setRoemischeAbsaetze: setZitatRoemischeAbsaetze,
  } = useZitatAbkuerzungen();
  const { autoAktualisierungsIntervall, setAutoAktualisierungsIntervall } =
    useAutoAktualisierungsIntervall();
  const { appUpdatesAutomatischSuchen, setAppUpdatesAutomatischSuchen } =
    useAppUpdatesAutomatischSuchen();
  const { farbschema, setFarbschema } = useFarbschema();
  const { appAkzentfarbe, setAppAkzentfarbe } = useAppAkzentfarbe();
  const { gesetzestextAkzentfarbe, setGesetzestextAkzentfarbe } = useGesetzestextAkzentfarbe();
  // Bewusst useUiGroesseEinstellung() (Context), NICHT roh useUiGroesse() –
  // diese Komponente liegt UNTERHALB von UiGroesseProvider (siehe oben),
  // damit Dropdown-Änderung und UiGroesseProvider dieselbe Zustandsquelle
  // teilen (siehe Begründung in useUiGroesse.tsx).
  const { uiGroesse, setUiGroesse } = useUiGroesseEinstellung();
  const uiFaktor = useUiSkalierungsFaktor();

  const {
    schriftgroesse,
    setSchriftgroesse,
    leistenSchriftgroesse,
    setLeistenSchriftgroesse,
    schriftart,
    setSchriftart,
    zeilenabstand,
    setZeilenabstand,
    satzNeuZeile,
    setSatzNeuZeile,
    blocksatz,
    setBlocksatz,
    silbentrennung,
    setSilbentrennung,
    randbreite,
    setRandbreite,
    strukturKontextLeisteGroesse,
    setStrukturKontextLeisteGroesse,
    lesbareZeilenlaenge,
    setLesbareZeilenlaenge,
    lesbareZeilenlaengeBreite,
    setLesbareZeilenlaengeBreite,
  } = useTextDarstellung();

  const { hervorhebungsfarbe, setHervorhebungsfarbe } = useHervorhebungsfarbe();

  const aktiveKategorieId = useAktiverEinstellungenAbschnitt(scrollContainerRef, KATEGORIE_IDS);

  /** Setzt ALLE Einstellungen zurück (Absprache – anders als der Export
   *  umfasst das auch den letzten Exportordner, siehe ALLE_SCHLUESSEL-
   *  Kommentar in einstellungenSpeicher.ts). setzeEinstellungenZurueck()
   *  löscht zuerst das Backup und aktualisiert danach localStorage und stößt per synthetischem
   *  StorageEvent auch die in DIESEM Fenster bereits gemounteten Hooks an
   *  (siehe dortiger Kommentar) – kein manuelles Re-Read der einzelnen
   *  Werte hier nötig. */
  async function einstellungenZuruecksetzen() {
    const bestaetigt = await nativeBestaetigung(
      'Wirklich alle Einstellungen auf die Standardwerte zurücksetzen?',
      {
        title: 'Einstellungen zurücksetzen',
        kind: 'warning',
        okLabel: 'Zurücksetzen',
        cancelLabel: 'Abbrechen',
      },
    );
    if (!bestaetigt) return;
    setZuruecksetzenLaeuft(true);
    try {
      const ergebnis = await setzeEinstellungenZurueck();
      if (!ergebnis.erfolgreich) {
        setZuruecksetzFehler(
          'Die Einstellungen konnten nicht zurückgesetzt werden, weil das Backup nicht gelöscht werden konnte. Bitte erneut versuchen.',
        );
      } else {
        setZuruecksetzFehler(undefined);
      }
    } finally {
      setZuruecksetzenLaeuft(false);
    }
  }

  return (
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
      <EinstellungenSeitenleiste
        kategorien={KATEGORIEN}
        aktiveId={aktiveKategorieId}
        fehlermeldungen={[backupFehler, zuruecksetzFehler].filter((text) => text !== undefined)}
      />

      {/* Inhalt – KEINE eigene Kopfzeile/Überschrift mehr, die steht schon
          in der nativen Fenster-Titelleiste (Titel "Einstellungen", siehe
          fenster/hilfsfenster.rs: einstellungen_fenster_oeffnen). overflowX:
          'hidden' bewusst gesetzt: ohne das taucht bei manchen
          Fenstergrößen eine minimal wackelnde horizontale Scrollleiste auf
          (Slider/Selects, die auf den Pixel genau an die Content-Breite
          stoßen), obwohl inhaltlich nichts zu scrollen ist. */}
      <div
        ref={scrollContainerRef}
        style={{
          padding: overlayAussenPadding(uiFaktor),
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        <EinstellungenKategorieAbschnitt id="allgemein" titel="Allgemein" ersterAbschnitt>
          <AllgemeinAbschnitt
            farbschema={farbschema}
            onFarbschemaAendern={setFarbschema}
            appAkzentfarbe={appAkzentfarbe}
            onAppAkzentfarbeAendern={setAppAkzentfarbe}
            uiGroesse={uiGroesse}
            onUiGroesseAendern={setUiGroesse}
            appUpdatesAutomatischSuchen={appUpdatesAutomatischSuchen}
            onAppUpdatesAutomatischSuchenAendern={setAppUpdatesAutomatischSuchen}
          />
        </EinstellungenKategorieAbschnitt>

        <EinstellungenKategorieAbschnitt id="gesetzestext" titel="Gesetzestext">
          <GesetzestextAbschnitt
            schriftgroesse={schriftgroesse}
            onSchriftgroesseAendern={setSchriftgroesse}
            schriftart={schriftart}
            onSchriftartAendern={setSchriftart}
            zeilenabstand={zeilenabstand}
            onZeilenabstandAendern={setZeilenabstand}
            satzNeuZeile={satzNeuZeile}
            onSatzNeuZeileAendern={setSatzNeuZeile}
            blocksatz={blocksatz}
            onBlocksatzAendern={setBlocksatz}
            silbentrennung={silbentrennung}
            onSilbentrennungAendern={setSilbentrennung}
            randbreite={randbreite}
            onRandbreiteAendern={setRandbreite}
            lesbareZeilenlaenge={lesbareZeilenlaenge}
            onLesbareZeilenlaengeAendern={setLesbareZeilenlaenge}
            lesbareZeilenlaengeBreite={lesbareZeilenlaengeBreite}
            onLesbareZeilenlaengeBreiteAendern={setLesbareZeilenlaengeBreite}
            strukturKontextLeisteGroesse={strukturKontextLeisteGroesse}
            onStrukturKontextLeisteGroesseAendern={setStrukturKontextLeisteGroesse}
            gesetzestextAkzentfarbe={gesetzestextAkzentfarbe}
            onGesetzestextAkzentfarbeAendern={setGesetzestextAkzentfarbe}
          />
        </EinstellungenKategorieAbschnitt>

        <EinstellungenKategorieAbschnitt id="werkzeuge" titel="Werkzeuge">
          <WerkzeugeAbschnitt
            autoAktualisierungsIntervall={autoAktualisierungsIntervall}
            onAutoAktualisierungsIntervallAendern={setAutoAktualisierungsIntervall}
            markierungenDeaktiviert={markierungenDeaktiviert}
            onMarkierungenDeaktiviertAendern={setMarkierungenDeaktiviert}
            hervorhebungsfarbe={hervorhebungsfarbe}
            onHervorhebungsfarbeAendern={setHervorhebungsfarbe}
            leistenSchriftgroesse={leistenSchriftgroesse}
            onLeistenSchriftgroesseAendern={setLeistenSchriftgroesse}
            leistenTauschen={leistenTauschen}
            onLeistenTauschenAendern={setLeistenTauschen}
            seitenleistenTastenkuerzel={seitenleistenTastenkuerzel}
            onSeitenleistenTastenkuerzelAendern={setSeitenleistenTastenkuerzel}
            zitatAbkuerzungenAktiv={zitatAbkuerzungenAktiv}
            onZitatAbkuerzungenAktivAendern={setZitatAbkuerzungenAktiv}
            zitatOhnePunkt={zitatOhnePunkt}
            onZitatOhnePunktAendern={setZitatOhnePunkt}
            zitatRoemischeAbsaetze={zitatRoemischeAbsaetze}
            onZitatRoemischeAbsaetzeAendern={setZitatRoemischeAbsaetze}
          />
        </EinstellungenKategorieAbschnitt>

        <EinstellungenKategorieAbschnitt id="erweitert" titel="Erweitert">
          <ErweitertAbschnitt
            minimalistischerModus={minimalistischerModus}
            onMinimalistischerModusAendern={setMinimalistischerModus}
            euFassung={euFassung}
            onEuFassungAendern={setEuFassung}
            euDurchfuehrungsaktSuche={euDurchfuehrungsaktSuche}
            onEuDurchfuehrungsaktSucheAendern={setEuDurchfuehrungsaktSuche}
            nachbereitungBeiImport={nachbereitungBeiImport}
            onNachbereitungBeiImportAendern={setNachbereitungBeiImport}
            istLinux={istLinux}
            linuxTitelleistenPraeferenz={linuxTitelleistenPraeferenz}
            onLinuxTitelleistenPraeferenzAendern={setLinuxTitelleistenPraeferenz}
            plattformfremdeUiAnzeigen={plattformfremdeUiAnzeigen}
            onPlattformfremdeUiAnzeigenAendern={setPlattformfremdeUiAnzeigen}
            zuruecksetzenLaeuft={zuruecksetzenLaeuft}
            onZuruecksetzen={einstellungenZuruecksetzen}
          />
        </EinstellungenKategorieAbschnitt>
      </div>
    </div>
  );
}
