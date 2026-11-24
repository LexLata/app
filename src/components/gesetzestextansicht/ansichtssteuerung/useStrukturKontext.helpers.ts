// Reine Berechnung und Vergleich der Einträge im Strukturkontextpfad.
import {
  STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT,
  STRUKTURKONTEXTLEISTE_GROESSE_WERTE,
} from '@/lib/stil/gesetzTextDarstellung';
import type { TextMessung } from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { ueberschriftVollTitel, normVollTitel } from '@/lib/domain/gesetzDarstellungAuswertung';
import type { NormDarstellung, UeberschriftDarstellung } from '@/lib/domain/gesetzTypes';

export interface KontextEintrag {
  // Genau eines der beiden ist gesetzt:
  ueberschrift?: UeberschriftDarstellung;
  gliederungsartikel?: NormDarstellung; // überschriftsartiger Artikel (z.B. Art. 229 EGBGB)
  // Vorberechnete Ebene (aus gliederungskennzahl) – direkt für Stack-Vergleiche nutzbar,
  // da Überschriften und Gliederungsartikel dasselbe Ebenen-System verwenden.
  ebene: number;
  index: number; // Index innerhalb von sichtbareElemente – für die Navigation per Klick
}

// Eindeutige ID eines Eintrags (Überschrift oder Gliederungsartikel).
export function kontextEintragId(eintrag: KontextEintrag): string {
  return eintrag.ueberschrift?.id ?? eintrag.gliederungsartikel!.id;
}

// Minimaler Ausschnitt aus dem VirtualItem-Typ von @tanstack/react-virtual,
// damit diese Datei nicht von dessen genauer Typdeklaration abhängt.
export interface VirtualItemAusschnitt {
  index: number;
  start: number;
  size: number;
}

// Sichtbarkeits-Filter (mit Vorausschau auf das eigene Wachstum der Leiste)
// Höhe einer einzelnen Zeile in der Leiste – muss zur Darstellung in
// StrukturKontextLeiste.tsx passen (fontSize schrift*skalierung, lineHeight 1.2,
// paddingBlock 2 = 4px oben+unten). Dient nur als Schätzung für die
// Vorhersage unten, ob ein Eintrag GLEICH zusätzlichen Platz braucht – anders
// als bei der scrollTop-Schätzung im Scrollmodul (useGesetzSprung.ts,
// springeZuIndex) ist ein paar Pixel Abweichung hier folgenlos: sie
// verschiebt höchstens den Auslöse-Zeitpunkt um ein, zwei Pixel, nie das
// Endergebnis. Mehrzeilige Einträge bleiben hier eine einzeilige Näherung;
// die tatsächliche Endhöhe meldet weiterhin der ResizeObserver.
function geschaetzteEintragHoehe(schrift: number, skalierung: number): number {
  return Math.round(schrift * skalierung * 1.2) + 4;
}

// Hängt firstVisibleEintrag (das aktuell oberste sichtbare Element, falls es
// selbst eine Überschrift ist) an vorherigePfad an – aber erst, sobald das
// Wachstum der Leiste UM GENAU DIESEN EINTRAG sie gleich selbst aus dem
// Viewport verdrängen würde (Vorausschau). vorherigePfad (alle Vorfahren VOR
// firstVisible) wird dagegen unverändert übernommen: per Konstruktion der
// firstVisible-Ermittlung (das jeweils erste/niedrigste Element, das die
// Sichtbarkeits-Bedingung noch erfüllt) sind diese Vorfahren IMMER schon
// vollständig aus dem Viewport gescrollt – sonst wären sie selbst firstVisible
// statt eines späteren Elements. Ihre Höhe steckt also längst in der real
// gemessenen Container-Höhe, eine erneute Sichtbarkeitsprüfung ist unnötig.
//
// Wichtig: firstVisibleEintrag verdrängt gleichrangige/übergeordnete bereits
// vorhandene Einträge (wie eine vollständige Neuberechnung des Pfads das
// auch täte) ERST, wenn er
// tatsächlich aufgenommen wird – nie vorher. Sonst entstünde beim Wechsel
// zwischen zwei gleichrangigen Überschriften (z. B. 1.1 -> 1.2) eine Lücke,
// in der WEDER die alte NOCH die neue Überschrift in der Leiste steht – ein
// kurzes, rein optisches Aufflackern.
//
// bereitsAlsAktivBestaetigt (behebt Flackern beim Aufwärts-Scrollen durch die
// EIGENE Zeile von firstVisibleEintrag): Eine im Hauptdokument gerenderte
// Überschriften-Zeile ist i. d. R. höher als die oben geschätzte
// zeilenHoehe. Beim Scrollen nach OBEN wird die Vorausschau-Bedingung
// deshalb schon am UNTEREN Rand der eigenen Zeile wahr (man "betritt" die
// Zeile von unten, die Differenz zwischen Zeilenende und contentOffset ist
// dort ≈ 0) – wächst dann aber, während man sich weiter nach oben durch
// dieselbe Zeile bewegt, wieder über zeilenHoehe hinaus. Ohne diesen
// Parameter würde die Prüfung dabei zwischenzeitlich wieder falsch und den
// gerade erst aufgenommenen Eintrag fälschlich fallen lassen, BEVOR
// firstVisible.index die Zeile tatsächlich verlässt – ein einmaliges
// Aufflackern des vorherigen (tieferen) Pfads, das sich genau im Bereich
// kurz vor dem eigentlichen Wechsel zeigt. Der Aufrufer
// (useStrukturKontext) setzt diesen Parameter, sobald
// firstVisibleEintrag für denselben firstVisible.index bereits einmal
// aufgenommen wurde, und übergeht die geometrische Prüfung dann einfach.
// Für das Abwärts-Scrollen ändert das nichts: dort kippt die Prüfung ohnehin
// nur EINMAL pro Index von falsch auf wahr, der Parameter bleibt also nur
// für das erste Erreichen eines neuen Index relevant.

