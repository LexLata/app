// bannerStore.ts
//
// Modulinterner Store für nicht-blockierende Banner-Hinweise (oben rechts,
// mehrere gleichzeitig). Die Bannerart bestimmt die Anzeigedauer
// (bannerDauerMs). Bewusst kein React Context, damit auch
// Nicht-Komponenten-Code ihn aufrufen kann.
//
// Bewusst fensterlokal: kein emitTo('*') o. Ä. – jedes Tauri-Fenster hat
// seine eigene React-Instanz und damit seinen eigenen bannerStore-Zustand.

import { verlangeHauptfensterFuerBanner } from '@/lib/plattform/fensterart';
import type { Meldungsgliederung } from '@/lib/domain/app/meldungsgliederung';

export type BannerTyp = 'info' | 'warnung' | 'fehler';

/** Zuständigkeit eines Banners: bestimmt, was gemeinsam in einem Banner steht,
 *  wie lange es steht und ob es sich erweitert. Der Typ bleibt die Schwere. */
export type Bannerart =
  | 'bedienhinweis'
  | 'erfolg'
  | 'vorgangsergebnis'
  | 'vorgangsfortschritt'
  | 'dateibefunde'
  | 'nichtGeladeneGesetze'
  | 'systemfehler';

const KURZE_DAUER_MS = 5000;

/** Klickbare Aktion im Banner (z. B. "Importieren"). Bei Klick üblicherweise
 *  über bannerAktualisieren({ laedt: true }) den Ladezustand anzeigen
 *  (siehe hooks/tabs/useGesetzOeffnen.ts). */
export interface BannerAktion {
  label: string;
  onClick: () => void;
}

export interface Banner {
  id: string;
  text: string;
  typ: BannerTyp;
  /** Optionale Aktions-Schaltfläche (z. B. "Importieren"). */
  aktion?: BannerAktion;
  /** true während die Aktion läuft (z. B. Import) – deaktiviert die
   *  Schaltfläche, der Fortschritt wird stattdessen über `text` angezeigt. */
  laedt?: boolean;
  art: Bannerart;
  /** Gegliederte Darstellung mehrerer Meldungen; `text` bleibt der Klartext. */
  gliederung?: Meldungsgliederung;
  /** Zählt Neustarts der Anzeigezeit (gleicher Bedienhinweis erneut). */
  zeitNeustarts: number;
}

/** Anzeigedauer aus der Bannerart: Bedienhinweis und Erfolg 5 s, sonst und
 *  mit Aktion bleibt das Banner (undefined). */
export function bannerDauerMs(banner: Pick<Banner, 'art' | 'aktion'>): number | undefined {
  if (banner.aktion) return undefined;
  return banner.art === 'bedienhinweis' || banner.art === 'erfolg' ? KURZE_DAUER_MS : undefined;
}

let banner: Banner[] = [];
const listener = new Set<() => void>();

/** Bannerarten, deren offenes Banner sich um weitere Meldungen erweitert. */
export type ErweiterbareBannerart = Extract<Bannerart, 'dateibefunde' | 'nichtGeladeneGesetze'>;

/** Anzeigbarer Inhalt eines sich erweiternden Banners; fehlende Felder entfallen. */
export interface BannerInhalt {
  text: string;
  typ?: BannerTyp;
  aktion?: BannerAktion;
  gliederung?: Meldungsgliederung;
}

/** Je erweiterbarem Banner: verwirft seinen Inhalt, sobald das Banner geschlossen ist. */
const ablagen = new Set<() => void>();

function verwirfGeschlosseneErweiterungen() {
  for (const verwerfen of ablagen) verwerfen();
}

/** Ablage eines sich erweiternden Banners der Art, einmal je Art anzulegen.
 *  Die gelieferte Funktion erweitert das offene Banner oder beginnt ein neues:
 *  `erweitern` erhält den Inhalt des offenen Banners (undefined: keines offen)
 *  und liefert den vollständigen neuen Inhalt samt Daten; undefined lässt alles
 *  unverändert. Ergebnis ist die id des (neuen oder erweiterten) Banners, sonst
 *  undefined. Die Daten bleiben bis zum Schließen des Banners erhalten. */
