// ziehvorschau.steuerung.ts – Ein Zug, begrenzte Bewegungen und serialisierte Lebensdauer.
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

interface ZugSteuerung {
  melden: (x: number, y: number, zeigen: boolean) => void;
  beenden: () => void;
}
interface WebviewZustand {
  kennung: number;
  kette: Promise<void>;
}
// Am Webview statt an der Modulinstanz: HMR darf Kennungen und die laufende
// Aufräumkette nicht zurücksetzen. Keine zweite persistente Zustandsquelle.
const kontext: typeof globalThis & { __lexlataZiehvorschau?: WebviewZustand } = globalThis;
const zustand = (kontext.__lexlataZiehvorschau ??= { kennung: 0, kette: Promise.resolve() });
const ohneWirkung: ZugSteuerung = { melden() {}, beenden() {} };

// Canvas löst auch oklch-Farben in sRGB-Bytes auf. Dieselben Bytes färben
// native Anfangsfläche und Seite; die vorhandene CSS-Farbe bleibt die Quelle.
function hintergrundAufloesen(farbe: string): {
  hintergrund: string;
  hintergrundNativ: [number, number, number, number] | null;
} {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const kontext = farbe ? canvas.getContext('2d', { colorSpace: 'srgb' }) : null;
  // Ohne Canvas bleibt die bisherige CSS-Darstellung als Ausfallverhalten.
  if (!kontext) return { hintergrund: farbe, hintergrundNativ: null };
  kontext.fillStyle = farbe;
  kontext.fillRect(0, 0, 1, 1);
  const [rot = 0, gruen = 0, blau = 0] = kontext.getImageData(0, 0, 1, 1).data;
  return {
    hintergrund: `rgb(${rot}, ${gruen}, ${blau})`,
    hintergrundNativ: [rot, gruen, blau, 255],
  };
}

export function beginneZiehvorschau(
  titel: string,
  element: HTMLElement | null,
  eckenradius: number,
): ZugSteuerung {
  if (!isTauri()) return ohneWirkung;
  if (zustand.kennung >= Number.MAX_SAFE_INTEGER) return ohneWirkung;
  const zugkennung = ++zustand.kennung;
  const titelElement = element?.querySelector<HTMLElement>('[data-tab-kurztitel]');
  const stil = getComputedStyle(titelElement ?? element ?? document.documentElement);
  const wurzel = getComputedStyle(document.documentElement);
  const tabStil = getComputedStyle(element ?? document.documentElement);
  const aussehen = {
    ...hintergrundAufloesen(wurzel.getPropertyValue('--bg-haupt').trim()),
    textfarbe: stil.color || wurzel.getPropertyValue('--text-primaer').trim(),
    schrift: stil.font,
    innenabstand: tabStil.padding,
    eckenradius: `${eckenradius}px`,
  };
  const fenster = getCurrentWindow();
  let beendet = false;
  let fehlerGemeldet = false;
  let frame: number | null = null;
  let letzteMeldung: { x: number; y: number; zeigen: boolean } | null = null;
  let bewegungAusstehend = false;
  let sichtbar = false;
  // Auch Bewegungen werden geordnet: verspätetes Verbergen darf keine neuere
  // Position überholen. Im Fehlerfall bleibt die Kette für Folgezüge nutzbar.
  function einreihen(aktion: () => Promise<void>) {
    zustand.kette = zustand.kette.then(aktion).catch((fehler: unknown) => {
      if (!fehlerGemeldet) {
        fehlerGemeldet = true;
        console.warn('Ziehvorschau ausgefallen; der Tab kann weiter gezogen werden.', fehler);
      }
      beenden();
    });
  }
  function beenden() {
    if (beendet) return;
    beendet = true;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    letzteMeldung = null;
    einreihen(async () => {
      try {
        await rufeBefehl('ziehvorschau_schliessen', { zugkennung });
      } finally {
        // CSS aus Phase 1 erzwingt während eines weiterhin laufenden Zugs
        // unabhängig davon die Faust im gesamten eigenen Dokument.
        await fenster.setCursorIcon('default');
      }
    });
  }
  einreihen(async () => {
    await rufeBefehl('ziehvorschau_oeffnen', { zugkennung, titel, aussehen });
    if (!beendet) await fenster.setCursorIcon('grabbing');
  });
  function melden(x: number, y: number, zeigen: boolean) {
    if (beendet) return;
    letzteMeldung = { x, y, zeigen };
    framePlanen();
  }
  function framePlanen() {
    if (beendet || frame !== null || bewegungAusstehend || !letzteMeldung) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      bewegungAusstehend = true;
      einreihen(async () => {
        // Bis zum tatsächlichen Versand nur die jüngste Position behalten;
        // langsames Öffnen oder IPC erzeugt so keinen Bewegungsrückstau.
        const meldung = letzteMeldung;
        letzteMeldung = null;
        try {
          if (beendet || !meldung) return;
          if (meldung.zeigen) {
            await rufeBefehl('ziehvorschau_bewegen', { zugkennung, x: meldung.x, y: meldung.y });
            if (beendet) return;
            sichtbar = true;
          } else if (sichtbar) {
            await rufeBefehl('ziehvorschau_verbergen', { zugkennung });
            sichtbar = false;
          }
        } finally {
          bewegungAusstehend = false;
          framePlanen();
        }
      });
    });
  }
  return { melden, beenden };
}
