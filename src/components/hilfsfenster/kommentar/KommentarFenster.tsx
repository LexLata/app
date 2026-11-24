// KommentarFenster.tsx
//
// Root-Komponente des eigenständigen Kommentar-Hilfsfensters (siehe
// main.tsx: Label-Routing "kommentar-*", fenster.rs: kommentar_fenster_oeffnen,
// useMarkierungen.ts: handleKommentarAnfrage). Strukturell eine schlankere
// Kopie von VerweismarkierungFenster.tsx: derselbe Fenster-Mechanismus (eigenes
// Tauri-Fenster, ResizeObserver-Höhenanpassung, Escape/Enter-Handling,
// StrictMode-Schutz), aber ohne Zitat-Parsing/Ziel-Auflösung – der
// Kommentartext ist reiner, unveränderter Freitext.
//
// Ablauf: Kontext abholen (kommentarKontextAbholen) → Freitext eingeben →
// Enter/"Fertig" speichert direkt über hinzufuegenMarkierung bzw.
// aktualisiereKommentar (dieselbe Persistenz-API wie Unterstreichen/
// Hervorheben/Verweismarkierung) → überträgt die tatsächliche Rückgängig-Aktion
// mit Bestätigung an das aufrufende Fenster und meldet die Anzeigeänderung
// allen Hauptfenstern → schließt nach bestätigtem Abschluss.
import { useGeladeneGesetze } from '@/hooks/tabs/useGeladeneGesetze';
import { kommentarKontextAbholen } from '@/lib/markierungen/markierungen.index';

import { useEffect, useRef, useState } from 'react';
import {
  erzeugeAktionsMeldungsSammlung,
  type AktionsMeldung,
} from '@/lib/domain/app/aktionsMeldung';
import { sicherungsHinweis } from '@/lib/domain/app/meldungsgruppen';
import { sammleMarkierungsFensterFolgebefunde } from '@/components/hilfsfenster/gemeinsam/markierungsFolgelauf';
import { uebergebeMarkierungsFensterHinweise } from '@/components/hilfsfenster/gemeinsam/markierungsHinweise';
import { istDateiSperreWartefrist } from '@/lib/persistenz/kern/kern.index';
import { useSchliessenAnfrageSchliesstFenster } from '@/hooks/fenster/useSchliessenAnfrageSchliesstFenster';
import type {
  KommentarKontext,
  MarkierungsUebertragung,
  SpeichernErgebnisKommentar,
} from '@/lib/markierungen/markierungen.index';
import {
  speichereKommentar,
  wiederholeMarkierungsUebertragung,
  verwerfeMarkierungsUebertragung,
} from '@/lib/markierungen/markierungen.index';

import { useAppAkzentfarbe } from '@/hooks/einstellungen/useAppAkzentfarbe';
import { useFensterSichtbarMachen } from '@/hooks/fenster/useFensterSichtbarMachen';
import KommentarFormular from '@/components/hilfsfenster/kommentar/KommentarFormular';
import { UiGroesseProvider } from '@/hooks/einstellungen/UiGroesseProvider';
import { FensterLadeAnzeige } from '@/components/hilfsfenster/gemeinsam/FensterLadeAnzeige';
import { useFensterEnterTaste } from '@/hooks/fenster/useFensterEnterTaste';
import {
  useFensterSchliessenAbsichern,
  useGespeichertenFensterAbschluss,
} from '@/hooks/fenster/useFensterSchliessenAbsichern';

import { useMarkierungsAusgangsstellePruefung } from '@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster';

type KommentarAbschlussStand = false | 'gespeichert' | 'unveraendert';

async function uebergebeHinweise(
  meldungen: AktionsMeldung[],
  oeffner: string,
  kommentarAbschluss: KommentarAbschlussStand = false,
) {
  const ersterSatz =
    kommentarAbschluss === 'unveraendert'
      ? 'Der Kommentar ist unverändert.'
      : kommentarAbschluss
        ? 'Der Kommentar wurde gespeichert.'
        : 'Eine Quelldatei wurde geändert.';
  await uebergebeMarkierungsFensterHinweise(
    meldungen,
    oeffner,
    ersterSatz,
    !!kommentarAbschluss,
    'Hinweis des Kommentarfensters nicht angenommen:',
  );
}