export function erzeugeErweiterbaresBanner<D>(art: ErweiterbareBannerart) {
  let offen: { id: string; daten: D } | undefined;
  ablagen.add(() => {
    const id = offen?.id;
    if (id !== undefined && !banner.some((b) => b.id === id)) offen = undefined;
  });
  return function erweitereBanner(
    erweitern: (bisher: D | undefined) => { inhalt: BannerInhalt; daten: D } | undefined,
  ): string | undefined {
    const ergebnis = erweitern(offen?.daten);
    if (!ergebnis) return undefined;
    const { inhalt, daten } = ergebnis;
    if (offen) {
      offen = { id: offen.id, daten };
      bannerAktualisieren(offen.id, {
        text: inhalt.text,
        typ: inhalt.typ ?? 'info',
        aktion: inhalt.aktion ?? null,
        gliederung: inhalt.gliederung ?? null,
      });
      return offen.id;
    }
    const id = zeigeBanner({ art, ...inhalt });
    offen = { id, daten };
    return id;
  };
}

function benachrichtigen() {
  listener.forEach((fn) => fn());
}

/** Zeigt ein neues Banner an. Wird unten an den Stapel angehängt. Ein
 *  Bedienhinweis mit gleichem Text wie ein offener startet dessen Zeit neu
 *  und liefert dessen id, statt ein zweites Banner anzulegen. */
export function zeigeBanner(params: {
  art: Bannerart;
  text: string;
  typ?: BannerTyp;
  aktion?: BannerAktion;
  gliederung?: Meldungsgliederung;
}): string {
  verlangeHauptfensterFuerBanner();
  const typ = params.typ ?? 'info';
  const offen =
    params.art === 'bedienhinweis'
      ? banner.find((b) => b.art === 'bedienhinweis' && b.text === params.text && b.typ === typ)
      : undefined;
  if (offen) {
    banner = banner.map((b) => (b === offen ? { ...b, zeitNeustarts: b.zeitNeustarts + 1 } : b));
    benachrichtigen();
    return offen.id;
  }
  const id = crypto.randomUUID();
  banner = [
    ...banner,
    {
      id,
      art: params.art,
      text: params.text,
      typ,
      aktion: params.aktion,
      gliederung: params.gliederung,
      zeitNeustarts: 0,
    },
  ];
  benachrichtigen();
  return id;
}

/** Aktualisiert einzelne Felder eines bestehenden Banners (z. B. für
 *  mehrstufige Fortschrittsanzeigen wie die Indexerstellung: ein Banner wird
 *  über mehrere Phasen hinweg per id weiterverwendet statt neu angelegt).
 *  Nicht übergebene Felder bleiben unverändert; `aktion: null` entfernt eine
 *  bestehende Aktions-Schaltfläche explizit (undefined = unverändert lassen).
 *  Ohne Wirkung, falls die id nicht mehr existiert (z. B. bereits
 *  weggeklickt). */
export function bannerAktualisieren(
  id: string,
  params: {
    text?: string;
    typ?: BannerTyp;
    aktion?: BannerAktion | null;
    laedt?: boolean;
    /** `null` entfernt die Gliederung (undefined = unverändert lassen). */
    gliederung?: Meldungsgliederung | null;
  },
) {
  banner = banner.map((b) =>
    b.id === id
      ? {
          ...b,
          text: params.text ?? b.text,
          typ: params.typ ?? b.typ,
          aktion: params.aktion === null ? undefined : (params.aktion ?? b.aktion),
          laedt: params.laedt ?? b.laedt,
          gliederung: params.gliederung === null ? undefined : (params.gliederung ?? b.gliederung),
        }
      : b,
  );
  benachrichtigen();
}

/** Entfernt ein Banner anhand seiner id (z. B. per Schließen-Kreuz). */
export function bannerSchliessen(id: string) {
  banner = banner.filter((b) => b.id !== id);
  verwirfGeschlosseneErweiterungen();
  benachrichtigen();
}

/** Entfernt ALLE aktuell angezeigten Banner auf einmal (siehe BannerHost.tsx:
 *  "Alle löschen"-Schaltfläche am obersten Banner, nur bei mehr als einem
 *  Banner sichtbar). */
export function alleBannerSchliessen() {
  banner = [];
  verwirfGeschlosseneErweiterungen();
  benachrichtigen();
}

export function subscribe(fn: () => void): () => void {
  listener.add(fn);
  return () => listener.delete(fn);
}

export function getSnapshot(): Banner[] {
  return banner;
}
