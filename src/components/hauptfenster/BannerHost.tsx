// BannerHost.tsx
//
// Rendert den Stapel aktueller Banner oben rechts über dem Fenster.
// Unabhängig von AktivesOverlay/OverlayHost.tsx: Banner sind additiv
// und nicht-exklusiv, können also parallel zu einem offenen Overlay
// erscheinen (z. B. Fehler-Banner während die Einstellungen offen sind).
//
// Die Anzeigedauer folgt aus der Bannerart (bannerDauerMs): 5 s oder bleibt;
// beim Überfahren pausiert die Zeit. Schließen-Kreuz ist nur bei Hover sichtbar (siehe :hover-Regel unten).

import { verlangeHauptfensterFuerBanner } from '@/lib/plattform/fensterart';
import type { ReactElement } from 'react';
import { X } from '@phosphor-icons/react';
import { TextAnzeige, TextAttributElement } from '@/components/textanzeige/textanzeige.index';
import { useSyncExternalStore, useState, useEffect, useRef } from 'react';
import {
  subscribe,
  getSnapshot,
  bannerSchliessen,
  bannerDauerMs,
  alleBannerSchliessen,
  type Banner,
  type BannerTyp,
} from '@/lib/banner/banner.index';
import {
  subscribe as subscribeRechteLeisteBreite,
  getSnapshot as getRechteLeisteBreite,
} from '@/hooks/seitenleisten/rechteSeitenleisteBreiteStore';
import { useTableisteHoehe } from '@/components/tableiste/Tableiste.hoehe';
import { useTextRollen } from '@/hooks/stil/useTextRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { useAbstandRollen } from '@/hooks/stil/useAbstandRollen';
import { useRadiusRollen } from '@/hooks/stil/useRadiusRollen';
import { useIconGroessen } from '@/hooks/stil/useTextRollen';
import { MeldungsgliederungAnzeige } from '@/components/MeldungsgliederungAnzeige';

// 'fehler' wird optisch vorerst wie 'warnung' behandelt – es existiert
// aktuell keine eigene --akzent-fehler-CSS-Variable im Projekt.
function akzentFuer(typ: BannerTyp): string {
  return typ === 'info' ? 'var(--akzent)' : 'var(--akzent-warnung)';
}

// Auto-Dismiss mit Hover-Pause. Die Restzeit wird per Ref über Hover-Wechsel
// hinweg gemerkt, damit Hovern die Zeit pausiert statt sie neu zu starten.
// Ändert sich die Dauer (z. B. Aktion hinzugefügt) oder startet die Zeit neu
// (gleicher Bedienhinweis erneut), beginnt sie mit voller Dauer.
function useAutoDismiss(
  id: string,
  dauerMs: number | undefined,
  zeitNeustarts: number,
  hover: boolean,
) {
  const restMsRef = useRef(dauerMs);
  const startZeitRef = useRef(0);

  useEffect(() => {
    // Neustart: volle Dauer ab jetzt, auch wenn das Banner gerade überfahren wird.
    restMsRef.current = dauerMs;
    startZeitRef.current = Date.now();
  }, [dauerMs, zeitNeustarts]);

  useEffect(() => {
    if (restMsRef.current === undefined) return;
    if (hover) {
      const verbleibend = restMsRef.current - (Date.now() - startZeitRef.current);
      restMsRef.current = Math.max(0, verbleibend);
      return;
    }
    startZeitRef.current = Date.now();
    const timeout = setTimeout(() => bannerSchliessen(id), restMsRef.current);
    return () => clearTimeout(timeout);
  }, [hover, id, dauerMs, zeitNeustarts]);
}

