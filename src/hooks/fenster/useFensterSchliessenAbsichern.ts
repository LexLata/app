// useFensterSchliessenAbsichern.ts
// Fragt bei Textänderungen nach, speichert auf Wunsch und wartet vor dem Schließen.
// Dieselbe Prüfung beantwortet die Beenden-Anfrage; das Fenster bleibt dabei offen.

import { nativeMeldung } from '@/lib/plattform/tauriHelpers';
import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { warteAufSpeicherBatchAbschluss } from '@/lib/persistenz/gesetz/gesetz.index';
import { useBeendenAnfrage } from './useBeendenAnfrage';

type RueckfrageStellen = <T>(dialog: () => Promise<T>) => Promise<T>;

async function nachfrageZumSchliessen(
  speichern: () => Promise<boolean>,
  fehlerAnzeigen: (meldung: string) => void,
  frage: RueckfrageStellen,
  signal?: AbortSignal,
): Promise<boolean> {
  const auswahl = await frage(() =>
    nativeMeldung('Ungespeicherte Änderungen: Wie möchten Sie fortfahren?', {
      title: 'Änderungen speichern?',
      kind: 'warning',
      buttons: { yes: 'Speichern', no: 'Verwerfen', cancel: 'Abbrechen' },
    }),
  );
  if (auswahl === 'Verwerfen' || auswahl === 'No') return !signal?.aborted;
  if (auswahl !== 'Speichern' && auswahl !== 'Yes') return false;
  try {
    return await speichern();
  } catch (fehler) {
    console.error('Speichern beim Schließen fehlgeschlagen:', fehler);
    fehlerAnzeigen('Die Änderungen konnten nicht gespeichert werden.');
    return false;
  }
}

export const offenerSpeicherAbschlussHinweis =
  'Die Änderung wurde gespeichert. Die Übernahme für Rückgängig konnte nicht bestätigt werden.';

/** Gemeinsame bewusste Entscheidung für bereits gespeicherte Hilfsfensterinhalte. */
async function frageNachOffenemSpeicherAbschluss(): Promise<
  'wiederholen' | 'verwerfen' | 'abbrechen'
> {
  const auswahl = await nativeMeldung(offenerSpeicherAbschlussHinweis, {
    title: 'Übernahme für Rückgängig',
    kind: 'warning',
    buttons: { yes: 'Erneut versuchen', no: 'Trotzdem schließen', cancel: 'Abbrechen' },
  });
  if (auswahl === 'Erneut versuchen' || auswahl === 'Yes') return 'wiederholen';
  if (auswahl === 'Trotzdem schließen' || auswahl === 'No') return 'verwerfen';
  return 'abbrechen';
}

