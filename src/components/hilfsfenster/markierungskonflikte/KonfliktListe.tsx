// KonfliktListe.tsx
//
// Linke Spalte des Markierungskonflikte-Fensters: die eigentliche Konfliktliste
// (KonfliktSymbol, MarkierungsZeile, GesetzZeile). Ausgelagert aus
// MarkierungskonfliktFenster.tsx (500-Zeilen-Richtwert) – die Konfliktaktionen
// zur jeweils ausgewählten Zeile liegen getrennt in
// Konfliktseitenleiste.tsx, gemeinsame Typen/Helfer in
// MarkierungskonfliktFenster.helpers.ts.

// Dateilokale Padding-Helfer statt paddingRollen.ts – die folgenden vier
// Werte kommen ausschließlich in diesem Fenster vor (jeweils an genau 2
// Stellen dupliziert), rechtfertigen also keine app-weite Rolle, sollen
// aber ebenso wenig als unskaliertes Literal an zwei Stellen auseinander-
// laufen können.

import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { ArrowCircleRight, CaretRight, Question, XCircle } from '@phosphor-icons/react';
import { useState, type CSSProperties } from 'react';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type {
  AnzeigeGesetzKonflikte,
  AnzeigeKonfliktEintrag,
} from '@/lib/markierungen/markierungen.index';
import { oeffneInternesZiel } from '@/hooks/fenster/useInterneNavigation';
import {
  auswahlSchluessel,
  zeilenVonEintrag,
  type Auswahl,
  type KonfliktZeile,
} from '@/components/hilfsfenster/markierungskonflikte/MarkierungskonfliktFenster.helpers';
import { gesetzFehltTexte, nichtamtlicheTitelFehlenTexte, verweisKopfzeile } from './konfliktTexte';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { iconGroessen, iconGroesseSkaliert, standardOderBetont } from '@/lib/stil/textRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { bezeichnungAusgangsstelle } from '@/lib/domain/ausgangsstelle';

function konfliktContainerPadding(faktor: number): string {
  return `${pxSkaliert(2, faktor)}px ${pxSkaliert(12, faktor)}px ${pxSkaliert(2, faktor)}px ${pxSkaliert(12, faktor)}px`;
}
function konfliktKlickPadding(faktor: number): string {
  return `${pxSkaliert(6, faktor)}px ${pxSkaliert(4, faktor)}px`;
}
function konfliktDetailPadding(faktor: number): string {
  return `0 ${pxSkaliert(4, faktor)}px ${pxSkaliert(6, faktor)}px`;
}
function gesetzZeilePadding(faktor: number): string {
  return `${pxSkaliert(10, faktor)}px ${pxSkaliert(12, faktor)}px`;
}

function konfliktContainerStil(faktor: number): CSSProperties {
  return {
    padding: konfliktContainerPadding(faktor),
    borderTop: '1px solid var(--trenner-ebene)',
  };
}

function konfliktKlickStil(
  faktor: number,
  gap: CSSProperties['gap'],
  borderRadius: CSSProperties['borderRadius'],
): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap,
    padding: konfliktKlickPadding(faktor),
    margin: `0 ${-pxSkaliert(4, faktor)}px`,
    borderRadius,
    cursor: 'pointer',
  };
}

const IKON_VON_SYMBOL = { fragezeichen: Question, kreuz: XCircle, pfeil: ArrowCircleRight };

// Symbol in primärer Textfarbe – gemeinsame Darstellung für alle Konflikttypen.
// Rein darstellend (Tooltip über title, kein eigener
// Klick-Handler mehr – die zugehörige Fehlermeldung hängt jetzt an der
// Zeilen-Auswahl selbst, siehe MarkierungsZeile/GesetzZeile: istAusgewaehlt).
//
// Das leichte Gewicht und der lokale Größenfaktor nehmen die Symbole gegenüber
// dem Konflikttext zurück; der Status-Größenmaßstab bleibt UI-skaliert.
function KonfliktSymbol({ icon: Icon, titel }: { icon: PhosphorIcon; titel: string }) {
  const uiFaktor = useUiSkalierungsFaktor();
  return (
    <TextAttributElement
      element="span"
      title={titel}
      style={{ display: 'inline-flex', flexShrink: 0 }}
    >
      <Icon
        size={iconGroesseSkaliert(iconGroessen.status, 0.9 * uiFaktor)}
        color="var(--text-sekundaer)"
        weight="light"
      />
    </TextAttributElement>
  );
}

