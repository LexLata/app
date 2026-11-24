// useMesslauf.ts
// Messziel und Messlauf-Sperre der Gesetzestextansicht, nur im Entwicklungsbetrieb. Während eines
// skriptgesteuerten Laufs sind Nachführung des aktiven Elements, vorläufiges aktives Element,
// Tab-Bezeichnung, Verlauf und gespeicherte Positionen gesperrt; danach wird die Ausgangsposition
// wiederhergestellt. Das aktive Element bleibt unverändert. Die Aufzeichnung (Nutzer scrollt
// selbst) läuft ohne Sperre. Während eines Laufs meldet jeder Commit der Gesetzestextansicht
// sein Ende (Arbeitszeit je Bild) und der React-Profiler um die Ansicht ihre Renderzeit
// (Bildzeit-Aufteilung); außerhalb eines Laufs wird nichts gesammelt.
//
// Messlauf: Messung von Stocken und Textsprüngen in Zahlen; Stufe 2 im Entwicklungsbetrieb der
// App (Plan „Scrollen in langen Gesetzen“, Grundlagen). Die Sperre ist ein vorübergehender
// Bedienzustand, kein Nutzerdatum; im Produktionsbau bleibt sie false.
import {
  useLayoutEffect,
  useRef,
  useState,
  type ProfilerOnRenderCallback,
  type RefObject,
} from 'react';
import type { Renderzeit } from '@/lib/utils/messlaufKennzahlen';
import type { ScrollMessziel } from '@/lib/utils/scrollMesslaufAnmeldung';
import type { MesslaufRekorder } from '@/components/gesetzestextansicht/ansichtssteuerung/scrollen/scrollen.index';
import { fuehreMesslaufDurch, type MesslaufUmgebung } from './messlaufDurchfuehrung';
import { fuehreAufzeichnungDurch } from './messlaufAufzeichnung';
import { bild } from './messlaufBildreihen';

interface MesslaufEingaben {
  containerRef: RefObject<HTMLDivElement | null>;
  rekorder: MesslaufRekorder | undefined;
  zeilenhoehe: number;
  elementzahl: number;
  gesetz: MesslaufUmgebung['gesetz'];
  einstellungen: MesslaufUmgebung['einstellungen'];
  /** Erfasst die aktuelle Position; das Ergebnis stellt sie wieder her. */
  merkePosition: () => () => Promise<void>;
}

export function useMesslauf(eingaben: MesslaufEingaben) {
  const [gesperrt, setGesperrt] = useState(false);
  const aktuell = useRef(eingaben);
  useLayoutEffect(() => {
    aktuell.current = eingaben;
  });
  const [messlauf] = useState(() =>
    import.meta.env.DEV ? erstelleMessziel(aktuell, setGesperrt) : undefined,
  );
  // Ohne Abhängigkeiten: läuft nach jedem Commit der Ansicht, nach den Effekten der Kinder.
  useLayoutEffect(() => {
    messlauf?.meldeCommit();
  });
  return { gesperrt, messziel: messlauf?.messziel, meldeRender: messlauf?.meldeRender };
}

function erstelleMessziel(
  aktuell: RefObject<MesslaufEingaben>,
  setGesperrt: (gesperrt: boolean) => void,
): { messziel: ScrollMessziel; meldeCommit(): void; meldeRender: ProfilerOnRenderCallback } {
  // Nur während eines Laufs gefüllt; reine Diagnose.
  let commits: number[] | null = null;
  let renders: Renderzeit[] | null = null;
  function umgebung(): Omit<MesslaufUmgebung, 'sperren'> {
    const { containerRef, rekorder, zeilenhoehe, elementzahl, gesetz, einstellungen } =
      aktuell.current;
    const container = containerRef.current;
    if (!container || !rekorder) throw new Error('Gesetzestextansicht ist nicht bereit');
    if (commits) throw new Error('Ein Messlauf läuft bereits');
    const gesammelt: number[] = [];
    const gerendert: Renderzeit[] = [];
    commits = gesammelt;
    renders = gerendert;
    return {
      container,
      rekorder,
      zeilenhoehe,
      elementzahl,
      gesetz,
      einstellungen,
      commitZeitpunkte: () => gesammelt,
      renderzeiten: () => gerendert,
    };
  }
  const messziel: ScrollMessziel = {
    sichtbareFlaeche() {
      const container = aktuell.current.containerRef.current;
      if (!container?.isConnected) return 0;
      const { width, height } = container.getBoundingClientRect();
      return width * height;
    },
    async fuehreDurch(optionen) {
      const basis = umgebung();
      try {
        return await fuehreMesslaufDurch(
          {
            ...basis,
            async sperren() {
              setGesperrt(true);
              // Erst nach Darstellung und Layout-Effekten greift die Sperre.
              await bild();
              await bild();
              const wiederherstellen = aktuell.current.merkePosition();
              return async () => {
                await wiederherstellen();
                await bild();
                setGesperrt(false);
                await bild();
              };
            },
          },
          optionen,
        );
      } finally {
        commits = null;
        renders = null;
      }
    },
    async zeichneAuf(sekunden, optionen) {
      const basis = umgebung();
      try {
        return await fuehreAufzeichnungDurch(basis, sekunden, optionen);
      } finally {
        commits = null;
        renders = null;
      }
    },
  };
  return {
    messziel,
    meldeCommit: () => commits?.push(performance.now()),
    meldeRender: (_id, _phase, dauerMs, _basis, _beginn, commitZeit) =>
      renders?.push({ commitZeit, dauerMs }),
  };
}
