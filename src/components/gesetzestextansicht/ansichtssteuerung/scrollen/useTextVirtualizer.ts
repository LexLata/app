// useTextVirtualizer.ts
// Baut den Virtualizer der Gesetzestextansicht: Höhenkontext, Höhenidentität, Schlüssel- und
// Schätzfunktion, Höhenausgleich und Optionen der Bibliothek.
//
// Schätzwert-Speicher: Die Bibliothek ruft estimateSize bei jeder Neuberechnung der
// Positionstabelle für alle ungemessenen folgenden Elemente erneut auf (U1b); die Zeit dafür
// wuchs mit der Länge des Gesetzes (Messung Stufe 1, Phase 3). Daher wird jede Schätzung je
// Element einmal berechnet und gehalten. Der Speicher ist rein abgeleitet, nicht persistiert und
// nie Quelle von Wahrheit: Er entsteht neu, sobald sich ein Eingang der Schätzung ändert – Liste
// der sichtbaren Elemente, Höhenidentität (Schrift, Breite, Einzug, Satzanordnung, Ausrichtung,
// Silbentrennung, Sprache), eingeklappte Überschriften und Normen, untergeordnete Artikel und
// Textmessung. Nicht an den Höhenkontext gebunden, weil dieser je Render neu entsteht.
//
// Messlauf-Erfassung (nur Entwicklungsbetrieb): Schlüssel-, Schätz-, Mess- und Scrollfunktion
// werden zur Bibliothek hin umhüllt; gezählt wird jede Anfrage der Bibliothek, also vor dem
// Schätzwert-Speicher. Im Produktionsbau gehen die Funktionen unverändert an die Bibliothek.
import { useMemo, useRef, useState, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ScrollSteuerungOptionen } from './ScrollSteuerung.types';
import {
  schaetzeHoehe,
  schaetzeInitialOffset,
  erstelleItemKeyFunktion,
  erstelleHoehenKontext,
  ermittleHoehenIdentitaet,
} from './virtualizer';
import { renderbereichMitZiel, type RenderGeometrie } from './navigationGeometrie';
import { eigeneScrollFunktion } from './useScrollEreignisse';
import type { erstelleScrollHoehenAusgleich } from './scrollHoehenAusgleich';
import { erstelleMesslaufErfassung } from './messlaufErfassung';

interface TextVirtualizerEingaben {
  optionen: ScrollSteuerungOptionen;
  textSpalteBreite: number;
  messIndex: number | null;
  hoehenAusgleich: ReturnType<typeof erstelleScrollHoehenAusgleich>;
  eigeneScrollPositionRef: RefObject<number | null>;
}

