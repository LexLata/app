// Rahmen der Konfliktseitenleiste: Stil, Escape-Priorität, Rückmeldungen und Zusammensetzung.
import type { GesetzLader } from '@/lib/gesetz-laden/gesetz-laden.index';
import type { Auswahl } from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import { formatiereInternetImportBericht } from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useButtonRollen } from '@/hooks/stil/useButtonRollen';
import { useIconGroessen, useTextRollen } from '@/hooks/stil/useTextRollen';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { AnzeigeGesetzKonflikte } from '@/lib/markierungen/markierungen.index';
import { fensterAussenPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { erzeugeRadiusRollen } from '@/lib/stil/radiusRollen';
import { DownloadSimple, Link, ListChecks, Trash } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import { KonfliktseitenleisteAuswahl } from './KonfliktseitenleisteAuswahl';
import { KonfliktseitenleisteHilfe } from './KonfliktseitenleisteHilfe';
import { useKonfliktaktionslauf } from './useKonfliktaktionslauf';
import { useKonfliktVerknuepfung } from './useKonfliktVerknuepfung';
export function Konfliktseitenleiste({
  auswahl,
  ladeGesetz,
  gesetze,
  verknuepfungsMoeglichkeit,
  wirdGeladen,
  onErfolgreicherImport,
  onAlleGeprueft,
  onAktionsNachfehler,
  aktionsAbschlussOffen,
  darfAktionStarten,
  registriereAbschluss,
}: {
  auswahl: Auswahl | null;
  ladeGesetz: GesetzLader | undefined;
  /** Für die Mehrfach-Aktionen unten – die beziehen sich auf ALLE aktuell
   *  angezeigten Konflikte, nicht nur auf `auswahl`. */
  gesetze: AnzeigeGesetzKonflikte[];
  verknuepfungsMoeglichkeit: { moeglich: boolean; fehler: string | null };
  wirdGeladen: boolean;
  /** Wird bei JEDEM erfolgreichen Gesetz-Import aufgerufen (Einzel-Button
   *  unten UND Sammel-Import) – der Elternteil klappt das jeweilige Gesetz
   *  daraufhin automatisch auf, sobald es nach dem Reload konkrete
   *  Konflikte zeigt (siehe MarkierungskonfliktFenster.tsx: wartetAufAufklappen). */
  onErfolgreicherImport: (gesetz: Gesetzesreferenz) => void;
  /** Wird beim Klick auf "Alle Markierungen neu prüfen" aufgerufen – der
   *  Elternteil klappt danach, analog zum initialen Laden, das erste Gesetz
   *  mit konkreten Konflikten auf, falls noch nichts aufgeklappt ist. Wartet auf
   *  die gemeinsam aktualisierte Liste samt allgemeinem Verknüpfungsangebot. */
  onAlleGeprueft: () => Promise<void>;
  onAktionsNachfehler?: () => void;
  /** Bestehender Unsicherheitszustand des Elternfensters; nur erfolgreiche Vollprüfung hebt ihn auf. */
  aktionsAbschlussOffen: boolean;
  darfAktionStarten?: () => boolean;
  registriereAbschluss?: (lauf: Promise<unknown>) => void;
}) {
  const textRollen = useTextRollen();
  const iconGroessen = useIconGroessen();
  const [allgemeineRueckmeldung, setAllgemeineRueckmeldung] = useState(false);
  const [hilfeOffen, setHilfeOffen] = useState(false);
  // Die geöffnete Hilfe erhält Escape vor dem allgemeinen Fenster-Schließen,
  // auch wenn sie nur per Hover geöffnet wurde und keinen Tastaturfokus hat.
  useEffect(() => {
    if (!hilfeOffen) return;
    function schliesseHilfe(ereignis: KeyboardEvent) {
      if (ereignis.key !== 'Escape') return;
      ereignis.preventDefault();
      ereignis.stopImmediatePropagation();
      setHilfeOffen(false);
    }
    window.addEventListener('keydown', schliesseHilfe, true);
    return () => window.removeEventListener('keydown', schliesseHilfe, true);
  }, [hilfeOffen]);

  const uiFaktor = useUiSkalierungsFaktor();
  const buttonRollen = useButtonRollen();
  const radiusRollen = erzeugeRadiusRollen(uiFaktor);
  const abstandRollen = useAbstandRollen();
  const [verknuepfungsMeldung, setVerknuepfungsMeldung] = useState<string | null>(null);
  const [verknuepfungsFehler, setVerknuepfungsFehler] = useState<string | null>(null);
  const {
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
  } = useKonfliktaktionslauf({
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
  });
  // Volle Übernahme von buttonRollen.sekundaerKompakt() statt eigenem
  // Padding-Literal (siehe Absprache Padding-Vereinheitlichung) – bringt als
  // Nebeneffekt einen sichtbaren deaktiviert-Zustand mit, den es vorher an
  // dieser Stelle gar nicht gab (disabled={laeuft || wirdGeladen || aktionsAbschlussOffen} blieb bisher optisch
  // unerkennbar).
  const buttonStil: React.CSSProperties = {
    ...buttonRollen.sekundaerKompakt(laeuft || wirdGeladen || aktionsAbschlussOffen),
    // Gleicher Abstand am linken Rand und zwischen Icon und Text (8 px bei Faktor 1).
    padding: buttonRollen.paddingFaktorKompakt(1, 8 / 14),
    display: 'grid',
    gridTemplateColumns: `${iconGroessen.standard}px minmax(0, 1fr)`,
    alignItems: 'center',
    gap: abstandRollen.standard,
    width: '100%',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    boxSizing: 'border-box',
    textAlign: 'left',
    marginBottom: pxSkaliert(6, uiFaktor),
    background: 'var(--bg-panel)',
  };
  const {
    verknuepfungMoeglich,
    ausgangMoeglich,
    liveEintrag,
    moeglichkeitsFehler,
    zeile,
    verknuepfen,
  } = useKonfliktVerknuepfung({
    auswahl,
    gesetze,
    aktionsAbschlussOffen,
    verknuepfungsMoeglichkeit,
    registriereAbschluss,
    onAktionsNachfehler,
    aktionsStartErlaubt,
    auswahlIdentitaet,
    setAktionsFehler,
    setEinzelImportFehler,
    ausfuehren,
    setVerknuepfungsMeldung,
    setVerknuepfungsFehler,
    setAllgemeineRueckmeldung,
    setHilfeOffen,
  });
  const titel = auswahl ? 'Aktionen für den ausgewählten Konflikt' : 'Keine Auswahl';
  const rueckmeldungsHilfe = (
    <KonfliktseitenleisteHilfe
      allgemeineRueckmeldung={allgemeineRueckmeldung}
      hilfeOffen={hilfeOffen}
      setHilfeOffen={setHilfeOffen}
      textRollen={textRollen}
      buttonRollen={buttonRollen}
      abstandRollen={abstandRollen}
      radiusRollen={radiusRollen}
      uiFaktor={uiFaktor}
    />
  );
  const importBerichtZeilen: string[] = formatiereInternetImportBericht(importBericht);

  return (
    <div
      style={{
        width: pxSkaliert(330, uiFaktor),
        maxWidth: '55%',
        flexShrink: 0,
        borderLeft: '1px solid var(--trenner-ebene)',
        padding: fensterAussenPadding(uiFaktor),
        overflowY: 'auto',
      }}
    >
      <TextAnzeige
        element="div"
        style={{ ...textRollen.standardtextBetont, marginBottom: pxSkaliert(10, uiFaktor) }}
        text={titel}
      />

      <KonfliktseitenleisteAuswahl
        ladeGesetz={ladeGesetz}
        auswahl={auswahl}
        laeuft={laeuft}
        wirdGeladen={wirdGeladen}
        aktionsAbschlussOffen={aktionsAbschlussOffen}
        buttonStil={buttonStil}
        textRollen={textRollen}
        iconGroessen={iconGroessen}
        abstandRollen={abstandRollen}
        uiFaktor={uiFaktor}
        ausfuehren={ausfuehren}
        verknuepfen={verknuepfen}
        liveEintrag={liveEintrag}
        zeile={zeile}
        ausgangMoeglich={ausgangMoeglich}
        einzelImportFehler={einzelImportFehler}
        setEinzelImportFehler={setEinzelImportFehler}
        auswahlIdentitaet={auswahlIdentitaet}
        onErfolgreicherImport={onErfolgreicherImport}
      />
      {aktionsFehler?.bereich === 'auswahl' &&
        aktionsFehler.auswahlIdentitaet === auswahlIdentitaet && (
          <TextAnzeige element="div" style={textRollen.fehlertext} text={aktionsFehler.text} />
        )}

      <div
        style={{
          borderTop: '1px solid var(--trenner-ebene)',
          margin: `${pxSkaliert(25, uiFaktor)}px 0 ${pxSkaliert(12, uiFaktor)}px`,
        }}
      />
      <TextAnzeige
        element="div"
        style={{ ...textRollen.standardtextBetont, marginBottom: pxSkaliert(10, uiFaktor) }}
        text={'Aktionen für mehrere Konflikte'}
      />
      {!!verknuepfungMoeglich && (
        <>
          <TextAttributElement
            element="button"
            style={buttonStil}
            disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
            title="Aktualisiert Verknüpfungen von Verweisen und Kommentaren, die sich auf die gesamte Norm beziehen, sowie Verknüpfungen zu Zielnormen, die in den Gesetzen auf dem Gerät vorhanden sind. Konflikte an spezifischen Textstellen müssen einzeln geprüft werden."
            onClick={() => verknuepfen('alle')}
          >
            <Link size={iconGroessen.standard} weight="regular" aria-hidden="true" />
            <TextAnzeige text={'Mit aktuellen Normen verknüpfen'} />
          </TextAttributElement>
        </>
      )}
      {!!moeglichkeitsFehler && (
        <TextAnzeige element="div" style={textRollen.fehlertext} text={moeglichkeitsFehler} />
      )}
      {!!verknuepfungsMeldung && (
        <div
          style={{
            ...textRollen.standardtext,
            color: 'var(--text-sekundaer)',
            position: 'relative',
            marginBottom: verknuepfungsFehler ? 0 : abstandRollen.gross,
          }}
        >
          <TextAnzeige text={verknuepfungsMeldung} />
          {!verknuepfungsFehler && rueckmeldungsHilfe}
        </div>
      )}
      {!!verknuepfungsFehler && (
        <div
          style={{
            ...textRollen.fehlertext,
            position: 'relative',
            marginBottom: abstandRollen.gross,
          }}
        >
          <TextAnzeige text={verknuepfungsFehler} />
          {rueckmeldungsHilfe}
        </div>
      )}
      {fehlendeGesetze.length > 0 && (
        <button
          style={buttonStil}
          disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
          onClick={importAlleFehlenden}
        >
          <DownloadSimple size={iconGroessen.standard} weight="regular" aria-hidden="true" />
          <TextAnzeige text={'Fehlende Rechtstexte aus dem Internet importieren'} />
        </button>
      )}
      {importBericht.length > 0 && (
        <div
          style={{
            ...textRollen.standardtext,
            color: 'var(--text-sekundaer)',
            marginBottom: pxSkaliert(6, uiFaktor),
          }}
        >
          {importBerichtZeilen.map((zeile, i) => (
            <TextAnzeige
              element="div"
              key={i}
              style={{
                color: zeile.startsWith('✓')
                  ? 'var(--text-sekundaer)'
                  : textRollen.fehlertext.color,
              }}
              text={zeile}
            />
          ))}
        </div>
      )}
      {!!gibtKonflikteZumLoeschen && (
        <button
          style={buttonStil}
          disabled={laeuft || wirdGeladen || aktionsAbschlussOffen}
          onClick={alleMarkierungenLoeschen}
        >
          <Trash size={iconGroessen.standard} weight="regular" aria-hidden="true" />
          <TextAnzeige text={'Alle betroffenen Markierungen löschen'} />
        </button>
      )}
      <button
        style={{
          ...buttonStil,
          ...buttonRollen.sekundaerKompakt(laeuft || wirdGeladen),
          padding: buttonStil.padding,
          whiteSpace: buttonStil.whiteSpace,
          background: buttonStil.background,
        }}
        disabled={laeuft || wirdGeladen}
        onClick={alleMarkierungenNeuPruefen}
      >
        <ListChecks size={iconGroessen.standard} weight="regular" aria-hidden="true" />
        <TextAnzeige
          text={
            pruefungStatus === 'laeuft'
              ? 'Prüfung läuft …'
              : pruefungStatus === 'fertig'
                ? 'Prüfung durchgeführt ✓'
                : 'Alle Markierungen neu prüfen'
          }
        />
      </button>
      {aktionsFehler?.bereich === 'alle' && (
        <div style={{ ...textRollen.fehlertext, position: 'relative' }}>
          <TextAnzeige text={aktionsFehler.text} />
          {!verknuepfungsMeldung && !verknuepfungsFehler && rueckmeldungsHilfe}
        </div>
      )}
    </div>
  );
}
