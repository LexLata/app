// messlaufUmgebungsprotokoll.ts
// Umgebungsprotokoll und Verankerungsprobe des Messlaufs Stufe 2 (nur Entwicklungsbetrieb).
//
// - Umgebungsprotokoll: System und WebView (User-Agent), Pixeldichte, Fenstergröße,
//   Bildwiederholrate (aus den gemessenen Bildabständen), Darstellungseinstellungen, Gesetz und
//   Elementzahl sowie die CSS-Unterstützung für overflow-anchor und content-visibility.
// - Verankerungsprobe (overflow-anchor): In einem kurzzeitigen, unsichtbaren Probe-Container wird
//   oberhalb eines Ankerelements Höhe hinzugefügt, während scrollTop > 0. Zieht der Browser die
//   Scrollposition um die hinzugefügte Höhe nach, verankert er selbst. Ohne CSS-Unterstützung
//   oder ohne Layout (Testumgebung) lautet das Ergebnis „unbekannt“. Die Gesetzestextansicht
//   selbst bleibt bei overflowAnchor: 'none'.
import { bild } from './messlaufBildreihen';

type Probeergebnis = 'zieht nach' | 'zieht nicht nach' | 'unbekannt';

const PROBE_ZUWACHS_PX = 50;

export interface UmgebungsAngaben {
  readonly bildperiodeMs: number;
  readonly gesetz: string;
  readonly elementzahl: number;
  readonly einstellungen: Readonly<Record<string, unknown>>;
}

export async function erstelleUmgebungsprotokoll(angaben: UmgebungsAngaben) {
  return {
    userAgent: navigator.userAgent,
    plattform: navigator.platform,
    pixeldichte: window.devicePixelRatio,
    fenstergroesse: { breite: window.innerWidth, hoehe: window.innerHeight },
    bildperiodeMs: angaben.bildperiodeMs,
    bildwiederholrateHz: angaben.bildperiodeMs > 0 ? 1000 / angaben.bildperiodeMs : 0,
    gesetz: angaben.gesetz,
    elementzahl: angaben.elementzahl,
    einstellungen: angaben.einstellungen,
    cssUnterstuetzung: {
      overflowAnchor: unterstuetzt('overflow-anchor', 'auto'),
      contentVisibility: unterstuetzt('content-visibility', 'auto'),
    },
    verankerungsprobe: {
      auto: await pruefeVerankerung('auto'),
      none: await pruefeVerankerung('none'),
    },
  };
}

function unterstuetzt(eigenschaft: string, wert: string): boolean | 'unbekannt' {
  return typeof CSS === 'undefined' || typeof CSS.supports !== 'function'
    ? 'unbekannt'
    : CSS.supports(eigenschaft, wert);
}

/** Probe mit overflow-anchor `modus` am Probe-Container; entfernt den Container immer wieder. */
export async function pruefeVerankerung(modus: 'auto' | 'none'): Promise<Probeergebnis> {
  if (unterstuetzt('overflow-anchor', modus) !== true) return 'unbekannt';
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '200px',
    height: '200px',
    overflow: 'auto',
    visibility: 'hidden',
    pointerEvents: 'none',
    overflowAnchor: modus,
  });
  const oben = document.createElement('div');
  oben.style.height = '100px';
  const anker = document.createElement('div');
  anker.style.height = '2000px';
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: pruefeVerankerung hängt nur zwei leere Blöcke ohne Text in den unsichtbaren Probe-Container; messlaufUmgebungsprotokoll.test.ts prüft das Entfernen.
  probe.append(oben, anker);
  try {
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: pruefeVerankerung hängt den textlosen, unsichtbaren Probe-Container kurzzeitig an; messlaufUmgebungsprotokoll.test.ts prüft das Entfernen.
    document.body.append(probe);
    probe.scrollTop = 150;
    const vorher = probe.scrollTop;
    if (probe.scrollHeight === 0 || vorher === 0) return 'unbekannt';
    await bild();
    oben.style.height = `${100 + PROBE_ZUWACHS_PX}px`;
    await bild();
    const nachgezogen = probe.scrollTop - vorher;
    return Math.abs(nachgezogen - PROBE_ZUWACHS_PX) < 1 ? 'zieht nach' : 'zieht nicht nach';
  } finally {
    probe.remove();
  }
}
