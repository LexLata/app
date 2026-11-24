// useZitatKopieren.ts
//
// Trigger-Hook für "Zitat kopieren" in der Auswahlleiste
// (siehe auswahlleiste.tsx) – kolokiert mit
// Gesetzestextansicht, da NUR von dort verwendet (anders als useMarkierungen.ts
// in src/hooks/, das zusätzlich von Tastenkürzeln/Menü in App.tsx gebraucht
// wird und deshalb dort, außerhalb des Gesetzestextansicht-Baums, liegt).
//
// Baut aus dem von useAuswahlleiste.ts ermittelten kopierZiel
// (xmlId + ggf. per GGT reduzierter Textpfad, siehe dortiger Kommentar) den
// Zitat-String (siehe zitatFormatierung.ts) und schreibt ihn in die
// Zwischenablage. Löst KEIN Fensterschließen/Sync-Event aus (anders als
// Markieren) – reiner Lese-/Zwischenablage-Vorgang ohne Persistenz.

import { useZitatAbkuerzungen } from '@/hooks/einstellungen/useZitatAbkuerzungen';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { mitArtikelPraefix } from '@/lib/domain/norm/norm.index';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import type { ZitatEinstellungenWerte } from '@/lib/markierungen/markierungen.index';
import { formatiereZitat } from '@/lib/markierungen/markierungen.index';

// Norm-/Überschrift-Bezeichnung für die Zitat-Bildung: bei §-Normen in
// Gliederungsartikel-Gesetzen (z.B. EGBGB) MIT vorangestelltem
// übergeordneten Artikel ("Art. 229 § 3" statt nur "§ 3") – Artikel-Präfix-
// Bildung selbst über mitArtikelPraefix (normAufloesung.ts), da dieselbe
// Regel wie vollstaendigeBezeichnung dort. Bewusst NICHT vollstaendigeBezeichnung
// selbst verwendet: die nutzt für Überschriften deren `titel` (gedacht für
// Listen wie VerlaufOverlay), ein Zitat braucht dagegen immer die eigentliche
// Bezeichnung ("Erster Teil"), nicht den Titel-Text – daher hier `bezeichnung`
// direkt statt elementSuchBezeichnung.
function normBezeichnungFuerZitat(gesetz: GesetzDarstellung, xmlId: string): string | null {
  const element = gesetz.elemente.find((el) => el.data.xmlId === xmlId);
  if (!element) return null;
  return mitArtikelPraefix(gesetz, xmlId, element.data.bezeichnung);
}

export function useZitatKopieren(gesetz: GesetzDarstellung) {
  const { abkuerzungenAktiv, ohnePunkt, roemischeAbsaetze } = useZitatAbkuerzungen();

  /** Gibt true bei Erfolg zurück (Zitat wurde in die Zwischenablage
   *  geschrieben) – der Aufrufer (Auswahlleiste.tsx) zeigt dann
   *  kurz "Zitat kopiert" an. `kopierZiel: null` (mehrere Normen betroffen,
   *  siehe useAuswahlleiste.ts) zeigt selbst ein Warn-Banner
   *  (analog zur bestehenden Markierungs-Fehlermeldung) und liefert false. */
  async function kopieren(kopierZiel: { xmlId: string; pfad: Textpfad } | null): Promise<boolean> {
    if (!kopierZiel) {
      const { zeigeBanner } = await import('@/lib/banner/banner.index');
      zeigeBanner({
        art: 'bedienhinweis',
        text: 'Ein Zitat kann nicht über mehrere Normen hinweg gebildet werden.',
        typ: 'warnung',
      });
      return false;
    }

    const normBezeichnung = normBezeichnungFuerZitat(gesetz, kopierZiel.xmlId);
    if (!normBezeichnung) return false;

    const einstellungen: ZitatEinstellungenWerte = {
      abkuerzungenAktiv,
      ohnePunkt,
      roemischeAbsaetze,
    };
    const zitat = formatiereZitat(
      normBezeichnung,
      gesetz.kurztitel,
      kopierZiel.pfad,
      einstellungen,
    );

    try {
      await navigator.clipboard.writeText(zitat);
      return true;
    } catch {
      return false;
    }
  }

  return { kopieren };
}
