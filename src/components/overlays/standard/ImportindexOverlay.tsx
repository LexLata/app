// ImportindexOverlay.tsx
// Ersetzt die drei vormals über die Menüleiste einzeln erreichbaren
// Importindex-Erstellungs-Befehle (siehe useMenueEvents.ts, menu.rs) durch eine
// zentrale Verwaltungsoberfläche für die Importindizes (Bundesrecht,
// Landesrecht BW und Europarecht). Zeigt pro Importindex Herkunft (Standard aus resources/importindizes
// oder selbst erstellt) und Erstellungsdatum, mit zwei Aktionen:
// "Standard wiederherstellen" (erzwungenes Zurückkopieren aus dem Bundle,
// siehe importindexVorinstallation.ts) und "Aktualisieren" (Live-Abruf, siehe
// importindexErstellungBund.ts/importindexErstellungBW.ts).
//
// Bewusst KEINE eigene Fortschrittsanzeige: der Live-Abruf läuft über das
// bereits bestehende, fensterübergreifende Banner (bannerStore.ts /
// importindexErstellungSteuerung.ts) weiter, auch wenn dieses Overlay geschlossen
// wird. Während eines laufenden Vorgangs werden hier nur die Buttons der
// betroffenen Kategorie gesperrt (istImportindexAktiv) und die Metadaten nach
// Abschluss automatisch aufgefrischt (Polling, siehe useImportindexStatus unten).

import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useEffect, useState } from 'react';
import { OverlayRahmen, OVERLAY_BREITE_KOMPAKT } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import { formatDatumLang } from '@/lib/utils/datumFormat';
import {
  importindexStatus,
  istImportindexAktiv,
  stelleStandardWieder,
  aktualisiereImportindex,
  type ImportindexKategorie,
  type ImportindexStatus,
} from '@/lib/import/import.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { OVERLAY_AUSSEN_ROH, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { ListBullets } from '@phosphor-icons/react';

/** Importindexverwaltung; Verarbeitung und Sperren verbleiben im Importmodul. */
export interface ImportindexOverlayProps {
  onSchliessen: () => void;
}

// ---------------------------------------------------------------------------
// Metadaten laden
// ---------------------------------------------------------------------------

/** Lädt Status+Metadaten einer Importindex-Kategorie (importindexStatus) und hält sie
 *  aktuell, solange die Kategorie laut istImportindexAktiv aktiv ist (Polling
 *  alle 1s – es gibt aktuell keinen Event-Kanal für "Importindex-Datei geändert",
 *  ein Intervall ist hier die einfachste robuste Lösung). Nach Abschluss des
 *  Laufs (Kategorie nicht mehr aktiv) wird noch einmal final neu geladen,
 *  danach stoppt das Polling. `neuLaden` erlaubt zusätzlich dem Aufrufer,
 *  außerhalb dieses Polling-Rhythmus aufzufrischen (siehe "Standard
 *  wiederherstellen" unten – läuft synchron, nicht über die
 *  Kategorie-Sperre).
 *
 *  `aktiv` wird bewusst NICHT aus importindexStatus() selbst übernommen (dessen
 *  Rückgabe ist async, siehe importindexSuche.ts::importindexStatus-Kommentar zur
 *  Abweichung vom Entwurf), sondern weiterhin separat synchron über
 *  istImportindexAktiv gelesen – sonst würde beim Öffnen des Overlays kurz ein
 *  freigeschalteter Button aufblitzen, während bereits ein Vorgang läuft
 *  (Bugreport, s.u.). */
