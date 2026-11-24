// Öffentliche Links delegieren an den Einzelzugriff des jeweiligen Fensters.
// Der Listenadapter bleibt für noch nicht umgestellte Verbraucher verfügbar.
import { hoereImEigenenFenster } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import type { ElementOeffnenParams, Navigationsziel, OeffnenModus } from '@/lib/domain/appTypes';
import { verweisZuXmlId } from '@/lib/domain/norm/norm.index';
import {
  parseTiefenLink,
  TIEFENLINK_ZIEL_HINWEIS,
  type OeffentlichesLinkZiel,
  type OeffnenLinkZiel,
} from '@/lib/domain/app/tiefenLink';

interface TiefenLinkOptionen {
  oeffnenLinkEmpfangen?: (ziel: OeffnenLinkZiel, beimAppStart: boolean) => Promise<void>;
  gesetzesreferenzOeffnen?: (ziel: Navigationsziel, modus?: OeffnenModus) => void;
  gesetze?: GesetzDarstellung[];
  elementOeffnen: (params: ElementOeffnenParams) => void;
}

function ungueltigenLinkAnzeigen(): void {
  (async () => {
    const { zeigeBanner } = await import('@/lib/banner/banner.index');
    zeigeBanner({
      art: 'bedienhinweis',
      text: 'Der Link konnte nicht geöffnet werden. Das gültige Format ist: lexlata://[normgeber]/[gesetz]/[norm], z.B. lexlata://de-bund/bgb/433, oder lexlata://oeffnen/433%20BGB.',
      typ: 'fehler',
    });
  })().catch(console.error);
}

function fehlendesZielAnzeigen(): void {
  (async () => {
    const { zeigeBanner } = await import('@/lib/banner/banner.index');
    zeigeBanner({ art: 'bedienhinweis', text: TIEFENLINK_ZIEL_HINWEIS, typ: 'fehler' });
  })().catch(console.error);
}

export function useTiefenLinks({
  gesetze = [],
  elementOeffnen,
  oeffnenLinkEmpfangen,
  gesetzesreferenzOeffnen,
}: TiefenLinkOptionen) {
  // Ref für stabilen Zugriff auf die aktuelle Gesetze-Liste und elementOeffnen
  // aus asynchronen Callbacks (Deep-Link-Handler, der nicht bei jeder
  // Änderung neu registriert werden soll).
  const referenzOeffnenRef = useRef(gesetzesreferenzOeffnen);
  referenzOeffnenRef.current = gesetzesreferenzOeffnen;
  const oeffnenLinkRef = useRef(oeffnenLinkEmpfangen);
  oeffnenLinkRef.current = oeffnenLinkEmpfangen;
  const gesetzeRef = useRef<GesetzDarstellung[]>(gesetze);
  const elementOeffnenRef = useRef(elementOeffnen);
  gesetzeRef.current = gesetze;
  elementOeffnenRef.current = elementOeffnen;

  function oeffneTiefenLinkZiel(
    ziel: OeffentlichesLinkZiel,
    gesetzeListe: GesetzDarstellung[],
    modus?: ElementOeffnenParams['modus'],
  ): void {
    if ('type' in ziel) return; // Desktop verarbeitet Öffnen-Links nur über seinen nativen Empfänger.
    const { bezeichnung, kurztitel, normgeber } = ziel;
    if (referenzOeffnenRef.current) {
      referenzOeffnenRef.current(
        {
          gesetzesreferenz: { kurztitel, normgeber },
          bezeichnung,
          tiefenlink: true,
        },
        modus,
      );
      return;
    }
    const gesetz = gesetzeListe.find((g) => istGleichesGesetz(g, ziel));

    if (!gesetz) {
      fehlendesZielAnzeigen();
      return;
    }

    if (bezeichnung) {
      const xmlId = verweisZuXmlId(gesetz, bezeichnung);
      if (!xmlId) {
        fehlendesZielAnzeigen();
        return;
      }
      // lexlata://-Link mit konkreter Norm → zählt laut Anforderung zum
      // Verlauf-Hinzufügen über die reguläre Öffnungssteuerung.
      elementOeffnenRef.current({ gesetz, xmlId, modus });
    } else {
      // Link ohne ausdrückliches Ziel: Die Öffnungssteuerung trägt das Startelement ein.
      elementOeffnenRef.current({ gesetz, modus });
    }
  }

  // Link bei laufender App: App läuft bereits, ein anderes Programm öffnet einen
  // lexlata://-Link. Die Ermittlung DES EINEN zuständigen Fensters sowie
  // das native In-den-Vordergrund-Holen (inkl. macOS-Fullscreen-Space-
  // Sonderfall) passiert bereits Rust-seitig (siehe lib.rs/fenster.rs,
  // tiefenlink_zielfenster_vordergrund) – hier wird nur noch das daraus
  // resultierende, an genau dieses Fenster gerichtete Event empfangen.
  // Würde stattdessen direkt das App-weite Plugin-Event "deep-link://new-url"
  // abonniert (wie zuvor via onOpenUrl), würden alle offenen Fenster
  // gleichzeitig reagieren und um den Vordergrund konkurrieren.
  useEffect(() => {
    const anmeldung = hoereImEigenenFenster('tiefenlink-oeffnen', (event) => {
      const roheUrl = event.payload[0] ?? '';
      const ziel = parseTiefenLink(roheUrl);
      if (ziel && 'type' in ziel) {
        void oeffnenLinkRef.current?.(ziel, false).catch(console.error);
      } else if (ziel) {
        oeffneTiefenLinkZiel(ziel, gesetzeRef.current);
      } else {
        // Ungültige öffentliche Links verständlich melden.
        ungueltigenLinkAnzeigen();
      }
    });
    void anmeldung.bereit.catch(() => {
      /* Browser-Vorschau ohne Tauri. */
    });
    return anmeldung.abmelden;
  }, []);

  /**
   * Liest die App-Start-URL (mit der die App ggf. gestartet wurde) und gibt
   * das geparste Ziel ausschließlich im initialen Fenster `main` zurück.
   * Weitere Fenster lesen den app-globalen Plugin-Wert nicht: getCurrent
   * behält auch einen bereits bei laufender App zugestellten Link. Außerhalb von
   * Tauri gibt es kein Ziel. Die Fensterstartinitialisierung liest es einmal und
   * öffnet das Ziel nach der Wiederherstellung des Fensterinhalts.
   */
  async function leseAppStartZiel(): Promise<OeffentlichesLinkZiel | null> {
    try {
      if (getCurrentWindow().label !== 'main') return null;
      const { getCurrent } = await import('@tauri-apps/plugin-deep-link');
      const urls = await getCurrent();
      const ziel = urls?.[0] ? parseTiefenLink(urls[0]) : null;
      if (urls?.[0] && !ziel) ungueltigenLinkAnzeigen();
      if (ziel && 'type' in ziel) {
        await oeffnenLinkRef.current?.(ziel, true);
        return oeffnenLinkRef.current ? ziel : null;
      }
      return ziel;
    } catch {
      return null;
    }
  }

  return { leseAppStartZiel, oeffneTiefenLinkZiel };
}
