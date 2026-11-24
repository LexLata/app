// pfeilNavigation.ts
// DOM-freie Pfeilregeln; Registrierung und Scrollausführung liegen außen.
// ← aktiviert den unmittelbaren Elternteil ohne Klappänderung; ⇧← klappt ihn ein.
// → öffnet die Überschrift und aktiviert ihr erstes Kind oder öffnet alle Normtexte
// des Kapitels; ⇧→ öffnet nur den Text der aktiven Norm. Ohne Elternteil kein ←-Ziel.
// ⌥↑/↓ geht ein sichtbares Element weiter, an Rändern geklemmt; ohne aktives
// Element zum ersten. Unmodifiziertes ↑/↓ scrollt im äußeren Handler.
// ⌘↑/↓ (Windows/Linux: Strg) springt über Überschriftenblöcke: maximale Folgen
// überschriftartiger Elemente, durch jede Norm (auch eingeklappte) getrennt.
// ↓ nimmt den nächsten Blockanfang, sonst das letzte Element; ↑ den letzten
// Blockanfang vor dem aktiven Element, sonst das erste. Innerhalb eines Blocks
// oder von einer folgenden Norm führt ↑ dadurch zuerst zum eigenen Blockanfang.
// Ohne aktives Element: ↓ erster Block (ersatzweise erstes Element), ↑ erstes.
// Mehrfachmodifier werden nicht behandelt; horizontales ⌘/⌥ gehört Sonderhandlern.
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import type { StrukturMomentaufnahme } from './StrukturZustand.types';
import { ermittleEbene, ermittleElternIndizes } from '@/lib/domain/gesetzHierarchie';

// "Überschrift" im Sinne von ArrowRight/ArrowLeft (siehe Dateikopf): eine
// echte Überschrift IMMER; ein Gliederungsartikel NUR, wenn er tatsächlich
// §§ unter sich hat. Das Feld ueberschriftartig wird vom Parser vorbereitet.
// Daher ist kein Nachbar-Zugriff nötig.
// Exportiert: wird auch von useKlappstufenNavigation.ts (⌘→/←) wiederverwendet,
// dort zur Unterscheidung Norm vs. Überschrift bei den vier Klapp-Stufen.
export function ueberschriftartig(elemente: DarstellungsElement[], index: number): boolean {
  // elemente[index] beweisbar sicher: alle Aufrufer übergeben nur gültige,
  // zuvor per findIndex/forEach ermittelte Indizes in dasselbe Array.
  const el = elemente[index]!;
  if (el.typ === 'ueberschrift') return true;
  return (el.data.art === 'gliederungsartikel' && el.data.ueberschriftartig) === true;
}

// Ziel-Index für ⌥↑/↓: ein Schritt
// in Sprungrichtung, an den Rändern geklemmt. aktuellerIndex=-1 (kein aktives
// Element gefunden) landet in beiden Richtungen beim ersten Element.
function einfacherSprungZiel(
  elemente: DarstellungsElement[],
  aktuellerIndex: number,
  richtung: 1 | -1,
): number {
  return richtung === 1
    ? Math.min(elemente.length - 1, aktuellerIndex + 1)
    : Math.max(0, aktuellerIndex - 1);
}

// Maximale Folgen überschriftartiger Elemente bilden einen Überschriftenblock.
function ueberschriftenblockZiel(
  elemente: DarstellungsElement[],
  aktuellerIndex: number,
  richtung: 1 | -1,
): number {
  const starts = elemente.flatMap((_, index) =>
    ueberschriftartig(elemente, index) && (index === 0 || !ueberschriftartig(elemente, index - 1))
      ? [index]
      : [],
  );
  if (aktuellerIndex < 0) return richtung === 1 ? (starts[0] ?? 0) : 0;
  if (richtung === 1) return starts.find((index) => index > aktuellerIndex) ?? elemente.length - 1;
  return starts.reverse().find((index) => index < aktuellerIndex) ?? 0;
}

// IDs aller direkten Norm-Geschwister im "Kapitel" eines Elements: alle
// direkten Kinder desselben unmittelbaren Containers (elternIndex), die
// selbst KEINE Überschrift-artigen Container sind (siehe ueberschriftartig)
// – ein Geschwister-Gliederungsartikel MIT eigenen §§ wird hier bewusst
// ausgenommen, der gehört zur "Überschrift"-Behandlung, nicht zum Bulk.
function ermittleKapitelNormIds(
  elemente: DarstellungsElement[],
  elternIndizes: (number | null)[],
  elternIndex: number | null,
): string[] {
  const ids: string[] = [];
  elemente.forEach((el, i) => {
    if (el.typ === 'norm' && elternIndizes[i] === elternIndex && !ueberschriftartig(elemente, i)) {
      ids.push(el.data.id);
    }
  });
  return ids;
}

