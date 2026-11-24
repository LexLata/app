// DateiImportOverlay.tsx
// Overlay "Dateien importieren": zeigt während des Imports den Fortschritt
// (Stand aus dateiImportVorgang.ts), danach die von dateiImport.ts
// gesammelten Konflikte (oben, "Importkonflikte") und den nach Kategorien
// gruppierten Bericht (unten, "Importbericht"). Geöffnet per Menü/Kurzbefehl
// "Dateien importieren" sofort beim Start bzw. von Gesetzesuebersicht.tsx nach
// dem Ablegen von Dateien (siehe useAppAktionen.ts). Schließen beendet einen
// laufenden Import nicht.

import { Checkbox } from '@/components/Checkbox';
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { TextAnzeige } from '@/components/textanzeige/textanzeige.index';
import { useEffect, useReducer, useRef, useState, type ReactElement } from 'react';
import { OverlayRahmen, OVERLAY_BREITE_GROSS } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import { formatDatumLang } from '@/lib/utils/datumFormat';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert, overlayAussenPadding } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { erzeugeAbstandRollen } from '@/lib/stil/abstandRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { FileArrowDown } from '@phosphor-icons/react';
import {
  ImportAbschlussFehler,
  istReinerImportErfolg,
  dateiImportErfolgstext,
  type DateiImportZustand,
  type DateiImportErgebnis,
  type ImportKonflikt,
  type BerichtEintrag,
  type ImportAktion,
  type ImportFehler,
  betroffenesGesetz,
  meldungAlsImportFehler,
  ermittleImportAktionen,
  loeseImportKonflikt,
  gliedereImportbericht,
} from '@/lib/import-export/import-export.index';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { MeldungsgliederungAnzeige } from '@/components/MeldungsgliederungAnzeige';
import { erzeugeSpaeteMeldungen } from '@/lib/banner/banner.index';

/** Fortschritt, Importbericht und Konfliktauflösung; Schließen ist nur während
 *  des Speicherns einer Entscheidung gesperrt und beendet weder einen laufenden
 *  Import noch dessen Nacharbeit. Danach eintreffende Meldungen erscheinen als
 *  ein Vorgangsergebnis-Banner. */
export interface DateiImportOverlayProps {
  /** Laufender Import (Fortschritt) oder fertiges Ergebnis. Das Ergebnis wird
   *  bei seinem Eintreffen einmalig übernommen; erfolgreich erledigte
   *  Konflikte werden lokal entfernt und im Bericht ergänzt. */
  zustand: Exclude<DateiImportZustand, { art: 'kein' }>;
  onSchliessen: () => void;
  /** Wird nach jedem aufgelösten Gesetz-Konflikt aufgerufen (Ersetzen
   *  schreibt eine neue Gesetzesversion) – lädt die Gesetzeliste neu
   *  (gleiches Muster wie onNeuLadenNachImport beim Internet-Import). Für
   *  Favoriten/Lesezeichen/Gesetzeskurzbefehle/Markierungen ist kein Callback nötig
   *  – dort meldet loeseImportKonflikt selbst per Cross-Window-Event
   *  (siehe dateiImport.einfach.ts::meldeAenderung).
   *  Wird nach Entfernung des Konflikts und Ergänzung des Berichts erwartet.
   *  Ablehnung wird im Importbericht angezeigt: die gespeicherte Änderung bleibt bestehen,
   *  weitere Konflikte können verarbeitet werden. */
  onNeuLaden: (
    referenzen: readonly Gesetzesreferenz[],
    meldungEmpfangen?: AktionsMeldungEmpfaenger,
  ) => Promise<void>;
}

/** Anzeige-Titel je Konfliktart für die alphabetisch sortierte
 *  Konfliktliste (siehe Absprache: "Alle Dopplungen alphabetisch aufführen,
 *  nach dem Dateinamen"). */
/** Übernommenes Gesetz mit seiner Referenz zur Zuordnung späterer Meldungen. */
interface UebernommenesGesetz {
  bericht: BerichtEintrag;
  referenz: Gesetzesreferenz;
}

function konfliktName(k: ImportKonflikt): string {
  return k.art === 'gesetz' ? k.kurztitel : k.anzeigename;
}

function sortierteKonflikte(ergebnis: DateiImportErgebnis | null): ImportKonflikt[] {
  return [...(ergebnis?.konflikte ?? [])].sort((a, b) =>
    konfliktName(a).localeCompare(konfliktName(b), 'de'),
  );
}

