// importindexErstellungSteuerung.ts
// Gemeinsame Steuerungs-Bausteine für die (potenziell lang laufenden)
// Importindex-Erstellungsvorgänge (Bundesrecht, Landesrecht BW – voller Neuaufbau
// UND Abgleichslauf):
//
// 1. ProzessBanner: ein über den ganzen Lauf hinweg wiederverwendetes
//    Fortschritts-Banner mit "Abbrechen"-Schaltfläche (siehe fortschritt())
//    – kooperativer Abbruch, der Klick setzt nur ein Flag, die aufrufende
//    Schleife prüft es zwischen den einzelnen Netzwerk-Aufrufen (siehe
//    pruefeAbbruch()) und bricht dort sauber ab, ohne etwas zu speichern.
//    Die Schaltfläche verschwindet automatisch bei der Abschluss-Meldung
//    (siehe abschliessen()) – dort ist nichts mehr abzubrechen.
//
// 2. Sperre gegen mehrfach gleichzeitig laufende Vorgänge DERSELBEN
//    Kategorie (siehe Bugreport: zwei Landesrecht-Läufe gleichzeitig über
//    die Menüleiste gestartet, dabei gegenseitig die AppData-Datei
//    überschrieben). Kategorien sind bewusst grob granular: `bund` und `bw`
//    sind je EINE Kategorie – die beiden
//    Landesrecht-BW-Einstiegspunkte (voller Neuaufbau, Abgleichslauf)
//    teilen sich dieselbe Kategorie, da beide dieselbe Datei lesen/
//    schreiben. Bundesrecht und Landesrecht BW dürfen dagegen parallel
//    laufen (unabhängige Dateien).
//    WICHTIG: Ist ein Vorgang laut Merkliste aktiv, aber sein Banner gerade
//    nicht sichtbar (Nutzer hat es weggeklickt – der Vorgang läuft im
//    Hintergrund trotzdem weiter!), wird die Sperre NICHT zurückgesetzt
//    (das würde einen zweiten, parallelen Lauf auf derselben Datei
//    erlauben). Stattdessen: kurze Hinweismeldung (5s), danach das
//    laufende Banner wieder einblenden.

import type {
  ImportindexErstellungErgebnis,
  ImportindexKategorie,
} from './importindexVertrag.types';
export type { ImportindexKategorie } from './importindexVertrag.types';

import {
  zeigeBanner,
  bannerAktualisieren,
  bannerSchliessen,
  getSnapshot,
  type BannerTyp,
  type BannerAktion,
} from '@/lib/banner/banner.index';

export class ProzessBanner {
  private id: string;
  private zustand: { text: string; typ: BannerTyp };
  private abgebrochen = false;
  private abbrechbar = true;

  private constructor(id: string, text: string, typ: BannerTyp) {
    this.id = id;
    this.zustand = { text, typ };
  }

  static erzeugen(text: string): ProzessBanner {
    const id = zeigeBanner({ art: 'vorgangsfortschritt', text });
    const banner = new ProzessBanner(id, text, 'info');
    bannerAktualisieren(id, { aktion: banner.abbrechenAktion() });
    return banner;
  }

  private abbrechenAktion(): BannerAktion {
    return {
      label: 'Abbrechen',
      onClick: () => {
        if (!this.abbrechbar) return;
        this.abgebrochen = true;
        this.fortschritt('Wird abgebrochen …');
      },
    };
  }

  /** Fortschrittsmeldung während des Laufs; bis Speicherbeginn bleibt Abbrechen
   *  sichtbar. Falls der Nutzer das Banner zwischenzeitlich weggeklickt hat
   *  (Vorgang läuft aber weiter), wird es unter neuer id neu erzeugt. */
  fortschritt(text: string, typ: BannerTyp = 'info') {
    this.zustand = { text, typ };
    this.anzeigen(this.abbrechbar);
  }

  /** Abschluss-Meldung (Erfolg oder endgültiger Fehler) OHNE Abbrechen-
   *  Schaltfläche – der Vorgang ist zu diesem Zeitpunkt bereits beendet, es
   *  gibt nichts mehr abzubrechen. */
  abschliessen(text: string, typ: BannerTyp = 'info') {
    this.abbrechbar = false;
    this.zustand = { text, typ };
    this.anzeigen(false);
  }

  /** Legt synchron den nicht mehr abbrechbaren Speicherbeginn fest. */
  beginneSpeichern(text: string) {
    this.abbrechbar = false;
    this.zustand = { text, typ: 'info' };
    this.anzeigen(false);
  }

  /** Zeigt das Banner erneut mit dem zuletzt gesetzten Text/Typ an, falls
   *  der Nutzer es weggeklickt hat, während der Vorgang noch lief (siehe
   *  versucheZuStarten). */
  wiederEinblenden() {
    this.anzeigen(this.abbrechbar);
  }

