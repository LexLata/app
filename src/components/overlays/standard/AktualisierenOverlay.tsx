// AktualisierenOverlay.tsx
// Overlay zum erneuten Herunterladen bereits importierter Gesetze.

import {
  kurztitelVergleichsform,
  vergleicheNachKurztitelUndNormgeber,
} from '@/lib/domain/kurztitelVergleich';
import { hatImportindex } from '@/lib/domain/normgeber';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import {
  erzeugeBannerMeldungsSammlung,
  zeigeAktionsMeldungsBanner,
} from '@/lib/banner/banner.index';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useState, useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { LesbarerSuchverzeichniseintrag } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { OverlayRahmen, OVERLAY_BREITE_NORMAL } from '@/components/overlays/OverlayRahmen';
import { OverlayKopfzeile } from '@/components/overlays/standard/OverlayKopfzeile';
import {
  ermittleAktualisierbareGesetze,
  type AktualisierbareGesetzeErgebnis,
  ermittleFruehesteVerarbeitungszeit,
  aktualisiereGesetz,
  aktualisiereGesetze,
} from '@/lib/import/import.index';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { eingabefeldPadding, overlayKopfPadding, pxSkaliert } from '@/lib/stil/paddingRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { KandidatenListe, LeerZustand, type LadeZustand } from './AktualisierenOverlay.inhalt';
import type { AktionsMeldung } from '@/lib/domain/app/aktionsMeldung';

/** Ein Banner nur bei Befunden; aktualisierte Gesetze tragen die Folgemeldungen. */
function zeigeAktualisierungsBanner(meldungen: readonly AktionsMeldung[], aktualisiert: string[]) {
  if (!meldungen.length) return;
  zeigeAktionsMeldungsBanner(meldungen, {
    namen: aktualisiert,
    ueberschrift: () => 'Aktualisiert',
  });
}

/** Aktualisierung von Internetimporten; lokales Schließen ist während der Arbeit gesperrt. */
export interface AktualisierenOverlayProps {
  /** Alle gespeicherten Gesetze – gefiltert werden nur Internet-Importe angezeigt */
  gesetze: LesbarerSuchverzeichniseintrag[];
  wirdVorbereitet?: boolean;
  onSchliessen: () => void;
  /** Übernimmt nach Einzelaufruf oder Batch unveränderte Gesetze mit neuem Prüfdatum.
   * Inhaltsänderungen werden über das zentrale Speicherereignis übernommen. */
  onInfoAktualisiert: (aktualisierteGesetze: GesetzDarstellung[]) => void;
}

// Komponente

