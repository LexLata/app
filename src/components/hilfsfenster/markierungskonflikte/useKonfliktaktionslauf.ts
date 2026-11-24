// Aktionssperre, Import, Vollprüfung und Löschen der Konfliktseitenleiste.
import type { Auswahl } from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type {
  AnzeigeGesetzKonflikte,
  ImportBerichtEintrag,
} from '@/lib/markierungen/markierungen.index';
import {
  ermittleFehlendeGesetze,
  importFehlenderNormen,
  loescheAlleMitKonflikten,
  pruefeAlleMarkierungen,
} from '@/lib/markierungen/markierungen.index';
import { nativeBestaetigung } from '@/lib/plattform/tauriHelpers';
import { useRef, useState } from 'react';
import { erzeugeAktionsMeldungsSammlung, schliesseKonfliktMeldungenAb } from './konfliktMeldungen';

import type { Dispatch, SetStateAction } from 'react';
export function useKonfliktaktionslauf({
  auswahl,
  gesetze,
  wirdGeladen,
  aktionsAbschlussOffen,
  darfAktionStarten,
  registriereAbschluss,
  onAktionsNachfehler,
  onAlleGeprueft,
  onErfolgreicherImport,
  verknuepfungsMeldung,
  verknuepfungsFehler,
  setVerknuepfungsFehler,
  setAllgemeineRueckmeldung,
  setHilfeOffen,
}: {
  auswahl: Auswahl | null;
  gesetze: AnzeigeGesetzKonflikte[];
  wirdGeladen: boolean;
  aktionsAbschlussOffen: boolean;
  darfAktionStarten?: () => boolean;
  registriereAbschluss?: (lauf: Promise<unknown>) => void;
  onAktionsNachfehler?: () => void;
  onAlleGeprueft: () => Promise<void>;
  onErfolgreicherImport: (gesetz: Gesetzesreferenz) => void;
  verknuepfungsMeldung: string | null;
  verknuepfungsFehler: string | null;
  setVerknuepfungsFehler: Dispatch<SetStateAction<string | null>>;
  setAllgemeineRueckmeldung: Dispatch<SetStateAction<boolean>>;
  setHilfeOffen: Dispatch<SetStateAction<boolean>>;
}) {
  const [laeuft, setLaeuft] = useState(false);
  const aktionsLauf = useRef(false);
  const aktionsStartErlaubt = useRef(darfAktionStarten);
  aktionsStartErlaubt.current = darfAktionStarten;
  // Nur für den Button "Alle Markierungen neu prüfen" gebraucht: dieser
  // verändert `gesetze` im Erfolgsfall oft gar nicht sichtbar (keine neuen
  // Konflikte gefunden) – ohne eigenen Text gäbe es dann überhaupt kein
  // Feedback, dass etwas passiert ist (Bugfix). 'fertig' blendet sich nach
  // kurzer Zeit von selbst wieder aus.
  const [pruefungStatus, setPruefungStatus] = useState<'idle' | 'laeuft' | 'fertig'>('idle');
  // Nur für "Import fehlender Normen von Gesetze im Internet" gebraucht:
  // Live-Bericht wie beim gemeinsamen Import – eine direkte
  // Wiederverwendung DIESER Komponente ist hier nicht möglich (sie ist an
  // App.tsx im Hauptfenster gebunden, dieses Fenster ist ein eigener
  // Tauri-Fensterprozess ohne Zugriff auf deren State), daher eine
  // schlanke eigene Darstellung mit demselben Grundprinzip.
  const [importBericht, setImportBericht] = useState<ImportBerichtEintrag[]>([]);
  // Nur für die BEIDEN "Import ... aus dem Internet"-Einzel-Buttons unten
  // (gesetzFehlt / zielGesetzFehlt) gebraucht: zeigt den konkreten
  // Fehlertext des zuletzt gescheiterten Versuchs direkt unter dem Button an
  // und verwendet den ausdrücklichen Meldungsempfänger statt lokaler Banner.
  // Auswahlwechsel setzt diesen Fehler zusammen mit dem Live-Eintrag zurück.
  const [einzelImportFehler, setEinzelImportFehler] = useState<{
    text: string;
    auswahlIdentitaet: string | null;
  } | null>(null);

  const auswahlIdentitaet = auswahl ? JSON.stringify(auswahl) : null;
  const [aktionsFehler, setAktionsFehler] = useState<{
    text: string;
    bereich: 'auswahl' | 'alle';
    auswahlIdentitaet: string | null;
  } | null>(null);

  // Deselektiert NICHT selbst nach Abschluss der Aktion: das würde die
  // blaue Hervorhebung sofort verschwinden lassen, während die Zeile selbst
  // erst etwas später verschwindet (nämlich wenn der durch die Aktion
  // ausgelöste 'markierungskonflikte-geaendert'-Reload im Elternteil
  // durchgelaufen ist – siehe MarkierungskonfliktFenster.tsx: neuLaden()).
  // Das erzeugte genau das beobachtete zweistufige/ruckelige Verschwinden.
  // Jede schreibende Aktion hier löst diesen Reload zuverlässig aus (siehe
  // Kopfkommentar in konfliktaktionen.ts); Liste und
  // Auswahl werden dort gemeinsam (im selben neuLaden()-Durchlauf)
  // aktualisiert bzw. deselektiert.
  async function ausfuehren(
    aktion: (meldungEmpfangen: AktionsMeldungEmpfaenger) => Promise<void | boolean>,
    bereich: 'auswahl' | 'alle' | 'verknuepfung' = 'auswahl',
    fehlertext = 'Die Aktion konnte nicht vollständig gespeichert werden.',
    wiederaufnahme = false,
  ): Promise<boolean> {
    if (
      aktionsLauf.current ||
      aktionsStartErlaubt.current?.() === false ||
      wirdGeladen ||
      (aktionsAbschlussOffen && !wiederaufnahme)
    )
      return false;
    aktionsLauf.current = true;
    const lauf = arbeiteAktionAb();
    registriereAbschluss?.(lauf);
    return lauf;

    async function arbeiteAktionAb(): Promise<boolean> {
      if (!verknuepfungsMeldung && !verknuepfungsFehler) setAllgemeineRueckmeldung(false);
      setHilfeOffen(false);
      setAktionsFehler(null);
      setLaeuft(true);
      const sammlung = erzeugeAktionsMeldungsSammlung();
      let erfolgreich = false;
      let gespeichert = false;
      let lokal: string | null;
      try {
        gespeichert = (await aktion(sammlung.meldungEmpfangen)) === true;
        erfolgreich = true;
      } catch (fehler) {
        console.error('Markierungsupdate-Aktion fehlgeschlagen:', fehler);
        // Auch unerwartete Fehler der allgemeinen Verknüpfung gehören zur
        // dauerhaften Rückmeldung; eine Neuprüfung darf sie nicht zurücksetzen.
        if (bereich === 'verknuepfung') setVerknuepfungsFehler(fehlertext);
        else setAktionsFehler({ text: fehlertext, bereich, auswahlIdentitaet });
        if (fehlertext === 'Die Aktion konnte nicht vollständig gespeichert werden.')
          onAktionsNachfehler?.();
      } finally {
        lokal = await schliesseKonfliktMeldungenAb(sammlung, erfolgreich, gespeichert);
        if (lokal) {
          if (bereich === 'verknuepfung') setVerknuepfungsFehler(lokal);
          else setAktionsFehler({ text: lokal, bereich, auswahlIdentitaet });
        }
        setLaeuft(false);
        aktionsLauf.current = false;
      }
      return erfolgreich && !lokal;
    }
  }

  const fehlendeGesetze = ermittleFehlendeGesetze(gesetze);
  const gibtKonflikteZumLoeschen = gesetze.some(
    (g) => g.fehlendesGesetz || g.nichtamtlicheTitelXmlFehlt || g.eintraege.length > 0,
  );

  async function importAlleFehlenden() {
    if (aktionsAbschlussOffen || aktionsStartErlaubt.current?.() === false) return;
    setImportBericht([]);
    await ausfuehren(
      async (meldungEmpfangen) => {
        const bericht = await importFehlenderNormen(
          fehlendeGesetze,
          (eintrag) => {
            setImportBericht((prev) => [...prev, eintrag]);
            if (eintrag.erfolg) onErfolgreicherImport(eintrag.gesetz);
          },
          meldungEmpfangen,
        );
        return bericht.some((e) => e.gespeichert);
      },
      'alle',
      'Der Import konnte nicht vollständig abgeschlossen werden.',
    );
  }

  // Löst eine vollständige Neuprüfung aller Markierungs-XMLs aus (nicht nur
  // der aktuell in `gesetze` angezeigten – siehe pruefeAlleMarkierungen:
  // deckt auch Gesetze/Markierungsdatensätze ab, die aktuell noch KEINEN
  // Konflikt haben) und schreibt markierungskonflikte.xml komplett neu. Anders
  // als bei den übrigen Aktionen hier gibt es dafür keine Bestätigungs-
  // abfrage – die Aktion ist rein lesend/berechnend, nichts Nutzerdaten
  // Betreffendes wird dabei gelöscht.
  async function alleMarkierungenNeuPruefen() {
    setPruefungStatus('laeuft');
    const erfolgreich = await ausfuehren(
      async (meldungEmpfangen) => {
        await pruefeAlleMarkierungen(meldungEmpfangen);
        await onAlleGeprueft();
      },
      'alle',
      'Die Markierungen konnten nicht vollständig geprüft werden.',
      true,
    );
    setPruefungStatus(erfolgreich ? 'fertig' : 'idle');
    if (erfolgreich) {
      setTimeout(() => setPruefungStatus((v) => (v === 'fertig' ? 'idle' : v)), 2500);
    }
  }

  async function alleMarkierungenLoeschen() {
    await ausfuehren(async (meldungEmpfangen) => {
      const bestaetigt = await nativeBestaetigung(
        'Achtung: Wirklich alle Markierungen mit Konflikten unwiderruflich löschen?',
        {
          title: 'Alle Markierungen löschen',
          kind: 'warning',
          okLabel: 'Löschen',
          cancelLabel: 'Abbrechen',
        },
      );
      if (!bestaetigt) return;
      return loescheAlleMitKonflikten(gesetze, meldungEmpfangen);
    }, 'alle');
  }

  return {
    laeuft,
    aktionsStartErlaubt,
    pruefungStatus,
    importBericht,
    einzelImportFehler,
    setEinzelImportFehler,
    auswahlIdentitaet,
    aktionsFehler,
    setAktionsFehler,
    ausfuehren,
    fehlendeGesetze,
    gibtKonflikteZumLoeschen,
    importAlleFehlenden,
    alleMarkierungenNeuPruefen,
    alleMarkierungenLoeschen,
  };
}