function useImportindexStatus(kategorie: ImportindexKategorie) {
  const [status, setStatus] = useState<
    Pick<ImportindexStatus, 'verarbeitungszeit' | 'herkunft'> | 'laedt'
  >('laedt');
  // Lazy Initial State statt useState(false): vermeidet ein kurzes
  // Aufblitzen freigeschalteter Buttons beim Öffnen des Overlays, während
  // bereits ein Vorgang läuft (z.B. übers Menü eines anderen Fensters
  // gestartet).
  const [aktiv, setAktiv] = useState(() => istImportindexAktiv(kategorie));

  async function neuLaden() {
    const { verarbeitungszeit, herkunft } = await importindexStatus(kategorie);
    setStatus({ verarbeitungszeit, herkunft });
  }

  useEffect(() => {
    let abgebrochen = false;
    // Bewusst als lokale Closure-Variable statt im setAktiv-Updater
    // verglichen (siehe frühere Fassung): React kann State-Updater-Funktionen
    // in StrictMode doppelt aufrufen, ein darin ausgelöster Seiteneffekt
    // (neu laden) würde dann ebenfalls doppelt feuern.
    let warAktiv = istImportindexAktiv(kategorie);

    async function laden() {
      const { verarbeitungszeit, herkunft } = await importindexStatus(kategorie);
      if (!abgebrochen) setStatus({ verarbeitungszeit, herkunft });
    }
    void laden();
    setAktiv(warAktiv);

    const intervall = window.setInterval(() => {
      const jetztAktiv = istImportindexAktiv(kategorie);
      // Übergang "aktiv -> nicht mehr aktiv": Vorgang ist gerade fertig
      // geworden -> Metadaten ein letztes Mal auffrischen.
      if (warAktiv && !jetztAktiv && !abgebrochen) void laden();
      warAktiv = jetztAktiv;
      setAktiv(jetztAktiv);
    }, 1000);

    return () => {
      abgebrochen = true;
      window.clearInterval(intervall);
    };
  }, [kategorie]);

  return { status, aktiv, neuLaden, setAktiv };
}

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export function ImportindexOverlay({ onSchliessen }: ImportindexOverlayProps) {
  const uiFaktor = useUiSkalierungsFaktor();
  const textRollen = useTextRollen();
  return (
    <OverlayRahmen onSchliessen={onSchliessen} breite={OVERLAY_BREITE_KOMPAKT}>
      <OverlayKopfzeile
        icon={ListBullets}
        titel="Importindizes aktualisieren"
        onSchliessen={onSchliessen}
      />

      <TextAnzeige
        text="Die Importindizes enthalten Kurz- und Langtitel der verfügbaren Gesetze sowie Angaben dazu, wie diese importiert und aktualisiert werden können."
        style={{
          ...textRollen.hinweistext,
          flexShrink: 0,
          padding: `${pxSkaliert(16, uiFaktor)}px ${pxSkaliert(OVERLAY_AUSSEN_ROH, uiFaktor)}px`,
        }}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: `${pxSkaliert(16, uiFaktor)}px ${pxSkaliert(OVERLAY_AUSSEN_ROH, uiFaktor)}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: pxSkaliert(20, uiFaktor),
        }}
      >
        <ImportindexAbschnitt
          titel="Importindex Bundesrecht"
          kategorie={NORMGEBER_DE_BUND}
          onAktualisieren={() => aktualisiereImportindex(NORMGEBER_DE_BUND)}
        />
        <ImportindexAbschnitt
          titel="Importindex Landesrecht Baden-Württemberg"
          kategorie={NORMGEBER_DE_BW}
          onAktualisieren={() => aktualisiereImportindex(NORMGEBER_DE_BW)}
        />
        <ImportindexAbschnitt
          titel="Importindex Europarecht"
          kategorie={NORMGEBER_EU}
          onAktualisieren={() => aktualisiereImportindex(NORMGEBER_EU)}
        />
      </div>
    </OverlayRahmen>
  );
}

// ---------------------------------------------------------------------------
// Ein Importindex-Abschnitt (Bundesrecht, Landesrecht BW oder Europarecht)
// ---------------------------------------------------------------------------

interface ImportindexAbschnittProps {
  titel: string;
  kategorie: ImportindexKategorie;
  onAktualisieren: () => Promise<unknown>;
}

function ImportindexAbschnitt({ titel, kategorie, onAktualisieren }: ImportindexAbschnittProps) {
  const buttonRollen = useButtonRollen();
  const textRollen = useTextRollen();
  const abstandRollen = useAbstandRollen();
  const { status, aktiv, neuLaden, setAktiv } = useImportindexStatus(kategorie);
  const [wirdWiederhergestellt, setWirdWiederhergestellt] = useState(false);

  // versucheZuStarten() (in erstelleBundesImportindex/erstelleLandesrechtBWImportindexNeu,
  // via aktualisiereImportindex) registriert die Kategorie zwar synchron als aktiv,
  // das Overlay bekommt das aber sonst erst beim nächsten Polling-Tick von
  // useImportindexStatus mit (bis zu 1s Verzögerung, siehe Bugreport: Button
  // wirkte nach Klick kurz weiter klickbar). Deshalb hier zusätzlich sofort
  // optimistisch sperren – ein evtl. sehr schneller Fehlschlag (z.B. keine
  // Verbindung) wird spätestens beim nächsten Tick wieder korrekt entsperrt.
  function aktualisierenKlick() {
    setAktiv(true);
    void onAktualisieren();
  }

  async function standardWiederherstellen() {
    setWirdWiederhergestellt(true);
    try {
      await stelleStandardWieder(kategorie);
      await neuLaden();
    } finally {
      setWirdWiederhergestellt(false);
    }
  }

  const gesperrt = aktiv || wirdWiederhergestellt;
  // Kein "Standard wiederherstellen" nötig/sinnvoll, wenn schon der
  // Standard aktiv ist (nichts zum Wiederherstellen da).
  const istBereitsStandard = status !== 'laedt' && status.herkunft === 'standard';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: abstandRollen.standard }}>
      <TextAnzeige style={{ ...textRollen.standardtextBetont }} text={titel} />
      <span style={{ ...textRollen.hinweistext }}>
        <MetaText status={status} aktiv={aktiv} />
      </span>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: abstandRollen.standard }}>
        <TextAnzeige
          element="button"
          text="Standard wiederherstellen"
          onClick={standardWiederherstellen}
          disabled={gesperrt || istBereitsStandard}
          style={buttonRollen.sekundaer(gesperrt || istBereitsStandard)}
        />
        <TextAnzeige
          element="button"
          text="Aktualisieren"
          onClick={aktualisierenKlick}
          disabled={gesperrt}
          style={buttonRollen.primaer(gesperrt)}
        />
      </div>
    </div>
  );
}

function MetaText({
  status,
  aktiv,
}: {
  status: Pick<ImportindexStatus, 'verarbeitungszeit' | 'herkunft'> | 'laedt';
  aktiv: boolean;
}) {
  if (aktiv) return <TextAnzeige text="Wird aktualisiert …" />;
  if (status === 'laedt') return <TextAnzeige text="Lädt …" />;
  if (!status.verarbeitungszeit) return <TextAnzeige text="Noch kein Importindex vorhanden." />;
  const datum = formatDatumLang(status.verarbeitungszeit);
  return (
    <TextAnzeige
      text={
        status.herkunft === 'standard'
          ? `Standard-Importindex · erstellt am ${datum}`
          : `Selbst erstellt am ${datum}`
      }
    />
  );
}