function BannerEintrag({
  banner,
  onHoverAendern,
  zeigeAlleLoeschenButton,
}: {
  banner: Banner;
  /** Meldet lokale Hover-Änderungen an BannerHost, damit dort erkannt werden
   *  kann, ob IRGENDEIN Banner im Stapel gehovert wird (für die Sichtbarkeit
   *  der "Alle löschen"-Schaltfläche – siehe BannerHost). */
  onHoverAendern: (id: string, hover: boolean) => void;
  /** Nur am obersten Banner true, und nur wenn mehr als ein Banner sichtbar
   *  ist UND der Stapel (irgendein Banner) gerade gehovert wird. */
  zeigeAlleLoeschenButton: boolean;
}) {
  const textRollen = useTextRollen();
  const uiFaktor = useUiSkalierungsFaktor();
  const radiusRollen = useRadiusRollen();
  const iconGroessen = useIconGroessen();
  const [hover, setHover] = useState(false);
  useAutoDismiss(banner.id, bannerDauerMs(banner), banner.zeitNeustarts, hover);

  function hoverAendern(neu: boolean) {
    setHover(neu);
    onHoverAendern(banner.id, neu);
  }

  return (
    <div
      onMouseEnter={() => hoverAendern(true)}
      onMouseLeave={() => hoverAendern(false)}
      style={{
        ...textRollen.standardtext,
        position: 'relative',
        minWidth: pxSkaliert(260, uiFaktor),
        maxWidth: pxSkaliert(380, uiFaktor),
        background: 'var(--bg-panel)',
        border: '1px solid var(--rahmen)',
        borderLeft: `3px solid ${akzentFuer(banner.typ)}`,
        borderRadius: pxSkaliert(10, uiFaktor),
        boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        padding: `${pxSkaliert(12, uiFaktor)}px ${pxSkaliert(14, uiFaktor)}px`,
        lineHeight: 1.4,
      }}
    >
      {/* Lange Banner scrollen selbst; die Knöpfe am Rand liegen außerhalb und bleiben sichtbar. */}
      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: pxSkaliert(8, uiFaktor) }}>
          {banner.laedt && (
            <span
              className="banner-ladeindikator"
              aria-hidden="true"
              style={{
                width: iconGroessen.standard,
                height: iconGroessen.standard,
                flexShrink: 0,
                border: '2px solid',
                borderColor: 'var(--akzent)',
                borderRightColor: 'transparent',
                borderRadius: '50%',
              }}
            />
          )}
          {banner.gliederung ? (
            <MeldungsgliederungAnzeige gliederung={banner.gliederung} />
          ) : (
            <TextAnzeige text={banner.text} />
          )}
        </div>

        {banner.aktion ? (
          <div style={{ marginTop: pxSkaliert(8, uiFaktor) }}>
            <button
              onClick={banner.aktion.onClick}
              disabled={banner.laedt}
              style={{
                padding: `${pxSkaliert(5, uiFaktor)}px ${pxSkaliert(12, uiFaktor)}px`,
                fontSize: pxSkaliert(13, uiFaktor),
                borderRadius: radiusRollen.standard,
                border: '1px solid var(--rahmen)',
                background: banner.laedt ? 'var(--hover)' : 'var(--bg-eingabe)',
                color: banner.laedt ? 'var(--text-sekundaer)' : 'var(--text-primaer)',
                cursor: banner.laedt ? 'not-allowed' : 'pointer',
              }}
            >
              <TextAnzeige text={banner.aktion.label} />
            </button>
          </div>
        ) : null}
      </div>

      {zeigeAlleLoeschenButton && (
        <button
          onClick={alleBannerSchliessen}
          style={{
            ...textRollen.mikrotext,
            position: 'absolute',
            top: -8,
            right: -8,
            padding: `${pxSkaliert(3, uiFaktor)}px ${pxSkaliert(9, uiFaktor)}px`,
            borderRadius: pxSkaliert(10, uiFaktor),
            border: '1px solid var(--rahmen)',
            background: 'var(--bg-panel)',
            display: 'flex',
            alignItems: 'center',
            lineHeight: 1,
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            whiteSpace: 'nowrap',
          }}
        >
          <TextAnzeige text="Alle löschen" />
        </button>
      )}

      {hover ? (
        <TextAttributElement
          element="button"
          onClick={() => bannerSchliessen(banner.id)}
          aria-label="Banner schließen"
          style={{
            color: 'var(--text-primaer)',
            position: 'absolute',
            top: -8,
            left: -8,
            width: pxSkaliert(20, uiFaktor),
            height: pxSkaliert(20, uiFaktor),
            borderRadius: '50%',
            border: '1px solid var(--rahmen)',
            background: 'var(--bg-panel)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <X size={iconGroessen.klein} weight="regular" />
        </TextAttributElement>
      ) : null}
    </div>
  );
}