export function useTextVirtualizer({
  optionen,
  textSpalteBreite,
  messIndex,
  hoehenAusgleich,
  eigeneScrollPositionRef,
}: TextVirtualizerEingaben) {
  const { containerRef, sichtbareElemente, geometrie } = optionen;
  const hoehenKontext = erstelleHoehenKontext(optionen, textSpalteBreite);
  const hoehenIdentitaet = ermittleHoehenIdentitaet(hoehenKontext, geometrie.schriftgroesse);
  const { eingeklappteUeberschriften, eingeklappteNormen } = optionen;
  const itemKey = useMemo(
    () =>
      erstelleItemKeyFunktion(
        sichtbareElemente,
        eingeklappteUeberschriften,
        eingeklappteNormen,
        hoehenIdentitaet,
      ),
    [sichtbareElemente, eingeklappteUeberschriften, eingeklappteNormen, hoehenIdentitaet],
  );
  const schaetzung = useMemo(
    () => {
      const kontext = hoehenKontext;
      const schrift = geometrie.schriftgroesse;
      const werte: (number | undefined)[] = [];
      return (index: number) => {
        const element = sichtbareElemente[index];
        if (!element) throw new RangeError(`Textindex ${index} fehlt.`);
        return (werte[index] ??= schaetzeHoehe(element, schrift, kontext));
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hoehenKontext entsteht je Render neu; Schrift und Kontextwerte sind über Höhenidentität und die übrigen Eingänge erfasst.
    [
      sichtbareElemente,
      eingeklappteUeberschriften,
      eingeklappteNormen,
      hoehenIdentitaet,
      optionen.unterArtikelIds,
      optionen.messung,
    ],
  );
  const [messlauf] = useState(erstelleMesslaufErfassung);
  const bibliothekSchluessel = useMemo(
    () => messlauf?.zaehle('getItemKey', itemKey) ?? itemKey,
    [messlauf, itemKey],
  );
  const bibliothekSchaetzung = useMemo(
    () => messlauf?.zaehle('estimateSize', schaetzung) ?? schaetzung,
    [messlauf, schaetzung],
  );
  const messen = useMemo(
    () =>
      messlauf?.umhuelleMessung(hoehenAusgleich.messeElement, (index) => {
        const element = sichtbareElemente[index];
        if (!element) throw new RangeError(`Textindex ${index} fehlt.`);
        return {
          elementId: element.data.id,
          xmlId: element.data.xmlId,
          bezeichnung:
            element.typ === 'norm'
              ? element.data.bezeichnung
              : [element.data.bezeichnung, element.data.titel].filter(Boolean).join(' '),
          art: element.typ,
          schluessel: itemKey(index),
          schaetzung: schaetzung(index),
        };
      }) ?? hoehenAusgleich.messeElement,
    [messlauf, hoehenAusgleich, sichtbareElemente, itemKey, schaetzung],
  );
  const scrollen = eigeneScrollFunktion(eigeneScrollPositionRef);
  const initialOffsetRef = useRef<number | null>(null);
  if (initialOffsetRef.current === null) {
    initialOffsetRef.current = schaetzeInitialOffset(optionen, hoehenKontext);
  }
  // Renderbereich mit Vorlauf in Pixeln aus den Lagen der Bibliothek; die Instanz entsteht erst mit
  // dem Hook, daher über eine Referenz (abgeleitet, keine Quelle von Wahrheit).
  const instanzRef = useRef<{ geometrie(): RenderGeometrie } | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- Der Hook liefert nicht memoisierbare Funktionen; der React Compiler ist nicht im Einsatz.
  const virtualizer = useVirtualizer({
    count: sichtbareElemente.length,
    getScrollElement: () => containerRef.current,
    getItemKey: bibliothekSchluessel,
    estimateSize: bibliothekSchaetzung,
    rangeExtractor: (bereich) =>
      renderbereichMitZiel(bereich, messIndex, instanzRef.current?.geometrie() ?? null),
    initialOffset: initialOffsetRef.current,
    measureElement: messen,
    scrollToFn: messlauf?.umhuelleScrollfunktion(scrollen) ?? scrollen,
  });
  instanzRef.current = {
    geometrie: () => ({
      lagen: virtualizer.measurementsCache,
      scrollOffset: virtualizer.scrollOffset ?? 0,
      sichtHoehe: virtualizer.scrollRect?.height ?? 0,
    }),
  };
  messlauf?.erfasseGesamthoehe(virtualizer.getTotalSize());
  messlauf?.verbindeVerwerfen(() => virtualizer.measure());
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = hoehenAusgleich.sollteAusgleichen;
  return {
    virtualizer,
    hoehenKontext,
    hoehenIdentitaet,
    initialOffset: initialOffsetRef.current,
    messlauf,
    textListe: {
      zeilen: virtualizer.getVirtualItems().flatMap((zeile) => {
        const element = optionen.sichtbareElemente[zeile.index];
        return element
          ? [
              {
                ...zeile,
                key: typeof zeile.key === 'bigint' ? String(zeile.key) : zeile.key,
                element,
              },
            ]
          : [];
      }),
      gesamtHoehe: virtualizer.getTotalSize(),
      maxTextBreite: optionen.geometrie.maxTextBreite,
      messeZeile: virtualizer.measureElement,
    },
  };
}