  private anzeigen(mitAktion: boolean) {
    if (!getSnapshot().some((b) => b.id === this.id)) {
      this.id = zeigeBanner({
        art: 'vorgangsfortschritt',
        text: this.zustand.text,
        typ: this.zustand.typ,
      });
    } else {
      bannerAktualisieren(this.id, { text: this.zustand.text, typ: this.zustand.typ });
    }
    bannerAktualisieren(this.id, { aktion: mitAktion ? this.abbrechenAktion() : null });
  }

  /** Prüft, ob die Abbrechen-Schaltfläche geklickt wurde; falls ja, wird das
   *  Banner entfernt und `true` zurückgegeben – der Aufrufer muss dann
   *  sofort zurückkehren, ohne etwas zu speichern. */
  pruefeAbbruch(): boolean {
    if (!this.abgebrochen) return false;
    bannerSchliessen(this.id);
    return true;
  }

  get bannerId(): string {
    return this.id;
  }
}

const laufendeProzesse = new Map<ImportindexKategorie, ProzessBanner>();

/**
 * Siehe Datei-Kommentar. Gibt `null` zurück, wenn der Aufrufer NICHT starten
 * soll:
 * - Bereits ein sichtbares Banner derselben Kategorie aktiv -> zweiter
 *   Befehl wird ignoriert (keine weitere Rückmeldung nötig).
 * - Merkliste sagt "läuft", Banner ist aber gerade nicht sichtbar (Nutzer
 *   hat es weggeklickt) -> kurze Hinweismeldung, das laufende Banner wird
 *   wieder eingeblendet; die Sperre bleibt bestehen (der Vorgang läuft ja
 *   tatsächlich weiter).
 * Gibt andernfalls ein neues, registriertes ProzessBanner zurück, mit dem
 * der Aufrufer den Lauf durchführt.
 */
export function versucheZuStarten(
  kategorie: ImportindexKategorie,
  anfangsText: string,
): ProzessBanner | null {
  const vorhanden = laufendeProzesse.get(kategorie);
  if (vorhanden) {
    if (getSnapshot().some((b) => b.id === vorhanden.bannerId)) return null;
    zeigeBanner({
      art: 'bedienhinweis',
      text: 'Dieser Vorgang läuft bereits im Hintergrund.',
      typ: 'info',
    });
    vorhanden.wiederEinblenden();
    return null;
  }

  const banner = ProzessBanner.erzeugen(anfangsText);
  laufendeProzesse.set(kategorie, banner);
  return banner;
}

/** Gibt zurück, ob für `kategorie` aktuell ein Vorgang läuft (unabhängig
 *  davon, ob dessen Banner gerade sichtbar ist) – für ImportindexOverlay.tsx, um
 *  die Buttons der jeweils betroffenen Kategorie zu sperren und die
 *  angezeigten Metadaten (Datum/Herkunft) während des Laufs periodisch
 *  aufzufrischen. Reiner Lesezugriff auf die bereits bestehende
 *  laufendeProzesse-Map, kein neuer Zustand. */
export function istKategorieAktiv(kategorie: ImportindexKategorie): boolean {
  return laufendeProzesse.has(kategorie);
}

export function istImportindexAktiv(kategorie: ImportindexKategorie): boolean {
  return istKategorieAktiv(kategorie);
}

/** Gibt die Kategorie-Sperre frei (im finally-Block des Aufrufers, damit das
 *  auf jedem Ausstiegspfad garantiert passiert). */
export function beenden(kategorie: ImportindexKategorie) {
  laufendeProzesse.delete(kategorie);
}

/** Registriert einen vollständigen Lauf; Fehlerabschluss und Freigabe sind garantiert. */
export async function mitImportindexVorgang(
  kategorie: ImportindexKategorie,
  anfangsText: string,
  arbeit: (banner: ProzessBanner) => Promise<ImportindexErstellungErgebnis>,
): Promise<ImportindexErstellungErgebnis> {
  const banner = versucheZuStarten(kategorie, anfangsText);
  if (!banner) return { erfolg: false, fehler: 'Importindex-Aktualisierung läuft bereits.' };
  try {
    const ergebnis = await arbeit(banner);
    if (!ergebnis.erfolg && !banner.pruefeAbbruch()) {
      banner.abschliessen(
        `Importindex-Aktualisierung fehlgeschlagen: ${ergebnis.fehler}`,
        'fehler',
      );
    }
    return ergebnis;
  } catch (e) {
    const fehler = e instanceof Error ? e.message : String(e);
    banner.abschliessen(`Importindex-Aktualisierung fehlgeschlagen: ${fehler}`, 'fehler');
    return { erfolg: false, fehler };
  } finally {
    beenden(kategorie);
  }
}