/** Überstand der Schließen- und „Alle löschen“-Knöpfe über den Bannerrand. */
const RANDKNOPF_UEBERSTAND = 8;

export function BannerHost() {
  verlangeHauptfensterFuerBanner();
  const banner = useSyncExternalStore(subscribe, getSnapshot);
  const abstandRollen = useAbstandRollen();
  // Welche Banner im Stapel gerade gehovert werden – als Set, weil beim
  // Wechsel zwischen zwei benachbarten Bannern kurzzeitig Enter/Leave in
  // beliebiger Reihenfolge feuern kann; erst wenn das Set leer ist, wird
  // "kein Banner mehr gehovert" (irgendeinGehovert=false).
  const [gehoverteIds, setGehoverteIds] = useState<Set<string>>(new Set());
  const { gesamt: tableisteHoehe } = useTableisteHoehe();
  // Rechte Seitenleiste darf nie verdeckt werden – siehe
  // rechteSeitenleisteBreiteStore.ts. War hier nie angeschlossen (Bugfix), der
  // rechte Rand blieb bislang fest auf 16px stehen, unabhängig davon, ob die
  // Leiste sichtbar war.
  const rechteLeisteBreite = useSyncExternalStore(
    subscribeRechteLeisteBreite,
    getRechteLeisteBreite,
  );

  function onHoverAendern(id: string, hover: boolean) {
    setGehoverteIds((vorher) => {
      const neu = new Set(vorher);
      if (hover) neu.add(id);
      else neu.delete(id);
      return neu;
    });
  }

  if (banner.length === 0) return null;

  const irgendeinGehovert = gehoverteIds.size > 0;
  const bannerElemente: ReactElement[] = banner.map((b, i): ReactElement => (
    <div key={b.id} style={{ pointerEvents: 'auto' }}>
      <BannerEintrag
        banner={b}
        onHoverAendern={onHoverAendern}
        zeigeAlleLoeschenButton={i === 0 && banner.length > 1 && irgendeinGehovert}
      />
    </div>
  ));

  return (
    <div
      style={{
        position: 'fixed',
        // tableisteHoehe statt eines geschätzten Pixelwerts: die Banner
        // sollen unterhalb der Tableiste erscheinen, nicht darüber
        // (Bugfix – vorher überlappte der oberste Banner die Tableiste,
        // weil top hier unabhängig von deren tatsächlicher Höhe war).
        // Jetzt faktor-bewusst über useTableisteHoehe() statt einer festen
        // Konstante, da die Tableiste seit der Padding-Vereinheitlichung
        // mit der UI-Größe mitwächst.
        top: tableisteHoehe + 16,
        right: 16 + rechteLeisteBreite,
        // Innenabstand und gleich großer negativer Außenabstand halten die über
        // den Rand ragenden Knöpfe im Scrollbereich sichtbar, ohne die Banner
        // zu verschieben.
        padding: RANDKNOPF_UEBERSTAND,
        margin: -RANDKNOPF_UEBERSTAND,
        // Der Stapel endet 16px über der Fensterunterkante und scrollt darüber
        // hinaus (Rahmen beginnt 8px über top und endet 8px unter den Bannern).
        maxHeight: `calc(100vh - ${tableisteHoehe + 16}px)`,
        overflowY: 'auto',
        boxSizing: 'border-box',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: abstandRollen.standard,
        // Klicks zwischen den Bannern gehen durch; das Mausrad über einem
        // Banner scrollt trotzdem den Stapel (Scrollen folgt dem Ziel-Element).
        pointerEvents: 'none',
      }}
    >
      {bannerElemente}
    </div>
  );
}