export function berechnePfeilaktion(
  elemente: DarstellungsElement[],
  sichtbareElemente: DarstellungsElement[],
  zustand: StrukturMomentaufnahme,
  richtung: 'hoch' | 'runter' | 'links' | 'rechts',
  optionen: { shift?: boolean; alt?: boolean; meta?: boolean; einklappenGesperrt?: boolean } = {},
) {
  const elementeRef = { current: elemente };
  const sichtbareElementeRef = { current: sichtbareElemente };
  const aktivesElementIdRef = { current: zustand.aktivesElementId };
  const eingeklappteUeberschriftenRef = { current: zustand.eingeklappteUeberschriften };
  const eingeklappteNormenRef = { current: zustand.eingeklappteNormen };
  let ueberschriften = zustand.eingeklappteUeberschriften;
  let normen = zustand.eingeklappteNormen;
  let aktivesElementId = zustand.aktivesElementId;
  const setAktivesElementId = (id: string) => {
    aktivesElementId = id;
  };
  const setEingeklappteUeberschriften = (ids: Set<string>) => {
    if (!optionen.einklappenGesperrt) ueberschriften = ids;
  };
  const setEingeklappteNormen = (ids: Set<string>) => {
    if (!optionen.einklappenGesperrt) normen = ids;
  };
  const ausstehenderSprungZielIdRef: { current: string | null } = { current: null };
  const springeZuIndexRef = {
    current: (index: number) => {
      ausstehenderSprungZielIdRef.current = sichtbareElemente[index]?.data.id ?? null;
    },
  };
  function behandlePfeilRechts(shift: boolean) {
    const aktivId = aktivesElementIdRef.current;
    if (!aktivId) return;
    const volleListe = elementeRef.current;
    const volleIndex = volleListe.findIndex((el) => el.data.id === aktivId);
    if (volleIndex === -1) return;

    if (!ueberschriftartig(volleListe, volleIndex)) {
      // Norm: Normtexte anzeigen – keine Navigation.
      const neueNormen = new Set(eingeklappteNormenRef.current);
      if (shift) {
        neueNormen.delete(aktivId);
      } else {
        const elternIndizes = ermittleElternIndizes(volleListe);
        // elternIndizes[volleIndex] beweisbar sicher: volleIndex wurde
        // oben bereits gegen -1 geprüft (< volleListe.length).
        const elternIndex = elternIndizes[volleIndex]!;
        for (const id of ermittleKapitelNormIds(volleListe, elternIndizes, elternIndex)) {
          neueNormen.delete(id);
        }
      }
      setEingeklappteNormen(neueNormen);
      return;
    }

    // Überschrift(-artig): (1) NUR sie selbst aufklappen, (2) zum ersten
    // neu erschienenen Element springen (wie ArrowDown) – bei → und ⇧→
    // identisch.
    // aktuellesElement beweisbar sicher: volleIndex oben bereits gegen -1 geprüft.
    const aktuellesElement = volleListe[volleIndex]!;
    if (aktuellesElement.typ === 'ueberschrift') {
      const neueUeberschriften = new Set(eingeklappteUeberschriftenRef.current);
      neueUeberschriften.delete(aktivId);
      setEingeklappteUeberschriften(neueUeberschriften);
    } else {
      const neueNormen = new Set(eingeklappteNormenRef.current);
      neueNormen.delete(aktivId);
      setEingeklappteNormen(neueNormen);
    }

    // Das unmittelbar nächste Element in der vollen Liste ist – wenn
    // ueberschriftartig oben true ergeben hat (für einen Gliederungs-
    // artikel ist das per Definition nur dann der Fall) bzw. wenn die
    // Überschrift überhaupt Inhalt hat – bereits deren erstes Kind, ggf.
    // noch verdeckt (genau das klappen wir oben gerade auf).
    const naechsterVolleIndex = volleIndex + 1;
    if (naechsterVolleIndex >= volleListe.length) return;
    const aktuelleEbene = ermittleEbene(aktuellesElement);
    // kindElement beweisbar sicher durch den Bounds-Check direkt darüber.
    const kindElement = volleListe[naechsterVolleIndex]!;
    if (ermittleEbene(kindElement) <= aktuelleEbene) return; // kein Inhalt (leere Überschrift)

    const zielId = kindElement.data.id;
    // Ohne Aufklappen bleibt nur eine bereits sichtbare Navigationswirkung erlaubt.
    if (optionen.einklappenGesperrt && !sichtbareElemente.some((el) => el.data.id === zielId))
      return;
    setAktivesElementId(zielId);
    ausstehenderSprungZielIdRef.current = zielId;
  }

  // Fügt den Elternteil beim ⇧←-Sprung dem passenden Klappzustand hinzu.
  function klappeElementEin(element: DarstellungsElement) {
    if (element.typ === 'ueberschrift') {
      const neueUeberschriften = new Set(eingeklappteUeberschriftenRef.current);
      neueUeberschriften.add(element.data.id);
      setEingeklappteUeberschriften(neueUeberschriften);
    } else {
      const neueNormen = new Set(eingeklappteNormenRef.current);
      neueNormen.add(element.data.id);
      setEingeklappteNormen(neueNormen);
    }
  }

  // ArrowLeft: zum Elternelement springen, nichts einklappen.
  function springeZuElternOhneEinklappen(
    elternIndex: number | null,
    volleListe: DarstellungsElement[],
  ) {
    if (elternIndex === null) return;
    // volleListe[elternIndex] beweisbar sicher: ermittleElternIndizes
    // liefert nur gültige Indizes innerhalb desselben Arrays oder null.
    const elternId = volleListe[elternIndex]!.data.id;
    const sichtbarZielIndex = sichtbareElementeRef.current.findIndex(
      (el) => el.data.id === elternId,
    );
    if (sichtbarZielIndex === -1) return; // Vorfahre kann eigentlich nie verdeckt sein
    setAktivesElementId(elternId);
    springeZuIndexRef.current(sichtbarZielIndex);
  }

  // ⇧+ArrowLeft: zum Elternelement springen und dieses immer einklappen.
  function springeZuElternUndKlappeEin(
    elternIndex: number | null,
    volleListe: DarstellungsElement[],
  ) {
    if (elternIndex === null) return;
    // volleListe[elternIndex] beweisbar sicher (siehe Kommentar in
    // springeZuElternOhneEinklappen).
    const elternElement = volleListe[elternIndex]!;
    const sichtbarZielIndex = sichtbareElementeRef.current.findIndex(
      (el) => el.data.id === elternElement.data.id,
    );
    if (sichtbarZielIndex === -1) return;
    setAktivesElementId(elternElement.data.id);
    springeZuIndexRef.current(sichtbarZielIndex);
    klappeElementEin(elternElement);
  }

  // ArrowLeft (siehe Dateikopf). shift=true → ⇧+ArrowLeft.
  function behandlePfeilLinks(shift: boolean) {
    const aktivId = aktivesElementIdRef.current;
    if (!aktivId) return;
    const volleListe = elementeRef.current;
    const volleIndex = volleListe.findIndex((el) => el.data.id === aktivId);
    if (volleIndex === -1) return;
    const elternIndizes = ermittleElternIndizes(volleListe);
    // elternIndizes[volleIndex] beweisbar sicher: volleIndex oben bereits
    // gegen -1 geprüft.
    const elternIndex = elternIndizes[volleIndex]!;

    if (shift) springeZuElternUndKlappeEin(elternIndex, volleListe);
    else springeZuElternOhneEinklappen(elternIndex, volleListe);
  }

  if (
    sichtbareElemente.length > 0 &&
    [optionen.shift, optionen.alt, optionen.meta].filter(Boolean).length <= 1
  ) {
    if (richtung === 'rechts') behandlePfeilRechts(!!optionen.shift);
    else if (richtung === 'links') behandlePfeilLinks(!!optionen.shift);
    else if (optionen.alt || optionen.meta) {
      const index = sichtbareElemente.findIndex((el) => el.data.id === zustand.aktivesElementId);
      const delta = richtung === 'runter' ? 1 : -1;
      const ziel = optionen.meta
        ? ueberschriftenblockZiel(sichtbareElemente, index, delta)
        : einfacherSprungZiel(sichtbareElemente, index, delta);
      if (ziel !== index) {
        setAktivesElementId(sichtbareElemente[ziel]!.data.id);
        springeZuIndexRef.current(ziel);
      }
    }
  }
  return {
    momentaufnahme: {
      eingeklappteUeberschriften: ueberschriften,
      eingeklappteNormen: normen,
      aktivesElementId,
    },
    zielId: ausstehenderSprungZielIdRef.current,
  };
}
