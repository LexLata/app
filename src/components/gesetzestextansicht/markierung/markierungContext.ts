// markierungContext.ts
// Markierungs-Kontext: stellt die für das aktuell geöffnete Gesetz geladenen
// Unterstreichungen (gruppiert nach xmlId) bereit, damit NormBlock/
// UeberschriftZeile ihre jeweils passenden Einträge nachschlagen können, ohne
// dass die Liste durch ElementBlock/VirtualisierteListe durchgeschleift werden
// muss – analog zu EinklappCtx (Gesetzestextansicht.context.ts). Die konkrete
// Zerlegung nach Absatz/Satz/Eintrag erfolgt danach über normale Props (siehe
// textBlatt.tsx), passend zu deren bestehendem
// „nur Props"-Prinzip.

import type { VerweisKlickziel } from '@/lib/darstellung/darstellung.index';
import { createContext } from 'react';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';

export interface MarkierungState {
  /** xmlId → Liste der Unterstreichungen dieser Norm/Überschrift. */
  markierungenNachXmlId: Map<string, MarkierungsEintrag[]>;
  /**
   * Klick auf ein 'verweismarkierung'-Segment (manuelle Verweismarkierung-Markierung ODER
   * getaggter Verweis aus dem Quell-XML, siehe TextBlatt in
   * textBlatt.tsx). ausgangsXmlId = Norm, in der geklickt
   * wurde (für den Verlaufs-Eintrag der Ausgangsstelle, siehe App.tsx:
   * handleVerweisKlick). neuerTab = true bei ⌘-Klick.
   */
  onVerweisKlick?: (ausgangsXmlId: string, zielnorm: VerweisKlickziel, neuerTab: boolean) => void;
  /**
   * Rechtsklick auf einen ECHTEN, persistierten Markierungs-Eintrag JEDES
   * Typs (Unterstreichung, Hervorhebung, Verweismarkierung, Kommentar) – NICHT bei
   * aus dem Quell-XML getaggten Verweisen (siehe
   * Textauszeichnung, die sind nicht persistiert und daher
   * nicht bearbeit-/löschbar). Zeigt das native Kontextmenü (siehe
   * kontextMenu.tsx): bei typ 'verweismarkierung' mit "Verweismarkierung
   * bearbeiten" + "Markierung löschen" (useMarkierungen.ts:
   * handleVerweismarkierungBearbeiten / handleMarkierungLoeschen), bei allen
   * anderen Typen nur mit "Markierung löschen" (Bearbeiten läuft dort
   * weiterhin über eigene Wege, z.B. beim Kommentar über den Linksklick auf
   * das Infosymbol, siehe onKommentarKlick). ausgangsXmlId = Norm/
   * Überschrift, in der der Eintrag liegt. Kein Positions-Parameter nötig:
   * das native Menü poppt automatisch an der aktuellen Mauszeigerposition
   * auf (siehe kontextMenu.tsx: Menu.popup()).
   */
  onMarkierungRechtsklick?: (ausgangsXmlId: string, eintrag: MarkierungsEintrag) => void;
  /**
   * Klick auf das Infosymbol (ⓘ) eines Kommentars – öffnet SOFORT (kein
   * Kontextmenü, anders als beim Verweismarkierung) das Kommentar-Hilfsfenster im
   * Bearbeiten-Modus, siehe useMarkierungen.ts: handleKommentarBearbeiten.
   */
  onKommentarKlick?: (ausgangsXmlId: string, eintrag: MarkierungsEintrag) => void;
}

const LEERE_MAP = new Map<string, MarkierungsEintrag[]>();

export const MarkierungCtx = createContext<MarkierungState>({
  markierungenNachXmlId: LEERE_MAP,
});