/** Flüchtiger Abschluss gespeicherter Inhalte; die Auftragsdaten gehören dem Aufrufer. */
export function useGespeichertenFensterAbschluss<Auftrag>(
  wiederhole: (auftrag: Auftrag) => Promise<'bestaetigt' | 'offen'>,
  verwerfe: (auftrag: Auftrag) => void,
  setLaeuft: (wert: boolean) => void,
  fehlerZuruecksetzen: () => void,
) {
  const [abschluss, setAbschluss] = useState<'bearbeiten' | 'offen' | 'fertig'>('bearbeiten');
  const abschlussRef = useRef<'bearbeiten' | 'offen' | 'fertig'>('bearbeiten');
  const uebertragungRef = useRef<Auftrag | null>(null);
  const beschaeftigtRef = useRef(false);
  const speichernUndSchliessenRef = useRef<Promise<boolean> | null>(null);
  const montiertRef = useRef(true);
  const speicherAbbruchRef = useRef<AbortController | null>(null);
  useEffect(() => {
    montiertRef.current = true;
    return () => {
      montiertRef.current = false;
      speicherAbbruchRef.current?.abort();
      if (uebertragungRef.current) verwerfe(uebertragungRef.current);
    };
  }, [verwerfe]);
  function merkeAbschluss(wert: 'offen' | 'fertig') {
    abschlussRef.current = wert;
    setAbschluss(wert);
  }
  function verwerfen() {
    if (uebertragungRef.current) {
      verwerfe(uebertragungRef.current);
      uebertragungRef.current = null;
    }
    merkeAbschluss('fertig');
  }
  async function wiederholen(): Promise<boolean> {
    if (!montiertRef.current || beschaeftigtRef.current) return false;
    if (abschlussRef.current === 'fertig') return true;
    if (!uebertragungRef.current) return false;
    beschaeftigtRef.current = true;
    setLaeuft(true);
    fehlerZuruecksetzen();
    try {
      const ergebnis = await wiederhole(uebertragungRef.current);
      if (!montiertRef.current || ergebnis !== 'bestaetigt') return false;
      merkeAbschluss('fertig');
      return true;
    } catch (ausnahme) {
      console.error('Übertragung konnte nicht wiederholt werden:', ausnahme);
      return false;
    } finally {
      beschaeftigtRef.current = false;
      if (montiertRef.current) setLaeuft(false);
    }
  }
  async function vorSchliessen(frage: RueckfrageStellen, signal?: AbortSignal): Promise<boolean> {
    if (!montiertRef.current || beschaeftigtRef.current) return false;
    if (abschlussRef.current !== 'offen') return true;
    const auswahl = await frage(frageNachOffenemSpeicherAbschluss);
    if (!montiertRef.current) return false;
    if (auswahl === 'wiederholen') return wiederholen();
    if (auswahl === 'verwerfen' && !signal?.aborted) {
      verwerfen();
      return true;
    }
    return false;
  }
  function pruefeSpeicherStart(
    schliessenAktiv: boolean,
    ausSchliessdialog: boolean,
    schliessen: () => Promise<boolean>,
  ): boolean | Promise<boolean> | null {
    if (!montiertRef.current || beschaeftigtRef.current || (schliessenAktiv && !ausSchliessdialog))
      return false;
    if (abschlussRef.current === 'offen') return false;
    if (abschlussRef.current === 'fertig') return ausSchliessdialog ? true : schliessen();
    return null;
  }
  function fuehreSpeichervorgangAus(
    vorgang: (signal: AbortSignal) => Promise<boolean>,
    ausSchliessdialog: boolean,
    schliessen: () => Promise<boolean>,
  ): Promise<boolean> {
    async function ausfuehren() {
      beschaeftigtRef.current = true;
      setLaeuft(true);
      fehlerZuruecksetzen();
      const controller = new AbortController();
      speicherAbbruchRef.current = controller;
      let erlaubt: boolean;
      try {
        erlaubt = await vorgang(controller.signal);
      } finally {
        if (speicherAbbruchRef.current === controller) speicherAbbruchRef.current = null;
        beschaeftigtRef.current = false;
        if (montiertRef.current) setLaeuft(false);
      }
      if (!erlaubt || !montiertRef.current) return false;
      return ausSchliessdialog ? true : schliessen();
    }

    const ergebnis = ausfuehren();
    if (!ausSchliessdialog) {
      speichernUndSchliessenRef.current = ergebnis;
      const aufraeumen = () => {
        if (speichernUndSchliessenRef.current === ergebnis)
          speichernUndSchliessenRef.current = null;
      };
      void ergebnis.then(aufraeumen, aufraeumen);
    }
    return ergebnis;
  }

  async function erneutVersuchen(schliessen: () => Promise<boolean>) {
    if (await wiederholen()) await schliessen();
  }
  async function trotzdemSchliessen(schliessen: () => Promise<boolean>) {
    if (beschaeftigtRef.current || !montiertRef.current) return;
    verwerfen();
    await schliessen();
  }
  function uebernehmeSpeicherAbschluss(
    ergebnis: { art: 'erfolg' } | { art: 'uebertragungOffen'; uebertragung: Auftrag },
  ): boolean {
    if (!montiertRef.current) {
      if (ergebnis.art === 'uebertragungOffen') verwerfe(ergebnis.uebertragung);
      return false;
    }
    if (ergebnis.art === 'uebertragungOffen') {
      uebertragungRef.current = ergebnis.uebertragung;
      merkeAbschluss('offen');
      return false;
    }
    merkeAbschluss('fertig');
    return true;
  }
  return {
    pruefeSpeicherStart,
    fuehreSpeichervorgangAus,
    erneutVersuchen,
    trotzdemSchliessen,
    uebernehmeSpeicherAbschluss,
    abschluss,
    abschlussRef,
    beschaeftigtRef,
    montiertRef,
    vorSchliessen,
    laufendesSpeichernVorSchliessen: () => speichernUndSchliessenRef.current,
  };
}