export function AktualisierenOverlay({
  gesetze,
  wirdVorbereitet = false,
  onSchliessen,
  onInfoAktualisiert,
}: AktualisierenOverlayProps) {
  const [zustaende, setZustaende] = useState<Record<string, LadeZustand>>({});
  const laufendeGesetze = Object.values(zustaende).flatMap((zustand) =>
    'laedt' in zustand ? [zustand.laedt] : [],
  );
  const irgendwasLaedt = laufendeGesetze.length > 0;
  const gesetzesmenge = JSON.stringify(
    [...new Set(gesetze.map(gesetzesreferenzSchluessel))].sort(),
  );
  const generation = useRef(0);
  const [ermittlung, setErmittlung] = useState<{
    menge: string;
    ergebnis: AktualisierbareGesetzeErgebnis | null;
    abgeschlossen: boolean;
  }>({ menge: gesetzesmenge, ergebnis: null, abgeschlossen: false });
  if (ermittlung.menge !== gesetzesmenge) {
    setErmittlung({ ...ermittlung, menge: gesetzesmenge, abgeschlossen: false });
  }
  const ermittle = useEffectEvent(() => ermittleAktualisierbareGesetze(gesetze));
  useEffect(() => {
    const aktuell = ++generation.current;
    let aktiv = true;
    void ermittle().then((ergebnis) => {
      if (!aktiv || generation.current !== aktuell) return;
      setErmittlung({ menge: gesetzesmenge, ergebnis, abgeschlossen: true });
    });
    return () => {
      aktiv = false;
    };
  }, [gesetzesmenge]);
  const wirdErmittelt = ermittlung.menge !== gesetzesmenge || !ermittlung.abgeschlossen;
  const ergebnis = ermittlung.ergebnis;
  const kandidaten = angezeigteGesetze(gesetze, ergebnis, laufendeGesetze, wirdErmittelt);
  const anzahl = ergebnis?.art === 'ermittelt' ? ergebnis.nichtImImportindex.length : 0;
  const hinweis = importindexHinweis(anzahl);

  const [suchtext, setSuchtext] = useState('');
  const sucheRef = useRef<HTMLInputElement>(null);
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const radiusRollen = useRadiusRollen();
  useEffect(() => {
    sucheRef.current?.focus();
  }, []);
  const sichtbar = kandidaten.filter(
    (gesetz) =>
      kurztitelVergleichsform(gesetz.kurztitel).includes(kurztitelVergleichsform(suchtext)) ||
      kurztitelVergleichsform(gesetz.langtitel ?? '').includes(kurztitelVergleichsform(suchtext)),
  );

  const zuletztAktualisiert = useMemo(
    () => ermittleFruehesteVerarbeitungszeit(kandidaten),
    [kandidaten],
  );

  const aktualisiereAlleBeiEnter = useEffectEvent(() => alleAktualisieren());

  // Enter startet alle Aktualisierungen (Escape wird von OverlayRahmen behandelt)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !wirdErmittelt && !irgendwasLaedt && kandidaten.length > 0)
        void aktualisiereAlleBeiEnter();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [irgendwasLaedt, kandidaten, zustaende, wirdErmittelt]);

  async function einzelnAktualisierenOhneLock(gesetz: LesbarerSuchverzeichniseintrag) {
    // Kein Doppelstart
    const zustand = zustaende[gesetzesreferenzSchluessel(gesetz)];
    if (zustand && 'laedt' in zustand) return;

    setZustaende((prev) => ({ ...prev, [gesetzesreferenzSchluessel(gesetz)]: { laedt: gesetz } }));

    const meldungen = erzeugeBannerMeldungsSammlung();
    const aktualisiert: string[] = [];
    try {
      const ergebnis = await aktualisiereGesetz(gesetz, undefined, meldungen.meldungEmpfangen);

      if (ergebnis.art === 'fehler') {
        setZustaende((prev) => ({
          ...prev,
          [gesetzesreferenzSchluessel(gesetz)]: { fehler: ergebnis.fehler.meldung },
        }));
        return;
      }

      setZustaende((prev) => ({
        ...prev,
        [gesetzesreferenzSchluessel(gesetz)]: { kategorie: ergebnis.kategorie },
      }));
      aktualisiert.push(gesetz.kurztitel);

      if (ergebnis.kategorie === 'unveraendert') {
        onInfoAktualisiert([ergebnis.gesetz]);
      }
    } catch (e) {
      setZustaende((prev) => ({
        ...prev,
        [gesetzesreferenzSchluessel(gesetz)]: { fehler: String(e) },
      }));
    } finally {
      zeigeAktualisierungsBanner(meldungen.abschliessen(), aktualisiert);
    }
  }

  async function einzelnAktualisieren(gesetz: LesbarerSuchverzeichniseintrag) {
    if (wirdErmittelt) return;
    await einzelnAktualisierenOhneLock(gesetz);
  }

  async function alleAktualisieren() {
    if (wirdErmittelt || ergebnis?.art !== 'ermittelt' || kandidaten.length === 0) return;
    // Nur Gesetze ohne laufenden Vorgang starten
    const zuStarten = kandidaten.filter(
      (g) =>
        !laufendeGesetze.some(
          (laufend) => gesetzesreferenzSchluessel(laufend) === gesetzesreferenzSchluessel(g),
        ),
    );

    const meldungen = erzeugeBannerMeldungsSammlung();
    const aktualisiert: string[] = [];
    try {
      const ergebnis = await aktualisiereGesetze(
        zuStarten,
        (gesetz, status, res) => {
          const schluessel = gesetzesreferenzSchluessel(gesetz);
          if (status === 'laden') {
            const kandidat = kandidaten.find(
              (eintrag) => gesetzesreferenzSchluessel(eintrag) === schluessel,
            );
            if (!kandidat) return;
            setZustaende((prev) => ({
              ...prev,
              [schluessel]: {
                laedt: kandidat,
              },
            }));
            return;
          }
          if (status === 'ok' && res && 'kategorie' in res) {
            aktualisiert.push(gesetz.kurztitel);
            setZustaende((prev) => ({ ...prev, [schluessel]: { kategorie: res.kategorie } }));
          } else if (status === 'fehler' && res && 'meldung' in res) {
            setZustaende((prev) => ({ ...prev, [schluessel]: { fehler: res.meldung } }));
          }
        },
        meldungen.meldungEmpfangen,
      );

      onInfoAktualisiert(ergebnis.unveraenderteGesetze);
    } finally {
      zeigeAktualisierungsBanner(meldungen.abschliessen(), aktualisiert);
    }
  }

  // Render

  return (
    <OverlayRahmen
      onSchliessen={onSchliessen}
      breite={OVERLAY_BREITE_NORMAL}
      kannSchliessen={!irgendwasLaedt}
    >
      <OverlayKopfzeile
        icon={ArrowsClockwise}
        titel="Gesetze aktualisieren"
        onSchliessen={onSchliessen}
        schliessenDeaktiviert={irgendwasLaedt}
      />

      <div
        style={{
          padding: overlayKopfPadding(uiFaktor),
          borderBottom: '1px solid var(--rahmen)',
          flexShrink: 0,
        }}
      >
        <TextAttributElement
          element="input"
          ref={sucheRef}
          value={suchtext}
          onChange={(e) => setSuchtext(e.target.value)}
          placeholder="Suchen …"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{
            ...textRollen.standardtext,
            width: '100%',
            padding: eingabefeldPadding(uiFaktor),
            background: 'var(--bg-eingabe)',
            border: '1px solid var(--rahmen)',
            borderRadius: radiusRollen.standard,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {suchtext !== '' && (
          <TextAnzeige
            element="div"
            style={{ ...textRollen.hinweistext, marginTop: pxSkaliert(6, uiFaktor) }}
            text="„Alle aktualisieren“ berücksichtigt auch ausgeblendete Gesetze."
          />
        )}
      </div>

      {/* Inhalt */}
      <>
        {listeWirdVorbereitet(wirdVorbereitet, kandidaten) ? (
          <TextAnzeige style={textRollen.hinweistext} text="Gesetzesliste wird vorbereitet …" />
        ) : !ergebnis && kandidaten.length === 0 ? null : ergebnis?.art ===
            'importindexNichtLesbar' && !irgendwasLaedt ? (
          <TextAnzeige
            style={textRollen.hinweistext}
            text="Der Importindex konnte nicht gelesen werden. Gesetze lassen sich derzeit nicht aktualisieren."
          />
        ) : kandidaten.length === 0 ? (
          <LeerZustand hinweis={hinweis} />
        ) : (
          <KandidatenListe
            kandidaten={sichtbar}
            zustaende={zustaende}
            irgendwasLaedt={irgendwasLaedt}
            wirdErmittelt={wirdErmittelt}
            hinweis={hinweis}
            zuletztAktualisiert={zuletztAktualisiert}
            onEinzeln={einzelnAktualisieren}
            onAlle={alleAktualisieren}
          />
        )}
      </>
    </OverlayRahmen>
  );
}

