/**
 * Öffentliche Schnittstelle der Banner: fensterlokaler Bannerspeicher sowie
 * die fachlichen Banner für Aktionsmeldungen, Einstellungs-Backup und
 * Schemaversion. Framework-frei; die Anzeige übernimmt BannerHost.
 */

/** Fensterlokaler Bannerspeicher. zeigeBanner legt ein Banner an und liefert
 *  dessen id; bannerAktualisieren ändert einzelne Felder (ohne Wirkung bei
 *  unbekannter id); bannerSchliessen und alleBannerSchliessen entfernen Banner.
 *  subscribe/getSnapshot binden den Speicher an useSyncExternalStore an.
 *  zeigeBanner wirft außerhalb eines Hauptfensters. */
export {
  alleBannerSchliessen,
  bannerAktualisieren,
  bannerDauerMs,
  bannerSchliessen,
  getSnapshot,
  subscribe,
  zeigeBanner,
} from './bannerStore';
/** Sich erweiternde Banner (Dateibefunde, nicht geladene Gesetze): einmal je
 *  Art anlegen; die gelieferte Funktion erweitert das offene Banner der Art
 *  oder beginnt ein neues. Ihr Rückruf erhält den Inhalt des offenen Banners
 *  (undefined: keines offen) und liefert den neuen Inhalt; die Ablage bewahrt
 *  ihn, bis der Nutzer das Banner schließt. */
export { erzeugeErweiterbaresBanner } from './bannerStore';
/** Banner, seine Aktions-Schaltfläche, seine Stufe (info/warnung/fehler) und
 *  seine Bannerart (bestimmt die Anzeigedauer, siehe bannerDauerMs). */
export type { Banner, BannerAktion, BannerInhalt, BannerTyp } from './bannerStore';
/** zeigeAktionsMeldungsBanner zeigt das Vorgangsergebnis: alle Meldungen
 *  (und optional die übernommenen Gesetze) gegliedert in einem Banner mit der
 *  schwersten Stufe (nichts, wenn beides leer ist). */
export {
  gliedereVorgangsergebnis,
  gliederungAlsText,
  zeigeAktionsMeldungsBanner,
} from './aktionsMeldungsBanner';
export type { Vorgangserfolg, Vorgangsmeldung } from './aktionsMeldungsBanner';
/** Sammelt Dateibefunde ohne Vorgangsempfänger in einem sich erweiternden,
 *  gegliederten Banner je Fenster; gleiche Befunde (Grund, Datei) einmal. */
export { meldeDateibefund } from './dateibefundBanner';
/** Zeigt den Hinweis auf die wiederhergestellten Einstellungen höchstens einmal je Start. */
export { zeigeEinstellungenBackupBannerEinmal } from './einstellungenBackupBanner';
/** Zeigt die Warnung zu abweichender Schemaversion höchstens einmal je Start. */
export { zeigeSchemaversionBannerEinmal } from './schemaversionBanner';
/** Späte Meldungen (nach Ende eines Vorgangs für den Nutzer): Nach Ende aller
 *  Folgeläufe und Nacharbeit gehen Dateibefunde in das Dateibefund-Banner, die
 *  übrigen zusammen in ein Vorgangsergebnis-Banner; ohne späte Meldungen keines.
 *  erzeugeBannerMeldungsSammlung sammelt Meldungen bis abschliessen() und
 *  liefert sie zurück; erzeugeSpaeteMeldungen ist die Sammelstelle für Vorgänge
 *  mit eigenem Bericht (melde, verfolge, schliesse beim Schließen). */
export { erzeugeBannerMeldungsSammlung, erzeugeSpaeteMeldungen } from './spaeteMeldungenBanner';
/** Zeigt Meldungen eines Vorgangs ohne eigenen Bericht: Dateibefunde im
 *  Dateibefund-Banner, die übrigen zusammen als ein Vorgangsergebnis. */
export { zeigeMeldungenNachZustaendigkeit } from './spaeteMeldungenBanner';
