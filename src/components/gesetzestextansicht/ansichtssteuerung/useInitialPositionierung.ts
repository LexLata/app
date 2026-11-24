// useInitialPositionierung.ts
// Koordiniert die einmalige Leistenfreigabe, Initialnorm und gespeicherte Position sowie
// die Sprungregel bei Aktivierung einer zuvor verdeckten Ansicht (nah animiert, weit direkt).
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { xmlIdZuSprungZiel } from '@/lib/domain/norm/norm.index';
import type { AnsichtssteuerungOptionen } from './Ansichtssteuerung.types';
import type { StrukturZustand } from './struktur/struktur.index';
import type { ScrollAuftrag, ScrollSteuerung } from './scrollen/scrollen.index';

export function useInitialLayoutFreigabe(leistenBereit = true) {
  const [bereit, setBereit] = useState(leistenBereit);
  useEffect(() => {
    if (bereit || !leistenBereit) return;
    // Nächster Commit nach synchroner Spaltenmessung; keine zusätzliche Wartefrist.
    setBereit(true);
  }, [bereit, leistenBereit]);
  return bereit;
}

interface InitialPositionierungOptionen {
  optionen: AnsichtssteuerungOptionen;
  initial: AnsichtssteuerungOptionen;
  layoutBereit: boolean;
  struktur: StrukturZustand;
  scrollen: ScrollSteuerung;
  hatKontext: (index: number) => boolean;
  annehmen: (auftrag: ScrollAuftrag, nachAbschluss?: () => void) => void;
}

export function useInitialPositionierung({
  optionen,
  initial,
  layoutBereit,
  struktur,
  scrollen,
  hatKontext,
  annehmen,
}: InitialPositionierungOptionen) {
  const vorgegebenRef = useRef<string | null>(null);
  const letztesZiel = useRef<string | null>(null);
  const restoreUebernommen = useRef(false);
  const gesetzSchluessel = gesetzesreferenzSchluessel(optionen.gesetz);
  const kennung = optionen.initialNorm ? `${gesetzSchluessel}:${optionen.initialNorm}` : null;
  const meldeAbschluss = useEffectEvent((xmlId: string) => optionen.onInitialNormScrolled?.(xmlId));
  // Weiter Sprung bei Aktivierung: verhält sich wie in einer neu gebauten Ansicht.
  const weitBeiAktivierung = useRef(false);
  const pruefeAktivierung = useEffectEvent(() => {
    const xmlId = optionen.initialNorm;
    if (!xmlId || !layoutBereit || !scrollen.bereit || letztesZiel.current === kennung) return;
    const ziel = xmlIdZuSprungZiel(optionen.gesetz.elemente, xmlId);
    const elementId = ziel && optionen.gesetz.elemente[ziel.index]?.data.id;
    if (elementId) weitBeiAktivierung.current = scrollen.verdeckeBeiWeitemSprung(elementId);
  });
  // Läuft beim Aufbau (Tor dann ohnehin geschlossen) und bei jeder Aktivierung aus
  // Activity, vor dem ersten Bild; durchgehend aktive Ansichten erreicht es nicht erneut.
  useLayoutEffect(() => pruefeAktivierung(), []);
  const uebernehmeZiel = useEffectEvent(() => {
    if (!layoutBereit) return;
    const xmlId = optionen.initialNorm;
    if (!xmlId) {
      letztesZiel.current = null;
      return;
    }
    if (letztesZiel.current === kennung) return;
    vorgegebenRef.current = xmlId;
    const ziel = struktur.bereiteZielVor(xmlId, true);
    if (ziel.status === 'nicht-gefunden') return;
    letztesZiel.current = kennung;
    const index = struktur.sichtbareElemente.findIndex((el) => el.data.id === ziel.elementId);
    const direkt = !scrollen.bereit || weitBeiAktivierung.current;
    weitBeiAktivierung.current = false;
    // Die geschätzte Anfangsposition braucht bei Zielkontext dessen reale Messung.
    annehmen(
      {
        art: 'sichtbar-machen',
        elementId: ziel.elementId,
        ausrichtung: direkt && hatKontext(index) ? 'oben' : undefined,
        animieren: !direkt,
      },
      () => meldeAbschluss(xmlId),
    );
  });
  useEffect(() => uebernehmeZiel(), [optionen.initialNorm, gesetzSchluessel, layoutBereit]);
  const wiederherstellen = useEffectEvent(() => {
    if (!layoutBereit || restoreUebernommen.current) return;
    restoreUebernommen.current = true;
    if (initial.initialNorm || initial.initialScrollIndex == null) return;
    const ziel = struktur.sichtbareElemente[initial.initialScrollIndex];
    if (ziel)
      annehmen({
        art: 'wiederherstellen',
        elementId: ziel.data.id,
        offsetInItem: initial.initialScrollOffsetInItem ?? 0,
      });
    else scrollen.beendeAuftragOhneZiel();
  });
  useEffect(() => wiederherstellen(), [layoutBereit]);
  return {
    vorgegebenRef,
    verwerfen() {
      restoreUebernommen.current = true;
      letztesZiel.current = kennung;
    },
  };
}