/** Aktuelle Darstellungen haben Vorrang; entfernte Zeilen bleiben bis zum Ergebnis bzw. Abschluss sichtbar.
 * Bis zum Ergebnis der Importindexprüfung gelten alle Gesetze mit Importindex-Normgeber als Kandidaten.
 * Die Liste ist alphabetisch nach Kurztitel und Normgeber geordnet. */
function angezeigteGesetze(
  gesetze: LesbarerSuchverzeichniseintrag[],
  ergebnis: AktualisierbareGesetzeErgebnis | null,
  laufendeGesetze: LesbarerSuchverzeichniseintrag[],
  wirdErmittelt: boolean,
): LesbarerSuchverzeichniseintrag[] {
  const bisherige = ergebnis?.art === 'ermittelt' ? ergebnis.kandidaten : [];
  const referenzen = new Set(bisherige.map(gesetzesreferenzSchluessel));
  const auswahl = wirdErmittelt
    ? [...bisherige, ...gesetze.filter((gesetz) => hatImportindex(gesetz.normgeber))]
    : gesetze.filter((gesetz) => referenzen.has(gesetzesreferenzSchluessel(gesetz)));
  const aktuelle = new Map(gesetze.map((gesetz) => [gesetzesreferenzSchluessel(gesetz), gesetz]));
  return [
    ...new Map(
      [...auswahl, ...laufendeGesetze].map((gesetz) => {
        const schluessel = gesetzesreferenzSchluessel(gesetz);
        return [schluessel, aktuelle.get(schluessel) ?? gesetz];
      }),
    ).values(),
  ].sort(vergleicheNachKurztitelUndNormgeber);
}

function listeWirdVorbereitet(wirdVorbereitet: boolean, kandidaten: readonly unknown[]) {
  return wirdVorbereitet && kandidaten.length === 0;
}

function importindexHinweis(anzahl: number) {
  return anzahl === 0
    ? undefined
    : anzahl === 1
      ? '1 Gesetz steht nicht im Importindex (z. B. aus einer Datei importiert) und wird nicht aktualisiert. Fehlt es nur, weil der Importindex veraltet ist, hilft es, den Importindex zu aktualisieren.'
      : `${anzahl} Gesetze stehen nicht im Importindex (z. B. aus Dateien importierte) und werden nicht aktualisiert. Fehlt ein Gesetz nur, weil der Importindex veraltet ist, hilft es, den Importindex zu aktualisieren.`;
}