const KEIN_ERGEBNIS: DateiImportErgebnis = {
  konflikte: [],
  berichtEintraege: [],
  fehler: [],
};

function fortschrittsText(zustand: Extract<DateiImportZustand, { art: 'laeuft' }>): string {
  if (zustand.phase === 'lesen') return 'Dateien werden gelesen …';
  if (zustand.aktuelleDatei === undefined) return 'Import wird abgeschlossen …';
  return `Datei ${zustand.erledigt + 1} von ${zustand.gesamt} wird importiert: ${zustand.aktuelleDatei}`;
}

export function DateiImportOverlay({ zustand, onSchliessen, onNeuLaden }: DateiImportOverlayProps) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const buttonRollen = useButtonRollen();
  const abstandRollen = useAbstandRollen();
  const ueberschriftStyle: React.CSSProperties = {
    ...textRollen.abschnittsUeberschrift,
    marginBottom: pxSkaliert(8, uiFaktor),
  };
  const eingetroffen = zustand.art === 'fertig' ? zustand.ergebnis : null;
  const ergebnis = eingetroffen ?? KEIN_ERGEBNIS;
  const reinerErfolg: boolean = !!eingetroffen && istReinerImportErfolg(eingetroffen);
  const [konflikte, setKonflikte] = useState<ImportKonflikt[]>(sortierteKonflikte(eingetroffen));
  const [zusaetzlicheEintraege, setZusaetzlicheEintraege] = useState<BerichtEintrag[]>([]);
  const [, aktualisiereBericht] = useReducer((stand: number) => stand + 1, 0);
  useEffect(() => {
    const abmelden = [...ergebnis.berichtEintraege, ...zusaetzlicheEintraege].flatMap((eintrag) =>
      eintrag.abschluss ? [eintrag.abschluss.abonnieren(aktualisiereBericht)] : [],
    );
    return () => {
      for (const ende of abmelden) ende();
    };
  }, [ergebnis, zusaetzlicheEintraege]);
  // Checkbox "Wenn Daten nicht zusammengeführt werden können, die
  // bestehende Version behalten" – nur sichtbar, wenn mindestens ein
  // Gesetzeskurzbefehle- oder Markierungen-Konflikt vorliegt (siehe Absprache).
  const [behalteBestehende, setBehalteBestehende] = useState(true);
  // Gesperrt wird nur der gerade bearbeitete Konflikt; Sammelaktionen sperren
  // alle. Der Ref schützt synchron gegen Doppelklick vor dem nächsten Rendern.
  const [laufende, setLaufende] = useState<ReadonlySet<ImportKonflikt>>(new Set());
  const [sammelLaeuft, setSammelLaeuft] = useState(false);
  const laufendRef = useRef(new Set<ImportKonflikt>());
  const sammelRef = useRef(false);
  // Neuladen der Gesetzesliste nacheinander, nie parallel.
  const neuLadenKette = useRef<Promise<void>>(Promise.resolve());
  // Alle zu einem Ergebnis übernommenen Gesetze: Spätere Neuladevorgänge
  // ordnen auch ihnen zu.
  const uebernommeneGesetze = useRef(new WeakMap<object, UebernommenesGesetz[]>());
  // Gesperrt wird nur während des Speicherns; Folgeläufe und Neuladen laufen danach weiter.
  const busy = sammelLaeuft || laufende.size > 0;
  // Späte Meldungen nach dem Schließen: eine Sammelstelle je Anzeige. Sie
  // schließt mit dem Bericht; ein bloß simulierter Abbau (StrictMode) ist
  // kein Schließen, weil der Neuaufbau vor der Mikroaufgabe folgt.
  const [spaeteMeldungen] = useState(erzeugeSpaeteMeldungen);
  const aktuelleEintraege = useRef<readonly BerichtEintrag[]>([]);
  const angezeigt = useRef(false);
  useEffect(() => {
    angezeigt.current = true;
    return () => {
      angezeigt.current = false;
      queueMicrotask(() => {
        if (!angezeigt.current) spaeteMeldungen.schliesse(aktuelleEintraege.current);
      });
    };
  }, [spaeteMeldungen]);
  const schliessen = () => {
    spaeteMeldungen.schliesse(aktuelleEintraege.current);
    onSchliessen();
  };
  // Trifft das Ergebnis erst nach dem Öffnen ein (oder ein neues), werden
  // seine Konflikte einmalig übernommen (Zustandsanpassung beim Rendern).
  const [uebernommen, setUebernommen] = useState(eingetroffen);
  // Meldungen des Neuladens, die keinem übernommenen Gesetz eindeutig zuzuordnen sind.
  const [zusaetzlicheFehler, setZusaetzlicheFehler] = useState<ImportFehler[]>([]);
  if (uebernommen !== eingetroffen) {
    setUebernommen(eingetroffen);
    setKonflikte(sortierteKonflikte(eingetroffen));
    setZusaetzlicheEintraege([]);
    setZusaetzlicheFehler([]);
  }
  // Volle Übernahme von buttonRollen.sekundaerKompakt() statt eigenem
  // Padding-Literal (siehe Absprache Padding-Vereinheitlichung).
  const aktionButtonStyle = (gesperrt: boolean): React.CSSProperties => ({
    ...buttonRollen.sekundaerKompakt(gesperrt),
    whiteSpace: 'nowrap',
  });
  // "Alle zusammenführen"/"Alle ersetzen" sind gleichrangige Sammel-Aktionen
  // für den ganzen Dialog (nicht Pro-Zeile-Aktionen wie aktionButtonStyle
  // oben) – bewusst in normaler statt kompakter Buttongröße (Bugfix).
  const sammelButtonStyle: React.CSSProperties = {
    ...buttonRollen.sekundaer(busy),
    whiteSpace: 'nowrap',
  };

  const zeigeCheckbox: boolean = !!konflikte.some(
    (k) => k.art === 'gesetzeskurzbefehle' || k.art === 'markierung',
  );
  const zeigeZusammenfuehrenSpalte: boolean = !!konflikte.some((k) =>
    ermittleImportAktionen(k).includes('zusammenfuehren'),
  );

  /** Löst einen Konflikt und liefert seinen Berichtseintrag; ohne Neuladen. */
  async function applyKonflikt(konflikt: ImportKonflikt, aktion: ImportAktion) {
    let bericht: BerichtEintrag;
    try {
      bericht = await loeseImportKonflikt(konflikt, aktion, behalteBestehende);
    } catch (fehler) {
      const text = fehler instanceof Error ? fehler.message : String(fehler);
      setZusaetzlicheEintraege((prev) => [
        ...prev,
        fehler instanceof ImportAbschlussFehler
          ? { ...fehler.bericht, quelle: konflikt.quelle }
          : {
              kategorie: konflikt.art,
              aktion: 'nichtUebernommen',
              name:
                konflikt.art === 'gesetz'
                  ? konflikt.kurztitel
                  : (konflikt.kurztitel ?? konflikt.anzeigename),
              ...(konflikt.quelle ? { quelle: konflikt.quelle } : {}),
              meldungen: [
                { typ: 'fehler', art: 'fehler', anlass: 'import', aenderungsstand: 'keine', text },
              ],
            },
      ]);
      throw fehler;
    }
    setKonflikte((prev) => prev.filter((k) => k !== konflikt));
    setZusaetzlicheEintraege((prev) => [...prev, bericht]);
    return bericht;
  }

  /** Lädt die Gesetzesliste einmal neu, nach einem etwa laufenden Neuladen.
   *  Meldungen gehen an den Eintrag des eindeutig betroffenen, in diesem
   *  Ergebnis übernommenen Gesetzes (je Text einmal), die übrigen in den
   *  Bericht ohne Gesetz; ein Fehler des Neuladens selbst wird bei jedem
   *  jetzt übernommenen Gesetz vermerkt. */
  function ladeGesetzeNeu(gesetze: readonly UebernommenesGesetz[]): Promise<void> {
    if (gesetze.length === 0) return Promise.resolve();
    const schluessel = eingetroffen ?? KEIN_ERGEBNIS;
    const bekannt = [...(uebernommeneGesetze.current.get(schluessel) ?? []), ...gesetze];
    uebernommeneGesetze.current.set(schluessel, bekannt);
    const lauf = neuLadenKette.current.then(async () => {
      try {
        await onNeuLaden(
          gesetze.map((g) => g.referenz),
          (meldung) => {
            const ziel = betroffenesGesetz(
              meldung.betroffen,
              uebernommeneGesetze.current.get(schluessel) ?? bekannt,
            );
            if (ziel) {
              const meldungen = (ziel.bericht.meldungen ??= []);
              if (!meldungen.some((m) => m.text === meldung.text)) meldungen.push(meldung);
              return;
            }
            spaeteMeldungen.melde(meldung);
            const neu = meldungAlsImportFehler(meldung, meldung.betroffen);
            // Wiederholtes Neuladen meldet denselben Befund nur einmal.
            setZusaetzlicheFehler((prev) =>
              prev.some(
                (f) =>
                  f.datei === neu.datei &&
                  f.meldungsgrund === neu.meldungsgrund &&
                  f.detail === neu.detail,
              )
                ? prev
                : [...prev, neu],
            );
          },
        );
      } catch (fehler) {
        const grund = fehler instanceof Error ? fehler.message : String(fehler);
        for (const { bericht } of gesetze)
          (bericht.meldungen ??= []).push({
            typ: 'fehler',
            art: 'hinweis',
            anlass: 'lesen',
            aenderungsstand: 'vollstaendig',
            text: `Das Gesetz wurde gespeichert. Die Gesetzesliste konnte danach nicht neu geladen werden: ${grund}`,
          });
      }
      aktualisiereBericht();
    });
    neuLadenKette.current = lauf;
    spaeteMeldungen.verfolge(lauf);
    return lauf;
  }

  async function loeseEinzeln(konflikt: ImportKonflikt, aktion: ImportAktion) {
    if (!ermittleImportAktionen(konflikt).includes(aktion)) return;
    if (sammelRef.current || laufendRef.current.has(konflikt)) return;
    laufendRef.current.add(konflikt);
    setLaufende(new Set(laufendRef.current));
    try {
      const bericht = await applyKonflikt(konflikt, aktion);
      // Neuladen im Hintergrund (seriell über die Kette); die Sperre endet mit dem Speichern.
      if (konflikt.art === 'gesetz')
        void ladeGesetzeNeu([{ bericht, referenz: konflikt.neuesGesetz }]);
    } catch {
      // applyKonflikt hat den Dateibefund bereits im Importbericht erfasst.
    } finally {
      laufendRef.current.delete(konflikt);
      setLaufende(new Set(laufendRef.current));
    }
  }

  /** Löst alle passenden Konflikte nacheinander und lädt danach einmal neu. */
  async function loeseAlle(aktion: ImportAktion) {
    if (sammelRef.current || laufendRef.current.size > 0) return;
    sammelRef.current = true;
    setSammelLaeuft(true);
    const gesetze: UebernommenesGesetz[] = [];
    try {
      for (const k of [...konflikte])
        if (ermittleImportAktionen(k).includes(aktion)) {
          const bericht = await applyKonflikt(k, aktion);
          if (k.art === 'gesetz') gesetze.push({ bericht, referenz: k.neuesGesetz });
        }
    } catch {
      // applyKonflikt hat den Dateibefund bereits im Importbericht erfasst.
    } finally {
      // Auch nach einem Abbruch werden die bereits übernommenen Gesetze geladen;
      // im Hintergrund, die Sperre endet mit dem Speichern.
      void ladeGesetzeNeu(gesetze);
      sammelRef.current = false;
      setSammelLaeuft(false);
    }
  }

  const alleBerichtEintraege = [...ergebnis.berichtEintraege, ...zusaetzlicheEintraege];
  aktuelleEintraege.current = alleBerichtEintraege;
  // Frisch je Rendern: späte Meldungen ergänzen bestehende Einträge.
  const bericht = gliedereImportbericht(alleBerichtEintraege, [
    ...ergebnis.fehler,
    ...zusaetzlicheFehler,
  ]);

  const konfliktZeilen: ReactElement[] = konflikte.map((k): ReactElement => {
    const zeileGesperrt = sammelLaeuft || laufende.has(k);
    const meldungsZeilen: ReactElement[] = (k.meldungen ?? []).map((meldung, i) => (
      <TextAnzeige key={i} element="div" style={textRollen.hinweistext} text={meldung.text} />
    ));
    return (
      <div
        key={`${k.quelle ?? ''}:${konfliktName(k)}:${konflikte.indexOf(k)}`}
        style={konfliktZeileStil(uiFaktor)}
      >
        <div>
          <TextAnzeige
            element="div"
            style={{ ...textRollen.standardtext }}
            text={k.quelle ? `${k.quelle} (${konfliktName(k)})` : konfliktName(k)}
          />
          {meldungsZeilen}
          {k.art === 'gesetz' &&
            !!(k.bestehendeVerarbeitungszeit || k.importierteVerarbeitungszeit) && (
              <div style={{ ...textRollen.hinweistext, marginTop: pxSkaliert(2, uiFaktor) }}>
                {!!k.bestehendeVerarbeitungszeit && (
                  <TextAnzeige
                    element="div"
                    text={`Aktuelle Version: verarbeitet am ${formatDatumLang(k.bestehendeVerarbeitungszeit)}`}
                  />
                )}
                {!!k.importierteVerarbeitungszeit && (
                  <TextAnzeige
                    element="div"
                    text={`Import: verarbeitet am ${formatDatumLang(k.importierteVerarbeitungszeit)}`}
                  />
                )}
              </div>
            )}
        </div>
        <div style={{ display: 'flex', gap: abstandRollen.standard }}>
          {!!ermittleImportAktionen(k).includes('zusammenfuehren') && (
            <button
              onClick={() => loeseEinzeln(k, 'zusammenfuehren')}
              disabled={zeileGesperrt}
              style={aktionButtonStyle(zeileGesperrt)}
            >
              <TextAnzeige text="Zusammenführen" />
            </button>
          )}
          {!!ermittleImportAktionen(k).includes('ersetzen') && (
            <button
              onClick={() => loeseEinzeln(k, 'ersetzen')}
              disabled={zeileGesperrt}
              style={aktionButtonStyle(zeileGesperrt)}
            >
              <TextAnzeige text="Ersetzen" />
            </button>
          )}
        </div>
      </div>
    );
  });

  return (
    <OverlayRahmen onSchliessen={schliessen} breite={OVERLAY_BREITE_GROSS} kannSchliessen={!busy}>
      <OverlayKopfzeile
        icon={FileArrowDown}
        titel="Dateien importieren"
        onSchliessen={schliessen}
        schliessenDeaktiviert={busy}
      />

      <div style={{ overflowY: 'auto', flex: 1, padding: overlayAussenPadding(uiFaktor) }}>
        {zustand.art === 'laeuft' && (
          <TextAnzeige
            element="div"
            style={textRollen.hinweistext}
            text={fortschrittsText(zustand)}
          />
        )}
        {reinerErfolg && (
          <TextAnzeige
            element="div"
            style={{ ...textRollen.standardtext, marginBottom: pxSkaliert(12, uiFaktor) }}
            text={dateiImportErfolgstext(ergebnis.berichtEintraege.length)}
          />
        )}
        {konflikte.length > 0 && (
          <div>
            <TextAnzeige element="div" style={ueberschriftStyle} text="Importkonflikte" />
            {konfliktZeilen}

            {zeigeCheckbox && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: abstandRollen.standard,
                  marginTop: pxSkaliert(12, uiFaktor),
                  fontSize: pxSkaliert(13, uiFaktor),
                  color: 'var(--text-sekundaer)',
                  cursor: 'pointer',
                }}
              >
                <Checkbox checked={behalteBestehende} onChange={setBehalteBestehende} />
                <TextAnzeige text="Wenn Daten nicht zusammengeführt werden können, die bestehende Version behalten" />
              </label>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: abstandRollen.standard,
                marginTop: pxSkaliert(12, uiFaktor),
              }}
            >
              {zeigeZusammenfuehrenSpalte && (
                <button
                  onClick={() => loeseAlle('zusammenfuehren')}
                  disabled={busy}
                  style={sammelButtonStyle}
                >
                  <TextAnzeige text="Alle zusammenführen" />
                </button>
              )}
              {!!konflikte.some((k) => ermittleImportAktionen(k).includes('ersetzen')) && (
                <button
                  onClick={() => loeseAlle('ersetzen')}
                  disabled={busy}
                  style={sammelButtonStyle}
                >
                  <TextAnzeige text="Alle ersetzen" />
                </button>
              )}
            </div>
          </div>
        )}

        {bericht.anzahl > 0 && (
          <div style={{ marginTop: konflikte.length > 0 ? pxSkaliert(24, uiFaktor) : 0 }}>
            <TextAnzeige element="div" style={ueberschriftStyle} text="Importbericht" />
            <MeldungsgliederungAnzeige
              gliederung={bericht}
              zeilenStil={{
                paddingTop: pxSkaliert(4, uiFaktor),
                paddingBottom: pxSkaliert(4, uiFaktor),
              }}
            />
          </div>
        )}
      </div>
    </OverlayRahmen>
  );
}

function konfliktZeileStil(faktor: number): React.CSSProperties {
  const abstandRollen = erzeugeAbstandRollen(faktor);
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${pxSkaliert(10, faktor)}px 0`,
    borderBottom: '1px solid var(--rahmen)',
    gap: abstandRollen.gross,
  };
}