function MarkierungsZeile({
  gesetzreferenz,
  eintrag,
  ausgewaehlt,
  onAuswaehlen,
}: {
  gesetzreferenz: Gesetzesreferenz;
  eintrag: AnzeigeKonfliktEintrag;
  ausgewaehlt: Auswahl | null;
  onAuswaehlen: (a: Auswahl) => void;
}) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const radiusRollen = useRadiusRollen();
  const zeilen: KonfliktZeile[] = zeilenVonEintrag(eintrag);
  const mehrere = zeilen.length > 1;
  const Liste = mehrere ? 'ul' : 'div';
  const Zeile = mehrere ? 'li' : 'div';
  const [navigationsFehler, setNavigationsFehler] = useState(false);

  function klick(zeile: KonfliktZeile) {
    const auswahl: Auswahl = { art: 'zeile', gesetz: gesetzreferenz, eintrag, zeile };
    onAuswaehlen(auswahl);
    // "Klick auf die Markierung: öffnet sie im Gesetzes-View" (siehe
    // Absprache) – bewusst für ALLE Markierungstypen, nicht nur Verweise,
    // damit sich auch Unterstreichung/Hervorhebung/Kommentar direkt
    // ansteuern lassen. Das ZIELgesetz eines 'ziel'-Konflikts wird bewusst
    // NICHT geöffnet (dort existiert die Markierung ja nicht) – es bleibt
    // beim eigenen Gesetz der Markierung.
    setNavigationsFehler(false);
    void oeffneInternesZiel({
      gesetz: gesetzreferenz,
      ziel:
        eintrag.ausgangsstelle.typ === 'ueberschrift'
          ? {
              type: 'ueberschrift',
              gliederungskennzahl: bezeichnungAusgangsstelle(eintrag.ausgangsstelle),
            }
          : {
              type: 'norm',
              bezeichnung: bezeichnungAusgangsstelle(eintrag.ausgangsstelle),
            },
    }).catch((fehler: unknown) => {
      console.error('Interne Navigation fehlgeschlagen:', fehler);
      setNavigationsFehler(true);
    });
  }

  return (
    <div style={konfliktContainerStil(uiFaktor)}>
      {navigationsFehler ? (
        <div style={textRollen.fehlertext}>
          <TextAnzeige text="Das Ziel konnte nicht an das Hauptfenster übergeben werden." />
        </div>
      ) : null}
      {mehrere ? (
        <div style={{ ...textRollen.standardtext, paddingBlock: abstandRollen.standard }}>
          <TextAnzeige text={verweisKopfzeile(eintrag)} />
        </div>
      ) : null}
      <Liste
        role={mehrere ? 'list' : undefined}
        style={{ listStyleType: 'none', margin: 0, padding: 0 }}
      >
        {zeilen.map((zeile) => {
          const eigeneAuswahl: Auswahl = { art: 'zeile', gesetz: gesetzreferenz, eintrag, zeile };
          const istAusgewaehlt =
            !!ausgewaehlt && auswahlSchluessel(ausgewaehlt) === auswahlSchluessel(eigeneAuswahl);
          return (
            <Zeile
              key={zeile.schluessel}
              style={
                mehrere
                  ? { display: 'flex', alignItems: 'flex-start', gap: abstandRollen.standard }
                  : undefined
              }
            >
              {mehrere ? (
                <TextAnzeige
                  text="•"
                  aria-hidden="true"
                  onClick={() => klick(zeile)}
                  style={{
                    ...textRollen.standardtext,
                    flexShrink: 0,
                    paddingTop: pxSkaliert(6, uiFaktor),
                    cursor: 'pointer',
                  }}
                />
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  onClick={() => klick(zeile)}
                  style={konfliktKlickStil(uiFaktor, abstandRollen.standard, radiusRollen.klein)}
                >
                  <TextAnzeige
                    text={mehrere ? zeile.vorschauPunkt : zeile.vorschau}
                    style={{
                      ...standardOderBetont(istAusgewaehlt, textRollen),
                      flex: 1,
                      color: istAusgewaehlt ? 'var(--akzent)' : 'var(--text-primaer)',
                    }}
                  />
                  <KonfliktSymbol icon={IKON_VON_SYMBOL[zeile.symbol]} titel={zeile.erlaeuterung} />
                </div>
                {istAusgewaehlt ? (
                  <div
                    style={{
                      ...textRollen.standardtext,
                      color: 'var(--text-sekundaer)',
                      padding: konfliktDetailPadding(uiFaktor),
                      margin: `0 ${-pxSkaliert(4, uiFaktor)}px`,
                    }}
                  >
                    <TextAnzeige text={zeile.erlaeuterung} />
                  </div>
                ) : null}
              </div>
            </Zeile>
          );
        })}
      </Liste>
    </div>
  );
}

// nichtamtlicheTitelXmlFehlt (siehe markierungskonfliktPruefung.ts): bezieht sich auf das
// GANZE Gesetz, nicht auf eine einzelne Markierung – daher keine
// MarkierungsZeile (die IMMER an einen AnzeigeKonfliktEintrag gebunden ist),
// sondern eine eigenständige Zeile mit demselben visuellen Aufbau wie eine
// einzelne Konfliktzeile darin. Wird wie ein normaler Konflikt INNERHALB der
// aufgeklappten Liste dargestellt (siehe Absprache), NICHT wie gesetzFehlt als
// eigene Überschrift (siehe GesetzZeile: dort exklusiv für fehlendesGesetz).
function NichtamtlicherTitelZeile({
  gesetzreferenz,
  ausgewaehlt,
  onAuswaehlen,
}: {
  gesetzreferenz: Gesetzesreferenz;
  ausgewaehlt: Auswahl | null;
  onAuswaehlen: (a: Auswahl) => void;
}) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const radiusRollen = useRadiusRollen();
  const eigeneAuswahl: Auswahl = { art: 'nichtamtlicheTitelXmlFehlt', gesetz: gesetzreferenz };
  const istAusgewaehlt =
    !!ausgewaehlt && auswahlSchluessel(ausgewaehlt) === auswahlSchluessel(eigeneAuswahl);
  const fehlermeldung = nichtamtlicheTitelFehlenTexte.erlaeuterung;

  return (
    <div style={konfliktContainerStil(uiFaktor)}>
      <div
        onClick={() => onAuswaehlen(eigeneAuswahl)}
        style={konfliktKlickStil(uiFaktor, abstandRollen.standard, radiusRollen.klein)}
      >
        <span
          style={{
            ...standardOderBetont(istAusgewaehlt, textRollen),
            flex: 1,
            color: istAusgewaehlt ? 'var(--akzent)' : 'var(--text-primaer)',
          }}
        >
          <TextAnzeige text={nichtamtlicheTitelFehlenTexte.vorschau} />
        </span>
        <KonfliktSymbol icon={XCircle} titel={fehlermeldung} />
      </div>
      {istAusgewaehlt ? (
        <div
          style={{
            ...textRollen.standardtext,
            color: 'var(--text-sekundaer)',
            padding: konfliktDetailPadding(uiFaktor),
            margin: `0 ${-pxSkaliert(4, uiFaktor)}px`,
          }}
        >
          <TextAnzeige text={fehlermeldung} />
        </div>
      ) : null}
    </div>
  );
}