export default function KommentarFenster() {
  const bestand = useGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  const [kontext, setKontext] = useState<KommentarKontext | null>(null);
  const [kommentarText, setKommentarText] = useState('');
  const [textbezug, setTextbezug] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  // Inline-Fehlermeldung im Formular (siehe KommentarFormular.tsx),
  // analog zum fehler-State in VerweismarkierungFenster.tsx, hier aber bewusst nur
  // ein einfacher String statt einer Zitatfehlerliste. Enthält auch Befunde
  // der echten Lese-/Speicherkette und eine abgewiesene Überlappung.
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeicherterStand, setGespeicherterStand] = useState<{
    text: string;
    textbezug: boolean;
  } | null>(null);
  const abschlussSteuerung = useGespeichertenFensterAbschluss<MarkierungsUebertragung>(
    wiederholeMarkierungsUebertragung,
    verwerfeMarkierungsUebertragung,
    setLaeuft,
    () => setFehler(null),
  );
  const kommentarTextRef = useRef<HTMLTextAreaElement>(null);
  // Ref-Muster gegen stale closures für den global registrierten
  // Enter-Handler unten – siehe enterTasteRef in VerweismarkierungFenster.tsx für
  // die ausführliche Begründung (disabled-Flackern während laeuft).
  const inhaltRef = useRef<HTMLDivElement>(null);
  // Schutz gegen React StrictMode (Dev-Modus) – siehe
  // kontextAbgeholtRef in VerweismarkierungFenster.tsx.
  const kontextAbgeholtRef = useRef(false);

  // Fenster wird in fenster/hilfsfenster.rs (kommentar_fenster_oeffnen) bewusst
  // UNSICHTBAR erzeugt – siehe useFensterSichtbarMachen.ts für Details.
  useFensterSichtbarMachen();

  // Setzt die App-Akzentfarbe als CSS-Variablen für DIESES Fenster – jedes
  // Tauri-Fenster hat ein eigenes `document`, daher reicht der Aufruf in
  // App.tsx nicht für dieses Hilfsfenster.
  useAppAkzentfarbe();

  useEffect(() => {
    if (kontextAbgeholtRef.current) return;
    kontextAbgeholtRef.current = true;
    void kommentarKontextAbholen().then((k) => {
      if (!abschlussSteuerung.montiertRef.current) return;
      setKontext(k);
      if (!k) return;
      if (k.bearbeiten) {
        setKommentarText(k.bearbeiten.kommentarText);
        setTextbezug(!!k.bearbeiten.textbezug);
      }
    });
  }, [abschlussSteuerung.montiertRef]);

  // ⌘W schließt dieses Fenster komplett statt (wie im Hauptfenster) nur
  // einen Tab, Escape ebenso – beide rufen dieselbe schliessen()-Funktion
  // auf (siehe useSchliessenAnfrageSchliesstFenster.ts).
  useSchliessenAnfrageSchliesstFenster(async () => {
    await schliessen();
  });
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
      ? kommentarText !== gespeicherterStand.text || textbezug !== gespeicherterStand.textbezug
      : kommentarText.trim() !== (kontext?.bearbeiten?.kommentarText ?? '').trim(),
    (meldung) => {
      if (abschlussSteuerung.montiertRef.current) setFehler(meldung);
    },
    () => speichern(true),
    async (frage, signal) => {
      await ausgangsPruefung.warteAufAbschluss();
      if (signal?.aborted) return false;
      return abschlussSteuerung.vorSchliessen(frage, signal);
    },
    abschlussSteuerung.laufendesSpeichernVorSchliessen,
  );

  function enterTaste() {
    if (istSchliessvorgangAktiv()) return;
    void speichern();
  }
  useFensterEnterTaste(enterTaste);

  async function schliessen(): Promise<boolean> {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
      return true;
    } catch (fehler) {
      console.error('Kommentarfenster konnte nicht geschlossen werden:', fehler);
      if (abschlussSteuerung.montiertRef.current)
        setFehler('Das Fenster konnte nicht geschlossen werden.');
      return false;
    }
  }

  async function abbrechen() {
    await bewusstSchliessen(schliessen);
  }

  function speicherErgebnisVerarbeiten(ergebnis: SpeichernErgebnisKommentar): boolean {
    if (!abschlussSteuerung.montiertRef.current) {
      if (ergebnis.art === 'erfolg' || ergebnis.art === 'uebertragungOffen')
        abschlussSteuerung.uebernehmeSpeicherAbschluss(ergebnis);
      return false;
    }
    if (ergebnis.art === 'fehler') {
      return false;
    }
    if (ergebnis.art === 'keineAktion') return false;
    setGespeicherterStand({ text: kommentarText, textbezug });
    return abschlussSteuerung.uebernehmeSpeicherAbschluss(ergebnis);
  }

  async function verarbeiteSpeicherMeldungen(
    meldungen: AktionsMeldung[],
    kommentarAbschluss: KommentarAbschlussStand,
    fehlertext?: string,
  ) {
    if (!kontext) return;
    if (!kommentarAbschluss && abschlussSteuerung.montiertRef.current) {
      const lokal = meldungen.filter(
        (meldung) => meldung.art === 'fehler' || meldung.aenderungsstand === 'keine',
      );
      const texte = [
        fehlertext,
        ...lokal.map((meldung) => meldung.text),
        sicherungsHinweis(lokal),
      ].filter(Boolean);
      if (texte.length) setFehler([...new Set(texte)].join('\n'));
    }
    // Speichererfolg kommt ausschließlich aus der Aktionsrückgabe. Eine
    // Quelländerung kann auch nur eine Sicherung vor einem späteren Fehler sein.
    const hinweise = kommentarAbschluss
      ? meldungen
      : meldungen.filter(
          (meldung) => meldung.art === 'hinweis' && meldung.aenderungsstand !== 'keine',
        );
    await uebergebeHinweise(hinweise, kontext.openerLabel, kommentarAbschluss);
  }

  async function fuehreSpeicherungAus(signal: AbortSignal): Promise<boolean> {
    if (!kontext || !bestand) return false;
    const sammlung = erzeugeAktionsMeldungsSammlung();
    async function verarbeiteNachFolgelauf(
      kommentarAbschluss: KommentarAbschlussStand,
      fehlertext?: string,
    ) {
      const meldungen = await sammleMarkierungsFensterFolgebefunde(
        sammlung,
        kommentarAbschluss === 'gespeichert',
      );
      await verarbeiteSpeicherMeldungen(meldungen, kommentarAbschluss, fehlertext);
    }
    let ergebnis: SpeichernErgebnisKommentar;
    try {
      ergebnis = await speichereKommentar(
        kontext,
        bestand.ladeGesetz,
        kommentarText,
        textbezug,
        signal,
        sammlung.meldungEmpfangen,
      );
    } catch (ausnahme) {
      console.error('Kommentar konnte nicht gespeichert werden:', ausnahme);
      await verarbeiteNachFolgelauf(
        false,
        istDateiSperreWartefrist(ausnahme)
          ? 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.'
          : 'Der Kommentar konnte nicht gespeichert werden.',
      );
      return false;
    }
    const schliessenErlaubt = speicherErgebnisVerarbeiten(ergebnis);
    const kommentarAbschluss =
      ergebnis.art === 'erfolg' && 'unveraendert' in ergebnis
        ? 'unveraendert'
        : ergebnis.art === 'erfolg' || ergebnis.art === 'uebertragungOffen'
          ? 'gespeichert'
          : false;
    await verarbeiteNachFolgelauf(
      kommentarAbschluss,
      ergebnis.art === 'fehler' ? ergebnis.text : undefined,
    );
    return schliessenErlaubt;
  }

  async function speichern(ausSchliessdialog = false): Promise<boolean> {
    if (!kontext) return false;
    const freigabe = abschlussSteuerung.pruefeSpeicherStart(
      istSchliessvorgangAktiv(),
      ausSchliessdialog,
      () => bewusstSchliessen(schliessen),
    );
    if (freigabe !== null) return freigabe;
    if (!kommentarText.trim()) {
      setFehler('Bitte einen Kommentar eingeben.');
      return false;
    }
    return abschlussSteuerung.fuehreSpeichervorgangAus(
      fuehreSpeicherungAus,
      ausSchliessdialog,
      () => bewusstSchliessen(schliessen),
    );
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
      <KommentarFormular
        kontext={kontext}
        kommentarText={kommentarText}
        textbezug={ausgangsPruefung.bezugErhalten ? !!kontext.bearbeiten?.textbezug : textbezug}
        ausgangsPruefung={ausgangsPruefung}
        laeuft={laeuft || schliessvorgangAktiv}
        fehler={
          [
            fehler,
            abschlussSteuerung.abschluss === 'bearbeiten' ? ausgangsPruefung.aktionsFehler : null,
          ]
            .filter(Boolean)
            .join('\n') || null
        }
        gespeichert={abschlussSteuerung.abschluss !== 'bearbeiten'}
        uebertragungOffen={abschlussSteuerung.abschluss === 'offen'}
        onWiederholen={() =>
          abschlussSteuerung.erneutVersuchen(() => bewusstSchliessen(schliessen))
        }
        onTrotzdemSchliessen={() =>
          abschlussSteuerung.trotzdemSchliessen(() => bewusstSchliessen(schliessen))
        }
        kommentarTextRef={kommentarTextRef}
        inhaltRef={inhaltRef}
        onKommentarTextChange={(wert) => {
          if (
            abschlussSteuerung.beschaeftigtRef.current ||
            abschlussSteuerung.abschlussRef.current !== 'bearbeiten' ||
            istSchliessvorgangAktiv()
          )
            return;
          setKommentarText(wert);
          if (fehler) setFehler(null);
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
        onFertig={() => speichern()}
        onEnter={enterTaste}
      />
    </UiGroesseProvider>
  );
}