export function berechneSichtbarenKontextPfad(
  vorherigePfad: KontextEintrag[],
  firstVisibleEintrag: KontextEintrag | null,
  virtualItems: readonly VirtualItemAusschnitt[],
  contentOffset: number,
  schrift: number,
  bereitsAlsAktivBestaetigt: boolean = false,
  skalierung = STRUKTURKONTEXTLEISTE_GROESSE_WERTE[STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT],
): KontextEintrag[] {
  const ergebnis = [...vorherigePfad];
  if (!firstVisibleEintrag) return ergebnis;

  const item = virtualItems.find((it) => it.index === firstVisibleEintrag.index);
  if (!item) return ergebnis;

  let inkludieren = bereitsAlsAktivBestaetigt;
  if (!inkludieren) {
    const zeilenHoehe = geschaetzteEintragHoehe(schrift, skalierung);
    const wuerdeDurchEigeneZeileVerdraengt = item.start + item.size <= contentOffset + zeilenHoehe;
    inkludieren = wuerdeDurchEigeneZeileVerdraengt;
  }
  if (inkludieren) {
    // ergebnis[length-1] beweisbar sicher durch die length>0-Prüfung.
    while (
      ergebnis.length > 0 &&
      ergebnis[ergebnis.length - 1]!.ebene >= firstVisibleEintrag.ebene
    ) {
      ergebnis.pop();
    }
    ergebnis.push(firstVisibleEintrag);
  }
  return ergebnis;
}

// Vergleicht zwei Pfade auf inhaltliche Gleichheit (gleiche Überschriften in
// gleicher Reihenfolge) – verhindert unnötige State-Updates bei jedem
// Scroll-Event, wenn sich der Pfad gar nicht geändert hat.

export function kontextPfadeGleich(a: KontextEintrag[], b: KontextEintrag[]): boolean {
  if (a.length !== b.length) return false;
  // b[i] beweisbar sicher: a.length === b.length wurde oben geprüft, i läuft
  // über a's Indizes.
  return a.every((eintrag, i) => kontextEintragId(eintrag) === kontextEintragId(b[i]!));
}

/** Nur Vorprüfung für knappe untere Ausrichtung; oben wird tatsächlich gemessen. */
export function schaetzeKontextHoehe(
  pfad: readonly KontextEintrag[],
  schrift: number,
  skalierung: number,
  breite: number,
  messung: TextMessung,
): number {
  if (pfad.length === 0) return 0;
  return (
    17 +
    pfad.reduce((hoehe, eintrag) => {
      const titel = eintrag.ueberschrift
        ? ueberschriftVollTitel(eintrag.ueberschrift)
        : eintrag.gliederungsartikel
          ? normVollTitel(eintrag.gliederungsartikel)
          : '';
      return (
        hoehe +
        Math.max(1, messung.zeilenFuerText(titel, breite, schrift * skalierung)) *
          schrift *
          skalierung *
          1.2 +
        4
      );
    }, 0)
  );
}