export function GesetzZeile({
  gesetz,
  aufgeklappt,
  onAufgeklapptAendern,
  ausgewaehlt,
  onAuswaehlen,
}: {
  gesetz: AnzeigeGesetzKonflikte;
  aufgeklappt: boolean;
  onAufgeklapptAendern: (gesetzreferenz: Gesetzesreferenz, aufgeklappt: boolean) => void;
  ausgewaehlt: Auswahl | null;
  onAuswaehlen: (a: Auswahl | null) => void;
}) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const abstandRollen = useAbstandRollen();
  const eintraege: AnzeigeKonfliktEintrag[] = gesetz.eintraege;
  const eigeneAuswahl: Auswahl = { art: 'datensatz', gesetz: gesetz.gesetz };
  const istAusgewaehlt =
    gesetz.fehlendesGesetz &&
    !!ausgewaehlt &&
    auswahlSchluessel(ausgewaehlt) === auswahlSchluessel(eigeneAuswahl);

  function klick() {
    if (gesetz.fehlendesGesetz) {
      onAuswaehlen(eigeneAuswahl);
    } else {
      const naechsterWert = !aufgeklappt;
      // Wird gerade zugeklappt und die aktuell ausgewählte Markierung
      // gehört zu diesem Gesetz, würde sie unsichtbar, aber weiterhin als
      // "ausgewählt" gelten (blaue Hervorhebung nicht mehr erkennbar,
      // Konfliktseitenleiste bezieht sich auf eine nicht mehr sichtbare Zeile) – daher
      // in diesem Fall deselektieren (siehe Absprache).
      if (!naechsterWert && !!ausgewaehlt && istGleichesGesetz(ausgewaehlt.gesetz, gesetz.gesetz)) {
        onAuswaehlen(null);
      }
      onAufgeklapptAendern(gesetz.gesetz, naechsterWert);
    }
  }

  return (
    <div style={{ borderBottom: '2px solid var(--trenner-ebene)' }}>
      <div
        onClick={klick}
        aria-expanded={gesetz.fehlendesGesetz ? undefined : aufgeklappt}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: abstandRollen.standard,
          padding: gesetzZeilePadding(uiFaktor),
          cursor: 'pointer',
          background: 'var(--bg-leiste)',
        }}
        onMouseEnter={(e) => {
          if (!istAusgewaehlt) e.currentTarget.style.background = 'var(--hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-leiste)';
        }}
      >
        <span
          style={{
            ...textRollen.standardtextBetont,
            flex: 1,
            color: istAusgewaehlt ? 'var(--akzent)' : 'var(--text-primaer)',
          }}
        >
          <TextAnzeige
            text={
              gesetz.fehlendesGesetz
                ? `${gesetz.gesetz.kurztitel}: ${gesetzFehltTexte.vorschau}`
                : gesetz.gesetz.kurztitel
            }
          />
        </span>
        {gesetz.fehlendesGesetz ? (
          <KonfliktSymbol
            icon={XCircle}
            titel={gesetzFehltTexte.erlaeuterung(gesetz.gesetz.kurztitel)}
          />
        ) : (
          <span
            style={{
              display: 'inline-flex',
              flexShrink: 0,
              transform: aufgeklappt ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 120ms ease',
              color: 'var(--symbol-gedaempft)',
            }}
          >
            <CaretRight size={iconGroesseSkaliert(iconGroessen.standard, uiFaktor)} weight="bold" />
          </span>
        )}
      </div>
      {gesetz.fehlendesGesetz && istAusgewaehlt ? (
        <div
          style={{
            ...textRollen.standardtext,
            color: 'var(--text-sekundaer)',
            padding: gesetzZeilePadding(uiFaktor),
          }}
        >
          <TextAnzeige text={gesetzFehltTexte.erlaeuterung(gesetz.gesetz.kurztitel)} />
        </div>
      ) : null}
      {!gesetz.fehlendesGesetz && aufgeklappt ? (
        <div>
          {gesetz.nichtamtlicheTitelXmlFehlt ? (
            <NichtamtlicherTitelZeile
              gesetzreferenz={gesetz.gesetz}
              ausgewaehlt={ausgewaehlt}
              onAuswaehlen={onAuswaehlen}
            />
          ) : null}
          {eintraege.map((eintrag) => (
            <MarkierungsZeile
              key={eintrag.schluessel}
              gesetzreferenz={gesetz.gesetz}
              eintrag={eintrag}
              ausgewaehlt={ausgewaehlt}
              onAuswaehlen={onAuswaehlen}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