export function useFensterSchliessenAbsichern(
  istGeaendert: boolean,
  fehlerAnzeigen: (meldung: string) => void,
  speichern: () => Promise<boolean>,
  vorSchliessen?: (frage: RueckfrageStellen, signal?: AbortSignal) => Promise<boolean>,
  laufendesSpeichernVorSchliessen?: () => Promise<boolean> | null,
) {
  const [bereit, setBereit] = useState(!isTauri());
  const [schliessvorgangAktiv, setSchliessvorgangAktiv] = useState(false);
  const [registrierungsFehler, setRegistrierungsFehler] = useState<string | null>(null);
  const istGeaendertRef = useRef(istGeaendert);
  const fehlerAnzeigenRef = useRef(fehlerAnzeigen);
  const speichernRef = useRef(speichern);
  const vorSchliessenRef = useRef(vorSchliessen);
  const laufendesSpeichernRef = useRef(laufendesSpeichernVorSchliessen);
  const bewusstRef = useRef(false);
  const bewusstEreignisRef = useRef(false);
  const vorgangRef = useRef<{
    selbstSchliessen: boolean;
    ende: Promise<boolean>;
    abschliessen: (geschlossen: boolean) => void;
  } | null>(null);
  const rueckfrageOffenRef = useRef(false);
  const listenerAktivRef = useRef(false);

  istGeaendertRef.current = istGeaendert;
  fehlerAnzeigenRef.current = fehlerAnzeigen;
  speichernRef.current = speichern;
  vorSchliessenRef.current = vorSchliessen;
  laufendesSpeichernRef.current = laufendesSpeichernVorSchliessen;

  function vorgangBeginnen(selbstSchliessen: boolean) {
    let abschliessen!: (geschlossen: boolean) => void;
    const ende = new Promise<boolean>((resolve) => (abschliessen = resolve));
    vorgangRef.current = { selbstSchliessen, ende, abschliessen };
    setSchliessvorgangAktiv(true);
  }

  function vorgangAbschliessen(geschlossen = false) {
    vorgangRef.current?.abschliessen(geschlossen);
    vorgangRef.current = null;
    setSchliessvorgangAktiv(false);
  }

  async function rueckfrageStellen<T>(dialog: () => Promise<T>, melden?: () => void): Promise<T> {
    rueckfrageOffenRef.current = true;
    try {
      const auswahl = dialog();
      melden?.();
      return await auswahl;
    } finally {
      rueckfrageOffenRef.current = false;
    }
  }

  async function schliessenPruefen(
    frage: RueckfrageStellen,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      return (await vorSchliessenRef.current?.(frage, signal)) ?? true;
    } catch (fehler) {
      console.error('Vorprüfung beim Schließen fehlgeschlagen:', fehler);
      fehlerAnzeigenRef.current('Das Fenster konnte nicht geschlossen werden.');
      return false;
    }
  }

  useEffect(() => {
    if (!isTauri()) return;
    let abgebrochen = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const fenster = getCurrentWindow();
        const entfernen = await fenster.onCloseRequested(async (event) => {
          event.preventDefault();
          if (listenerAktivRef.current || (vorgangRef.current && !bewusstRef.current)) return;
          listenerAktivRef.current = true;
          if (!vorgangRef.current) vorgangBeginnen(true);
          const bewusst = bewusstRef.current;
          bewusstRef.current = false;
          if (bewusst) bewusstEreignisRef.current = true;
          let geschlossen = false;
          try {
            if (!bewusst && !(await schliessenPruefen(rueckfrageStellen))) return;
            if (
              !bewusst &&
              istGeaendertRef.current &&
              !(await nachfrageZumSchliessen(
                speichernRef.current,
                fehlerAnzeigenRef.current,
                rueckfrageStellen,
              ))
            )
              return;
            await warteAufSpeicherBatchAbschluss();
            await fenster.destroy();
            geschlossen = true;
          } catch (fehler) {
            console.error('Abgesichertes Schließen fehlgeschlagen:', fehler);
            fehlerAnzeigenRef.current('Das Fenster konnte nicht geschlossen werden.');
          } finally {
            listenerAktivRef.current = false;
            vorgangAbschliessen(geschlossen);
          }
        });
        if (abgebrochen) entfernen();
        else {
          unlisten = entfernen;
          setBereit(true);
        }
      } catch (fehler) {
        console.error(
          'Listener für abgesichertes Schließen konnte nicht eingerichtet werden:',
          fehler,
        );
        if (!abgebrochen) {
          const meldung = 'Der Schließschutz konnte nicht eingerichtet werden.';
          setRegistrierungsFehler(meldung);
          fehlerAnzeigenRef.current(meldung);
        }
      }
    })();
    return () => {
      abgebrochen = true;
      unlisten?.();
    };
  }, []);

  // Wie das Fensterkreuz, ohne das Fenster selbst zu schließen.
  useBeendenAnfrage(async (signal, rueckfrageMelden) => {
    if (rueckfrageOffenRef.current) return false;
    const speichernUndSchliessen = laufendesSpeichernRef.current?.();
    if (speichernUndSchliessen) {
      if (!(await speichernUndSchliessen) || signal.aborted) return false;
      return (await vorgangRef.current?.ende) ?? true;
    }
    const vorgang = vorgangRef.current;
    if (vorgang) {
      const geschlossen = await vorgang.ende;
      if (vorgang.selbstSchliessen || signal.aborted) return geschlossen;
    }

    const frage: RueckfrageStellen = (dialog) => rueckfrageStellen(dialog, rueckfrageMelden);
    vorgangBeginnen(false);
    try {
      if (!(await schliessenPruefen(frage, signal)) || signal.aborted) return false;
      if (
        istGeaendertRef.current &&
        !(await nachfrageZumSchliessen(
          speichernRef.current,
          fehlerAnzeigenRef.current,
          frage,
          signal,
        ))
      )
        return false;
      if (signal.aborted) return false;
      await warteAufSpeicherBatchAbschluss();
      return true;
    } finally {
      vorgangAbschliessen();
    }
  });

  return {
    bereit,
    schliessvorgangAktiv,
    registrierungsFehler,
    istSchliessvorgangAktiv: () => vorgangRef.current !== null,
    bewusstSchliessen: async (schliessen: () => Promise<boolean>) => {
      if (vorgangRef.current) return false;
      vorgangBeginnen(true);
      bewusstEreignisRef.current = false;
      let wartetAufEreignis = false;
      try {
        if (!(await schliessenPruefen(rueckfrageStellen))) return false;
        bewusstRef.current = true;
        const geschlossen = await schliessen();
        wartetAufEreignis = geschlossen;
        return geschlossen;
      } finally {
        if (!bewusstEreignisRef.current && !wartetAufEreignis) {
          bewusstRef.current = false;
          vorgangAbschliessen();
        }
      }
    },
  };
}
